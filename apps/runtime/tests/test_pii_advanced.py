from __future__ import annotations

import unittest

from engine.pii import (
    PiiSanitizationResult,
    merge_redactions,
    sanitize_text_for_llm,
    sanitize_value_for_llm,
)


class SanitizeTextCreditCardTests(unittest.TestCase):
    def test_pseudonymizes_valid_visa(self) -> None:
        # 4242 4242 4242 4242 passes Luhn.
        result = sanitize_text_for_llm("Card: 4242 4242 4242 4242")
        self.assertIn("[CREDIT_CARD_1]", result.value)
        self.assertNotIn("4242 4242 4242 4242", result.value)
        self.assertTrue(result.redacted)

    def test_preserve_invalid_long_number(self) -> None:
        # 1234567890123 does not pass Luhn.
        result = sanitize_text_for_llm("Ticket 1234567890123")
        self.assertIn("1234567890123", result.value)
        self.assertFalse(result.redacted)


class SanitizeTextSecretTests(unittest.TestCase):
    def test_redacts_api_key_assignment(self) -> None:
        result = sanitize_text_for_llm("api_key=abc1234567890123456789")
        self.assertIn("api_key=[REDACTED_SECRET]", result.value)
        self.assertNotIn("abc1234567890123456789", result.value)

    def test_redacts_secret_with_quotes(self) -> None:
        result = sanitize_text_for_llm('secret="shh12345678901234567890"')
        self.assertIn('secret="[REDACTED_SECRET]"', result.value)
        self.assertNotIn("shh12345678901234567890", result.value)

    def test_redacts_bearer_token(self) -> None:
        result = sanitize_text_for_llm("Authorization: Bearer tok1234567890123")
        self.assertIn("Authorization: Bearer [REDACTED_SECRET]", result.value)
        self.assertNotIn("tok1234567890123", result.value)

    def test_redacts_prefixed_sk_key(self) -> None:
        result = sanitize_text_for_llm("sk-abcdefghijklmnopqrstuvwxyz12")
        self.assertIn("[REDACTED_SECRET]", result.value)
        self.assertNotIn("sk-abcdefghijklmnopqrstuvwxyz12", result.value)

    def test_redacts_github_pat(self) -> None:
        result = sanitize_text_for_llm("ghp_xxxxxxxxxxxxxxxxxxxx12")
        self.assertIn("[REDACTED_SECRET]", result.value)
        self.assertNotIn("ghp_xxxxxxxxxxxxxxxxxxxx12", result.value)


class SanitizeTextOtherPatternsTests(unittest.TestCase):
    def test_pseudonymizes_email(self) -> None:
        result = sanitize_text_for_llm("Contact ada@example.com")
        self.assertIn("[EMAIL_1]", result.value)
        self.assertNotIn("ada@example.com", result.value)

    def test_pseudonymizes_iban(self) -> None:
        result = sanitize_text_for_llm("IBAN DE89370400440532013000")
        self.assertIn("[IBAN_1]", result.value)
        self.assertNotIn("DE89370400440532013000", result.value)

    def test_pseudonymizes_ssn(self) -> None:
        result = sanitize_text_for_llm("SSN 123-45-6789")
        self.assertIn("[NATIONAL_ID_1]", result.value)
        self.assertNotIn("123-45-6789", result.value)

    def test_pseudonymizes_ipv4(self) -> None:
        result = sanitize_text_for_llm("IP 192.168.0.1")
        self.assertIn("[IP_ADDRESS_1]", result.value)
        self.assertNotIn("192.168.0.1", result.value)

    def test_pseudonymizes_us_phone(self) -> None:
        result = sanitize_text_for_llm("Call (415) 555-0199")
        self.assertIn("[PHONE_1]", result.value)
        self.assertNotIn("(415) 555-0199", result.value)

    def test_pseudonymizes_international_phone(self) -> None:
        result = sanitize_text_for_llm("Dial +44 20 7946 0958")
        self.assertIn("[PHONE_1]", result.value)
        self.assertNotIn("+44 20 7946 0958", result.value)

    def test_no_redaction_when_clean(self) -> None:
        result = sanitize_text_for_llm("Hello world, nothing sensitive here.")
        self.assertEqual(result.value, "Hello world, nothing sensitive here.")
        self.assertFalse(result.redacted)


class SanitizeValueTests(unittest.TestCase):
    def test_string_delegates_to_text(self) -> None:
        result = sanitize_value_for_llm("email: test@example.com")
        self.assertIn("[EMAIL_1]", result.value)

    def test_int_unchanged(self) -> None:
        result = sanitize_value_for_llm(42)
        self.assertEqual(result.value, 42)
        self.assertFalse(result.redacted)

    def test_float_unchanged(self) -> None:
        result = sanitize_value_for_llm(3.14)
        self.assertEqual(result.value, 3.14)

    def test_bool_unchanged(self) -> None:
        result = sanitize_value_for_llm(True)
        self.assertIs(result.value, True)

    def test_none_unchanged(self) -> None:
        result = sanitize_value_for_llm(None)
        self.assertIsNone(result.value)

    def test_list_sanitizes_items(self) -> None:
        result = sanitize_value_for_llm(["a@b.com", "safe"])
        self.assertIn("[EMAIL_1]", result.value[0])
        self.assertEqual(result.value[1], "safe")

    def test_tuple_returns_tuple(self) -> None:
        result = sanitize_value_for_llm(("a@b.com", "safe"))
        self.assertIsInstance(result.value, tuple)
        self.assertIn("[EMAIL_1]", result.value[0])

    def test_dict_sanitizes_keys_and_values(self) -> None:
        result = sanitize_value_for_llm({"owner: a@b.com": {"phone": "123-45-6789"}})
        safe = str(result.value)
        self.assertIn("[EMAIL_1]", safe)
        self.assertIn("[NATIONAL_ID_1]", safe)

    def test_circular_reference(self) -> None:
        a = []
        a.append(a)
        result = sanitize_value_for_llm(a)
        self.assertEqual(result.value[0], "[REDACTED_CIRCULAR_REFERENCE]")

    def test_unsupported_type_returns_unchanged(self) -> None:
        class Custom:
            pass

        obj = Custom()
        result = sanitize_value_for_llm(obj)
        self.assertIs(result.value, obj)

    def test_nested_structure(self) -> None:
        data = {
            "users": [
                {"email": "u1@example.com", "card": "4242 4242 4242 4242"},
                {"email": "u2@example.com"},
            ]
        }
        result = sanitize_value_for_llm(data)
        serialized = str(result.value)
        self.assertIn("[EMAIL_1]", serialized)
        self.assertIn("[CREDIT_CARD_1]", serialized)
        self.assertNotIn("u1@example.com", serialized)


class MergeRedactionsTests(unittest.TestCase):
    def test_merge_multiple(self) -> None:
        merged = merge_redactions({"email": 1}, {"email": 2, "phone": 3}, None)
        self.assertEqual(merged, {"email": 3, "phone": 3})

    def test_merge_empty(self) -> None:
        merged = merge_redactions({}, None)
        self.assertEqual(merged, {})


class PiiSanitizationResultTests(unittest.TestCase):
    def test_redacted_property_true(self) -> None:
        result = PiiSanitizationResult(value="foo", redactions={"email": 1})
        self.assertTrue(result.redacted)

    def test_redacted_property_false(self) -> None:
        result = PiiSanitizationResult(value="foo", redactions={})
        self.assertFalse(result.redacted)


if __name__ == "__main__":
    unittest.main()
