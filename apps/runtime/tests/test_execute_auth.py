from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from internal_auth import INTERNAL_SERVICE_TOKEN_HEADER
from main import app


class RuntimeExecuteAuthTests(unittest.TestCase):
    def test_execute_requires_internal_token(self) -> None:
        response = TestClient(app).post("/execute", content=b"{}")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {"detail": "Unauthorized"})

    def test_execute_reports_missing_scoped_secret(self) -> None:
        env = {
            "RUNTIME_ENV": "production",
            "INTERNAL_SERVICE_AUTH_SECRET": "shared-secret",
            "RUNTIME_SECRET": "shared-secret",
            "INTERNAL_SERVICE_AUTH_SECRET_RUNTIME_EXECUTE": "",
        }
        with patch.dict(os.environ, env, clear=False):
            response = TestClient(app).post(
                "/execute",
                headers={INTERNAL_SERVICE_TOKEN_HEADER: "invalid.token"},
                content=b"{}",
            )

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json(), {"detail": "Runtime auth is not configured"})


if __name__ == "__main__":
    unittest.main()
