"""Genesis V2 connection introspection: metadata-only fetch + endpoint auth."""

from __future__ import annotations


import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi.testclient import TestClient

from connectors.introspection import (
    IntrospectionError,
    MAX_RESOURCES_PER_CONNECTION,
    introspect_gmail,
    introspect_notion,
    introspect_slack,
    supports_introspection,
)
from internal_auth import INTERNAL_SERVICE_TOKEN_HEADER
from main import app


def _fake_response(json_body: dict, status_code: int = 200, headers: dict | None = None) -> MagicMock:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.is_success = 200 <= status_code < 300
    resp.json.return_value = json_body
    resp.headers = headers or {}
    return resp


def _client_returning(resp: MagicMock) -> MagicMock:
    client = MagicMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(return_value=resp)
    client.post = AsyncMock(return_value=resp)
    return client


class GmailIntrospectionTests(unittest.IsolatedAsyncioTestCase):
    async def test_labels_split_into_system_and_user_named(self) -> None:
        client = _client_returning(
            _fake_response(
                {
                    "labels": [
                        {"id": "INBOX", "name": "INBOX", "type": "system"},
                        {"id": "Label_7", "name": "Kundenrechnungen", "type": "user"},
                    ]
                }
            )
        )

        descriptor = await introspect_gmail(client, "token")

        self.assertEqual(descriptor["provider"], "gmail")
        by_name = {r["name"]: r for r in descriptor["resources"]}
        self.assertFalse(by_name["INBOX"]["user_named"])
        self.assertTrue(by_name["Kundenrechnungen"]["user_named"])
        # Only the metadata endpoint is called — never message contents.
        called_url = client.get.call_args.args[0]
        self.assertTrue(called_url.endswith("/labels"))

    async def test_caps_resource_count(self) -> None:
        labels = [
            {"id": f"L{i}", "name": f"Label {i}", "type": "user"} for i in range(MAX_RESOURCES_PER_CONNECTION + 10)
        ]
        client = _client_returning(_fake_response({"labels": labels}))

        descriptor = await introspect_gmail(client, "token")

        self.assertEqual(len(descriptor["resources"]), MAX_RESOURCES_PER_CONNECTION)
        self.assertTrue(descriptor["truncated"])

    async def test_provider_error_raises(self) -> None:
        client = _client_returning(_fake_response({}, status_code=403))

        with self.assertRaises(IntrospectionError) as ctx:
            await introspect_gmail(client, "token")
        self.assertEqual(ctx.exception.code, "PROVIDER_ERROR")


class SlackIntrospectionTests(unittest.IsolatedAsyncioTestCase):
    async def test_channels_and_scope_header(self) -> None:
        client = _client_returning(
            _fake_response(
                {"ok": True, "channels": [{"name": "sales-eu"}, {"name": "general"}]},
                headers={"x-oauth-scopes": "chat:write, channels:read"},
            )
        )

        descriptor = await introspect_slack(client, "token")

        names = [r["name"] for r in descriptor["resources"]]
        self.assertEqual(names, ["sales-eu", "general"])
        self.assertTrue(all(r["user_named"] for r in descriptor["resources"]))
        self.assertEqual(descriptor["granted_scopes"], ["chat:write", "channels:read"])

    async def test_slack_not_ok_raises(self) -> None:
        client = _client_returning(_fake_response({"ok": False, "error": "invalid_auth"}))

        with self.assertRaises(IntrospectionError) as ctx:
            await introspect_slack(client, "token")
        self.assertIn("invalid_auth", ctx.exception.message)

    async def test_missing_scope_falls_back_to_public_channels(self) -> None:
        # A token with channels:read but not groups:read: Slack rejects the
        # combined public+private request with missing_scope; introspection must
        # retry with public channels only rather than fail entirely.
        missing = _fake_response({"ok": False, "error": "missing_scope"})
        ok = _fake_response(
            {"ok": True, "channels": [{"name": "revenue"}, {"name": "sozial"}]},
            headers={"x-oauth-scopes": "channels:read"},
        )
        client = MagicMock(spec=httpx.AsyncClient)
        client.get = AsyncMock(side_effect=[missing, ok])

        descriptor = await introspect_slack(client, "token")

        self.assertEqual([r["name"] for r in descriptor["resources"]], ["revenue", "sozial"])
        # First attempt asked for both types; the retry narrowed to public only.
        self.assertEqual(client.get.call_args_list[0].kwargs["params"]["types"], "public_channel,private_channel")
        self.assertEqual(client.get.call_args_list[1].kwargs["params"]["types"], "public_channel")

    async def test_missing_scope_on_retry_still_raises(self) -> None:
        # If public-only also fails, surface the provider error rather than hang.
        client = MagicMock(spec=httpx.AsyncClient)
        client.get = AsyncMock(
            side_effect=[
                _fake_response({"ok": False, "error": "missing_scope"}),
                _fake_response({"ok": False, "error": "missing_scope"}),
            ]
        )
        with self.assertRaises(IntrospectionError) as ctx:
            await introspect_slack(client, "token")
        self.assertIn("missing_scope", ctx.exception.message)


class NotionIntrospectionTests(unittest.IsolatedAsyncioTestCase):
    async def test_database_schema_only(self) -> None:
        client = _client_returning(
            _fake_response(
                {
                    "results": [
                        {
                            "object": "database",
                            "title": [{"plain_text": "CRM "}, {"plain_text": "Leads"}],
                            "properties": {
                                "Deal Status": {
                                    "type": "select",
                                    "select": {"options": [{"name": "Qualified"}, {"name": "Won"}]},
                                },
                                "Notes": {"type": "rich_text", "rich_text": {}},
                            },
                        },
                        # Pages must be ignored even if the API returned one.
                        {"object": "page", "properties": {"leaky": {"type": "title"}}},
                    ],
                    "has_more": False,
                }
            )
        )

        descriptor = await introspect_notion(client, "token")

        self.assertEqual(len(descriptor["resources"]), 1)
        database = descriptor["resources"][0]
        self.assertEqual(database["name"], "CRM Leads")
        self.assertTrue(database["user_named"])
        props = {p["name"]: p for p in database["properties"]}
        self.assertEqual(props["Deal Status"]["options"], ["Qualified", "Won"])
        self.assertNotIn("options", props["Notes"])
        # The search request must filter to databases (schema, never rows).
        sent_json = client.post.call_args.kwargs["json"]
        self.assertEqual(sent_json["filter"], {"value": "database", "property": "object"})


class IntrospectionRegistryTests(unittest.TestCase):
    def test_supported_providers(self) -> None:
        self.assertTrue(supports_introspection("gmail"))
        self.assertTrue(supports_introspection("Slack"))
        self.assertFalse(supports_introspection("hubspot"))


class IntrospectEndpointAuthTests(unittest.TestCase):
    def test_requires_internal_token(self) -> None:
        response = TestClient(app).post("/introspect", content=b"{}")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {"detail": "Unauthorized"})

    def test_rejects_token_without_subject(self) -> None:
        import json as json_module
        import os

        from internal_auth import create_internal_service_token

        body = json_module.dumps({"connection_ids": ["00000000-0000-0000-0000-000000000001"]})
        env = {"RUNTIME_ENV": "local", "INTERNAL_SERVICE_AUTH_SECRET": "test-secret"}
        with patch.dict(os.environ, env, clear=False):
            token = create_internal_service_token("runtime:introspect", method="POST", path="/introspect", body=body)
            response = TestClient(app).post(
                "/introspect",
                headers={INTERNAL_SERVICE_TOKEN_HEADER: token},
                content=body,
            )

        self.assertEqual(response.status_code, 401)

    def test_ownership_enforced(self) -> None:
        import json as json_module
        import os

        from internal_auth import create_internal_service_token

        body = json_module.dumps({"connection_ids": ["00000000-0000-0000-0000-000000000001"]})
        env = {"RUNTIME_ENV": "local", "INTERNAL_SERVICE_AUTH_SECRET": "test-secret"}

        # The connection exists but belongs to a different user.
        fake_db = MagicMock()
        fake_db.table.return_value.select.return_value.in_.return_value.execute.return_value.data = [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "provider": "gmail",
                "user_id": "someone-else",
                "is_valid": True,
            }
        ]

        with patch.dict(os.environ, env, clear=False), patch("main.get_db", return_value=fake_db):
            token = create_internal_service_token(
                "runtime:introspect",
                subject="user-1",
                method="POST",
                path="/introspect",
                body=body,
            )
            response = TestClient(app).post(
                "/introspect",
                headers={INTERNAL_SERVICE_TOKEN_HEADER: token},
                content=body,
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["descriptors"], [])
        self.assertEqual(
            payload["errors"]["00000000-0000-0000-0000-000000000001"],
            "CONNECTION_NOT_FOUND",
        )


if __name__ == "__main__":
    unittest.main()
