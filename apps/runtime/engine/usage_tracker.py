"""
Usage tracking for the billing system.

After each run completes, records execution_minutes, tokens_used,
estimated_cost_usd, and model into the usage_records table via
Supabase service client.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import structlog
from supabase import create_client, Client

log = structlog.get_logger("engine.usage_tracker")


def _get_db() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


async def track_usage(
    *,
    run_id: str,
    org_id: str | None,
    user_id: str,
    started_at: datetime | None,
    completed_at: datetime | None,
    total_tokens: int,
    prompt_tokens: int,
    completion_tokens: int,
    estimated_cost_usd: float,
    model: str | None = None,
    billing: str = "platform",
) -> None:
    """Record usage for a completed run into usage_records.

    Called from main.py after a run finishes. Best-effort: failures are
    logged but never raise — usage tracking must never break a run.
    """
    if not org_id:
        # No org context — can't track per-org usage.
        return

    try:
        # Calculate execution minutes from timestamps
        execution_minutes = 0.0
        if started_at and completed_at:
            delta = completed_at - started_at
            execution_minutes = round(delta.total_seconds() / 60.0, 4)

        db = _get_db()
        result = db.table("usage_records").insert(
            {
                "org_id": org_id,
                "run_id": run_id,
                "execution_minutes": execution_minutes,
                "tokens_used": total_tokens,
                "model": model or "",
                "billing": billing,
                "estimated_cost_usd": round(estimated_cost_usd, 6),
                "recorded_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()

        if hasattr(result, "error") and result.error:
            log.warning(
                "usage_tracker.insert_failed",
                run_id=run_id,
                error=str(result.error),
            )
        else:
            log.info(
                "usage_tracker.recorded",
                run_id=run_id,
                org_id=org_id,
                execution_minutes=execution_minutes,
                tokens=total_tokens,
                cost_usd=estimated_cost_usd,
                model=model,
                billing=billing,
            )
    except Exception as exc:
        # Best-effort: never crash the run completion path
        log.warning(
            "usage_tracker.exception",
            run_id=run_id,
            error=str(exc),
        )
