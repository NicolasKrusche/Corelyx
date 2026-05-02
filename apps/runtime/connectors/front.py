"""Front connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.front.com/v1"


class FrontConnector(IConnector):
    """
    Front connector for: list_conversations, reply_conversation.
    
    API Base: front
    """
    
    provider = "front"
    supported_operations = [
        "list_conversations",
        "reply_conversation"
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Front operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_conversations":
                    return await self._list_conversations(client, headers, params)
                case "reply_conversation":
                    return await self._reply_conversation(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Front does not support '{operation}'",
                    )


    async def _list_conversations(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute list_conversations operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]
        
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/conversations", 
            headers=headers, params=query_params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        data = r.json()
        return {
            "items": data.get("data", []) or data.get("items", []),
            "total": data.get("total", 0),
        }

    async def _reply_conversation(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute reply_conversation operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/reply_conversation",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()
