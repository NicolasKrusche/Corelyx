from __future__ import annotations

from importlib import import_module
import inspect
from pathlib import Path
from typing import TYPE_CHECKING

from .base import IConnector, ConnectorError

if TYPE_CHECKING:
    pass


def _discover_registry() -> dict[str, type[IConnector]]:
    connectors_dir = Path(__file__).resolve().parent
    registry: dict[str, type[IConnector]] = {}

    for module_path in connectors_dir.glob("*.py"):
        module_name = module_path.stem
        if module_name in {"__init__", "base", "rate_limit"}:
            continue

        try:
            module = import_module(f"{__package__}.{module_name}")
        except Exception:
            # Skip connectors with unmet dependencies (e.g. asyncpg)
            continue

        for _, cls in inspect.getmembers(module, inspect.isclass):
            if cls is IConnector or not issubclass(cls, IConnector):
                continue

            provider = getattr(cls, "provider", None)
            if not isinstance(provider, str) or not provider:
                continue
            if provider in registry:
                raise RuntimeError(f"Duplicate connector provider '{provider}' found in {cls.__name__}")
            registry[provider] = cls

    return registry


class _LazyRegistry:
    """Lazy wrapper that defers connector discovery until first access."""

    def __init__(self) -> None:
        self._registry: dict[str, type[IConnector]] | None = None

    def _ensure(self) -> dict[str, type[IConnector]]:
        if self._registry is None:
            self._registry = _discover_registry()
        return self._registry

    def __getitem__(self, key: str) -> type[IConnector]:
        return self._ensure()[key]

    def __contains__(self, key: str) -> bool:
        return key in self._ensure()

    def get(self, key: str, default: type[IConnector] | None = None) -> type[IConnector] | None:
        return self._ensure().get(key, default)

    def __iter__(self):
        return iter(self._ensure())

    def __len__(self) -> int:
        return len(self._ensure())

    def items(self):
        return self._ensure().items()

    def keys(self):
        return self._ensure().keys()

    def values(self):
        return self._ensure().values()


REGISTRY: dict[str, type[IConnector]] = _LazyRegistry()  # type: ignore[assignment]


def get_connector(provider: str) -> IConnector | None:
    cls = REGISTRY.get(provider)  # type: ignore[union-attr]
    return cls() if cls else None


__all__ = ["IConnector", "ConnectorError", "REGISTRY", "get_connector"]
