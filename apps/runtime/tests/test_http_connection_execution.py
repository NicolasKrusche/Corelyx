from __future__ import annotations
import sys as _sys
import types as _types
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
    _sys.modules["connectors"] = _conn
    _sys.modules["connectors.base"] = _base


import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from engine.executor import ExecutionError, ProgramExecutor, _ssrf_safe_request
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
    executor.run_id = "run-1"
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

        validate_url.assert_called_once_with("https://api.example.com/messages/message-1/trash")
        self.assertEqual(result["url"], "https://api.example.com/messages/message-1/trash")
        self.assertEqual(clients[0].request_kwargs["params"], {"message": "message-1"})
        sent_headers = clients[0].request_kwargs["headers"]
        self.assertEqual(sent_headers["X-Message"], "message-1")
        self.assertIn("Idempotency-Key", sent_headers)
        self.assertEqual(clients[0].request_kwargs["json"], {"message_id": "message-1"})

    async def test_idempotency_key_stable_across_retries_of_same_node(self) -> None:
        # A retried POST that already succeeded on the far end (response
        # timeout, not request failure) must not be resubmitted as a fresh,
        # distinguishable request — the key has to be identical every attempt.
        executor = _executor()
        node = _http_node()
        clients: list[_Client] = []

        def client_factory(*args, **kwargs):
            client = _Client(*args, **kwargs)
            clients.append(client)
            return client

        with (
            patch("engine.executor._validate_outbound_url"),
            patch("engine.executor.httpx.AsyncClient", client_factory),
        ):
            await executor._execute_http_connection(node, node.config, {"n4": {"email": {"id": "message-1"}}})
            await executor._execute_http_connection(node, node.config, {"n4": {"email": {"id": "message-1"}}})

        key_1 = clients[0].request_kwargs["headers"]["Idempotency-Key"]
        key_2 = clients[1].request_kwargs["headers"]["Idempotency-Key"]
        self.assertEqual(key_1, key_2)

    async def test_idempotency_key_differs_per_node(self) -> None:
        executor = _executor()
        node_a = _http_node()
        node_b = _http_node()
        node_b.id = "http-2"
        clients: list[_Client] = []

        def client_factory(*args, **kwargs):
            client = _Client(*args, **kwargs)
            clients.append(client)
            return client

        with (
            patch("engine.executor._validate_outbound_url"),
            patch("engine.executor.httpx.AsyncClient", client_factory),
        ):
            await executor._execute_http_connection(node_a, node_a.config, {"n4": {"email": {"id": "message-1"}}})
            await executor._execute_http_connection(node_b, node_b.config, {"n4": {"email": {"id": "message-1"}}})

        self.assertNotEqual(
            clients[0].request_kwargs["headers"]["Idempotency-Key"],
            clients[1].request_kwargs["headers"]["Idempotency-Key"],
        )

    async def test_idempotency_key_not_added_for_get(self) -> None:
        executor = _executor()
        node = _http_node()
        node.config.method = "GET"
        node.config.body = None
        clients: list[_Client] = []

        def client_factory(*args, **kwargs):
            client = _Client(*args, **kwargs)
            clients.append(client)
            return client

        with (
            patch("engine.executor._validate_outbound_url"),
            patch("engine.executor.httpx.AsyncClient", client_factory),
        ):
            await executor._execute_http_connection(node, node.config, {"n4": {"email": {"id": "message-1"}}})

        self.assertNotIn("Idempotency-Key", clients[0].request_kwargs["headers"])

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


class SsrfSafeRequestTests(unittest.IsolatedAsyncioTestCase):
    """S12: requests must connect to the exact IP that was validated, closing the
    DNS-rebinding window between validation and connect."""

    async def test_pins_https_to_validated_ip_with_host_and_sni(self) -> None:
        client = _Client()
        with patch("engine.executor._validate_outbound_url", return_value="93.184.216.34"):
            await _ssrf_safe_request(client, "GET", "https://example.com/path?q=1")
        kw = client.request_kwargs
        assert kw is not None
        self.assertEqual(kw["url"], "https://93.184.216.34/path?q=1")
        self.assertEqual(kw["headers"]["Host"], "example.com")
        self.assertEqual(kw["extensions"]["sni_hostname"], "example.com")

    async def test_preserves_explicit_port(self) -> None:
        client = _Client()
        with patch("engine.executor._validate_outbound_url", return_value="93.184.216.34"):
            await _ssrf_safe_request(client, "GET", "https://example.com:8443/x")
        kw = client.request_kwargs
        assert kw is not None
        self.assertEqual(kw["url"], "https://93.184.216.34:8443/x")
        self.assertEqual(kw["headers"]["Host"], "example.com:8443")

    async def test_http_scheme_pins_without_sni(self) -> None:
        client = _Client()
        with patch("engine.executor._validate_outbound_url", return_value="93.184.216.34"):
            await _ssrf_safe_request(client, "GET", "http://example.com/x")
        kw = client.request_kwargs
        assert kw is not None
        self.assertEqual(kw["url"], "http://93.184.216.34/x")
        self.assertNotIn("sni_hostname", kw.get("extensions", {}))

    async def test_no_pin_when_validation_returns_non_ip(self) -> None:
        # When the guard is stubbed (returns a non-IP), fall back to the plain
        # request so unit tests that mock validation keep working unchanged.
        client = _Client()
        with patch("engine.executor._validate_outbound_url", return_value=None):
            await _ssrf_safe_request(client, "GET", "https://example.com/x", headers={"A": "b"})
        kw = client.request_kwargs
        assert kw is not None
        self.assertEqual(kw["url"], "https://example.com/x")
        self.assertNotIn("Host", kw["headers"])


if __name__ == "__main__":
    unittest.main()
