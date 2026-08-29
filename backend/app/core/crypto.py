"""Reversible encryption for connection secrets.

Unlike user passwords (core/security.py, one-way bcrypt), a connection's
password has to be recoverable so the app can actually open the connection
later. AES-256-GCM with a server-held key, AAD-bound to the row it belongs
to so a copied ciphertext can't be decrypted under a different connection.
"""

import base64
import os
from functools import lru_cache

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import get_settings

_KEY_HELP = (
    'Generate one with: python -c "import os,base64;'
    'print(base64.b64encode(os.urandom(32)).decode())" '
    "and set CONNECTION_ENCRYPTION_KEY in backend/.env"
)


class EncryptionKeyError(RuntimeError):
    pass


@lru_cache
def _key() -> bytes:
    raw = get_settings().connection_encryption_key
    if not raw:
        raise EncryptionKeyError(f"CONNECTION_ENCRYPTION_KEY is not set. {_KEY_HELP}")
    try:
        key = base64.b64decode(raw, validate=True)
    except Exception as exc:
        raise EncryptionKeyError(
            f"CONNECTION_ENCRYPTION_KEY is not valid base64. {_KEY_HELP}"
        ) from exc
    if len(key) != 32:
        raise EncryptionKeyError(
            f"CONNECTION_ENCRYPTION_KEY must decode to exactly 32 bytes (got {len(key)}). {_KEY_HELP}"
        )
    return key


def ensure_encryption_key_configured() -> None:
    """Fail fast at startup rather than silently storing garbage later."""
    _key()


def encrypt_secret(plaintext: str, *, aad: bytes) -> bytes:
    nonce = os.urandom(12)
    ciphertext = AESGCM(_key()).encrypt(nonce, plaintext.encode("utf-8"), aad)
    return nonce + ciphertext


def decrypt_secret(blob: bytes, *, aad: bytes) -> str:
    nonce, ciphertext = blob[:12], blob[12:]
    plaintext = AESGCM(_key()).decrypt(nonce, ciphertext, aad)
    return plaintext.decode("utf-8")
