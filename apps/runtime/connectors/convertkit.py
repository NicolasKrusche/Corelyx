"""ConvertKit native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.convertkit.com/v3"


class ConvertKitConnector(IConnector):
    provider = "convertkit"
    supported_operations = [
        "list_subscribers",
        "add_subscriber",
        "list_forms",
        "list_sequences",
        "tag_subscriber",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        # ConvertKit uses api_secret as query param, not Bearer header
        base_params = {"api_secret": access_token}
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_subscribers":
                    return await self._list_subscribers(client, base_params, params)
                case "add_subscriber":
                    return await self._add_subscriber(client, base_params, params)
                case "list_forms":
                    return await self._list_forms(client, base_params, params)
                case "list_sequences":
                    return await self._list_sequences(client, base_params, params)
                case "tag_subscriber":
                    return await self._tag_subscriber(client, base_params, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"ConvertKit does not support '{operation}'",
                    )

    async def _list_subscribers(self, client: httpx.AsyncClient, base_params: dict, params: dict) -> dict:
        query = {**base_params, "page": int(params.get("page", 1))}
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/subscribers",
            params=query,
        )
        _raise_for_status(r, "list_subscribers")
        return {
            "subscribers": r.json().get("subscribers", []),
            "total_subscribers": r.json().get("total_subscribers", 0),
        }

    async def _add_subscriber(self, client: httpx.AsyncClient, base_params: dict, params: dict) -> dict:
        form_id = params.get("form_id")
        email = params.get("email")
        if not form_id or not email:
            raise ConnectorError("MISSING_PARAM", "add_subscriber requires 'form_id' and 'email'")
        body: dict[str, Any] = {**base_params, "email": email}
        if params.get("first_name"):
            body["first_name"] = params["first_name"]
        if params.get("fields"):
            body["fields"] = params["fields"]
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/forms/{form_id}/subscribe",
            headers={"Content-Type": "application/json"},
            json=body,
        )
        _raise_for_status(r, "add_subscriber")
        return r.json().get("subscription", {})

    async def _list_forms(self, client: httpx.AsyncClient, base_params: dict, params: dict) -> dict:
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/forms",
            params=base_params,
        )
        _raise_for_status(r, "list_forms")
        return {"forms": r.json().get("forms", [])}

    async def _list_sequences(self, client: httpx.AsyncClient, base_params: dict, params: dict) -> dict:
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/sequences",
            params=base_params,
        )
        _raise_for_status(r, "list_sequences")
        return {"sequences": r.json().get("courses", [])}

    async def _tag_subscriber(self, client: httpx.AsyncClient, base_params: dict, params: dict) -> dict:
        tag_id = params.get("tag_id")
        email = params.get("email")
        if not tag_id or not email:
            raise ConnectorError("MISSING_PARAM", "tag_subscriber requires 'tag_id' and 'email'")
        body = {**base_params, "email": email}
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/tags/{tag_id}/subscribe",
            headers={"Content-Type": "application/json"},
            json=body,
        )
        _raise_for_status(r, "tag_subscriber")
        return r.json().get("subscription", {})


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"ConvertKit {operation}: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "CONVERTKIT_ERROR",
            f"ConvertKit {operation} ({r.status_code}): {r.text[:300]}",
        )
