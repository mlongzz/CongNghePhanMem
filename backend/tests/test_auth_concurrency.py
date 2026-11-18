"""Real concurrent PostgreSQL transactions; never use application tables."""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.database import Base

pytestmark = pytest.mark.skipif(os.getenv('TEST_POSTGRES') != '1', reason='Requires isolated PostgreSQL')


@pytest.fixture
def sessions():
    from app.database import engine
    if not (engine.url.database or '').startswith('mg_test_'):
        pytest.skip('Use python -m scripts.verify_postgres for concurrent database tests')
    schema = 'test_concurrent_' + uuid.uuid4().hex
    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    isolated = create_engine(engine.url, connect_args={'options': '-csearch_path=' + schema})
    Base.metadata.create_all(isolated)
    try:
        yield sessionmaker(bind=isolated)
    finally:
        isolated.dispose()
        with engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))


def test_equivalent_email_requests_race_one_winner_and_rollback(sessions, monkeypatch):
    from app.routers import users
    from app.schemas.user import UserCreate
    barrier = Barrier(2)
    original = users.get_user_by_email
    def synchronized_lookup(db, email):
        result = original(db, email)
        barrier.wait(timeout=15)
        return result
    monkeypatch.setattr(users, 'get_user_by_email', synchronized_lookup)
    def submit(email):
        with sessions() as db:
            try:
                users.register_user(UserCreate(email=email, password='TestPassword123!', full_name='Race'), db)
                status = 201
            except HTTPException as error:
                status = error.status_code
            # The loser must have rolled back and left the session usable.
            assert db.execute(text('SELECT 1')).scalar() == 1
            return status
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(submit, ['Race@Example.com', 'race@example.COM']))
    assert sorted(results) == [201, 409]


def test_refresh_rotation_has_only_one_concurrent_winner(sessions):
    from app.models.user import User
    from app.models.auth_session import RefreshSession
    from app.routers.auth import _refresh_pair, refresh_tokens
    from app.schemas.user import RefreshRequest
    import time
    sid = str(uuid.uuid4())
    with sessions() as db:
        user = User(email='refresh@example.com', password_hash='unused', full_name='Refresh')
        db.add(user); db.flush()
        token, digest = _refresh_pair(user.id, sid)
        db.add(RefreshSession(id=sid, user_id=user.id, token_hash=digest, expires_at=int(time.time()) + 600))
        db.commit()
    barrier = Barrier(2)
    def refresh(_):
        with sessions() as db:
            barrier.wait(timeout=15)
            try:
                return 200, refresh_tokens(RefreshRequest(refresh_token=token), db)
            except HTTPException as error:
                return error.status_code, None
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(refresh, range(2)))
    assert sorted(status for status, _ in results) == [200, 401]


def test_parallel_wrong_passwords_cannot_bypass_the_account_lock(sessions):
    from types import SimpleNamespace
    from app.models.user import User
    from app.routers.auth import login
    from app.schemas.user import LoginRequest
    from app.services import login_throttle
    from app.services.user_service import _password_hash
    email = 'parallel-lock@example.com'
    good = 'GoodPass123'
    with sessions() as db:
        db.add(User(email=email, password_hash=_password_hash.hash(good), full_name='Lock'))
        db.commit()
    barrier = Barrier(30)

    def attempt(index):
        request = SimpleNamespace(client=SimpleNamespace(host=f'10.0.0.{index}'))
        with sessions() as db:
            barrier.wait(timeout=30)
            try:
                response = login(LoginRequest(email=email, password='WrongPass123'), request, db)
                return response.status_code
            except HTTPException as error:
                return error.status_code

    with ThreadPoolExecutor(max_workers=30) as executor:
        results = list(executor.map(attempt, range(30)))
    assert results.count(401) <= login_throttle.LOCK_FAILURES
    assert results.count(401) + results.count(429) == 30
    with sessions() as db:
        assert login_throttle.lock_retry_after(db, email) > 0
        request = SimpleNamespace(client=SimpleNamespace(host='10.0.1.1'))
        response = login(LoginRequest(email=email, password=good), request, db)
        assert response.status_code == 429
        assert login_throttle.lock_retry_after(db, email) > 0


def test_parallel_correct_login_during_failures_keeps_the_lock(sessions):
    from types import SimpleNamespace
    from app.models.user import User
    from app.routers.auth import login
    from app.schemas.user import LoginRequest
    from app.services import login_throttle
    from app.services.user_service import _password_hash
    email = 'parallel-mixed@example.com'
    good = 'GoodPass123'
    with sessions() as db:
        db.add(User(email=email, password_hash=_password_hash.hash(good), full_name='Mixed'))
        db.commit()
    barrier = Barrier(31)

    def attempt(index):
        request = SimpleNamespace(client=SimpleNamespace(host=f'10.0.2.{index}'))
        password = good if index == 30 else 'WrongPass123'
        with sessions() as db:
            barrier.wait(timeout=30)
            try:
                return login(LoginRequest(email=email, password=password), request, db).status_code
            except HTTPException as error:
                return error.status_code

    with ThreadPoolExecutor(max_workers=31) as executor:
        results = list(executor.map(attempt, range(31)))
    assert results.count(401) <= login_throttle.LOCK_FAILURES
    with sessions() as db:
        assert login_throttle.lock_retry_after(db, email) > 0
