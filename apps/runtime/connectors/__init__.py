from __future__ import annotations

from importlib import import_module
import inspect
from pathlib import Path

from .base import IConnector, ConnectorError


def _discover_registry() -> dict[str, type[IConnector]]:
    connectors_dir = Path(__file__).resolve().parent
    registry: dict[str, type[IConnector]] = {}

    for module_path in connectors_dir.glob("*.py"):
        module_name = module_path.stem
        if module_name in {"__init__", "base", "rate_limit"}:
            continue

        module = import_module(f"{__package__}.{module_name}")
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


REGISTRY: dict[str, type[IConnector]] = _discover_registry()


def get_connector(provider: str) -> IConnector | None:
    cls = REGISTRY.get(provider)
    return cls() if cls else None


__all__ = ["IConnector", "ConnectorError", "REGISTRY", "get_connector"]
