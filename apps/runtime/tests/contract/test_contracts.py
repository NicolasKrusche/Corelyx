"""Contract Test Runner — standalone validation of all connectors against their contracts.

Discovers all connector classes, loads matching contract JSON files, validates
each operation's input/output schemas and required fields, and prints a
human-readable report. Exits with code 1 if any contract fails.

Usage:
    python -m tests.contract.test_contracts          # from apps/runtime/
    python -m pytest tests/contract/test_contracts.py  # via pytest
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Ensure the runtime root is on sys.path for imports
_RUNTIME_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(_RUNTIME_ROOT))

from tests.contract.base import (
    ContractReport,
    discover_connector_classes,
    load_all_contracts,
    validate_provider,
)


def run_all_contract_checks() -> list[ContractReport]:
    """Run contract validation for every provider that has both a contract
    JSON file and a discovered connector class.

    Returns a list of ContractReport objects.
    """
    contracts = load_all_contracts()
    connectors = discover_connector_classes()

    reports: list[ContractReport] = []

    for provider, contract in sorted(contracts.items()):
        connector_cls = connectors.get(provider)
        if connector_cls is None:
            # Create a skip notice (not a failure) for missing connectors
            from tests.contract.base import ContractReport as CR, ValidationResult as VR

            report = CR(provider=provider, connector_class="<SKIPPED>")
            r = VR(operation="*", connector_class="<SKIPPED>")
            r.add_warning(
                f"Connector class for provider '{provider}' could not be imported "
                f"(missing dependency). Contract validation skipped."
            )
            report.results.append(r)
            reports.append(report)
            continue

        report = validate_provider(contract, connector_cls)
        reports.append(report)

    return reports


def main() -> int:
    """Entry point for standalone execution. Returns 0 on success, 1 on failure."""
    print("\n" + "=" * 70)
    print("  Corelyx Connector Contract Test Runner")
    print("=" * 70)

    reports = run_all_contract_checks()

    if not reports:
        print("\n  ⚠️  No contract files found in tests/contract/contracts/")
        print("  Create contract JSON files to define expected operation shapes.")
        return 0

    total_operations = 0
    total_passed = 0
    total_failed = 0

    for report in reports:
        print(report.format_report())
        total_operations += report.total
        total_passed += report.pass_count
        total_failed += report.fail_count

    # Summary
    print("=" * 70)
    print(f"  SUMMARY: {total_passed}/{total_operations} operations passed", end="")
    if total_failed > 0:
        print(f"  |  {total_failed} FAILED")
        print(f"  Exit code: 1 (contract violations detected)")
    else:
        print(f"  |  All passed ✅")
        print(f"  Exit code: 0")
    print("=" * 70 + "\n")

    return 1 if total_failed > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
