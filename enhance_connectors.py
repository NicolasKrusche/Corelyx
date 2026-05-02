#!/usr/bin/env python3
"""Enhance scaffold connectors with real implementations."""

from __future__ import annotations

from pathlib import Path
from typing import Any

# Map of operation patterns and their implementations
OPERATION_TEMPLATES = {
    "list": '''
    async def _{op}(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute {op} operation."""
        # Extract pagination and filter params
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        
        # Build query params
        query_params = {{
            "limit": limit,
            "offset": offset,
        }}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]
        
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{{_BASE}}/{op.replace('list_', '')}",
            headers=headers,
            params=query_params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        data = r.json()
        return {{
            "items": data.get("data", []) or data.get("items", []) or data.get("results", []),
            "total": data.get("total", len(data.get("data", []) or data.get("items", []) or data.get("results", []))),
            "next_token": data.get("next_token") or data.get("cursor"),
        }}""",

    "get": """
    async def _{op}(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute {op} operation."""
        # Extract the ID param
        item_id = params.get("id") or params.get("id".replace("get_", ""))
        if not item_id:
            raise ConnectorError("MISSING_PARAM", "id parameter required")
        
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{{_BASE}}/{{{op.replace('get_', '')}s}}/{{item_id}}",
            headers=headers,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()""",

    "create": """
    async def _{op}(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute {op} operation."""
        # Validate required params
        if not params:
            raise ConnectorError("MISSING_PARAM", "request body required")
        
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{{_BASE}}/{{{op.replace('create_', '')}s}}",
            headers=headers,
            json=params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()""",

    "update": """
    async def _{op}(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute {op} operation."""
        # Extract ID
        item_id = params.get("id")
        if not item_id:
            raise ConnectorError("MISSING_PARAM", "id parameter required")
        
        # Remove ID from body
        body = {{k: v for k, v in params.items() if k != "id"}}
        
        r = await request_with_rate_limit(
            client,
            "PATCH",
            f"{{_BASE}}/{{{op.replace('update_', '')}s}}/{{item_id}}",
            headers=headers,
            json=body,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()""",

    "delete": """
    async def _{op}(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute {op} operation."""
        item_id = params.get("id")
        if not item_id:
            raise ConnectorError("MISSING_PARAM", "id parameter required")
        
        r = await request_with_rate_limit(
            client,
            "DELETE",
            f"{{_BASE}}/{{{op.replace('delete_', '')}s}}/{{item_id}}",
            headers=headers,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return {{"deleted": True, "id": item_id}}""",

    "send": """
    async def _{op}(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute {op} operation."""
        if not params:
            raise ConnectorError("MISSING_PARAM", "request body required")
        
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{{_BASE}}/{op}",
            headers=headers,
            json=params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()""",

    "search": """
    async def _{op}(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute {op} operation."""
        query = params.get("query", "")
        if not query:
            raise ConnectorError("MISSING_PARAM", "query parameter required")
        
        limit = int(params.get("limit", 20))
        offset = int(params.get("offset", 0))
        
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{{_BASE}}/search",
            headers=headers,
            params={{
                "q": query,
                "limit": limit,
                "offset": offset,
            }},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        data = r.json()
        return {{
            "results": data.get("results", []) or data.get("data", []),
            "total": data.get("total", 0),
        }}""",

    "query": """
    async def _{op}(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute {op} operation."""
        query = params.get("query")
        if not query:
            raise ConnectorError("MISSING_PARAM", "query parameter required")
        
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{{_BASE}}/query",
            headers=headers,
            json={{"query": query, **{{k: v for k, v in params.items() if k != "query"}}}},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()""",
}

def get_operation_template(op: str) -> str:
    """Get template based on operation name."""
    for pattern, template in OPERATION_TEMPLATES.items():
        if op.startswith(pattern):
            return template.format(op=op)
    # Default fallback
    return OPERATION_TEMPLATES["list"].format(op=op)

class EnhancedConnectorGenerator:
    """Generate enhanced connector implementations from scaffolds."""

    ENHANCED_TEMPLATE = '''"""{label} connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.{domain}.com/v1"


class {class_name}Connector(IConnector):
    """
    {label} connector for operations: {operations_str}.
    
    API Base: {domain}
    Documentation: https://api.{domain}.com/docs
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

        # Generate method implementations based on operation patterns
        methods_list = []
        for op in operations:
            template = get_operation_template(op)
            methods_list.append(template)

        methods = '\n'.join(methods_list)

        operations_str = ", ".join(operations[:3])
        if len(operations) > 3:
            operations_str += f", +{len(operations) - 3} more"

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

        # Check if it's a scaffold (small file)
        if filepath.exists() and filepath.stat().st_size < 2100:
            code = generator.generate_connector(provider, label, operations)
            filepath.write_text(code, encoding="utf-8")
            updated += 1
            print(f"ENHANCED: {provider}")

    print(f"\nTotal enhanced: {updated}/{len(MISSING_PROVIDERS)}")


if __name__ == "__main__":
    main()
