"""Wrike native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://www.wrike.com/api/v4"


class WrikeConnector(IConnector):
    provider = "wrike"
    supported_operations = [
        "list_tasks",
        "create_task",
        "update_task",
        "list_folders",
        "list_projects",
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
                case "list_tasks":
                    return await self._list_tasks(client, headers, params)
                case "create_task":
                    return await self._create_task(client, headers, params)
                case "update_task":
                    return await self._update_task(client, headers, params)
                case "list_folders":
                    return await self._list_folders(client, headers, params)
                case "list_projects":
                    return await self._list_projects(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Wrike does not support operation '{operation}'",
                    )

    async def _list_tasks(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        folder_id = params.get("folder_id")
        url = f"{_BASE}/folders/{folder_id}/tasks" if folder_id else f"{_BASE}/tasks"
        r = await request_with_rate_limit(client, "GET", url, headers=headers)
        _raise_for_status(r, "list_tasks")
        data = r.json()
        return {"tasks": data.get("data", [])}

    async def _create_task(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        folder_id = params.get("folder_id")
        title = params.get("title")
        if not folder_id or not title:
            raise ConnectorError("MISSING_PARAM", "create_task requires 'folder_id' and 'title'")
        body: dict[str, Any] = {"title": title}
        for field in ("description", "status", "importance", "dates"):
            if params.get(field) is not None:
                body[field] = params[field]
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/folders/{folder_id}/tasks", headers=headers, json=body
        )
        _raise_for_status(r, "create_task")
        data = r.json()
        tasks = data.get("data", [])
        return {"task": tasks[0] if tasks else {}}

    async def _update_task(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        task_id = params.get("task_id")
        if not task_id:
            raise ConnectorError("MISSING_PARAM", "update_task requires 'task_id'")
        body: dict[str, Any] = {}
        for field in ("title", "description", "status", "importance"):
            if params.get(field) is not None:
                body[field] = params[field]
        r = await request_with_rate_limit(client, "PUT", f"{_BASE}/tasks/{task_id}", headers=headers, json=body)
        _raise_for_status(r, "update_task")
        data = r.json()
        tasks = data.get("data", [])
        return {"task": tasks[0] if tasks else {}}

    async def _list_folders(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/folders", headers=headers)
        _raise_for_status(r, "list_folders")
        return {"folders": r.json().get("data", [])}

    async def _list_projects(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/folders", headers=headers, params={"project": True})
        _raise_for_status(r, "list_projects")
        return {"projects": r.json().get("data", [])}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Wrike {operation} failed: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "WRIKE_API_ERROR",
            f"Wrike {operation} failed ({r.status_code}): {r.text[:300]}",
        )
