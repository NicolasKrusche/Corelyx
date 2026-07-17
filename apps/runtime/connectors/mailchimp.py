"""Mailchimp native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://us1.api.mailchimp.com/3.0"


class MailchimpConnector(IConnector):
    provider = "mailchimp"
    supported_operations = [
        "list_audiences",
        "add_member",
        "update_member",
        "list_campaigns",
        "send_campaign",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        # Use api_endpoint from metadata/params if provided (datacenter-specific)
        base = params.get("api_endpoint", _BASE)
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_audiences":
                    return await self._list_audiences(client, headers, params, base)
                case "add_member":
                    return await self._add_member(client, headers, params, base)
                case "update_member":
                    return await self._update_member(client, headers, params, base)
                case "list_campaigns":
                    return await self._list_campaigns(client, headers, params, base)
                case "send_campaign":
                    return await self._send_campaign(client, headers, params, base)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Mailchimp does not support '{operation}'",
                    )

    async def _list_audiences(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        count = int(params.get("count", 10))
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{base}/lists",
            headers=headers,
            params={"count": count},
        )
        _raise_for_status(r, "list_audiences")
        data = r.json()
        return {"audiences": data.get("lists", []), "total_items": data.get("total_items", 0)}

    async def _add_member(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        list_id = params.get("list_id")
        email = params.get("email")
        if not list_id or not email:
            raise ConnectorError("MISSING_PARAM", "add_member requires 'list_id' and 'email'")
        body: dict[str, Any] = {
            "email_address": email,
            "status": params.get("status", "subscribed"),
        }
        if params.get("merge_fields"):
            body["merge_fields"] = params["merge_fields"]
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{base}/lists/{list_id}/members",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "add_member")
        return r.json()

    async def _update_member(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        list_id = params.get("list_id")
        subscriber_hash = params.get("subscriber_hash")
        if not list_id or not subscriber_hash:
            raise ConnectorError("MISSING_PARAM", "update_member requires 'list_id' and 'subscriber_hash'")
        body: dict[str, Any] = {}
        for field in ("status", "merge_fields", "tags"):
            if params.get(field):
                body[field] = params[field]
        r = await request_with_rate_limit(
            client,
            "PATCH",
            f"{base}/lists/{list_id}/members/{subscriber_hash}",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "update_member")
        return r.json()

    async def _list_campaigns(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        count = int(params.get("count", 10))
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{base}/campaigns",
            headers=headers,
            params={"count": count},
        )
        _raise_for_status(r, "list_campaigns")
        data = r.json()
        return {"campaigns": data.get("campaigns", []), "total_items": data.get("total_items", 0)}

    async def _send_campaign(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        campaign_id = params.get("campaign_id")
        if not campaign_id:
            raise ConnectorError("MISSING_PARAM", "send_campaign requires 'campaign_id'")
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{base}/campaigns/{campaign_id}/actions/send",
            headers=headers,
            json={},
        )
        _raise_for_status(r, "send_campaign")
        return {"sent": True, "campaign_id": campaign_id}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Mailchimp {operation}: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "MAILCHIMP_ERROR",
            f"Mailchimp {operation} ({r.status_code}): {r.text[:300]}",
        )
