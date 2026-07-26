"""Pytest configuration — mock heavy optional dependencies before collection.

The ``connectors`` package auto-discovers every connector module at import
time, which pulls in *all* provider SDKs (asyncpg, httpx, google-*, …).
Simulation tests only need the mock data layer and the safe-expression
evaluator, so we stub the connectors package and its base module here so
that ``engine.simulation`` can be imported without requiring any provider
packages.
"""

from __future__ import annotations

import importlib
import sys
import types
from pathlib import Path
from unittest.mock import MagicMock

# Put the runtime root (the parent of tests/) on sys.path.
#
# pytest prepends the *test* directory for rootdir-style layouts without
# __init__.py, not the package root, and unlike `python -c` it does not add the
# working directory either. Without this, `import connectors` / `import engine`
# fail under pytest even though they work in a plain interpreter — which in turn
# made the stub installation below fire unconditionally.
_RUNTIME_ROOT = Path(__file__).resolve().parent.parent
if str(_RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(_RUNTIME_ROOT))


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

    # Same reasoning as the per-test stubs: keep it importable as a package so
    # `import connectors.<mod>` resolves to the real module on disk, while the
    # stubbed __init__ still avoids the SDK-pulling auto-discovery.
    conn_mod.__path__ = [str(_RUNTIME_ROOT / "connectors")]  # type: ignore[attr-defined]

    sys.modules["connectors"] = conn_mod
    sys.modules["connectors.base"] = base_mod


def _real_connectors_importable() -> bool:
    """True if the real ``connectors`` package imports with the SDKs present."""
    try:
        importlib.import_module("connectors")
    except Exception:
        # A partially-initialised package left in sys.modules would shadow the
        # stubs we are about to install, so clear anything the failed import
        # registered.
        for name in [n for n in sys.modules if n == "connectors" or n.startswith("connectors.")]:
            del sys.modules[name]
        return False
    return True


# Install stubs as early as possible — before any test module is collected —
# but ONLY when the real package cannot be imported.
#
# This used to be unconditional, which replaced ``connectors`` in sys.modules
# with a plain module object. A plain module has no ``__path__``, so every test
# doing ``import connectors.thunderbird`` (and ~30 others) died at collection
# with "'connectors' is not a package" — the whole runtime suite failed to
# collect, regardless of which provider SDKs were installed. Stubbing only on
# real failure keeps the simulation tests working without provider SDKs while
# letting the connector tests run whenever the SDKs are available.
if not _real_connectors_importable():
    _install_connector_stubs()
