"""Comprehensive tests for apps/runtime/internal_auth.py."""
from __future__ import annotations

import base64
import json
import os
import time
import unittest
from unittest.mock import MagicMock, patch

import internal_auth as ia


class ScopedSecretEnvNameTests(unittest.TestCase):
    def test_simple_name(self) -> None:
        self.assertEqual(ia._scoped_secret_env_name("execute"), "INTERNAL_SERVICE_AUTH_SECRET_EXECUTE")

    def test_normalization(self) -> None:
        self.assertEqual(
            ia._scoped_secret_env_name("my-service_v2.prod"),
            "INTERNAL_SERVICE_AUTH_SECRET_MY_SERVICE_V2_PROD",
        )


class AllowsSharedSecretFallbackTests(unittest.TestCase):
    @patch.dict(os.environ, {"NODE_ENV": "production"}, clear=False)
    def test_returns_false_in_production(self) -> None:
        self.assertFalse(ia._allows_shared_secret_fallback())

    @patch.dict(os.environ, {}, clear=True)
    def test_returns_false_when_env_unknown(self) -> None:
        # Fail-closed: an unset/unrecognized environment is treated as
        # production, so the shared-secret fallback is refused.
        self.assertFalse(ia._allows_shared_secret_fallback())

    @patch.dict(os.environ, {"RUNTIME_ENV": "local"}, clear=True)
    def test_returns_true_in_local_dev(self) -> None:
        self.assertTrue(ia._allows_shared_secret_fallback())

    @patch.dict(os.environ, {"NODE_ENV": "development"}, clear=True)
    def test_returns_true_in_development(self) -> None:
        self.assertTrue(ia._allows_shared_secret_fallback())


class GetInternalServiceSecretTests(unittest.TestCase):
    @patch.dict(os.environ, {}, clear=True)
    def test_raises_when_missing(self) -> None:
        with self.assertRaises(RuntimeError) as ctx:
            ia._get_internal_service_secret("missing_aud")
        self.assertIn("INTERNAL_SERVICE_AUTH_SECRET_MISSING_AUD", str(ctx.exception))

    @patch.dict(
        os.environ,
        {"INTERNAL_SERVICE_AUTH_SECRET_MY_AUD": "scoped-secret"},
        clear=True,
    )
    def test_prefers_scoped_secret(self) -> None:
        secret = ia._get_internal_service_secret("my_aud")
        self.assertEqual(secret, b"scoped-secret")

    @patch.dict(
        os.environ,
        {
            "INTERNAL_SERVICE_AUTH_SECRET": "shared-secret",
            "RUNTIME_ENV": "local",
        },
        clear=True,
    )
    def test_falls_back_to_shared_secret(self) -> None:
        secret = ia._get_internal_service_secret("any_aud")
        self.assertEqual(secret, b"shared-secret")

    @patch.dict(
        os.environ,
        {
            "RUNTIME_SECRET": "runtime-secret",
            "RUNTIME_ENV": "local",
        },
        clear=True,
    )
    def test_falls_back_to_runtime_secret(self) -> None:
        secret = ia._get_internal_service_secret("any_aud")
        self.assertEqual(secret, b"runtime-secret")

    @patch.dict(
        os.environ,
        {
            "INTERNAL_SERVICE_AUTH_SECRET": "shared-secret",
        },
        clear=True,
    )
    def test_no_fallback_when_env_unknown(self) -> None:
        # Fail-closed: without an explicit dev marker the fallback is refused.
        with self.assertRaises(RuntimeError):
            ia._get_internal_service_secret("any_aud")

    @patch.dict(
        os.environ,
        {
            "INTERNAL_SERVICE_AUTH_SECRET": "shared-secret",
            "NODE_ENV": "production",
        },
        clear=True,
    )
    def test_no_fallback_in_production(self) -> None:
        with self.assertRaises(RuntimeError):
            ia._get_internal_service_secret("any_aud")


class Base64UrlTests(unittest.TestCase):
    def test_roundtrip(self) -> None:
        for data in [b"hello", b"\x00\xff\x80", json.dumps({"a": 1}).encode()]:
            encoded = ia._b64url_encode(data)
            self.assertNotIn("=", encoded)
            decoded = ia._b64url_decode(encoded)
            self.assertEqual(decoded, data)


class SignPayloadSegmentTests(unittest.TestCase):
    def test_determinism(self) -> None:
        sig1 = ia._sign_payload_segment("payload", b"secret")
        sig2 = ia._sign_payload_segment("payload", b"secret")
        self.assertEqual(sig1, sig2)

    def test_different_secrets_produce_different_signatures(self) -> None:
        sig1 = ia._sign_payload_segment("payload", b"secret1")
        sig2 = ia._sign_payload_segment("payload", b"secret2")
        self.assertNotEqual(sig1, sig2)


class BodyHashTests(unittest.TestCase):
    def test_str_and_bytes_equivalence(self) -> None:
        self.assertEqual(ia._body_hash("hello"), ia._body_hash(b"hello"))

    def test_determinism(self) -> None:
        self.assertEqual(ia._body_hash("body"), ia._body_hash("body"))


class CreateInternalServiceTokenTests(unittest.TestCase):
    @patch.dict(
        os.environ,
        {"INTERNAL_SERVICE_AUTH_SECRET_AUD": "secret"},
        clear=True,
    )
    def test_basic_token_structure(self) -> None:
        token = ia.create_internal_service_token("aud")
        parts = token.split(".")
        self.assertEqual(len(parts), 2)
        payload = json.loads(ia._b64url_decode(parts[0]).decode())
        self.assertEqual(payload["aud"], "aud")
        self.assertIn("iat", payload)
        self.assertIn("exp", payload)

    @patch.dict(
        os.environ,
        {"INTERNAL_SERVICE_AUTH_SECRET_AUD": "secret"},
        clear=True,
    )
    def test_invalid_ttl_raises(self) -> None:
        with self.assertRaises(ValueError):
            ia.create_internal_service_token("aud", ttl_seconds=0)
        with self.assertRaises(ValueError):
            ia.create_internal_service_token("aud", ttl_seconds=400)

    @patch.dict(
        os.environ,
        {"INTERNAL_SERVICE_AUTH_SECRET_AUD": "secret"},
        clear=True,
    )
    def test_invalid_subject_raises(self) -> None:
        with self.assertRaises(ValueError):
            ia.create_internal_service_token("aud", subject="")
        with self.assertRaises(ValueError):
            ia.create_internal_service_token("aud", subject=123)  # type: ignore[arg-type]

    @patch.dict(
        os.environ,
        {"INTERNAL_SERVICE_AUTH_SECRET_AUD": "secret"},
        clear=True,
    )
    def test_optional_fields_included(self) -> None:
        token = ia.create_internal_service_token(
            "aud",
            subject="sub",
            method="post",
            path="/path",
            body=b"body",
        )
        parts = token.split(".")
        payload = json.loads(ia._b64url_decode(parts[0]).decode())
        self.assertEqual(payload["sub"], "sub")
        self.assertEqual(payload["htm"], "POST")
        self.assertEqual(payload["path"], "/path")
        self.assertEqual(payload["bh"], ia._body_hash(b"body"))


class BuildInternalServiceHeadersTests(unittest.TestCase):
    @patch.dict(
        os.environ,
        {"INTERNAL_SERVICE_AUTH_SECRET_AUD": "secret"},
        clear=True,
    )
    def test_builds_headers_with_all_params(self) -> None:
        headers = ia.build_internal_service_headers(
            "aud",
            ttl_seconds=60,
            subject="sub",
            method="GET",
            path="/api/v1/run",
            body=b"payload",
        )
        self.assertIn(ia.INTERNAL_SERVICE_TOKEN_HEADER, headers)
        token = headers[ia.INTERNAL_SERVICE_TOKEN_HEADER]
        parts = token.split(".")
        self.assertEqual(len(parts), 2)
        payload = json.loads(ia._b64url_decode(parts[0]).decode())
        self.assertEqual(payload["aud"], "aud")
        self.assertEqual(payload["sub"], "sub")
        self.assertEqual(payload["htm"], "GET")
        self.assertEqual(payload["path"], "/api/v1/run")
        self.assertEqual(payload["bh"], ia._body_hash(b"payload"))

    @patch.dict(
        os.environ,
        {"INTERNAL_SERVICE_AUTH_SECRET_AUD": "secret"},
        clear=True,
    )
    def test_builds_headers_without_optional_params(self) -> None:
        headers = ia.build_internal_service_headers("aud")
        self.assertIn(ia.INTERNAL_SERVICE_TOKEN_HEADER, headers)
        token = headers[ia.INTERNAL_SERVICE_TOKEN_HEADER]
        parts = token.split(".")
        self.assertEqual(len(parts), 2)


class VerifyInternalServiceTokenTests(unittest.TestCase):
    def _make_token(
        self,
        audience: str = "aud",
        now: int = 1000,
        ttl: int = 30,
        subject: str | None = None,
        method: str | None = None,
        path: str | None = None,
        body: bytes | str | None = None,
        secret: bytes = b"secret",
    ) -> str:
        with patch.object(ia, "_get_internal_service_secret", return_value=secret):
            return ia.create_internal_service_token(
                audience,
                now_seconds=now,
                ttl_seconds=ttl,
                subject=subject,
                method=method,
                path=path,
                body=body,
            )

    @patch.object(ia, "_get_internal_service_secret", return_value=b"secret")
    def test_verification_success(self, _mock: MagicMock) -> None:
        token = self._make_token(now=1000)
        self.assertTrue(ia.verify_internal_service_token(token, "aud", now_seconds=1000))

    @patch.object(ia, "_get_internal_service_secret", return_value=b"secret")
    def test_verification_fails_wrong_secret(self, _mock: MagicMock) -> None:
        token = self._make_token(secret=b"secret1")
        with patch.object(ia, "_get_internal_service_secret", return_value=b"secret2"):
            self.assertFalse(ia.verify_internal_service_token(token, "aud", now_seconds=1000))

    @patch.object(ia, "_get_internal_service_secret", return_value=b"secret")
    def test_verification_fails_expired_timestamp(self, _mock: MagicMock) -> None:
        token = self._make_token(now=1000, ttl=30)
        self.assertFalse(ia.verify_internal_service_token(token, "aud", now_seconds=2000))

    @patch.object(ia, "_get_internal_service_secret", return_value=b"secret")
    def test_verification_fails_wrong_method(self, _mock: MagicMock) -> None:
        token = self._make_token(now=1000, method="POST")
        self.assertFalse(ia.verify_internal_service_token(token, "aud", now_seconds=1000, method="GET"))

    @patch.object(ia, "_get_internal_service_secret", return_value=b"secret")
    def test_verification_fails_wrong_path(self, _mock: MagicMock) -> None:
        token = self._make_token(now=1000, path="/a")
        self.assertFalse(ia.verify_internal_service_token(token, "aud", now_seconds=1000, path="/b"))

    @patch.object(ia, "_get_internal_service_secret", return_value=b"secret")
    def test_verification_fails_missing_headers(self, _mock: MagicMock) -> None:
        # empty token string
        self.assertFalse(ia.verify_internal_service_token("", "aud", now_seconds=1000))
        # missing dot separator
        self.assertFalse(ia.verify_internal_service_token("nodot", "aud", now_seconds=1000))

    @patch.object(ia, "_get_internal_service_secret", return_value=b"secret")
    def test_replay_attack_prevention(self, _mock: MagicMock) -> None:
        # token issued in the future or expired far in the past
        token = self._make_token(now=1000)
        # too far in the future (beyond clock skew)
        self.assertFalse(ia.verify_internal_service_token(token, "aud", now_seconds=900))
        # too far in the past (beyond clock skew + ttl)
        self.assertFalse(ia.verify_internal_service_token(token, "aud", now_seconds=1100))

    @patch.object(ia, "_get_internal_service_secret", return_value=b"secret")
    def test_payload_inclusion_in_signature(self, _mock: MagicMock) -> None:
        token = self._make_token(now=1000, body=b"hello")
        self.assertTrue(ia.verify_internal_service_token(token, "aud", now_seconds=1000, body=b"hello"))
        self.assertFalse(ia.verify_internal_service_token(token, "aud", now_seconds=1000, body=b"world"))

    @patch.object(ia, "_get_internal_service_secret", return_value=b"secret")
    def test_clock_skew_tolerance(self, _mock: MagicMock) -> None:
        token = self._make_token(now=1000, ttl=30)
        # within 30s skew before iat
        self.assertTrue(ia.verify_internal_service_token(token, "aud", now_seconds=1020))
        # within 30s skew after exp
        self.assertTrue(ia.verify_internal_service_token(token, "aud", now_seconds=990))

    @patch.object(ia, "_get_internal_service_secret", return_value=b"secret")
    def test_tampered_payload_segment(self, _mock: MagicMock) -> None:
        token = self._make_token(now=1000)
        parts = token.split(".")
        tampered = "tampered." + parts[1]
        self.assertFalse(ia.verify_internal_service_token(tampered, "aud", now_seconds=1000))

    @patch.object(ia, "_get_internal_service_secret", return_value=b"secret")
    def test_invalid_claims_non_dict(self, _mock: MagicMock) -> None:
        payload_segment = ia._b64url_encode(json.dumps([1, 2, 3]).encode())
        signature = ia._sign_payload_segment(payload_segment, b"secret")
        token = f"{payload_segment}.{signature}"
        self.assertIsNone(ia.verify_internal_service_token_claims(token, "aud", now_seconds=1000))

    @patch.object(ia, "_get_internal_service_secret", return_value=b"secret")
    def test_invalid_claims_missing_aud(self, _mock: MagicMock) -> None:
        payload_segment = ia._b64url_encode(json.dumps({"iat": 1000, "exp": 1030}).encode())
        signature = ia._sign_payload_segment(payload_segment, b"secret")
        token = f"{payload_segment}.{signature}"
        self.assertIsNone(ia.verify_internal_service_token_claims(token, "aud", now_seconds=1000))

    @patch.object(ia, "_get_internal_service_secret", return_value=b"secret")
    def test_exp_equals_iat(self, _mock: MagicMock) -> None:
        payload_segment = ia._b64url_encode(json.dumps({"aud": "aud", "iat": 1000, "exp": 1000}).encode())
        signature = ia._sign_payload_segment(payload_segment, b"secret")
        token = f"{payload_segment}.{signature}"
        self.assertIsNone(ia.verify_internal_service_token_claims(token, "aud", now_seconds=1000))

    @patch.object(ia, "_get_internal_service_secret", return_value=b"secret")
    def test_max_lifetime_exceeded(self, _mock: MagicMock) -> None:
        payload_segment = ia._b64url_encode(json.dumps({"aud": "aud", "iat": 1000, "exp": 2000}).encode())
        signature = ia._sign_payload_segment(payload_segment, b"secret")
        token = f"{payload_segment}.{signature}"
        self.assertIsNone(ia.verify_internal_service_token_claims(token, "aud", now_seconds=1000))

    @patch.object(ia, "_get_internal_service_secret", return_value=b"secret")
    def test_wrong_audience(self, _mock: MagicMock) -> None:
        token = self._make_token(audience="aud1", now=1000)
        self.assertFalse(ia.verify_internal_service_token(token, "aud2", now_seconds=1000))

    @patch.object(ia, "_get_internal_service_secret", return_value=b"secret")
    def test_body_as_str(self, _mock: MagicMock) -> None:
        token = self._make_token(now=1000, body="text body")
        self.assertTrue(ia.verify_internal_service_token(token, "aud", now_seconds=1000, body="text body"))

    @patch.object(ia, "_get_internal_service_secret", return_value=b"secret")
    def test_verify_returns_bool(self, _mock: MagicMock) -> None:
        token = self._make_token(now=1000)
        self.assertIsInstance(ia.verify_internal_service_token(token, "aud", now_seconds=1000), bool)

    @patch.object(ia, "_get_internal_service_secret", return_value=b"secret")
    def test_claims_returns_dict(self, _mock: MagicMock) -> None:
        token = self._make_token(now=1000, subject="sub")
        claims = ia.verify_internal_service_token_claims(token, "aud", now_seconds=1000)
        self.assertIsInstance(claims, dict)
        self.assertEqual(claims["sub"], "sub")

    @patch.object(ia, "_get_internal_service_secret", return_value=b"secret")
    def test_claims_returns_none_for_invalid(self, _mock: MagicMock) -> None:
        self.assertIsNone(ia.verify_internal_service_token_claims("bad.token", "aud", now_seconds=1000))

    @patch.object(ia, "_get_internal_service_secret", return_value=b"secret")
    def test_bad_types_in_claims(self, _mock: MagicMock) -> None:
        # subject as int
        payload_segment = ia._b64url_encode(
            json.dumps({"aud": "aud", "iat": 1000, "exp": 1030, "sub": 123}).encode()
        )
        signature = ia._sign_payload_segment(payload_segment, b"secret")
        token = f"{payload_segment}.{signature}"
        self.assertIsNone(ia.verify_internal_service_token_claims(token, "aud", now_seconds=1000))

        # htm as int
        payload_segment = ia._b64url_encode(
            json.dumps({"aud": "aud", "iat": 1000, "exp": 1030, "htm": 123}).encode()
        )
        signature = ia._sign_payload_segment(payload_segment, b"secret")
        token = f"{payload_segment}.{signature}"
        self.assertIsNone(ia.verify_internal_service_token_claims(token, "aud", now_seconds=1000))

        # path as int
        payload_segment = ia._b64url_encode(
            json.dumps({"aud": "aud", "iat": 1000, "exp": 1030, "path": 123}).encode()
        )
        signature = ia._sign_payload_segment(payload_segment, b"secret")
        token = f"{payload_segment}.{signature}"
        self.assertIsNone(ia.verify_internal_service_token_claims(token, "aud", now_seconds=1000))

        # bh as int
        payload_segment = ia._b64url_encode(
            json.dumps({"aud": "aud", "iat": 1000, "exp": 1030, "bh": 123}).encode()
        )
        signature = ia._sign_payload_segment(payload_segment, b"secret")
        token = f"{payload_segment}.{signature}"
        self.assertIsNone(ia.verify_internal_service_token_claims(token, "aud", now_seconds=1000))


if __name__ == "__main__":
    unittest.main()
