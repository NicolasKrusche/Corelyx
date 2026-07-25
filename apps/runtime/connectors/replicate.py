"""Replicate connector."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.replicate.com/v1"

# Terminal prediction states in Replicate's async predictions API.
_PREDICTION_TERMINAL = {"succeeded", "failed", "canceled"}
# Bounded client-side polling in case `Prefer: wait` returns before completion
# (the header blocks server-side up to ~60s). Caps total extra wait at ~60s.
_PREDICTION_POLL_INTERVAL_SECONDS = 2.0
_PREDICTION_MAX_POLLS = 30


class ReplicateConnector(IConnector):
    """
    Replicate connector for: run_model, list_models.

    API Base: replicate
    """

    provider = "replicate"
    supported_operations = ["run_model", "list_models"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Replicate operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "run_model":
                    return await self._run_model(client, headers, params)
                case "list_models":
                    return await self._list_models(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Replicate does not support '{operation}'",
                    )

    async def _run_model(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute run_model via Replicate's async predictions API.

        Replicate has no ``/run_model`` endpoint: a run is created by POSTing a
        prediction (``{"version": "<model version id>", "input": {...}}``) to
        ``/v1/predictions`` and then polling until it reaches a terminal state.
        We send ``Prefer: wait`` so the create call blocks server-side until the
        prediction finishes (or ~60s elapses), then poll a bounded number of
        times if it is still running.
        """
        create_headers = {**headers, "Prefer": "wait"}
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/predictions",
            headers=create_headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        prediction = r.json()
        get_url = (prediction.get("urls") or {}).get("get") if isinstance(prediction, dict) else None
        polls = 0
        while (
            isinstance(prediction, dict)
            and prediction.get("status") not in _PREDICTION_TERMINAL
            and get_url
            and polls < _PREDICTION_MAX_POLLS
        ):
            polls += 1
            await asyncio.sleep(_PREDICTION_POLL_INTERVAL_SECONDS)
            poll = await request_with_rate_limit(client, "GET", get_url, headers=headers)
            if poll.status_code >= 400:
                raise ConnectorError("API_ERROR", poll.text)
            prediction = poll.json()

        return prediction

    async def _list_models(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute list_models operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]

        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/models",
            headers=headers,
            params=query_params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        data = r.json()
        return {
            "items": data.get("data", []) or data.get("items", []),
            "total": data.get("total", 0),
        }
