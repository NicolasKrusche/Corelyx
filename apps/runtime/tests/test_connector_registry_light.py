"""Lightweight registry-wide connector tests (no I/O)."""

from __future__ import annotations

import re
from pathlib import Path
import unittest

from connectors import REGISTRY, get_connector
from connectors.base import ConnectorError, IConnector


# Dynamically build a lightweight test class for every registered connector.
for _provider, _cls in sorted(REGISTRY.items()):

    def _make_test_class(cls, provider):
        class _TestConnector(unittest.TestCase):
            def test_instantiate(self) -> None:
                inst = cls()
                self.assertIsInstance(inst, IConnector)
                self.assertEqual(inst.provider, provider)
                self.assertTrue(len(inst.supported_operations) > 0)

            def test_operations_are_strings(self) -> None:
                inst = cls()
                for op in inst.supported_operations:
                    self.assertIsInstance(op, str)
                    self.assertTrue(op)

            def test_unsupported_operation_raises(self) -> None:
                # Database connectors create connection pools before the operation
                # match, so the HTTP-based mock doesn't work.
                if provider in ("postgresql", "redis"):
                    return
                inst = cls()
                import asyncio
                from unittest.mock import AsyncMock, MagicMock, patch

                mock_resp = MagicMock()
                mock_resp.status_code = 200
                if provider == "jira":
                    mock_resp.json.return_value = [{"id": "site1"}]
                else:
                    mock_resp.json.return_value = {}
                with patch("connectors.rate_limit.request_with_rate_limit", new=AsyncMock(return_value=mock_resp)):
                    with self.assertRaises(ConnectorError):
                        asyncio.run(inst.execute("__nonexistent_operation__", {}, "token"))

        _TestConnector.__name__ = f"Test{cls.__name__}"
        return _TestConnector

    _test_cls = _make_test_class(_cls, _provider)
    globals()[_test_cls.__name__] = _test_cls


class TestRegistryMeta(unittest.TestCase):
    def test_all_connectors_instantiate(self) -> None:
        for provider, cls in REGISTRY.items():
            with self.subTest(provider=provider):
                inst = cls()
                self.assertTrue(inst.supported_operations)

    def test_no_duplicate_providers(self) -> None:
        providers = [cls.provider for cls in REGISTRY.values()]
        self.assertEqual(len(providers), len(set(providers)))

    def test_get_connector_unknown_returns_none(self) -> None:
        self.assertIsNone(get_connector("nonexistent_provider_xyz"))

    def test_all_classes_subclass_iconnector(self) -> None:
        for cls in REGISTRY.values():
            self.assertTrue(issubclass(cls, IConnector))

    def test_registry_count(self) -> None:
        if not REGISTRY:
            self.skipTest("REGISTRY empty (conftest stubs active)")
        self.assertGreaterEqual(len(REGISTRY), 100)

    def test_internal_modules_not_in_registry(self) -> None:
        self.assertNotIn("__init__", REGISTRY)
        self.assertNotIn("base", REGISTRY)
        self.assertNotIn("rate_limit", REGISTRY)

    def test_genesis_prompt_covers_runtime_connectors(self) -> None:
        """Keep Genesis operation names synced with native runtime connectors.

        When conftest stubs are active, REGISTRY is empty — skip in that case.
        The genesis prompt may define extra providers; we only require that
        every *runtime* connector is present in the prompt.
        """
        if not REGISTRY:
            self.skipTest("REGISTRY empty (conftest stubs active)")

        repo_root = Path(__file__).resolve().parents[3]
        prompt_path = repo_root / "apps" / "web" / "lib" / "genesis" / "prompt.ts"
        prompt = prompt_path.read_text(encoding="utf-8")
        body = prompt.split("const CONNECTOR_DEFINITIONS: Record<string, ConnectorDef> = {", 1)[1].split("\n};", 1)[0]
        matches = list(re.finditer(r"^  ([a-z][a-z0-9_]*): \{", body, re.M))
        chunks: dict[str, str] = {}
        for index, match in enumerate(matches):
            end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
            chunks[match.group(1)] = body[match.start() : end]

        runtime_only = set(REGISTRY) - set(chunks)
        self.assertEqual(
            runtime_only,
            set(),
            f"Runtime connectors missing from genesis prompt: {runtime_only}",
        )

        for provider, cls in sorted(REGISTRY.items()):
            chunk = chunks[provider]
            connector = cls()
            for operation in connector.supported_operations:
                with self.subTest(provider=provider, operation=operation):
                    self.assertRegex(
                        chunk,
                        rf"(?<![a-z0-9_]){re.escape(operation)}(?![a-z0-9_])",
                    )

    def test_web_connector_catalog_matches_runtime_operations(self) -> None:
        """Keep the editor's selectable operations aligned with runtime support."""
        if not REGISTRY:
            self.skipTest("REGISTRY empty (conftest stubs active)")

        repo_root = Path(__file__).resolve().parents[3]
        catalog_path = repo_root / "apps" / "web" / "lib" / "connectors" / "catalog.ts"
        catalog = catalog_path.read_text(encoding="utf-8")
        body = catalog.split("export const CONNECTOR_OPERATIONS: Record<string, string[]> = {", 1)[1].split("\n};", 1)[
            0
        ]

        for match in re.finditer(r"^  ([a-z][a-z0-9_]*): \[([^\]]*)\]", body, re.M):
            provider = match.group(1)
            operations = re.findall(r'"([a-z][a-z0-9_]*)"', match.group(2))
            with self.subTest(provider=provider):
                self.assertIn(provider, REGISTRY)
                self.assertEqual(operations, REGISTRY[provider]().supported_operations)


if __name__ == "__main__":
    unittest.main()
