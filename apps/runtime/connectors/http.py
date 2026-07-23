"""Generic HTTP connector — makes arbitrary HTTP requests (REST/GraphQL).

Supports all common auth methods (Bearer, API Key, OAuth2) and HTTP
methods (GET, POST, PUT, PATCH, DELETE). Retries transient failures
with exponential backoff.

This connector has no fixed ``base_url``; the URL is fully dynamic per
request, making it suitable for calling any REST or GraphQL endpoint.
"""

from __future__ import annotations

import json as _json
from typing import Any

import httpx

from .base import ConnectorError
from .rate_limit import request_with_rate_limit
from .sdk.base import BaseConnector
from .sdk.types import FieldKind, FieldSchema, OperationSchema


def _apply_auth(
    headers: dict[str, str],
    params: dict[str, Any],
    auth_type: str,
    auth_config: dict[str, Any],
) -> None:
    """Inject auth credentials into headers or query params in-place."""
    match auth_type:
        case "bearer":
            token = auth_config.get("token", "")
            if not token:
                raise ConnectorError(
                    "MISSING_AUTH",
                    "auth_config.token is required for bearer auth",
                )
            headers["Authorization"] = f"Bearer {token}"

        case "api_key":
            key = auth_config.get("key", "")
            header_name = auth_config.get("header_name", "X-API-Key")
            location = auth_config.get("location", "header")
            if not key:
                raise ConnectorError(
                    "MISSING_AUTH",
                    "auth_config.key is required for api_key auth",
                )
            if location == "query":
                params[header_name] = key
            else:
                headers[header_name] = key

        case "oauth2":
            token = auth_config.get("access_token", "")
            if not token:
                raise ConnectorError(
                    "MISSING_AUTH",
                    "auth_config.access_token is required for oauth2 auth",
                )
            headers["Authorization"] = f"Bearer {token}"

        case "none" | "" | None:
            pass

        case _:
            raise ConnectorError(
                "UNSUPPORTED_AUTH",
                f"Unsupported auth_type: '{auth_type}'",
            )


def _parse_response_body(response: httpx.Response) -> Any:
    """Try to parse the response body as JSON; fall back to text."""
    content_type = response.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            return response.json()
        except Exception:
            pass
    return response.text


class HttpConnector(BaseConnector):
    """Generic HTTP connector for making arbitrary REST/GraphQL requests.

    Unlike other connectors, this one does NOT have a fixed base_url — the
    URL is fully dynamic per request. The ``access_token`` parameter from the
    IConnector interface is unused; auth is handled via the ``auth_type`` and
    ``auth_config`` params instead.
    """

    provider = "http"
    base_url = ""  # intentionally empty — URL is dynamic
    supported_operations = [
        "make_request",
    ]

    _operation_schemas = [
        OperationSchema(
            name="make_request",
            description="Make an HTTP request to any URL with configurable method, headers, body, and auth",
            input_fields=[
                FieldSchema(
                    name="url",
                    kind=FieldKind.STRING,
                    required=True,
                    description="The target URL (must start with http:// or https://)",
                ),
                FieldSchema(
                    name="method",
                    kind=FieldKind.STRING,
                    description="HTTP method",
                    default="GET",
                    enum=["GET", "POST", "PUT", "PATCH", "DELETE"],
                ),
                FieldSchema(
                    name="headers",
                    kind=FieldKind.OBJECT,
                    description="Optional HTTP headers as key-value pairs",
                ),
                FieldSchema(
                    name="body",
                    kind=FieldKind.OBJECT,
                    description="Request body (for POST/PUT/PATCH). Sent as JSON.",
                ),
                FieldSchema(
                    name="query_params",
                    kind=FieldKind.OBJECT,
                    description="Optional query parameters as key-value pairs",
                ),
                FieldSchema(
                    name="auth_type",
                    kind=FieldKind.STRING,
                    description="Authentication type",
                    default="none",
                    enum=["none", "bearer", "api_key", "oauth2"],
                ),
                FieldSchema(
                    name="auth_config",
                    kind=FieldKind.OBJECT,
                    description="Auth configuration map. Keys depend on auth_type: bearer→{token}, api_key→{key, header_name?, location?}, oauth2→{access_token}",
                ),
                FieldSchema(
                    name="timeout",
                    kind=FieldKind.FLOAT,
                    description="Request timeout in seconds (default 30)",
                    default=30.0,
                ),
                FieldSchema(
                    name="max_retries",
                    kind=FieldKind.INTEGER,
                    description="Max retry attempts for transient failures (default 3)",
                    default=3,
                ),
            ],
            output_fields=[
                FieldSchema(name="status_code", kind=FieldKind.INTEGER, description="HTTP status code"),
                FieldSchema(name="headers", kind=FieldKind.OBJECT, description="Response headers"),
                FieldSchema(name="body", kind=FieldKind.OBJECT, description="Response body (parsed JSON or text)"),
            ],
            is_write=False,
        ),
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        # The access_token from IConnector is not used here — auth is
        # driven by auth_type/auth_config in the node params instead.
        match operation:
            case "make_request":
                return await self._make_request(params)
            case _:
                raise ConnectorError(
                    "UNSUPPORTED_OPERATION",
                    f"HTTP connector does not support operation '{operation}'",
                )

    async def _make_request(self, params: dict[str, Any]) -> dict[str, Any]:
        url = params.get("url", "")
        if not url:
            raise ConnectorError("MISSING_PARAM", "make_request requires 'url'")
        if not url.startswith(("http://", "https://")):
            raise ConnectorError(
                "INVALID_PARAM",
                "url must start with http:// or https://",
            )

        method = (params.get("method") or "GET").upper()
        if method not in ("GET", "POST", "PUT", "PATCH", "DELETE"):
            raise ConnectorError(
                "INVALID_PARAM",
                f"Unsupported HTTP method: '{method}'",
            )

        headers: dict[str, str] = {}
        extra_params: dict[str, Any] = {}

        # Apply user-provided headers
        user_headers = params.get("headers") or {}
        if isinstance(user_headers, dict):
            headers.update({str(k): str(v) for k, v in user_headers.items()})

        # Apply auth
        auth_type = params.get("auth_type", "none") or "none"
        auth_config = params.get("auth_config") or {}
        _apply_auth(headers, extra_params, auth_type, auth_config)

        # Merge user query params
        query_params = params.get("query_params") or {}
        if isinstance(query_params, dict):
            extra_params.update({str(k): str(v) for k, v in query_params.items()})

        # Default content-type for write methods
        if method in ("POST", "PUT", "PATCH") and "Content-Type" not in headers:
            headers["Content-Type"] = "application/json"

        timeout = float(params.get("timeout", 30.0))
        max_retries = int(params.get("max_retries", 3))

        # Build request kwargs
        request_kwargs: dict[str, Any] = {
            "headers": headers,
        }
        if extra_params:
            request_kwargs["params"] = extra_params

        body = params.get("body")
        if body is not None and method in ("POST", "PUT", "PATCH"):
            if isinstance(body, (dict, list)):
                request_kwargs["json"] = body
            elif isinstance(body, str):
                request_kwargs["content"] = body
            else:
                request_kwargs["content"] = _json.dumps(body)

        try:
            async with httpx.AsyncClient(
                timeout=timeout,
                follow_redirects=True,
            ) as client:
                response = await request_with_rate_limit(
                    client,
                    method,
                    url,
                    max_attempts=max_retries + 1,  # +1 because first attempt counts
                    **request_kwargs,
                )
        except httpx.RequestError as exc:
            raise ConnectorError(
                "HTTP_REQUEST_ERROR",
                f"HTTP request to {url} failed: {exc}",
            ) from exc

        response_headers = dict(response.headers)
        response_body = _parse_response_body(response)

        return {
            "status_code": response.status_code,
            "headers": response_headers,
            "body": response_body,
        }
