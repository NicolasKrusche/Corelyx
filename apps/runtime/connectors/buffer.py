"""Buffer native connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.bufferapp.com/1"


class BufferConnector(IConnector):
    provider = "buffer"
    supported_operations = [
        "create_update",
        "get_profiles",
        "get_pending_updates",
        "analyze_post",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "create_update":
                    return await self._create_update(client, headers, params)
                case "get_profiles":
                    return await self._get_profiles(client, headers, params)
                case "get_pending_updates":
                    return await self._get_pending_updates(client, headers, params)
                case "analyze_post":
                    return await self._analyze_post(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Buffer does not support operation '{operation}'",
                    )

    async def _create_update(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        profile_ids = params.get("profile_ids", [])
        text = params.get("text", "")
        if not profile_ids:
            raise ConnectorError("MISSING_PARAM", "create_update requires 'profile_ids'")
        form_data: dict[str, Any] = {"text": text}
        for i, pid in enumerate(profile_ids):
            form_data[f"profile_ids[{i}]"] = pid
        if params.get("scheduled_at"):
            form_data["scheduled_at"] = params["scheduled_at"]
        if params.get("now") is not None:
            form_data["now"] = str(params["now"]).lower()
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/updates/create.json", headers=headers, data=form_data
        )
        _raise_for_status(r, "create_update")
        data = r.json()
        return {
            "success": data.get("success"),
            "updates": data.get("updates", []),
        }

    async def _get_profiles(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        get_headers = {**headers, "Content-Type": "application/json"}
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/profiles.json", headers=get_headers
        )
        _raise_for_status(r, "get_profiles")
        profiles = r.json()
        return {
            "profiles": [
                {
                    "id": p["id"],
                    "service": p.get("service"),
                    "service_username": p.get("service_username"),
                    "formatted_username": p.get("formatted_username"),
                }
                for p in (profiles if isinstance(profiles, list) else [])
            ]
        }

    async def _get_pending_updates(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        profile_id = params.get("profile_id")
        if not profile_id:
            raise ConnectorError("MISSING_PARAM", "get_pending_updates requires 'profile_id'")
        get_headers = {**headers, "Content-Type": "application/json"}
        query: dict[str, Any] = {"count": int(params.get("count", 10))}
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/profiles/{profile_id}/updates/pending.json",
            headers=get_headers,
            params=query,
        )
        _raise_for_status(r, "get_pending_updates")
        data = r.json()
        return {
            "updates": data.get("updates", []),
            "total": data.get("total", 0),
        }

    async def _analyze_post(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        update_id = params.get("update_id")
        if not update_id:
            raise ConnectorError("MISSING_PARAM", "analyze_post requires 'update_id'")
        get_headers = {**headers, "Content-Type": "application/json"}
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/updates/{update_id}.json",
            headers=get_headers,
        )
        _raise_for_status(r, "analyze_post")
        data = r.json()
        return {
            "update_id": data.get("id"),
            "text": data.get("text"),
            "status": data.get("status"),
            "statistics": data.get("statistics", {}),
        }


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError(
            "TOKEN_EXPIRED",
            f"Buffer {operation} failed: token expired",
        )
    if r.status_code == 403:
        raise ConnectorError(
            "BUFFER_FORBIDDEN",
            f"Buffer {operation} failed: insufficient permissions",
        )
    if r.status_code >= 400:
        raise ConnectorError(
            "BUFFER_API_ERROR",
            f"Buffer {operation} failed ({r.status_code}): {r.text[:300]}",
        )
