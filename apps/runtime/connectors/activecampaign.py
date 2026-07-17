"""ActiveCampaign native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit


class ActiveCampaignConnector(IConnector):
    provider = "activecampaign"
    supported_operations = [
        "list_contacts",
        "create_contact",
        "add_tag",
        "list_automations",
        "create_deal",
    ]

    def _base(self, params: dict) -> str:
        account = params.get("account")
        if not account:
            raise ConnectorError("MISSING_PARAM", "ActiveCampaign requires 'account' param")
        return f"https://{account}.api-us1.com/api/3"

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        headers = {
            "Api-Token": access_token,
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_contacts":
                    return await self._list_contacts(client, headers, params)
                case "create_contact":
                    return await self._create_contact(client, headers, params)
                case "add_tag":
                    return await self._add_tag(client, headers, params)
                case "list_automations":
                    return await self._list_automations(client, headers, params)
                case "create_deal":
                    return await self._create_deal(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"ActiveCampaign does not support '{operation}'",
                    )

    async def _list_contacts(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        base = self._base(params)
        limit = int(params.get("limit", 20))
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{base}/contacts",
            headers=headers,
            params={"limit": limit},
        )
        _raise_for_status(r, "list_contacts")
        return {"contacts": r.json().get("contacts", [])}

    async def _create_contact(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        base = self._base(params)
        email = params.get("email")
        if not email:
            raise ConnectorError("MISSING_PARAM", "create_contact requires 'email'")
        contact: dict[str, Any] = {"email": email}
        for field in ("firstName", "lastName", "phone"):
            if params.get(field):
                contact[field] = params[field]
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{base}/contacts",
            headers=headers,
            json={"contact": contact},
        )
        _raise_for_status(r, "create_contact")
        return r.json().get("contact", {})

    async def _add_tag(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        base = self._base(params)
        contact_id = params.get("contact_id")
        tag_id = params.get("tag_id")
        if not contact_id or not tag_id:
            raise ConnectorError("MISSING_PARAM", "add_tag requires 'contact_id' and 'tag_id'")
        body = {"contactTag": {"contact": contact_id, "tag": tag_id}}
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{base}/contactTags",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "add_tag")
        return r.json().get("contactTag", {})

    async def _list_automations(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        base = self._base(params)
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{base}/automations",
            headers=headers,
        )
        _raise_for_status(r, "list_automations")
        return {"automations": r.json().get("automations", [])}

    async def _create_deal(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        base = self._base(params)
        title = params.get("title")
        if not title:
            raise ConnectorError("MISSING_PARAM", "create_deal requires 'title'")
        deal: dict[str, Any] = {"title": title}
        for field in ("value", "currency", "owner", "pipeline", "stage", "contact"):
            if params.get(field) is not None:
                deal[field] = params[field]
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{base}/deals",
            headers=headers,
            json={"deal": deal},
        )
        _raise_for_status(r, "create_deal")
        return r.json().get("deal", {})


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"ActiveCampaign {operation}: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "ACTIVECAMPAIGN_ERROR",
            f"ActiveCampaign {operation} ({r.status_code}): {r.text[:300]}",
        )
