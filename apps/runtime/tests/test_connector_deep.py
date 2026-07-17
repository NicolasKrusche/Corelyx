"""Deep connector tests for under-tested native connectors."""

from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from connectors.base import ConnectorError
from connectors.notion import NotionConnector
from connectors.gmail import GmailConnector
from connectors.drive import DriveConnector
from connectors.github import GitHubConnector
from connectors.hubspot import HubSpotConnector
from connectors.calendar import CalendarConnector
from connectors.sheets import SheetsConnector
from connectors.docs import DocsConnector
from connectors.asana import AsanaConnector
from connectors.jira import JiraConnector
from connectors.outlook import OutlookConnector
from connectors.airtable import AirtableConnector
from connectors.bitbucket import BitbucketConnector
from connectors.gitlab import GitLabConnector
from connectors.reddit import RedditConnector
from connectors.salesforce import SalesforceConnector


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
# Notion
# ────────────────────────────────────────────────────────────────


class TestNotionConnectorDeep(unittest.IsolatedAsyncioTestCase):
    async def test_read_page_success(self):
        page_resp = _fake_response({"id": "p1", "properties": {"Name": {"title": [{"text": {"content": "Hello"}}]}}})
        blocks_resp = _fake_response({"results": [{"id": "b1"}]})
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(side_effect=[page_resp, blocks_resp])):
            result = await NotionConnector().execute("read_page", {"page_id": "p1"}, "tok")
        self.assertEqual(result["page"]["id"], "p1")
        self.assertEqual(result["blocks"], [{"id": "b1"}])

    async def test_read_page_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await NotionConnector().execute("read_page", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_read_page_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await NotionConnector().execute("read_page", {"page_id": "p1"}, "tok")
        self.assertEqual(ctx.exception.code, "NOTION_API_ERROR")

    async def test_append_to_page_success(self):
        mock = _fake_response({"id": "p1"})
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await NotionConnector().execute("append_to_page", {"page_id": "p1", "content": "Hello"}, "tok")
        self.assertEqual(result["page_id"], "p1")
        self.assertEqual(result["appended_blocks"], 1)

    async def test_append_to_page_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await NotionConnector().execute("append_to_page", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_append_to_page_http_error(self):
        mock = _fake_response(status_code=400, text="Bad request")
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await NotionConnector().execute("append_to_page", {"page_id": "p1", "content": "Hello"}, "tok")
        self.assertEqual(ctx.exception.code, "NOTION_API_ERROR")

    async def test_create_database_success(self):
        mock = _fake_response({"id": "db1", "url": "https://notion.so/db1"})
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await NotionConnector().execute(
                "create_database", {"parent_page_id": "p1", "title": "Tasks"}, "tok"
            )
        self.assertEqual(result["database_id"], "db1")
        self.assertEqual(result["title"], "Tasks")

    async def test_create_database_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await NotionConnector().execute("create_database", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_database_http_error(self):
        mock = _fake_response(status_code=400, text="Bad request")
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await NotionConnector().execute("create_database", {"parent_page_id": "p1"}, "tok")
        self.assertEqual(ctx.exception.code, "NOTION_API_ERROR")

    async def test_create_database_entry_success(self):
        schema_resp = _fake_response({"properties": {"Name": {"type": "title"}}})
        page_resp = _fake_response({"id": "page1", "url": "https://notion.so/page1"})
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(side_effect=[schema_resp, page_resp])):
            result = await NotionConnector().execute(
                "create_database_entry",
                {"database_id": "33fac82c-a3d4-80ca-95cd-f8b2ef72b2af", "_title": "Hello"},
                "tok",
            )
        self.assertEqual(result["page_id"], "page1")

    async def test_create_database_entry_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await NotionConnector().execute("create_database_entry", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_database_entry_http_error(self):
        schema_resp = _fake_response({"properties": {"Name": {"type": "title"}}})
        error_resp = _fake_response(status_code=400, text="Bad request")
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(side_effect=[schema_resp, error_resp])):
            with self.assertRaises(ConnectorError) as ctx:
                await NotionConnector().execute(
                    "create_database_entry",
                    {"database_id": "33fac82c-a3d4-80ca-95cd-f8b2ef72b2af", "_title": "Hello"},
                    "tok",
                )
        self.assertEqual(ctx.exception.code, "NOTION_API_ERROR")


# ────────────────────────────────────────────────────────────────
# Gmail
# ────────────────────────────────────────────────────────────────


class TestGmailConnectorDeep(unittest.IsolatedAsyncioTestCase):
    async def test_list_threads_success(self):
        mock = _fake_response({"threads": [{"id": "t1"}], "resultSizeEstimate": 1})
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await GmailConnector().execute("list_threads", {"query": "test", "max_results": 5}, "tok")
        self.assertEqual(result["threads"], [{"id": "t1"}])

    async def test_list_threads_http_error(self):
        mock = _fake_response(status_code=500, text="Internal Server Error")
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await GmailConnector().execute("list_threads", {}, "tok")
        self.assertEqual(ctx.exception.code, "GMAIL_API_ERROR")

    async def test_search_success(self):
        mock = _fake_response({"messages": [{"id": "m1"}], "resultSizeEstimate": 1})
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await GmailConnector().execute("search", {"query": "subject:hi", "max_results": 5}, "tok")
        self.assertEqual(result["emails"], [{"id": "m1"}])

    async def test_search_empty_query(self):
        mock = _fake_response({"messages": [{"id": "m1"}], "resultSizeEstimate": 1})
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await GmailConnector().execute("search", {}, "tok")
        self.assertEqual(result["emails"], [{"id": "m1"}])

    async def test_search_http_error(self):
        mock = _fake_response(status_code=500, text="Error")
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await GmailConnector().execute("search", {"query": "test"}, "tok")
        self.assertEqual(ctx.exception.code, "GMAIL_API_ERROR")

    async def test_get_attachment_success(self):
        mock = _fake_response({"data": "SGVsbG8="})
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await GmailConnector().execute(
                "get_attachment", {"message_id": "m1", "attachment_id": "a1"}, "tok"
            )
        self.assertEqual(result["message_id"], "m1")
        self.assertEqual(result["attachment_id"], "a1")
        self.assertEqual(result["size_bytes"], 5)

    async def test_get_attachment_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await GmailConnector().execute("get_attachment", {"message_id": "m1"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_get_attachment_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await GmailConnector().execute("get_attachment", {"message_id": "m1", "attachment_id": "a1"}, "tok")
        self.assertEqual(ctx.exception.code, "GMAIL_API_ERROR")

    async def test_label_email_success(self):
        mock = _fake_response({"id": "m1", "labelIds": ["INBOX", "LABEL_1"]})
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await GmailConnector().execute(
                "label_email", {"message_id": "m1", "add_label_ids": ["LABEL_1"]}, "tok"
            )
        self.assertEqual(result["message_id"], "m1")
        self.assertIn("LABEL_1", result["labels"])

    async def test_label_email_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await GmailConnector().execute("label_email", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_label_email_no_labels_raises_before_api_call(self):
        # A modify call with neither add nor remove labels makes Gmail return a
        # cryptic 400 ("No label ... updates provided"). The connector must catch
        # this up front and never hit the API.
        request_mock = AsyncMock()
        with patch("connectors.gmail.request_with_rate_limit", new=request_mock):
            with self.assertRaises(ConnectorError) as ctx:
                await GmailConnector().execute("label_email", {"message_id": "m1"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")
        request_mock.assert_not_called()

    async def test_label_email_http_error(self):
        mock = _fake_response(status_code=400, text="Bad Request")
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await GmailConnector().execute("label_email", {"message_id": "m1", "add_label_ids": ["LABEL_1"]}, "tok")
        self.assertEqual(ctx.exception.code, "GMAIL_API_ERROR")

    async def test_archive_email_archives_inbox_message(self):
        meta = _fake_response({"id": "m1", "labelIds": ["INBOX", "UNREAD"]})
        modify = _fake_response({"id": "m1", "labelIds": ["UNREAD"]})
        request_mock = AsyncMock(side_effect=[meta, modify])
        with patch("connectors.gmail.request_with_rate_limit", new=request_mock):
            result = await GmailConnector().execute("archive_email", {"message_id": "m1"}, "tok")
        self.assertTrue(result["archived"])
        self.assertNotIn("skipped", result)
        self.assertEqual(request_mock.await_count, 2)

    async def test_archive_email_skips_already_archived(self):
        # Removing INBOX from a message that isn't in the inbox is a pointless
        # write — the connector must not issue the modify call.
        meta = _fake_response({"id": "m1", "labelIds": ["UNREAD"]})
        request_mock = AsyncMock(return_value=meta)
        with patch("connectors.gmail.request_with_rate_limit", new=request_mock):
            result = await GmailConnector().execute("archive_email", {"message_id": "m1"}, "tok")
        self.assertTrue(result["skipped"])
        self.assertTrue(result["archived"])
        self.assertEqual(request_mock.await_count, 1)

    async def test_archive_email_skips_trashed_message(self):
        # Modifying a trashed message returns 400 "Precondition check failed";
        # the connector must skip instead of failing the run.
        meta = _fake_response({"id": "m1", "labelIds": ["TRASH"]})
        request_mock = AsyncMock(return_value=meta)
        with patch("connectors.gmail.request_with_rate_limit", new=request_mock):
            result = await GmailConnector().execute("archive_email", {"message_id": "m1"}, "tok")
        self.assertTrue(result["skipped"])
        self.assertFalse(result["archived"])
        self.assertEqual(request_mock.await_count, 1)

    async def test_archive_email_skips_missing_message(self):
        meta = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=meta)):
            result = await GmailConnector().execute("archive_email", {"message_id": "m1"}, "tok")
        self.assertTrue(result["skipped"])
        self.assertFalse(result["archived"])

    async def test_delete_email_defaults_to_trash(self):
        trash = _fake_response({"id": "m1"})
        request_mock = AsyncMock(return_value=trash)
        with patch("connectors.gmail.request_with_rate_limit", new=request_mock):
            result = await GmailConnector().execute("delete_email", {"message_id": "m1"}, "tok")
        self.assertTrue(result["deleted"])
        self.assertFalse(result["permanent"])
        args = request_mock.await_args_list[0].args
        self.assertEqual(args[1], "POST")
        self.assertTrue(args[2].endswith("/messages/m1/trash"))


# ────────────────────────────────────────────────────────────────
# Drive
# ────────────────────────────────────────────────────────────────


class TestDriveConnectorDeep(unittest.IsolatedAsyncioTestCase):
    async def test_upload_file_success(self):
        mock = _fake_response({"id": "f1", "name": "test.txt", "webViewLink": "https://drive.google.com/f1"})
        with patch("connectors.drive.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await DriveConnector().execute(
                "upload_file", {"name": "test.txt", "content_base64": "SGVsbG8=", "mime_type": "text/plain"}, "tok"
            )
        self.assertEqual(result["file_id"], "f1")
        self.assertEqual(result["name"], "test.txt")

    async def test_upload_file_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await DriveConnector().execute("upload_file", {"name": "test.txt"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_upload_file_invalid_base64(self):
        with self.assertRaises(ConnectorError) as ctx:
            await DriveConnector().execute("upload_file", {"name": "test.txt", "content_base64": "a"}, "tok")
        self.assertEqual(ctx.exception.code, "INVALID_PARAM")

    async def test_upload_file_http_error(self):
        mock = _fake_response(status_code=500, text="Error")
        with patch("connectors.drive.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await DriveConnector().execute("upload_file", {"name": "test.txt", "content_base64": "SGVsbG8="}, "tok")
        self.assertEqual(ctx.exception.code, "DRIVE_HTTP_ERROR")

    async def test_create_folder_success(self):
        mock = _fake_response({"id": "f1", "name": "New Folder"})
        with patch("connectors.drive.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await DriveConnector().execute("create_folder", {"name": "New Folder", "parent_id": "p1"}, "tok")
        self.assertEqual(result["folder_id"], "f1")
        self.assertEqual(result["name"], "New Folder")

    async def test_create_folder_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await DriveConnector().execute("create_folder", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_folder_http_error(self):
        mock = _fake_response(status_code=400, text="Bad Request")
        with patch("connectors.drive.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await DriveConnector().execute("create_folder", {"name": "New Folder"}, "tok")
        self.assertEqual(ctx.exception.code, "DRIVE_HTTP_ERROR")

    async def test_move_file_success(self):
        get_resp = _fake_response({"parents": ["old1"], "name": "file.txt"})
        patch_resp = _fake_response({"id": "f1", "name": "file.txt"})
        with patch("connectors.drive.request_with_rate_limit", new=AsyncMock(side_effect=[get_resp, patch_resp])):
            result = await DriveConnector().execute("move_file", {"file_id": "f1", "folder_id": "new1"}, "tok")
        self.assertEqual(result["file_id"], "f1")
        self.assertTrue(result["moved"])

    async def test_move_file_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await DriveConnector().execute("move_file", {"file_id": "f1"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_move_file_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.drive.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await DriveConnector().execute("move_file", {"file_id": "f1", "folder_id": "new1"}, "tok")
        self.assertEqual(ctx.exception.code, "NOT_FOUND")

    async def test_share_file_success(self):
        mock = _fake_response({"id": "perm1"})
        with patch("connectors.drive.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await DriveConnector().execute(
                "share_file", {"file_id": "f1", "email": "a@b.com", "role": "writer"}, "tok"
            )
        self.assertEqual(result["permission_id"], "perm1")
        self.assertEqual(result["role"], "writer")

    async def test_share_file_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await DriveConnector().execute("share_file", {"file_id": "f1"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_share_file_http_error(self):
        mock = _fake_response(status_code=403, text="Forbidden")
        with patch("connectors.drive.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await DriveConnector().execute("share_file", {"file_id": "f1", "email": "a@b.com"}, "tok")
        self.assertEqual(ctx.exception.code, "DRIVE_HTTP_ERROR")

    async def test_delete_file_success(self):
        mock = _fake_response(status_code=204)
        with patch("connectors.drive.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await DriveConnector().execute("delete_file", {"file_id": "f1"}, "tok")
        self.assertEqual(result["file_id"], "f1")
        self.assertTrue(result["deleted"])

    async def test_delete_file_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await DriveConnector().execute("delete_file", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_delete_file_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.drive.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await DriveConnector().execute("delete_file", {"file_id": "f1"}, "tok")
        self.assertEqual(ctx.exception.code, "NOT_FOUND")


# ────────────────────────────────────────────────────────────────
# GitHub
# ────────────────────────────────────────────────────────────────


class TestGitHubConnectorDeep(unittest.IsolatedAsyncioTestCase):
    async def test_comment_on_issue_success(self):
        mock = _fake_response({"id": 123, "html_url": "https://github.com/o/r/issues/1#comment"})
        with patch("connectors.github.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await GitHubConnector().execute(
                "comment_on_issue", {"owner": "o", "repo": "r", "issue_number": 1, "body": "Nice"}, "tok"
            )
        self.assertEqual(result["comment_id"], 123)

    async def test_comment_on_issue_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await GitHubConnector().execute("comment_on_issue", {"owner": "o", "repo": "r"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_comment_on_issue_http_error(self):
        mock = _fake_response(status_code=422, text="Validation Failed")
        with patch("connectors.github.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await GitHubConnector().execute(
                    "comment_on_issue", {"owner": "o", "repo": "r", "issue_number": 1, "body": "Nice"}, "tok"
                )
        self.assertEqual(ctx.exception.code, "GITHUB_API_ERROR")

    async def test_get_pr_diff_success(self):
        mock = _fake_response(text="diff --git a/...")
        with patch("connectors.github.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await GitHubConnector().execute("get_pr_diff", {"owner": "o", "repo": "r", "pr_number": 1}, "tok")
        self.assertEqual(result["diff"], "diff --git a/...")
        self.assertEqual(result["pr_number"], 1)

    async def test_get_pr_diff_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await GitHubConnector().execute("get_pr_diff", {"owner": "o", "repo": "r"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_get_pr_diff_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.github.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await GitHubConnector().execute("get_pr_diff", {"owner": "o", "repo": "r", "pr_number": 1}, "tok")
        self.assertEqual(ctx.exception.code, "GITHUB_API_ERROR")

    async def test_push_file_success(self):
        mock = _fake_response(
            {"content": {"path": "f.txt", "sha": "abc", "html_url": "u"}, "commit": {"sha": "def", "html_url": "v"}}
        )
        with patch("connectors.github.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await GitHubConnector().execute(
                "push_file",
                {
                    "owner": "o",
                    "repo": "r",
                    "path": "f.txt",
                    "message": "m",
                    "content": "hello",
                    "sha": "oldsha",
                    "branch": "main",
                },
                "tok",
            )
        self.assertEqual(result["path"], "f.txt")
        self.assertEqual(result["sha"], "abc")
        self.assertEqual(result["commit_sha"], "def")
        self.assertEqual(result["branch"], "main")

    async def test_push_file_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await GitHubConnector().execute("push_file", {"owner": "o", "repo": "r", "path": "f.txt"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_push_file_http_error(self):
        mock = _fake_response(status_code=422, text="Validation Failed")
        with patch("connectors.github.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await GitHubConnector().execute(
                    "push_file",
                    {"owner": "o", "repo": "r", "path": "f.txt", "message": "m", "content": "hello", "sha": "oldsha"},
                    "tok",
                )
        self.assertEqual(ctx.exception.code, "GITHUB_API_ERROR")


# ────────────────────────────────────────────────────────────────
# HubSpot
# ────────────────────────────────────────────────────────────────


class TestHubSpotConnectorDeep(unittest.IsolatedAsyncioTestCase):
    async def test_list_contacts_success(self):
        mock = _fake_response({"results": [{"id": "1", "properties": {"email": "a@b.com"}}]})
        with patch("connectors.hubspot.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await HubSpotConnector().execute("list_contacts", {"limit": 10}, "tok")
        self.assertEqual(result["contacts"][0]["email"], "a@b.com")

    async def test_list_contacts_http_error(self):
        mock = _fake_response(status_code=500, text="Error")
        with patch("connectors.hubspot.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await HubSpotConnector().execute("list_contacts", {}, "tok")
        self.assertEqual(ctx.exception.code, "HUBSPOT_HTTP_ERROR")

    async def test_update_contact_success(self):
        mock = _fake_response({"id": "1", "properties": {"firstname": "A", "email": "a@b.com"}})
        with patch("connectors.hubspot.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await HubSpotConnector().execute("update_contact", {"contact_id": "1", "firstname": "A"}, "tok")
        self.assertEqual(result["firstname"], "A")

    async def test_update_contact_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await HubSpotConnector().execute("update_contact", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_update_contact_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.hubspot.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await HubSpotConnector().execute("update_contact", {"contact_id": "1", "firstname": "A"}, "tok")
        self.assertEqual(ctx.exception.code, "NOT_FOUND")

    async def test_list_deals_success(self):
        mock = _fake_response({"results": [{"id": "d1", "properties": {"dealname": "D1"}}]})
        with patch("connectors.hubspot.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await HubSpotConnector().execute("list_deals", {"limit": 10}, "tok")
        self.assertEqual(result["deals"][0]["dealname"], "D1")

    async def test_list_deals_http_error(self):
        mock = _fake_response(status_code=500, text="Error")
        with patch("connectors.hubspot.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await HubSpotConnector().execute("list_deals", {}, "tok")
        self.assertEqual(ctx.exception.code, "HUBSPOT_HTTP_ERROR")

    async def test_update_deal_success(self):
        mock = _fake_response({"id": "d1", "properties": {"dealname": "Deal2"}})
        with patch("connectors.hubspot.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await HubSpotConnector().execute("update_deal", {"deal_id": "d1", "deal_name": "Deal2"}, "tok")
        self.assertEqual(result["dealname"], "Deal2")

    async def test_update_deal_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await HubSpotConnector().execute("update_deal", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_update_deal_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.hubspot.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await HubSpotConnector().execute("update_deal", {"deal_id": "d1", "deal_name": "Deal2"}, "tok")
        self.assertEqual(ctx.exception.code, "NOT_FOUND")


# ────────────────────────────────────────────────────────────────
# Calendar
# ────────────────────────────────────────────────────────────────


class TestCalendarConnectorDeep(unittest.IsolatedAsyncioTestCase):
    async def test_get_event_success(self):
        mock = _fake_response(
            {
                "id": "e1",
                "summary": "Meeting",
                "start": {"dateTime": "2024-01-01T10:00:00Z"},
                "end": {"dateTime": "2024-01-01T11:00:00Z"},
                "htmlLink": "https://cal/e1",
            }
        )
        with patch("connectors.calendar.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await CalendarConnector().execute("get_event", {"event_id": "e1", "calendar_id": "primary"}, "tok")
        self.assertEqual(result["id"], "e1")
        self.assertEqual(result["summary"], "Meeting")

    async def test_get_event_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await CalendarConnector().execute("get_event", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_get_event_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.calendar.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await CalendarConnector().execute("get_event", {"event_id": "e1"}, "tok")
        self.assertEqual(ctx.exception.code, "NOT_FOUND")

    async def test_update_event_success(self):
        mock = _fake_response({"id": "e1", "summary": "Updated", "htmlLink": "https://cal/e1", "status": "confirmed"})
        with patch("connectors.calendar.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await CalendarConnector().execute(
                "update_event", {"event_id": "e1", "summary": "Updated", "calendar_id": "primary"}, "tok"
            )
        self.assertEqual(result["id"], "e1")
        self.assertEqual(result["status"], "confirmed")

    async def test_update_event_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await CalendarConnector().execute("update_event", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_update_event_http_error(self):
        mock = _fake_response(status_code=400, text="Bad Request")
        with patch("connectors.calendar.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await CalendarConnector().execute("update_event", {"event_id": "e1", "summary": "Updated"}, "tok")
        self.assertEqual(ctx.exception.code, "CALENDAR_HTTP_ERROR")

    async def test_delete_event_success(self):
        mock = _fake_response(status_code=204)
        with patch("connectors.calendar.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await CalendarConnector().execute(
                "delete_event", {"event_id": "e1", "calendar_id": "primary"}, "tok"
            )
        self.assertEqual(result["event_id"], "e1")
        self.assertTrue(result["deleted"])

    async def test_delete_event_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await CalendarConnector().execute("delete_event", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_delete_event_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.calendar.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await CalendarConnector().execute("delete_event", {"event_id": "e1"}, "tok")
        self.assertEqual(ctx.exception.code, "NOT_FOUND")


# ────────────────────────────────────────────────────────────────
# Sheets
# ────────────────────────────────────────────────────────────────


class TestSheetsConnectorDeep(unittest.IsolatedAsyncioTestCase):
    async def test_append_row_success(self):
        mock = _fake_response({"updates": {"updatedRange": "Sheet1!A1:B1", "updatedRows": 1}})
        with patch("connectors.sheets.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await SheetsConnector().execute(
                "append_row", {"spreadsheet_id": "s1", "range": "Sheet1!A1", "values": ["a", "b"]}, "tok"
            )
        self.assertEqual(result["updated_rows"], 1)

    async def test_append_row_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await SheetsConnector().execute("append_row", {"spreadsheet_id": "s1", "range": "A1"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_append_row_http_error(self):
        mock = _fake_response(status_code=403, text="Forbidden")
        with patch("connectors.sheets.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await SheetsConnector().execute(
                    "append_row", {"spreadsheet_id": "s1", "range": "A1", "values": ["a"]}, "tok"
                )
        self.assertEqual(ctx.exception.code, "SHEETS_PERMISSION_DENIED")

    async def test_list_sheets_success(self):
        mock = _fake_response({"sheets": [{"properties": {"sheetId": 1, "title": "Sheet1", "index": 0}}]})
        with patch("connectors.sheets.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await SheetsConnector().execute("list_sheets", {"spreadsheet_id": "s1"}, "tok")
        self.assertEqual(result["sheets"][0]["title"], "Sheet1")

    async def test_list_sheets_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await SheetsConnector().execute("list_sheets", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_list_sheets_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.sheets.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await SheetsConnector().execute("list_sheets", {"spreadsheet_id": "s1"}, "tok")
        self.assertEqual(ctx.exception.code, "SHEETS_API_ERROR")

    async def test_create_sheet_success(self):
        mock = _fake_response(
            {"replies": [{"addSheet": {"properties": {"sheetId": 2, "title": "Sheet2", "index": 1}}}]}
        )
        with patch("connectors.sheets.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await SheetsConnector().execute(
                "create_sheet", {"spreadsheet_id": "s1", "title": "Sheet2", "index": 1}, "tok"
            )
        self.assertEqual(result["sheet_id"], 2)
        self.assertEqual(result["title"], "Sheet2")
        self.assertEqual(result["index"], 1)

    async def test_create_sheet_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await SheetsConnector().execute("create_sheet", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_sheet_http_error(self):
        mock = _fake_response(status_code=400, text="Bad Request")
        with patch("connectors.sheets.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await SheetsConnector().execute("create_sheet", {"spreadsheet_id": "s1", "title": "Sheet2"}, "tok")
        self.assertEqual(ctx.exception.code, "SHEETS_API_ERROR")

    async def test_clear_range_success(self):
        mock = _fake_response({"clearedRange": "Sheet1!A1:B2"})
        with patch("connectors.sheets.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await SheetsConnector().execute(
                "clear_range", {"spreadsheet_id": "s1", "range": "Sheet1!A1:B2"}, "tok"
            )
        self.assertEqual(result["cleared_range"], "Sheet1!A1:B2")

    async def test_clear_range_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await SheetsConnector().execute("clear_range", {"spreadsheet_id": "s1"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_clear_range_http_error(self):
        mock = _fake_response(status_code=403, text="Forbidden")
        with patch("connectors.sheets.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await SheetsConnector().execute("clear_range", {"spreadsheet_id": "s1", "range": "A1"}, "tok")
        self.assertEqual(ctx.exception.code, "SHEETS_PERMISSION_DENIED")


# ────────────────────────────────────────────────────────────────
# Docs
# ────────────────────────────────────────────────────────────────


class TestDocsConnectorDeep(unittest.IsolatedAsyncioTestCase):
    async def test_append_text_success(self):
        mock = _fake_response({})
        with patch("connectors.docs.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await DocsConnector().execute("append_text", {"document_id": "d1", "text": "Hello"}, "tok")
        self.assertEqual(result["document_id"], "d1")
        self.assertTrue(result["appended"])

    async def test_append_text_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await DocsConnector().execute("append_text", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_append_text_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.docs.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await DocsConnector().execute("append_text", {"document_id": "d1", "text": "Hello"}, "tok")
        self.assertEqual(ctx.exception.code, "NOT_FOUND")

    async def test_replace_text_success(self):
        mock = _fake_response({"replies": [{"replaceAllText": {"occurrencesChanged": 2}}]})
        with patch("connectors.docs.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await DocsConnector().execute(
                "replace_text", {"document_id": "d1", "find": "old", "replace": "new", "match_case": True}, "tok"
            )
        self.assertEqual(result["document_id"], "d1")
        self.assertEqual(result["occurrences_replaced"], 2)

    async def test_replace_text_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await DocsConnector().execute("replace_text", {"document_id": "d1"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_replace_text_http_error(self):
        mock = _fake_response(status_code=400, text="Bad Request")
        with patch("connectors.docs.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await DocsConnector().execute("replace_text", {"document_id": "d1", "find": "old"}, "tok")
        self.assertEqual(ctx.exception.code, "DOCS_HTTP_ERROR")


# ────────────────────────────────────────────────────────────────
# Asana
# ────────────────────────────────────────────────────────────────


class TestAsanaConnectorDeep(unittest.IsolatedAsyncioTestCase):
    async def test_list_projects_success(self):
        mock = _fake_response({"data": [{"gid": "p1", "name": "Project1"}]})
        with patch("connectors.asana.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await AsanaConnector().execute("list_projects", {"limit": 10}, "tok")
        self.assertEqual(result["projects"][0]["name"], "Project1")

    async def test_list_projects_http_error(self):
        mock = _fake_response(status_code=401, text="Unauthorized")
        with patch("connectors.asana.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await AsanaConnector().execute("list_projects", {}, "tok")
        self.assertEqual(ctx.exception.code, "TOKEN_EXPIRED")

    async def test_list_tasks_success(self):
        mock = _fake_response({"data": [{"gid": "t1", "name": "Task1"}]})
        with patch("connectors.asana.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await AsanaConnector().execute("list_tasks", {"project_id": "p1", "limit": 10}, "tok")
        self.assertEqual(result["tasks"][0]["name"], "Task1")

    async def test_list_tasks_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await AsanaConnector().execute("list_tasks", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_list_tasks_http_error(self):
        mock = _fake_response(status_code=403, text="Forbidden")
        with patch("connectors.asana.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await AsanaConnector().execute("list_tasks", {"project_id": "p1"}, "tok")
        self.assertEqual(ctx.exception.code, "FORBIDDEN")

    async def test_get_task_success(self):
        mock = _fake_response({"data": {"gid": "t1", "name": "Task1"}})
        with patch("connectors.asana.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await AsanaConnector().execute("get_task", {"task_id": "t1"}, "tok")
        self.assertEqual(result["name"], "Task1")

    async def test_get_task_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await AsanaConnector().execute("get_task", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_get_task_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.asana.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await AsanaConnector().execute("get_task", {"task_id": "t1"}, "tok")
        self.assertEqual(ctx.exception.code, "NOT_FOUND")

    async def test_create_task_success(self):
        mock = _fake_response({"data": {"gid": "t1", "name": "Task1"}})
        with patch("connectors.asana.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await AsanaConnector().execute(
                "create_task", {"name": "Task1", "project_id": "p1", "notes": "note"}, "tok"
            )
        self.assertEqual(result["task_id"], "t1")
        self.assertEqual(result["name"], "Task1")

    async def test_create_task_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await AsanaConnector().execute("create_task", {"name": "Task1"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_task_http_error(self):
        mock = _fake_response(status_code=400, text="Bad Request")
        with patch("connectors.asana.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await AsanaConnector().execute("create_task", {"name": "Task1", "project_id": "p1"}, "tok")
        self.assertEqual(ctx.exception.code, "ASANA_HTTP_ERROR")

    async def test_update_task_success(self):
        mock = _fake_response({"data": {"gid": "t1", "name": "Task2"}})
        with patch("connectors.asana.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await AsanaConnector().execute("update_task", {"task_id": "t1", "name": "Task2"}, "tok")
        self.assertEqual(result["task_id"], "t1")
        self.assertEqual(result["name"], "Task2")

    async def test_update_task_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await AsanaConnector().execute("update_task", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_update_task_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.asana.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await AsanaConnector().execute("update_task", {"task_id": "t1", "name": "Task2"}, "tok")
        self.assertEqual(ctx.exception.code, "NOT_FOUND")

    async def test_complete_task_success(self):
        mock = _fake_response({"data": {"gid": "t1", "completed": True}})
        with patch("connectors.asana.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await AsanaConnector().execute("complete_task", {"task_id": "t1"}, "tok")
        self.assertEqual(result["task_id"], "t1")
        self.assertTrue(result["completed"])

    async def test_complete_task_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await AsanaConnector().execute("complete_task", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_complete_task_http_error(self):
        mock = _fake_response(status_code=403, text="Forbidden")
        with patch("connectors.asana.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await AsanaConnector().execute("complete_task", {"task_id": "t1"}, "tok")
        self.assertEqual(ctx.exception.code, "FORBIDDEN")


# ────────────────────────────────────────────────────────────────
# Jira
# ────────────────────────────────────────────────────────────────


class TestJiraConnectorDeep(unittest.IsolatedAsyncioTestCase):
    async def test_list_issues_success(self):
        mock = _fake_response(
            {
                "issues": [{"id": "1", "key": "PRJ-1", "fields": {"summary": "Bug", "status": {"name": "Open"}}}],
                "total": 1,
            }
        )
        with patch("connectors.jira.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await JiraConnector().execute(
                "list_issues", {"cloud_id": "cid", "jql": "project=PRJ", "limit": 10}, "tok"
            )
        self.assertEqual(result["issues"][0]["key"], "PRJ-1")
        self.assertEqual(result["total"], 1)

    async def test_list_issues_http_error(self):
        mock = _fake_response(status_code=401, text="Unauthorized")
        with patch("connectors.jira.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await JiraConnector().execute("list_issues", {"cloud_id": "cid"}, "tok")
        self.assertEqual(ctx.exception.code, "TOKEN_EXPIRED")

    async def test_create_issue_success(self):
        mock = _fake_response({"id": "1", "key": "PRJ-1", "self": "https://jira/PRJ-1"})
        with patch("connectors.jira.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await JiraConnector().execute(
                "create_issue",
                {"cloud_id": "cid", "project_key": "PRJ", "summary": "Bug", "description": "desc"},
                "tok",
            )
        self.assertEqual(result["key"], "PRJ-1")
        self.assertEqual(result["url"], "https://jira/PRJ-1")

    async def test_create_issue_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await JiraConnector().execute("create_issue", {"cloud_id": "cid", "project_key": "PRJ"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_issue_http_error(self):
        mock = _fake_response(status_code=400, text="Bad Request")
        with patch("connectors.jira.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await JiraConnector().execute(
                    "create_issue", {"cloud_id": "cid", "project_key": "PRJ", "summary": "Bug"}, "tok"
                )
        self.assertEqual(ctx.exception.code, "JIRA_API_ERROR")

    async def test_update_issue_success(self):
        mock = _fake_response({})
        with patch("connectors.jira.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await JiraConnector().execute(
                "update_issue", {"cloud_id": "cid", "issue_key": "PRJ-1", "summary": "Fixed"}, "tok"
            )
        self.assertTrue(result["updated"])
        self.assertEqual(result["issue_key"], "PRJ-1")

    async def test_update_issue_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await JiraConnector().execute("update_issue", {"cloud_id": "cid"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_update_issue_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.jira.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await JiraConnector().execute(
                    "update_issue", {"cloud_id": "cid", "issue_key": "PRJ-1", "summary": "Fixed"}, "tok"
                )
        self.assertEqual(ctx.exception.code, "JIRA_API_ERROR")

    async def test_list_projects_success(self):
        mock = _fake_response({"values": [{"id": "1", "key": "PRJ", "name": "Project"}]})
        with patch("connectors.jira.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await JiraConnector().execute("list_projects", {"cloud_id": "cid", "limit": 10}, "tok")
        self.assertEqual(result["projects"][0]["key"], "PRJ")

    async def test_list_projects_http_error(self):
        mock = _fake_response(status_code=500, text="Error")
        with patch("connectors.jira.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await JiraConnector().execute("list_projects", {"cloud_id": "cid"}, "tok")
        self.assertEqual(ctx.exception.code, "JIRA_API_ERROR")

    async def test_get_issue_success(self):
        mock = _fake_response(
            {"id": "1", "key": "PRJ-1", "fields": {"summary": "Bug", "status": {"name": "Open"}, "description": None}}
        )
        with patch("connectors.jira.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await JiraConnector().execute("get_issue", {"cloud_id": "cid", "issue_key": "PRJ-1"}, "tok")
        self.assertEqual(result["key"], "PRJ-1")
        self.assertEqual(result["summary"], "Bug")

    async def test_get_issue_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await JiraConnector().execute("get_issue", {"cloud_id": "cid"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_get_issue_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.jira.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await JiraConnector().execute("get_issue", {"cloud_id": "cid", "issue_key": "PRJ-1"}, "tok")
        self.assertEqual(ctx.exception.code, "JIRA_API_ERROR")

    async def test_add_comment_success(self):
        mock = _fake_response({"id": "c1"})
        with patch("connectors.jira.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await JiraConnector().execute(
                "add_comment", {"cloud_id": "cid", "issue_key": "PRJ-1", "body": "Nice"}, "tok"
            )
        self.assertEqual(result["comment_id"], "c1")

    async def test_add_comment_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await JiraConnector().execute("add_comment", {"cloud_id": "cid"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_add_comment_http_error(self):
        mock = _fake_response(status_code=400, text="Bad Request")
        with patch("connectors.jira.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await JiraConnector().execute(
                    "add_comment", {"cloud_id": "cid", "issue_key": "PRJ-1", "body": "Nice"}, "tok"
                )
        self.assertEqual(ctx.exception.code, "JIRA_API_ERROR")


# ────────────────────────────────────────────────────────────────
# Outlook
# ────────────────────────────────────────────────────────────────


class TestOutlookConnectorDeep(unittest.IsolatedAsyncioTestCase):
    async def test_list_emails_success(self):
        mock = _fake_response(
            {
                "value": [
                    {
                        "id": "m1",
                        "subject": "Hi",
                        "from": {"emailAddress": {"address": "a@b.com"}},
                        "receivedDateTime": "2024-01-01",
                        "isRead": True,
                        "bodyPreview": "preview",
                    }
                ]
            }
        )
        with patch("connectors.outlook.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await OutlookConnector().execute("list_emails", {"folder": "inbox", "max_results": 10}, "tok")
        self.assertEqual(result["emails"][0]["subject"], "Hi")

    async def test_list_emails_http_error(self):
        mock = _fake_response(status_code=401, text="Unauthorized")
        with patch("connectors.outlook.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await OutlookConnector().execute("list_emails", {}, "tok")
        self.assertEqual(ctx.exception.code, "TOKEN_EXPIRED")

    async def test_read_email_success(self):
        mock = _fake_response(
            {
                "id": "m1",
                "subject": "Hi",
                "from": {"emailAddress": {"address": "a@b.com"}},
                "toRecipients": [{"emailAddress": {"address": "c@d.com"}}],
                "ccRecipients": [],
                "receivedDateTime": "2024-01-01",
                "body": {"content": "Hello", "contentType": "text"},
                "isRead": True,
            }
        )
        with patch("connectors.outlook.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await OutlookConnector().execute("read_email", {"message_id": "m1"}, "tok")
        self.assertEqual(result["subject"], "Hi")
        self.assertEqual(result["body"], "Hello")

    async def test_read_email_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await OutlookConnector().execute("read_email", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_read_email_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.outlook.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await OutlookConnector().execute("read_email", {"message_id": "m1"}, "tok")
        self.assertEqual(ctx.exception.code, "NOT_FOUND")

    async def test_send_email_success(self):
        mock = _fake_response(status_code=202)
        with patch("connectors.outlook.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await OutlookConnector().execute(
                "send_email", {"to": "a@b.com", "subject": "Hi", "body": "Hello"}, "tok"
            )
        self.assertTrue(result["sent"])
        self.assertEqual(result["subject"], "Hi")

    async def test_send_email_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await OutlookConnector().execute("send_email", {"to": "a@b.com"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_send_email_http_error(self):
        mock = _fake_response(status_code=400, text="Bad Request")
        with patch("connectors.outlook.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await OutlookConnector().execute(
                    "send_email", {"to": "a@b.com", "subject": "Hi", "body": "Hello"}, "tok"
                )
        self.assertEqual(ctx.exception.code, "OUTLOOK_HTTP_ERROR")

    async def test_reply_email_success(self):
        mock = _fake_response(status_code=202)
        with patch("connectors.outlook.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await OutlookConnector().execute("reply_email", {"message_id": "m1", "body": "Reply"}, "tok")
        self.assertTrue(result["replied"])
        self.assertEqual(result["message_id"], "m1")

    async def test_reply_email_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await OutlookConnector().execute("reply_email", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_reply_email_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.outlook.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await OutlookConnector().execute("reply_email", {"message_id": "m1", "body": "Reply"}, "tok")
        self.assertEqual(ctx.exception.code, "NOT_FOUND")

    async def test_delete_email_success(self):
        mock = _fake_response(status_code=204)
        with patch("connectors.outlook.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await OutlookConnector().execute("delete_email", {"message_id": "m1"}, "tok")
        self.assertEqual(result["message_id"], "m1")
        self.assertTrue(result["deleted"])

    async def test_delete_email_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await OutlookConnector().execute("delete_email", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_delete_email_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.outlook.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await OutlookConnector().execute("delete_email", {"message_id": "m1"}, "tok")
        self.assertEqual(ctx.exception.code, "NOT_FOUND")

    async def test_list_folders_success(self):
        mock = _fake_response(
            {"value": [{"id": "f1", "displayName": "Inbox", "totalItemCount": 5, "unreadItemCount": 2}]}
        )
        with patch("connectors.outlook.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await OutlookConnector().execute("list_folders", {}, "tok")
        self.assertEqual(result["folders"][0]["name"], "Inbox")
        self.assertEqual(result["folders"][0]["total_items"], 5)

    async def test_list_folders_http_error(self):
        mock = _fake_response(status_code=403, text="Forbidden")
        with patch("connectors.outlook.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await OutlookConnector().execute("list_folders", {}, "tok")
        self.assertEqual(ctx.exception.code, "FORBIDDEN")

    async def test_move_email_success(self):
        mock = _fake_response({"id": "m1"})
        with patch("connectors.outlook.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await OutlookConnector().execute(
                "move_email", {"message_id": "m1", "destination_folder": "f2"}, "tok"
            )
        self.assertEqual(result["message_id"], "m1")
        self.assertTrue(result["moved"])

    async def test_move_email_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await OutlookConnector().execute("move_email", {"message_id": "m1"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_move_email_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.outlook.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await OutlookConnector().execute("move_email", {"message_id": "m1", "destination_folder": "f2"}, "tok")
        self.assertEqual(ctx.exception.code, "NOT_FOUND")


# ────────────────────────────────────────────────────────────────
# Airtable
# ────────────────────────────────────────────────────────────────


class TestAirtableConnectorDeep(unittest.IsolatedAsyncioTestCase):
    async def test_list_records_success(self):
        mock = _fake_response({"records": [{"id": "r1", "fields": {"Name": "A"}}], "offset": "off1"})
        with patch("connectors.airtable.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await AirtableConnector().execute(
                "list_records", {"base_id": "b1", "table_name": "t1", "max_records": 10}, "tok"
            )
        self.assertEqual(result["records"][0]["id"], "r1")
        self.assertEqual(result["offset"], "off1")

    async def test_list_records_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await AirtableConnector().execute("list_records", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_list_records_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.airtable.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await AirtableConnector().execute("list_records", {"base_id": "b1", "table_name": "t1"}, "tok")
        self.assertEqual(ctx.exception.code, "NOT_FOUND")

    async def test_get_record_success(self):
        mock = _fake_response({"id": "r1", "fields": {"Name": "A"}})
        with patch("connectors.airtable.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await AirtableConnector().execute(
                "get_record", {"base_id": "b1", "table_name": "t1", "record_id": "r1"}, "tok"
            )
        self.assertEqual(result["id"], "r1")

    async def test_get_record_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await AirtableConnector().execute("get_record", {"base_id": "b1", "table_name": "t1"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_get_record_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.airtable.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await AirtableConnector().execute(
                    "get_record", {"base_id": "b1", "table_name": "t1", "record_id": "r1"}, "tok"
                )
        self.assertEqual(ctx.exception.code, "NOT_FOUND")

    async def test_create_record_success(self):
        mock = _fake_response({"id": "r1", "fields": {"Name": "A"}})
        with patch("connectors.airtable.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await AirtableConnector().execute(
                "create_record", {"base_id": "b1", "table_name": "t1", "fields": {"Name": "A"}}, "tok"
            )
        self.assertEqual(result["record_id"], "r1")
        self.assertEqual(result["fields"]["Name"], "A")

    async def test_create_record_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await AirtableConnector().execute("create_record", {"base_id": "b1"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_record_http_error(self):
        mock = _fake_response(status_code=422, text="Unprocessable")
        with patch("connectors.airtable.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await AirtableConnector().execute(
                    "create_record", {"base_id": "b1", "table_name": "t1", "fields": {}}, "tok"
                )
        self.assertEqual(ctx.exception.code, "VALIDATION_ERROR")

    async def test_update_record_success(self):
        mock = _fake_response({"id": "r1", "fields": {"Name": "B"}})
        with patch("connectors.airtable.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await AirtableConnector().execute(
                "update_record",
                {"base_id": "b1", "table_name": "t1", "record_id": "r1", "fields": {"Name": "B"}},
                "tok",
            )
        self.assertEqual(result["record_id"], "r1")
        self.assertEqual(result["fields"]["Name"], "B")

    async def test_update_record_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await AirtableConnector().execute("update_record", {"base_id": "b1", "table_name": "t1"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_update_record_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.airtable.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await AirtableConnector().execute(
                    "update_record", {"base_id": "b1", "table_name": "t1", "record_id": "r1", "fields": {}}, "tok"
                )
        self.assertEqual(ctx.exception.code, "NOT_FOUND")

    async def test_delete_record_success(self):
        mock = _fake_response({"id": "r1", "deleted": True})
        with patch("connectors.airtable.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await AirtableConnector().execute(
                "delete_record", {"base_id": "b1", "table_name": "t1", "record_id": "r1"}, "tok"
            )
        self.assertEqual(result["record_id"], "r1")
        self.assertTrue(result["deleted"])

    async def test_delete_record_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await AirtableConnector().execute("delete_record", {"base_id": "b1", "table_name": "t1"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_delete_record_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.airtable.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await AirtableConnector().execute(
                    "delete_record", {"base_id": "b1", "table_name": "t1", "record_id": "r1"}, "tok"
                )
        self.assertEqual(ctx.exception.code, "NOT_FOUND")


# ────────────────────────────────────────────────────────────────
# Bitbucket
# ────────────────────────────────────────────────────────────────


class TestBitbucketConnectorDeep(unittest.IsolatedAsyncioTestCase):
    async def test_list_repos_success(self):
        mock = _fake_response(
            {
                "values": [
                    {
                        "slug": "repo1",
                        "full_name": "ws/repo1",
                        "is_private": True,
                        "language": "python",
                        "updated_on": "2024-01-01",
                    }
                ]
            }
        )
        with patch("connectors.bitbucket.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await BitbucketConnector().execute("list_repos", {"workspace": "ws", "pagelen": 10}, "tok")
        self.assertEqual(result["repos"][0]["slug"], "repo1")

    async def test_list_repos_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await BitbucketConnector().execute("list_repos", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_list_repos_http_error(self):
        mock = _fake_response(status_code=401, text="Unauthorized")
        with patch("connectors.bitbucket.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await BitbucketConnector().execute("list_repos", {"workspace": "ws"}, "tok")
        self.assertEqual(ctx.exception.code, "TOKEN_EXPIRED")

    async def test_list_pull_requests_success(self):
        mock = _fake_response(
            {
                "values": [
                    {
                        "id": 1,
                        "title": "PR1",
                        "state": "OPEN",
                        "author": {"display_name": "A"},
                        "source": {"branch": {"name": "feat"}},
                        "destination": {"branch": {"name": "main"}},
                        "created_on": "2024-01-01",
                        "links": {"html": {"href": "https://bb/pr1"}},
                    }
                ]
            }
        )
        with patch("connectors.bitbucket.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await BitbucketConnector().execute(
                "list_pull_requests", {"workspace": "ws", "repo_slug": "r1"}, "tok"
            )
        self.assertEqual(result["pull_requests"][0]["title"], "PR1")

    async def test_list_pull_requests_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await BitbucketConnector().execute("list_pull_requests", {"workspace": "ws"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_list_pull_requests_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.bitbucket.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await BitbucketConnector().execute("list_pull_requests", {"workspace": "ws", "repo_slug": "r1"}, "tok")
        self.assertEqual(ctx.exception.code, "BITBUCKET_ERROR")

    async def test_create_pull_request_success(self):
        mock = _fake_response({"id": 1, "title": "PR1", "state": "OPEN", "links": {"html": {"href": "https://bb/pr1"}}})
        with patch("connectors.bitbucket.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await BitbucketConnector().execute(
                "create_pull_request",
                {
                    "workspace": "ws",
                    "repo_slug": "r1",
                    "title": "PR1",
                    "source_branch": "feat",
                    "destination_branch": "main",
                },
                "tok",
            )
        self.assertEqual(result["id"], 1)
        self.assertEqual(result["url"], "https://bb/pr1")

    async def test_create_pull_request_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await BitbucketConnector().execute("create_pull_request", {"workspace": "ws", "repo_slug": "r1"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_pull_request_http_error(self):
        mock = _fake_response(status_code=400, text="Bad Request")
        with patch("connectors.bitbucket.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await BitbucketConnector().execute(
                    "create_pull_request",
                    {"workspace": "ws", "repo_slug": "r1", "title": "PR1", "source_branch": "feat"},
                    "tok",
                )
        self.assertEqual(ctx.exception.code, "BITBUCKET_ERROR")

    async def test_list_issues_success(self):
        mock = _fake_response(
            {"values": [{"id": 1, "title": "Bug", "status": "new", "priority": "major", "created_on": "2024-01-01"}]}
        )
        with patch("connectors.bitbucket.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await BitbucketConnector().execute(
                "list_issues", {"workspace": "ws", "repo_slug": "r1", "pagelen": 10}, "tok"
            )
        self.assertEqual(result["issues"][0]["title"], "Bug")

    async def test_list_issues_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await BitbucketConnector().execute("list_issues", {"workspace": "ws"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_list_issues_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.bitbucket.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await BitbucketConnector().execute("list_issues", {"workspace": "ws", "repo_slug": "r1"}, "tok")
        self.assertEqual(ctx.exception.code, "BITBUCKET_ERROR")

    async def test_create_issue_success(self):
        mock = _fake_response({"id": 1, "title": "Bug", "status": "new"})
        with patch("connectors.bitbucket.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await BitbucketConnector().execute(
                "create_issue",
                {
                    "workspace": "ws",
                    "repo_slug": "r1",
                    "title": "Bug",
                    "content": "desc",
                    "priority": "major",
                    "kind": "bug",
                },
                "tok",
            )
        self.assertEqual(result["id"], 1)
        self.assertEqual(result["title"], "Bug")

    async def test_create_issue_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await BitbucketConnector().execute("create_issue", {"workspace": "ws", "repo_slug": "r1"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_issue_http_error(self):
        mock = _fake_response(status_code=400, text="Bad Request")
        with patch("connectors.bitbucket.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await BitbucketConnector().execute(
                    "create_issue", {"workspace": "ws", "repo_slug": "r1", "title": "Bug"}, "tok"
                )
        self.assertEqual(ctx.exception.code, "BITBUCKET_ERROR")


# ────────────────────────────────────────────────────────────────
# GitLab
# ────────────────────────────────────────────────────────────────


class TestGitLabConnectorDeep(unittest.IsolatedAsyncioTestCase):
    async def test_list_projects_success(self):
        mock = _fake_response(
            [
                {
                    "id": 1,
                    "name": "P1",
                    "path_with_namespace": "ns/p1",
                    "web_url": "https://gitlab/p1",
                    "default_branch": "main",
                }
            ]
        )
        with patch("connectors.gitlab.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await GitLabConnector().execute("list_projects", {"per_page": 10, "page": 1}, "tok")
        self.assertEqual(result["projects"][0]["name"], "P1")

    async def test_list_projects_http_error(self):
        mock = _fake_response(status_code=401, text="Unauthorized")
        with patch("connectors.gitlab.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await GitLabConnector().execute("list_projects", {}, "tok")
        self.assertEqual(ctx.exception.code, "TOKEN_EXPIRED")

    async def test_list_issues_success(self):
        mock = _fake_response(
            [
                {
                    "id": 1,
                    "iid": 1,
                    "title": "Bug",
                    "state": "opened",
                    "web_url": "https://gitlab/i1",
                    "created_at": "2024-01-01",
                }
            ]
        )
        with patch("connectors.gitlab.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await GitLabConnector().execute(
                "list_issues", {"project_id": 1, "state": "opened", "per_page": 10}, "tok"
            )
        self.assertEqual(result["issues"][0]["title"], "Bug")

    async def test_list_issues_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await GitLabConnector().execute("list_issues", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_list_issues_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.gitlab.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await GitLabConnector().execute("list_issues", {"project_id": 1}, "tok")
        self.assertEqual(ctx.exception.code, "GITLAB_ERROR")

    async def test_create_issue_success(self):
        mock = _fake_response({"id": 1, "iid": 1, "title": "Bug", "web_url": "https://gitlab/i1"})
        with patch("connectors.gitlab.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await GitLabConnector().execute(
                "create_issue",
                {"project_id": 1, "title": "Bug", "description": "desc", "labels": ["bug"], "assignee_ids": [1]},
                "tok",
            )
        self.assertEqual(result["id"], 1)
        self.assertEqual(result["title"], "Bug")

    async def test_create_issue_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await GitLabConnector().execute("create_issue", {"project_id": 1}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_issue_http_error(self):
        mock = _fake_response(status_code=400, text="Bad Request")
        with patch("connectors.gitlab.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await GitLabConnector().execute("create_issue", {"project_id": 1, "title": "Bug"}, "tok")
        self.assertEqual(ctx.exception.code, "GITLAB_ERROR")

    async def test_list_merge_requests_success(self):
        mock = _fake_response(
            [
                {
                    "id": 1,
                    "iid": 1,
                    "title": "MR1",
                    "state": "opened",
                    "web_url": "https://gitlab/mr1",
                    "source_branch": "feat",
                    "target_branch": "main",
                }
            ]
        )
        with patch("connectors.gitlab.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await GitLabConnector().execute(
                "list_merge_requests", {"project_id": 1, "state": "opened", "per_page": 10}, "tok"
            )
        self.assertEqual(result["merge_requests"][0]["title"], "MR1")

    async def test_list_merge_requests_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await GitLabConnector().execute("list_merge_requests", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_list_merge_requests_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.gitlab.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await GitLabConnector().execute("list_merge_requests", {"project_id": 1}, "tok")
        self.assertEqual(ctx.exception.code, "GITLAB_ERROR")

    async def test_create_merge_request_success(self):
        mock = _fake_response({"id": 1, "iid": 1, "title": "MR1", "web_url": "https://gitlab/mr1", "state": "opened"})
        with patch("connectors.gitlab.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await GitLabConnector().execute(
                "create_merge_request",
                {
                    "project_id": 1,
                    "title": "MR1",
                    "source_branch": "feat",
                    "target_branch": "main",
                    "description": "desc",
                },
                "tok",
            )
        self.assertEqual(result["id"], 1)
        self.assertEqual(result["title"], "MR1")

    async def test_create_merge_request_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await GitLabConnector().execute("create_merge_request", {"project_id": 1, "title": "MR1"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_merge_request_http_error(self):
        mock = _fake_response(status_code=400, text="Bad Request")
        with patch("connectors.gitlab.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await GitLabConnector().execute(
                    "create_merge_request",
                    {"project_id": 1, "title": "MR1", "source_branch": "feat", "target_branch": "main"},
                    "tok",
                )
        self.assertEqual(ctx.exception.code, "GITLAB_ERROR")


# ────────────────────────────────────────────────────────────────
# Reddit
# ────────────────────────────────────────────────────────────────


class TestRedditConnectorDeep(unittest.IsolatedAsyncioTestCase):
    async def test_submit_post_success(self):
        mock = _fake_response(
            {"success": True, "jquery": [["", "", "", ["", "https://reddit.com/r/test/comments/abc/"]]]}
        )
        with patch("connectors.reddit.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await RedditConnector().execute(
                "submit_post", {"subreddit": "test", "title": "Hello", "text": "world"}, "tok"
            )
        self.assertTrue(result["success"])
        self.assertEqual(result["post_url"], "https://reddit.com/r/test/comments/abc/")

    async def test_submit_post_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await RedditConnector().execute("submit_post", {"subreddit": "test"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_submit_post_http_error(self):
        mock = _fake_response(status_code=403, text="Forbidden")
        with patch("connectors.reddit.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await RedditConnector().execute("submit_post", {"subreddit": "test", "title": "Hello"}, "tok")
        self.assertEqual(ctx.exception.code, "REDDIT_FORBIDDEN")

    async def test_get_subreddit_posts_success(self):
        mock = _fake_response(
            {
                "data": {
                    "children": [
                        {
                            "data": {
                                "id": "p1",
                                "title": "T1",
                                "author": "u1",
                                "score": 10,
                                "url": "https://reddit.com/p1",
                                "created_utc": 1,
                                "num_comments": 5,
                            }
                        }
                    ],
                    "after": "a1",
                }
            }
        )
        with patch("connectors.reddit.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await RedditConnector().execute(
                "get_subreddit_posts", {"subreddit": "test", "sort": "hot", "limit": 10}, "tok"
            )
        self.assertEqual(result["posts"][0]["title"], "T1")
        self.assertEqual(result["after"], "a1")

    async def test_get_subreddit_posts_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await RedditConnector().execute("get_subreddit_posts", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_get_subreddit_posts_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.reddit.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await RedditConnector().execute("get_subreddit_posts", {"subreddit": "test"}, "tok")
        self.assertEqual(ctx.exception.code, "REDDIT_API_ERROR")

    async def test_get_comments_success(self):
        mock = _fake_response(
            [
                {"data": {"children": []}},
                {
                    "data": {
                        "children": [
                            {
                                "kind": "t1",
                                "data": {"id": "c1", "author": "u1", "body": "nice", "score": 5, "created_utc": 1},
                            }
                        ]
                    }
                },
            ]
        )
        with patch("connectors.reddit.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await RedditConnector().execute(
                "get_comments", {"subreddit": "test", "post_id": "p1", "limit": 10}, "tok"
            )
        self.assertEqual(result["comments"][0]["body"], "nice")

    async def test_get_comments_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await RedditConnector().execute("get_comments", {"subreddit": "test"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_get_comments_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.reddit.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await RedditConnector().execute("get_comments", {"subreddit": "test", "post_id": "p1"}, "tok")
        self.assertEqual(ctx.exception.code, "REDDIT_API_ERROR")

    async def test_search_subreddit_success(self):
        mock = _fake_response(
            {
                "data": {
                    "children": [
                        {
                            "data": {
                                "id": "p1",
                                "title": "T1",
                                "author": "u1",
                                "score": 10,
                                "url": "https://reddit.com/p1",
                            }
                        }
                    ],
                    "after": "a1",
                }
            }
        )
        with patch("connectors.reddit.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await RedditConnector().execute(
                "search_subreddit", {"subreddit": "test", "query": "hello", "sort": "relevance", "limit": 10}, "tok"
            )
        self.assertEqual(result["results"][0]["title"], "T1")
        self.assertEqual(result["after"], "a1")

    async def test_search_subreddit_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await RedditConnector().execute("search_subreddit", {"subreddit": "test"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_search_subreddit_http_error(self):
        mock = _fake_response(status_code=429, text="Rate limited")
        with patch("connectors.reddit.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await RedditConnector().execute("search_subreddit", {"subreddit": "test", "query": "hello"}, "tok")
        self.assertEqual(ctx.exception.code, "REDDIT_RATE_LIMITED")


# ────────────────────────────────────────────────────────────────
# Salesforce
# ────────────────────────────────────────────────────────────────


class TestSalesforceConnectorDeep(unittest.IsolatedAsyncioTestCase):
    async def test_query_success(self):
        mock = _fake_response({"records": [{"Id": "001"}], "totalSize": 1, "done": True})
        with patch("connectors.salesforce.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await SalesforceConnector().execute(
                "query", {"instance_url": "https://sf.salesforce.com", "soql": "SELECT Id FROM Account"}, "tok"
            )
        self.assertEqual(result["records"][0]["Id"], "001")
        self.assertEqual(result["total_size"], 1)
        self.assertTrue(result["done"])

    async def test_query_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await SalesforceConnector().execute("query", {"instance_url": "https://sf.salesforce.com"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_query_http_error(self):
        mock = _fake_response(status_code=401, text="Unauthorized")
        with patch("connectors.salesforce.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await SalesforceConnector().execute(
                    "query", {"instance_url": "https://sf.salesforce.com", "soql": "SELECT Id FROM Account"}, "tok"
                )
        self.assertEqual(ctx.exception.code, "TOKEN_EXPIRED")

    async def test_create_record_success(self):
        mock = _fake_response({"id": "001", "success": True})
        with patch("connectors.salesforce.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await SalesforceConnector().execute(
                "create_record",
                {"instance_url": "https://sf.salesforce.com", "object_type": "Account", "fields": {"Name": "Acme"}},
                "tok",
            )
        self.assertEqual(result["id"], "001")
        self.assertTrue(result["success"])

    async def test_create_record_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await SalesforceConnector().execute(
                "create_record", {"instance_url": "https://sf.salesforce.com", "object_type": "Account"}, "tok"
            )
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_record_http_error(self):
        mock = _fake_response(status_code=400, text="Bad Request")
        with patch("connectors.salesforce.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await SalesforceConnector().execute(
                    "create_record",
                    {"instance_url": "https://sf.salesforce.com", "object_type": "Account", "fields": {"Name": "Test"}},
                    "tok",
                )
        self.assertEqual(ctx.exception.code, "SALESFORCE_API_ERROR")

    async def test_get_record_success(self):
        mock = _fake_response({"Id": "001", "Name": "Acme"})
        with patch("connectors.salesforce.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await SalesforceConnector().execute(
                "get_record",
                {"instance_url": "https://sf.salesforce.com", "object_type": "Account", "record_id": "001"},
                "tok",
            )
        self.assertEqual(result["record"]["Id"], "001")
        self.assertEqual(result["record"]["Name"], "Acme")

    async def test_get_record_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await SalesforceConnector().execute(
                "get_record", {"instance_url": "https://sf.salesforce.com", "object_type": "Account"}, "tok"
            )
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_get_record_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.salesforce.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await SalesforceConnector().execute(
                    "get_record",
                    {"instance_url": "https://sf.salesforce.com", "object_type": "Account", "record_id": "001"},
                    "tok",
                )
        self.assertEqual(ctx.exception.code, "SALESFORCE_API_ERROR")

    async def test_update_record_success(self):
        mock = _fake_response({})
        with patch("connectors.salesforce.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await SalesforceConnector().execute(
                "update_record",
                {
                    "instance_url": "https://sf.salesforce.com",
                    "object_type": "Account",
                    "record_id": "001",
                    "fields": {"Name": "Acme2"},
                },
                "tok",
            )
        self.assertTrue(result["updated"])
        self.assertEqual(result["record_id"], "001")

    async def test_update_record_missing_param(self):
        with self.assertRaises(ConnectorError) as ctx:
            await SalesforceConnector().execute(
                "update_record",
                {"instance_url": "https://sf.salesforce.com", "object_type": "Account", "record_id": "001"},
                "tok",
            )
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_update_record_http_error(self):
        mock = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.salesforce.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await SalesforceConnector().execute(
                    "update_record",
                    {
                        "instance_url": "https://sf.salesforce.com",
                        "object_type": "Account",
                        "record_id": "001",
                        "fields": {"Name": "Test"},
                    },
                    "tok",
                )
        self.assertEqual(ctx.exception.code, "SALESFORCE_API_ERROR")

    async def test_list_objects_success(self):
        mock = _fake_response({"sobjects": [{"name": "Account", "label": "Account"}]})
        with patch("connectors.salesforce.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            result = await SalesforceConnector().execute(
                "list_objects", {"instance_url": "https://sf.salesforce.com"}, "tok"
            )
        self.assertEqual(result["objects"][0]["name"], "Account")

    async def test_list_objects_http_error(self):
        mock = _fake_response(status_code=401, text="Unauthorized")
        with patch("connectors.salesforce.request_with_rate_limit", new=AsyncMock(return_value=mock)):
            with self.assertRaises(ConnectorError) as ctx:
                await SalesforceConnector().execute(
                    "list_objects", {"instance_url": "https://sf.salesforce.com"}, "tok"
                )
        self.assertEqual(ctx.exception.code, "TOKEN_EXPIRED")


if __name__ == "__main__":
    unittest.main()
