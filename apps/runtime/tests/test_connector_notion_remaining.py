"""Remaining Notion connector coverage tests."""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from connectors.base import ConnectorError
from connectors.notion import NotionConnector


def _fake_response(json_data=None, status_code=200, text="", raise_json_error=False):
    resp = MagicMock()
    resp.status_code = status_code
    resp.text = text
    resp.raise_for_status = MagicMock()
    if raise_json_error:
        resp.json.side_effect = ValueError("No JSON decoder could parse the response")
    else:
        resp.json.return_value = json_data if json_data is not None else {}
    return resp


class TestNotionRemaining(unittest.IsolatedAsyncioTestCase):
    # ── 1. query_database ──────────────────────────────────────────────
    async def test_query_database_success(self):
        mock = _fake_response({"results": [{"id": "page1"}], "has_more": False})
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await NotionConnector().execute("query_database", {"database_id": "db1"}, "tok")
        self.assertEqual(len(result["results"]), 1)
        self.assertFalse(result["has_more"])

    async def test_query_database_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await NotionConnector().execute("query_database", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_query_database_http_error(self):
        mock = _fake_response(status_code=500, text="Server Error")
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await NotionConnector().execute("query_database", {"database_id": "db1"}, "tok")
        self.assertEqual(ctx.exception.code, "NOTION_API_ERROR")

    # ── 6. query_database with filter/sorts/page_size ──────────────────
    async def test_query_database_with_filter_and_sorts(self):
        mock = _fake_response({"results": [{"id": "page1"}], "has_more": False})
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(return_value=mock)) as mocked:
            result = await NotionConnector().execute(
                "query_database",
                {
                    "database_id": "db1",
                    "filter": {"property": "Name", "title": {"contains": "Test"}},
                    "sorts": [{"timestamp": "created_time", "direction": "descending"}],
                    "page_size": 10,
                },
                "tok",
            )
        self.assertEqual(len(result["results"]), 1)
        sent_json = mocked.call_args.kwargs["json"]
        self.assertEqual(sent_json["filter"], {"property": "Name", "title": {"contains": "Test"}})
        self.assertEqual(sent_json["sorts"], [{"timestamp": "created_time", "direction": "descending"}])
        self.assertEqual(sent_json["page_size"], 10)

    async def test_query_database_filter_retry_on_unknown_property(self):
        error_mock = _fake_response(
            status_code=400,
            text='{"message": "Could not find property with name \"Foo\""}',
            json_data={"message": 'Could not find property with name "Foo"'},
        )
        success_mock = _fake_response({"results": [{"id": "page1"}], "has_more": False})
        with patch(
            "connectors.notion.request_with_rate_limit",
            new=AsyncMock(side_effect=[error_mock, success_mock]),
        ) as mocked:
            result = await NotionConnector().execute(
                "query_database",
                {
                    "database_id": "db1",
                    "filter": {"property": "Foo", "title": {"contains": "Bar"}},
                },
                "tok",
            )
        self.assertEqual(len(result["results"]), 1)
        calls = mocked.call_args_list
        # Second call should no longer contain the filter
        self.assertNotIn("filter", calls[1].kwargs["json"])

    # ── 2. retrieve_page (read_page edge cases not in deep tests) ─────
    async def test_read_page_blocks_non_200(self):
        page_resp = _fake_response({"id": "p1", "properties": {}})
        blocks_resp = _fake_response(status_code=404, text="Not Found")
        with patch(
            "connectors.notion.request_with_rate_limit",
            new=AsyncMock(side_effect=[page_resp, blocks_resp]),
        ):
            result = await NotionConnector().execute("read_page", {"page_id": "p1"}, "tok")
        self.assertEqual(result["page"]["id"], "p1")
        self.assertEqual(result["blocks"], [])

    async def test_read_page_blocks_json_error(self):
        page_resp = _fake_response({"id": "p1", "properties": {}})
        blocks_resp = _fake_response(json_data={})
        blocks_resp.json.side_effect = ValueError("bad json")
        with patch(
            "connectors.notion.request_with_rate_limit",
            new=AsyncMock(side_effect=[page_resp, blocks_resp]),
        ):
            result = await NotionConnector().execute("read_page", {"page_id": "p1"}, "tok")
        self.assertEqual(result["page"]["id"], "p1")
        self.assertEqual(result["blocks"], [])

    # ── 3. update_page (unsupported) ──────────────────────────────────
    async def test_update_page_unsupported(self):
        with self.assertRaises(ConnectorError) as ctx:
            await NotionConnector().execute("update_page", {"page_id": "p1"}, "tok")
        self.assertEqual(ctx.exception.code, "UNSUPPORTED_OPERATION")

    # ── 4. append_blocks (append_to_page blocks-param edge case) ───────
    async def test_append_to_page_with_blocks_param(self):
        mock = _fake_response({"id": "p1"})
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await NotionConnector().execute(
                "append_to_page",
                {
                    "page_id": "p1",
                    "blocks": [
                        {"type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "Hi"}}]}}
                    ],
                },
                "tok",
            )
        self.assertEqual(result["page_id"], "p1")
        self.assertEqual(result["appended_blocks"], 1)

    # ── 5. search (unsupported as top-level operation) ─────────────────
    async def test_search_unsupported_operation(self):
        with self.assertRaises(ConnectorError) as ctx:
            await NotionConnector().execute("search", {"query": "test"}, "tok")
        self.assertEqual(ctx.exception.code, "UNSUPPORTED_OPERATION")

    async def test_search_via_find_or_create_database(self):
        """Internal search used by _find_or_create_database when a name is passed."""
        search_resp = _fake_response(
            {"results": [{"id": "db1", "title": [{"plain_text": "Tasks"}]}]}
        )
        schema_resp = _fake_response({"properties": {"Name": {"type": "title"}}})
        page_resp = _fake_response({"id": "page1", "url": "https://notion.so/page1"})
        with patch(
            "connectors.notion.request_with_rate_limit",
            new=AsyncMock(side_effect=[search_resp, schema_resp, page_resp]),
        ):
            result = await NotionConnector().execute(
                "create_database_entry", {"database_id": "Tasks", "_title": "Hello"}, "tok"
            )
        self.assertEqual(result["page_id"], "page1")

    # ── 7. create_page ──────────────────────────────────────────────────
    async def test_create_page_success(self):
        mock = _fake_response({"id": "page1", "url": "https://notion.so/page1"})
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await NotionConnector().execute(
                "create_page",
                {
                    "parent_id": "33fac82c-a3d4-80ca-95cd-f8b2ef72b2af",
                    "title": "Hello",
                    "content": "World",
                },
                "tok",
            )
        self.assertEqual(result["page_id"], "page1")
        self.assertEqual(result["url"], "https://notion.so/page1")

    async def test_create_page_success_hex32_parent(self):
        mock = _fake_response({"id": "page1", "url": "https://notion.so/page1"})
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(return_value=mock)) as mocked:
            result = await NotionConnector().execute(
                "create_page",
                {
                    "parent_id": "33fac82ca3d480ca95cdf8b2ef72b2af",
                    "title": "Hello",
                },
                "tok",
            )
        self.assertEqual(result["page_id"], "page1")
        sent_json = mocked.call_args.kwargs["json"]
        # create_page keeps the raw hex32 ID in the body (conversion happens in create_database_entry / create_database)
        self.assertEqual(sent_json["parent"]["page_id"], "33fac82ca3d480ca95cdf8b2ef72b2af")

    async def test_create_page_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await NotionConnector().execute("create_page", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_page_http_error(self):
        mock = _fake_response(status_code=400, text="Bad request")
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await NotionConnector().execute(
                    "create_page",
                    {"parent_id": "33fac82c-a3d4-80ca-95cd-f8b2ef72b2af", "title": "Hello"},
                    "tok",
                )
        self.assertEqual(ctx.exception.code, "NOTION_API_ERROR")

    async def test_create_page_non_uuid_parent_redirect(self):
        """Non-UUID parent_id is intercepted and redirected to create_database_entry."""
        search_resp = _fake_response(
            {"results": [{"id": "db1", "title": [{"plain_text": "My Database"}]}]}
        )
        schema_resp = _fake_response({"properties": {"Name": {"type": "title"}}})
        page_resp = _fake_response({"id": "page1", "url": "https://notion.so/page1"})
        with patch(
            "connectors.notion.request_with_rate_limit",
            new=AsyncMock(side_effect=[search_resp, schema_resp, page_resp]),
        ):
            result = await NotionConnector().execute(
                "create_page",
                {"parent_id": "My Database", "title": "Hello", "content": "Body text"},
                "tok",
            )
        self.assertEqual(result["page_id"], "page1")

    async def test_create_page_json_parse_error(self):
        mock = _fake_response(raise_json_error=True)
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await NotionConnector().execute(
                    "create_page",
                    {"parent_id": "33fac82c-a3d4-80ca-95cd-f8b2ef72b2af", "title": "Hello"},
                    "tok",
                )
        self.assertEqual(ctx.exception.code, "NOTION_PARSE_ERROR")

    # ── 8. retrieve_block (unsupported) ─────────────────────────────────
    async def test_retrieve_block_unsupported(self):
        with self.assertRaises(ConnectorError) as ctx:
            await NotionConnector().execute("retrieve_block", {"block_id": "b1"}, "tok")
        self.assertEqual(ctx.exception.code, "UNSUPPORTED_OPERATION")

    # ── 9. delete_block (unsupported) ───────────────────────────────────
    async def test_delete_block_unsupported(self):
        with self.assertRaises(ConnectorError) as ctx:
            await NotionConnector().execute("delete_block", {"block_id": "b1"}, "tok")
        self.assertEqual(ctx.exception.code, "UNSUPPORTED_OPERATION")

    # ── Bonus: token-expired (401) path ─────────────────────────────────
    async def test_token_expired_raises_connector_error(self):
        mock = _fake_response(status_code=401, text="Unauthorized")
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await NotionConnector().execute("query_database", {"database_id": "db1"}, "tok")
        self.assertEqual(ctx.exception.code, "TOKEN_EXPIRED")

    # ── Bonus: create_database_entry edge cases ────────────────────────
    async def test_create_database_entry_user_assigned_fallback(self):
        search_db_resp = _fake_response(
            {"results": [{"id": "db1", "title": [{"plain_text": "Corelyx Tasks"}]}]}
        )
        schema_resp = _fake_response({"properties": {"Name": {"type": "title"}}})
        page_resp = _fake_response({"id": "page1", "url": "https://notion.so/page1"})
        with patch(
            "connectors.notion.request_with_rate_limit",
            new=AsyncMock(side_effect=[search_db_resp, schema_resp, page_resp]),
        ):
            result = await NotionConnector().execute(
                "create_database_entry", {"database_id": "__USER_ASSIGNED__", "_title": "Hello"}, "tok"
            )
        self.assertEqual(result["page_id"], "page1")

    async def test_create_database_entry_no_accessible_page(self):
        search_db_resp = _fake_response({"results": []})
        search_page_resp = _fake_response({"results": []})
        with patch(
            "connectors.notion.request_with_rate_limit",
            new=AsyncMock(side_effect=[search_db_resp, search_page_resp]),
        ):
            with self.assertRaises(ConnectorError) as ctx:
                await NotionConnector().execute(
                    "create_database_entry", {"database_id": "My DB", "_title": "Hello"}, "tok"
                )
        self.assertEqual(ctx.exception.code, "NO_ACCESSIBLE_PAGE")

    async def test_create_database_entry_explicit_properties(self):
        schema_resp = _fake_response(
            {"properties": {"Status": {"type": "status"}, "Name": {"type": "title"}}}
        )
        page_resp = _fake_response({"id": "page1", "url": "https://notion.so/page1"})
        with patch(
            "connectors.notion.request_with_rate_limit",
            new=AsyncMock(side_effect=[schema_resp, page_resp]),
        ):
            result = await NotionConnector().execute(
                "create_database_entry",
                {
                    "database_id": "33fac82c-a3d4-80ca-95cd-f8b2ef72b2af",
                    "properties": {"Status": {"status": {"name": "Done"}}},
                },
                "tok",
            )
        self.assertEqual(result["page_id"], "page1")
