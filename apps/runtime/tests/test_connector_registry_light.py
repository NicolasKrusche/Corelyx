"""Lightweight registry-wide connector tests (no I/O)."""
from __future__ import annotations

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
                inst = cls()
                # Must be called inside an async test helper; here we run it via asyncio.run
                import asyncio
                # Some stubs validate params before the match block, so we only assert that
                # a ConnectorError is raised for an invalid operation name.
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
        self.assertGreaterEqual(len(REGISTRY), 100)

    def test_internal_modules_not_in_registry(self) -> None:
        self.assertNotIn("__init__", REGISTRY)
        self.assertNotIn("base", REGISTRY)
        self.assertNotIn("rate_limit", REGISTRY)


if __name__ == "__main__":
    unittest.main()
