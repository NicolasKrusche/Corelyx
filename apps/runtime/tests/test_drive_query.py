from __future__ import annotations

import asyncio
import unittest
from unittest.mock import patch

from connectors.drive import DriveConnector, _escape_query_value


class _FakeResponse:
    status_code = 200

    def json(self) -> dict:
        return {"files": []}


class TestDriveQueryEscaping(unittest.TestCase):
    def test_escape_query_value(self) -> None:
        # Single quotes are escaped with a backslash; backslashes are doubled.
        self.assertEqual(_escape_query_value("O'Brien"), "O\\'Brien")
        self.assertEqual(_escape_query_value("a\\b"), "a\\\\b")
        self.assertEqual(_escape_query_value("plain"), "plain")

    def test_list_files_escapes_apostrophe_in_query(self) -> None:
        captured: dict = {}

        async def fake_request(client, method, url, headers=None, params=None):
            captured["params"] = params
            return _FakeResponse()

        with patch("connectors.drive.request_with_rate_limit", new=fake_request):
            conn = DriveConnector()
            asyncio.run(conn._list_files(None, {}, {"query": "O'Brien"}))

        q = captured["params"]["q"]
        # Escaped form is present, and the raw unescaped apostrophe that would
        # break the Drive query syntax (and cause a 400) is not.
        self.assertIn("name contains 'O\\'Brien'", q)
        self.assertNotIn("'O'Brien'", q)


if __name__ == "__main__":
    unittest.main()
