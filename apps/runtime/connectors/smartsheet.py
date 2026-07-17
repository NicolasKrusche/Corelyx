"""Smartsheet native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.smartsheet.com/2.0"


class SmartsheetConnector(IConnector):
    provider = "smartsheet"
    supported_operations = [
        "list_sheets",
        "get_sheet",
        "add_row",
        "update_row",
        "list_columns",
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
                case "list_sheets":
                    return await self._list_sheets(client, headers, params)
                case "get_sheet":
                    return await self._get_sheet(client, headers, params)
                case "add_row":
                    return await self._add_row(client, headers, params)
                case "update_row":
                    return await self._update_row(client, headers, params)
                case "list_columns":
                    return await self._list_columns(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Smartsheet does not support operation '{operation}'",
                    )

    async def _list_sheets(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/sheets", headers=headers)
        _raise_for_status(r, "list_sheets")
        data = r.json()
        return {"sheets": data.get("data", [])}

    async def _get_sheet(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        sheet_id = params.get("sheet_id")
        if not sheet_id:
            raise ConnectorError("MISSING_PARAM", "get_sheet requires 'sheet_id'")
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/sheets/{sheet_id}", headers=headers)
        _raise_for_status(r, "get_sheet")
        return {"sheet": r.json()}

    async def _add_row(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        sheet_id = params.get("sheet_id")
        cells = params.get("cells")
        if not sheet_id or not cells:
            raise ConnectorError("MISSING_PARAM", "add_row requires 'sheet_id' and 'cells'")
        body = [{"toTop": params.get("to_top", True), "cells": cells}]
        r = await request_with_rate_limit(client, "POST", f"{_BASE}/sheets/{sheet_id}/rows", headers=headers, json=body)
        _raise_for_status(r, "add_row")
        data = r.json()
        rows = data.get("result", [])
        return {"row": rows[0] if rows else {}}

    async def _update_row(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        sheet_id = params.get("sheet_id")
        row_id = params.get("row_id")
        cells = params.get("cells")
        if not sheet_id or not row_id or not cells:
            raise ConnectorError("MISSING_PARAM", "update_row requires 'sheet_id', 'row_id', and 'cells'")
        body = [{"id": row_id, "cells": cells}]
        r = await request_with_rate_limit(client, "PUT", f"{_BASE}/sheets/{sheet_id}/rows", headers=headers, json=body)
        _raise_for_status(r, "update_row")
        return {"updated": True, "row_id": row_id}

    async def _list_columns(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        sheet_id = params.get("sheet_id")
        if not sheet_id:
            raise ConnectorError("MISSING_PARAM", "list_columns requires 'sheet_id'")
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/sheets/{sheet_id}/columns", headers=headers)
        _raise_for_status(r, "list_columns")
        return {"columns": r.json().get("data", [])}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Smartsheet {operation} failed: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "SMARTSHEET_API_ERROR",
            f"Smartsheet {operation} failed ({r.status_code}): {r.text[:300]}",
        )
