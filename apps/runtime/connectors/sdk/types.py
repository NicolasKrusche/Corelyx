"""Shared types for the Connector SDK."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class AuthType(str, Enum):
    """Supported authentication methods."""

    OAUTH2 = "oauth2"
    API_KEY = "api_key"
    BASIC = "basic"
    BEARER = "bearer"
    NONE = "none"


class FieldKind(str, Enum):
    """Parameter field kinds for schema definitions."""

    STRING = "string"
    INTEGER = "integer"
    FLOAT = "float"
    BOOLEAN = "boolean"
    OBJECT = "object"
    ARRAY = "array"
    FILE = "file"


@dataclass(frozen=True, slots=True)
class FieldSchema:
    """Describes one input or output field for a connector operation."""

    name: str
    kind: FieldKind = FieldKind.STRING
    required: bool = False
    description: str = ""
    default: Any = None
    enum: list[str] | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "name": self.name,
            "type": self.kind.value,
            "required": self.required,
        }
        if self.description:
            d["description"] = self.description
        if self.default is not None:
            d["default"] = self.default
        if self.enum:
            d["enum"] = self.enum
        return d


@dataclass(frozen=True, slots=True)
class OperationSchema:
    """Schema for a single connector operation."""

    name: str
    description: str = ""
    input_fields: list[FieldSchema] = field(default_factory=list)
    output_fields: list[FieldSchema] = field(default_factory=list)
    is_destructive: bool = False
    is_write: bool | None = None  # None = auto-detect from name prefix

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "name": self.name,
            "input_fields": [f.to_dict() for f in self.input_fields],
            "output_fields": [f.to_dict() for f in self.output_fields],
        }
        if self.description:
            d["description"] = self.description
        if self.is_destructive:
            d["is_destructive"] = True
        if self.is_write is not None:
            d["is_write"] = self.is_write
        return d


@dataclass(frozen=True, slots=True)
class HealthCheckResult:
    """Result of a connector health check."""

    healthy: bool
    provider: str
    message: str = ""
    latency_ms: float = 0.0
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "healthy": self.healthy,
            "provider": self.provider,
            "message": self.message,
            "latency_ms": round(self.latency_ms, 2),
            "details": self.details,
        }
