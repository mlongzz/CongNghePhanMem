"""Login throttling shared across workers on SQLite/PostgreSQL.

Two independent mechanisms use the auth_login_attempts table:
- a fixed-window per-IP counter that counts every login request;
- a per-account failure counter that locks the account for a fixed time.
Only HMAC digests of identities are stored.
"""
import hashlib
import hmac
import os
import time
from dataclasses import dataclass

from sqlalchemy import case, delete, select
from app.config import SECRET_KEY
from app.models.auth_session import LoginAttempt

WINDOW_SECONDS = 300
IP_LIMIT = max(1, int(os.getenv('AUTH_IP_LOGIN_LIMIT', '120')))
LOCK_FAILURES = max(1, int(os.getenv('AUTH_LOCK_FAILURES', '5')))
LOCK_WINDOW_SECONDS = max(1, int(os.getenv('AUTH_LOCK_WINDOW_SECONDS', '900')))
LOCK_SECONDS = max(1, int(os.getenv('AUTH_LOCK_SECONDS', '300')))

IP_MESSAGE = 'Too many login attempts. Try again later.'
LOCK_MESSAGE = 'Account temporarily locked after too many failed attempts.'


@dataclass
class LoginRejected(Exception):
    code: str
    detail: str
    retry_after: int


def _key(kind: str, identity: str) -> str:
    return hmac.new(SECRET_KEY.encode(), f'{kind}:{identity}'.encode(), hashlib.sha256).hexdigest()


def _insert(db):
    if db.get_bind().dialect.name == 'postgresql':
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    return insert


def _bump(db, key: str, expires: int, now: int) -> int:
    statement = _insert(db)(LoginAttempt).values(key=key, attempts=1, expires_at=expires)
    expired = LoginAttempt.expires_at <= now
    statement = statement.on_conflict_do_update(index_elements=['key'], set_={
        'attempts': case((expired, 1), else_=LoginAttempt.attempts + 1),
        'expires_at': case((expired, expires), else_=LoginAttempt.expires_at),
    }).returning(LoginAttempt.attempts)
    return db.execute(statement).scalar_one()


def consume_ip_attempt(db, host: str):
    now = int(time.time())
    expires = (now // WINDOW_SECONDS + 1) * WINDOW_SECONDS
    db.execute(delete(LoginAttempt).where(LoginAttempt.expires_at <= now))
    attempts = _bump(db, _key('ip', host), expires, now)
    db.commit()  # Count rejected attempts as well; never undo the throttle on a 401.
    if attempts > IP_LIMIT:
        raise LoginRejected('login_rate_limited', IP_MESSAGE, max(1, expires - now))


def lock_retry_after(db, email: str) -> int:
    """Seconds left on the account lock, or 0 when the account is not locked."""
    now = int(time.time())
    expires = db.scalar(select(LoginAttempt.expires_at).where(LoginAttempt.key == _key('lock', email)))
    return max(0, expires - now) if expires and expires > now else 0


def record_failed_login(db, email: str):
    now = int(time.time())
    failures = _bump(db, _key('fail', email), now + LOCK_WINDOW_SECONDS, now)
    if failures >= LOCK_FAILURES:
        lock_key = _key('lock', email)
        statement = _insert(db)(LoginAttempt).values(key=lock_key, attempts=1, expires_at=now + LOCK_SECONDS)
        db.execute(statement.on_conflict_do_update(index_elements=['key'], set_={
            'attempts': 1, 'expires_at': now + LOCK_SECONDS}))
        db.execute(delete(LoginAttempt).where(LoginAttempt.key == _key('fail', email)))
    db.commit()


def clear_failed_logins(db, email: str):
    db.execute(delete(LoginAttempt).where(LoginAttempt.key.in_([_key('fail', email), _key('lock', email)])))
    db.commit()
