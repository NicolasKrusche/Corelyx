"""Height native connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.height.app"


class HeightConnector(IConnector):
    provider = "height"
    supported_operations = [
        "list_tasks",
        "create_task",
        "update_task",
        "list_lists",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        headers = {
            "Authorization": f"api-key {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_tasks":
                    return await self._list_tasks(client, headers, params)
                case "create_task":
                    return await self._create_task(client, headers, params)
                case "update_task":
                    return await self._update_task(client, headers, params)
                case "list_lists":
                    return await self._list_lists(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Height does not support operation '{operation}'",
                    )

    async def _list_tasks(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/tasks", headers=headers)
        _raise_for_status(r, "list_tasks")
        return {"tasks": r.json().get("list", [])}

    async def _create_task(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        name = params.get("name")
        if not name:
            raise ConnectorError("MISSING_PARAM", "create_task requires 'name'")
        body: dict[str, Any] = {"name": name}
        if params.get("list_ids"):
            body["listIds"] = params["list_ids"]
        if params.get("description"):
            body["description"] = params["description"]
        r = await request_with_rate_limit(client, "POST", f"{_BASE}/tasks", headers=headers, json=body)
        _raise_for_status(r, "create_task")
        return {"task": r.json()}

    async def _update_task(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        task_id = params.get("task_id")
        if not task_id:
            raise ConnectorError("MISSING_PARAM", "update_task requires 'task_id'")
        body: dict[str, Any] = {}
        for field in ("name", "description", "status", "assigneesIds"):
            if params.get(field) is not None:
                body[field] = params[field]
        r = await request_with_rate_limit(client, "PATCH", f"{_BASE}/tasks/{task_id}", headers=headers, json=body)
        _raise_for_status(r, "update_task")
        return {"task": r.json()}

    async def _list_lists(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/lists", headers=headers)
        _raise_for_status(r, "list_lists")
        return {"lists": r.json().get("list", [])}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Height {operation} failed: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "HEIGHT_API_ERROR",
            f"Height {operation} failed ({r.status_code}): {r.text[:300]}",
        )
