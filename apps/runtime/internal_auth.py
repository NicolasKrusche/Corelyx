from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import time
from typing import Any

INTERNAL_SERVICE_TOKEN_HEADER = "x-internal-service-token"

_CLOCK_SKEW_SECONDS = 30
_DEFAULT_TOKEN_LIFETIME_SECONDS = 30
_MAX_TOKEN_LIFETIME_SECONDS = 300


def _scoped_secret_env_name(audience: str) -> str:
    normalized = re.sub(r"[^A-Z0-9]+", "_", audience.upper()).strip("_")
    return f"INTERNAL_SERVICE_AUTH_SECRET_{normalized}"


def _allows_shared_secret_fallback() -> bool:
    # FAIL-CLOSED: only allow the shared-secret fallback in an explicit
    # development or test environment. A production marker — or an
    # unrecognized/unset environment — disables it, so a misconfigured runtime
    # deploy refuses to sign with the shared secret instead of silently
    # downgrading. Production should set the scoped INTERNAL_SERVICE_AUTH_SECRET_*
    # secrets (see .env.example).
    markers = [os.environ.get(name) for name in ("NODE_ENV", "VERCEL_ENV", "APP_ENV", "RUNTIME_ENV")]
    if any(marker == "production" for marker in markers):
        return False
    # RUNTIME_ENV=local is this codebase's local-dev marker; NODE_ENV uses
    # development/test. Anything else (preview, staging, unset) → no fallback.
    return any(marker in ("development", "dev", "local", "test") for marker in markers)


def _get_internal_service_secret(audience: str) -> bytes:
    scoped_secret = os.environ.get(_scoped_secret_env_name(audience))
    if scoped_secret:
        return scoped_secret.encode("utf-8")

    shared_secret = os.environ.get("INTERNAL_SERVICE_AUTH_SECRET") or os.environ.get("RUNTIME_SECRET")
    if shared_secret and _allows_shared_secret_fallback():
        return shared_secret.encode("utf-8")

    raise RuntimeError(
        f"Missing scoped internal auth secret {_scoped_secret_env_name(audience)}"
    )


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(f"{data}{padding}")


def _sign_payload_segment(payload_segment: str, secret: bytes) -> str:
    digest = hmac.new(secret, payload_segment.encode("utf-8"), hashlib.sha256).digest()
    return _b64url_encode(digest)


def _body_hash(body: bytes | str) -> str:
    data = body.encode("utf-8") if isinstance(body, str) else body
    return _b64url_encode(hashlib.sha256(data).digest())


def create_internal_service_token(
    audience: str,
    *,
    ttl_seconds: int = _DEFAULT_TOKEN_LIFETIME_SECONDS,
    now_seconds: int | None = None,
    subject: str | None = None,
    method: str | None = None,
    path: str | None = None,
    body: bytes | str | None = None,
) -> str:
    if ttl_seconds <= 0 or ttl_seconds > _MAX_TOKEN_LIFETIME_SECONDS:
        raise ValueError(
            f"Internal service token ttl_seconds must be between 1 and {_MAX_TOKEN_LIFETIME_SECONDS}"
        )

    issued_at = now_seconds if now_seconds is not None else int(time.time())
    payload: dict[str, Any] = {
        "aud": audience,
        "iat": issued_at,
        "exp": issued_at + ttl_seconds,
    }
    if subject is not None:
        if not isinstance(subject, str) or not subject:
            raise ValueError("subject must be a non-empty string")
        payload["sub"] = subject
    if method is not None:
        payload["htm"] = method.upper()
    if path is not None:
        payload["path"] = path
    if body is not None:
        payload["bh"] = _body_hash(body)
    payload_segment = _b64url_encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    )
    signature = _sign_payload_segment(
        payload_segment, _get_internal_service_secret(audience)
    )
    return f"{payload_segment}.{signature}"


def build_internal_service_headers(
    audience: str,
    *,
    ttl_seconds: int = _DEFAULT_TOKEN_LIFETIME_SECONDS,
    subject: str | None = None,
    method: str | None = None,
    path: str | None = None,
    body: bytes | str | None = None,
) -> dict[str, str]:
    return {
        INTERNAL_SERVICE_TOKEN_HEADER: create_internal_service_token(
            audience,
            ttl_seconds=ttl_seconds,
            subject=subject,
            method=method,
            path=path,
            body=body,
        )
    }


def verify_internal_service_token(
    token: str,
    expected_audience: str,
    *,
    now_seconds: int | None = None,
    method: str | None = None,
    path: str | None = None,
    body: bytes | str | None = None,
) -> bool:
    return verify_internal_service_token_claims(
        token,
        expected_audience,
        now_seconds=now_seconds,
        method=method,
        path=path,
        body=body,
    ) is not None


def verify_internal_service_token_claims(
    token: str,
    expected_audience: str,
    *,
    now_seconds: int | None = None,
    method: str | None = None,
    path: str | None = None,
    body: bytes | str | None = None,
) -> dict[str, Any] | None:
    try:
        payload_segment, received_signature = token.split(".", 1)
    except ValueError:
        return None

    if not payload_segment or not received_signature:
        return None

    expected_signature = _sign_payload_segment(
        payload_segment, _get_internal_service_secret(expected_audience)
    )
    if not hmac.compare_digest(received_signature, expected_signature):
        return None

    try:
        claims = json.loads(_b64url_decode(payload_segment).decode("utf-8"))
    except Exception:
        return None

    if not isinstance(claims, dict):
        return None

    audience = claims.get("aud")
    issued_at = claims.get("iat")
    expires_at = claims.get("exp")
    subject = claims.get("sub")
    token_method = claims.get("htm")
    token_path = claims.get("path")
    token_body_hash = claims.get("bh")

    if audience != expected_audience:
        return None
    if not isinstance(issued_at, int) or not isinstance(expires_at, int):
        return None
    if subject is not None and not isinstance(subject, str):
        return None
    if token_method is not None and not isinstance(token_method, str):
        return None
    if token_path is not None and not isinstance(token_path, str):
        return None
    if token_body_hash is not None and not isinstance(token_body_hash, str):
        return None
    if expires_at <= issued_at:
        return None
    if expires_at - issued_at > _MAX_TOKEN_LIFETIME_SECONDS:
        return None

    current_time = now_seconds if now_seconds is not None else int(time.time())
    if issued_at - _CLOCK_SKEW_SECONDS > current_time:
        return None
    if expires_at + _CLOCK_SKEW_SECONDS < current_time:
        return None
    if method is not None and token_method != method.upper():
        return None
    if path is not None and token_path != path:
        return None
    if body is not None and token_body_hash != _body_hash(body):
        return None

    return claims
