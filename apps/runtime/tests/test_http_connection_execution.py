from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from engine.executor import ExecutionError, ProgramExecutor
from schema import HttpConnectionConfig, OAuthConnectionConfig, SchemaEdge, SchemaNode


class _Circuit:
    async def call(self, func, *args):
        return await func(*args)


class _Response:
    status_code = 200
    headers = {}
    text = '{"ok":true}'

    def __init__(self, url: str) -> None:
        self.request = SimpleNamespace(url=url)

    def json(self) -> dict:
        return {"ok": True}


class _Client:
    def __init__(self, *args, **kwargs) -> None:
        self.request_kwargs: dict | None = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args) -> None:
        return None

    async def request(self, **kwargs):
        self.request_kwargs = kwargs
        return _Response(kwargs["url"])


def _http_node(
    *,
    connection: str | None = None,
    auth_value: str | None = None,
    url: str = "https://api.example.com/messages/{{n4.email.id}}/trash",
) -> SchemaNode:
    return SchemaNode(
        id="http-1",
        type="connection",
        label="HTTP fallback",
        description="",
        connection=connection,
        config=HttpConnectionConfig(
            connector_type="http",
            method="POST",
            url=url,
            auth_type="bearer" if auth_value else "none",
            auth_value=auth_value,
            query_params=[{"key": "message", "value": "{{n4.email.id}}"}],
            headers=[{"key": "X-Message", "value": "{{n4.email.id}}"}],
            body='{"message_id":"{{n4.email.id}}"}',
            parse_response=True,
            timeout_seconds=30,
            retry=None,
        ),
        position={},
        status="idle",
    )


def _oauth_node() -> SchemaNode:
    return SchemaNode(
        id="n2",
        type="connection",
        label="OAuth source",
        description="",
        connection="gmail:primary",
        config=OAuthConnectionConfig(
            scope_access="read_write",
            scope_required=[],
            operation="list_emails",
        ),
        position={},
        status="idle",
    )


def _executor() -> ProgramExecutor:
    executor = ProgramExecutor.__new__(ProgramExecutor)
    executor.node_map = {}
    executor._record_telemetry = Mock()
    return executor


class HttpConnectionExecutionTests(unittest.IsolatedAsyncioTestCase):
    async def test_resolves_templates_before_dispatch(self) -> None:
        executor = _executor()
        node = _http_node()
        clients: list[_Client] = []

        def client_factory(*args, **kwargs):
            client = _Client(*args, **kwargs)
            clients.append(client)
            return client

        with (
            patch("engine.executor._validate_outbound_url") as validate_url,
            patch("engine.executor.httpx.AsyncClient", client_factory),
        ):
            result = await executor._execute_http_connection(
                node,
                node.config,
                {"n4": {"email": {"id": "message-1"}}},
            )

        validate_url.assert_called_once_with(
            "https://api.example.com/messages/message-1/trash"
        )
        self.assertEqual(result["url"], "https://api.example.com/messages/message-1/trash")
        self.assertEqual(clients[0].request_kwargs["params"], {"message": "message-1"})
        self.assertEqual(clients[0].request_kwargs["headers"], {"X-Message": "message-1"})
        self.assertEqual(clients[0].request_kwargs["json"], {"message_id": "message-1"})

    async def test_fetches_linked_oauth_token_for_http_fallback(self) -> None:
        executor = _executor()
        executor._resolve_connection_id = Mock(return_value="connection-1")
        executor._provider_for_connection = Mock(return_value="gmail")
        executor._fetch_oauth_token = AsyncMock(return_value="oauth-token")
        node = _http_node(
            connection="gmail:primary",
            auth_value="__OAUTH_CONNECTION__",
            url="https://gmail.googleapis.com/gmail/v1/users/me/messages/{{n4.email.id}}/trash",
        )
        node.config.body = None
        clients: list[_Client] = []

        def client_factory(*args, **kwargs):
            client = _Client(*args, **kwargs)
            clients.append(client)
            return client

        with (
            patch("engine.executor._validate_outbound_url"),
            patch("engine.executor.get_oauth_token_circuit", return_value=_Circuit()),
            patch("engine.executor.httpx.AsyncClient", client_factory),
        ):
            await executor._execute_http_connection(
                node,
                node.config,
                {"n4": {"email": {"id": "message-1"}}},
            )

        executor._resolve_connection_id.assert_called_once_with("gmail:primary")
        executor._fetch_oauth_token.assert_awaited_once_with("connection-1")
        self.assertEqual(
            clients[0].request_kwargs["headers"]["Authorization"],
            "Bearer oauth-token",
        )
        self.assertNotIn("json", clients[0].request_kwargs)

    async def test_supports_legacy_oauth_sentinel_from_trusted_upstream_node(self) -> None:
        executor = _executor()
        executor.node_map = {"n2": _oauth_node()}
        executor._provider_for_connection = Mock(return_value="gmail")
        executor._fetch_oauth_token = AsyncMock(return_value="oauth-token")
        node = _http_node(
            auth_value="__USER_ASSIGNED__",
            url="https://gmail.googleapis.com/gmail/v1/users/me/messages/{{loop_id.email.id}}/trash",
        )
        node.config.body = None
        clients: list[_Client] = []

        def client_factory(*args, **kwargs):
            client = _Client(*args, **kwargs)
            clients.append(client)
            return client

        with (
            patch("engine.executor._validate_outbound_url"),
            patch("engine.executor.get_oauth_token_circuit", return_value=_Circuit()),
            patch("engine.executor.httpx.AsyncClient", client_factory),
        ):
            await executor._execute_http_connection(
                node,
                node.config,
                {
                    "n2": {"connection_id": "connection-1"},
                    "loop_id": {"email": {"id": "message-1"}},
                },
            )

        executor._fetch_oauth_token.assert_awaited_once_with("connection-1")
        self.assertEqual(
            clients[0].request_kwargs["url"],
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/message-1/trash",
        )
        self.assertNotIn("json", clients[0].request_kwargs)

    async def test_rejects_oauth_handoff_to_an_unrelated_host(self) -> None:
        executor = _executor()
        executor._resolve_connection_id = Mock(return_value="connection-1")
        executor._provider_for_connection = Mock(return_value="gmail")
        executor._fetch_oauth_token = AsyncMock(return_value="oauth-token")
        node = _http_node(
            connection="gmail:primary",
            auth_value="__OAUTH_CONNECTION__",
        )

        with patch("engine.executor._validate_outbound_url"):
            with self.assertRaisesRegex(
                ExecutionError,
                "OAuth token for 'gmail' cannot be sent to 'api.example.com'",
            ):
                await executor._execute_http_connection(
                    node,
                    node.config,
                    {"n4": {"email": {"id": "message-1"}}},
                )

        executor._fetch_oauth_token.assert_not_awaited()

    async def test_loop_body_exposes_legacy_loop_id_alias(self) -> None:
        executor = _executor()
        body_node = _http_node()
        edge = SchemaEdge(
            id="edge-1",
            from_node="n4",
            to="http-1",
            type="data_flow",
            data_mapping=None,
            condition=None,
            label=None,
        )
        executor.edges_from = {"n4": [edge]}
        executor.schema = SimpleNamespace(edges=[edge])
        executor.node_map = {"http-1": body_node}
        executor.db = object()
        executor.run_id = "run-1"
        executor.data_region = "eu-central-1"
        executor.retention_expiry = "2099-01-01T00:00:00+00:00"
        executor._node_telemetry_payload = Mock(return_value={})
        executor._execute_node = AsyncMock(return_value={"ok": True})

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
        ):
            await executor._execute_loop_body(
                "n4",
                {"__loop_items__": [{"id": "message-1"}], "item_var": "email"},
                {},
            )

        body_input = executor._execute_node.await_args.args[1]
        self.assertEqual(body_input["loop_id"]["email"]["id"], "message-1")


if __name__ == "__main__":
    unittest.main()
