"""Supabase connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.supabase.com/v1"


class SupabaseConnector(IConnector):
    """
    Supabase connector for: query_table, insert_record.
    
    API Base: supabase
    """
    
    provider = "supabase"
    supported_operations = [
        "query_table",
        "insert_record"
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Supabase operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "query_table":
                    return await self._query_table(client, headers, params)
                case "insert_record":
                    return await self._insert_record(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Supabase does not support '{operation}'",
                    )


    async def _query_table(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute query_table operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/query_table",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()

    async def _insert_record(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute insert_record operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/insert_record",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()
