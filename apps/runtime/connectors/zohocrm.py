"""Zoho CRM native connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://www.zohoapis.com/crm/v3"


class ZohoCRMConnector(IConnector):
    provider = "zohocrm"
    supported_operations = [
        "list_contacts",
        "create_contact",
        "update_contact",
        "list_leads",
        "create_deal",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        headers = {
            "Authorization": f"Zoho-oauthtoken {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_contacts":
                    return await self._list_records(client, headers, params, "Contacts")
                case "create_contact":
                    return await self._create_record(client, headers, params, "Contacts")
                case "update_contact":
                    return await self._update_record(client, headers, params, "Contacts")
                case "list_leads":
                    return await self._list_records(client, headers, params, "Leads")
                case "create_deal":
                    return await self._create_record(client, headers, params, "Deals")
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Zoho CRM does not support operation '{operation}'",
                    )

    async def _list_records(
        self, client: httpx.AsyncClient, headers: dict, params: dict, module: str
    ) -> dict:
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/{module}", headers=headers,
            params={"per_page": int(params.get("limit", 50))}
        )
        _raise_for_status(r, f"list_{module.lower()}")
        return {"records": r.json().get("data", [])}

    async def _create_record(
        self, client: httpx.AsyncClient, headers: dict, params: dict, module: str
    ) -> dict:
        fields = params.get("fields")
        if not fields:
            raise ConnectorError("MISSING_PARAM", f"create_{module.lower()} requires 'fields'")
        body = {"data": [fields]}
        r = await request_with_rate_limit(client, "POST", f"{_BASE}/{module}", headers=headers, json=body)
        _raise_for_status(r, f"create_{module.lower()}")
        data = r.json()
        results = data.get("data", [{}])
        return {"id": results[0].get("details", {}).get("id"), "status": results[0].get("status")}

    async def _update_record(
        self, client: httpx.AsyncClient, headers: dict, params: dict, module: str
    ) -> dict:
        record_id = params.get("record_id")
        fields = params.get("fields")
        if not record_id or not fields:
            raise ConnectorError("MISSING_PARAM", "update_contact requires 'record_id' and 'fields'")
        fields["id"] = record_id
        body = {"data": [fields]}
        r = await request_with_rate_limit(client, "PUT", f"{_BASE}/{module}", headers=headers, json=body)
        _raise_for_status(r, f"update_{module.lower()}")
        return {"updated": True, "record_id": record_id}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Zoho CRM {operation} failed: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "ZOHOCRM_API_ERROR",
            f"Zoho CRM {operation} failed ({r.status_code}): {r.text[:300]}",
        )
