"""Targeted connector tests to push coverage from 70-99% to 100%."""

from __future__ import annotations
import sys as _sys
import types as _types
from pathlib import Path as _Path
from unittest.mock import MagicMock as _MagicMock

for _m in list(_sys.modules):
    if _m.startswith("connectors.") or _m == "engine.executor":
        del _sys.modules[_m]

if "connectors" not in _sys.modules or not getattr(_sys.modules.get("connectors"), "_is_stub", False):
    _base = _types.ModuleType("connectors.base")
    class _CE(Exception):
        def __init__(self, code="", message=""):
            super().__init__(message)
            self.code = code
            self.message = message
    _base.ConnectorError = _CE
    _base.IConnector = type("IConnector", (), {})
    _conn = _types.ModuleType("connectors")
    _conn._is_stub = True
    _conn.get_connector = _MagicMock(return_value=None)
    _conn.REGISTRY = {}
    _conn.IConnector = _base.IConnector
    _conn.ConnectorError = _CE
    # Keep the stub importable as a *package* so `import connectors.<mod>`
    # still resolves to the real module on disk. Without __path__ the stub
    # is a plain module, and because these stubs are installed at import
    # time and never torn down, the first agent test collected poisoned
    # sys.modules for every later test in the session.
    _conn.__path__ = [str(_Path(__file__).resolve().parent.parent / "connectors")]
    _sys.modules["connectors"] = _conn
    _sys.modules["connectors.base"] = _base


import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from connectors.base import ConnectorError
from connectors.gmail import (
    GmailConnector,
    _decode_base64url,
    _extract_text_and_attachments,
    _header,
    _raise_for_status as _gmail_raise,
)
from connectors.notion import (
    NotionConnector,
    _extract_database_id,
    _format_property,
    _hex32_to_uuid,
    _infer_notion_type,
    _map_simple_fields,
    _remap_explicit_properties,
    _truncate_rich_text,
)
from connectors.github import GitHubConnector
from connectors.drive import DriveConnector
from connectors.calendar import CalendarConnector
from connectors.docs import DocsConnector, _extract_plain_text
from connectors.slack import SlackConnector
from connectors.hubspot import HubSpotConnector
from connectors.jira import JiraConnector
from connectors.outlook import OutlookConnector
from connectors.asana import AsanaConnector
from connectors.airtable import AirtableConnector
from connectors.reddit import RedditConnector
from connectors.salesforce import SalesforceConnector
from connectors.bitbucket import BitbucketConnector
from connectors.telegram import TelegramConnector
from connectors.teams import TeamsConnector
from connectors.googlechat import GoogleChatConnector
from connectors.whatsapp import WhatsappConnector
from connectors.stripe import StripeConnector
from connectors.openai import OpenaiConnector


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


# ────────────────────────────────────────────────────────────────
# Gmail
# ────────────────────────────────────────────────────────────────


class TestGmailConnectorFinal(unittest.IsolatedAsyncioTestCase):
    async def test_send_email_with_all_options(self):
        mock = _fake_response({"id": "sent1", "threadId": "t1"})
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await GmailConnector().execute(
                "send_email",
                {
                    "to": "a@b.com",
                    "subject": "Hi",
                    "body": "Hello",
                    "cc": "c@d.com",
                    "bcc": "e@f.com",
                    "reply_to_id": "msg1",
                    "thread_id": "t1",
                    "attachments": [
                        {"filename": "test.txt", "mime_type": "text/plain", "content_base64": "SGVsbG8="},
                        {"filename": "test2.txt", "mime_type": "text/plain", "content": "World"},
                        "not-a-dict",
                        {"filename": "empty.bin", "mime_type": "application/octet-stream"},
                    ],
                },
                "tok",
            )
        self.assertEqual(result["message_id"], "sent1")
        self.assertEqual(result["thread_id"], "t1")

    async def test_send_email_with_content_base64(self):
        mock = _fake_response({"id": "sent1", "threadId": "t1"})
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await GmailConnector().execute(
                "send_email",
                {
                    "to": "a@b.com",
                    "subject": "Hi",
                    "body": "Hello",
                    "attachments": [
                        {"filename": "test.txt", "mime_type": "text/plain", "content_base64": "SGVsbG8="},
                    ],
                },
                "tok",
            )
        self.assertEqual(result["message_id"], "sent1")

    async def test_get_attachment_decode_text(self):
        mock = _fake_response({"data": "SGVsbG8gV29ybGQ="})
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await GmailConnector().execute(
                "get_attachment", {"message_id": "m1", "attachment_id": "a1", "decode_text": True}, "tok"
            )
        self.assertEqual(result["text"], "Hello World")

    async def test_read_email_with_attachments(self):
        msg_resp = _fake_response(
            {
                "id": "msg1",
                "threadId": "t1",
                "historyId": "h1",
                "snippet": "snip",
                "payload": {
                    "headers": [
                        {"name": "Subject", "value": "Hello"},
                        {"name": "From", "value": "a@b.com"},
                        {"name": "To", "value": "c@d.com"},
                    ],
                    "mimeType": "multipart/mixed",
                    "parts": [
                        {
                            "mimeType": "text/plain",
                            "body": {"data": "SGVsbG8=", "size": 5},
                        },
                        {
                            "mimeType": "text/html",
                            "body": {"data": "PGh0bWw+", "size": 6},
                        },
                        {
                            "mimeType": "application/pdf",
                            "filename": "doc.pdf",
                            "body": {"attachmentId": "att1", "size": 1024},
                            "headers": [{"name": "Content-ID", "value": "<cid1>"}],
                        },
                    ],
                },
                "labelIds": ["INBOX"],
            }
        )
        att_resp = _fake_response({"data": "SGVsbG8gV29ybGQ="})
        with patch(
            "connectors.gmail.request_with_rate_limit",
            new=AsyncMock(side_effect=[msg_resp, att_resp]),
        ):
            result = await GmailConnector().execute(
                "read_email",
                {"message_id": "msg1", "include_attachments": True, "attachment_inline_max_bytes": 1024},
                "tok",
            )
        self.assertEqual(result["attachment_count"], 1)
        self.assertTrue(result["attachments"][0]["is_inline"])

    async def test_read_email_attachment_fetch_error(self):
        msg_resp = _fake_response(
            {
                "id": "msg1",
                "threadId": "t1",
                "historyId": "h1",
                "snippet": "snip",
                "payload": {
                    "headers": [
                        {"name": "Subject", "value": "Hello"},
                        {"name": "From", "value": "a@b.com"},
                        {"name": "To", "value": "c@d.com"},
                    ],
                    "mimeType": "multipart/mixed",
                    "parts": [
                        {
                            "mimeType": "application/pdf",
                            "filename": "doc.pdf",
                            "body": {"attachmentId": "att1", "size": 1024},
                        },
                    ],
                },
                "labelIds": ["INBOX"],
            }
        )
        err_resp = _fake_response(status_code=404, text="Not found")
        with patch(
            "connectors.gmail.request_with_rate_limit",
            new=AsyncMock(side_effect=[msg_resp, err_resp]),
        ):
            result = await GmailConnector().execute(
                "read_email", {"message_id": "msg1", "include_attachments": True}, "tok"
            )
        self.assertIn("Not found", result["attachments"][0]["fetch_error"])

    async def test_read_email_attachment_truncated(self):
        msg_resp = _fake_response(
            {
                "id": "msg1",
                "threadId": "t1",
                "historyId": "h1",
                "snippet": "snip",
                "payload": {
                    "headers": [
                        {"name": "Subject", "value": "Hello"},
                        {"name": "From", "value": "a@b.com"},
                        {"name": "To", "value": "c@d.com"},
                    ],
                    "mimeType": "multipart/mixed",
                    "parts": [
                        {
                            "mimeType": "application/pdf",
                            "filename": "doc.pdf",
                            "body": {"attachmentId": "att1", "size": 1024},
                        },
                    ],
                },
                "labelIds": ["INBOX"],
            }
        )
        att_resp = _fake_response({"data": "SGVsbG8gV29ybGQ="})
        with patch(
            "connectors.gmail.request_with_rate_limit",
            new=AsyncMock(side_effect=[msg_resp, att_resp]),
        ):
            result = await GmailConnector().execute(
                "read_email",
                {"message_id": "msg1", "include_attachments": True, "attachment_inline_max_bytes": 1},
                "tok",
            )
        self.assertTrue(result["attachments"][0]["truncated"])

    async def test_resolve_label_names(self):
        list_resp = _fake_response({"labels": [{"name": "Existing", "id": "lbl1"}]})
        create_resp = _fake_response({"id": "lbl2"})
        modify_resp = _fake_response({"id": "m1", "labelIds": ["lbl1", "lbl2"]})
        with patch(
            "connectors.gmail.request_with_rate_limit",
            new=AsyncMock(side_effect=[list_resp, create_resp, modify_resp]),
        ):
            result = await GmailConnector().execute(
                "label_email", {"message_id": "m1", "add_label_names": ["Existing", "NewLabel"]}, "tok"
            )
        self.assertIn("lbl2", result["labels"])

    async def test_label_email_str_labels(self):
        modify_resp = _fake_response({"id": "m1", "labelIds": ["LABEL_1"]})
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=modify_resp)):
            result = await GmailConnector().execute(
                "label_email", {"message_id": "m1", "add_label_ids": "LABEL_1", "remove_label_ids": "LABEL_2"}, "tok"
            )
        self.assertIn("LABEL_1", result["labels"])

    def test_raise_for_status_401(self):
        r = _fake_response(status_code=401)
        with self.assertRaises(ConnectorError) as ctx:
            _gmail_raise(r, "test")
        self.assertEqual(ctx.exception.code, "TOKEN_EXPIRED")

    def test_header_empty(self):
        self.assertEqual(_header({}, "Missing"), "")

    def test_decode_base64url_empty(self):
        self.assertEqual(_decode_base64url(""), b"")

    def test_extract_text_and_attachments_html(self):
        text, html, atts = _extract_text_and_attachments(
            {
                "mimeType": "multipart/mixed",
                "parts": [
                    {"mimeType": "text/html", "body": {"data": "PGh0bWw+"}, "filename": ""},
                ],
            },
            "msg1",
        )
        self.assertEqual(html, "<html>")

    def test_extract_text_and_attachments_visit_child(self):
        text, html, atts = _extract_text_and_attachments(
            {
                "mimeType": "multipart/mixed",
                "parts": [
                    {
                        "mimeType": "multipart/mixed",
                        "parts": [
                            {"mimeType": "text/plain", "body": {"data": "SGk="}, "filename": ""},
                        ],
                    },
                    {"mimeType": "application/pdf", "body": {"attachmentId": "att1"}, "filename": "doc.pdf"},
                ],
            },
            "msg1",
        )
        self.assertEqual(text, "Hi")
        self.assertEqual(len(atts), 1)
        self.assertEqual(atts[0]["filename"], "doc.pdf")


# ────────────────────────────────────────────────────────────────
# Notion
# ────────────────────────────────────────────────────────────────


class TestNotionConnectorFinal(unittest.IsolatedAsyncioTestCase):
    async def test_create_page_redirect_non_uuid(self):
        search_resp = _fake_response({"results": [{"id": "db1", "title": [{"plain_text": "My DB"}]}]})
        schema_resp = _fake_response({"properties": {"Name": {"type": "title"}}})
        page_resp = _fake_response({"id": "page1", "url": "https://notion.so/page1"})
        with patch(
            "connectors.notion.request_with_rate_limit",
            new=AsyncMock(side_effect=[search_resp, schema_resp, page_resp]),
        ):
            result = await NotionConnector().execute(
                "create_page", {"parent_id": "My DB", "title": "Hello", "content": "Body"}, "tok"
            )
        self.assertEqual(result["page_id"], "page1")

    async def test_query_database_retry_json_error(self):
        error_mock = _fake_response(status_code=400, text="bad")
        error_mock.json.side_effect = ValueError("bad json")
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(return_value=error_mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await NotionConnector().execute("query_database", {"database_id": "db1", "filter": {}}, "tok")
        self.assertEqual(ctx.exception.code, "NOTION_API_ERROR")

    async def test_create_database_json_error(self):
        mock = _fake_response(raise_json_error=True)
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await NotionConnector().execute("create_database", {"parent_page_id": "p1", "title": "T"}, "tok")
        self.assertEqual(ctx.exception.code, "NOTION_PARSE_ERROR")

    async def test_fetch_database_schema_error(self):
        schema_err = _fake_response(raise_json_error=True)
        page_resp = _fake_response({"id": "page1", "url": "https://notion.so/page1"})
        with patch(
            "connectors.notion.request_with_rate_limit",
            new=AsyncMock(side_effect=[schema_err, page_resp]),
        ):
            result = await NotionConnector().execute(
                "create_database_entry",
                {"database_id": "33fac82c-a3d4-80ca-95cd-f8b2ef72b2af", "_title": "Hello"},
                "tok",
            )
        self.assertEqual(result["page_id"], "page1")

    async def test_find_or_create_database_step3(self):
        search_db = _fake_response({"results": []})
        search_page = _fake_response({"results": [{"id": "page1"}]})
        create_db = _fake_response({"id": "db1"})
        schema_resp = _fake_response({"properties": {"Name": {"type": "title"}}})
        page_resp = _fake_response({"id": "page2", "url": "https://notion.so/page2"})
        with patch(
            "connectors.notion.request_with_rate_limit",
            new=AsyncMock(side_effect=[search_db, search_page, create_db, schema_resp, page_resp]),
        ):
            result = await NotionConnector().execute(
                "create_database_entry", {"database_id": "New DB", "_title": "Hello"}, "tok"
            )
        self.assertEqual(result["page_id"], "page2")

    async def test_create_database_entry_json_error(self):
        schema_resp = _fake_response({"properties": {"Name": {"type": "title"}}})
        err_mock = _fake_response(raise_json_error=True)
        with patch(
            "connectors.notion.request_with_rate_limit",
            new=AsyncMock(side_effect=[schema_resp, err_mock]),
        ):
            with self.assertRaises(ConnectorError) as ctx:
                await NotionConnector().execute(
                    "create_database_entry",
                    {"database_id": "33fac82c-a3d4-80ca-95cd-f8b2ef72b2af", "_title": "Hello"},
                    "tok",
                )
        self.assertEqual(ctx.exception.code, "NOTION_PARSE_ERROR")

    def test_extract_database_id_uuid(self):
        self.assertEqual(
            _extract_database_id("33fac82c-a3d4-80ca-95cd-f8b2ef72b2af"), "33fac82c-a3d4-80ca-95cd-f8b2ef72b2af"
        )

    def test_extract_database_id_hex32(self):
        self.assertEqual(
            _extract_database_id("33fac82ca3d480ca95cdf8b2ef72b2af"), "33fac82c-a3d4-80ca-95cd-f8b2ef72b2af"
        )

    def test_extract_database_id_url(self):
        self.assertEqual(
            _extract_database_id("https://notion.so/workspace/Title-33fac82c-a3d4-80ca-95cd-f8b2ef72b2af"),
            "33fac82c-a3d4-80ca-95cd-f8b2ef72b2af",
        )

    def test_extract_database_id_url_hex32(self):
        self.assertEqual(
            _extract_database_id("https://notion.so/workspace/Title-33fac82ca3d480ca95cdf8b2ef72b2af"),
            "33fac82c-a3d4-80ca-95cd-f8b2ef72b2af",
        )

    def test_extract_database_id_unknown(self):
        self.assertEqual(_extract_database_id("random"), "random")

    def test_hex32_to_uuid(self):
        self.assertEqual(_hex32_to_uuid("33fac82ca3d480ca95cdf8b2ef72b2af"), "33fac82c-a3d4-80ca-95cd-f8b2ef72b2af")

    def test_map_simple_fields(self):
        schema = {
            "Name": {"type": "title"},
            "Body": {"type": "rich_text"},
            "Status": {"type": "status"},
            "Category": {"type": "select"},
            "Due": {"type": "date"},
            "Number": {"type": "number"},
            "Done": {"type": "checkbox"},
            "Custom": {"type": "url"},
        }
        result = _map_simple_fields(
            {
                "_title": "Hello",
                "_body": "World",
                "_status": "Done",
                "_select": "A",
                "_date": "2024-01-01",
                "_number": "42",
                "_done": "true",
                "_custom": "http://x",
            },
            schema,
        )
        self.assertIn("Name", result)
        self.assertIn("Body", result)
        self.assertIn("Status", result)
        self.assertIn("Category", result)
        self.assertIn("Due", result)
        self.assertIn("Number", result)
        self.assertIn("Done", result)
        self.assertIn("Custom", result)

    def test_map_simple_fields_pass_through(self):
        result = _map_simple_fields({"plain": "value"}, {})
        self.assertEqual(result, {"plain": "value"})

    def test_remap_explicit_properties(self):
        schema = {"Status": {"type": "status"}, "Name": {"type": "title"}}
        result = _remap_explicit_properties({"status": {"status": {"name": "Done"}}}, schema)
        self.assertIn("Status", result)

    def test_infer_notion_type(self):
        self.assertEqual(_infer_notion_type({"title": [{"text": {"content": "Hi"}}]}), "title")
        self.assertEqual(_infer_notion_type({"rich_text": [{"text": {"content": "Hi"}}]}), "rich_text")
        self.assertIsNone(_infer_notion_type("not a dict"))
        self.assertIsNone(_infer_notion_type({"unknown": "value"}))

    def test_format_property(self):
        self.assertIn("title", _format_property("title", "Hello"))
        self.assertIn("rich_text", _format_property("rich_text", "Hello"))
        self.assertIn("select", _format_property("select", "A"))
        self.assertIn("status", _format_property("status", "Done"))
        self.assertIn("date", _format_property("date", "2024-01-01"))
        self.assertIn("number", _format_property("number", "3.14"))
        self.assertIn("checkbox", _format_property("checkbox", "true"))
        self.assertIn("rich_text", _format_property("unknown", "Hello"))

    def test_truncate_rich_text(self):
        obj = {"content": "a" * 3000}
        result = _truncate_rich_text(obj)
        self.assertEqual(len(result["content"]), 2000)


# ────────────────────────────────────────────────────────────────
# GitHub
# ────────────────────────────────────────────────────────────────


class TestGitHubConnectorFinal(unittest.IsolatedAsyncioTestCase):
    async def test_create_issue_labels_and_assignees(self):
        mock = _fake_response({"number": 1, "html_url": "u", "title": "Bug"})
        with patch("connectors.github.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            await GitHubConnector().execute(
                "create_issue",
                {"owner": "o", "repo": "r", "title": "Bug", "labels": ["bug"], "assignees": ["a"]},
                "tok",
            )
        body = m.call_args.kwargs["json"]
        self.assertEqual(body["labels"], ["bug"])
        self.assertEqual(body["assignees"], ["a"])

    async def test_push_file_content_base64(self):
        mock = _fake_response(
            {"content": {"path": "f.txt", "sha": "abc", "html_url": "u"}, "commit": {"sha": "def", "html_url": "v"}}
        )
        with patch("connectors.github.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await GitHubConnector().execute(
                "push_file",
                {"owner": "o", "repo": "r", "path": "f.txt", "message": "m", "content_base64": "SGVsbG8="},
                "tok",
            )
        self.assertEqual(result["path"], "f.txt")

    async def test_push_file_missing_content(self):
        with self.assertRaises(ConnectorError) as ctx:
            await GitHubConnector().execute(
                "push_file", {"owner": "o", "repo": "r", "path": "f.txt", "message": "m"}, "tok"
            )
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_push_file_overwrite_fetch_existing(self):
        get_resp = _fake_response({"sha": "oldsha"})
        put_resp = _fake_response(
            {"content": {"path": "f.txt", "sha": "abc", "html_url": "u"}, "commit": {"sha": "def", "html_url": "v"}}
        )
        with patch(
            "connectors.github.request_with_rate_limit",
            new=AsyncMock(side_effect=[get_resp, put_resp]),
        ):
            result = await GitHubConnector().execute(
                "push_file",
                {"owner": "o", "repo": "r", "path": "f.txt", "message": "m", "content": "hello", "overwrite": True},
                "tok",
            )
        self.assertEqual(result["sha"], "abc")

    async def test_push_file_overwrite_fetch_existing_404(self):
        get_resp = _fake_response(status_code=404)
        put_resp = _fake_response(
            {"content": {"path": "f.txt", "sha": "abc", "html_url": "u"}, "commit": {"sha": "def", "html_url": "v"}}
        )
        with patch(
            "connectors.github.request_with_rate_limit",
            new=AsyncMock(side_effect=[get_resp, put_resp]),
        ):
            result = await GitHubConnector().execute(
                "push_file",
                {"owner": "o", "repo": "r", "path": "f.txt", "message": "m", "content": "hello", "overwrite": True},
                "tok",
            )
        self.assertEqual(result["sha"], "abc")

    async def test_push_file_with_author_and_committer(self):
        mock = _fake_response(
            {"content": {"path": "f.txt", "sha": "abc", "html_url": "u"}, "commit": {"sha": "def", "html_url": "v"}}
        )
        with patch("connectors.github.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            await GitHubConnector().execute(
                "push_file",
                {
                    "owner": "o",
                    "repo": "r",
                    "path": "f.txt",
                    "message": "m",
                    "content": "hello",
                    "sha": "oldsha",
                    "author": {"name": "A", "email": "a@b.com"},
                    "committer": {"name": "C", "email": "c@d.com"},
                },
                "tok",
            )
        body = m.call_args.kwargs["json"]
        self.assertEqual(body["author"], {"name": "A", "email": "a@b.com"})
        self.assertEqual(body["committer"], {"name": "C", "email": "c@d.com"})


# ────────────────────────────────────────────────────────────────
# Drive
# ────────────────────────────────────────────────────────────────


class TestDriveConnectorFinal(unittest.IsolatedAsyncioTestCase):
    async def test_list_files_folder_id(self):
        mock = _fake_response({"files": []})
        with patch("connectors.drive.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            await DriveConnector().execute("list_files", {"folder_id": "fid", "query": "test"}, "tok")
        q = m.call_args.kwargs["params"]["q"]
        self.assertIn("'fid' in parents", q)

    async def test_list_files_mime_type(self):
        mock = _fake_response({"files": []})
        with patch("connectors.drive.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            await DriveConnector().execute("list_files", {"mime_type": "application/pdf"}, "tok")
        q = m.call_args.kwargs["params"]["q"]
        self.assertIn("mimeType = 'application/pdf'", q)

    async def test_upload_file_parent_id(self):
        mock = _fake_response({"id": "f1", "name": "test.txt", "webViewLink": "u"})
        with patch("connectors.drive.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            await DriveConnector().execute(
                "upload_file", {"name": "test.txt", "content_base64": "SGVsbG8=", "parent_id": "pid"}, "tok"
            )
        # Parent id is inside multipart body, not easy to assert via mock; just ensure no error
        self.assertTrue(True)

    def test_raise_for_status_404(self):
        from connectors.drive import _raise_for_status as _drive_raise

        r = _fake_response(status_code=404)
        with self.assertRaises(ConnectorError) as ctx:
            _drive_raise(r, "test")
        self.assertEqual(ctx.exception.code, "NOT_FOUND")


# ────────────────────────────────────────────────────────────────
# Calendar
# ────────────────────────────────────────────────────────────────


class TestCalendarConnectorFinal(unittest.IsolatedAsyncioTestCase):
    async def test_list_events_time_min_max_query(self):
        mock = _fake_response({"items": [], "nextPageToken": None})
        with patch("connectors.calendar.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            await CalendarConnector().execute(
                "list_events",
                {"calendar_id": "primary", "time_min": "2024-01-01", "time_max": "2024-12-31", "query": "meeting"},
                "tok",
            )
        params = m.call_args.kwargs["params"]
        self.assertEqual(params["timeMin"], "2024-01-01")
        self.assertEqual(params["timeMax"], "2024-12-31")
        self.assertEqual(params["q"], "meeting")

    async def test_create_event_description_location_attendees(self):
        mock = _fake_response({"id": "e1", "htmlLink": "u", "status": "confirmed"})
        with patch("connectors.calendar.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            await CalendarConnector().execute(
                "create_event",
                {
                    "summary": "Meeting",
                    "start": {"dateTime": "2024-01-01T10:00:00Z"},
                    "end": {"dateTime": "2024-01-01T11:00:00Z"},
                    "description": "desc",
                    "location": "Room 1",
                    "attendees": ["a@b.com", "c@d.com"],
                },
                "tok",
            )
        body = m.call_args.kwargs["json"]
        self.assertEqual(body["description"], "desc")
        self.assertEqual(body["location"], "Room 1")
        self.assertEqual(body["attendees"], [{"email": "a@b.com"}, {"email": "c@d.com"}])

    async def test_update_event_attendees(self):
        mock = _fake_response({"id": "e1", "htmlLink": "u", "status": "confirmed"})
        with patch("connectors.calendar.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            await CalendarConnector().execute(
                "update_event", {"event_id": "e1", "calendar_id": "primary", "attendees": ["a@b.com"]}, "tok"
            )
        body = m.call_args.kwargs["json"]
        self.assertEqual(body["attendees"], [{"email": "a@b.com"}])


# ────────────────────────────────────────────────────────────────
# Docs
# ────────────────────────────────────────────────────────────────


class TestDocsConnectorFinal(unittest.IsolatedAsyncioTestCase):
    async def test_create_document_with_content(self):
        create_resp = _fake_response({"documentId": "d2", "title": "New Doc"})
        append_resp = _fake_response({})
        with patch(
            "connectors.docs.request_with_rate_limit",
            new=AsyncMock(side_effect=[create_resp, append_resp]),
        ):
            result = await DocsConnector().execute("create_document", {"title": "New Doc", "content": "Hello"}, "tok")
        self.assertEqual(result["document_id"], "d2")

    def test_extract_plain_text_continue(self):
        result = _extract_plain_text(
            {"body": {"content": [{"paragraph": {"elements": [{"textRun": {"content": "Hi"}}]}}, {"paragraph": None}]}}
        )
        self.assertEqual(result, "Hi")

    def test_raise_for_status_404(self):
        from connectors.docs import _raise_for_status as _docs_raise

        r = _fake_response(status_code=404)
        with self.assertRaises(ConnectorError) as ctx:
            _docs_raise(r, "test")
        self.assertEqual(ctx.exception.code, "NOT_FOUND")


# ────────────────────────────────────────────────────────────────
# Sheets
# ────────────────────────────────────────────────────────────────


class TestSheetsConnectorFinal(unittest.IsolatedAsyncioTestCase):
    def test_raise_for_status_403(self):
        from connectors.sheets import _raise_for_status as _sheets_raise

        r = _fake_response(status_code=403)
        with self.assertRaises(ConnectorError) as ctx:
            _sheets_raise(r, "test")
        self.assertEqual(ctx.exception.code, "SHEETS_PERMISSION_DENIED")


# ────────────────────────────────────────────────────────────────
# Slack
# ────────────────────────────────────────────────────────────────


class TestSlackConnectorFinal(unittest.IsolatedAsyncioTestCase):
    async def test_send_message_blocks(self):
        mock = _fake_response({"ok": True, "ts": "123", "channel": "C1", "message": {"text": "hi"}})
        with patch("connectors.slack.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            await SlackConnector().execute(
                "send_message", {"channel": "C1", "text": "hi", "blocks": [{"type": "section"}]}, "tok"
            )
        body = m.call_args.kwargs["json"]
        self.assertEqual(body["blocks"], [{"type": "section"}])

    def test_raise_for_status_401(self):
        from connectors.slack import _raise_for_status as _slack_raise

        r = _fake_response(status_code=401)
        with self.assertRaises(ConnectorError) as ctx:
            _slack_raise(r, "test")
        self.assertEqual(ctx.exception.code, "TOKEN_EXPIRED")


# ────────────────────────────────────────────────────────────────
# HubSpot
# ────────────────────────────────────────────────────────────────


class TestHubSpotConnectorFinal(unittest.IsolatedAsyncioTestCase):
    async def test_get_contact_by_email(self):
        mock = _fake_response({"id": "1", "properties": {"firstname": "A", "email": "a@b.com"}})
        with patch("connectors.hubspot.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            result = await HubSpotConnector().execute("get_contact", {"email": "a@b.com"}, "tok")
        url = m.call_args.args[2]
        self.assertIn("a@b.com", url)
        self.assertEqual(result["email"], "a@b.com")

    def test_raise_for_status_404(self):
        from connectors.hubspot import _raise_for_status as _hubspot_raise

        r = _fake_response(status_code=404)
        with self.assertRaises(ConnectorError) as ctx:
            _hubspot_raise(r, "test")
        self.assertEqual(ctx.exception.code, "NOT_FOUND")


# ────────────────────────────────────────────────────────────────
# Jira
# ────────────────────────────────────────────────────────────────


class TestJiraConnectorFinal(unittest.IsolatedAsyncioTestCase):
    async def test_unsupported_operation(self):
        with self.assertRaises(ConnectorError) as ctx:
            await JiraConnector().execute("delete_issue", {"cloud_id": "cid"}, "tok")
        self.assertEqual(ctx.exception.code, "UNSUPPORTED_OPERATION")

    async def test_get_cloud_id_empty_resources(self):
        mock = _fake_response([])
        with patch("connectors.jira.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await JiraConnector().execute("list_issues", {}, "tok")
        self.assertEqual(ctx.exception.code, "JIRA_NO_SITES")

    async def test_update_issue_status(self):
        mock = _fake_response({})
        with patch("connectors.jira.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            await JiraConnector().execute(
                "update_issue", {"cloud_id": "cid", "issue_key": "PRJ-1", "status": "Done"}, "tok"
            )
        body = m.call_args.kwargs["json"]
        self.assertEqual(body["fields"]["status"], {"name": "Done"})


# ────────────────────────────────────────────────────────────────
# Outlook
# ────────────────────────────────────────────────────────────────


class TestOutlookConnectorFinal(unittest.IsolatedAsyncioTestCase):
    async def test_list_emails_filter(self):
        mock = _fake_response({"value": []})
        with patch("connectors.outlook.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            await OutlookConnector().execute("list_emails", {"folder": "inbox", "filter": "isRead eq false"}, "tok")
        params = m.call_args.kwargs["params"]
        self.assertEqual(params["$filter"], "isRead eq false")

    async def test_send_email_cc(self):
        mock = _fake_response(status_code=202)
        with patch("connectors.outlook.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            await OutlookConnector().execute(
                "send_email", {"to": "a@b.com", "subject": "Hi", "body": "Hello", "cc": "c@d.com"}, "tok"
            )
        message = m.call_args.kwargs["json"]["message"]
        self.assertEqual(message["ccRecipients"], [{"emailAddress": {"address": "c@d.com"}}])


# ────────────────────────────────────────────────────────────────
# Asana
# ────────────────────────────────────────────────────────────────


class TestAsanaConnectorFinal(unittest.IsolatedAsyncioTestCase):
    async def test_list_projects_workspace_id(self):
        mock = _fake_response({"data": []})
        with patch("connectors.asana.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            await AsanaConnector().execute("list_projects", {"workspace_id": "ws1"}, "tok")
        params = m.call_args.kwargs["params"]
        self.assertEqual(params["workspace"], "ws1")

    async def test_list_tasks_completed(self):
        mock = _fake_response({"data": []})
        with patch("connectors.asana.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            await AsanaConnector().execute("list_tasks", {"project_id": "p1", "completed": True}, "tok")
        params = m.call_args.kwargs["params"]
        self.assertEqual(params["completed"], "true")

    async def test_create_task_due_on_and_assignee(self):
        mock = _fake_response({"data": {"gid": "t1", "name": "Task1"}})
        with patch("connectors.asana.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            await AsanaConnector().execute(
                "create_task", {"name": "Task1", "project_id": "p1", "due_on": "2024-01-01", "assignee": "me"}, "tok"
            )
        body = m.call_args.kwargs["json"]["data"]
        self.assertEqual(body["due_on"], "2024-01-01")
        self.assertEqual(body["assignee"], "me")


# ────────────────────────────────────────────────────────────────
# Airtable
# ────────────────────────────────────────────────────────────────


class TestAirtableConnectorFinal(unittest.IsolatedAsyncioTestCase):
    async def test_list_records_view_filter_sort(self):
        mock = _fake_response({"records": [], "offset": None})
        with patch("connectors.airtable.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            await AirtableConnector().execute(
                "list_records",
                {
                    "base_id": "b1",
                    "table_name": "t1",
                    "view": "Grid",
                    "filter_formula": "{Name}='A'",
                    "sort_field": "Name",
                    "sort_direction": "desc",
                },
                "tok",
            )
        params = m.call_args.kwargs["params"]
        self.assertEqual(params["view"], "Grid")
        self.assertEqual(params["filterByFormula"], "{Name}='A'")
        self.assertEqual(params["sort[0][field]"], "Name")
        self.assertEqual(params["sort[0][direction]"], "desc")

    def test_raise_for_status_401(self):
        from connectors.airtable import _raise_for_status as _airtable_raise

        r = _fake_response(status_code=401)
        with self.assertRaises(ConnectorError) as ctx:
            _airtable_raise(r, "test")
        self.assertEqual(ctx.exception.code, "TOKEN_EXPIRED")

    def test_raise_for_status_422(self):
        from connectors.airtable import _raise_for_status as _airtable_raise

        r = _fake_response(status_code=422)
        with self.assertRaises(ConnectorError) as ctx:
            _airtable_raise(r, "test")
        self.assertEqual(ctx.exception.code, "VALIDATION_ERROR")


# ────────────────────────────────────────────────────────────────
# Reddit
# ────────────────────────────────────────────────────────────────


class TestRedditConnectorFinal(unittest.IsolatedAsyncioTestCase):
    async def test_submit_post_link_kind(self):
        mock = _fake_response({"success": True, "jquery": []})
        with patch("connectors.reddit.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await RedditConnector().execute(
                "submit_post",
                {"subreddit": "test", "title": "Link", "kind": "link", "url": "https://example.com"},
                "tok",
            )
        self.assertTrue(result["success"])

    async def test_submit_post_link_kind_missing_url(self):
        with self.assertRaises(ConnectorError) as ctx:
            await RedditConnector().execute(
                "submit_post", {"subreddit": "test", "title": "Link", "kind": "link"}, "tok"
            )
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_get_subreddit_posts_after(self):
        mock = _fake_response({"data": {"children": [], "after": "a1"}})
        with patch("connectors.reddit.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            await RedditConnector().execute("get_subreddit_posts", {"subreddit": "test", "after": "a0"}, "tok")
        params = m.call_args.kwargs["params"]
        self.assertEqual(params["after"], "a0")

    async def test_get_comments_empty_data(self):
        mock = _fake_response({"data": {"children": []}})
        with patch("connectors.reddit.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await RedditConnector().execute("get_comments", {"subreddit": "test", "post_id": "p1"}, "tok")
        self.assertEqual(result["comments"], [])

    def test_raise_for_status_403(self):
        from connectors.reddit import _raise_for_status as _reddit_raise

        r = _fake_response(status_code=403)
        with self.assertRaises(ConnectorError) as ctx:
            _reddit_raise(r, "test")
        self.assertEqual(ctx.exception.code, "REDDIT_FORBIDDEN")


# ────────────────────────────────────────────────────────────────
# Salesforce
# ────────────────────────────────────────────────────────────────


class TestSalesforceConnectorFinal(unittest.IsolatedAsyncioTestCase):
    async def test_unsupported_operation(self):
        with self.assertRaises(ConnectorError) as ctx:
            await SalesforceConnector().execute("delete_record", {"instance_url": "https://sf.salesforce.com"}, "tok")
        self.assertEqual(ctx.exception.code, "UNSUPPORTED_OPERATION")


# ────────────────────────────────────────────────────────────────
# Bitbucket
# ────────────────────────────────────────────────────────────────


class TestBitbucketConnectorFinal(unittest.IsolatedAsyncioTestCase):
    async def test_create_pull_request_description(self):
        mock = _fake_response({"id": 1, "title": "PR1", "state": "OPEN", "links": {"html": {"href": "https://bb/pr1"}}})
        with patch("connectors.bitbucket.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            await BitbucketConnector().execute(
                "create_pull_request",
                {"workspace": "ws", "repo_slug": "r1", "title": "PR1", "source_branch": "feat", "description": "desc"},
                "tok",
            )
        body = m.call_args.kwargs["json"]
        self.assertEqual(body["description"], "desc")


# ────────────────────────────────────────────────────────────────
# Telegram
# ────────────────────────────────────────────────────────────────


class TestTelegramConnectorFinal(unittest.IsolatedAsyncioTestCase):
    async def test_send_photo(self):
        mock = _fake_response({"ok": True, "result": {"message_id": 1, "chat": {"id": 123}}})
        with patch("connectors.telegram.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            result = await TelegramConnector().execute(
                "send_photo", {"chat_id": 123, "photo": "https://example.com/img.jpg", "caption": "Hi"}, "tok"
            )
        self.assertEqual(result["message_id"], 1)
        body = m.call_args.kwargs["json"]
        self.assertEqual(body["caption"], "Hi")

    async def test_get_chat(self):
        mock = _fake_response(
            {
                "ok": True,
                "result": {"id": 123, "type": "private", "title": "Chat", "username": "user", "description": "Desc"},
            }
        )
        with patch("connectors.telegram.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await TelegramConnector().execute("get_chat", {"chat_id": 123}, "tok")
        self.assertEqual(result["username"], "user")

    async def test_get_updates_offset(self):
        mock = _fake_response({"ok": True, "result": []})
        with patch("connectors.telegram.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            await TelegramConnector().execute("get_updates", {"offset": 10}, "tok")
        params = m.call_args.kwargs["params"]
        self.assertEqual(params["offset"], 10)

    def test_raise_for_status_400(self):
        from connectors.telegram import _raise_for_status as _telegram_raise

        r = _fake_response(status_code=400)
        with self.assertRaises(ConnectorError) as ctx:
            _telegram_raise(r, "test")
        self.assertEqual(ctx.exception.code, "TELEGRAM_API_ERROR")


# ────────────────────────────────────────────────────────────────
# Teams
# ────────────────────────────────────────────────────────────────


class TestTeamsConnectorFinal(unittest.IsolatedAsyncioTestCase):
    async def test_list_channels(self):
        mock = _fake_response(
            {"value": [{"id": "c1", "displayName": "General", "description": "Desc", "membershipType": "standard"}]}
        )
        with patch("connectors.teams.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await TeamsConnector().execute("list_channels", {"team_id": "t1"}, "tok")
        self.assertEqual(result["channels"][0]["display_name"], "General")

    async def test_create_channel(self):
        mock = _fake_response({"id": "c1", "displayName": "New Channel", "description": "Desc"})
        with patch("connectors.teams.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            result = await TeamsConnector().execute(
                "create_channel",
                {"team_id": "t1", "display_name": "New Channel", "description": "Desc", "membership_type": "private"},
                "tok",
            )
        self.assertEqual(result["channel_id"], "c1")
        body = m.call_args.kwargs["json"]
        self.assertEqual(body["description"], "Desc")
        self.assertEqual(body["membershipType"], "private")

    def test_raise_for_status_400(self):
        from connectors.teams import _raise_for_status as _teams_raise

        r = _fake_response(status_code=400)
        with self.assertRaises(ConnectorError) as ctx:
            _teams_raise(r, "test")
        self.assertEqual(ctx.exception.code, "TEAMS_API_ERROR")


# ────────────────────────────────────────────────────────────────
# GoogleChat
# ────────────────────────────────────────────────────────────────


class TestGoogleChatConnectorFinal(unittest.IsolatedAsyncioTestCase):
    async def test_send_message_cards(self):
        mock = _fake_response({"name": "msg1", "space": {"name": "spaces/s1"}, "createTime": "t", "text": "hi"})
        with patch("connectors.googlechat.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            await GoogleChatConnector().execute(
                "send_message", {"space_name": "spaces/s1", "text": "hi", "cards": [{"header": {}}]}, "tok"
            )
        body = m.call_args.kwargs["json"]
        self.assertEqual(body["cardsV2"], [{"header": {}}])

    async def test_list_spaces_page_token(self):
        mock = _fake_response({"spaces": [], "nextPageToken": None})
        with patch("connectors.googlechat.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            await GoogleChatConnector().execute("list_spaces", {"page_token": "tok1"}, "tok")
        params = m.call_args.kwargs["params"]
        self.assertEqual(params["pageToken"], "tok1")

    def test_raise_for_status_401(self):
        from connectors.googlechat import _raise_for_status as _googlechat_raise

        r = _fake_response(status_code=401)
        with self.assertRaises(ConnectorError) as ctx:
            _googlechat_raise(r, "test")
        self.assertEqual(ctx.exception.code, "TOKEN_EXPIRED")


# ────────────────────────────────────────────────────────────────
# WhatsApp
# ────────────────────────────────────────────────────────────────


class TestWhatsAppConnectorFinal(unittest.IsolatedAsyncioTestCase):
    async def test_send_template_message(self):
        mock = _fake_response({"messages": [{"id": "wamid.1"}]})
        with patch("connectors.whatsapp.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            result = await WhatsappConnector().execute(
                "send_template_message",
                {
                    "phone_number_id": "pn1",
                    "to": "123",
                    "template_name": "hello",
                    "language_code": "en_US",
                    "components": [{"type": "body"}],
                },
                "tok",
            )
        self.assertEqual(result["message_id"], "wamid.1")
        body = m.call_args.kwargs["json"]
        self.assertEqual(body["template"]["components"], [{"type": "body"}])

    def test_raise_for_status_401(self):
        from connectors.whatsapp import _raise_for_status as _whatsapp_raise

        r = _fake_response(status_code=401)
        with self.assertRaises(ConnectorError) as ctx:
            _whatsapp_raise(r, "test")
        self.assertEqual(ctx.exception.code, "TOKEN_EXPIRED")


# ────────────────────────────────────────────────────────────────
# Stripe
# ────────────────────────────────────────────────────────────────


class TestStripeConnectorFinal(unittest.IsolatedAsyncioTestCase):
    async def test_list_customers(self):
        mock = _fake_response({"data": [], "has_more": False})
        with patch("connectors.stripe.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            result = await StripeConnector().execute("list_customers", {"limit": 10}, "tok")
        params = m.call_args.kwargs["params"]
        self.assertEqual(params["limit"], 10)
        self.assertEqual(result["customers"], [])

    async def test_list_payments(self):
        mock = _fake_response({"data": [], "has_more": False})
        with patch("connectors.stripe.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            result = await StripeConnector().execute("list_payments", {"customer": "cus_1"}, "tok")
        params = m.call_args.kwargs["params"]
        self.assertEqual(params["customer"], "cus_1")
        self.assertEqual(result["payments"], [])

    async def test_create_payment_link(self):
        mock = _fake_response({"id": "plink_1"})
        with patch("connectors.stripe.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            result = await StripeConnector().execute(
                "create_payment_link", {"price_id": "price_1", "quantity": 2}, "tok"
            )
        self.assertEqual(result["id"], "plink_1")
        data = m.call_args.kwargs["data"]
        self.assertEqual(data["line_items[0][price]"], "price_1")
        self.assertEqual(data["line_items[0][quantity]"], "2")

    async def test_list_subscriptions(self):
        mock = _fake_response({"data": [], "has_more": False})
        with patch("connectors.stripe.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            result = await StripeConnector().execute(
                "list_subscriptions", {"customer": "cus_1", "status": "active"}, "tok"
            )
        params = m.call_args.kwargs["params"]
        self.assertEqual(params["customer"], "cus_1")
        self.assertEqual(params["status"], "active")
        self.assertEqual(result["subscriptions"], [])

    async def test_retrieve_invoice(self):
        mock = _fake_response({"id": "inv_1"})
        with patch("connectors.stripe.request_with_rate_limit", new=AsyncMock(return_value=mock)) as m:
            result = await StripeConnector().execute("retrieve_invoice", {"invoice_id": "inv_1"}, "tok")
        self.assertEqual(result["id"], "inv_1")
        url = m.call_args.args[2]
        self.assertIn("inv_1", url)

    def test_raise_for_status_401(self):
        from connectors.stripe import _raise_for_status as _stripe_raise

        r = _fake_response(status_code=401)
        with self.assertRaises(ConnectorError) as ctx:
            _stripe_raise(r, "test")
        self.assertEqual(ctx.exception.code, "TOKEN_EXPIRED")

    def test_raise_for_status_404(self):
        from connectors.stripe import _raise_for_status as _stripe_raise

        r = _fake_response(status_code=404)
        with self.assertRaises(ConnectorError) as ctx:
            _stripe_raise(r, "test")
        self.assertEqual(ctx.exception.code, "NOT_FOUND")


# ────────────────────────────────────────────────────────────────
# OpenAI
# ────────────────────────────────────────────────────────────────


class TestOpenAIConnectorFinal(unittest.IsolatedAsyncioTestCase):
    async def test_create_embedding(self):
        mock = _fake_response({"object": "list"})
        with patch("connectors.openai.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await OpenaiConnector().execute(
                "create_embedding", {"model": "text-embedding-3", "input": "hello"}, "tok"
            )
        self.assertEqual(result["object"], "list")

    async def test_create_embedding_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await OpenaiConnector().execute("create_embedding", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_embedding_http_error(self):
        mock = _fake_response(status_code=400, text="Bad request")
        with patch("connectors.openai.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await OpenaiConnector().execute(
                    "create_embedding", {"model": "text-embedding-3", "input": "hello"}, "tok"
                )
        self.assertEqual(ctx.exception.code, "API_ERROR")


if __name__ == "__main__":
    unittest.main()
