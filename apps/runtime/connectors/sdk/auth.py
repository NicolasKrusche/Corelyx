"""Auth helpers for the Connector SDK.

Provides lightweight abstractions for common authentication patterns
(OAuth2 bearer, API key, HTTP Basic) without adding heavy dependencies.
Each connector can compose these or implement its own logic directly.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

import httpx

from .types import AuthType


class AuthProvider(ABC):
    """Protocol for auth providers that inject credentials into requests."""

    @property
    @abstractmethod
    def auth_type(self) -> AuthType:
        """Return the authentication type this provider handles."""

    @abstractmethod
    async def apply(self, client: httpx.AsyncClient, request_kwargs: dict[str, Any]) -> dict[str, Any]:
        """Mutate *request_kwargs* in-place (or return a new dict) to inject auth.

        Args:
            client: The httpx client (for context, e.g. token refresh).
            request_kwargs: The kwargs that will be passed to ``client.request()``.

        Returns:
            The (possibly mutated) request_kwargs dict.
        """


class BearerAuthProvider(AuthProvider):
    """Inject a bearer token (OAuth2 or PAT) into the Authorization header.

    This is the most common pattern — every existing connector already does
    ``headers["Authorization"] = f"Bearer {access_token}"`` manually.
    """

    auth_type = AuthType.BEARER

    def __init__(self, token: str) -> None:
        self._token = token

    @property
    def token(self) -> str:
        return self._token

    async def apply(self, client: httpx.AsyncClient, request_kwargs: dict[str, Any]) -> dict[str, Any]:
        headers = dict(request_kwargs.get("headers") or {})
        headers["Authorization"] = f"Bearer {self._token}"
        request_kwargs["headers"] = headers
        return request_kwargs


class ApiKeyAuthProvider(AuthProvider):
    """Inject an API key via a configurable header or query parameter.

    Common patterns:
        - ``X-API-Key: <key>``  (header-based, e.g. many SaaS APIs)
        - ``?api_key=<key>``    (query param, e.g. some Google APIs)
    """

    auth_type = AuthType.API_KEY

    def __init__(
        self,
        key: str,
        header: str | None = "X-API-Key",
        query_param: str | None = None,
    ) -> None:
        self._key = key
        self._header = header
        self._query_param = query_param

    async def apply(self, client: httpx.AsyncClient, request_kwargs: dict[str, Any]) -> dict[str, Any]:
        if self._header:
            headers = dict(request_kwargs.get("headers") or {})
            headers[self._header] = self._key
            request_kwargs["headers"] = headers

        if self._query_param:
            params = dict(request_kwargs.get("params") or {})
            params[self._query_param] = self._key
            request_kwargs["params"] = params

        return request_kwargs


class BasicAuthProvider(AuthProvider):
    """HTTP Basic authentication."""

    auth_type = AuthType.BASIC

    def __init__(self, username: str, password: str) -> None:
        self._username = username
        self._password = password

    async def apply(self, client: httpx.AsyncClient, request_kwargs: dict[str, Any]) -> dict[str, Any]:
        request_kwargs["auth"] = (self._username, self._password)
        return request_kwargs


class NoAuthProvider(AuthProvider):
    """No-op auth provider for connectors that don't need authentication (e.g. webhooks)."""

    auth_type = AuthType.NONE

    async def apply(self, client: httpx.AsyncClient, request_kwargs: dict[str, Any]) -> dict[str, Any]:
        return request_kwargs
