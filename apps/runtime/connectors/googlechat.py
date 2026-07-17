"""Google Chat native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://chat.googleapis.com/v1"


class GoogleChatConnector(IConnector):
    provider = "googlechat"
    supported_operations = [
        "send_message",
        "list_spaces",
        "create_message",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "send_message" | "create_message":
                    return await self._send_message(client, headers, params)
                case "list_spaces":
                    return await self._list_spaces(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Google Chat does not support operation '{operation}'",
                    )

    async def _send_message(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        space_name = params.get("space_name")
        text = params.get("text", "")
        if not space_name:
            raise ConnectorError("MISSING_PARAM", "send_message requires 'space_name'")
        body: dict[str, Any] = {"text": text}
        if params.get("cards"):
            body["cardsV2"] = params["cards"]
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/{space_name}/messages",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "send_message")
        data = r.json()
        return {
            "name": data.get("name"),
            "space": data.get("space", {}).get("name"),
            "create_time": data.get("createTime"),
            "text": data.get("text"),
        }

    async def _list_spaces(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        query: dict[str, Any] = {"pageSize": int(params.get("page_size", 25))}
        if params.get("page_token"):
            query["pageToken"] = params["page_token"]
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/spaces", headers=headers, params=query)
        _raise_for_status(r, "list_spaces")
        data = r.json()
        return {
            "spaces": [
                {
                    "name": s["name"],
                    "display_name": s.get("displayName"),
                    "type": s.get("type"),
                    "space_type": s.get("spaceType"),
                }
                for s in data.get("spaces", [])
            ],
            "next_page_token": data.get("nextPageToken"),
        }


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError(
            "TOKEN_EXPIRED",
            f"Google Chat {operation} failed: token expired",
        )
    if r.status_code == 403:
        raise ConnectorError(
            "GOOGLECHAT_FORBIDDEN",
            f"Google Chat {operation} failed: insufficient permissions",
        )
    if r.status_code >= 400:
        raise ConnectorError(
            "GOOGLECHAT_API_ERROR",
            f"Google Chat {operation} failed ({r.status_code}): {r.text[:300]}",
        )
