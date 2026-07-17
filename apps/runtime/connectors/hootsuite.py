"""Hootsuite native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://platform.hootsuite.com/v1"


class HootsuiteConnector(IConnector):
    provider = "hootsuite"
    supported_operations = [
        "create_message",
        "list_social_profiles",
        "get_analytics",
        "schedule_post",
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
                case "create_message":
                    return await self._create_message(client, headers, params)
                case "list_social_profiles":
                    return await self._list_social_profiles(client, headers, params)
                case "get_analytics":
                    return await self._get_analytics(client, headers, params)
                case "schedule_post":
                    return await self._create_message(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Hootsuite does not support operation '{operation}'",
                    )

    async def _create_message(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        social_profile_ids = params.get("social_profile_ids", [])
        text = params.get("text", "")
        if not social_profile_ids:
            raise ConnectorError("MISSING_PARAM", "create_message requires 'social_profile_ids'")
        body: dict[str, Any] = {
            "text": text,
            "socialProfileIds": social_profile_ids,
        }
        if params.get("scheduled_send_time"):
            body["scheduledSendTime"] = params["scheduled_send_time"]
        if params.get("media"):
            body["media"] = params["media"]
        r = await request_with_rate_limit(client, "POST", f"{_BASE}/messages", headers=headers, json=body)
        _raise_for_status(r, "create_message")
        data = r.json()
        return {
            "message_id": data.get("data", {}).get("id"),
            "state": data.get("data", {}).get("state"),
            "scheduled_send_time": data.get("data", {}).get("scheduledSendTime"),
        }

    async def _list_social_profiles(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/socialProfiles", headers=headers)
        _raise_for_status(r, "list_social_profiles")
        data = r.json()
        return {
            "profiles": [
                {
                    "id": p["id"],
                    "type": p.get("type"),
                    "social_network_id": p.get("socialNetworkId"),
                    "social_network_username": p.get("socialNetworkUsername"),
                }
                for p in data.get("data", [])
            ]
        }

    async def _get_analytics(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        social_profile_ids = params.get("social_profile_ids", [])
        if not social_profile_ids:
            raise ConnectorError("MISSING_PARAM", "get_analytics requires 'social_profile_ids'")
        body: dict[str, Any] = {
            "socialProfileIds": social_profile_ids,
            "startTime": params.get("start_time", "2024-01-01T00:00:00Z"),
            "endTime": params.get("end_time", "2024-12-31T23:59:59Z"),
        }
        if params.get("metrics"):
            body["metrics"] = params["metrics"]
        r = await request_with_rate_limit(client, "POST", f"{_BASE}/analytics/posts", headers=headers, json=body)
        _raise_for_status(r, "get_analytics")
        data = r.json()
        return {"analytics": data.get("data", [])}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError(
            "TOKEN_EXPIRED",
            f"Hootsuite {operation} failed: token expired",
        )
    if r.status_code == 403:
        raise ConnectorError(
            "HOOTSUITE_FORBIDDEN",
            f"Hootsuite {operation} failed: insufficient permissions",
        )
    if r.status_code >= 400:
        raise ConnectorError(
            "HOOTSUITE_API_ERROR",
            f"Hootsuite {operation} failed ({r.status_code}): {r.text[:300]}",
        )
