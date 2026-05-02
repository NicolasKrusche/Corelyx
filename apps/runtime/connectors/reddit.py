"""Reddit native connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://oauth.reddit.com"
_USER_AGENT = "FlowOS/1.0 (by /u/flowos_bot)"


class RedditConnector(IConnector):
    provider = "reddit"
    supported_operations = [
        "submit_post",
        "get_subreddit_posts",
        "get_comments",
        "search_subreddit",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {access_token}",
            "User-Agent": _USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "submit_post":
                    return await self._submit_post(client, headers, params)
                case "get_subreddit_posts":
                    return await self._get_subreddit_posts(client, headers, params)
                case "get_comments":
                    return await self._get_comments(client, headers, params)
                case "search_subreddit":
                    return await self._search_subreddit(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Reddit does not support operation '{operation}'",
                    )

    async def _submit_post(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        subreddit = params.get("subreddit")
        title = params.get("title")
        if not subreddit or not title:
            raise ConnectorError("MISSING_PARAM", "submit_post requires 'subreddit' and 'title'")
        kind = params.get("kind", "self")
        form_data: dict[str, Any] = {
            "sr": subreddit,
            "title": title,
            "kind": kind,
            "resubmit": str(params.get("resubmit", True)).lower(),
            "nsfw": str(params.get("nsfw", False)).lower(),
        }
        if kind == "self":
            form_data["text"] = params.get("text", "")
        elif kind == "link":
            url = params.get("url")
            if not url:
                raise ConnectorError("MISSING_PARAM", "submit_post with kind='link' requires 'url'")
            form_data["url"] = url
        json_headers = {**headers, "Content-Type": "application/x-www-form-urlencoded"}
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/api/submit", headers=json_headers, data=form_data
        )
        _raise_for_status(r, "submit_post")
        data = r.json()
        jquery = data.get("jquery", [])
        # Extract post URL from jquery response
        post_url = None
        for item in jquery:
            if isinstance(item, list) and len(item) > 3 and isinstance(item[3], list):
                for val in item[3]:
                    if isinstance(val, str) and "reddit.com/r/" in val:
                        post_url = val
                        break
        return {"post_url": post_url, "success": not data.get("success") is False}

    async def _get_subreddit_posts(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        subreddit = params.get("subreddit")
        if not subreddit:
            raise ConnectorError("MISSING_PARAM", "get_subreddit_posts requires 'subreddit'")
        sort = params.get("sort", "hot")
        query: dict[str, Any] = {"limit": int(params.get("limit", 25))}
        if params.get("after"):
            query["after"] = params["after"]
        get_headers = {**headers, "Content-Type": "application/json"}
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/r/{subreddit}/{sort}",
            headers=get_headers,
            params=query,
        )
        _raise_for_status(r, "get_subreddit_posts")
        data = r.json()
        posts_data = data.get("data", {})
        return {
            "posts": [
                {
                    "id": p["data"]["id"],
                    "title": p["data"].get("title"),
                    "author": p["data"].get("author"),
                    "score": p["data"].get("score"),
                    "url": p["data"].get("url"),
                    "created_utc": p["data"].get("created_utc"),
                    "num_comments": p["data"].get("num_comments"),
                }
                for p in posts_data.get("children", [])
            ],
            "after": posts_data.get("after"),
        }

    async def _get_comments(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        post_id = params.get("post_id")
        subreddit = params.get("subreddit")
        if not post_id or not subreddit:
            raise ConnectorError(
                "MISSING_PARAM", "get_comments requires 'post_id' and 'subreddit'"
            )
        get_headers = {**headers, "Content-Type": "application/json"}
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/r/{subreddit}/comments/{post_id}",
            headers=get_headers,
            params={"limit": int(params.get("limit", 25))},
        )
        _raise_for_status(r, "get_comments")
        data = r.json()
        if isinstance(data, list) and len(data) > 1:
            comments_listing = data[1].get("data", {}).get("children", [])
            return {
                "comments": [
                    {
                        "id": c["data"]["id"],
                        "author": c["data"].get("author"),
                        "body": c["data"].get("body"),
                        "score": c["data"].get("score"),
                        "created_utc": c["data"].get("created_utc"),
                    }
                    for c in comments_listing
                    if c.get("kind") == "t1"
                ]
            }
        return {"comments": []}

    async def _search_subreddit(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        subreddit = params.get("subreddit")
        query_text = params.get("query")
        if not subreddit or not query_text:
            raise ConnectorError(
                "MISSING_PARAM", "search_subreddit requires 'subreddit' and 'query'"
            )
        get_headers = {**headers, "Content-Type": "application/json"}
        query: dict[str, Any] = {
            "q": query_text,
            "restrict_sr": True,
            "sort": params.get("sort", "relevance"),
            "limit": int(params.get("limit", 25)),
        }
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/r/{subreddit}/search",
            headers=get_headers,
            params=query,
        )
        _raise_for_status(r, "search_subreddit")
        data = r.json()
        posts_data = data.get("data", {})
        return {
            "results": [
                {
                    "id": p["data"]["id"],
                    "title": p["data"].get("title"),
                    "author": p["data"].get("author"),
                    "score": p["data"].get("score"),
                    "url": p["data"].get("url"),
                }
                for p in posts_data.get("children", [])
            ],
            "after": posts_data.get("after"),
        }


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError(
            "TOKEN_EXPIRED",
            f"Reddit {operation} failed: token expired",
        )
    if r.status_code == 403:
        raise ConnectorError(
            "REDDIT_FORBIDDEN",
            f"Reddit {operation} failed: insufficient permissions or subreddit restricted",
        )
    if r.status_code == 429:
        raise ConnectorError(
            "REDDIT_RATE_LIMITED",
            f"Reddit {operation} failed: rate limit exceeded",
        )
    if r.status_code >= 400:
        raise ConnectorError(
            "REDDIT_API_ERROR",
            f"Reddit {operation} failed ({r.status_code}): {r.text[:300]}",
        )
