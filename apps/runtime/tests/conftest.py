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
import ipaddress
import os
import socket
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


# --------------------------------------------------------------------------
# Hard block on outbound network access.
#
# Tests are supposed to mock every provider call, but a mock that silently
# misses fails *open*: the code under test just makes the real request and the
# test still passes. That is exactly what used to happen in
# test_agent_web_and_caps.py — the module-level connector stubs swapped the
# ``engine.executor`` module object out from under
# ``patch("engine.executor._validate_outbound_url")``, so the patch decorated a
# module that was no longer the one executing and a live request went to
# example.com on every CI run.
#
# The import isolation that caused it is fixed, but "no test hits the network"
# should be enforced rather than assumed, so any escape is a loud failure
# instead of a silent packet.
_ALLOWED_IPS = {"127.0.0.1", "::1", "0.0.0.0", "::"}
_ALLOWED_HOSTS = {"localhost", "localhost.localdomain", "127.0.0.1", "::1", "", None}


class NetworkAccessBlocked(RuntimeError):
    """Raised when a test tries to open a non-loopback connection."""


_real_getaddrinfo = socket.getaddrinfo
_real_connect = socket.socket.connect


def _normalise_host(host):
    if isinstance(host, bytes):
        try:
            return host.decode("ascii")
        except UnicodeDecodeError:
            return None
    return host


def _is_literal_ip(host) -> bool:
    """True for a numeric address — resolving one sends no DNS traffic."""
    if not isinstance(host, str):
        return False
    try:
        ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        return False
    return True


def _guarded_getaddrinfo(host, port, *args, **kwargs):
    # DNS resolution is the one choke point every outbound client shares,
    # including the Windows Proactor loop's ConnectEx path that never calls
    # socket.connect().
    #
    # Literal IPs are exempt: getaddrinfo just parses them, no packet leaves the
    # box. The SSRF validators (_validate_http_url, _reject_internal_host) exist
    # precisely to resolve a target and reject private/link-local ranges, so
    # blocking that would break the tests for our own egress guard.
    name = _normalise_host(host)
    if not _is_literal_ip(name) and name not in _ALLOWED_HOSTS and str(name) not in _ALLOWED_IPS:
        raise NetworkAccessBlocked(
            f"Test attempted a real network connection to {host!r}:{port!r}. "
            "Mock the provider call instead — a live request here means a patch "
            "target is wrong and the test is passing for the wrong reason."
        )
    return _real_getaddrinfo(host, port, *args, **kwargs)


def _guarded_connect(self, address, *args, **kwargs):
    host = _normalise_host(address[0] if isinstance(address, tuple) else address)
    if isinstance(host, str) and host not in _ALLOWED_IPS and host not in _ALLOWED_HOSTS:
        raise NetworkAccessBlocked(
            f"Test attempted a real network connection to {address!r}. "
            "Mock the provider call instead."
        )
    return _real_connect(self, address, *args, **kwargs)


# Escape hatch for diagnosing which tests depend on live endpoints:
#   ALLOW_TEST_NETWORK=1 pytest tests/...
# Never set this in CI — a green run with it set proves nothing.
if os.environ.get("ALLOW_TEST_NETWORK") != "1":
    socket.getaddrinfo = _guarded_getaddrinfo
    socket.socket.connect = _guarded_connect
