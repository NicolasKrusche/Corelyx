from __future__ import annotations

import os
import unittest

from db import apply_execution_log_policy, get_execution_log_verbosity, redact_secrets


class ExecutionLogPolicyTests(unittest.TestCase):
    def setUp(self) -> None:
        self._original_verbosity = os.environ.get("EXECUTION_LOG_VERBOSITY")

    def tearDown(self) -> None:
        if self._original_verbosity is None:
            os.environ.pop("EXECUTION_LOG_VERBOSITY", None)
        else:
            os.environ["EXECUTION_LOG_VERBOSITY"] = self._original_verbosity

    def test_default_verbosity_is_metadata_only(self) -> None:
        os.environ.pop("EXECUTION_LOG_VERBOSITY", None)

        self.assertEqual(get_execution_log_verbosity(), "METADATA_ONLY")

    def test_metadata_only_keeps_shape_but_not_values(self) -> None:
        payload = {
            "email": "ada@example.com",
            "items": [{"name": "Private customer", "total": 42}],
            "access_token": "secret-token-value",
        }

        result = apply_execution_log_policy(payload, verbosity="METADATA_ONLY")
        serialized = str(result)

        self.assertEqual(result["type"], "object")
        self.assertIn("email", result["keys"])
        self.assertIn("[redacted_key]", result["keys"])
        self.assertNotIn("ada@example.com", serialized)
        self.assertNotIn("Private customer", serialized)
        self.assertNotIn("secret-token-value", serialized)

    def test_full_mode_redacts_secret_bearing_keys(self) -> None:
        payload = {
            "auth_value": "Bearer secret",
            "nested": {"webhook_token": "trigger-token", "safe": "visible"},
        }

        result = apply_execution_log_policy(payload, verbosity="FULL")

        self.assertEqual(result["auth_value"], "[redacted]")
        self.assertEqual(result["nested"]["webhook_token"], "[redacted]")
        self.assertEqual(result["nested"]["safe"], "visible")

    def test_none_and_errors_only_modes_drop_non_error_payloads(self) -> None:
        payload = {"safe": "value"}

        self.assertIsNone(apply_execution_log_policy(payload, verbosity="NONE"))
        self.assertIsNone(apply_execution_log_policy(payload, status="completed", verbosity="ERRORS_ONLY"))
        self.assertIsNotNone(apply_execution_log_policy(payload, status="failed", verbosity="ERRORS_ONLY"))

    def test_redact_secrets_catches_nested_secret_key_variants(self) -> None:
        result = redact_secrets(
            {
                "headers": {"Authorization": "Bearer abc"},
                "GOOGLE_ACCESS_TOKEN": "token",
                "client-secret": "secret",
            }
        )

        self.assertEqual(result["headers"]["Authorization"], "[redacted]")
        self.assertEqual(result["GOOGLE_ACCESS_TOKEN"], "[redacted]")
        self.assertEqual(result["client-secret"], "[redacted]")

    def test_redact_secrets_catches_token_like_strings(self) -> None:
        result = redact_secrets(
            {
                "message": "upstream returned Bearer abcdefghijklmnopqrstuvwxyz0123456789",
                "nested": [
                    "github token ghp_abcdefghijklmnopqrstuvwxyz0123456789",
                    "jwt eyJabcdefghijklmnopqrstuvwxyz.abcdefghijklmnopqrstuvwxyz.abcdefghijklmnopqrstuvwxyz",
                ],
            }
        )

        serialized = str(result)
        self.assertNotIn("abcdefghijklmnopqrstuvwxyz0123456789", serialized)
        self.assertNotIn("eyJabcdefghijklmnopqrstuvwxyz", serialized)
        self.assertIn("[redacted]", serialized)


if __name__ == "__main__":
    unittest.main()
