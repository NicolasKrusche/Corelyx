"""Enhanced connector registry for the Connector SDK.

Extends the existing auto-discovery registry with metadata, listing, and
lookup helpers. The original ``connectors.REGISTRY`` continues to work as-is;
this module provides richer introspection on top.
"""

from __future__ import annotations

import inspect
import logging
from importlib import import_module
from pathlib import Path
from typing import Any

from ..base import IConnector
from .types import OperationSchema

logger = logging.getLogger(__name__)


def _discover_all_connectors() -> dict[str, type[IConnector]]:
    """Import all connector modules and collect IConnector subclasses.

    This is the same logic as ``connectors._discover_registry`` but lives
    inside the SDK so it can be called independently for testing or
    extension.
    """
    connectors_dir = Path(__file__).resolve().parent.parent
    registry: dict[str, type[IConnector]] = {}

    skip_modules = {"__init__", "base", "rate_limit"}

    for module_path in connectors_dir.glob("*.py"):
        module_name = module_path.stem
        if module_name in skip_modules or module_name.startswith("_"):
            continue

        try:
            module = import_module(f"connectors.{module_name}")
        except Exception:
            logger.debug("Failed to import connectors.%s", module_name, exc_info=True)
            continue

        for _, cls in inspect.getmembers(module, inspect.isclass):
            if cls is IConnector or not issubclass(cls, IConnector):
                continue

            provider = getattr(cls, "provider", None)
            if not isinstance(provider, str) or not provider:
                continue

            if provider in registry:
                logger.warning(
                    "Duplicate connector provider '%s' in %s (already registered from %s)",
                    provider,
                    cls.__name__,
                    registry[provider].__name__,
                )
                continue

            registry[provider] = cls

    return registry


class ConnectorRegistry:
    """Enhanced registry with metadata and listing capabilities.

    Wraps the auto-discovery result and adds:
    - ``list_providers()`` for enumeration
    - ``get_metadata()`` for per-connector introspection
    - ``get_operation_schemas()`` for schema discovery
    """

    def __init__(self) -> None:
        self._connectors = _discover_all_connectors()
        logger.info("Connector SDK registry initialized with %d providers", len(self._connectors))

    def list_providers(self) -> list[str]:
        """Return sorted list of all registered provider slugs."""
        return sorted(self._connectors.keys())

    def get_connector_class(self, provider: str) -> type[IConnector] | None:
        """Return the connector class for a provider, or None."""
        return self._connectors.get(provider)

    def get_connector(self, provider: str) -> IConnector | None:
        """Instantiate and return a connector for a provider, or None."""
        cls = self._connectors.get(provider)
        return cls() if cls else None

    def has_connector(self, provider: str) -> bool:
        return provider in self._connectors

    def get_metadata(self, provider: str) -> dict[str, Any]:
        """Return metadata dict for a provider (operations, class name, etc.)."""
        cls = self._connectors.get(provider)
        if cls is None:
            return {}

        instance = cls()
        return {
            "provider": provider,
            "class_name": type(instance).__name__,
            "supported_operations": list(instance.supported_operations),
        }

    def get_operation_schemas(self, provider: str) -> list[dict[str, Any]]:
        """Return operation schemas for a provider, if the connector exposes them.

        Connectors that implement ``operation_schemas`` (from BaseConnector)
        will return rich schema data. Legacy connectors return a minimal
        stub with just the operation name.
        """
        instance = self.get_connector(provider)
        if instance is None:
            return []

        # New SDK connectors expose operation_schemas as a property (list)
        schemas = getattr(instance, "operation_schemas", None)
        if schemas is not None and hasattr(schemas, "__iter__") and not isinstance(schemas, str):
            return [s.to_dict() for s in schemas]

        # Fallback: return bare operation names
        return [{"name": op} for op in instance.supported_operations]

    @property
    def count(self) -> int:
        return len(self._connectors)


# Module-level singleton (lazy)
_registry: ConnectorRegistry | None = None


def get_registry() -> ConnectorRegistry:
    """Get or create the global connector registry."""
    global _registry
    if _registry is None:
        _registry = ConnectorRegistry()
    return _registry
