"""Constant Contact native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.cc.email/v3"


class ConstantContactConnector(IConnector):
    provider = "constantcontact"
    supported_operations = [
        "list_contacts",
        "create_contact",
        "list_campaigns",
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
                case "list_contacts":
                    return await self._list_contacts(client, headers, params)
                case "create_contact":
                    return await self._create_contact(client, headers, params)
                case "list_campaigns":
                    return await self._list_campaigns(client, headers, params)
                case "create_campaign":
                    return await self._create_campaign(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Constant Contact does not support '{operation}'",
                    )

    async def _list_contacts(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        limit = int(params.get("limit", 500))
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/contacts",
            headers=headers,
            params={"limit": limit},
        )
        _raise_for_status(r, "list_contacts")
        return {"contacts": r.json().get("contacts", [])}

    async def _create_contact(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        email = params.get("email")
        if not email:
            raise ConnectorError("MISSING_PARAM", "create_contact requires 'email'")
        body: dict[str, Any] = {
            "email_address": {"address": email, "permission_to_send": "implicit"},
            "create_source": "Account",
        }
        if params.get("first_name"):
            body["first_name"] = params["first_name"]
        if params.get("last_name"):
            body["last_name"] = params["last_name"]
        if params.get("list_memberships"):
            body["list_memberships"] = params["list_memberships"]
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/contacts",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "create_contact")
        return r.json()

    async def _list_campaigns(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/emails",
            headers=headers,
        )
        _raise_for_status(r, "list_campaigns")
        return {"campaigns": r.json().get("campaigns", [])}

    async def _create_campaign(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        name = params.get("name")
        subject = params.get("subject", "")
        if not name:
            raise ConnectorError("MISSING_PARAM", "create_campaign requires 'name'")
        body: dict[str, Any] = {
            "name": name,
            "email_campaign_activities": [
                {
                    "format_type": 5,
                    "from_name": params.get("from_name", ""),
                    "from_email": params.get("from_email", ""),
                    "reply_to_email": params.get("reply_to_email", params.get("from_email", "")),
                    "subject": subject,
                    "html_content": params.get("html_content", ""),
                }
            ],
        }
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/emails",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "create_campaign")
        return r.json()


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Constant Contact {operation}: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "CONSTANTCONTACT_ERROR",
            f"Constant Contact {operation} ({r.status_code}): {r.text[:300]}",
        )
