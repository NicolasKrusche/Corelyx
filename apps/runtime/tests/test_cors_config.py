from __future__ import annotations

import unittest

from cors_config import (
    DEFAULT_DEV_CORS_ORIGINS,
    get_cors_allowed_origins,
    normalize_cors_origin,
)


class RuntimeCorsConfigTests(unittest.TestCase):
    def test_normalizes_absolute_origins(self) -> None:
        self.assertEqual(
            normalize_cors_origin("https://app.example.com/path?x=1"),
            "https://app.example.com",
        )

    def test_dev_uses_local_defaults(self) -> None:
        self.assertEqual(
            get_cors_allowed_origins({}),
            list(DEFAULT_DEV_CORS_ORIGINS),
        )

    def test_production_infers_app_origin(self) -> None:
        self.assertEqual(
            get_cors_allowed_origins(
                {
                    "RUNTIME_ENV": "production",
                    "NEXT_PUBLIC_APP_URL": "https://app.example.com/dashboard",
                }
            ),
            ["https://app.example.com"],
        )

    def test_production_rejects_wildcard_origin(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "must not include"):
            get_cors_allowed_origins(
                {
                    "RUNTIME_ENV": "production",
                    "RUNTIME_CORS_ALLOWED_ORIGINS": "*",
                }
            )

    def test_production_requires_configured_origin(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "Set RUNTIME_CORS_ALLOWED_ORIGINS"):
            get_cors_allowed_origins({"RUNTIME_ENV": "production"})


if __name__ == "__main__":
    unittest.main()
