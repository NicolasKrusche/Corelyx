"""Brevo (Sendinblue) native connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.brevo.com/v3"


class BrevoConnector(IConnector):
    provider = "brevo"
    supported_operations = [
        "send_email",
        "list_contacts",
        "create_contact",
        "list_campaigns",
        "send_sms",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        headers = {
            "api-key": access_token,
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "send_email":
                    return await self._send_email(client, headers, params)
                case "list_contacts":
                    return await self._list_contacts(client, headers, params)
                case "create_contact":
                    return await self._create_contact(client, headers, params)
                case "list_campaigns":
                    return await self._list_campaigns(client, headers, params)
                case "send_sms":
                    return await self._send_sms(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Brevo does not support '{operation}'",
                    )

    async def _send_email(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        to_email = params.get("to")
        sender_email = params.get("sender_email", params.get("from"))
        subject = params.get("subject", "")
        if not to_email or not sender_email:
            raise ConnectorError("MISSING_PARAM", "send_email requires 'to' and 'sender_email'")
        body: dict[str, Any] = {
            "to": [{"email": to_email, "name": params.get("to_name", "")}],
            "sender": {"email": sender_email, "name": params.get("sender_name", "")},
            "subject": subject,
            "htmlContent": params.get("html", params.get("text", "")),
        }
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/smtp/email", headers=headers, json=body,
        )
        _raise_for_status(r, "send_email")
        return r.json()

    async def _list_contacts(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        limit = int(params.get("limit", 50))
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/contacts", headers=headers,
            params={"limit": limit},
        )
        _raise_for_status(r, "list_contacts")
        return {"contacts": r.json().get("contacts", [])}

    async def _create_contact(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        email = params.get("email")
        if not email:
            raise ConnectorError("MISSING_PARAM", "create_contact requires 'email'")
        body: dict[str, Any] = {"email": email}
        if params.get("attributes"):
            body["attributes"] = params["attributes"]
        if params.get("list_ids"):
            body["listIds"] = params["list_ids"]
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/contacts", headers=headers, json=body,
        )
        _raise_for_status(r, "create_contact")
        return r.json()

    async def _list_campaigns(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        status = params.get("status", "sent")
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/emailCampaigns", headers=headers,
            params={"status": status},
        )
        _raise_for_status(r, "list_campaigns")
        return {"campaigns": r.json().get("campaigns", [])}

    async def _send_sms(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        sender = params.get("sender")
        recipient = params.get("recipient")
        content = params.get("content", "")
        if not sender or not recipient:
            raise ConnectorError("MISSING_PARAM", "send_sms requires 'sender' and 'recipient'")
        body = {"sender": sender, "recipient": recipient, "content": content}
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/transactionalSMS/sms", headers=headers, json=body,
        )
        _raise_for_status(r, "send_sms")
        return r.json()


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Brevo {operation}: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "BREVO_ERROR",
            f"Brevo {operation} ({r.status_code}): {r.text[:300]}",
        )
