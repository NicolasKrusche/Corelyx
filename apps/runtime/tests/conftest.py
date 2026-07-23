"""Pytest configuration — mock heavy optional dependencies before collection.

The ``connectors`` package auto-discovers every connector module at import
time, which pulls in *all* provider SDKs (asyncpg, httpx, google-*, …).
Simulation tests only need the mock data layer and the safe-expression
evaluator, so we stub the connectors package and its base module here so
that ``engine.simulation`` can be imported without requiring any provider
packages.
"""

from __future__ import annotations

import sys
import types
from unittest.mock import MagicMock


def _install_connector_stubs() -> None:
    """Insert lightweight stubs for ``connectors`` and ``connectors.base``."""
    # connectors.base — just provides ConnectorError and IConnector
    base_mod = types.ModuleType("connectors.base")

    class _FakeConnectorError(Exception):
        def __init__(self, code: str = "", message: str = "") -> None:
            super().__init__(message)
            self.code = code
            self.message = message

    class _FakeIConnector:
        pass

    base_mod.ConnectorError = _FakeConnectorError  # type: ignore[attr-defined]
    base_mod.IConnector = _FakeIConnector  # type: ignore[attr-defined]

    # connectors — provides get_connector and a stub REGISTRY
    conn_mod = types.ModuleType("connectors")
    conn_mod.get_connector = MagicMock(return_value=None)  # type: ignore[attr-defined]
    conn_mod.REGISTRY = {}  # type: ignore[attr-defined]
    conn_mod.IConnector = _FakeIConnector  # type: ignore[attr-defined]
    conn_mod.ConnectorError = _FakeConnectorError  # type: ignore[attr-defined]

    sys.modules["connectors"] = conn_mod
    sys.modules["connectors.base"] = base_mod


# Install stubs as early as possible — before any test module is collected.
_install_connector_stubs()
