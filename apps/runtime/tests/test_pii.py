from __future__ import annotations

import unittest

from engine.pii import PseudonymizationSession, sanitize_text_for_llm, sanitize_value_for_llm


class PiiSanitizerTests(unittest.TestCase):
    def test_pseudonymizes_common_identifiers(self) -> None:
        result = sanitize_text_for_llm(
            "Email ada@example.com or call +1 415-555-0199. Card 4242 4242 4242 4242. IP 192.168.0.1."
        )

        self.assertIn("[EMAIL_1]", result.value)
        self.assertIn("[PHONE_1]", result.value)
        self.assertIn("[CREDIT_CARD_1]", result.value)
        self.assertIn("[IP_ADDRESS_1]", result.value)
        self.assertNotIn("ada@example.com", result.value)
        self.assertNotIn("4242 4242 4242 4242", result.value)
        self.assertTrue(result.redacted)

    def test_redacts_secrets_destructively_and_pseudonymizes_ids(self) -> None:
        result = sanitize_text_for_llm("token=sk-12345678901234567890, ssn 123-45-6789, iban DE89370400440532013000")

        self.assertIn("token=[REDACTED_SECRET]", result.value)
        self.assertIn("[NATIONAL_ID_1]", result.value)
        self.assertIn("[IBAN_1]", result.value)
        self.assertNotIn("sk-12345678901234567890", result.value)
        self.assertNotIn("123-45-6789", result.value)
        self.assertNotIn("DE89370400440532013000", result.value)

    def test_preserves_non_luhn_long_numbers(self) -> None:
        result = sanitize_text_for_llm("Keep support ticket 1234567890123 in the prompt.")

        self.assertIn("1234567890123", result.value)
        self.assertFalse(result.redacted)

    def test_sanitizes_nested_values_and_keys_without_mutating_original(self) -> None:
        original = {
            "owner: jane@example.com": {
                "recipients": ["jane@example.com", "ops@example.com"],
                "meta": {"phone": "(415) 555-0199"},
            }
        }

        result = sanitize_value_for_llm(original)
        serialized = str(result.value)

        self.assertIn("[EMAIL_1]", serialized)
        self.assertIn("[PHONE_1]", serialized)
        self.assertNotIn("jane@example.com", serialized)
        self.assertEqual(original["owner: jane@example.com"]["recipients"][0], "jane@example.com")


class PseudonymizationSessionTests(unittest.TestCase):
    def test_same_value_gets_stable_placeholder_across_calls(self) -> None:
        session = PseudonymizationSession()
        first = session.sanitize_text("Mail ada@example.com today.")
        second = session.sanitize_text("Reply: ada@example.com agreed; cc bob@example.com.")

        self.assertIn("[EMAIL_1]", first.value)
        self.assertIn("[EMAIL_1]", second.value)
        self.assertIn("[EMAIL_2]", second.value)

    def test_rehydrates_text_and_nested_values(self) -> None:
        session = PseudonymizationSession()
        session.sanitize_text("From ada@example.com, phone +49 30 1234567890.")

        text = session.rehydrate_text("Dear [EMAIL_1], we will call [PHONE_1].")
        self.assertIn("ada@example.com", text)
        self.assertIn("+49 30 1234567890", text)

        value = session.rehydrate_value({"to": "[EMAIL_1]", "steps": ["notify [EMAIL_1]"]})
        self.assertEqual(value["to"], "ada@example.com")
        self.assertEqual(value["steps"], ["notify ada@example.com"])

    def test_unknown_placeholders_are_left_alone(self) -> None:
        session = PseudonymizationSession()
        session.sanitize_text("ada@example.com")
        self.assertEqual(session.rehydrate_text("send to [EMAIL_7]"), "send to [EMAIL_7]")

    def test_secrets_are_never_rehydratable(self) -> None:
        session = PseudonymizationSession()
        result = session.sanitize_text("api_key=sk-12345678901234567890abcd")

        self.assertIn("[REDACTED_SECRET]", result.value)
        # No placeholder maps back to the secret, and the destructive marker
        # round-trips unchanged.
        self.assertEqual(
            session.rehydrate_text("leak [REDACTED_SECRET] now"),
            "leak [REDACTED_SECRET] now",
        )

    def test_round_trip_through_session(self) -> None:
        session = PseudonymizationSession()
        original = {
            "customer": "ada@example.com",
            "card": "4242 4242 4242 4242",
            "note": "ticket 1234567890123 stays",
        }
        sanitized = session.sanitize_value(original)
        self.assertNotIn("ada@example.com", str(sanitized.value))
        self.assertEqual(session.rehydrate_value(sanitized.value), original)


if __name__ == "__main__":
    unittest.main()
