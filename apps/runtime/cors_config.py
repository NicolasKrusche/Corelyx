from __future__ import annotations

import os
from collections.abc import Mapping
from urllib.parse import urlparse

PRODUCTION_ENV_NAMES = ("NODE_ENV", "VERCEL_ENV", "APP_ENV", "RUNTIME_ENV")
CORS_ORIGINS_ENV = "CORS_ORIGINS"
RUNTIME_CORS_ALLOWED_ORIGINS_ENV = "RUNTIME_CORS_ALLOWED_ORIGINS"
DEFAULT_CORS_ORIGINS = (
    "https://corelyx.app",
    "https://www.corelyx.app",
)
DEV_CORS_ORIGINS = ("http://localhost:3000", "http://127.0.0.1:3000")
CORS_ALLOWED_METHODS = ["GET", "POST"]
CORS_ALLOWED_HEADERS = ["Content-Type", "x-internal-service-token"]


def is_production_environment(
    env: Mapping[str, str | None] | None = None,
) -> bool:
    values = os.environ if env is None else env
    return any(values.get(name) == "production" for name in PRODUCTION_ENV_NAMES)


def _env_value(env: Mapping[str, str | None], name: str) -> str:
    value = env.get(name)
    return value.strip() if isinstance(value, str) else ""


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _split_csv(value: str) -> list[str]:
    return [part.strip() for part in value.split(",") if part.strip()]


def normalize_cors_origin(value: str) -> str:
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("origin must be an absolute http(s) URL")
    return f"{parsed.scheme}://{parsed.netloc}"


def get_cors_allowed_origins(
    env: Mapping[str, str | None] | None = None,
) -> list[str]:
    values = os.environ if env is None else env
    is_production = is_production_environment(values)
    configured_origins = _split_csv(
        _env_value(values, CORS_ORIGINS_ENV)
        or _env_value(values, RUNTIME_CORS_ALLOWED_ORIGINS_ENV)
    )

    origins = list(DEFAULT_CORS_ORIGINS)
    if not is_production:
        origins.extend(DEV_CORS_ORIGINS)
    if configured_origins:
        for origin in configured_origins:
            if origin == "*":
                if is_production:
                    raise RuntimeError(
                        f"{CORS_ORIGINS_ENV} must not include '*' in production"
                    )
                origins.append(origin)
                continue
            try:
                origins.append(normalize_cors_origin(origin))
            except ValueError as exc:
                raise RuntimeError(
                    f"{CORS_ORIGINS_ENV} contains invalid origin {origin!r}: {exc}"
                ) from exc
        return _unique(origins)

    for name in ("NEXT_PUBLIC_APP_URL", "NEXTJS_INTERNAL_URL"):
        value = _env_value(values, name)
        if not value:
            continue
        try:
            origins.append(normalize_cors_origin(value))
        except ValueError as exc:
            if is_production:
                raise RuntimeError(
                    f"{name} must be an absolute http(s) URL when used for runtime CORS"
                ) from exc

    if is_production and not origins:
        raise RuntimeError(
            f"Set {CORS_ORIGINS_ENV} or NEXT_PUBLIC_APP_URL before running the runtime in production"
        )

    return _unique(origins)
