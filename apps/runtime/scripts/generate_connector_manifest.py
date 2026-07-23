#!/usr/bin/env python3
"""
Generate connector manifest from runtime connector implementations.

Scans all IConnector implementations, extracts provider names, supported_operations,
and operation schemas. Outputs connectors.manifest.json for use by the Genesis prompt
builder and editor autocomplete.

Usage:
    cd apps/runtime
    python scripts/generate_connector_manifest.py
    # Outputs: ../../packages/schema/connectors.manifest.json
"""

import ast
import json
import sys
from pathlib import Path
from typing import Any


def extract_operations_from_file(file_path: Path) -> dict[str, Any]:
    """Extract operation info from a connector Python file."""
    try:
        content = file_path.read_text(encoding="utf-8")
        tree = ast.parse(content)
    except Exception:
        return {}

    operations: list[dict[str, Any]] = []
    provider_name = file_path.stem

    for node in ast.walk(tree):
        # Look for function definitions that are operations
        if isinstance(node, ast.AsyncFunctionDef) or isinstance(node, ast.FunctionDef):
            name = node.name
            # Skip private methods and base class methods
            if name.startswith("_"):
                continue
            if name in ("connect", "disconnect", "health_check", "validate_config"):
                continue

            # Extract docstring
            docstring = ast.get_docstring(node) or ""

            # Extract parameters
            params = []
            for arg in node.args.args:
                if arg.arg == "self":
                    continue
                param_info = {"name": arg.arg}
                if arg.annotation:
                    param_info["type"] = ast.dump(arg.annotation)
                params.append(param_info)

            operations.append({
                "name": name,
                "description": docstring.split("\n")[0] if docstring else "",
                "parameters": params,
            })

    return {
        "provider": provider_name,
        "operations": operations,
        "operation_count": len(operations),
    }


def scan_connectors(connectors_dir: Path) -> list[dict[str, Any]]:
    """Scan all connector files and extract their operations."""
    results = []

    for py_file in sorted(connectors_dir.glob("*.py")):
        if py_file.name.startswith("_") or py_file.name in ("base.py", "rate_limit.py"):
            continue

        info = extract_operations_from_file(py_file)
        if info and info.get("operations"):
            results.append(info)

    return results


def main():
    # Find the connectors directory
    runtime_dir = Path(__file__).resolve().parent.parent
    connectors_dir = runtime_dir / "connectors"

    if not connectors_dir.exists():
        print(f"Error: Connectors directory not found at {connectors_dir}", file=sys.stderr)
        sys.exit(1)

    # Scan connectors
    connectors = scan_connectors(connectors_dir)

    # Build manifest
    manifest = {
        "version": "1.0.0",
        "generated_at": __import__("datetime").datetime.now().isoformat(),
        "connector_count": len(connectors),
        "connectors": {}
    }

    for connector in connectors:
        provider = connector["provider"]
        manifest["connectors"][provider] = {
            "operations": [
                {
                    "name": op["name"],
                    "description": op["description"],
                    "parameters": op["parameters"],
                }
                for op in connector["operations"]
            ],
            "operation_count": connector["operation_count"],
        }

    # Output path
    output_path = runtime_dir.parent.parent / "packages" / "schema" / "connectors.manifest.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"✅ Generated manifest with {len(connectors)} connectors → {output_path}")

    # Print summary
    total_ops = sum(c["operation_count"] for c in connectors)
    print(f"   Total operations: {total_ops}")
    for c in connectors:
        print(f"   - {c['provider']}: {c['operation_count']} operations")


if __name__ == "__main__":
    main()
