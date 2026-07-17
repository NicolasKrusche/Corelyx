"""Salesforce native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit


class SalesforceConnector(IConnector):
    provider = "salesforce"
    supported_operations = [
        "query",
        "create_record",
        "update_record",
        "list_objects",
        "get_record",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        instance_url = params.get("instance_url", "")
        if not instance_url:
            raise ConnectorError("MISSING_PARAM", "Salesforce requires 'instance_url' param")
        base = f"{instance_url.rstrip('/')}/services/data/v59.0"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "query":
                    return await self._query(client, headers, params, base)
                case "create_record":
                    return await self._create_record(client, headers, params, base)
                case "update_record":
                    return await self._update_record(client, headers, params, base)
                case "list_objects":
                    return await self._list_objects(client, headers, params, base)
                case "get_record":
                    return await self._get_record(client, headers, params, base)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Salesforce does not support operation '{operation}'",
                    )

    async def _query(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        soql = params.get("soql")
        if not soql:
            raise ConnectorError("MISSING_PARAM", "query requires 'soql'")
        r = await request_with_rate_limit(client, "GET", f"{base}/query", headers=headers, params={"q": soql})
        _raise_for_status(r, "query")
        data = r.json()
        return {"records": data.get("records", []), "total_size": data.get("totalSize"), "done": data.get("done")}

    async def _create_record(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        object_type = params.get("object_type")
        fields = params.get("fields")
        if not object_type or not fields:
            raise ConnectorError("MISSING_PARAM", "create_record requires 'object_type' and 'fields'")
        r = await request_with_rate_limit(
            client, "POST", f"{base}/sobjects/{object_type}", headers=headers, json=fields
        )
        _raise_for_status(r, "create_record")
        data = r.json()
        return {"id": data.get("id"), "success": data.get("success")}

    async def _update_record(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        object_type = params.get("object_type")
        record_id = params.get("record_id")
        fields = params.get("fields")
        if not object_type or not record_id or not fields:
            raise ConnectorError("MISSING_PARAM", "update_record requires 'object_type', 'record_id', and 'fields'")
        r = await request_with_rate_limit(
            client, "PATCH", f"{base}/sobjects/{object_type}/{record_id}", headers=headers, json=fields
        )
        _raise_for_status(r, "update_record")
        return {"updated": True, "record_id": record_id}

    async def _list_objects(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        r = await request_with_rate_limit(client, "GET", f"{base}/sobjects", headers=headers)
        _raise_for_status(r, "list_objects")
        data = r.json()
        return {"objects": [{"name": o["name"], "label": o["label"]} for o in data.get("sobjects", [])]}

    async def _get_record(self, client: httpx.AsyncClient, headers: dict, params: dict, base: str) -> dict:
        object_type = params.get("object_type")
        record_id = params.get("record_id")
        if not object_type or not record_id:
            raise ConnectorError("MISSING_PARAM", "get_record requires 'object_type' and 'record_id'")
        r = await request_with_rate_limit(client, "GET", f"{base}/sobjects/{object_type}/{record_id}", headers=headers)
        _raise_for_status(r, "get_record")
        return {"record": r.json()}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Salesforce {operation} failed: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "SALESFORCE_API_ERROR",
            f"Salesforce {operation} failed ({r.status_code}): {r.text[:300]}",
        )
