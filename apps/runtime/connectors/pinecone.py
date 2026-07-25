"""Pinecone connector."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlsplit

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit


def _index_host(params: dict) -> str:
    """Resolve and validate the per-index data-plane host.

    Pinecone's data plane (query/upsert) is NOT served from a single global
    host — every index has its own host (e.g.
    ``my-index-abc123.svc.us-east-1-aws.pinecone.io``) returned by
    ``describe_index`` on the control plane (``api.pinecone.io``). Callers must
    pass that host as ``index_host`` (or ``host``); we refuse anything that is
    not a ``*.pinecone.io`` host so a workflow can't point the credential at an
    arbitrary server.
    """
    raw = str(params.get("index_host") or params.get("host") or "").strip()
    if not raw:
        raise ConnectorError(
            "PINECONE_INDEX_HOST_REQUIRED",
            "Pinecone query_index/upsert_vectors need the per-index host. Pass 'index_host' "
            "(the 'host' value from Pinecone describe_index, e.g. "
            "'my-index-abc123.svc.us-east-1-aws.pinecone.io').",
        )
    host = raw
    if "://" in host:
        host = urlsplit(host).hostname or ""
    else:
        host = host.split("/")[0]
    host = host.strip().rstrip(".")
    if not host.lower().endswith(".pinecone.io"):
        raise ConnectorError(
            "PINECONE_INDEX_HOST_INVALID",
            f"Refusing to send Pinecone request to non-Pinecone host '{raw}'.",
        )
    return host


class PineconeConnector(IConnector):
    """
    Pinecone connector for: query_index, upsert_vectors.

    API Base: pinecone
    """

    provider = "pinecone"
    supported_operations = ["query_index", "upsert_vectors"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Pinecone operation."""
        # Pinecone authenticates with an Api-Key header, not OAuth Bearer.
        headers = {
            "Api-Key": access_token,
            "Content-Type": "application/json",
            "X-Pinecone-API-Version": "2025-01",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "query_index":
                    return await self._query_index(client, headers, params or {})
                case "upsert_vectors":
                    return await self._upsert_vectors(client, headers, params or {})
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Pinecone does not support '{operation}'",
                    )

    async def _query_index(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute query_index operation against the index's data plane."""
        host = _index_host(params)
        # Don't forward the routing-only field to Pinecone's request body.
        body = {k: v for k, v in params.items() if k not in ("index_host", "host")}
        r = await request_with_rate_limit(
            client,
            "POST",
            f"https://{host}/query",
            headers=headers,
            json=body,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()

    async def _upsert_vectors(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute upsert_vectors operation against the index's data plane."""
        host = _index_host(params)
        body = {k: v for k, v in params.items() if k not in ("index_host", "host")}
        r = await request_with_rate_limit(
            client,
            "POST",
            f"https://{host}/vectors/upsert",
            headers=headers,
            json=body,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
