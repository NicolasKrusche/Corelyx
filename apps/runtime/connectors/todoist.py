"""Todoist native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.todoist.com/rest/v2"


class TodoistConnector(IConnector):
    provider = "todoist"
    supported_operations = [
        "list_tasks",
        "create_task",
        "complete_task",
        "list_projects",
        "update_task",
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
                case "complete_task":
                    return await self._complete_task(client, headers, params)
                case "list_projects":
                    return await self._list_projects(client, headers, params)
                case "update_task":
                    return await self._update_task(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Todoist does not support operation '{operation}'",
                    )

    async def _list_tasks(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        query_params: dict[str, Any] = {}
        if params.get("project_id"):
            query_params["project_id"] = params["project_id"]
        if params.get("filter"):
            query_params["filter"] = params["filter"]
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/tasks", headers=headers, params=query_params)
        _raise_for_status(r, "list_tasks")
        return {"tasks": r.json()}

    async def _create_task(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        content = params.get("content")
        if not content:
            raise ConnectorError("MISSING_PARAM", "create_task requires 'content'")
        body: dict[str, Any] = {"content": content}
        for field in ("description", "project_id", "due_string", "due_date", "priority", "labels"):
            if params.get(field) is not None:
                body[field] = params[field]
        r = await request_with_rate_limit(client, "POST", f"{_BASE}/tasks", headers=headers, json=body)
        _raise_for_status(r, "create_task")
        data = r.json()
        return {"id": data.get("id"), "url": data.get("url"), "content": data.get("content")}

    async def _complete_task(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        task_id = params.get("task_id")
        if not task_id:
            raise ConnectorError("MISSING_PARAM", "complete_task requires 'task_id'")
        r = await request_with_rate_limit(client, "POST", f"{_BASE}/tasks/{task_id}/close", headers=headers)
        _raise_for_status(r, "complete_task")
        return {"completed": True, "task_id": task_id}

    async def _list_projects(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/projects", headers=headers)
        _raise_for_status(r, "list_projects")
        return {"projects": r.json()}

    async def _update_task(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        task_id = params.get("task_id")
        if not task_id:
            raise ConnectorError("MISSING_PARAM", "update_task requires 'task_id'")
        body: dict[str, Any] = {}
        for field in ("content", "description", "due_string", "due_date", "priority", "labels"):
            if params.get(field) is not None:
                body[field] = params[field]
        r = await request_with_rate_limit(client, "POST", f"{_BASE}/tasks/{task_id}", headers=headers, json=body)
        _raise_for_status(r, "update_task")
        return {"updated": True, "task_id": task_id}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Todoist {operation} failed: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "TODOIST_API_ERROR",
            f"Todoist {operation} failed ({r.status_code}): {r.text[:300]}",
        )
