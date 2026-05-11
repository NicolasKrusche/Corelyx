from __future__ import annotations

import asyncio
import json
import os
import sys
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Optional

# Force UTF-8 stdout/stderr on Windows so Unicode chars in log output don't crash
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from cors_config import (
    CORS_ALLOWED_HEADERS,
    CORS_ALLOWED_METHODS,
    get_cors_allowed_origins,
)
from db import (
    get_active_cron_workflows,
    get_db,
    is_processing_restricted,
    release_run_locks,
    update_run,
)
from engine.executor import ExecutionError, ProgramExecutor, close_llm_client
from internal_auth import (
    INTERNAL_SERVICE_TOKEN_HEADER,
    build_internal_service_headers,
    verify_internal_service_token,
)
from schema import ProgramSchema, parse_schema

load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"), override=True)

scheduler = AsyncIOScheduler()


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
    run_result = (
        db.table("runs")
        .insert({
            "program_id": workflow_id,
            "triggered_by": "cron",
            "trigger_payload": None,
            "status": "running",
            "started_at": "now()",
        })
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
            completed_at="now()",
        )
        await _notify_complete(run_id, workflow_id, user_id, "failed")
        return
    final_status = "failed"
    error_message: str | None = None
    executor: ProgramExecutor | None = None
    try:
        executor = ProgramExecutor(schema, run_id, user_id)
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
            **telemetry,
        )
        await release_run_locks(db, run_id)
        await _notify_complete(run_id, workflow_id, user_id, final_status)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    try:
        workflows = await get_active_cron_workflows()
        for w in workflows:
            try:
                scheduler.add_job(
                    trigger_workflow,
                    "cron",
                    **parse_cron(w.get("cron_expression", "0 * * * *")),
                    args=[w["id"]],
                )
            except ValueError:
                pass  # Skip workflows with invalid cron expressions
    except Exception as e:
        print(f"[runtime] Warning: could not load cron workflows: {e}")
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
    allow_credentials=False,
)


def verify_execute_token(
    x_internal_service_token: str | None = Header(
        default=None, alias=INTERNAL_SERVICE_TOKEN_HEADER
    )
) -> None:
    if not x_internal_service_token or not verify_internal_service_token(
        x_internal_service_token, "runtime:execute"
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")


class ExecuteRequest(BaseModel):
    run_id: str
    # The remaining fields are accepted for backward compatibility but are NOT
    # trusted (S15). The runtime loads program_id, user_id, and the schema
    # from the runs/programs rows keyed by run_id and ignores anything the
    # caller put in body.{program_id,user_id,schema}.
    program_id: Optional[str] = None
    user_id: Optional[str] = None
    schema: Optional[dict[str, Any]] = None
    trigger_payload: Optional[dict[str, Any]] = None
    triggered_by: str = "manual"
    # Maps connection name → connection UUID; populated by Next.js for manual/event runs.
    # Cron-triggered runs omit this and the executor falls back to a DB lookup.
    connections: dict[str, str] = {}


# S15: terminal run states reject re-dispatch. "paused" runs may be resumed,
# but a separate skip-trigger flow handles that — cold /execute should not.
_DISPATCHABLE_RUN_STATUSES = {"running", "pending"}


@app.post("/execute")
async def execute_program(
    request: Request,
    background_tasks: BackgroundTasks,
    x_internal_service_token: str | None = Header(
        default=None, alias=INTERNAL_SERVICE_TOKEN_HEADER
    ),
) -> dict[str, str]:
    raw_body = await request.body()
    if not x_internal_service_token or not verify_internal_service_token(
        x_internal_service_token,
        "runtime:execute",
        method=request.method,
        path=request.url.path,
        body=raw_body,
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        body = ExecuteRequest.model_validate_json(raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid execute payload")

    # S15: load run + program from the DB. The caller-supplied schema/user_id
    # are ignored — a leaked runtime:execute token can no longer execute
    # arbitrary code as an arbitrary user.
    db = get_db()
    run_lookup = (
        db.table("runs")
        .select("id, program_id, status")
        .eq("id", body.run_id)
        .limit(1)
        .execute()
    )
    run_rows = run_lookup.data or []
    if not run_rows:
        raise HTTPException(status_code=404, detail="Run not found")
    run_row = run_rows[0]
    if run_row.get("status") not in _DISPATCHABLE_RUN_STATUSES:
        raise HTTPException(status_code=409, detail="Run is not dispatchable")

    program_id_db: str = run_row["program_id"]
    program_lookup = (
        db.table("programs")
        .select("id, user_id, schema")
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

    background_tasks.add_task(
        _run_program,
        schema,
        body.run_id,
        user_id_db,
        body.trigger_payload,
        body.connections,
    )
    return {"status": "started", "run_id": body.run_id}


RUN_TIMEOUT_SECONDS = 600  # 10 minutes max per run


async def _notify_complete(run_id: str, program_id: str, user_id: str, status: str) -> None:
    """Notify Next.js that a run has finished — fires inter-program triggers."""
    nextjs_url = os.environ.get("NEXTJS_INTERNAL_URL", "http://localhost:3000")
    try:
        import httpx
        body = json.dumps(
            {"program_id": program_id, "user_id": user_id, "status": status},
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
    user_id: str,
    trigger_payload: Optional[dict[str, Any]],
    connection_name_to_id: dict[str, str] | None = None,
) -> None:
    db = get_db()
    final_status = "failed"
    error_message: str | None = None
    executor = ProgramExecutor(schema, run_id, user_id, connection_name_to_id=connection_name_to_id)
    try:
        await asyncio.wait_for(executor.execute(trigger_payload), timeout=RUN_TIMEOUT_SECONDS)
        final_status = "completed"
    except asyncio.TimeoutError:
        error_message = f"Run exceeded maximum execution time ({RUN_TIMEOUT_SECONDS}s)"
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
            **executor.run_telemetry_payload(),
        )
        await release_run_locks(db, run_id)
        # Notify Next.js — fires inter-program triggers for completed runs
        await _notify_complete(run_id, schema.program_id, user_id, final_status)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
