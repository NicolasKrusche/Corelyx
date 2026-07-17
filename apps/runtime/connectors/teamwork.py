"""Teamwork native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit


class TeamworkConnector(IConnector):
    provider = "teamwork"
    supported_operations = [
        "list_projects",
        "list_tasks",
        "create_task",
        "update_task",
        "list_milestones",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        domain = params.get("domain", "")
        if not domain:
            raise ConnectorError("MISSING_PARAM", "Teamwork requires 'domain' param (e.g. 'mycompany')")
        base = f"https://{domain}.teamwork.com/projects/api/v3"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_projects":
                    return await self._list_projects(client, headers, params, base)
                case "list_tasks":
                    return await self._list_tasks(client, headers, params, base)
                case "create_task":
                    return await self._create_task(client, headers, params, base)
                case "update_task":
                    return await self._update_task(client, headers, params, base)
                case "list_milestones":
                    return await self._list_milestones(client, headers, params, base)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Teamwork does not support operation '{operation}'",
                    )

    async def _list_projects(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        r = await request_with_rate_limit(
            client, "GET", f"{base}/projects.json", headers=headers, params={"pageSize": int(params.get("limit", 50))}
        )
        _raise_for_status(r, "list_projects")
        return {"projects": r.json().get("projects", [])}

    async def _list_tasks(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        project_id = params.get("project_id")
        url = f"{base}/projects/{project_id}/tasks.json" if project_id else f"{base}/tasks.json"
        r = await request_with_rate_limit(client, "GET", url, headers=headers)
        _raise_for_status(r, "list_tasks")
        return {"tasks": r.json().get("tasks", [])}

    async def _create_task(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        tasklist_id = params.get("tasklist_id")
        content = params.get("content")
        if not tasklist_id or not content:
            raise ConnectorError("MISSING_PARAM", "create_task requires 'tasklist_id' and 'content'")
        body: dict[str, Any] = {"todo-item": {"content": content}}
        if params.get("due_date"):
            body["todo-item"]["due-date"] = params["due_date"]
        r = await request_with_rate_limit(
            client, "POST", f"{base}/tasklists/{tasklist_id}/tasks.json", headers=headers, json=body
        )
        _raise_for_status(r, "create_task")
        return {"task_id": r.headers.get("id"), "status": "created"}

    async def _update_task(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        task_id = params.get("task_id")
        if not task_id:
            raise ConnectorError("MISSING_PARAM", "update_task requires 'task_id'")
        item: dict[str, Any] = {}
        if params.get("content"):
            item["content"] = params["content"]
        if params.get("status"):
            item["status"] = params["status"]
        if params.get("due_date"):
            item["due-date"] = params["due_date"]
        r = await request_with_rate_limit(
            client, "PUT", f"{base}/tasks/{task_id}.json", headers=headers, json={"todo-item": item}
        )
        _raise_for_status(r, "update_task")
        return {"updated": True, "task_id": task_id}

    async def _list_milestones(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        project_id = params.get("project_id")
        url = f"{base}/projects/{project_id}/milestones.json" if project_id else f"{base}/milestones.json"
        r = await request_with_rate_limit(client, "GET", url, headers=headers)
        _raise_for_status(r, "list_milestones")
        return {"milestones": r.json().get("milestones", [])}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Teamwork {operation} failed: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "TEAMWORK_API_ERROR",
            f"Teamwork {operation} failed ({r.status_code}): {r.text[:300]}",
        )
