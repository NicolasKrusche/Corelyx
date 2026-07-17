"""GitLab native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://gitlab.com/api/v4"


class GitLabConnector(IConnector):
    provider = "gitlab"
    supported_operations = [
        "list_projects",
        "list_issues",
        "create_issue",
        "list_merge_requests",
        "create_merge_request",
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
                case "list_projects":
                    return await self._list_projects(client, headers, params)
                case "list_issues":
                    return await self._list_issues(client, headers, params)
                case "create_issue":
                    return await self._create_issue(client, headers, params)
                case "list_merge_requests":
                    return await self._list_merge_requests(client, headers, params)
                case "create_merge_request":
                    return await self._create_merge_request(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"GitLab does not support '{operation}'",
                    )

    async def _list_projects(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        per_page = int(params.get("per_page", 20))
        page = int(params.get("page", 1))
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/projects",
            headers=headers,
            params={"membership": True, "per_page": per_page, "page": page},
        )
        _raise_for_status(r, "list_projects")
        projects = r.json()
        return {
            "projects": [
                {
                    "id": p["id"],
                    "name": p["name"],
                    "path_with_namespace": p["path_with_namespace"],
                    "web_url": p["web_url"],
                    "default_branch": p.get("default_branch"),
                }
                for p in projects
            ]
        }

    async def _list_issues(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        project_id = params.get("project_id")
        if not project_id:
            raise ConnectorError("MISSING_PARAM", "list_issues requires 'project_id'")
        state = params.get("state", "opened")
        per_page = int(params.get("per_page", 20))
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/projects/{project_id}/issues",
            headers=headers,
            params={"state": state, "per_page": per_page},
        )
        _raise_for_status(r, "list_issues")
        issues = r.json()
        return {
            "issues": [
                {
                    "id": i["id"],
                    "iid": i["iid"],
                    "title": i["title"],
                    "state": i["state"],
                    "web_url": i["web_url"],
                    "created_at": i["created_at"],
                }
                for i in issues
            ]
        }

    async def _create_issue(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        project_id = params.get("project_id")
        title = params.get("title")
        if not project_id or not title:
            raise ConnectorError("MISSING_PARAM", "create_issue requires 'project_id' and 'title'")
        body: dict[str, Any] = {"title": title}
        if params.get("description"):
            body["description"] = params["description"]
        if params.get("labels"):
            body["labels"] = params["labels"]
        if params.get("assignee_ids"):
            body["assignee_ids"] = params["assignee_ids"]
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/projects/{project_id}/issues",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "create_issue")
        result = r.json()
        return {
            "id": result["id"],
            "iid": result["iid"],
            "title": result["title"],
            "web_url": result["web_url"],
        }

    async def _list_merge_requests(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        project_id = params.get("project_id")
        if not project_id:
            raise ConnectorError("MISSING_PARAM", "list_merge_requests requires 'project_id'")
        state = params.get("state", "opened")
        per_page = int(params.get("per_page", 20))
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/projects/{project_id}/merge_requests",
            headers=headers,
            params={"state": state, "per_page": per_page},
        )
        _raise_for_status(r, "list_merge_requests")
        mrs = r.json()
        return {
            "merge_requests": [
                {
                    "id": mr["id"],
                    "iid": mr["iid"],
                    "title": mr["title"],
                    "state": mr["state"],
                    "web_url": mr["web_url"],
                    "source_branch": mr["source_branch"],
                    "target_branch": mr["target_branch"],
                }
                for mr in mrs
            ]
        }

    async def _create_merge_request(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        project_id = params.get("project_id")
        title = params.get("title")
        source_branch = params.get("source_branch")
        target_branch = params.get("target_branch")
        if not project_id or not title or not source_branch or not target_branch:
            raise ConnectorError(
                "MISSING_PARAM",
                "create_merge_request requires 'project_id', 'title', 'source_branch', 'target_branch'",
            )
        body: dict[str, Any] = {
            "title": title,
            "source_branch": source_branch,
            "target_branch": target_branch,
        }
        if params.get("description"):
            body["description"] = params["description"]
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/projects/{project_id}/merge_requests",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "create_merge_request")
        result = r.json()
        return {
            "id": result["id"],
            "iid": result["iid"],
            "title": result["title"],
            "web_url": result["web_url"],
            "state": result["state"],
        }


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"GitLab {operation}: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "GITLAB_ERROR",
            f"GitLab {operation} ({r.status_code}): {r.text[:300]}",
        )
