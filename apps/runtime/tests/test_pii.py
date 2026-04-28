from __future__ import annotations

import unittest

from engine.pii import sanitize_text_for_llm, sanitize_value_for_llm


class PiiSanitizerTests(unittest.TestCase):
    def test_redacts_common_identifiers(self) -> None:
        result = sanitize_text_for_llm(
            "Email ada@example.com or call +1 415-555-0199. Card 4242 4242 4242 4242. IP 192.168.0.1."
        )

        self.assertIn("[REDACTED_EMAIL]", result.value)
        self.assertIn("[REDACTED_PHONE]", result.value)
        self.assertIn("[REDACTED_CREDIT_CARD]", result.value)
        self.assertIn("[REDACTED_IP_ADDRESS]", result.value)
        self.assertNotIn("ada@example.com", result.value)
        self.assertNotIn("4242 4242 4242 4242", result.value)
        self.assertTrue(result.redacted)

    def test_redacts_secrets_national_ids_and_ibans(self) -> None:
        result = sanitize_text_for_llm(
            "token=sk-12345678901234567890, ssn 123-45-6789, iban DE89370400440532013000"
        )

        self.assertIn("token=[REDACTED_SECRET]", result.value)
        self.assertIn("[REDACTED_NATIONAL_ID]", result.value)
        self.assertIn("[REDACTED_IBAN]", result.value)
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

        self.assertIn("[REDACTED_EMAIL]", serialized)
        self.assertIn("[REDACTED_PHONE]", serialized)
        self.assertNotIn("jane@example.com", serialized)
        self.assertEqual(original["owner: jane@example.com"]["recipients"][0], "jane@example.com")


if __name__ == "__main__":
    unittest.main()
