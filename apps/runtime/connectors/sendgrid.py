"""SendGrid native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.sendgrid.com/v3"


class SendGridConnector(IConnector):
    provider = "sendgrid"
    supported_operations = [
        "send_email",
        "list_contacts",
        "add_contact",
        "list_lists",
        "create_campaign",
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
                case "send_email":
                    return await self._send_email(client, headers, params)
                case "list_contacts":
                    return await self._list_contacts(client, headers, params)
                case "add_contact":
                    return await self._add_contact(client, headers, params)
                case "list_lists":
                    return await self._list_lists(client, headers, params)
                case "create_campaign":
                    return await self._create_campaign(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"SendGrid does not support '{operation}'",
                    )

    async def _send_email(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        to_email = params.get("to")
        from_email = params.get("from")
        subject = params.get("subject", "")
        if not to_email or not from_email:
            raise ConnectorError("MISSING_PARAM", "send_email requires 'to' and 'from'")
        body: dict[str, Any] = {
            "personalizations": [{"to": [{"email": to_email}]}],
            "from": {"email": from_email},
            "subject": subject,
            "content": [{"type": "text/html", "value": params.get("html", params.get("text", ""))}],
        }
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/mail/send",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "send_email")
        return {"sent": True, "to": to_email}

    async def _list_contacts(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/marketing/contacts",
            headers=headers,
        )
        _raise_for_status(r, "list_contacts")
        return {"contacts": r.json().get("result", [])}

    async def _add_contact(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        email = params.get("email")
        if not email:
            raise ConnectorError("MISSING_PARAM", "add_contact requires 'email'")
        contact: dict[str, Any] = {"email": email}
        for field in ("first_name", "last_name", "phone_number_id"):
            if params.get(field):
                contact[field] = params[field]
        if params.get("list_ids"):
            body = {"list_ids": params["list_ids"], "contacts": [contact]}
        else:
            body = {"contacts": [contact]}
        r = await request_with_rate_limit(
            client,
            "PUT",
            f"{_BASE}/marketing/contacts",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "add_contact")
        return r.json()

    async def _list_lists(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/marketing/lists",
            headers=headers,
        )
        _raise_for_status(r, "list_lists")
        return {"lists": r.json().get("result", [])}

    async def _create_campaign(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        name = params.get("name")
        if not name:
            raise ConnectorError("MISSING_PARAM", "create_campaign requires 'name'")
        body: dict[str, Any] = {"name": name}
        for field in ("subject", "send_to", "sender_id", "suppression_group_id"):
            if params.get(field) is not None:
                body[field] = params[field]
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/marketing/singlesends",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "create_campaign")
        return r.json()


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"SendGrid {operation}: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "SENDGRID_ERROR",
            f"SendGrid {operation} ({r.status_code}): {r.text[:300]}",
        )
