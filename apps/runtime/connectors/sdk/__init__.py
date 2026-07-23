"""Connector SDK — public API.

Provides the enhanced base class, auth helpers, HTTP client, schema types,
and connector registry for building and introspecting connectors.

Usage::

    from connectors.sdk import BaseConnector, HttpClient, BearerAuthProvider
    from connectors.sdk.types import OperationSchema, FieldSchema
    from connectors.sdk.registry import get_registry

    # List all providers
    registry = get_registry()
    print(registry.list_providers())

    # Create an enhanced connector
    connector = registry.get_connector("gmail")
"""

from .auth import (
    ApiKeyAuthProvider,
    AuthProvider,
    BasicAuthProvider,
    BearerAuthProvider,
    NoAuthProvider,
)
from .base import BaseConnector
from .http import HttpClient
from .registry import ConnectorRegistry, get_registry
from .types import (
    AuthType,
    FieldKind,
    FieldSchema,
    HealthCheckResult,
    OperationSchema,
)

__all__ = [
    # Base
    "BaseConnector",
    # Auth
    "AuthProvider",
    "BearerAuthProvider",
    "ApiKeyAuthProvider",
    "BasicAuthProvider",
    "NoAuthProvider",
    "AuthType",
    # HTTP
    "HttpClient",
    # Schema
    "OperationSchema",
    "FieldSchema",
    "FieldKind",
    "HealthCheckResult",
    # Registry
    "ConnectorRegistry",
    "get_registry",
]
