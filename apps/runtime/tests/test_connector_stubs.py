"""Parameterized stub tests for all remaining connectors in REGISTRY."""

from __future__ import annotations


import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from connectors import REGISTRY
from connectors.base import ConnectorError


_TARGETED = {
    "gmail",
    "notion",
    "github",
    "drive",
    "calendar",
    "docs",
    "sheets",
    "slack",
    "hubspot",
    "jira",
    "outlook",
    "asana",
    "airtable",
    "reddit",
    "salesforce",
    "bitbucket",
    "gitlab",
    "telegram",
    "teams",
    "googlechat",
    "whatsapp",
    "stripe",
    "openai",
    # IMAP/SMTP — not an HTTP connector, so the request_with_rate_limit stub
    # harness doesn't apply. Covered by tests/test_thunderbird_connector.py.
    "thunderbird",
}


def _fake_response(json_data=None, status_code=200, text=""):
    resp = MagicMock()
    resp.status_code = status_code
    resp.text = text
    resp.raise_for_status = MagicMock()
    resp.json.return_value = json_data if json_data is not None else {}
    return resp


for _provider, _cls in sorted(REGISTRY.items()):
    if _provider in _TARGETED:
        continue

    _module_path = _cls.__module__
    _connector = _cls()
    _ops = _connector.supported_operations

    def _make_test_class(cls, provider, module_path, operations):
        class _TestConnectorStub(unittest.IsolatedAsyncioTestCase):
            pass

        for op in operations:

            def _make_success(op_name, mod_path):
                async def _test_success(self):
                    mock = _fake_response({})
                    with patch(f"{mod_path}.request_with_rate_limit", new=AsyncMock(return_value=mock)):
                        try:
                            result = await cls().execute(op_name, {}, "token")
                        except ConnectorError as exc:
                            self.assertIsInstance(exc.code, str)
                            return
                    self.assertIsInstance(result, dict)

                return _test_success

            def _make_error(op_name, mod_path):
                async def _test_http_error(self):
                    mock = _fake_response(status_code=500, text="Server Error")
                    with patch(f"{mod_path}.request_with_rate_limit", new=AsyncMock(return_value=mock)):
                        with self.assertRaises(ConnectorError):
                            await cls().execute(op_name, {}, "token")

                return _test_http_error

            _test_name_success = f"test_{op}_success"
            _test_name_error = f"test_{op}_http_error"
            setattr(_TestConnectorStub, _test_name_success, _make_success(op, module_path))
            setattr(_TestConnectorStub, _test_name_error, _make_error(op, module_path))

        _TestConnectorStub.__name__ = f"Test{cls.__name__}Stub"
        return _TestConnectorStub

    _test_cls = _make_test_class(_cls, _provider, _module_path, _ops)
    globals()[_test_cls.__name__] = _test_cls


if __name__ == "__main__":
    unittest.main()
