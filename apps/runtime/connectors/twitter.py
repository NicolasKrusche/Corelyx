"""X (Twitter) connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.twitter.com/v1"


class TwitterConnector(IConnector):
    """
    X (Twitter) connector for: post_tweet, list_tweets.
    
    API Base: twitter
    """
    
    provider = "twitter"
    supported_operations = [
        "post_tweet",
        "list_tweets"
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a X (Twitter) operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "post_tweet":
                    return await self._post_tweet(client, headers, params)
                case "list_tweets":
                    return await self._list_tweets(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"X (Twitter) does not support '{operation}'",
                    )


    async def _post_tweet(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute post_tweet operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/post_tweet",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()

    async def _list_tweets(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute list_tweets operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]
        
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/tweets", 
            headers=headers, params=query_params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        data = r.json()
        return {
            "items": data.get("data", []) or data.get("items", []),
            "total": data.get("total", 0),
        }
