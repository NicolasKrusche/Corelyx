"""Trello native connector."""
from __future__ import annotations

from typing import Any
import os

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.trello.com/1"


class TrelloConnector(IConnector):
    provider = "trello"
    supported_operations = [
        "list_boards",
        "list_cards",
        "create_card",
        "update_card",
        "list_lists",
        "add_comment",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        api_key = params.get("api_key") or os.environ.get("TRELLO_API_KEY", "")
        # auth params appended to every request
        auth_params = {"key": api_key, "token": access_token}
        headers = {"Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_boards":
                    return await self._list_boards(client, headers, params, auth_params)
                case "list_cards":
                    return await self._list_cards(client, headers, params, auth_params)
                case "create_card":
                    return await self._create_card(client, headers, params, auth_params)
                case "update_card":
                    return await self._update_card(client, headers, params, auth_params)
                case "list_lists":
                    return await self._list_lists(client, headers, params, auth_params)
                case "add_comment":
                    return await self._add_comment(client, headers, params, auth_params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Trello does not support operation '{operation}'",
                    )

    async def _list_boards(
        self, client: httpx.AsyncClient, headers: dict, params: dict, auth: dict
    ) -> dict:
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/members/me/boards", headers=headers, params={**auth, "fields": "id,name,desc,url"}
        )
        _raise_for_status(r, "list_boards")
        return {"boards": r.json()}

    async def _list_cards(
        self, client: httpx.AsyncClient, headers: dict, params: dict, auth: dict
    ) -> dict:
        board_id = params.get("board_id")
        if not board_id:
            raise ConnectorError("MISSING_PARAM", "list_cards requires 'board_id'")
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/boards/{board_id}/cards", headers=headers, params=auth
        )
        _raise_for_status(r, "list_cards")
        return {"cards": r.json()}

    async def _create_card(
        self, client: httpx.AsyncClient, headers: dict, params: dict, auth: dict
    ) -> dict:
        list_id = params.get("list_id")
        name = params.get("name")
        if not list_id or not name:
            raise ConnectorError("MISSING_PARAM", "create_card requires 'list_id' and 'name'")
        body: dict[str, Any] = {"idList": list_id, "name": name, **auth}
        if params.get("desc"):
            body["desc"] = params["desc"]
        if params.get("due"):
            body["due"] = params["due"]
        r = await request_with_rate_limit(client, "POST", f"{_BASE}/cards", headers=headers, params=body)
        _raise_for_status(r, "create_card")
        data = r.json()
        return {"id": data.get("id"), "url": data.get("url"), "name": data.get("name")}

    async def _update_card(
        self, client: httpx.AsyncClient, headers: dict, params: dict, auth: dict
    ) -> dict:
        card_id = params.get("card_id")
        if not card_id:
            raise ConnectorError("MISSING_PARAM", "update_card requires 'card_id'")
        update: dict[str, Any] = {**auth}
        for field in ("name", "desc", "due", "idList", "closed"):
            if params.get(field) is not None:
                update[field] = params[field]
        r = await request_with_rate_limit(client, "PUT", f"{_BASE}/cards/{card_id}", headers=headers, params=update)
        _raise_for_status(r, "update_card")
        return {"updated": True, "card_id": card_id}

    async def _list_lists(
        self, client: httpx.AsyncClient, headers: dict, params: dict, auth: dict
    ) -> dict:
        board_id = params.get("board_id")
        if not board_id:
            raise ConnectorError("MISSING_PARAM", "list_lists requires 'board_id'")
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/boards/{board_id}/lists", headers=headers, params=auth
        )
        _raise_for_status(r, "list_lists")
        return {"lists": r.json()}

    async def _add_comment(
        self, client: httpx.AsyncClient, headers: dict, params: dict, auth: dict
    ) -> dict:
        card_id = params.get("card_id")
        text = params.get("text", "")
        if not card_id:
            raise ConnectorError("MISSING_PARAM", "add_comment requires 'card_id'")
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/cards/{card_id}/actions/comments", headers=headers, params={**auth, "text": text}
        )
        _raise_for_status(r, "add_comment")
        data = r.json()
        return {"comment_id": data.get("id")}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Trello {operation} failed: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "TRELLO_API_ERROR",
            f"Trello {operation} failed ({r.status_code}): {r.text[:300]}",
        )
