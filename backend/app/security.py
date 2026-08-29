"""Password hashing and session-token hashing.

Session tokens are opaque random values; only their sha256 hash is ever
stored (see schema.sql's comment on `sessions.refresh_token_hash` and
`user_tokens.token_hash`) so a leaked database row cannot be replayed.
"""

import hashlib
import secrets

import bcrypt


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def hash_token(raw_token: str) -> bytes:
    return hashlib.sha256(raw_token.encode("utf-8")).digest()


def new_session_token() -> tuple[str, bytes]:
    """Returns (raw token to send the client, sha256 hash to store)."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_token(raw)
