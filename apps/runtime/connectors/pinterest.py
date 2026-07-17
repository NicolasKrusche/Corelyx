"""Pinterest native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.pinterest.com/v5"


class PinterestConnector(IConnector):
    provider = "pinterest"
    supported_operations = [
        "list_boards",
        "create_pin",
        "get_board_pins",
        "get_analytics",
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
                case "list_boards":
                    return await self._list_boards(client, headers, params)
                case "create_pin":
                    return await self._create_pin(client, headers, params)
                case "get_board_pins":
                    return await self._get_board_pins(client, headers, params)
                case "get_analytics":
                    return await self._get_analytics(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Pinterest does not support operation '{operation}'",
                    )

    async def _list_boards(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        query: dict[str, Any] = {
            "page_size": int(params.get("page_size", 25)),
        }
        if params.get("bookmark"):
            query["bookmark"] = params["bookmark"]
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/boards", headers=headers, params=query)
        _raise_for_status(r, "list_boards")
        data = r.json()
        return {
            "boards": [
                {
                    "id": b["id"],
                    "name": b.get("name"),
                    "description": b.get("description"),
                    "pin_count": b.get("pin_count"),
                }
                for b in data.get("items", [])
            ],
            "bookmark": data.get("bookmark"),
        }

    async def _create_pin(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        board_id = params.get("board_id")
        if not board_id:
            raise ConnectorError("MISSING_PARAM", "create_pin requires 'board_id'")
        body: dict[str, Any] = {
            "board_id": board_id,
            "media_source": params.get(
                "media_source", {"source_type": "image_url", "url": params.get("image_url", "")}
            ),
        }
        if params.get("title"):
            body["title"] = params["title"]
        if params.get("description"):
            body["description"] = params["description"]
        if params.get("link"):
            body["link"] = params["link"]
        r = await request_with_rate_limit(client, "POST", f"{_BASE}/pins", headers=headers, json=body)
        _raise_for_status(r, "create_pin")
        data = r.json()
        return {
            "pin_id": data.get("id"),
            "board_id": data.get("board_id"),
            "created_at": data.get("created_at"),
        }

    async def _get_board_pins(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        board_id = params.get("board_id")
        if not board_id:
            raise ConnectorError("MISSING_PARAM", "get_board_pins requires 'board_id'")
        query: dict[str, Any] = {
            "page_size": int(params.get("page_size", 25)),
        }
        if params.get("bookmark"):
            query["bookmark"] = params["bookmark"]
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/boards/{board_id}/pins", headers=headers, params=query
        )
        _raise_for_status(r, "get_board_pins")
        data = r.json()
        return {
            "pins": data.get("items", []),
            "bookmark": data.get("bookmark"),
        }

    async def _get_analytics(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        query: dict[str, Any] = {
            "start_date": params.get("start_date", "2024-01-01"),
            "end_date": params.get("end_date", "2024-12-31"),
            "metric_types": params.get("metric_types", "IMPRESSION,SAVE,PIN_CLICK"),
        }
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/user_account/analytics", headers=headers, params=query
        )
        _raise_for_status(r, "get_analytics")
        return r.json()


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError(
            "TOKEN_EXPIRED",
            f"Pinterest {operation} failed: token expired",
        )
    if r.status_code == 403:
        raise ConnectorError(
            "PINTEREST_FORBIDDEN",
            f"Pinterest {operation} failed: insufficient permissions",
        )
    if r.status_code >= 400:
        raise ConnectorError(
            "PINTEREST_API_ERROR",
            f"Pinterest {operation} failed ({r.status_code}): {r.text[:300]}",
        )
