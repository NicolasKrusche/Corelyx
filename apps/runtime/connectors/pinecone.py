"""Pinecone connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.pinecone.com/v1"


class PineconeConnector(IConnector):
    """
    Pinecone connector for: query_index, upsert_vectors.
    
    API Base: pinecone
    """
    
    provider = "pinecone"
    supported_operations = [
        "query_index",
        "upsert_vectors"
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Pinecone operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "query_index":
                    return await self._query_index(client, headers, params)
                case "upsert_vectors":
                    return await self._upsert_vectors(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Pinecone does not support '{operation}'",
                    )


    async def _query_index(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute query_index operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/query_index",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()

    async def _upsert_vectors(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute upsert_vectors operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/upsert_vectors",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()
