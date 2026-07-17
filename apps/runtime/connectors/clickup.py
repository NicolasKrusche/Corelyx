"""ClickUp native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.clickup.com/api/v2"


class ClickUpConnector(IConnector):
    provider = "clickup"
    supported_operations = [
        "list_tasks",
        "create_task",
        "update_task",
        "list_spaces",
        "list_folders",
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
                case "list_spaces":
                    return await self._list_spaces(client, headers, params)
                case "list_folders":
                    return await self._list_folders(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"ClickUp does not support operation '{operation}'",
                    )

    async def _list_tasks(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        list_id = params.get("list_id")
        if not list_id:
            raise ConnectorError("MISSING_PARAM", "list_tasks requires 'list_id'")
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/list/{list_id}/task", headers=headers, params={"page": params.get("page", 0)}
        )
        _raise_for_status(r, "list_tasks")
        data = r.json()
        return {"tasks": data.get("tasks", [])}

    async def _create_task(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        list_id = params.get("list_id")
        name = params.get("name")
        if not list_id or not name:
            raise ConnectorError("MISSING_PARAM", "create_task requires 'list_id' and 'name'")
        body: dict[str, Any] = {"name": name}
        for field in ("description", "priority", "due_date", "assignees"):
            if params.get(field) is not None:
                body[field] = params[field]
        r = await request_with_rate_limit(client, "POST", f"{_BASE}/list/{list_id}/task", headers=headers, json=body)
        _raise_for_status(r, "create_task")
        data = r.json()
        return {"id": data.get("id"), "url": data.get("url"), "name": data.get("name")}

    async def _update_task(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        task_id = params.get("task_id")
        if not task_id:
            raise ConnectorError("MISSING_PARAM", "update_task requires 'task_id'")
        body: dict[str, Any] = {}
        for field in ("name", "description", "priority", "status", "due_date"):
            if params.get(field) is not None:
                body[field] = params[field]
        r = await request_with_rate_limit(client, "PUT", f"{_BASE}/task/{task_id}", headers=headers, json=body)
        _raise_for_status(r, "update_task")
        return {"updated": True, "task_id": task_id}

    async def _list_spaces(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        team_id = params.get("team_id")
        if not team_id:
            # fetch team id from authorized user
            r = await request_with_rate_limit(client, "GET", f"{_BASE}/team", headers=headers)
            _raise_for_status(r, "get_teams")
            teams = r.json().get("teams", [])
            if not teams:
                raise ConnectorError("CLICKUP_NO_TEAMS", "No ClickUp teams found for this user")
            team_id = teams[0]["id"]
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/team/{team_id}/space", headers=headers, params={"archived": False}
        )
        _raise_for_status(r, "list_spaces")
        return {"spaces": r.json().get("spaces", [])}

    async def _list_folders(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        space_id = params.get("space_id")
        if not space_id:
            raise ConnectorError("MISSING_PARAM", "list_folders requires 'space_id'")
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/space/{space_id}/folder", headers=headers, params={"archived": False}
        )
        _raise_for_status(r, "list_folders")
        return {"folders": r.json().get("folders", [])}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"ClickUp {operation} failed: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "CLICKUP_API_ERROR",
            f"ClickUp {operation} failed ({r.status_code}): {r.text[:300]}",
        )
