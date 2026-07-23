"""Base contract validation framework for Corelyx connectors.

Defines the contract schema format, validation logic, and human-readable
report generation. No external Pact dependency — uses a custom JSON-based
contract definition format.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# ── Field types allowed in contract JSON ──────────────────────────────────────

ALLOWED_FIELD_TYPES = frozenset({
    "string",
    "integer",
    "float",
    "boolean",
    "object",
    "array",
    "file",
})

# ── Contract data classes ─────────────────────────────────────────────────────


@dataclass(frozen=True)
class FieldContract:
    """Expected shape for a single input or output field."""

    name: str
    type: str = "string"
    required: bool = False
    description: str = ""

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "name": self.name,
            "type": self.type,
            "required": self.required,
        }
        if self.description:
            d["description"] = self.description
        return d


@dataclass(frozen=True)
class OperationContract:
    """Expected shape for a single connector operation."""

    name: str
    input_fields: list[FieldContract] = field(default_factory=list)
    output_fields: list[FieldContract] = field(default_factory=list)
    required_input_fields: list[str] = field(default_factory=list)
    optional_input_fields: list[str] = field(default_factory=list)

    @property
    def all_input_field_names(self) -> list[str]:
        return [f.name for f in self.input_fields]

    @property
    def all_output_field_names(self) -> list[str]:
        return [f.name for f in self.output_fields]


@dataclass(frozen=True)
class ProviderContract:
    """Top-level contract for a connector provider."""

    provider: str
    description: str = ""
    operations: list[OperationContract] = field(default_factory=list)

    @property
    def operation_names(self) -> list[str]:
        return [op.name for op in self.operations]


@dataclass
class ValidationResult:
    """Result of validating a single operation against its contract."""

    operation: str
    connector_class: str
    passed: bool = True
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def add_error(self, msg: str) -> None:
        self.errors.append(msg)
        self.passed = False

    def add_warning(self, msg: str) -> None:
        self.warnings.append(msg)


@dataclass
class ContractReport:
    """Aggregated report for a full provider contract validation."""

    provider: str
    connector_class: str
    results: list[ValidationResult] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return all(r.passed for r in self.results)

    @property
    def total(self) -> int:
        return len(self.results)

    @property
    def pass_count(self) -> int:
        return sum(1 for r in self.results if r.passed)

    @property
    def fail_count(self) -> int:
        return sum(1 for r in self.results if not r.passed)

    def format_report(self) -> str:
        """Generate a human-readable report string."""
        lines: list[str] = []
        status = "✅ PASS" if self.passed else "❌ FAIL"
        lines.append(f"\n{'=' * 70}")
        lines.append(
            f"  Provider: {self.provider}  |  Connector: {self.connector_class}  |  {status}"
        )
        lines.append(f"  Operations: {self.pass_count}/{self.total} passed")
        lines.append(f"{'=' * 70}")

        for r in self.results:
            icon = "✅" if r.passed else "❌"
            lines.append(f"  {icon} {r.operation}")
            for err in r.errors:
                lines.append(f"      ERROR: {err}")
            for warn in r.warnings:
                lines.append(f"      WARN:  {warn}")

        lines.append("")
        return "\n".join(lines)


# ── Contract loading ──────────────────────────────────────────────────────────

CONTRACTS_DIR = Path(__file__).resolve().parent / "contracts"


def _parse_field(data: dict[str, Any]) -> FieldContract:
    """Parse a field definition dict into a FieldContract."""
    field_type = data.get("type", "string")
    if field_type not in ALLOWED_FIELD_TYPES:
        # Fall back to string for unknown types
        field_type = "string"
    return FieldContract(
        name=data["name"],
        type=field_type,
        required=data.get("required", False),
        description=data.get("description", ""),
    )


def _parse_operation(data: dict[str, Any]) -> OperationContract:
    """Parse an operation definition dict into an OperationContract."""
    input_fields = [_parse_field(f) for f in data.get("input_fields", [])]
    output_fields = [_parse_field(f) for f in data.get("output_fields", [])]

    # Build required/optional from field definitions if not explicitly set
    required_input = [
        f["name"] for f in data.get("input_fields", []) if f.get("required", False)
    ]
    optional_input = [
        f["name"]
        for f in data.get("input_fields", [])
        if not f.get("required", False)
    ]

    # Allow explicit overrides in the contract JSON
    if "required_input_fields" in data:
        required_input = data["required_input_fields"]
    if "optional_input_fields" in data:
        optional_input = data["optional_input_fields"]

    return OperationContract(
        name=data["name"],
        input_fields=input_fields,
        output_fields=output_fields,
        required_input_fields=required_input,
        optional_input_fields=optional_input,
    )


def load_contract(provider: str) -> ProviderContract:
    """Load a provider contract from its JSON file."""
    contract_path = CONTRACTS_DIR / f"{provider}.json"
    if not contract_path.exists():
        raise FileNotFoundError(f"Contract file not found: {contract_path}")

    with open(contract_path, "r") as f:
        data = json.load(f)

    operations = [_parse_operation(op) for op in data.get("operations", [])]

    return ProviderContract(
        provider=data.get("provider", provider),
        description=data.get("description", ""),
        operations=operations,
    )


def load_all_contracts() -> dict[str, ProviderContract]:
    """Load all contract JSON files from the contracts directory."""
    contracts: dict[str, ProviderContract] = {}
    if not CONTRACTS_DIR.exists():
        return contracts
    for contract_file in sorted(CONTRACTS_DIR.glob("*.json")):
        provider = contract_file.stem
        try:
            contracts[provider] = load_contract(provider)
        except Exception:
            # Skip malformed contract files
            continue
    return contracts


# ── Connector class extraction ────────────────────────────────────────────────


def get_operation_schemas_from_class(
    connector_cls: type,
) -> list[dict[str, Any]]:
    """Extract operation schema dicts from a connector class.

    Works with both:
    - BaseConnector subclasses that have _operation_schemas (OperationSchema list)
    - IConnector subclasses that have supported_operations (str list)

    Returns an empty list if the connector has no schema details (only operation names).
    """
    schemas: list[dict[str, Any]] = []

    # Try _operation_schemas first (BaseConnector pattern)
    op_schemas = getattr(connector_cls, "_operation_schemas", [])
    if op_schemas:
        for schema in op_schemas:
            if hasattr(schema, "to_dict"):
                schemas.append(schema.to_dict())
            elif isinstance(schema, dict):
                schemas.append(schema)
        return schemas

    # No schema details available — return empty list
    # (caller should check supported_operations separately)
    return schemas


def get_supported_operations_from_class(connector_cls: type) -> list[str]:
    """Get the list of supported operation names from a connector class."""
    ops = getattr(connector_cls, "supported_operations", [])
    return list(ops)


# ── Validation logic ──────────────────────────────────────────────────────────


def _build_field_lookup(
    fields: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Build a name→field dict from a list of field dicts."""
    return {f["name"]: f for f in fields}


def validate_operation(
    op_contract: OperationContract,
    connector_schemas: list[dict[str, Any]],
    connector_class_name: str,
    connector_supported_ops: list[str] | None = None,
) -> ValidationResult:
    """Validate a single operation's contract against a connector's schemas.

    If connector_schemas is empty (connector doesn't use _operation_schemas),
    only operation existence is checked against supported_operations.
    """
    result = ValidationResult(
        operation=op_contract.name,
        connector_class=connector_class_name,
    )

    # If no schema details available, check operation existence only
    if not connector_schemas:
        if op_contract.name in (connector_supported_ops or []):
            result.add_warning(
                f"Operation '{op_contract.name}' exists in supported_operations "
                "but connector has no _operation_schemas for field-level validation. "
                "Consider adding _operation_schemas to the connector class."
            )
        else:
            result.add_error(
                f"Operation '{op_contract.name}' not found in connector's "
                f"supported_operations: {connector_supported_ops or []}"
            )
        return result

    # Find the matching operation in the connector
    connector_op = None
    for schema in connector_schemas:
        if schema.get("name") == op_contract.name:
            connector_op = schema
            break

    if connector_op is None:
        # Check if the operation exists in supported_operations (fallback)
        if op_contract.name in (connector_supported_ops or []):
            result.add_warning(
                f"Operation '{op_contract.name}' exists in supported_operations "
                "but has no _operation_schemas entry for field-level validation. "
                "Consider adding an OperationSchema to the connector."
            )
        else:
            result.add_error(
                f"Operation '{op_contract.name}' not found in connector schemas "
                f"or supported_operations. "
                f"Available schemas: {[s.get('name') for s in connector_schemas]}"
            )
        return result

    # Validate input fields
    conn_input_fields = connector_op.get("input_fields", [])
    contract_input_names = op_contract.all_input_field_names
    conn_input_lookup = _build_field_lookup(conn_input_fields)

    for field_contract in op_contract.input_fields:
        if field_contract.name not in conn_input_lookup:
            result.add_error(
                f"Missing input field '{field_contract.name}' "
                f"(type={field_contract.type}, required={field_contract.required})"
            )
            continue

        conn_field = conn_input_lookup[field_contract.name]

        # Validate type matches
        conn_type = conn_field.get("type", "string")
        if conn_type != field_contract.type:
            result.add_warning(
                f"Input field '{field_contract.name}' type mismatch: "
                f"expected '{field_contract.type}', got '{conn_type}'"
            )

        # Validate required flag
        conn_required = conn_field.get("required", False)
        if conn_required != field_contract.required:
            result.add_warning(
                f"Input field '{field_contract.name}' required flag mismatch: "
                f"expected required={field_contract.required}, got required={conn_required}"
            )

    # Check for unexpected extra required fields not in contract
    for field_contract in op_contract.input_fields:
        if field_contract.required and field_contract.name not in conn_input_lookup:
            # Already reported above as missing
            pass

    # Validate output fields
    conn_output_fields = connector_op.get("output_fields", [])
    contract_output_names = op_contract.all_output_field_names
    conn_output_lookup = _build_field_lookup(conn_output_fields)

    for field_contract in op_contract.output_fields:
        if field_contract.name not in conn_output_lookup:
            result.add_error(
                f"Missing output field '{field_contract.name}' "
                f"(type={field_contract.type})"
            )
            continue

        conn_field = conn_output_lookup[field_contract.name]

        # Validate type matches
        conn_type = conn_field.get("type", "string")
        if conn_type != field_contract.type:
            result.add_warning(
                f"Output field '{field_contract.name}' type mismatch: "
                f"expected '{field_contract.type}', got '{conn_type}'"
            )

    return result


def validate_provider(
    contract: ProviderContract,
    connector_cls: type,
) -> ContractReport:
    """Validate all operations in a provider contract against a connector class."""
    report = ContractReport(
        provider=contract.provider,
        connector_class=connector_cls.__name__,
    )

    connector_schemas = get_operation_schemas_from_class(connector_cls)
    connector_ops = get_supported_operations_from_class(connector_cls)

    for op_contract in contract.operations:
        result = validate_operation(
            op_contract, connector_schemas, connector_cls.__name__,
            connector_supported_ops=connector_ops,
        )

        # Extra check: operation listed in supported_operations but not in schemas
        if op_contract.name in connector_ops and not any(
            s.get("name") == op_contract.name for s in connector_schemas
        ):
            # This is already handled by validate_operation's no-schemas branch
            # but log it as an info note if schemas exist but operation is missing
            if connector_schemas:
                result.add_warning(
                    f"Operation '{op_contract.name}' is in supported_operations "
                    "but has no _operation_schemas entry"
                )

        report.results.append(result)

    return report


# ── Discover connectors ───────────────────────────────────────────────────────


def discover_connector_classes() -> dict[str, type]:
    """Discover all connector classes from the connectors package.

    Returns a dict of provider → class.
    """
    connectors_dir = Path(__file__).resolve().parent.parent.parent / "connectors"
    registry: dict[str, type] = {}

    # Import the connectors package's REGISTRY (which does the discovery)
    try:
        from connectors import REGISTRY

        # REGISTRY is a lazy dict-like object
        for provider in list(REGISTRY.keys()):
            try:
                cls = REGISTRY[provider]
                registry[provider] = cls
            except Exception:
                continue
    except ImportError:
        # Fallback: manual discovery
        import importlib
        import inspect

        from connectors.base import IConnector

        for module_path in connectors_dir.glob("*.py"):
            module_name = module_path.stem
            if module_name in {"__init__", "base", "rate_limit"}:
                continue
            try:
                module = importlib.import_module(f"connectors.{module_name}")
            except Exception:
                continue
            for _, cls in inspect.getmembers(module, inspect.isclass):
                if cls is IConnector or not issubclass(cls, IConnector):
                    continue
                provider = getattr(cls, "provider", None)
                if isinstance(provider, str) and provider:
                    registry[provider] = cls

    return registry
