"""Monday.com native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.monday.com/v2"


class MondayConnector(IConnector):
    provider = "monday"
    supported_operations = [
        "list_boards",
        "list_items",
        "create_item",
        "update_item",
        "create_update",
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
                case "list_boards":
                    return await self._list_boards(client, headers, params)
                case "list_items":
                    return await self._list_items(client, headers, params)
                case "create_item":
                    return await self._create_item(client, headers, params)
                case "update_item":
                    return await self._update_item(client, headers, params)
                case "create_update":
                    return await self._create_update(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Monday.com does not support operation '{operation}'",
                    )

    async def _gql(self, client: httpx.AsyncClient, headers: dict, query: str, variables: dict | None = None) -> dict:
        body: dict[str, Any] = {"query": query}
        if variables:
            body["variables"] = variables
        r = await request_with_rate_limit(client, "POST", _BASE, headers=headers, json=body)
        _raise_for_status(r, "graphql")
        data = r.json()
        if "errors" in data:
            raise ConnectorError("MONDAY_GQL_ERROR", f"Monday.com GraphQL error: {data['errors']}")
        return data.get("data", {})

    async def _list_boards(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        query = "{ boards(limit: %d) { id name description state } }" % int(params.get("limit", 50))
        data = await self._gql(client, headers, query)
        return {"boards": data.get("boards", [])}

    async def _list_items(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        board_id = params.get("board_id")
        if not board_id:
            raise ConnectorError("MISSING_PARAM", "list_items requires 'board_id'")
        query = """
        query ListItems($boardId: ID!, $limit: Int!) {
          boards(ids: [$boardId]) {
            items_page(limit: $limit) {
              items { id name state column_values { id text } }
            }
          }
        }
        """
        data = await self._gql(client, headers, query, {"boardId": board_id, "limit": int(params.get("limit", 50))})
        boards = data.get("boards", [])
        items = boards[0].get("items_page", {}).get("items", []) if boards else []
        return {"items": items}

    async def _create_item(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        board_id = params.get("board_id")
        item_name = params.get("item_name")
        if not board_id or not item_name:
            raise ConnectorError("MISSING_PARAM", "create_item requires 'board_id' and 'item_name'")
        query = """
        mutation CreateItem($boardId: ID!, $itemName: String!, $columnValues: JSON) {
          create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
            id name
          }
        }
        """
        variables: dict[str, Any] = {"boardId": board_id, "itemName": item_name}
        if params.get("column_values"):
            import json

            variables["columnValues"] = json.dumps(params["column_values"])
        data = await self._gql(client, headers, query, variables)
        return {"item": data.get("create_item")}

    async def _update_item(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        board_id = params.get("board_id")
        item_id = params.get("item_id")
        column_id = params.get("column_id")
        value = params.get("value")
        if not board_id or not item_id or not column_id:
            raise ConnectorError("MISSING_PARAM", "update_item requires 'board_id', 'item_id', 'column_id'")
        import json

        query = """
        mutation UpdateItem($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
          change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
            id
          }
        }
        """
        await self._gql(
            client,
            headers,
            query,
            {
                "boardId": board_id,
                "itemId": item_id,
                "columnId": column_id,
                "value": json.dumps(value),
            },
        )
        return {"updated": True, "item_id": item_id}

    async def _create_update(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        item_id = params.get("item_id")
        body = params.get("body", "")
        if not item_id:
            raise ConnectorError("MISSING_PARAM", "create_update requires 'item_id'")
        query = """
        mutation CreateUpdate($itemId: ID!, $body: String!) {
          create_update(item_id: $itemId, body: $body) { id body }
        }
        """
        data = await self._gql(client, headers, query, {"itemId": item_id, "body": body})
        return {"update": data.get("create_update")}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Monday.com {operation} failed: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "MONDAY_API_ERROR",
            f"Monday.com {operation} failed ({r.status_code}): {r.text[:300]}",
        )
