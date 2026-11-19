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

from sqlalchemy import case, delete, select, update
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


def _engage_lock(db, email: str, now: int) -> int:
    """Create the lock unless one is active (never extends it) and align the failure counter with it."""
    expired = LoginAttempt.expires_at <= now
    statement = _insert(db)(LoginAttempt).values(key=_key('lock', email), attempts=1, expires_at=now + LOCK_SECONDS)
    expires = db.execute(statement.on_conflict_do_update(index_elements=['key'], set_={
        'attempts': 1,
        'expires_at': case((expired, now + LOCK_SECONDS), else_=LoginAttempt.expires_at),
    }).returning(LoginAttempt.expires_at)).scalar_one()
    db.execute(update(LoginAttempt).where(LoginAttempt.key == _key('fail', email)).values(expires_at=expires))
    return expires


def reserve_login_attempt(db, email: str) -> int:
    """Atomically count this attempt as a failure before the password is verified.

    Returns the reserved attempt number. Raises LoginRejected when the account is locked
    or when this attempt exceeds the failure limit.
    """
    now = int(time.time())
    locked_for = lock_retry_after(db, email)
    if locked_for:
        db.rollback()
        raise LoginRejected('login_locked', LOCK_MESSAGE, locked_for)
    attempt = _bump(db, _key('fail', email), now + LOCK_WINDOW_SECONDS, now)
    if attempt > LOCK_FAILURES:
        expires = _engage_lock(db, email, now)
        db.commit()
        raise LoginRejected('login_locked', LOCK_MESSAGE, max(1, expires - now))
    db.commit()
    return attempt


def record_failed_login(db, email: str, attempt: int):
    """Keep the reservation; the failure that reaches the limit locks the account."""
    if attempt >= LOCK_FAILURES:
        _engage_lock(db, email, int(time.time()))
    db.commit()


def release_login_attempt(db, email: str):
    """Successful password: drop the failure counter but never an existing lock."""
    db.execute(delete(LoginAttempt).where(LoginAttempt.key == _key('fail', email),
                                          LoginAttempt.attempts <= LOCK_FAILURES))
    db.commit()
