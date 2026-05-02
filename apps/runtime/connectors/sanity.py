"""Sanity connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.sanity.com/v1"


class SanityConnector(IConnector):
    """
    Sanity connector for: query_documents, create_document.
    
    API Base: sanity
    """
    
    provider = "sanity"
    supported_operations = [
        "query_documents",
        "create_document"
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Sanity operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "query_documents":
                    return await self._query_documents(client, headers, params)
                case "create_document":
                    return await self._create_document(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Sanity does not support '{operation}'",
                    )


    async def _query_documents(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute query_documents operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/query_documents",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()

    async def _create_document(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute create_document operation."""
        if not params:
            raise ConnectorError("MISSING_PARAM", "request body required")
        
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/document",
            headers=headers, json=params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()
