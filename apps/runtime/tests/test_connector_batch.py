"""Parameterized batch tests for native connectors."""
from __future__ import annotations

import inspect
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from connectors import REGISTRY, get_connector, _discover_registry
from connectors.base import ConnectorError, IConnector
from connectors.calendar import CalendarConnector
from connectors.docs import DocsConnector
from connectors.drive import DriveConnector
from connectors.gmail import GmailConnector
from connectors.googlechat import GoogleChatConnector
from connectors.github import GitHubConnector
from connectors.hubspot import HubSpotConnector
from connectors.notion import NotionConnector
from connectors.openai import OpenaiConnector
from connectors.sheets import SheetsConnector
from connectors.slack import SlackConnector
from connectors.stripe import StripeConnector
from connectors.teams import TeamsConnector
from connectors.telegram import TelegramConnector
from connectors.whatsapp import WhatsappConnector


def _fake_response(
    json_data: dict | None = None,
    status_code: int = 200,
    text: str = "",
    raise_json_error: bool = False,
) -> MagicMock:
    """Return a mock httpx.Response with the required interface."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.text = text
    resp.raise_for_status = MagicMock()
    if raise_json_error:
        resp.json.side_effect = ValueError("No JSON decoder could parse the response")
    else:
        resp.json.return_value = json_data if json_data is not None else {}
    return resp


class TestGmailConnector(unittest.IsolatedAsyncioTestCase):
    async def test_list_emails_success(self) -> None:
        mock_resp = _fake_response(
            {"messages": [{"id": "m1"}], "resultSizeEstimate": 1, "nextPageToken": "t1"}
        )
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await GmailConnector().execute("list_emails", {"query": "subject:test", "max_results": 5}, "tok")
        self.assertEqual(result["emails"], [{"id": "m1"}])
        self.assertEqual(result["query"], "subject:test")
        self.assertEqual(result["result_size_estimate"], 1)

    async def test_list_emails_http_error(self) -> None:
        mock_resp = _fake_response(status_code=500, text="Internal Server Error")
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await GmailConnector().execute("list_emails", {}, "tok")
        self.assertIn("list_emails failed", str(ctx.exception))

    async def test_read_email_success(self) -> None:
        mock_resp = _fake_response({
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
                "mimeType": "text/plain",
                "body": {"data": "SGVsbG8=", "size": 5},
            },
            "labelIds": ["INBOX"],
        })
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await GmailConnector().execute("read_email", {"message_id": "msg1"}, "tok")
        self.assertEqual(result["message_id"], "msg1")
        self.assertEqual(result["subject"], "Hello")
        self.assertEqual(result["body_text"], "Hello")

    async def test_read_email_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await GmailConnector().execute("read_email", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_read_email_http_error(self) -> None:
        mock_resp = _fake_response(status_code=404, text="Not found")
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await GmailConnector().execute("read_email", {"message_id": "msg1"}, "tok")
        self.assertIn("read_email failed", str(ctx.exception))

    async def test_read_email_retries_transient_precondition(self) -> None:
        """Gmail's intermittent 400 failedPrecondition is retried, not surfaced."""
        precondition = _fake_response(
            status_code=400,
            json_data={
                "error": {
                    "code": 400,
                    "message": "Precondition check failed.",
                    "errors": [{"reason": "failedPrecondition"}],
                    "status": "FAILED_PRECONDITION",
                }
            },
        )
        success = _fake_response({
            "id": "msg1",
            "threadId": "t1",
            "snippet": "snip",
            "payload": {"mimeType": "text/plain", "body": {"data": "SGVsbG8=", "size": 5}},
            "labelIds": ["INBOX"],
        })
        mock = AsyncMock(side_effect=[precondition, precondition, success])
        with patch("connectors.gmail.request_with_rate_limit", new=mock), \
                patch("connectors.gmail.asyncio.sleep", new=AsyncMock()):
            result = await GmailConnector().execute("read_email", {"message_id": "msg1"}, "tok")
        self.assertEqual(result["message_id"], "msg1")
        self.assertEqual(mock.await_count, 3)

    async def test_read_email_gives_up_after_persistent_precondition(self) -> None:
        precondition = _fake_response(
            status_code=400,
            json_data={"error": {"status": "FAILED_PRECONDITION", "message": "Precondition check failed."}},
        )
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=precondition)), \
                patch("connectors.gmail.asyncio.sleep", new=AsyncMock()):
            with self.assertRaises(ConnectorError) as ctx:
                await GmailConnector().execute("read_email", {"message_id": "msg1"}, "tok")
        self.assertIn("read_email failed (400)", str(ctx.exception))

    async def test_read_email_does_not_retry_other_400(self) -> None:
        """A genuine 400 (e.g. invalid id) must fail fast without retrying."""
        bad = _fake_response(
            status_code=400,
            json_data={"error": {"status": "INVALID_ARGUMENT", "message": "Invalid id value"}},
        )
        mock = AsyncMock(return_value=bad)
        with patch("connectors.gmail.request_with_rate_limit", new=mock), \
                patch("connectors.gmail.asyncio.sleep", new=AsyncMock()):
            with self.assertRaises(ConnectorError):
                await GmailConnector().execute("read_email", {"message_id": "msg1"}, "tok")
        self.assertEqual(mock.await_count, 1)

    async def test_send_email_success(self) -> None:
        mock_resp = _fake_response({"id": "sent1", "threadId": "t1"})
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await GmailConnector().execute(
                "send_email", {"to": "x@y.com", "subject": "Hi", "body": "Hello"}, "tok"
            )
        self.assertEqual(result["message_id"], "sent1")

    async def test_send_email_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await GmailConnector().execute("send_email", {"subject": "Hi", "body": "Hello"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_send_email_http_error(self) -> None:
        mock_resp = _fake_response(status_code=400, text="Bad Request")
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await GmailConnector().execute(
                    "send_email", {"to": "x@y.com", "subject": "Hi", "body": "Hello"}, "tok"
                )
        self.assertIn("send_email failed", str(ctx.exception))

    async def test_archive_email_success(self) -> None:
        mock_resp = _fake_response({"id": "msg1", "labelIds": []})
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await GmailConnector().execute("archive_email", {"message_id": "msg1"}, "tok")
        self.assertTrue(result["archived"])

    async def test_archive_email_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await GmailConnector().execute("archive_email", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_archive_email_http_error(self) -> None:
        mock_resp = _fake_response(status_code=403, text="Forbidden")
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await GmailConnector().execute("archive_email", {"message_id": "msg1"}, "tok")
        self.assertIn("archive_email failed", str(ctx.exception))

    async def test_delete_email_trashes_by_default(self) -> None:
        mock_resp = _fake_response({"id": "msg1", "labelIds": ["TRASH"]})
        mock_call = AsyncMock(return_value=mock_resp)
        with patch("connectors.gmail.request_with_rate_limit", new=mock_call):
            result = await GmailConnector().execute("delete_email", {"message_id": "msg1"}, "tok")
        self.assertTrue(result["deleted"])
        self.assertFalse(result["permanent"])
        # Defaults to the reversible trash endpoint via POST.
        method, url = mock_call.await_args.args[1], mock_call.await_args.args[2]
        self.assertEqual(method, "POST")
        self.assertTrue(url.endswith("/messages/msg1/trash"))

    async def test_delete_email_permanent(self) -> None:
        mock_resp = _fake_response({})
        mock_call = AsyncMock(return_value=mock_resp)
        with patch("connectors.gmail.request_with_rate_limit", new=mock_call):
            result = await GmailConnector().execute(
                "delete_email", {"message_id": "msg1", "permanent": True}, "tok"
            )
        self.assertTrue(result["deleted"])
        self.assertTrue(result["permanent"])
        method, url = mock_call.await_args.args[1], mock_call.await_args.args[2]
        self.assertEqual(method, "DELETE")
        self.assertTrue(url.endswith("/messages/msg1"))

    async def test_delete_email_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await GmailConnector().execute("delete_email", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_delete_email_http_error(self) -> None:
        mock_resp = _fake_response(status_code=403, text="Forbidden")
        with patch("connectors.gmail.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await GmailConnector().execute("delete_email", {"message_id": "msg1"}, "tok")
        self.assertIn("delete_email failed", str(ctx.exception))


class TestSlackConnector(unittest.IsolatedAsyncioTestCase):
    async def test_send_message_success(self) -> None:
        mock_resp = _fake_response({"ok": True, "ts": "123", "channel": "C1", "message": {"text": "hi"}})
        with patch("connectors.slack.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await SlackConnector().execute("send_message", {"channel": "C1", "text": "hi"}, "tok")
        self.assertEqual(result["ts"], "123")

    async def test_send_message_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await SlackConnector().execute("send_message", {"text": "hi"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_send_message_http_error(self) -> None:
        mock_resp = _fake_response(status_code=500, text="Slack error")
        with patch("connectors.slack.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await SlackConnector().execute("send_message", {"channel": "C1", "text": "hi"}, "tok")
        self.assertEqual(ctx.exception.code, "SLACK_HTTP_ERROR")

    async def test_read_channel_success(self) -> None:
        mock_resp = _fake_response({"ok": True, "messages": [{"text": "m1"}], "has_more": True})
        with patch("connectors.slack.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await SlackConnector().execute("read_channel", {"channel": "C1"}, "tok")
        self.assertTrue(result["has_more"])

    async def test_read_channel_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await SlackConnector().execute("read_channel", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_read_channel_api_error(self) -> None:
        mock_resp = _fake_response({"ok": False, "error": "channel_not_found"})
        with patch("connectors.slack.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await SlackConnector().execute("read_channel", {"channel": "C1"}, "tok")
        self.assertEqual(ctx.exception.code, "SLACK_API_ERROR")

    async def test_list_channels_success(self) -> None:
        mock_resp = _fake_response({"ok": True, "channels": [{"id": "C1", "name": "general", "is_private": False}]})
        with patch("connectors.slack.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await SlackConnector().execute("list_channels", {}, "tok")
        self.assertEqual(result["channels"][0]["name"], "general")

    async def test_list_channels_http_error(self) -> None:
        mock_resp = _fake_response(status_code=429, text="rate limited")
        with patch("connectors.slack.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await SlackConnector().execute("list_channels", {}, "tok")
        self.assertEqual(ctx.exception.code, "SLACK_HTTP_ERROR")

    async def test_create_channel_success(self) -> None:
        mock_resp = _fake_response({"ok": True, "channel": {"id": "C2", "name": "new-channel"}})
        with patch("connectors.slack.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await SlackConnector().execute("create_channel", {"name": "new-channel"}, "tok")
        self.assertEqual(result["channel_id"], "C2")

    async def test_create_channel_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await SlackConnector().execute("create_channel", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_channel_http_error(self) -> None:
        mock_resp = _fake_response(status_code=400, text="bad request")
        with patch("connectors.slack.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await SlackConnector().execute("create_channel", {"name": "new"}, "tok")
        self.assertEqual(ctx.exception.code, "SLACK_HTTP_ERROR")


class TestDriveConnector(unittest.IsolatedAsyncioTestCase):
    async def test_list_files_success(self) -> None:
        mock_resp = _fake_response({"files": [{"id": "f1", "name": "doc"}]})
        with patch("connectors.drive.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await DriveConnector().execute("list_files", {"query": "doc"}, "tok")
        self.assertEqual(result["files"][0]["name"], "doc")

    async def test_list_files_query_escaping(self) -> None:
        captured = {}

        async def _capture(*args, **kwargs):
            captured["params"] = kwargs.get("params")
            return _fake_response({"files": []})

        with patch("connectors.drive.request_with_rate_limit", new=_capture):
            await DriveConnector().execute("list_files", {"query": "O'Brien"}, "tok")

        q = captured["params"]["q"]
        self.assertIn("name contains 'O\\'Brien'", q)
        self.assertNotIn("'O'Brien'", q)

    async def test_list_files_http_error(self) -> None:
        mock_resp = _fake_response(status_code=500, text="Server error")
        with patch("connectors.drive.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await DriveConnector().execute("list_files", {}, "tok")
        self.assertEqual(ctx.exception.code, "DRIVE_HTTP_ERROR")

    async def test_get_file_success(self) -> None:
        mock_resp = _fake_response({"id": "f1", "name": "doc", "mimeType": "application/pdf"})
        with patch("connectors.drive.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await DriveConnector().execute("get_file", {"file_id": "f1"}, "tok")
        self.assertEqual(result["name"], "doc")

    async def test_get_file_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await DriveConnector().execute("get_file", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_get_file_not_found(self) -> None:
        mock_resp = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.drive.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await DriveConnector().execute("get_file", {"file_id": "f1"}, "tok")
        self.assertEqual(ctx.exception.code, "NOT_FOUND")


class TestGitHubConnector(unittest.IsolatedAsyncioTestCase):
    async def test_create_issue_success(self) -> None:
        mock_resp = _fake_response({"number": 42, "html_url": "https://github.com/o/r/issues/42", "title": "Bug"})
        with patch("connectors.github.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await GitHubConnector().execute(
                "create_issue", {"owner": "o", "repo": "r", "title": "Bug"}, "tok"
            )
        self.assertEqual(result["issue_number"], 42)

    async def test_create_issue_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await GitHubConnector().execute("create_issue", {"owner": "o"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_issue_http_error(self) -> None:
        mock_resp = _fake_response(status_code=422, text="Validation Failed")
        with patch("connectors.github.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await GitHubConnector().execute(
                    "create_issue", {"owner": "o", "repo": "r", "title": "Bug"}, "tok"
                )
        self.assertEqual(ctx.exception.code, "GITHUB_API_ERROR")

    async def test_list_prs_success(self) -> None:
        mock_resp = _fake_response([
            {"number": 1, "title": "PR1", "state": "open", "html_url": "u", "user": {"login": "a"}, "created_at": "2024-01-01"}
        ])
        with patch("connectors.github.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await GitHubConnector().execute(
                "list_prs", {"owner": "o", "repo": "r"}, "tok"
            )
        self.assertEqual(result["pull_requests"][0]["author"], "a")

    async def test_list_prs_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await GitHubConnector().execute("list_prs", {"owner": "o"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_list_prs_http_error(self) -> None:
        mock_resp = _fake_response(status_code=401, text="Unauthorized")
        with patch("connectors.github.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await GitHubConnector().execute("list_prs", {"owner": "o", "repo": "r"}, "tok")
        self.assertEqual(ctx.exception.code, "TOKEN_EXPIRED")


class TestHubSpotConnector(unittest.IsolatedAsyncioTestCase):
    async def test_create_contact_success(self) -> None:
        mock_resp = _fake_response({"id": "1", "properties": {"email": "a@b.com", "firstname": "A"}})
        with patch("connectors.hubspot.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await HubSpotConnector().execute("create_contact", {"email": "a@b.com", "firstname": "A"}, "tok")
        self.assertEqual(result["email"], "a@b.com")

    async def test_create_contact_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await HubSpotConnector().execute("create_contact", {"firstname": "A"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_contact_conflict(self) -> None:
        mock_resp = _fake_response(status_code=409, text="Conflict")
        with patch("connectors.hubspot.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await HubSpotConnector().execute("create_contact", {"email": "a@b.com"}, "tok")
        self.assertEqual(ctx.exception.code, "CONFLICT")

    async def test_get_contact_by_id_success(self) -> None:
        mock_resp = _fake_response({"id": "1", "properties": {"email": "a@b.com"}})
        with patch("connectors.hubspot.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await HubSpotConnector().execute("get_contact", {"contact_id": "1"}, "tok")
        self.assertEqual(result["email"], "a@b.com")

    async def test_get_contact_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await HubSpotConnector().execute("get_contact", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_get_contact_not_found(self) -> None:
        mock_resp = _fake_response(status_code=404, text="Not found")
        with patch("connectors.hubspot.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await HubSpotConnector().execute("get_contact", {"contact_id": "1"}, "tok")
        self.assertEqual(ctx.exception.code, "NOT_FOUND")

    async def test_create_deal_success(self) -> None:
        mock_resp = _fake_response({"id": "d1", "properties": {"dealname": "Big Deal", "amount": "1000"}})
        with patch("connectors.hubspot.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await HubSpotConnector().execute("create_deal", {"deal_name": "Big Deal", "amount": "1000"}, "tok")
        self.assertEqual(result["dealname"], "Big Deal")

    async def test_create_deal_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await HubSpotConnector().execute("create_deal", {"amount": "1000"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_deal_http_error(self) -> None:
        mock_resp = _fake_response(status_code=400, text="Bad request")
        with patch("connectors.hubspot.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await HubSpotConnector().execute("create_deal", {"deal_name": "Deal"}, "tok")
        self.assertEqual(ctx.exception.code, "HUBSPOT_HTTP_ERROR")


class TestStripeConnector(unittest.IsolatedAsyncioTestCase):
    async def test_create_customer_success(self) -> None:
        mock_resp = _fake_response({"id": "cus_1", "email": "a@b.com"})
        with patch("connectors.stripe.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await StripeConnector().execute("create_customer", {"email": "a@b.com", "name": "A"}, "tok")
        self.assertEqual(result["id"], "cus_1")

    async def test_create_customer_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await StripeConnector().execute("create_customer", {"name": "A"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_customer_http_error(self) -> None:
        mock_resp = _fake_response(status_code=402, text="Payment Required")
        with patch("connectors.stripe.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await StripeConnector().execute("create_customer", {"email": "a@b.com"}, "tok")
        self.assertEqual(ctx.exception.code, "STRIPE_ERROR")

    async def test_list_payments_success(self) -> None:
        mock_resp = _fake_response({"data": [{"id": "pi_1"}], "has_more": False})
        with patch("connectors.stripe.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await StripeConnector().execute("list_payments", {}, "tok")
        self.assertEqual(result["payments"][0]["id"], "pi_1")

    async def test_list_payments_http_error(self) -> None:
        mock_resp = _fake_response(status_code=500, text="Stripe error")
        with patch("connectors.stripe.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await StripeConnector().execute("list_payments", {}, "tok")
        self.assertEqual(ctx.exception.code, "STRIPE_ERROR")

    async def test_retrieve_invoice_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await StripeConnector().execute("retrieve_invoice", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")


class TestNotionConnector(unittest.IsolatedAsyncioTestCase):
    async def test_query_database_success(self) -> None:
        mock_resp = _fake_response({"results": [{"id": "p1"}], "has_more": False})
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await NotionConnector().execute("query_database", {"database_id": "db1"}, "tok")
        self.assertEqual(result["results"][0]["id"], "p1")

    async def test_query_database_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await NotionConnector().execute("query_database", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_query_database_http_error(self) -> None:
        mock_resp = _fake_response(status_code=400, text="Bad request")
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await NotionConnector().execute("query_database", {"database_id": "db1"}, "tok")
        self.assertEqual(ctx.exception.code, "NOTION_API_ERROR")

    async def test_create_page_success(self) -> None:
        mock_resp = _fake_response({"id": "page1", "url": "https://notion.so/page1"})
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await NotionConnector().execute(
                "create_page", {"parent_id": "33fac82c-a3d4-80ca-95cd-f8b2ef72b2af", "title": "Hello"}, "tok"
            )
        self.assertEqual(result["page_id"], "page1")

    async def test_create_page_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await NotionConnector().execute("create_page", {"title": "Hello"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_page_invalid_json(self) -> None:
        mock_resp = _fake_response(status_code=200, raise_json_error=True)
        with patch("connectors.notion.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await NotionConnector().execute(
                    "create_page", {"parent_id": "33fac82c-a3d4-80ca-95cd-f8b2ef72b2af", "title": "Hello"}, "tok"
                )
        self.assertEqual(ctx.exception.code, "NOTION_PARSE_ERROR")


class TestOpenAIConnector(unittest.IsolatedAsyncioTestCase):
    async def test_create_completion_success(self) -> None:
        mock_resp = _fake_response({"id": "cmpl_1", "choices": [{"text": "hi"}]})
        with patch("connectors.openai.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await OpenaiConnector().execute("create_completion", {"model": "gpt-4", "prompt": "hi"}, "tok")
        self.assertEqual(result["id"], "cmpl_1")

    async def test_create_completion_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await OpenaiConnector().execute("create_completion", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_completion_http_error(self) -> None:
        mock_resp = _fake_response(status_code=400, text="Bad request")
        with patch("connectors.openai.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await OpenaiConnector().execute("create_completion", {"model": "gpt-4"}, "tok")
        self.assertEqual(ctx.exception.code, "API_ERROR")


class TestGoogleChatConnector(unittest.IsolatedAsyncioTestCase):
    async def test_send_message_success(self) -> None:
        mock_resp = _fake_response({"name": "msg1", "space": {"name": "spaces/s1"}, "createTime": "t", "text": "hi"})
        with patch("connectors.googlechat.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await GoogleChatConnector().execute("send_message", {"space_name": "spaces/s1", "text": "hi"}, "tok")
        self.assertEqual(result["space"], "spaces/s1")

    async def test_send_message_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await GoogleChatConnector().execute("send_message", {"text": "hi"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_send_message_http_error(self) -> None:
        mock_resp = _fake_response(status_code=403, text="Forbidden")
        with patch("connectors.googlechat.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await GoogleChatConnector().execute("send_message", {"space_name": "spaces/s1", "text": "hi"}, "tok")
        self.assertEqual(ctx.exception.code, "GOOGLECHAT_FORBIDDEN")

    async def test_list_spaces_success(self) -> None:
        mock_resp = _fake_response({"spaces": [{"name": "spaces/s1", "displayName": "S1"}], "nextPageToken": "t1"})
        with patch("connectors.googlechat.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await GoogleChatConnector().execute("list_spaces", {}, "tok")
        self.assertEqual(result["spaces"][0]["display_name"], "S1")

    async def test_list_spaces_http_error(self) -> None:
        mock_resp = _fake_response(status_code=500, text="error")
        with patch("connectors.googlechat.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await GoogleChatConnector().execute("list_spaces", {}, "tok")
        self.assertEqual(ctx.exception.code, "GOOGLECHAT_API_ERROR")


class TestTeamsConnector(unittest.IsolatedAsyncioTestCase):
    async def test_send_message_success(self) -> None:
        mock_resp = _fake_response({
            "id": "m1",
            "channelIdentity": {"channelId": "c1"},
            "createdDateTime": "2024-01-01",
        })
        with patch("connectors.teams.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await TeamsConnector().execute(
                "send_message", {"team_id": "t1", "channel_id": "c1", "content": "hi"}, "tok"
            )
        self.assertEqual(result["channel_id"], "c1")

    async def test_send_message_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await TeamsConnector().execute("send_message", {"team_id": "t1"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_send_message_http_error(self) -> None:
        mock_resp = _fake_response(status_code=401, text="Unauthorized")
        with patch("connectors.teams.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await TeamsConnector().execute(
                    "send_message", {"team_id": "t1", "channel_id": "c1", "content": "hi"}, "tok"
                )
        self.assertEqual(ctx.exception.code, "TOKEN_EXPIRED")

    async def test_list_teams_success(self) -> None:
        mock_resp = _fake_response({"value": [{"id": "t1", "displayName": "Team1"}]})
        with patch("connectors.teams.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await TeamsConnector().execute("list_teams", {}, "tok")
        self.assertEqual(result["teams"][0]["display_name"], "Team1")

    async def test_list_teams_http_error(self) -> None:
        mock_resp = _fake_response(status_code=403, text="Forbidden")
        with patch("connectors.teams.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await TeamsConnector().execute("list_teams", {}, "tok")
        self.assertEqual(ctx.exception.code, "TEAMS_FORBIDDEN")


class TestTelegramConnector(unittest.IsolatedAsyncioTestCase):
    async def test_send_message_success(self) -> None:
        mock_resp = _fake_response({"ok": True, "result": {"message_id": 1, "chat": {"id": 123}, "date": 1}})
        with patch("connectors.telegram.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await TelegramConnector().execute("send_message", {"chat_id": 123, "text": "hi"}, "tok")
        self.assertEqual(result["message_id"], 1)

    async def test_send_message_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await TelegramConnector().execute("send_message", {"text": "hi"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_send_message_http_error(self) -> None:
        mock_resp = _fake_response(status_code=401, text="Unauthorized")
        with patch("connectors.telegram.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await TelegramConnector().execute("send_message", {"chat_id": 123, "text": "hi"}, "tok")
        self.assertEqual(ctx.exception.code, "TOKEN_EXPIRED")

    async def test_get_updates_success(self) -> None:
        mock_resp = _fake_response({"ok": True, "result": [{"update_id": 1}]})
        with patch("connectors.telegram.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await TelegramConnector().execute("get_updates", {}, "tok")
        self.assertEqual(result["updates"][0]["update_id"], 1)

    async def test_get_updates_api_error(self) -> None:
        mock_resp = _fake_response({"ok": False, "description": "Unauthorized"})
        with patch("connectors.telegram.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await TelegramConnector().execute("get_updates", {}, "tok")
        self.assertEqual(ctx.exception.code, "TELEGRAM_API_ERROR")


class TestWhatsAppConnector(unittest.IsolatedAsyncioTestCase):
    async def test_send_text_message_success(self) -> None:
        mock_resp = _fake_response({"messages": [{"id": "wamid.1"}]})
        with patch("connectors.whatsapp.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await WhatsappConnector().execute(
                "send_text_message", {"phone_number_id": "pn1", "to": "123", "text": "hi"}, "tok"
            )
        self.assertEqual(result["message_id"], "wamid.1")

    async def test_send_text_message_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await WhatsappConnector().execute("send_text_message", {"to": "123"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_send_text_message_http_error(self) -> None:
        mock_resp = _fake_response(status_code=400, text="Bad request")
        with patch("connectors.whatsapp.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await WhatsappConnector().execute(
                    "send_text_message", {"phone_number_id": "pn1", "to": "123", "text": "hi"}, "tok"
                )
        self.assertEqual(ctx.exception.code, "WHATSAPP_API_ERROR")

    async def test_get_phone_number_id_success(self) -> None:
        mock_resp = _fake_response({"data": [{"id": "pn1", "display_phone_number": "+1"}]})
        with patch("connectors.whatsapp.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await WhatsappConnector().execute("get_phone_number_id", {"waba_id": "w1"}, "tok")
        self.assertEqual(result["phone_numbers"][0]["id"], "pn1")

    async def test_get_phone_number_id_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await WhatsappConnector().execute("get_phone_number_id", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_get_phone_number_id_http_error(self) -> None:
        mock_resp = _fake_response(status_code=403, text="Forbidden")
        with patch("connectors.whatsapp.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await WhatsappConnector().execute("get_phone_number_id", {"waba_id": "w1"}, "tok")
        self.assertEqual(ctx.exception.code, "WHATSAPP_FORBIDDEN")


class TestCalendarConnector(unittest.IsolatedAsyncioTestCase):
    async def test_list_events_success(self) -> None:
        mock_resp = _fake_response({
            "items": [{"id": "e1", "summary": "Meeting", "start": {}, "end": {}, "status": "confirmed"}],
            "nextPageToken": "t1",
        })
        with patch("connectors.calendar.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await CalendarConnector().execute("list_events", {"calendar_id": "primary"}, "tok")
        self.assertEqual(result["events"][0]["summary"], "Meeting")

    async def test_list_events_http_error(self) -> None:
        mock_resp = _fake_response(status_code=401, text="Unauthorized")
        with patch("connectors.calendar.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await CalendarConnector().execute("list_events", {}, "tok")
        self.assertEqual(ctx.exception.code, "TOKEN_EXPIRED")

    async def test_create_event_success(self) -> None:
        mock_resp = _fake_response({"id": "e1", "htmlLink": "https://cal/e1", "status": "confirmed"})
        with patch("connectors.calendar.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await CalendarConnector().execute(
                "create_event",
                {"summary": "Meeting", "start": {"dateTime": "2024-01-01T10:00:00Z"}, "end": {"dateTime": "2024-01-01T11:00:00Z"}},
                "tok",
            )
        self.assertEqual(result["id"], "e1")

    async def test_create_event_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await CalendarConnector().execute("create_event", {"summary": "Meeting"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_create_event_http_error(self) -> None:
        mock_resp = _fake_response(status_code=400, text="Bad request")
        with patch("connectors.calendar.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await CalendarConnector().execute(
                    "create_event",
                    {"summary": "Meeting", "start": {"dateTime": "2024-01-01T10:00:00Z"}, "end": {"dateTime": "2024-01-01T11:00:00Z"}},
                    "tok",
                )
        self.assertEqual(ctx.exception.code, "CALENDAR_HTTP_ERROR")


class TestSheetsConnector(unittest.IsolatedAsyncioTestCase):
    async def test_read_range_success(self) -> None:
        mock_resp = _fake_response({"range": "Sheet1!A1:B2", "values": [["a", "b"]], "majorDimension": "ROWS"})
        with patch("connectors.sheets.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await SheetsConnector().execute(
                "read_range", {"spreadsheet_id": "s1", "range": "Sheet1!A1:B2"}, "tok"
            )
        self.assertEqual(result["values"], [["a", "b"]])

    async def test_read_range_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await SheetsConnector().execute("read_range", {"spreadsheet_id": "s1"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_read_range_http_error(self) -> None:
        mock_resp = _fake_response(status_code=403, text="Forbidden")
        with patch("connectors.sheets.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await SheetsConnector().execute(
                    "read_range", {"spreadsheet_id": "s1", "range": "Sheet1!A1"}, "tok"
                )
        self.assertEqual(ctx.exception.code, "SHEETS_PERMISSION_DENIED")

    async def test_write_range_success(self) -> None:
        mock_resp = _fake_response({"updatedRange": "Sheet1!A1", "updatedRows": 1, "updatedCells": 1})
        with patch("connectors.sheets.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await SheetsConnector().execute(
                "write_range", {"spreadsheet_id": "s1", "range": "Sheet1!A1", "values": [["x"]]}, "tok"
            )
        self.assertEqual(result["updated_rows"], 1)

    async def test_write_range_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await SheetsConnector().execute("write_range", {"spreadsheet_id": "s1", "range": "A1"}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_write_range_http_error(self) -> None:
        mock_resp = _fake_response(status_code=400, text="Bad request")
        with patch("connectors.sheets.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await SheetsConnector().execute(
                    "write_range", {"spreadsheet_id": "s1", "range": "A1", "values": [["x"]]}, "tok"
                )
        self.assertEqual(ctx.exception.code, "SHEETS_API_ERROR")


class TestDocsConnector(unittest.IsolatedAsyncioTestCase):
    async def test_read_document_success(self) -> None:
        mock_resp = _fake_response({
            "documentId": "d1",
            "title": "Doc",
            "body": {"content": [{"paragraph": {"elements": [{"textRun": {"content": "Hello"}}]}}]},
            "revisionId": "r1",
        })
        with patch("connectors.docs.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await DocsConnector().execute("read_document", {"document_id": "d1"}, "tok")
        self.assertEqual(result["title"], "Doc")
        self.assertEqual(result["text"], "Hello")

    async def test_read_document_missing_param(self) -> None:
        with self.assertRaises(ConnectorError) as ctx:
            await DocsConnector().execute("read_document", {}, "tok")
        self.assertEqual(ctx.exception.code, "MISSING_PARAM")

    async def test_read_document_http_error(self) -> None:
        mock_resp = _fake_response(status_code=404, text="Not Found")
        with patch("connectors.docs.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await DocsConnector().execute("read_document", {"document_id": "d1"}, "tok")
        self.assertEqual(ctx.exception.code, "NOT_FOUND")

    async def test_create_document_success(self) -> None:
        mock_resp = _fake_response({"documentId": "d2", "title": "New Doc"})
        with patch("connectors.docs.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            result = await DocsConnector().execute("create_document", {"title": "New Doc"}, "tok")
        self.assertEqual(result["document_id"], "d2")

    async def test_create_document_http_error(self) -> None:
        mock_resp = _fake_response(status_code=400, text="Bad request")
        with patch("connectors.docs.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
            with self.assertRaises(ConnectorError) as ctx:
                await DocsConnector().execute("create_document", {}, "tok")
        self.assertEqual(ctx.exception.code, "DOCS_HTTP_ERROR")


class TestConnectorRegistry(unittest.TestCase):
    def test_get_connector_returns_instance_for_known_provider(self) -> None:
        conn = get_connector("gmail")
        self.assertIsInstance(conn, GmailConnector)

    def test_get_connector_returns_none_for_unknown_provider(self) -> None:
        conn = get_connector("nonexistent_provider_12345")
        self.assertIsNone(conn)

    def test_registry_skips_internal_modules(self) -> None:
        self.assertNotIn("__init__", REGISTRY)
        self.assertNotIn("base", REGISTRY)
        self.assertNotIn("rate_limit", REGISTRY)

    def test_discover_registry_detects_duplicate_provider(self) -> None:
        fake_module = types.ModuleType("fake_mod")

        class DupA(IConnector):
            provider = "dup_test"
            supported_operations = []

            async def execute(self, operation, params, access_token):
                return {}

        class DupB(IConnector):
            provider = "dup_test"
            supported_operations = []

            async def execute(self, operation, params, access_token):
                return {}

        fake_module.DupA = DupA
        fake_module.DupB = DupB

        with patch("connectors.Path.glob") as mock_glob, patch("connectors.import_module", return_value=fake_module):
            mock_path = MagicMock()
            mock_path.stem = "fake_mod"
            mock_glob.return_value = [mock_path]
            with patch("connectors.inspect.getmembers", return_value=[("DupA", DupA), ("DupB", DupB)]):
                with self.assertRaises(RuntimeError) as ctx:
                    _discover_registry()
        self.assertIn("Duplicate connector provider 'dup_test'", str(ctx.exception))

    def test_discover_registry_skips_non_connector_classes(self) -> None:
        fake_module = types.ModuleType("fake_mod2")

        class NotAConnector:
            pass

        fake_module.NotAConnector = NotAConnector

        with patch("connectors.Path.glob") as mock_glob, patch("connectors.import_module", return_value=fake_module):
            mock_path = MagicMock()
            mock_path.stem = "fake_mod2"
            mock_glob.return_value = [mock_path]
            with patch("connectors.inspect.getmembers", return_value=[("NotAConnector", NotAConnector)]):
                registry = _discover_registry()
        self.assertNotIn("fake_mod2", registry)


if __name__ == "__main__":
    unittest.main()
