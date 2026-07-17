"""WhatsApp Business native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://graph.facebook.com/v19.0"


class WhatsappConnector(IConnector):
    provider = "whatsapp"
    supported_operations = [
        "send_text_message",
        "send_template_message",
        "get_phone_number_id",
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
                case "send_text_message":
                    return await self._send_text_message(client, headers, params)
                case "send_template_message":
                    return await self._send_template_message(client, headers, params)
                case "get_phone_number_id":
                    return await self._get_phone_number_id(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"WhatsApp does not support operation '{operation}'",
                    )

    async def _send_text_message(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        phone_number_id = params.get("phone_number_id")
        to = params.get("to")
        text = params.get("text", "")
        if not phone_number_id or not to:
            raise ConnectorError(
                "MISSING_PARAM",
                "send_text_message requires 'phone_number_id' and 'to'",
            )
        body: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "text",
            "text": {"preview_url": params.get("preview_url", False), "body": text},
        }
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/{phone_number_id}/messages",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "send_text_message")
        data = r.json()
        messages = data.get("messages", [])
        return {
            "message_id": messages[0].get("id") if messages else None,
            "to": to,
        }

    async def _send_template_message(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        phone_number_id = params.get("phone_number_id")
        to = params.get("to")
        template_name = params.get("template_name")
        language_code = params.get("language_code", "en_US")
        if not phone_number_id or not to or not template_name:
            raise ConnectorError(
                "MISSING_PARAM",
                "send_template_message requires 'phone_number_id', 'to', and 'template_name'",
            )
        body: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language_code},
            },
        }
        if params.get("components"):
            body["template"]["components"] = params["components"]
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/{phone_number_id}/messages",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "send_template_message")
        data = r.json()
        messages = data.get("messages", [])
        return {
            "message_id": messages[0].get("id") if messages else None,
            "to": to,
            "template": template_name,
        }

    async def _get_phone_number_id(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        waba_id = params.get("waba_id")
        if not waba_id:
            raise ConnectorError("MISSING_PARAM", "get_phone_number_id requires 'waba_id'")
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/{waba_id}/phone_numbers",
            headers=headers,
        )
        _raise_for_status(r, "get_phone_number_id")
        data = r.json()
        return {
            "phone_numbers": [
                {
                    "id": p["id"],
                    "display_phone_number": p.get("display_phone_number"),
                    "verified_name": p.get("verified_name"),
                    "quality_rating": p.get("quality_rating"),
                }
                for p in data.get("data", [])
            ]
        }


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError(
            "TOKEN_EXPIRED",
            f"WhatsApp {operation} failed: token expired",
        )
    if r.status_code == 403:
        raise ConnectorError(
            "WHATSAPP_FORBIDDEN",
            f"WhatsApp {operation} failed: insufficient permissions",
        )
    if r.status_code >= 400:
        raise ConnectorError(
            "WHATSAPP_API_ERROR",
            f"WhatsApp {operation} failed ({r.status_code}): {r.text[:300]}",
        )
