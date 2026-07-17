from __future__ import annotations

import unittest
from unittest.mock import patch

from cors_config import (
    CORS_ALLOWED_HEADERS,
    CORS_ALLOWED_METHODS,
    DEFAULT_CORS_ORIGINS,
    DEV_CORS_ORIGINS,
    PRODUCTION_ENV_NAMES,
    _env_value,
    _split_csv,
    _unique,
    build_cors_middleware,
    get_cors_allowed_origins,
    is_production_environment,
    normalize_cors_origin,
)


class TestIsProductionEnvironment(unittest.TestCase):
    def test_true_for_each_env_name(self) -> None:
        for name in PRODUCTION_ENV_NAMES:
            with self.subTest(env=name):
                self.assertTrue(is_production_environment({name: "production"}))

    def test_false_for_non_production_values(self) -> None:
        for name in PRODUCTION_ENV_NAMES:
            with self.subTest(env=name):
                self.assertFalse(is_production_environment({name: "development"}))
                self.assertFalse(is_production_environment({name: "staging"}))
                self.assertFalse(is_production_environment({name: ""}))

    def test_false_when_none(self) -> None:
        self.assertFalse(is_production_environment({"NODE_ENV": None}))

    def test_uses_os_environ_by_default(self) -> None:
        with patch.dict("os.environ", {"NODE_ENV": "production"}, clear=False):
            self.assertTrue(is_production_environment())
        with patch.dict("os.environ", {"NODE_ENV": "development"}, clear=False):
            self.assertFalse(is_production_environment())

    def test_any_one_production_is_enough(self) -> None:
        env = {
            "NODE_ENV": "development",
            "VERCEL_ENV": "development",
            "APP_ENV": "production",
            "RUNTIME_ENV": "development",
        }
        self.assertTrue(is_production_environment(env))


class TestEnvValue(unittest.TestCase):
    def test_strips_whitespace(self) -> None:
        self.assertEqual(_env_value({"X": "  value  "}, "X"), "value")

    def test_returns_empty_for_none(self) -> None:
        self.assertEqual(_env_value({"X": None}, "X"), "")

    def test_returns_empty_for_missing(self) -> None:
        self.assertEqual(_env_value({}, "X"), "")

    def test_returns_empty_for_non_string(self) -> None:
        self.assertEqual(_env_value({"X": 123}, "X"), "")


class TestSplitCsv(unittest.TestCase):
    def test_splits_comma_separated(self) -> None:
        self.assertEqual(_split_csv("a, b, c"), ["a", "b", "c"])

    def test_skips_empty_parts(self) -> None:
        self.assertEqual(_split_csv("a,,b, ,c"), ["a", "b", "c"])

    def test_empty_string_returns_empty(self) -> None:
        self.assertEqual(_split_csv(""), [])

    def test_single_value(self) -> None:
        self.assertEqual(_split_csv("https://example.com"), ["https://example.com"])


class TestUnique(unittest.TestCase):
    def test_removes_duplicates(self) -> None:
        self.assertEqual(_unique(["a", "b", "a", "c", "b"]), ["a", "b", "c"])

    def test_empty_list(self) -> None:
        self.assertEqual(_unique([]), [])

    def test_preserves_order(self) -> None:
        self.assertEqual(_unique(["z", "a", "z", "b"]), ["z", "a", "b"])


class TestNormalizeCorsOrigin(unittest.TestCase):
    def test_strips_path_and_query(self) -> None:
        self.assertEqual(
            normalize_cors_origin("https://app.example.com/path?x=1#frag"),
            "https://app.example.com",
        )

    def test_strips_port_when_standard(self) -> None:
        self.assertEqual(
            normalize_cors_origin("https://app.example.com:443/path"),
            "https://app.example.com:443",
        )

    def test_keeps_nonstandard_port(self) -> None:
        self.assertEqual(
            normalize_cors_origin("https://app.example.com:8080/path"),
            "https://app.example.com:8080",
        )

    def test_invalid_scheme_raises(self) -> None:
        with self.assertRaisesRegex(ValueError, "origin must be an absolute http\\(s\\) URL"):
            normalize_cors_origin("ftp://example.com")

    def test_invalid_no_scheme_raises(self) -> None:
        with self.assertRaisesRegex(ValueError, "origin must be an absolute http\\(s\\) URL"):
            normalize_cors_origin("example.com")

    def test_invalid_no_netloc_raises(self) -> None:
        with self.assertRaisesRegex(ValueError, "origin must be an absolute http\\(s\\) URL"):
            normalize_cors_origin("https://")

    def test_strips_whitespace(self) -> None:
        self.assertEqual(
            normalize_cors_origin("  https://app.example.com  "),
            "https://app.example.com",
        )


class TestGetCorsAllowedOrigins(unittest.TestCase):
    def test_dev_includes_defaults_and_localhost(self) -> None:
        result = get_cors_allowed_origins({})
        self.assertEqual(result, [*DEFAULT_CORS_ORIGINS, *DEV_CORS_ORIGINS])

    def test_production_excludes_dev_origins(self) -> None:
        result = get_cors_allowed_origins({"RUNTIME_ENV": "production", "NEXT_PUBLIC_APP_URL": "https://corelyx.app"})
        for dev in DEV_CORS_ORIGINS:
            self.assertNotIn(dev, result)

    def test_production_uses_next_public_app_url(self) -> None:
        result = get_cors_allowed_origins(
            {
                "RUNTIME_ENV": "production",
                "NEXT_PUBLIC_APP_URL": "https://app.example.com/dashboard",
            }
        )
        self.assertIn("https://app.example.com", result)
        self.assertIn("https://corelyx.app", result)

    def test_production_uses_nextjs_internal_url(self) -> None:
        result = get_cors_allowed_origins(
            {
                "RUNTIME_ENV": "production",
                "NEXTJS_INTERNAL_URL": "https://internal.example.com/api",
            }
        )
        self.assertIn("https://internal.example.com", result)

    def test_cors_origins_env_adds_explicit_origins(self) -> None:
        result = get_cors_allowed_origins(
            {
                "CORS_ORIGINS": "https://preview.example.com, https://app.example.com/path",
            }
        )
        self.assertIn("https://preview.example.com", result)
        self.assertIn("https://app.example.com", result)
        self.assertIn("https://corelyx.app", result)
        self.assertIn("http://localhost:3000", result)

    def test_legacy_runtime_cors_env_still_works(self) -> None:
        result = get_cors_allowed_origins(
            {
                "RUNTIME_CORS_ALLOWED_ORIGINS": "https://legacy.example.com",
            }
        )
        self.assertIn("https://legacy.example.com", result)
        self.assertIn("https://corelyx.app", result)
        self.assertIn("http://localhost:3000", result)

    def test_cors_origins_env_takes_precedence_over_legacy(self) -> None:
        result = get_cors_allowed_origins(
            {
                "CORS_ORIGINS": "https://new.example.com",
                "RUNTIME_CORS_ALLOWED_ORIGINS": "https://old.example.com",
            }
        )
        self.assertIn("https://new.example.com", result)
        self.assertNotIn("https://old.example.com", result)

    def test_dev_allows_wildcard(self) -> None:
        result = get_cors_allowed_origins(
            {
                "CORS_ORIGINS": "*",
            }
        )
        self.assertIn("*", result)

    def test_production_rejects_wildcard(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "must not include '\\*' in production"):
            get_cors_allowed_origins(
                {
                    "RUNTIME_ENV": "production",
                    "CORS_ORIGINS": "*",
                }
            )

    def test_production_rejects_invalid_origin(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "contains invalid origin"):
            get_cors_allowed_origins(
                {
                    "RUNTIME_ENV": "production",
                    "CORS_ORIGINS": "not-a-url",
                }
            )

    def test_production_rejects_invalid_next_public_app_url(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "must be an absolute http\\(s\\) URL"):
            get_cors_allowed_origins(
                {
                    "RUNTIME_ENV": "production",
                    "NEXT_PUBLIC_APP_URL": "not-a-url",
                }
            )

    def test_dev_ignores_invalid_next_public_app_url(self) -> None:
        result = get_cors_allowed_origins(
            {
                "NEXT_PUBLIC_APP_URL": "not-a-url",
            }
        )
        self.assertEqual(result, [*DEFAULT_CORS_ORIGINS, *DEV_CORS_ORIGINS])

    def test_production_keeps_default_origins(self) -> None:
        result = get_cors_allowed_origins(
            {
                "RUNTIME_ENV": "production",
            }
        )
        # DEFAULT_CORS_ORIGINS are always present even with no other env vars
        self.assertIn("https://corelyx.app", result)
        self.assertIn("https://www.corelyx.app", result)
        for dev in DEV_CORS_ORIGINS:
            self.assertNotIn(dev, result)

    def test_deduplicates_origins(self) -> None:
        result = get_cors_allowed_origins(
            {
                "CORS_ORIGINS": "https://corelyx.app, https://corelyx.app",
            }
        )
        self.assertEqual(result.count("https://corelyx.app"), 1)

    def test_production_with_default_origins_and_app_url(self) -> None:
        result = get_cors_allowed_origins(
            {
                "RUNTIME_ENV": "production",
                "NEXT_PUBLIC_APP_URL": "https://app.example.com",
            }
        )
        expected = [*DEFAULT_CORS_ORIGINS, "https://app.example.com"]
        self.assertEqual(result, expected)


class TestBuildCorsMiddleware(unittest.TestCase):
    def test_dev_build(self) -> None:
        result = build_cors_middleware({})
        self.assertEqual(result["allow_origins"], [*DEFAULT_CORS_ORIGINS, *DEV_CORS_ORIGINS])
        self.assertEqual(result["allow_methods"], CORS_ALLOWED_METHODS)
        self.assertEqual(result["allow_headers"], CORS_ALLOWED_HEADERS)
        self.assertTrue(result["allow_credentials"])

    def test_production_build(self) -> None:
        result = build_cors_middleware(
            {
                "RUNTIME_ENV": "production",
                "NEXT_PUBLIC_APP_URL": "https://app.example.com",
            }
        )
        self.assertEqual(result["allow_origins"], [*DEFAULT_CORS_ORIGINS, "https://app.example.com"])
        self.assertEqual(result["allow_methods"], CORS_ALLOWED_METHODS)
        self.assertEqual(result["allow_headers"], CORS_ALLOWED_HEADERS)
        self.assertTrue(result["allow_credentials"])

    def test_custom_origins(self) -> None:
        result = build_cors_middleware(
            {
                "CORS_ORIGINS": "https://custom.example.com",
            }
        )
        self.assertIn("https://custom.example.com", result["allow_origins"])
        self.assertTrue(result["allow_credentials"])

    def test_raises_on_production_wildcard(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "must not include"):
            build_cors_middleware(
                {
                    "RUNTIME_ENV": "production",
                    "CORS_ORIGINS": "*",
                }
            )


if __name__ == "__main__":
    unittest.main()
