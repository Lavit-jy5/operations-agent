import base64
import hashlib
import hmac
import json
import time
from typing import Any

from app.core.config import settings


def auth_enabled() -> bool:
    return bool(settings.app_access_password)


def password_matches(password: str) -> bool:
    if not auth_enabled():
        return True
    return hmac.compare_digest(password, settings.app_access_password)


def create_auth_token() -> str:
    secret = _auth_secret()
    expires_at = int(time.time()) + settings.app_auth_token_ttl_seconds
    payload = {"exp": expires_at}
    payload_part = _b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _sign(payload_part, secret)
    return f"{payload_part}.{signature}"


def verify_auth_token(token: str) -> bool:
    if not auth_enabled():
        return True
    if not token or "." not in token:
        return False
    payload_part, signature = token.rsplit(".", 1)
    if not hmac.compare_digest(_sign(payload_part, _auth_secret()), signature):
        return False
    try:
        payload = json.loads(_b64decode(payload_part))
    except (ValueError, json.JSONDecodeError):
        return False
    return int(payload.get("exp", 0)) >= int(time.time())


def _auth_secret() -> str:
    return settings.app_auth_secret or settings.app_access_password


def _sign(payload_part: str, secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), payload_part.encode("utf-8"), hashlib.sha256).digest()
    return _b64encode(digest)


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64decode(value: str) -> Any:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)
