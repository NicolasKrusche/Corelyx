"""Zoho Projects native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit


class ZohoProjectsConnector(IConnector):
    provider = "zohoprojects"
    supported_operations = [
        "list_projects",
        "list_tasks",
        "create_task",
        "update_task",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        portal_id = params.get("portal_id")
        if not portal_id:
            raise ConnectorError("MISSING_PARAM", "Zoho Projects requires 'portal_id' param")
        base = f"https://projectsapi.zoho.com/restapi/portal/{portal_id}/projects"
        headers = {
            "Authorization": f"Zoho-oauthtoken {access_token}",
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
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Zoho Projects does not support operation '{operation}'",
                    )

    async def _list_projects(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        r = await request_with_rate_limit(client, "GET", f"{base}/", headers=headers)
        _raise_for_status(r, "list_projects")
        return {"projects": r.json().get("projects", [])}

    async def _list_tasks(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        project_id = params.get("project_id")
        if not project_id:
            raise ConnectorError("MISSING_PARAM", "list_tasks requires 'project_id'")
        r = await request_with_rate_limit(client, "GET", f"{base}/{project_id}/tasks/", headers=headers)
        _raise_for_status(r, "list_tasks")
        return {"tasks": r.json().get("tasks", [])}

    async def _create_task(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        project_id = params.get("project_id")
        name = params.get("name")
        if not project_id or not name:
            raise ConnectorError("MISSING_PARAM", "create_task requires 'project_id' and 'name'")
        body: dict[str, Any] = {"name": name}
        for field in ("description", "due_date", "priority"):
            if params.get(field) is not None:
                body[field] = params[field]
        r = await request_with_rate_limit(client, "POST", f"{base}/{project_id}/tasks/", headers=headers, json=body)
        _raise_for_status(r, "create_task")
        data = r.json()
        return {"task": data.get("tasks", [{}])[0] if data.get("tasks") else {}}

    async def _update_task(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        project_id = params.get("project_id")
        task_id = params.get("task_id")
        if not project_id or not task_id:
            raise ConnectorError("MISSING_PARAM", "update_task requires 'project_id' and 'task_id'")
        body: dict[str, Any] = {}
        for field in ("name", "description", "status", "priority", "due_date"):
            if params.get(field) is not None:
                body[field] = params[field]
        r = await request_with_rate_limit(
            client, "POST", f"{base}/{project_id}/tasks/{task_id}/", headers=headers, json=body
        )
        _raise_for_status(r, "update_task")
        return {"updated": True, "task_id": task_id}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Zoho Projects {operation} failed: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "ZOHOPROJECTS_API_ERROR",
            f"Zoho Projects {operation} failed ({r.status_code}): {r.text[:300]}",
        )
