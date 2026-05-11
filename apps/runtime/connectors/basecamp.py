"""Basecamp native connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_AUTH_URL = "https://launchpad.37signals.com/authorization.json"


class BasecampConnector(IConnector):
    provider = "basecamp"
    supported_operations = [
        "list_projects",
        "list_todos",
        "create_todo",
        "list_messages",
        "create_message",
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
            "User-Agent": "Corelyx (support@corelyx.app)",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            account_id = params.get("account_id") or await self._get_account_id(client, headers)
            base = f"https://3.basecampapi.com/{account_id}"
            match operation:
                case "list_projects":
                    return await self._list_projects(client, headers, params, base)
                case "list_todos":
                    return await self._list_todos(client, headers, params, base)
                case "create_todo":
                    return await self._create_todo(client, headers, params, base)
                case "list_messages":
                    return await self._list_messages(client, headers, params, base)
                case "create_message":
                    return await self._create_message(client, headers, params, base)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Basecamp does not support operation '{operation}'",
                    )

    async def _get_account_id(self, client: httpx.AsyncClient, headers: dict) -> str:
        r = await request_with_rate_limit(client, "GET", _AUTH_URL, headers=headers)
        _raise_for_status(r, "get_account_id")
        data = r.json()
        accounts = data.get("accounts", [])
        if not accounts:
            raise ConnectorError("BASECAMP_NO_ACCOUNTS", "No Basecamp accounts found")
        return str(accounts[0]["id"])

    async def _list_projects(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        r = await request_with_rate_limit(client, "GET", f"{base}/projects.json", headers=headers)
        _raise_for_status(r, "list_projects")
        return {"projects": r.json()}

    async def _list_todos(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        project_id = params.get("project_id")
        todolist_id = params.get("todolist_id")
        if not project_id or not todolist_id:
            raise ConnectorError("MISSING_PARAM", "list_todos requires 'project_id' and 'todolist_id'")
        r = await request_with_rate_limit(
            client, "GET", f"{base}/buckets/{project_id}/todolists/{todolist_id}/todos.json", headers=headers
        )
        _raise_for_status(r, "list_todos")
        return {"todos": r.json()}

    async def _create_todo(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        project_id = params.get("project_id")
        todolist_id = params.get("todolist_id")
        content = params.get("content")
        if not project_id or not todolist_id or not content:
            raise ConnectorError("MISSING_PARAM", "create_todo requires 'project_id', 'todolist_id', 'content'")
        body: dict[str, Any] = {"content": content}
        if params.get("description"):
            body["description"] = params["description"]
        if params.get("due_on"):
            body["due_on"] = params["due_on"]
        r = await request_with_rate_limit(
            client, "POST", f"{base}/buckets/{project_id}/todolists/{todolist_id}/todos.json", headers=headers, json=body
        )
        _raise_for_status(r, "create_todo")
        data = r.json()
        return {"id": data.get("id"), "url": data.get("app_url"), "content": data.get("content")}

    async def _list_messages(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        project_id = params.get("project_id")
        message_board_id = params.get("message_board_id")
        if not project_id or not message_board_id:
            raise ConnectorError("MISSING_PARAM", "list_messages requires 'project_id' and 'message_board_id'")
        r = await request_with_rate_limit(
            client, "GET", f"{base}/buckets/{project_id}/message_boards/{message_board_id}/messages.json", headers=headers
        )
        _raise_for_status(r, "list_messages")
        return {"messages": r.json()}

    async def _create_message(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        project_id = params.get("project_id")
        message_board_id = params.get("message_board_id")
        subject = params.get("subject")
        if not project_id or not message_board_id or not subject:
            raise ConnectorError("MISSING_PARAM", "create_message requires 'project_id', 'message_board_id', 'subject'")
        body: dict[str, Any] = {"subject": subject}
        if params.get("content"):
            body["content"] = params["content"]
        r = await request_with_rate_limit(
            client, "POST", f"{base}/buckets/{project_id}/message_boards/{message_board_id}/messages.json",
            headers=headers, json=body
        )
        _raise_for_status(r, "create_message")
        data = r.json()
        return {"id": data.get("id"), "url": data.get("app_url"), "subject": data.get("subject")}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Basecamp {operation} failed: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "BASECAMP_API_ERROR",
            f"Basecamp {operation} failed ({r.status_code}): {r.text[:300]}",
        )
