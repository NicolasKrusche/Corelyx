"""Facebook Pages native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://graph.facebook.com/v19.0"


class FacebookConnector(IConnector):
    provider = "facebook"
    supported_operations = [
        "post_to_page",
        "get_page_posts",
        "get_page_insights",
        "reply_to_comment",
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
                case "post_to_page":
                    return await self._post_to_page(client, headers, params)
                case "get_page_posts":
                    return await self._get_page_posts(client, headers, params)
                case "get_page_insights":
                    return await self._get_page_insights(client, headers, params)
                case "reply_to_comment":
                    return await self._reply_to_comment(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Facebook does not support operation '{operation}'",
                    )

    async def _post_to_page(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        page_id = params.get("page_id")
        message = params.get("message", "")
        if not page_id:
            raise ConnectorError("MISSING_PARAM", "post_to_page requires 'page_id'")
        body: dict[str, Any] = {"message": message}
        if params.get("link"):
            body["link"] = params["link"]
        if params.get("published") is not None:
            body["published"] = params["published"]
        r = await request_with_rate_limit(client, "POST", f"{_BASE}/{page_id}/feed", headers=headers, json=body)
        _raise_for_status(r, "post_to_page")
        data = r.json()
        return {"post_id": data.get("id")}

    async def _get_page_posts(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        page_id = params.get("page_id")
        if not page_id:
            raise ConnectorError("MISSING_PARAM", "get_page_posts requires 'page_id'")
        query: dict[str, Any] = {
            "fields": params.get("fields", "id,message,created_time,full_picture"),
            "limit": int(params.get("limit", 10)),
        }
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/{page_id}/posts", headers=headers, params=query)
        _raise_for_status(r, "get_page_posts")
        data = r.json()
        return {
            "posts": data.get("data", []),
            "next": data.get("paging", {}).get("next"),
        }

    async def _get_page_insights(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        page_id = params.get("page_id")
        if not page_id:
            raise ConnectorError("MISSING_PARAM", "get_page_insights requires 'page_id'")
        query: dict[str, Any] = {
            "metric": params.get("metric", "page_impressions,page_engaged_users"),
            "period": params.get("period", "day"),
        }
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/{page_id}/insights", headers=headers, params=query)
        _raise_for_status(r, "get_page_insights")
        data = r.json()
        return {"insights": data.get("data", [])}

    async def _reply_to_comment(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        comment_id = params.get("comment_id")
        message = params.get("message", "")
        if not comment_id:
            raise ConnectorError("MISSING_PARAM", "reply_to_comment requires 'comment_id'")
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/{comment_id}/comments",
            headers=headers,
            json={"message": message},
        )
        _raise_for_status(r, "reply_to_comment")
        data = r.json()
        return {"comment_id": data.get("id")}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError(
            "TOKEN_EXPIRED",
            f"Facebook {operation} failed: token expired",
        )
    if r.status_code == 403:
        raise ConnectorError(
            "FACEBOOK_FORBIDDEN",
            f"Facebook {operation} failed: insufficient permissions",
        )
    if r.status_code >= 400:
        raise ConnectorError(
            "FACEBOOK_API_ERROR",
            f"Facebook {operation} failed ({r.status_code}): {r.text[:300]}",
        )
