from __future__ import annotations

import unittest

from cors_config import (
    DEFAULT_CORS_ORIGINS,
    get_cors_allowed_origins,
    normalize_cors_origin,
)


class RuntimeCorsConfigTests(unittest.TestCase):
    def test_normalizes_absolute_origins(self) -> None:
        self.assertEqual(
            normalize_cors_origin("https://app.example.com/path?x=1"),
            "https://app.example.com",
        )

    def test_uses_default_origins(self) -> None:
        self.assertEqual(
            get_cors_allowed_origins({}),
            list(DEFAULT_CORS_ORIGINS),
        )

    def test_adds_inferred_app_origin(self) -> None:
        self.assertEqual(
            get_cors_allowed_origins(
                {
                    "RUNTIME_ENV": "production",
                    "NEXT_PUBLIC_APP_URL": "https://app.example.com/dashboard",
                }
            ),
            [
                *DEFAULT_CORS_ORIGINS,
                "https://app.example.com",
            ],
        )

    def test_cors_origins_env_adds_explicit_origins(self) -> None:
        self.assertEqual(
            get_cors_allowed_origins(
                {
                    "CORS_ORIGINS": "https://preview.example.com, https://app.example.com/path",
                }
            ),
            [
                *DEFAULT_CORS_ORIGINS,
                "https://preview.example.com",
                "https://app.example.com",
            ],
        )

    def test_legacy_runtime_cors_env_still_works(self) -> None:
        self.assertEqual(
            get_cors_allowed_origins(
                {
                    "RUNTIME_CORS_ALLOWED_ORIGINS": "https://legacy.example.com",
                }
            ),
            [
                *DEFAULT_CORS_ORIGINS,
                "https://legacy.example.com",
            ],
        )

    def test_production_rejects_wildcard_origin(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "must not include"):
            get_cors_allowed_origins(
                {
                    "RUNTIME_ENV": "production",
                    "CORS_ORIGINS": "*",
                }
            )


if __name__ == "__main__":
    unittest.main()
