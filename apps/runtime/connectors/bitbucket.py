"""Bitbucket native connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.bitbucket.org/2.0"


class BitbucketConnector(IConnector):
    provider = "bitbucket"
    supported_operations = [
        "list_repos",
        "list_pull_requests",
        "create_pull_request",
        "list_issues",
        "create_issue",
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
                case "list_repos":
                    return await self._list_repos(client, headers, params)
                case "list_pull_requests":
                    return await self._list_pull_requests(client, headers, params)
                case "create_pull_request":
                    return await self._create_pull_request(client, headers, params)
                case "list_issues":
                    return await self._list_issues(client, headers, params)
                case "create_issue":
                    return await self._create_issue(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Bitbucket does not support '{operation}'",
                    )

    async def _list_repos(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        workspace = params.get("workspace")
        if not workspace:
            raise ConnectorError("MISSING_PARAM", "list_repos requires 'workspace'")
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/repositories/{workspace}",
            headers=headers,
            params={"pagelen": int(params.get("pagelen", 20))},
        )
        _raise_for_status(r, "list_repos")
        data = r.json()
        return {
            "repos": [
                {
                    "slug": repo["slug"],
                    "full_name": repo["full_name"],
                    "is_private": repo["is_private"],
                    "language": repo.get("language"),
                    "updated_on": repo.get("updated_on"),
                }
                for repo in data.get("values", [])
            ]
        }

    async def _list_pull_requests(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        workspace = params.get("workspace")
        repo_slug = params.get("repo_slug")
        if not workspace or not repo_slug:
            raise ConnectorError(
                "MISSING_PARAM",
                "list_pull_requests requires 'workspace' and 'repo_slug'",
            )
        state = params.get("state", "OPEN")
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/repositories/{workspace}/{repo_slug}/pullrequests",
            headers=headers,
            params={"state": state},
        )
        _raise_for_status(r, "list_pull_requests")
        data = r.json()
        return {
            "pull_requests": [
                {
                    "id": pr["id"],
                    "title": pr["title"],
                    "state": pr["state"],
                    "author": pr["author"]["display_name"],
                    "source_branch": pr["source"]["branch"]["name"],
                    "destination_branch": pr["destination"]["branch"]["name"],
                    "created_on": pr["created_on"],
                    "links": pr["links"]["html"]["href"],
                }
                for pr in data.get("values", [])
            ]
        }

    async def _create_pull_request(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        workspace = params.get("workspace")
        repo_slug = params.get("repo_slug")
        title = params.get("title")
        source_branch = params.get("source_branch")
        destination_branch = params.get("destination_branch", "main")
        if not workspace or not repo_slug or not title or not source_branch:
            raise ConnectorError(
                "MISSING_PARAM",
                "create_pull_request requires 'workspace', 'repo_slug', 'title', 'source_branch'",
            )
        body: dict[str, Any] = {
            "title": title,
            "source": {"branch": {"name": source_branch}},
            "destination": {"branch": {"name": destination_branch}},
        }
        if params.get("description"):
            body["description"] = params["description"]
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/repositories/{workspace}/{repo_slug}/pullrequests",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "create_pull_request")
        result = r.json()
        return {
            "id": result["id"],
            "title": result["title"],
            "state": result["state"],
            "url": result["links"]["html"]["href"],
        }

    async def _list_issues(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        workspace = params.get("workspace")
        repo_slug = params.get("repo_slug")
        if not workspace or not repo_slug:
            raise ConnectorError(
                "MISSING_PARAM", "list_issues requires 'workspace' and 'repo_slug'"
            )
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/repositories/{workspace}/{repo_slug}/issues",
            headers=headers,
            params={"pagelen": int(params.get("pagelen", 20))},
        )
        _raise_for_status(r, "list_issues")
        data = r.json()
        return {
            "issues": [
                {
                    "id": issue["id"],
                    "title": issue["title"],
                    "status": issue["status"],
                    "priority": issue["priority"],
                    "created_on": issue["created_on"],
                }
                for issue in data.get("values", [])
            ]
        }

    async def _create_issue(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        workspace = params.get("workspace")
        repo_slug = params.get("repo_slug")
        title = params.get("title")
        if not workspace or not repo_slug or not title:
            raise ConnectorError(
                "MISSING_PARAM",
                "create_issue requires 'workspace', 'repo_slug', and 'title'",
            )
        body: dict[str, Any] = {"title": title}
        if params.get("content"):
            body["content"] = {"raw": params["content"]}
        if params.get("priority"):
            body["priority"] = params["priority"]
        if params.get("kind"):
            body["kind"] = params["kind"]
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/repositories/{workspace}/{repo_slug}/issues",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "create_issue")
        result = r.json()
        return {
            "id": result["id"],
            "title": result["title"],
            "status": result["status"],
        }


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Bitbucket {operation}: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "BITBUCKET_ERROR",
            f"Bitbucket {operation} ({r.status_code}): {r.text[:300]}",
        )
