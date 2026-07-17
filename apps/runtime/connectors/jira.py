"""Jira native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_ATLASSIAN_BASE = "https://api.atlassian.com"


class JiraConnector(IConnector):
    provider = "jira"
    supported_operations = [
        "list_issues",
        "create_issue",
        "update_issue",
        "list_projects",
        "get_issue",
        "add_comment",
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
            "Accept": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            cloud_id = params.get("cloud_id") or await self._get_cloud_id(client, headers)
            base = f"{_ATLASSIAN_BASE}/ex/jira/{cloud_id}/rest/api/3"
            match operation:
                case "list_issues":
                    return await self._list_issues(client, headers, params, base)
                case "create_issue":
                    return await self._create_issue(client, headers, params, base)
                case "update_issue":
                    return await self._update_issue(client, headers, params, base)
                case "list_projects":
                    return await self._list_projects(client, headers, params, base)
                case "get_issue":
                    return await self._get_issue(client, headers, params, base)
                case "add_comment":
                    return await self._add_comment(client, headers, params, base)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Jira does not support operation '{operation}'",
                    )

    async def _get_cloud_id(self, client: httpx.AsyncClient, headers: dict) -> str:
        r = await request_with_rate_limit(
            client, "GET", f"{_ATLASSIAN_BASE}/oauth/token/accessible-resources", headers=headers
        )
        _raise_for_status(r, "get_cloud_id")
        resources = r.json()
        if not resources:
            raise ConnectorError("JIRA_NO_SITES", "No accessible Jira sites found")
        return resources[0]["id"]

    async def _list_issues(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        jql = params.get("jql", "ORDER BY created DESC")
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{base}/search",
            headers=headers,
            params={"jql": jql, "maxResults": int(params.get("limit", 50))},
        )
        _raise_for_status(r, "list_issues")
        data = r.json()
        return {
            "issues": [
                {
                    "id": i["id"],
                    "key": i["key"],
                    "summary": i["fields"].get("summary"),
                    "status": i["fields"].get("status", {}).get("name"),
                    "assignee": (i["fields"].get("assignee") or {}).get("displayName"),
                }
                for i in data.get("issues", [])
            ],
            "total": data.get("total"),
        }

    async def _create_issue(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        project_key = params.get("project_key")
        summary = params.get("summary")
        if not project_key or not summary:
            raise ConnectorError("MISSING_PARAM", "create_issue requires 'project_key' and 'summary'")
        issue_type = params.get("issue_type", "Task")
        body: dict[str, Any] = {
            "fields": {
                "project": {"key": project_key},
                "summary": summary,
                "issuetype": {"name": issue_type},
            }
        }
        if params.get("description"):
            body["fields"]["description"] = {
                "type": "doc",
                "version": 1,
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": params["description"]}]}],
            }
        r = await request_with_rate_limit(client, "POST", f"{base}/issue", headers=headers, json=body)
        _raise_for_status(r, "create_issue")
        data = r.json()
        return {"id": data.get("id"), "key": data.get("key"), "url": data.get("self")}

    async def _update_issue(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        issue_key = params.get("issue_key")
        if not issue_key:
            raise ConnectorError("MISSING_PARAM", "update_issue requires 'issue_key'")
        fields: dict[str, Any] = {}
        if params.get("summary"):
            fields["summary"] = params["summary"]
        if params.get("status"):
            fields["status"] = {"name": params["status"]}
        r = await request_with_rate_limit(
            client, "PUT", f"{base}/issue/{issue_key}", headers=headers, json={"fields": fields}
        )
        _raise_for_status(r, "update_issue")
        return {"updated": True, "issue_key": issue_key}

    async def _list_projects(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{base}/project/search",
            headers=headers,
            params={"maxResults": int(params.get("limit", 50))},
        )
        _raise_for_status(r, "list_projects")
        data = r.json()
        return {"projects": [{"id": p["id"], "key": p["key"], "name": p["name"]} for p in data.get("values", [])]}

    async def _get_issue(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        issue_key = params.get("issue_key")
        if not issue_key:
            raise ConnectorError("MISSING_PARAM", "get_issue requires 'issue_key'")
        r = await request_with_rate_limit(client, "GET", f"{base}/issue/{issue_key}", headers=headers)
        _raise_for_status(r, "get_issue")
        data = r.json()
        return {
            "id": data.get("id"),
            "key": data.get("key"),
            "summary": data.get("fields", {}).get("summary"),
            "status": data.get("fields", {}).get("status", {}).get("name"),
            "description": data.get("fields", {}).get("description"),
        }

    async def _add_comment(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        issue_key = params.get("issue_key")
        body_text = params.get("body", "")
        if not issue_key:
            raise ConnectorError("MISSING_PARAM", "add_comment requires 'issue_key'")
        body = {
            "body": {
                "type": "doc",
                "version": 1,
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": body_text}]}],
            }
        }
        r = await request_with_rate_limit(
            client, "POST", f"{base}/issue/{issue_key}/comment", headers=headers, json=body
        )
        _raise_for_status(r, "add_comment")
        data = r.json()
        return {"comment_id": data.get("id")}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Jira {operation} failed: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "JIRA_API_ERROR",
            f"Jira {operation} failed ({r.status_code}): {r.text[:300]}",
        )
