"""Telegram native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit


class TelegramConnector(IConnector):
    provider = "telegram"
    supported_operations = [
        "send_message",
        "send_photo",
        "get_chat",
        "get_updates",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        # Telegram uses bot token directly in the URL, not as a header
        base = f"https://api.telegram.org/bot{access_token}"
        headers = {"Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "send_message":
                    return await self._send_message(client, headers, base, params)
                case "send_photo":
                    return await self._send_photo(client, headers, base, params)
                case "get_chat":
                    return await self._get_chat(client, headers, base, params)
                case "get_updates":
                    return await self._get_updates(client, headers, base, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Telegram does not support operation '{operation}'",
                    )

    async def _send_message(self, client: httpx.AsyncClient, headers: dict, base: str, params: dict) -> dict:
        chat_id = params.get("chat_id")
        text = params.get("text", "")
        if not chat_id:
            raise ConnectorError("MISSING_PARAM", "send_message requires 'chat_id'")
        body: dict[str, Any] = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": params.get("parse_mode", "HTML"),
        }
        r = await request_with_rate_limit(client, "POST", f"{base}/sendMessage", headers=headers, json=body)
        _raise_for_status(r, "send_message")
        data = r.json()
        result = data.get("result", {})
        return {
            "message_id": result.get("message_id"),
            "chat_id": result.get("chat", {}).get("id"),
            "date": result.get("date"),
        }

    async def _send_photo(self, client: httpx.AsyncClient, headers: dict, base: str, params: dict) -> dict:
        chat_id = params.get("chat_id")
        photo = params.get("photo")
        if not chat_id or not photo:
            raise ConnectorError("MISSING_PARAM", "send_photo requires 'chat_id' and 'photo'")
        body: dict[str, Any] = {
            "chat_id": chat_id,
            "photo": photo,
        }
        if params.get("caption"):
            body["caption"] = params["caption"]
        r = await request_with_rate_limit(client, "POST", f"{base}/sendPhoto", headers=headers, json=body)
        _raise_for_status(r, "send_photo")
        data = r.json()
        result = data.get("result", {})
        return {
            "message_id": result.get("message_id"),
            "chat_id": result.get("chat", {}).get("id"),
        }

    async def _get_chat(self, client: httpx.AsyncClient, headers: dict, base: str, params: dict) -> dict:
        chat_id = params.get("chat_id")
        if not chat_id:
            raise ConnectorError("MISSING_PARAM", "get_chat requires 'chat_id'")
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{base}/getChat",
            headers=headers,
            params={"chat_id": chat_id},
        )
        _raise_for_status(r, "get_chat")
        data = r.json()
        result = data.get("result", {})
        return {
            "id": result.get("id"),
            "type": result.get("type"),
            "title": result.get("title"),
            "username": result.get("username"),
            "description": result.get("description"),
        }

    async def _get_updates(self, client: httpx.AsyncClient, headers: dict, base: str, params: dict) -> dict:
        query: dict[str, Any] = {"limit": int(params.get("limit", 10))}
        if params.get("offset"):
            query["offset"] = params["offset"]
        r = await request_with_rate_limit(client, "GET", f"{base}/getUpdates", headers=headers, params=query)
        _raise_for_status(r, "get_updates")
        data = r.json()
        return {"updates": data.get("result", [])}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError(
            "TOKEN_EXPIRED",
            f"Telegram {operation} failed: bot token invalid",
        )
    if r.status_code >= 400:
        raise ConnectorError(
            "TELEGRAM_API_ERROR",
            f"Telegram {operation} failed ({r.status_code}): {r.text[:300]}",
        )
    data = r.json()
    if not data.get("ok"):
        raise ConnectorError(
            "TELEGRAM_API_ERROR",
            f"Telegram {operation} error: {data.get('description', 'unknown')}",
        )
