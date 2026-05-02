"""Copper CRM native connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.copper.com/developer_api/v1"


class CopperConnector(IConnector):
    provider = "copper"
    supported_operations = [
        "list_contacts",
        "create_contact",
        "list_opportunities",
        "create_opportunity",
        "update_contact",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        # Copper uses X-PW-AccessToken + X-PW-UserEmail
        user_email = params.get("user_email", "")
        headers = {
            "X-PW-AccessToken": access_token,
            "X-PW-Application": "developer_api",
            "X-PW-UserEmail": user_email,
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_contacts":
                    return await self._list_contacts(client, headers, params)
                case "create_contact":
                    return await self._create_contact(client, headers, params)
                case "list_opportunities":
                    return await self._list_opportunities(client, headers, params)
                case "create_opportunity":
                    return await self._create_opportunity(client, headers, params)
                case "update_contact":
                    return await self._update_contact(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Copper does not support operation '{operation}'",
                    )

    async def _list_contacts(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/people/search", headers=headers,
            json={"page_size": int(params.get("limit", 50))}
        )
        _raise_for_status(r, "list_contacts")
        return {"contacts": r.json()}

    async def _create_contact(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        name = params.get("name")
        if not name:
            raise ConnectorError("MISSING_PARAM", "create_contact requires 'name'")
        body: dict[str, Any] = {"name": name}
        if params.get("email"):
            body["emails"] = [{"email": params["email"], "category": "work"}]
        r = await request_with_rate_limit(client, "POST", f"{_BASE}/people", headers=headers, json=body)
        _raise_for_status(r, "create_contact")
        return {"contact": r.json()}

    async def _list_opportunities(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/opportunities/search", headers=headers,
            json={"page_size": int(params.get("limit", 50))}
        )
        _raise_for_status(r, "list_opportunities")
        return {"opportunities": r.json()}

    async def _create_opportunity(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        name = params.get("name")
        if not name:
            raise ConnectorError("MISSING_PARAM", "create_opportunity requires 'name'")
        body: dict[str, Any] = {"name": name}
        for field in ("status", "monetary_value", "close_date"):
            if params.get(field) is not None:
                body[field] = params[field]
        r = await request_with_rate_limit(client, "POST", f"{_BASE}/opportunities", headers=headers, json=body)
        _raise_for_status(r, "create_opportunity")
        return {"opportunity": r.json()}

    async def _update_contact(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        contact_id = params.get("contact_id")
        if not contact_id:
            raise ConnectorError("MISSING_PARAM", "update_contact requires 'contact_id'")
        body: dict[str, Any] = {}
        for field in ("name", "title", "company_id"):
            if params.get(field) is not None:
                body[field] = params[field]
        r = await request_with_rate_limit(client, "PUT", f"{_BASE}/people/{contact_id}", headers=headers, json=body)
        _raise_for_status(r, "update_contact")
        return {"contact": r.json()}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Copper {operation} failed: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "COPPER_API_ERROR",
            f"Copper {operation} failed ({r.status_code}): {r.text[:300]}",
        )
