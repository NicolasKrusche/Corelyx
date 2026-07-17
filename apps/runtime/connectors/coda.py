"""Coda native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://coda.io/apis/v1"


class CodaConnector(IConnector):
    provider = "coda"
    supported_operations = [
        "list_docs",
        "get_doc",
        "list_tables",
        "list_rows",
        "insert_row",
        "update_row",
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
                case "list_docs":
                    return await self._list_docs(client, headers, params)
                case "get_doc":
                    return await self._get_doc(client, headers, params)
                case "list_tables":
                    return await self._list_tables(client, headers, params)
                case "list_rows":
                    return await self._list_rows(client, headers, params)
                case "insert_row":
                    return await self._insert_row(client, headers, params)
                case "update_row":
                    return await self._update_row(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Coda does not support operation '{operation}'",
                    )

    async def _list_docs(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/docs", headers=headers, params={"limit": int(params.get("limit", 50))}
        )
        _raise_for_status(r, "list_docs")
        data = r.json()
        return {"docs": data.get("items", [])}

    async def _get_doc(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        doc_id = params.get("doc_id")
        if not doc_id:
            raise ConnectorError("MISSING_PARAM", "get_doc requires 'doc_id'")
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/docs/{doc_id}", headers=headers)
        _raise_for_status(r, "get_doc")
        return {"doc": r.json()}

    async def _list_tables(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        doc_id = params.get("doc_id")
        if not doc_id:
            raise ConnectorError("MISSING_PARAM", "list_tables requires 'doc_id'")
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/docs/{doc_id}/tables", headers=headers)
        _raise_for_status(r, "list_tables")
        return {"tables": r.json().get("items", [])}

    async def _list_rows(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        doc_id = params.get("doc_id")
        table_id = params.get("table_id")
        if not doc_id or not table_id:
            raise ConnectorError("MISSING_PARAM", "list_rows requires 'doc_id' and 'table_id'")
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/docs/{doc_id}/tables/{table_id}/rows",
            headers=headers,
            params={"limit": int(params.get("limit", 50))},
        )
        _raise_for_status(r, "list_rows")
        return {"rows": r.json().get("items", [])}

    async def _insert_row(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        doc_id = params.get("doc_id")
        table_id = params.get("table_id")
        cells = params.get("cells")
        if not doc_id or not table_id or not cells:
            raise ConnectorError("MISSING_PARAM", "insert_row requires 'doc_id', 'table_id', and 'cells'")
        body = {"rows": [{"cells": cells}]}
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/docs/{doc_id}/tables/{table_id}/rows", headers=headers, json=body
        )
        _raise_for_status(r, "insert_row")
        return {"inserted": True, "result": r.json()}

    async def _update_row(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        doc_id = params.get("doc_id")
        table_id = params.get("table_id")
        row_id = params.get("row_id")
        cells = params.get("cells")
        if not doc_id or not table_id or not row_id or not cells:
            raise ConnectorError("MISSING_PARAM", "update_row requires 'doc_id', 'table_id', 'row_id', and 'cells'")
        body = {"row": {"cells": cells}}
        r = await request_with_rate_limit(
            client, "PUT", f"{_BASE}/docs/{doc_id}/tables/{table_id}/rows/{row_id}", headers=headers, json=body
        )
        _raise_for_status(r, "update_row")
        return {"updated": True, "row_id": row_id}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Coda {operation} failed: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "CODA_API_ERROR",
            f"Coda {operation} failed ({r.status_code}): {r.text[:300]}",
        )
