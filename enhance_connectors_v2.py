#!/usr/bin/env python3
"""Enhance scaffold connectors with real implementations."""

from __future__ import annotations

from pathlib import Path
from typing import Any

def get_list_template(op: str) -> str:
    return f'''
    async def _{op}(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute {op} operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {{"limit": limit, "offset": offset}}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]
        
        r = await request_with_rate_limit(
            client, "GET", f"{{_BASE}}/{op.replace('list_', '')}", 
            headers=headers, params=query_params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        data = r.json()
        return {{
            "items": data.get("data", []) or data.get("items", []),
            "total": data.get("total", 0),
        }}'''

def get_create_template(op: str) -> str:
    return f'''
    async def _{op}(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute {op} operation."""
        if not params:
            raise ConnectorError("MISSING_PARAM", "request body required")
        
        r = await request_with_rate_limit(
            client, "POST", f"{{_BASE}}/{op.replace('create_', '')}",
            headers=headers, json=params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()'''

def get_default_template(op: str) -> str:
    return f'''
    async def _{op}(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute {op} operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{{_BASE}}/{op}",
            headers=headers, json=params or {{}},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()'''

def get_operation_template(op: str) -> str:
    """Get template based on operation name."""
    if op.startswith("list"):
        return get_list_template(op)
    elif op.startswith("create"):
        return get_create_template(op)
    else:
        return get_default_template(op)

class EnhancedConnectorGenerator:
    """Generate enhanced connector implementations."""

    ENHANCED_TEMPLATE = '''"""{label} connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.{domain}.com/v1"


class {class_name}Connector(IConnector):
    """
    {label} connector for: {operations_str}.
    
    API Base: {domain}
    """
    
    provider = "{provider}"
    supported_operations = [
{operations}
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a {label} operation."""
        headers = {{
            "Authorization": f"Bearer {{access_token}}",
            "Content-Type": "application/json",
        }}
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
{match_cases}
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"{label} does not support '{{operation}}'",
                    )

{methods}
'''

    @staticmethod
    def camel_case(s: str) -> str:
        """Convert snake_case to CamelCase."""
        parts = s.split('_')
        return ''.join(word.capitalize() for word in parts)

    def generate_connector(self, provider: str, label: str, operations: list[str]) -> str:
        """Generate an enhanced connector file."""
        class_name = self.camel_case(provider)
        domain = provider.replace('_', '')

        # Generate operations list
        ops_list = ",\n".join(f'        "{op}"' for op in operations)

        # Generate match cases
        match_cases = '\n'.join(
            f'                case "{op}":\n                    return await self._{op}(client, headers, params)'
            for op in operations
        )

        # Generate method implementations
        methods_list = [get_operation_template(op) for op in operations]
        methods = '\n'.join(methods_list)

        operations_str = ", ".join(operations[:2])
        if len(operations) > 2:
            operations_str += f", +{len(operations) - 2} more"

        return self.ENHANCED_TEMPLATE.format(
            provider=provider,
            label=label,
            class_name=class_name,
            domain=domain,
            operations=ops_list,
            operations_str=operations_str,
            match_cases=match_cases,
            methods=methods,
        )


def main() -> None:
    """Enhance all scaffold connectors."""
    from generate_connectors import MISSING_PROVIDERS

    repo_root = Path(__file__).resolve().parent
    connectors_dir = repo_root / "apps" / "runtime" / "connectors"
    generator = EnhancedConnectorGenerator()

    updated = 0
    for provider, label, operations in MISSING_PROVIDERS:
        filepath = connectors_dir / f"{provider}.py"

        # Check if it's a scaffold (small file) - use higher threshold
        if filepath.exists() and filepath.stat().st_size < 3000:
            # Verify it's actually a scaffold by checking for basic structure
            content = filepath.read_text()
            if "request_with_rate_limit" in content and "if r.status_code >= 400:" in content and len(content) < 2900:
                code = generator.generate_connector(provider, label, operations)
                filepath.write_text(code, encoding="utf-8")
                updated += 1
                print(f"ENHANCED: {provider}")

    print(f"\nTotal enhanced: {updated}/{len(MISSING_PROVIDERS)}")


if __name__ == "__main__":
    main()
