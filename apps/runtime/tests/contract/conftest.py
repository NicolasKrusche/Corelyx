"""Restore real connectors module for contract tests.

The parent conftest.py (tests/conftest.py) installs stubs for the connectors
package so simulation tests can import engine.simulation without pulling in
all provider SDKs. Contract tests need the real connector classes, so we
restore the real module here before collection.
"""

from __future__ import annotations

import importlib
import sys


def _restore_real_connectors() -> None:
    """Remove the stubs and re-import the real connectors package."""
    # Remove the stubs installed by the parent conftest
    for key in list(sys.modules.keys()):
        if key == "connectors" or key.startswith("connectors."):
            del sys.modules[key]

    # Force a fresh import of the real connectors package
    importlib.import_module("connectors")


# Run immediately so the real connectors are available before collection
_restore_real_connectors()
