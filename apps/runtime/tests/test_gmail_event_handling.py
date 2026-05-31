from __future__ import annotations

import unittest

from connectors.base import ConnectorError
from connectors.gmail import GmailConnector
from engine.executor import _recover_event_operation_params


class GmailEventHandlingTests(unittest.IsolatedAsyncioTestCase):
    def test_recovers_message_id_from_nested_event_payload(self) -> None:
        params = _recover_event_operation_params(
            {"message_id": None},
            {
                "trigger-1": {
                    "source": "gmail",
                    "event": "message.received",
                    "payload": {"message_id": "gmail-message-1"},
                }
            },
        )

        self.assertEqual(params["message_id"], "gmail-message-1")

    def test_keeps_explicit_message_id(self) -> None:
        params = _recover_event_operation_params(
            {"message_id": "configured-message"},
            {"payload": {"message_id": "event-message"}},
        )

        self.assertEqual(params["message_id"], "configured-message")

    def test_recovers_first_message_id_from_deep_legacy_event_payload(self) -> None:
        params = _recover_event_operation_params(
            {"message_id": None},
            {
                "trigger-1": {
                    "webhook_payload": {
                        "payload": {
                            "message_ids": ["gmail-message-2", "gmail-message-3"],
                        }
                    }
                }
            },
        )

        self.assertEqual(params["message_id"], "gmail-message-2")

    async def test_read_email_fails_clearly_when_no_message_exists(self) -> None:
        with self.assertRaisesRegex(ConnectorError, "requires 'message_id'"):
            await GmailConnector()._read_email(None, {}, {})


if __name__ == "__main__":
    unittest.main()
