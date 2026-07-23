"""HTTP client helpers for the Connector SDK.

Wraps httpx with built-in retry, rate-limit handling, and auth injection.
Most existing connectors already import ``request_with_rate_limit`` from
``connectors.rate_limit`` — this module provides an object-oriented wrapper
that composes with the SDK auth providers.
"""

from __future__ import annotations

import asyncio
import random
from typing import Any

import httpx

from .auth import AuthProvider, BearerAuthProvider
from ..rate_limit import request_with_rate_limit as _raw_request_with_rate_limit


class HttpClient:
    """Managed async HTTP client with auth injection and retry.

    Usage::

        http = HttpClient(
            base_url="https://api.example.com",
            auth=BearerAuthProvider(token),
            timeout=30.0,
        )
        async with http:
            response = await http.get("/v1/items", params={"limit": 10})
    """

    def __init__(
        self,
        base_url: str = "",
        auth: AuthProvider | None = None,
        default_headers: dict[str, str] | None = None,
        timeout: float = 30.0,
        max_attempts: int = 5,
        retryable_statuses: set[int] | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._auth = auth or BearerAuthProvider("")  # no-op if no token
        self._default_headers = dict(default_headers or {})
        self._timeout = timeout
        self._max_attempts = max_attempts
        self._retryable_statuses = retryable_statuses
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "HttpClient":
        self._client = httpx.AsyncClient(timeout=self._timeout)
        return self

    async def __aexit__(self, *args: Any) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError("HttpClient must be used as an async context manager")
        return self._client

    def _url(self, path: str) -> str:
        if path.startswith("http"):
            return path
        return f"{self._base_url}{path}"

    async def _inject_auth(self, request_kwargs: dict[str, Any]) -> dict[str, Any]:
        headers = dict(self._default_headers)
        headers.update(request_kwargs.get("headers") or {})
        request_kwargs["headers"] = headers
        return await self._auth.apply(self.client, request_kwargs)

    async def request(
        self,
        method: str,
        path: str,
        **kwargs: Any,
    ) -> httpx.Response:
        """Make an HTTP request with auth injection and retry."""
        kwargs = await self._inject_auth(kwargs)
        url = self._url(path)

        request_kwargs = dict(kwargs)
        request_kwargs.pop("max_attempts", None)
        request_kwargs.pop("retryable_statuses", None)

        return await _raw_request_with_rate_limit(
            self.client,
            method,
            url,
            max_attempts=self._max_attempts,
            retryable_statuses=self._retryable_statuses,
            **request_kwargs,
        )

    async def get(self, path: str, **kwargs: Any) -> httpx.Response:
        return await self.request("GET", path, **kwargs)

    async def post(self, path: str, **kwargs: Any) -> httpx.Response:
        return await self.request("POST", path, **kwargs)

    async def put(self, path: str, **kwargs: Any) -> httpx.Response:
        return await self.request("PUT", path, **kwargs)

    async def patch(self, path: str, **kwargs: Any) -> httpx.Response:
        return await self.request("PATCH", path, **kwargs)

    async def delete(self, path: str, **kwargs: Any) -> httpx.Response:
        return await self.request("DELETE", path, **kwargs)
