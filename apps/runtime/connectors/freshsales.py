"""Freshsales native connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit


class FreshsalesConnector(IConnector):
    provider = "freshsales"
    supported_operations = [
        "list_contacts",
        "create_contact",
        "update_contact",
        "list_deals",
        "create_deal",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        domain = params.get("domain")
        if not domain:
            raise ConnectorError("MISSING_PARAM", "Freshsales requires 'domain' param (e.g. 'mycompany')")
        base = f"https://{domain}.myfreshworks.com/crm/sales/api"
        headers = {
            "Authorization": f"Token token={access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_contacts":
                    return await self._list_contacts(client, headers, params, base)
                case "create_contact":
                    return await self._create_contact(client, headers, params, base)
                case "update_contact":
                    return await self._update_contact(client, headers, params, base)
                case "list_deals":
                    return await self._list_deals(client, headers, params, base)
                case "create_deal":
                    return await self._create_deal(client, headers, params, base)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Freshsales does not support operation '{operation}'",
                    )

    async def _list_contacts(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        r = await request_with_rate_limit(client, "GET", f"{base}/contacts", headers=headers, params={"per_page": int(params.get("limit", 50))})
        _raise_for_status(r, "list_contacts")
        return {"contacts": r.json().get("contacts", [])}

    async def _create_contact(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        first_name = params.get("first_name")
        last_name = params.get("last_name")
        email = params.get("email")
        if not email:
            raise ConnectorError("MISSING_PARAM", "create_contact requires 'email'")
        body: dict[str, Any] = {"contact": {"email": email}}
        if first_name:
            body["contact"]["first_name"] = first_name
        if last_name:
            body["contact"]["last_name"] = last_name
        for field in ("mobile_number", "job_title"):
            if params.get(field):
                body["contact"][field] = params[field]
        r = await request_with_rate_limit(client, "POST", f"{base}/contacts", headers=headers, json=body)
        _raise_for_status(r, "create_contact")
        return {"contact": r.json().get("contact")}

    async def _update_contact(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        contact_id = params.get("contact_id")
        if not contact_id:
            raise ConnectorError("MISSING_PARAM", "update_contact requires 'contact_id'")
        update: dict[str, Any] = {}
        for field in ("first_name", "last_name", "email", "mobile_number", "job_title"):
            if params.get(field) is not None:
                update[field] = params[field]
        r = await request_with_rate_limit(
            client, "PUT", f"{base}/contacts/{contact_id}", headers=headers, json={"contact": update}
        )
        _raise_for_status(r, "update_contact")
        return {"contact": r.json().get("contact")}

    async def _list_deals(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        r = await request_with_rate_limit(client, "GET", f"{base}/deals", headers=headers, params={"per_page": int(params.get("limit", 50))})
        _raise_for_status(r, "list_deals")
        return {"deals": r.json().get("deals", [])}

    async def _create_deal(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        name = params.get("name")
        if not name:
            raise ConnectorError("MISSING_PARAM", "create_deal requires 'name'")
        body: dict[str, Any] = {"deal": {"name": name}}
        for field in ("amount", "close_date", "owner_id"):
            if params.get(field) is not None:
                body["deal"][field] = params[field]
        r = await request_with_rate_limit(client, "POST", f"{base}/deals", headers=headers, json=body)
        _raise_for_status(r, "create_deal")
        return {"deal": r.json().get("deal")}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Freshsales {operation} failed: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "FRESHSALES_API_ERROR",
            f"Freshsales {operation} failed ({r.status_code}): {r.text[:300]}",
        )
