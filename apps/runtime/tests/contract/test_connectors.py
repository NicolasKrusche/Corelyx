"""Parametrized contract tests — one test per connector × operation.

Each test validates a specific operation's contract against the connector's
schema. Uses pytest parametrize for clean, isolated output and CI integration.

Usage:
    pytest tests/contract/test_connectors.py -v
    pytest tests/contract/test_connectors.py -k gmail
    pytest tests/contract/test_connectors.py -k send_email
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest

# Ensure the runtime root is on sys.path for imports
_RUNTIME_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(_RUNTIME_ROOT))

from tests.contract.base import (
    OperationContract,
    ProviderContract,
    discover_connector_classes,
    get_operation_schemas_from_class,
    get_supported_operations_from_class,
    load_all_contracts,
    validate_operation,
)


# ── Build parametrize data ────────────────────────────────────────────────────

def _collect_test_params() -> list[tuple[str, str, dict[str, Any]]]:
    """Collect (provider, operation_name, meta) tuples for parametrization.

    For connectors that can't be imported (missing dependencies), the test
    is still created but marked to skip at runtime.
    """
    contracts = load_all_contracts()
    connectors = discover_connector_classes()

    params: list[tuple[str, str, dict[str, Any]]] = []

    for provider, contract in sorted(contracts.items()):
        connector_cls = connectors.get(provider)
        for op in contract.operations:
            meta = {
                "contract": contract,
                "operation": op,
                "connector_cls": connector_cls,
                "provider": provider,
            }
            params.append((provider, op.name, meta))

    return params


_TEST_PARAMS = _collect_test_params()

# Skip if no contracts found
_skip_reason = "No contract files found or no connectors discovered"


@pytest.mark.parametrize(
    "provider,operation_name,meta",
    _TEST_PARAMS,
    ids=[f"{p}-{op}" for p, op, _ in _TEST_PARAMS] if _TEST_PARAMS else [],
)
def test_operation_contract(
    provider: str,
    operation_name: str,
    meta: dict[str, Any],
) -> None:
    """Validate that a connector operation satisfies its contract.

    Checks:
    1. The operation exists in the connector's schema list
    2. All expected input fields are present
    3. All expected output fields are present
    4. Field types match
    5. Required field flags match
    """
    contract: ProviderContract = meta["contract"]
    op_contract: OperationContract = meta["operation"]
    connector_cls = meta["connector_cls"]

    if connector_cls is None:
        pytest.skip(
            f"Connector class for provider '{provider}' could not be imported "
            f"(missing dependency or import error). Skipping contract validation."
        )

    connector_schemas = get_operation_schemas_from_class(connector_cls)
    connector_ops = get_supported_operations_from_class(connector_cls)

    result = validate_operation(
        op_contract, connector_schemas, connector_cls.__name__,
        connector_supported_ops=connector_ops,
    )

    # Collect all issues into a single assertion message for clarity
    issues: list[str] = []
    for err in result.errors:
        issues.append(f"  ERROR: {err}")
    for warn in result.warnings:
        issues.append(f"  WARN:  {warn}")

    if issues:
        msg = (
            f"\nContract validation failed for {provider}/{operation_name} "
            f"(connector: {connector_cls.__name__}):\n"
            + "\n".join(issues)
        )
        if result.errors:
            pytest.fail(msg)
        # Warnings only — mark as passed but log
        import logging

        logging.getLogger(__name__).warning(msg)


def test_all_contracted_operations_have_schemas() -> None:
    """Verify that every operation listed in a contract is either:
    1. Present in the connector's _operation_schemas (full validation), OR
    2. Present in supported_operations (operation existence only)

    This catches operations added to contracts but not implemented at all.
    """
    contracts = load_all_contracts()
    connectors = discover_connector_classes()

    missing: list[str] = []

    for provider, contract in sorted(contracts.items()):
        connector_cls = connectors.get(provider)
        if connector_cls is None:
            # Skip — connector can't be imported (missing dependency)
            continue

        schemas = get_operation_schemas_from_class(connector_cls)
        schema_names = {s.get("name") for s in schemas}
        supported_ops = get_supported_operations_from_class(connector_cls)

        for op_name in contract.operation_names:
            if op_name not in schema_names and op_name not in supported_ops:
                missing.append(f"{provider}/{op_name}")

    if missing:
        pytest.fail(
            "Operations in contracts without matching connector schemas or operations:\n"
            + "\n".join(f"  - {m}" for m in missing)
        )


def test_connectors_with_no_contracts() -> None:
    """Report connectors that exist but have no contract file.

    This is informational — not a failure — but helps track coverage.
    """
    contracts = load_all_contracts()
    connectors = discover_connector_classes()

    uncovered = sorted(set(connectors.keys()) - set(contracts.keys()))
    if uncovered:
        import logging

        logging.getLogger(__name__).warning(
            "Connectors without contract files (consider adding contracts):\n"
            + "\n".join(f"  - {p}" for p in uncovered)
        )
        # This is not a failure — just informational. Uncomment to enforce:
        # pytest.fail(...)


def test_contract_json_valid() -> None:
    """Validate that all contract JSON files have the required structure."""
    from tests.contract.base import CONTRACTS_DIR, ALLOWED_FIELD_TYPES

    if not CONTRACTS_DIR.exists():
        pytest.skip("contracts/ directory not found")

    errors: list[str] = []

    for contract_file in sorted(CONTRACTS_DIR.glob("*.json")):
        try:
            with open(contract_file) as f:
                data = __import__("json").load(f)
        except Exception as e:
            errors.append(f"{contract_file.name}: Failed to parse JSON: {e}")
            continue

        # Check top-level fields
        if "provider" not in data:
            errors.append(f"{contract_file.name}: Missing 'provider' field")
        if "operations" not in data:
            errors.append(f"{contract_file.name}: Missing 'operations' field")
            continue

        for op in data["operations"]:
            if "name" not in op:
                errors.append(f"{contract_file.name}: Operation missing 'name'")
                continue

            # Validate field types
            for field_list_key in ("input_fields", "output_fields"):
                for field_def in op.get(field_list_key, []):
                    if "name" not in field_def:
                        errors.append(
                            f"{contract_file.name}/{op['name']}: "
                            f"{field_list_key} entry missing 'name'"
                        )
                    ftype = field_def.get("type", "string")
                    if ftype not in ALLOWED_FIELD_TYPES:
                        errors.append(
                            f"{contract_file.name}/{op['name']}: "
                            f"{field_list_key} '{field_def.get('name', '?')}' "
                            f"has invalid type '{ftype}'"
                        )

    if errors:
        pytest.fail(
            "Contract JSON validation errors:\n" + "\n".join(f"  - {e}" for e in errors)
        )
