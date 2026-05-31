from __future__ import annotations

import unittest

from connectors.gmail import GmailConnector
from engine.executor import _recover_gmail_message_id


class GmailEventHandlingTests(unittest.IsolatedAsyncioTestCase):
    def test_recovers_message_id_from_nested_event_payload(self) -> None:
        params = _recover_gmail_message_id(
            "read_email",
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
        params = _recover_gmail_message_id(
            "read_email",
            {"message_id": "configured-message"},
            {"payload": {"message_id": "event-message"}},
        )

        self.assertEqual(params["message_id"], "configured-message")

    async def test_read_email_short_circuits_when_no_message_exists(self) -> None:
        result = await GmailConnector()._read_email(None, {}, {})

        self.assertEqual(
            result,
            {
                "__skipped__": True,
                "__skip_descendants__": True,
                "skip_reason": "No Gmail message was available to read.",
                "message_id": None,
            },
        )


if __name__ == "__main__":
    unittest.main()
