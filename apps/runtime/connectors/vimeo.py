"""Vimeo connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.vimeo.com/v1"


class VimeoConnector(IConnector):
    """
    Vimeo connector for: list_videos, upload_video.
    
    API Base: vimeo
    """
    
    provider = "vimeo"
    supported_operations = [
        "list_videos",
        "upload_video"
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Vimeo operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_videos":
                    return await self._list_videos(client, headers, params)
                case "upload_video":
                    return await self._upload_video(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Vimeo does not support '{operation}'",
                    )


    async def _list_videos(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute list_videos operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]
        
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/videos", 
            headers=headers, params=query_params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        data = r.json()
        return {
            "items": data.get("data", []) or data.get("items", []),
            "total": data.get("total", 0),
        }

    async def _upload_video(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute upload_video operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/upload_video",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()
