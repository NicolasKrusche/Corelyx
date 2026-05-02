"""Insightly native connector."""
from __future__ import annotations

import base64
from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.insightly.com/v3.1"


class InsightlyConnector(IConnector):
    provider = "insightly"
    supported_operations = [
        "list_contacts",
        "create_contact",
        "list_opportunities",
        "create_opportunity",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        # Insightly uses HTTP Basic with API key
        credentials = base64.b64encode(f"{access_token}:".encode()).decode()
        headers = {
            "Authorization": f"Basic {credentials}",
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
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Insightly does not support operation '{operation}'",
                    )

    async def _list_contacts(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/Contacts", headers=headers,
            params={"top": int(params.get("limit", 50))}
        )
        _raise_for_status(r, "list_contacts")
        return {"contacts": r.json()}

    async def _create_contact(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        first_name = params.get("first_name")
        last_name = params.get("last_name")
        if not last_name:
            raise ConnectorError("MISSING_PARAM", "create_contact requires 'last_name'")
        body: dict[str, Any] = {"LAST_NAME": last_name}
        if first_name:
            body["FIRST_NAME"] = first_name
        if params.get("email"):
            body["EMAILADDRESS1"] = params["email"]
        r = await request_with_rate_limit(client, "POST", f"{_BASE}/Contacts", headers=headers, json=body)
        _raise_for_status(r, "create_contact")
        return {"contact": r.json()}

    async def _list_opportunities(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/Opportunities", headers=headers,
            params={"top": int(params.get("limit", 50))}
        )
        _raise_for_status(r, "list_opportunities")
        return {"opportunities": r.json()}

    async def _create_opportunity(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        name = params.get("name")
        if not name:
            raise ConnectorError("MISSING_PARAM", "create_opportunity requires 'name'")
        body: dict[str, Any] = {"OPPORTUNITY_NAME": name}
        if params.get("value"):
            body["BID_AMOUNT"] = params["value"]
        if params.get("close_date"):
            body["CLOSE_DATE"] = params["close_date"]
        r = await request_with_rate_limit(client, "POST", f"{_BASE}/Opportunities", headers=headers, json=body)
        _raise_for_status(r, "create_opportunity")
        return {"opportunity": r.json()}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Insightly {operation} failed: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "INSIGHTLY_API_ERROR",
            f"Insightly {operation} failed ({r.status_code}): {r.text[:300]}",
        )
