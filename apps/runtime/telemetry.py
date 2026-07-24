"""Unified OpenTelemetry setup for the Corelyx runtime — traces + metrics.

``engine/tracing.py`` owns the tracer/span helpers used inside the executor.
This module is the process-level entry point: it wires up the meter provider
(the piece ``tracing.py`` intentionally leaves out), exposes ready-made metric
instruments for workflow execution, and offers a single ``setup_telemetry()``
call for application startup.

Configuration (all optional, via environment):

- ``OTEL_EXPORTER_OTLP_ENDPOINT``  OTLP/gRPC collector endpoint. When set, both
  traces and metrics are exported there. When unset, a console exporter is used
  so telemetry is still observable in local development.
- ``OTEL_SERVICE_NAME``            Resource service name (default ``corelyx-runtime``).
- ``OTEL_CONSOLE_EXPORTER``        Force the console exporter even with an OTLP
  endpoint configured (useful for debugging).
- ``OTEL_METRIC_EXPORT_INTERVAL_MS``  Periodic metric export interval (default 15000).

Usage at startup::

    from telemetry import setup_telemetry

    setup_telemetry()

Recording a node execution (from the executor)::

    from telemetry import record_node_execution

    record_node_execution(
        node_type="agent",
        status="completed",
        duration_ms=142.0,
        total_tokens=1830,
        cost_usd=0.0042,
        model_calls=1,
    )
"""

from __future__ import annotations

import os
from typing import Any

from opentelemetry import metrics
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import (
    ConsoleMetricExporter,
    PeriodicExportingMetricReader,
)
from opentelemetry.sdk.resources import SERVICE_NAME, Resource

# Reuse the tracer provider owned by engine.tracing so traces and metrics share
# one Resource and one initialisation path.
from engine.tracing import get_tracer

__all__ = [
    "setup_telemetry",
    "get_meter",
    "record_node_execution",
    "record_run_completed",
]


def _console_metrics_enabled(has_endpoint: bool) -> bool:
    forced = os.environ.get("OTEL_CONSOLE_EXPORTER", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )
    return forced or not has_endpoint


def _export_interval_ms() -> int:
    raw = os.environ.get("OTEL_METRIC_EXPORT_INTERVAL_MS", "15000")
    try:
        return max(1000, int(raw))
    except ValueError:
        return 15000


# ---------------------------------------------------------------------------
# Meter provider — one-shot lazy init, mirroring engine.tracing.
# ---------------------------------------------------------------------------

_METER_PROVIDER: MeterProvider | None = None


def _init_meter_provider() -> MeterProvider:
    global _METER_PROVIDER  # noqa: PLW0603
    if _METER_PROVIDER is not None:
        return _METER_PROVIDER

    service_name = os.environ.get("OTEL_SERVICE_NAME", "corelyx-runtime")
    resource = Resource.create({SERVICE_NAME: service_name})

    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    readers: list[PeriodicExportingMetricReader] = []

    if endpoint:
        try:
            from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import (
                OTLPMetricExporter,
            )

            readers.append(
                PeriodicExportingMetricReader(
                    OTLPMetricExporter(endpoint=endpoint, insecure=True),
                    export_interval_millis=_export_interval_ms(),
                )
            )
        except Exception:
            # OTLP exporter unavailable — fall through to console.
            pass

    if _console_metrics_enabled(bool(endpoint)) or not readers:
        readers.append(
            PeriodicExportingMetricReader(
                ConsoleMetricExporter(),
                export_interval_millis=_export_interval_ms(),
            )
        )

    provider = MeterProvider(resource=resource, metric_readers=readers)
    metrics.set_meter_provider(provider)
    _METER_PROVIDER = provider
    return provider


def get_meter(name: str = "corelyx") -> metrics.Meter:
    """Return a meter, initialising the meter provider on first call."""
    _init_meter_provider()
    return metrics.get_meter(name)


# ---------------------------------------------------------------------------
# Instruments — lazily created and cached so repeated recordings are cheap.
# ---------------------------------------------------------------------------


class _Instruments:
    """Holds the runtime's metric instruments. Created once on first use."""

    def __init__(self) -> None:
        meter = get_meter("corelyx.runtime")
        self.node_executions = meter.create_counter(
            "corelyx.node.executions",
            unit="1",
            description="Count of node executions by type and status.",
        )
        self.node_duration = meter.create_histogram(
            "corelyx.node.duration",
            unit="ms",
            description="Wall-clock duration of a node execution.",
        )
        self.tokens = meter.create_counter(
            "corelyx.node.tokens",
            unit="1",
            description="Total LLM tokens consumed by a node.",
        )
        self.cost = meter.create_counter(
            "corelyx.node.cost_usd",
            unit="USD",
            description="Estimated provider cost attributed to a node.",
        )
        self.model_calls = meter.create_counter(
            "corelyx.node.model_calls",
            unit="1",
            description="Number of LLM model calls made by a node.",
        )
        self.runs = meter.create_counter(
            "corelyx.run.completed",
            unit="1",
            description="Count of completed runs by status.",
        )


_INSTRUMENTS: _Instruments | None = None


def _instruments() -> _Instruments:
    global _INSTRUMENTS  # noqa: PLW0603
    if _INSTRUMENTS is None:
        _INSTRUMENTS = _Instruments()
    return _INSTRUMENTS


# ---------------------------------------------------------------------------
# Public recording helpers — safe no-ops if telemetry init failed.
# ---------------------------------------------------------------------------


def record_node_execution(
    *,
    node_type: str,
    status: str,
    duration_ms: float,
    total_tokens: int = 0,
    cost_usd: float = 0.0,
    model_calls: int = 0,
    program_id: str | None = None,
) -> None:
    """Record metrics for a single completed node execution.

    Never raises: telemetry must not break workflow execution.
    """
    try:
        inst = _instruments()
        attrs: dict[str, Any] = {"node.type": node_type, "node.status": status}
        if program_id:
            attrs["program.id"] = program_id

        inst.node_executions.add(1, attrs)
        inst.node_duration.record(max(0.0, float(duration_ms)), attrs)
        if total_tokens:
            inst.tokens.add(max(0, int(total_tokens)), attrs)
        if cost_usd:
            inst.cost.add(max(0.0, float(cost_usd)), attrs)
        if model_calls:
            inst.model_calls.add(max(0, int(model_calls)), attrs)
    except Exception:
        pass


def record_run_completed(*, status: str, program_id: str | None = None) -> None:
    """Record a run-level completion counter. Never raises."""
    try:
        attrs: dict[str, Any] = {"run.status": status}
        if program_id:
            attrs["program.id"] = program_id
        _instruments().runs.add(1, attrs)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Startup entry point.
# ---------------------------------------------------------------------------


def setup_telemetry() -> None:
    """Initialise the tracer + meter providers. Call once at process start.

    Idempotent and non-fatal: any failure here degrades to no-op telemetry
    rather than preventing the runtime from serving requests.
    """
    try:
        get_tracer("corelyx.runtime")  # forces engine.tracing provider init
        _init_meter_provider()
        _instruments()  # eagerly create instruments so first request is fast
    except Exception:
        pass
