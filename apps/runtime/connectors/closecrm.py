"""Close CRM native connector."""

from __future__ import annotations

import base64
from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.close.com/api/v1"


class CloseCRMConnector(IConnector):
    provider = "closecrm"
    supported_operations = [
        "list_leads",
        "create_lead",
        "update_lead",
        "list_contacts",
        "create_activity",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        # Close CRM uses HTTP Basic with API key as username, empty password
        credentials = base64.b64encode(f"{access_token}:".encode()).decode()
        headers = {
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_leads":
                    return await self._list_leads(client, headers, params)
                case "create_lead":
                    return await self._create_lead(client, headers, params)
                case "update_lead":
                    return await self._update_lead(client, headers, params)
                case "list_contacts":
                    return await self._list_contacts(client, headers, params)
                case "create_activity":
                    return await self._create_activity(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Close CRM does not support operation '{operation}'",
                    )

    async def _list_leads(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/lead/", headers=headers, params={"_limit": int(params.get("limit", 50))}
        )
        _raise_for_status(r, "list_leads")
        data = r.json()
        return {"leads": data.get("data", []), "total": data.get("total_results")}

    async def _create_lead(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        name = params.get("name")
        if not name:
            raise ConnectorError("MISSING_PARAM", "create_lead requires 'name'")
        body: dict[str, Any] = {"name": name}
        for field in ("description", "url", "status_id"):
            if params.get(field) is not None:
                body[field] = params[field]
        if params.get("contacts"):
            body["contacts"] = params["contacts"]
        r = await request_with_rate_limit(client, "POST", f"{_BASE}/lead/", headers=headers, json=body)
        _raise_for_status(r, "create_lead")
        return {"lead": r.json()}

    async def _update_lead(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        lead_id = params.get("lead_id")
        if not lead_id:
            raise ConnectorError("MISSING_PARAM", "update_lead requires 'lead_id'")
        body: dict[str, Any] = {}
        for field in ("name", "description", "status_id", "url"):
            if params.get(field) is not None:
                body[field] = params[field]
        r = await request_with_rate_limit(client, "PUT", f"{_BASE}/lead/{lead_id}/", headers=headers, json=body)
        _raise_for_status(r, "update_lead")
        return {"lead": r.json()}

    async def _list_contacts(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/contact/", headers=headers, params={"_limit": int(params.get("limit", 50))}
        )
        _raise_for_status(r, "list_contacts")
        data = r.json()
        return {"contacts": data.get("data", [])}

    async def _create_activity(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        lead_id = params.get("lead_id")
        activity_type = params.get("activity_type", "Note")
        note = params.get("note", "")
        if not lead_id:
            raise ConnectorError("MISSING_PARAM", "create_activity requires 'lead_id'")
        body: dict[str, Any] = {"lead_id": lead_id, "note": note}
        url_map = {
            "Note": f"{_BASE}/activity/note/",
            "Call": f"{_BASE}/activity/call/",
            "Email": f"{_BASE}/activity/email/",
        }
        url = url_map.get(activity_type, f"{_BASE}/activity/note/")
        r = await request_with_rate_limit(client, "POST", url, headers=headers, json=body)
        _raise_for_status(r, "create_activity")
        return {"activity": r.json()}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Close CRM {operation} failed: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "CLOSECRM_API_ERROR",
            f"Close CRM {operation} failed ({r.status_code}): {r.text[:300]}",
        )
