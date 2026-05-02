"""NetSuite connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.netsuite.com/v1"


class NetsuiteConnector(IConnector):
    """
    NetSuite connector for: query_records, create_record.
    
    API Base: netsuite
    """
    
    provider = "netsuite"
    supported_operations = [
        "query_records",
        "create_record"
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a NetSuite operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "query_records":
                    return await self._query_records(client, headers, params)
                case "create_record":
                    return await self._create_record(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"NetSuite does not support '{operation}'",
                    )


    async def _query_records(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute query_records operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/query_records",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()

    async def _create_record(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute create_record operation."""
        if not params:
            raise ConnectorError("MISSING_PARAM", "request body required")
        
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/record",
            headers=headers, json=params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()
