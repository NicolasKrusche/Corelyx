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
from unittest.mock import AsyncMock, MagicMock, patch

from connectors.apollo import ApolloConnector
from connectors.zoominfo import ZoomInfoConnector


def response(payload: dict) -> MagicMock:
    value = MagicMock()
    value.status_code = 200
    value.json.return_value = payload
    value.text = ""
    return value


class TestApolloContracts(unittest.IsolatedAsyncioTestCase):
    async def test_uses_apollo_api_key_header(self):
        with patch(
            "connectors.apollo.request_with_rate_limit",
            new=AsyncMock(return_value=response({"people": []})),
        ) as request:
            await ApolloConnector().execute("search_contacts", {"query": "engineer"}, "apollo-key")

        headers = request.await_args.kwargs["headers"]
        self.assertEqual(headers["x-api-key"], "apollo-key")
        self.assertNotIn("Authorization", headers)

    async def _execute(self, operation: str, params: dict) -> AsyncMock:
        call = AsyncMock(return_value=response({"ok": True}))
        with patch("connectors.apollo.request_with_rate_limit", new=call):
            await ApolloConnector().execute(operation, params, "token")
        return call

    async def test_people_search_uses_current_post_contract(self) -> None:
        call = await self._execute("search_contacts", {"query": "security leader"})
        _, method, url = call.await_args.args[:3]
        self.assertEqual(method, "POST")
        self.assertEqual(url, "https://api.apollo.io/api/v1/mixed_people/api_search")
        self.assertEqual(call.await_args.kwargs["json"]["q_keywords"], "security leader")

    async def test_enrichment_uses_current_post_contract(self) -> None:
        call = await self._execute("enrich_lead", {"email": "person@example.com"})
        self.assertEqual(call.await_args.args[1], "POST")
        self.assertEqual(call.await_args.args[2], "https://api.apollo.io/api/v1/people/match")
        self.assertEqual(call.await_args.kwargs["json"], {"email": "person@example.com"})

    async def test_create_sequence_uses_current_endpoint(self) -> None:
        call = await self._execute("create_sequence", {"name": "Outbound"})
        self.assertEqual(call.await_args.args[2], "https://api.apollo.io/api/v1/sequences")

    async def test_sequence_search_uses_current_endpoint(self) -> None:
        call = await self._execute("list_sequences", {})
        self.assertEqual(call.await_args.args[1], "POST")
        self.assertEqual(
            call.await_args.args[2],
            "https://api.apollo.io/api/v1/emailer_campaigns/search",
        )


class TestZoomInfoContracts(unittest.IsolatedAsyncioTestCase):
    async def _execute(self, operation: str, params: dict) -> AsyncMock:
        call = AsyncMock(return_value=response({"ok": True}))
        with patch("connectors.zoominfo.request_with_rate_limit", new=call):
            await ZoomInfoConnector().execute(operation, params, "token")
        return call

    async def test_contact_search_is_a_post_with_zoominfo_fields(self) -> None:
        call = await self._execute("search_contacts", {"query": "Ada Lovelace"})
        self.assertEqual(call.await_args.args[1], "POST")
        self.assertEqual(call.await_args.args[2], "https://api.zoominfo.com/search/contact")
        self.assertEqual(call.await_args.kwargs["json"]["personName"], "Ada Lovelace")

    async def test_company_intelligence_uses_company_search(self) -> None:
        call = await self._execute("get_company_intelligence", {"company_name": "Corelyx"})
        self.assertEqual(call.await_args.args[1], "POST")
        self.assertEqual(call.await_args.args[2], "https://api.zoominfo.com/search/company")
        self.assertEqual(call.await_args.kwargs["json"]["companyName"], "Corelyx")


if __name__ == "__main__":
    unittest.main()
