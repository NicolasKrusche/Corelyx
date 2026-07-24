from __future__ import annotations

import asyncio
import contextlib
import json
import os
import sys
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncGenerator, Optional
from urllib.parse import urljoin, urlsplit

import structlog

# ── Sentry initialization (must happen before any other imports) ────────────
_SENTRY_DSN = os.environ.get("SENTRY_DSN", "")
if _SENTRY_DSN:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration

        sentry_sdk.init(
            dsn=_SENTRY_DSN,
            environment=os.environ.get("RAILWAY_ENVIRONMENT", os.environ.get("APP_ENV", "development")),
            traces_sample_rate=0.1,
            profiles_sample_rate=0.1,
            # PII scrubbing — redact sensitive fields before sending to Sentry
            before_send=lambda event, hint: _scrub_pii_from_sentry_event(event),
            integrations=[FastApiIntegration()],
        )
        sentry_sdk.set_tags({"service": "corelyx-runtime"})
    except Exception:
        pass  # Never let Sentry init crash the runtime


def _scrub_pii_from_sentry_event(event: dict) -> dict | None:
    """Redact tokens, secrets, and passwords from Sentry events."""
    sensitive_keys = {
        "password", "token", "secret", "api_key", "apiKey",
        "access_token", "accessToken", "authorization",
        "SUPABASE_SERVICE_ROLE_KEY", "STRIPE_SECRET_KEY",
        "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
    }
    # Scrub request headers
    if event.get("request", {}).get("headers"):
        for key in list(event["request"]["headers"].keys()):
            if key.lower() in ("authorization", "cookie", "x-internal-service-token"):
                event["request"]["headers"][key] = "[REDACTED]"
    # Scrub exception values
    for exc in event.get("exception", {}).get("values", []) or []:
        if exc.get("value"):
            import re
            exc["value"] = (
                re.sub(r"Bearer\s+[^\s\"]+", "Bearer [REDACTED]", exc["value"])
                .replace(re.findall(r"sk-[a-zA-Z0-9]{20,}", exc["value"])[0] if re.findall(r"sk-[a-zA-Z0-9]{20,}", exc["value"]) else "", "sk-[REDACTED]")
            )
    # Scrub extra/context fields
    for container in ("extra", "contexts"):
        if event.get(container):
            for key in list(event[container].keys()):
                if any(sk in key.lower() for sk in sensitive_keys):
                    event[container][key] = "[REDACTED]"
                elif isinstance(event[container][key], dict):
                    for subkey in list(event[container][key].keys()):
                        if any(sk in subkey.lower() for sk in sensitive_keys):
                            event[container][key][subkey] = "[REDACTED]"
    return event
from apscheduler.schedulers.asyncio import AsyncIOScheduler
# Force UTF-8 stdout/stderr on Windows so Unicode chars in log output don't crash
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from cors_config import (
    CORS_ALLOWED_HEADERS,
    CORS_ALLOWED_METHODS,
    get_cors_allowed_origins,
    is_production_environment,
)
from db import (
    get_db,
    get_model_access_tier,
    get_user_priority_tier,
    get_user_run_plan,
    is_processing_restricted,
    release_run_locks,
    update_run,
)
from connectors.introspection import (
    IntrospectionError,
    introspect_connection,
    supports_introspection,
)
from engine.executor import ExecutionError, ProgramExecutor, close_llm_client
from engine.circuit_breaker import list_known_circuits, reset_all_circuits
from engine.usage_tracker import track_usage
from compliance import (
    load_program_connection_providers,
    load_workspace_policy,
    validate_schema_policy,
)
from internal_auth import (
    INTERNAL_SERVICE_TOKEN_HEADER,
    _get_internal_service_secret,
    build_internal_service_headers,
    verify_internal_service_token,
    verify_internal_service_token_claims,
)
from schema import ProgramSchema, parse_schema

load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"), override=True)

log = structlog.get_logger("runtime.main")


# Validate required auth secrets at startup so misconfiguration surfaces in
# Railway logs immediately rather than silently on the first execute request.
_REQUIRED_SECRETS = [
    "runtime:execute",  # web → runtime (inbound)
    "runtime:introspect",  # web → runtime (Genesis connection introspection)
    "next:runs:complete",  # runtime → web (run completion callback)
    "next:connections:token",  # runtime → web (OAuth token fetch)
    "next:vault",  # runtime → web (Vault secret fetch)
    "next:credits",  # runtime → web (credit deduction)
    "next:agent-tools",  # runtime → web (agent_task account tools)
    "next:cron:tick",  # runtime → web (cron scheduler heartbeat)
]
for _audience in _REQUIRED_SECRETS:
    try:
        _get_internal_service_secret(_audience)
        print(f"[runtime] Auth config OK: secret for '{_audience}' is set")
    except RuntimeError as _exc:
        print(f"[runtime] WARNING: {_exc} — set this variable in both Railway and Vercel to the same value")

_nextjs_url = os.environ.get("NEXTJS_INTERNAL_URL", "").strip()
if not _nextjs_url or "localhost" in _nextjs_url:
    # In production this isn't just a misconfiguration warning: the cron
    # heartbeat (_cron_tick) and OAuth token fetches silently target
    # localhost inside the container — nothing listens there, so cron
    # triggers never fire and there's no other startup signal. Route this to
    # stderr at ERROR level in production so it doesn't get lost in stdout.
    _prod = is_production_environment()
    print(
        f"[runtime] {'ERROR' if _prod else 'WARNING'}: NEXTJS_INTERNAL_URL={_nextjs_url!r} — "
        "set this to your Vercel deployment URL in Railway or the cron heartbeat and OAuth token fetches will fail",
        file=sys.stderr if _prod else sys.stdout,
    )
else:
    print(f"[runtime] NEXTJS_INTERNAL_URL={_nextjs_url}")

scheduler = AsyncIOScheduler()


def _retention_expiry(policy: dict[str, Any]) -> str:
    try:
        retention_days = max(1, int(policy.get("execution_log_retention_days") or 90))
    except (TypeError, ValueError):
        retention_days = 90
    return (datetime.now(timezone.utc) + timedelta(days=retention_days)).isoformat()


def parse_cron(expression: str) -> dict:
    """Split a 5-field cron string into APScheduler kwargs."""
    fields = expression.strip().split()
    if len(fields) != 5:
        raise ValueError(f"Expected 5-field cron expression, got: {expression!r}")
    minute, hour, day, month, day_of_week = fields
    return {
        "minute": minute,
        "hour": hour,
        "day": day,
        "month": month,
        "day_of_week": day_of_week,
    }


async def trigger_workflow(workflow_id: str) -> None:
    db = get_db()
    result = db.table("programs").select("*").eq("id", workflow_id).single().execute()
    program_data = result.data
    if not program_data:
        return
    schema = parse_schema(program_data.get("schema") or {})
    workspace_policy = load_workspace_policy(db, program_data.get("workspace_id"))
    retention_expiry = _retention_expiry(workspace_policy)
    run_result = (
        db.table("runs")
        .insert(
            {
                "program_id": workflow_id,
                "triggered_by": "cron",
                "trigger_payload": None,
                "status": "running",
                "started_at": "now()",
                "user_id": program_data.get("user_id"),
                "workflow_version": program_data.get("schema_version") or 1,
                "trigger_source": "cron",
                "data_region": workspace_policy.get("data_region"),
                "retention_expiry": retention_expiry,
            }
        )
        .execute()
    )
    run_id = run_result.data[0]["id"]
    user_id = program_data.get("user_id", "")
    if user_id and is_processing_restricted(db, user_id):
        await update_run(
            db,
            run_id,
            status="failed",
            error_message="Processing is restricted for this account.",
            data_region=workspace_policy.get("data_region"),
            retention_expiry=retention_expiry,
            completed_at="now()",
        )
        await _notify_complete(run_id, workflow_id, user_id, "failed", "Processing is restricted for this account.")
        return
    final_status = "failed"
    error_message: str | None = None
    executor: ProgramExecutor | None = None
    try:
        connection_providers = load_program_connection_providers(db, workflow_id)
        policy_blocks = validate_schema_policy(
            schema,
            workspace_policy.get("compliance_mode", "standard"),
            connection_providers,
        )
        if policy_blocks:
            await update_run(
                db,
                run_id,
                status="failed",
                error_message=policy_blocks[0]["reason"],
                policy_checks={"runtime_policy": "blocked"},
                block_warning_reasons=policy_blocks,
                data_region=workspace_policy.get("data_region"),
                retention_expiry=retention_expiry,
                completed_at="now()",
            )
            await _notify_complete(run_id, workflow_id, user_id, "failed", policy_blocks[0]["reason"])
            return
        executor = ProgramExecutor(
            schema,
            run_id,
            workflow_id,
            user_id,
            plan=get_user_run_plan(db, user_id),
            model_access_tier=get_model_access_tier(db, user_id, program_data.get("workspace_id")),
            workspace_id=program_data.get("workspace_id"),
            compliance_mode=workspace_policy.get("compliance_mode", "standard"),
            data_region=workspace_policy.get("data_region"),
            execution_log_retention_days=workspace_policy.get("execution_log_retention_days", 90),
            pii_mode=workspace_policy.get("pii_mode", "auto"),
        )
        async with _acquire_run_slot(get_user_priority_tier(db, user_id)):
            await executor.execute(None)
        final_status = "completed"
    except ExecutionError as e:
        error_message = e.message
    except Exception as e:
        error_message = str(e)
    finally:
        telemetry = executor.run_telemetry_payload() if executor else {}
        await update_run(
            db,
            run_id,
            status=final_status,
            error_message=error_message,
            completed_at="now()",
            data_region=workspace_policy.get("data_region"),
            retention_expiry=retention_expiry,
            **telemetry,
        )
        await release_run_locks(db, run_id)
        # Track billing usage for cron-triggered runs
        if executor and telemetry:
            try:
                org_id_val: str | None = None
                if program_data.get("workspace_id"):
                    ws_data = db.table("workspaces").select("org_id").eq("id", program_data["workspace_id"]).maybeSingle().execute()
                    if ws_data.data:
                        org_id_val = ws_data.data.get("org_id")
                if not org_id_val:
                    prof_data = db.table("profiles").select("org_id").eq("id", user_id).maybeSingle().execute()
                    if prof_data.data:
                        org_id_val = prof_data.data.get("org_id")
                await track_usage(
                    run_id=run_id,
                    org_id=org_id_val,
                    user_id=user_id,
                    started_at=datetime.now(timezone.utc) - timedelta(seconds=60),
                    completed_at=datetime.now(timezone.utc),
                    total_tokens=telemetry.get("total_tokens", 0),
                    prompt_tokens=telemetry.get("prompt_tokens", 0),
                    completion_tokens=telemetry.get("completion_tokens", 0),
                    estimated_cost_usd=telemetry.get("estimated_cost_usd", 0.0),
                    model=None,
                    billing="platform",
                )
            except Exception:
                pass
        await _notify_complete(run_id, workflow_id, user_id, final_status, error_message)


# ── Cron heartbeat: runtime → web ────────────────────────────────────────────
# The web app owns cron-trigger state (next_run_at, limits, dispatch) but has no
# always-on process; this runtime does. Every 60s we call the web's internal
# tick endpoint, which fires all due cron triggers via an atomically-claimed
# sweep (safe to overlap with the Inngest scheduler when that is configured).

_cron_tick_failures = 0
_cron_tick_last_success_at: datetime | None = None

# Consecutive failed ticks (~1/min) before /health flips to unhealthy so
# Railway's healthcheck/restart policy actually reacts instead of staying
# green through a total, indefinite heartbeat outage.
_HEARTBEAT_UNHEALTHY_THRESHOLD = 5


def _cron_tick_endpoint(configured_url: str, path: str) -> str:
    """Build the internal endpoint from the configured origin, never a stray path."""
    parsed = urlsplit(configured_url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise RuntimeError("NEXTJS_INTERNAL_URL must be an absolute http(s) URL")
    return f"{parsed.scheme}://{parsed.netloc}{path}"


def _safe_cron_redirect(source_url: str, location: str, path: str) -> str | None:
    """Allow one same-site canonical redirect without leaking the scoped token."""
    target_url = urljoin(source_url, location)
    source = urlsplit(source_url)
    target = urlsplit(target_url)
    if target.scheme not in {source.scheme, "https"}:
        return None
    if source.scheme == "https" and target.scheme != "https":
        return None
    if target.username or target.password or target.query or target.fragment or target.path != path:
        return None
    source_host = (source.hostname or "").lower().removeprefix("www.")
    target_host = (target.hostname or "").lower().removeprefix("www.")
    if not source_host or source_host != target_host:
        return None
    source_port = source.port or (443 if source.scheme == "https" else 80)
    target_port = target.port or (443 if target.scheme == "https" else 80)
    if source.scheme == target.scheme and source_port != target_port:
        return None
    if source.scheme == "http" and target.scheme == "https" and source_port != 80:
        return None
    return target_url


async def _cron_tick() -> None:
    global _cron_tick_failures, _cron_tick_last_success_at
    nextjs_url = os.environ.get("NEXTJS_INTERNAL_URL", "http://localhost:3000")
    path = "/api/internal/cron/tick"
    body = "{}"
    try:
        import httpx

        # Production may canonicalize the configured app URL (for example,
        # apex -> www) with a 307/308. Follow only one validated same-site
        # redirect so the scoped internal token can never be forwarded to an
        # arbitrary host supplied by a redirect response.
        # The web sweep has its own 45s deadline.  Leave enough headroom for
        # the response and redirect round-trip without reaching the route's
        # 60s serverless ceiling.
        endpoint = _cron_tick_endpoint(nextjs_url, path)
        auth_headers = build_internal_service_headers(
            "next:cron:tick",
            subject="runtime-scheduler",
            method="POST",
            path=path,
            body=body,
        )
        async with httpx.AsyncClient(timeout=55, follow_redirects=False) as client:
            res = await client.post(endpoint, headers=auth_headers, content=body)
            if res.status_code in {307, 308}:
                redirect_target = _safe_cron_redirect(
                    endpoint,
                    res.headers.get("location", ""),
                    path,
                )
                if not redirect_target:
                    raise RuntimeError("Cron heartbeat rejected an unsafe redirect")
                res = await client.post(redirect_target, headers=auth_headers, content=body)
        if res.status_code != 200:
            raise RuntimeError(f"HTTP {res.status_code}: {res.text[:200]}")
        if _cron_tick_failures > 0:
            print(f"[runtime] Cron heartbeat recovered after {_cron_tick_failures} failed tick(s)")
        _cron_tick_failures = 0
        _cron_tick_last_success_at = datetime.now(timezone.utc)
        data = res.json()
        if isinstance(data, dict) and data.get("fired"):
            print(f"[runtime] Cron tick fired {data['fired']} trigger(s)")
    except Exception as exc:  # log the first failure and then every 10th, not every minute
        _cron_tick_failures += 1
        if _cron_tick_failures == 1 or _cron_tick_failures % 10 == 0:
            unhealthy = _cron_tick_failures >= _HEARTBEAT_UNHEALTHY_THRESHOLD
            print(
                f"[runtime] {'ERROR' if unhealthy else 'WARNING'}: Cron heartbeat failed "
                f"({_cron_tick_failures}x consecutive): {exc}",
                file=sys.stderr if unhealthy else sys.stdout,
            )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # The web sweep is the single owner of cron state, entitlements, atomic
    # claiming, and dispatch.  Do not also register per-workflow APScheduler
    # jobs here: that legacy path reads an obsolete schema shape and bypasses
    # the web controls; for old schemas it can also double-fire alongside the
    # heartbeat/Inngest sweep.
    scheduler.add_job(
        _cron_tick,
        "interval",
        seconds=60,
        max_instances=1,
        coalesce=True,
        id="cron-heartbeat",
        replace_existing=True,
    )
    scheduler.start()
    yield
    await close_llm_client()
    scheduler.shutdown(wait=False)


app = FastAPI(title="Corelyx Runtime", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_allowed_origins(),
    allow_methods=CORS_ALLOWED_METHODS,
    allow_headers=CORS_ALLOWED_HEADERS,
    allow_credentials=True,
)


class ExecuteRequest(BaseModel):
    model_config = {"populate_by_name": True}

    run_id: str
    # The remaining fields are accepted for backward compatibility but are NOT
    # trusted (S15). The runtime loads program_id, user_id, and the schema
    # from the runs/programs rows keyed by run_id and ignores anything the
    # caller put in body.{program_id,user_id,schema}.
    program_id: Optional[str] = None
    user_id: Optional[str] = None
    # "schema" shadows BaseModel.schema in Pydantic v2 — use alias to avoid the warning.
    workflow_schema: Optional[dict[str, Any]] = Field(default=None, alias="schema")
    trigger_payload: Optional[dict[str, Any]] = None
    triggered_by: str = "manual"
    # Maps connection name → connection UUID; populated by Next.js for manual/event runs.
    # Cron-triggered runs omit this and the executor falls back to a DB lookup.
    connections: dict[str, str] = {}


# S15: terminal run states reject re-dispatch. "paused" runs may be resumed,
# but a separate skip-trigger flow handles that — cold /execute should not.
_DISPATCHABLE_RUN_STATUSES = {"running", "pending"}

# ─── Priority execution queue (Scale tier) ─────────────────────────────────
# There is no queue/worker-pool infra otherwise — runs dispatch essentially
# immediately via BackgroundTasks. Concurrency is UNBOUNDED by default
# (RUNTIME_MAX_CONCURRENT_RUNS=0): an idle semaphore slot costs nothing, but a
# low cap does — it would throttle real traffic that previously ran fine
# unthrottled. Set RUNTIME_MAX_CONCURRENT_RUNS to a positive number to opt
# into a ceiling (e.g. to protect the box from a runaway/malicious loop); only
# then does the reserved priority pool mean anything, since only then can
# standard-tier runs actually queue for Scale-tier runs to skip ahead of.
_MAX_CONCURRENT_RUNS = int(os.environ.get("RUNTIME_MAX_CONCURRENT_RUNS", "0"))
_PRIORITY_RESERVED_SLOTS = (
    min(int(os.environ.get("RUNTIME_PRIORITY_RESERVED_SLOTS", "8")), max(_MAX_CONCURRENT_RUNS - 1, 1))
    if _MAX_CONCURRENT_RUNS > 0
    else 0
)
_standard_run_slots = (
    asyncio.Semaphore(max(_MAX_CONCURRENT_RUNS - _PRIORITY_RESERVED_SLOTS, 1)) if _MAX_CONCURRENT_RUNS > 0 else None
)
_priority_run_slots = asyncio.Semaphore(_PRIORITY_RESERVED_SLOTS) if _MAX_CONCURRENT_RUNS > 0 else None


@asynccontextmanager
async def _acquire_run_slot(is_priority: bool) -> AsyncGenerator[None, None]:
    """No-op when concurrency is unbounded (the default); otherwise acquires
    from the priority or standard pool per _MAX_CONCURRENT_RUNS above."""
    if _MAX_CONCURRENT_RUNS <= 0:
        yield
        return
    slots = _priority_run_slots if is_priority else _standard_run_slots
    async with slots:  # type: ignore[union-attr]
        yield


@app.post("/execute")
async def execute_program(
    request: Request,
    background_tasks: BackgroundTasks,
    x_internal_service_token: str | None = Header(default=None, alias=INTERNAL_SERVICE_TOKEN_HEADER),
) -> dict[str, str]:
    raw_body = await request.body()
    req_start = time.monotonic()
    if not x_internal_service_token:
        log.warning("execute.missing_token")
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        has_valid_token = verify_internal_service_token(
            x_internal_service_token,
            "runtime:execute",
            method=request.method,
            path=request.url.path,
            body=raw_body,
        )
    except RuntimeError as exc:
        if "INTERNAL_SERVICE_AUTH_SECRET_RUNTIME_EXECUTE" in str(exc):
            print(f"[runtime] Execute auth misconfigured: {exc}")
            raise HTTPException(
                status_code=500,
                detail="Runtime auth is not configured",
            )
        raise

    if not has_valid_token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        body = ExecuteRequest.model_validate_json(raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid execute payload")

    # S15: load run + program from the DB. The caller-supplied schema/user_id
    # are ignored — a leaked runtime:execute token can no longer execute
    # arbitrary code as an arbitrary user.
    db = get_db()
    run_lookup = db.table("runs").select("id, program_id, status").eq("id", body.run_id).limit(1).execute()
    run_rows = run_lookup.data or []
    if not run_rows:
        raise HTTPException(status_code=404, detail="Run not found")
    run_row = run_rows[0]
    if run_row.get("status") not in _DISPATCHABLE_RUN_STATUSES:
        raise HTTPException(status_code=409, detail="Run is not dispatchable")

    program_id_db: str = run_row["program_id"]
    program_lookup = (
        db.table("programs")
        .select("id, user_id, schema, workspace_id, schema_version")
        .eq("id", program_id_db)
        .limit(1)
        .execute()
    )
    program_rows = program_lookup.data or []
    if not program_rows:
        raise HTTPException(status_code=404, detail="Program not found")
    program_row = program_rows[0]
    user_id_db: str = program_row["user_id"]
    if is_processing_restricted(db, user_id_db):
        raise HTTPException(
            status_code=423,
            detail="Processing is restricted for this account.",
        )
    schema = parse_schema(program_row.get("schema") or {})
    workspace_policy = load_workspace_policy(db, program_row.get("workspace_id"))
    connection_providers = load_program_connection_providers(db, program_id_db)
    policy_blocks = validate_schema_policy(
        schema,
        workspace_policy.get("compliance_mode", "standard"),
        connection_providers,
    )
    if policy_blocks:
        await update_run(
            db,
            body.run_id,
            status="failed",
            error_message=policy_blocks[0]["reason"],
            user_id=user_id_db,
            workflow_version=program_row.get("schema_version") or 1,
            trigger_source=body.triggered_by,
            data_region=workspace_policy.get("data_region"),
            retention_expiry=_retention_expiry(workspace_policy),
            policy_checks={"runtime_policy": "blocked"},
            block_warning_reasons=policy_blocks,
            completed_at="now()",
        )
        raise HTTPException(status_code=422, detail=policy_blocks[0]["reason"])

    background_tasks.add_task(
        _run_program_gated,
        schema,
        body.run_id,
        program_id_db,
        user_id_db,
        body.trigger_payload,
        body.connections,
        program_row.get("workspace_id"),
        workspace_policy,
        is_priority=get_user_priority_tier(db, user_id_db),
    )
    return {"status": "started", "run_id": body.run_id}


class IntrospectRequest(BaseModel):
    connection_ids: list[str] = Field(min_length=1, max_length=20)


@app.post("/introspect")
async def introspect_connections(
    request: Request,
    x_internal_service_token: str | None = Header(default=None, alias=INTERNAL_SERVICE_TOKEN_HEADER),
) -> dict[str, Any]:
    """Genesis V2: metadata-only capability introspection for selected connections.

    Returns structure (labels, channels, database schemas) — never record
    contents. The web app pseudonymizes user-named strings before any LLM
    prompt; nothing is persisted here.
    """
    raw_body = await request.body()
    if not x_internal_service_token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        claims = verify_internal_service_token_claims(
            x_internal_service_token,
            "runtime:introspect",
            method=request.method,
            path=request.url.path,
            body=raw_body,
        )
    except RuntimeError as exc:
        if "INTERNAL_SERVICE_AUTH_SECRET_RUNTIME_INTROSPECT" in str(exc):
            print(f"[runtime] Introspect auth misconfigured: {exc}")
            raise HTTPException(status_code=500, detail="Runtime auth is not configured")
        raise

    if claims is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        body = IntrospectRequest.model_validate_json(raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid introspect payload")

    # Ownership check: only introspect valid connections belonging to the token
    # subject — a leaked token cannot enumerate other users' account structure.
    db = get_db()
    rows = (
        db.table("connections").select("id, provider, user_id, is_valid").in_("id", body.connection_ids).execute()
    ).data or []
    rows_by_id = {row["id"]: row for row in rows}

    async def _introspect_one(connection_id: str) -> tuple[str, dict[str, Any] | None, str | None]:
        row = rows_by_id.get(connection_id)
        if row is None or row.get("user_id") != user_id or not row.get("is_valid"):
            return connection_id, None, "CONNECTION_NOT_FOUND"
        provider = str(row.get("provider") or "")
        if not supports_introspection(provider):
            return connection_id, None, "UNSUPPORTED_PROVIDER"
        try:
            descriptor = await introspect_connection(provider, connection_id, user_id)
            return connection_id, descriptor, None
        except IntrospectionError as e:
            # Include the provider's error text (e.g. "missing_scope",
            # "invalid_auth") — it's an API status string, not user data, and it
            # is the actionable detail for why a connection could not introspect.
            print(f"[runtime] Introspection failed for {connection_id} ({provider}): {e.code} — {e.message}")
            return connection_id, None, e.code
        except Exception as e:
            print(f"[runtime] Introspection failed for {connection_id} ({provider}): {type(e).__name__}")
            return connection_id, None, "INTROSPECTION_FAILED"

    results = await asyncio.gather(*(_introspect_one(cid) for cid in body.connection_ids))

    descriptors = [descriptor for _, descriptor, _ in results if descriptor is not None]
    errors = {cid: code for cid, _, code in results if code is not None}
    return {"descriptors": descriptors, "errors": errors}


RUN_TIMEOUT_SECONDS = 600  # 10 minutes max *active* execution per run (plan tiers may raise this — see RunLimiter)
_WATCHDOG_POLL_SECONDS = 5.0


async def _run_with_active_timeout(executor: ProgramExecutor, trigger_payload: Optional[dict[str, Any]]) -> None:
    """Run executor.execute(), bounding only *active* execution time.

    A flat asyncio.wait_for around the whole run would also kill a workflow
    that's correctly, harmlessly blocked on a Human Approval gate, an agent
    corelyx.ask_user question, or a desktop file-operation wait — those
    suspend/resume points pause the executor's RunLimiter clock (see
    ProgramExecutor.is_paused_for_human_input) and have their own, much
    longer, independently-enforced timeouts (approval_timeout_hours,
    FILE_OPERATION_TIMEOUT_SECONDS). This watchdog only cancels the run for
    time spent *outside* those waits — e.g. a single node hung on a stuck
    network call — which per-node RunLimiter checks can't catch on their own.
    """
    task = asyncio.ensure_future(executor.execute(trigger_payload))
    try:
        while True:
            done, _pending = await asyncio.wait({task}, timeout=_WATCHDOG_POLL_SECONDS)
            if task in done:
                return task.result()
            limit = executor.active_execution_limit_seconds()
            if (
                limit is not None
                and not executor.is_paused_for_human_input()
                and executor.active_execution_seconds() > limit
            ):
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task
                raise asyncio.TimeoutError(f"Run exceeded maximum active execution time ({limit}s)")
    except asyncio.CancelledError:
        task.cancel()
        raise


async def _notify_complete(
    run_id: str, program_id: str, user_id: str, status: str, error_message: str | None = None
) -> None:
    """Notify Next.js that a run has finished — fires inter-program triggers
    and, on failure, the run-failure email (which needs error_message to say
    anything more useful than "your run failed")."""
    nextjs_url = os.environ.get("NEXTJS_INTERNAL_URL", "http://localhost:3000")
    try:
        import httpx

        body = json.dumps(
            {
                "program_id": program_id,
                "user_id": user_id,
                "status": status,
                **({"error_message": error_message} if error_message else {}),
            },
            separators=(",", ":"),
        )
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                f"{nextjs_url}/api/internal/runs/{run_id}/complete",
                headers=build_internal_service_headers(
                    "next:runs:complete",
                    subject=user_id,
                    method="POST",
                    path=f"/api/internal/runs/{run_id}/complete",
                    body=body,
                ),
                content=body,
            )
    except Exception as e:
        print(f"[runtime] Warning: could not notify completion for run {run_id}: {e}")


async def _run_program(
    schema: ProgramSchema,
    run_id: str,
    program_id: str,
    user_id: str,
    trigger_payload: Optional[dict[str, Any]],
    connection_name_to_id: dict[str, str] | None = None,
    workspace_id: str | None = None,
    workspace_policy: dict[str, Any] | None = None,
) -> None:
    db = get_db()
    final_status = "failed"
    error_message: str | None = None
    policy = workspace_policy or load_workspace_policy(db, workspace_id)
    executor = ProgramExecutor(
        schema,
        run_id,
        program_id,
        user_id,
        connection_name_to_id=connection_name_to_id,
        plan=get_user_run_plan(db, user_id),
        model_access_tier=get_model_access_tier(db, user_id, workspace_id),
        workspace_id=workspace_id,
        compliance_mode=policy.get("compliance_mode", "standard"),
        data_region=policy.get("data_region"),
        execution_log_retention_days=policy.get("execution_log_retention_days", 90),
        pii_mode=policy.get("pii_mode", "auto"),
        bulk_write_approval_threshold=policy.get("bulk_write_approval_threshold", 25),
    )
    try:
        await _run_with_active_timeout(executor, trigger_payload)
        final_status = "completed"
    except asyncio.TimeoutError as e:
        error_message = str(e) or f"Run exceeded maximum execution time ({RUN_TIMEOUT_SECONDS}s)"
    except ExecutionError as e:
        error_message = e.message
    except Exception as e:
        error_message = str(e)
    finally:
        await update_run(
            db,
            run_id,
            status=final_status,
            error_message=error_message,
            completed_at="now()",
            data_region=policy.get("data_region"),
            retention_expiry=executor.retention_expiry,
            **executor.run_telemetry_payload(),
        )
        await release_run_locks(db, run_id)
        # Track billing usage for this run
        telemetry = executor.run_telemetry_payload()
        started_at_val = None
        try:
            run_data = (
                db.table("runs")
                .select("started_at")
                .eq("id", run_id)
                .maybeSingle()
                .execute()
            )
            if run_data.data and run_data.data.get("started_at"):
                started_at_val = datetime.fromisoformat(
                    run_data.data["started_at"].replace("Z", "+00:00")
                )
        except Exception:
            pass
        # Resolve org_id from workspace or profile
        org_id_val: str | None = None
        if workspace_id:
            try:
                ws_data = (
                    db.table("workspaces")
                    .select("org_id")
                    .eq("id", workspace_id)
                    .maybeSingle()
                    .execute()
                )
                if ws_data.data:
                    org_id_val = ws_data.data.get("org_id")
            except Exception:
                pass
        if not org_id_val:
            try:
                prof_data = (
                    db.table("profiles")
                    .select("org_id")
                    .eq("id", user_id)
                    .maybeSingle()
                    .execute()
                )
                if prof_data.data:
                    org_id_val = prof_data.data.get("org_id")
            except Exception:
                pass
        # Determine billing mode (byok if user has own key configured)
        billing_mode = "platform"
        try:
            prof_tier = (
                db.table("profiles")
                .select("tier")
                .eq("id", user_id)
                .maybeSingle()
                .execute()
            )
            if prof_tier.data and prof_tier.data.get("tier") in ("byok", "builder"):
                billing_mode = "byok"
        except Exception:
            pass
        try:
            await track_usage(
                run_id=run_id,
                org_id=org_id_val,
                user_id=user_id,
                started_at=started_at_val,
                completed_at=datetime.now(timezone.utc),
                total_tokens=telemetry.get("total_tokens", 0),
                prompt_tokens=telemetry.get("prompt_tokens", 0),
                completion_tokens=telemetry.get("completion_tokens", 0),
                estimated_cost_usd=telemetry.get("estimated_cost_usd", 0.0),
                model=None,
                billing=billing_mode,
            )
        except Exception:
            pass  # Best-effort: never block run completion
        # Notify Next.js — fires inter-program triggers for completed runs
        await _notify_complete(run_id, program_id, user_id, final_status, error_message)

        # Structured logging for run completion/failure events
        telemetry = executor.run_telemetry_payload()
        run_event = {
            "event": f"run_{final_status}",
            "run_id": run_id,
            "program_id": program_id,
            "user_id": user_id,
            "status": final_status,
            "total_tokens": telemetry.get("total_tokens", 0),
            "prompt_tokens": telemetry.get("prompt_tokens", 0),
            "completion_tokens": telemetry.get("completion_tokens", 0),
            "estimated_cost_usd": telemetry.get("estimated_cost_usd", 0.0),
            "model_call_count": telemetry.get("model_call_count", 0),
            "connector_api_calls": telemetry.get("connector_api_calls", 0),
        }
        if error_message:
            run_event["error_message"] = error_message[:500]
        if final_status == "completed":
            log.info("run_completed", **run_event)
        else:
            log.error("run_failed", **run_event)

        # Emit metrics to the metrics table for aggregation
        try:
            db.table("metrics").insert({
                "metric_name": f"run_{final_status}",
                "value": telemetry.get("estimated_cost_usd", 0.0),
                "tags": {
                    "run_id": run_id,
                    "program_id": program_id,
                    "user_id": user_id,
                    "total_tokens": telemetry.get("total_tokens", 0),
                    "model_call_count": telemetry.get("model_call_count", 0),
                    "status": final_status,
                },
            }).execute()
        except Exception:
            pass  # Best-effort: never block run completion


async def _run_program_gated(
    schema: ProgramSchema,
    run_id: str,
    program_id: str,
    user_id: str,
    trigger_payload: Optional[dict[str, Any]],
    connection_name_to_id: dict[str, str] | None = None,
    workspace_id: str | None = None,
    workspace_policy: dict[str, Any] | None = None,
    is_priority: bool = False,
) -> None:
    """Runs _run_program behind the concurrency gate (see _acquire_run_slot
    above). No-op unless RUNTIME_MAX_CONCURRENT_RUNS is set; when it is,
    priority runs draw from their own reserved pool so they're never queued
    behind standard-tier congestion."""
    async with _acquire_run_slot(is_priority):
        await _run_program(
            schema,
            run_id,
            program_id,
            user_id,
            trigger_payload,
            connection_name_to_id,
            workspace_id,
            workspace_policy,
        )


# Railway injects RAILWAY_GIT_COMMIT_SHA at build time. The others are fallbacks
# for other hosts / local runs. Resolved once at import — it cannot change while
# the process lives, and a miss must not cost a syscall per health check.
_DEPLOYED_COMMIT = (
    os.environ.get("RAILWAY_GIT_COMMIT_SHA")
    or os.environ.get("GIT_COMMIT_SHA")
    or os.environ.get("SOURCE_COMMIT")
    or os.environ.get("VERCEL_GIT_COMMIT_SHA")
    or ""
)


@app.get("/health")
async def health() -> JSONResponse:
    """Liveness, plus which commit is actually serving and cron heartbeat health.

    This used to return {"status": "ok"} alone, which made "did the redeploy
    land?" unanswerable without digging through host logs — and several fixes
    have sat unnoticed behind a stale deploy because of it. `commit` is a short
    SHA so it can be diffed against origin/main directly:

        curl -s $RUNTIME_URL/health | jq -r .commit
        git rev-parse --short=12 origin/main

    It also reports the cron heartbeat's health. The heartbeat (_cron_tick)
    calls the web app every 60s to fire due cron triggers; if NEXTJS_INTERNAL_URL
    is misconfigured (e.g. falls back to localhost inside the container) those
    calls fail with nothing listening on the other end and cron-triggered
    workflows silently never run. Once failures cross the threshold this
    returns 503 so Railway's own healthcheck/restart policy actually reacts
    instead of staying green through an indefinite heartbeat outage.

    Deliberately no error text or configured URLs in the payload: this route is
    public and unauthenticated, so it reports what is running, never how it is
    configured. "unknown" means the host injected no commit env var (e.g. a
    local runtime), not that it is stale.
    """
    heartbeat_unhealthy = _cron_tick_failures >= _HEARTBEAT_UNHEALTHY_THRESHOLD
    payload = {
        "status": "degraded" if heartbeat_unhealthy else "ok",
        "commit": _DEPLOYED_COMMIT[:12] if _DEPLOYED_COMMIT else "unknown",
        "heartbeat_last_success_at": (
            _cron_tick_last_success_at.isoformat() if _cron_tick_last_success_at else None
        ),
        "heartbeat_consecutive_failures": _cron_tick_failures,
    }
    return JSONResponse(payload, status_code=503 if heartbeat_unhealthy else 200)


async def _verify_internal_caller(request: Request, x_internal_service_token: str | None, audience: str) -> None:
    """Shared internal-auth check for the admin-only circuit endpoints below —
    same pattern as /introspect, scoped to its own audience."""
    if not x_internal_service_token:
        raise HTTPException(status_code=401, detail="Unauthorized")
    raw_body = await request.body()
    try:
        claims = verify_internal_service_token_claims(
            x_internal_service_token,
            audience,
            method=request.method,
            path=request.url.path,
            body=raw_body,
        )
    except RuntimeError as exc:
        print(f"[runtime] {audience} auth misconfigured: {exc}")
        raise HTTPException(status_code=500, detail="Runtime auth is not configured")
    if claims is None:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/circuits")
async def circuit_states(
    request: Request,
    x_internal_service_token: str | None = Header(default=None, alias=INTERNAL_SERVICE_TOKEN_HEADER),
) -> dict[str, Any]:
    """Real circuit-breaker state for the admin dashboard.

    The dashboard used to render hardcoded mock data that always showed every
    circuit as healthy — actively misleading during a real incident. This
    reveals operational failure counts (not user data) so it's still
    internal-auth-gated rather than public like /health.
    """
    await _verify_internal_caller(request, x_internal_service_token, "runtime:circuits")
    return {"circuits": [cb.to_dict() for cb in list_known_circuits()]}


@app.post("/circuits/reset")
async def reset_circuits(
    request: Request,
    x_internal_service_token: str | None = Header(default=None, alias=INTERNAL_SERVICE_TOKEN_HEADER),
) -> dict[str, Any]:
    """Manually reset every circuit breaker back to CLOSED — the admin
    dashboard's "Reset All Circuits" action, previously a disabled no-op."""
    await _verify_internal_caller(request, x_internal_service_token, "runtime:circuits")
    reset_all_circuits()
    return {"ok": True}


class RunReplayFromNodeRequest(BaseModel):
    """Request payload for /execute-from-node."""

    run_id: str
    start_node_id: str
    start_input: dict[str, Any] = {}
    upstream_outputs: dict[str, dict[str, Any]] = {}
    original_run_id: str
    trigger_payload: Optional[dict[str, Any]] = None
    connections: dict[str, str] = {}


@app.post("/execute-from-node")
async def execute_from_node(
    request: Request,
    background_tasks: BackgroundTasks,
    x_internal_service_token: str | None = Header(default=None, alias=INTERNAL_SERVICE_TOKEN_HEADER),
) -> dict[str, str]:
    """Re-execute a workflow starting from a specific node with edited input.

    Accepts the same auth as /execute. The caller (Next.js web app) pre-computes
    upstream_outputs from the original run's node_executions so the runtime does
    not need an extra DB lookup.
    """
    raw_body = await request.body()
    if not x_internal_service_token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        has_valid_token = verify_internal_service_token(
            x_internal_service_token,
            "runtime:execute",
            method=request.method,
            path=request.url.path,
            body=raw_body,
        )
    except RuntimeError as exc:
        if "INTERNAL_SERVICE_AUTH_SECRET_RUNTIME_EXECUTE" in str(exc):
            print(f"[runtime] Execute-from-node auth misconfigured: {exc}")
            raise HTTPException(status_code=500, detail="Runtime auth is not configured")
        raise

    if not has_valid_token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        body = RunReplayFromNodeRequest.model_validate_json(raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid replay-from-node payload")

    # Load run + program from DB (S15: ignore caller-supplied program data)
    db = get_db()
    run_lookup = db.table("runs").select("id, program_id, status").eq("id", body.run_id).limit(1).execute()
    run_rows = run_lookup.data or []
    if not run_rows:
        raise HTTPException(status_code=404, detail="Run not found")
    run_row = run_rows[0]
    if run_row.get("status") not in _DISPATCHABLE_RUN_STATUSES:
        raise HTTPException(status_code=409, detail="Run is not dispatchable")

    program_id_db: str = run_row["program_id"]
    program_lookup = (
        db.table("programs")
        .select("id, user_id, schema, workspace_id, schema_version")
        .eq("id", program_id_db)
        .limit(1)
        .execute()
    )
    program_rows = program_lookup.data or []
    if not program_rows:
        raise HTTPException(status_code=404, detail="Program not found")
    program_row = program_rows[0]
    user_id_db: str = program_row["user_id"]
    if is_processing_restricted(db, user_id_db):
        raise HTTPException(status_code=423, detail="Processing is restricted for this account.")
    schema = parse_schema(program_row.get("schema") or {})
    workspace_policy = load_workspace_policy(db, program_row.get("workspace_id"))

    background_tasks.add_task(
        _run_replay_from_node,
        schema,
        body.run_id,
        program_id_db,
        user_id_db,
        body.start_node_id,
        body.start_input,
        body.upstream_outputs,
        body.original_run_id,
        body.connections,
        program_row.get("workspace_id"),
        workspace_policy,
    )
    return {"status": "started", "run_id": body.run_id}


async def _run_replay_from_node(
    schema: ProgramSchema,
    run_id: str,
    program_id: str,
    user_id: str,
    start_node_id: str,
    start_input: dict[str, Any],
    upstream_outputs: dict[str, dict[str, Any]],
    original_run_id: str,
    connection_name_to_id: dict[str, str] | None = None,
    workspace_id: str | None = None,
    workspace_policy: dict[str, Any] | None = None,
) -> None:
    """Background task: run replay_from_node behind the concurrency gate."""
    from engine.replay_from_node import replay_from_node as _replay

    async with _acquire_run_slot(is_priority=False):
        db = get_db()
        final_status = "failed"
        error_message: str | None = None
        try:
            failures = await _replay(
                schema,
                run_id,
                program_id,
                user_id,
                start_node_id,
                start_input,
                upstream_outputs,
                original_run_id,
                connection_name_to_id=connection_name_to_id,
                workspace_id=workspace_id,
                workspace_policy=workspace_policy,
            )
            if failures:
                error_message = str(failures[0]) if failures else None
                final_status = "failed"
            else:
                final_status = "completed"
        except asyncio.TimeoutError as e:
            error_message = str(e) or "Replay exceeded maximum execution time"
        except ExecutionError as e:
            error_message = e.message
        except Exception as e:
            error_message = str(e)
        finally:
            await update_run(
                db,
                run_id,
                status=final_status,
                error_message=error_message,
                completed_at="now()",
            )
            await release_run_locks(db, run_id)
            await _notify_complete(run_id, program_id, user_id, final_status, error_message)

