"""Linear native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.linear.app/graphql"


class LinearConnector(IConnector):
    provider = "linear"
    supported_operations = [
        "list_issues",
        "create_issue",
        "update_issue",
        "list_projects",
        "get_issue",
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
                case "list_issues":
                    return await self._list_issues(client, headers, params)
                case "create_issue":
                    return await self._create_issue(client, headers, params)
                case "update_issue":
                    return await self._update_issue(client, headers, params)
                case "list_projects":
                    return await self._list_projects(client, headers, params)
                case "get_issue":
                    return await self._get_issue(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Linear does not support operation '{operation}'",
                    )

    async def _gql(self, client: httpx.AsyncClient, headers: dict, query: str, variables: dict | None = None) -> dict:
        body: dict[str, Any] = {"query": query}
        if variables:
            body["variables"] = variables
        r = await request_with_rate_limit(client, "POST", _BASE, headers=headers, json=body)
        _raise_for_status(r, "graphql")
        data = r.json()
        if "errors" in data:
            raise ConnectorError("LINEAR_GQL_ERROR", f"Linear GraphQL error: {data['errors']}")
        return data.get("data", {})

    async def _list_issues(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        query = """
        query ListIssues($first: Int, $teamId: String) {
          issues(first: $first, filter: { team: { id: { eq: $teamId } } }) {
            nodes { id title state { name } priority createdAt updatedAt }
          }
        }
        """
        variables: dict[str, Any] = {"first": int(params.get("limit", 50))}
        if params.get("team_id"):
            variables["teamId"] = params["team_id"]
        data = await self._gql(client, headers, query, variables)
        return {"issues": data.get("issues", {}).get("nodes", [])}

    async def _create_issue(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        team_id = params.get("team_id")
        title = params.get("title")
        if not team_id or not title:
            raise ConnectorError("MISSING_PARAM", "create_issue requires 'team_id' and 'title'")
        query = """
        mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue { id title url state { name } }
          }
        }
        """
        inp: dict[str, Any] = {"teamId": team_id, "title": title}
        if params.get("description"):
            inp["description"] = params["description"]
        if params.get("priority") is not None:
            inp["priority"] = int(params["priority"])
        data = await self._gql(client, headers, query, {"input": inp})
        result = data.get("issueCreate", {})
        return {
            "success": result.get("success"),
            "issue": result.get("issue"),
        }

    async def _update_issue(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        issue_id = params.get("issue_id")
        if not issue_id:
            raise ConnectorError("MISSING_PARAM", "update_issue requires 'issue_id'")
        query = """
        mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
            issue { id title url state { name } }
          }
        }
        """
        inp: dict[str, Any] = {}
        for field in ("title", "description", "priority", "stateId", "assigneeId"):
            key = field if field in params else None
            if key and params.get(key) is not None:
                inp[field] = params[key]
        data = await self._gql(client, headers, query, {"id": issue_id, "input": inp})
        result = data.get("issueUpdate", {})
        return {"success": result.get("success"), "issue": result.get("issue")}

    async def _list_projects(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        query = """
        query ListProjects($first: Int) {
          projects(first: $first) {
            nodes { id name description state createdAt }
          }
        }
        """
        data = await self._gql(client, headers, query, {"first": int(params.get("limit", 50))})
        return {"projects": data.get("projects", {}).get("nodes", [])}

    async def _get_issue(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        issue_id = params.get("issue_id")
        if not issue_id:
            raise ConnectorError("MISSING_PARAM", "get_issue requires 'issue_id'")
        query = """
        query GetIssue($id: String!) {
          issue(id: $id) {
            id title description url state { name } priority assignee { name email } createdAt updatedAt
          }
        }
        """
        data = await self._gql(client, headers, query, {"id": issue_id})
        return {"issue": data.get("issue")}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Linear {operation} failed: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "LINEAR_API_ERROR",
            f"Linear {operation} failed ({r.status_code}): {r.text[:300]}",
        )
