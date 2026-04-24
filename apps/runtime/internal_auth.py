from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

INTERNAL_SERVICE_TOKEN_HEADER = "x-internal-service-token"

_CLOCK_SKEW_SECONDS = 30
_DEFAULT_TOKEN_LIFETIME_SECONDS = 60
_MAX_TOKEN_LIFETIME_SECONDS = 300


def _get_internal_service_secret() -> bytes:
    secret = os.environ.get("INTERNAL_SERVICE_AUTH_SECRET") or os.environ.get("RUNTIME_SECRET")
    if not secret:
        raise RuntimeError(
            "Missing INTERNAL_SERVICE_AUTH_SECRET (or RUNTIME_SECRET fallback) for internal auth"
        )
    return secret.encode("utf-8")


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(f"{data}{padding}")


def _sign_payload_segment(payload_segment: str, secret: bytes) -> str:
    digest = hmac.new(secret, payload_segment.encode("utf-8"), hashlib.sha256).digest()
    return _b64url_encode(digest)


def create_internal_service_token(
    audience: str,
    *,
    ttl_seconds: int = _DEFAULT_TOKEN_LIFETIME_SECONDS,
    now_seconds: int | None = None,
) -> str:
    if ttl_seconds <= 0 or ttl_seconds > _MAX_TOKEN_LIFETIME_SECONDS:
        raise ValueError(
            f"Internal service token ttl_seconds must be between 1 and {_MAX_TOKEN_LIFETIME_SECONDS}"
        )

    issued_at = now_seconds if now_seconds is not None else int(time.time())
    payload = {
        "aud": audience,
        "iat": issued_at,
        "exp": issued_at + ttl_seconds,
    }
    payload_segment = _b64url_encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    )
    signature = _sign_payload_segment(payload_segment, _get_internal_service_secret())
    return f"{payload_segment}.{signature}"


def build_internal_service_headers(
    audience: str,
    *,
    ttl_seconds: int = _DEFAULT_TOKEN_LIFETIME_SECONDS,
) -> dict[str, str]:
    return {
        INTERNAL_SERVICE_TOKEN_HEADER: create_internal_service_token(
            audience, ttl_seconds=ttl_seconds
        )
    }


def verify_internal_service_token(
    token: str,
    expected_audience: str,
    *,
    now_seconds: int | None = None,
) -> bool:
    try:
        payload_segment, received_signature = token.split(".", 1)
    except ValueError:
        return False

    if not payload_segment or not received_signature:
        return False

    expected_signature = _sign_payload_segment(
        payload_segment, _get_internal_service_secret()
    )
    if not hmac.compare_digest(received_signature, expected_signature):
        return False

    try:
        claims = json.loads(_b64url_decode(payload_segment).decode("utf-8"))
    except Exception:
        return False

    if not isinstance(claims, dict):
        return False

    audience = claims.get("aud")
    issued_at = claims.get("iat")
    expires_at = claims.get("exp")

    if audience != expected_audience:
        return False
    if not isinstance(issued_at, int) or not isinstance(expires_at, int):
        return False
    if expires_at <= issued_at:
        return False
    if expires_at - issued_at > _MAX_TOKEN_LIFETIME_SECONDS:
        return False

    current_time = now_seconds if now_seconds is not None else int(time.time())
    if issued_at - _CLOCK_SKEW_SECONDS > current_time:
        return False
    if expires_at + _CLOCK_SKEW_SECONDS < current_time:
        return False

    return True
