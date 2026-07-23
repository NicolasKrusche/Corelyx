"""OpenTelemetry tracing configuration for the Corelyx runtime.

Provides a pre-configured tracer and helper decorators/spans for
instrumenting workflow execution. All LangGraph nodes, LLM calls,
and connector invocations are wrapped in meaningful spans that
propagate trace context to downstream services.

Usage::

    from engine.tracing import traced, get_tracer

    tracer = get_tracer("engine.executor")

    @traced("node.execute", node_id=node.id)
    async def run():
        ...
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager, contextmanager
from typing import Any, AsyncGenerator, Generator

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource, SERVICE_NAME
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from opentelemetry.trace import StatusCode, Status

# ---------------------------------------------------------------------------
# Lazy provider init — avoids importing SDK in test stubs that mock OTel.
# ---------------------------------------------------------------------------

_PROVIDER: TracerProvider | None = None


def _init_provider() -> TracerProvider:
    """One-shot provider initialisation. Safe to call multiple times."""
    global _PROVIDER  # noqa: PLW0603
    if _PROVIDER is not None:
        return _PROVIDER

    service_name = os.environ.get("OTEL_SERVICE_NAME", "corelyx-runtime")
    resource = Resource.create({SERVICE_NAME: service_name})

    provider = TracerProvider(resource=resource)

    # Optional OTLP exporter (e.g. for Grafana Tempo, Jaeger)
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    if endpoint:
        try:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
                OTLPSpanExporter,
            )

            exporter = OTLPSpanExporter(endpoint=endpoint, insecure=True)
            provider.add_span_processor(BatchSpanProcessor(exporter))
        except Exception:
            pass  # Fall through to console exporter

    # Console exporter for development / when no OTLP endpoint is set
    if not endpoint or os.environ.get("OTEL_CONSOLE_EXPORTER", "").lower() in (
        "1",
        "true",
        "yes",
    ):
        provider.add_span_processor(
            BatchSpanProcessor(ConsoleSpanExporter())
        )

    trace.set_tracer_provider(provider)
    _PROVIDER = provider
    return provider


def get_tracer(name: str = "corelyx") -> trace.Tracer:
    """Return the global tracer, initialising the provider on first call."""
    _init_provider()
    return trace.get_tracer(name)


# ---------------------------------------------------------------------------
# Span helpers
# ---------------------------------------------------------------------------

def traced(
    span_name: str,
    *,
    attributes: dict[str, Any] | None = None,
    record_exception: bool = True,
) -> Any:
    """Decorator that wraps an async or sync function in an OTel span.

    Automatically records the span status and any exceptions.
    """
    import functools

    def decorator(fn: Any) -> Any:
        tracer = get_tracer("corelyx")

        @functools.wraps(fn)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            attrs = dict(attributes or {})
            with tracer.start_as_current_span(span_name, attributes=attrs) as span:
                try:
                    result = await fn(*args, **kwargs)
                    span.set_status(StatusCode.OK)
                    return result
                except Exception as exc:
                    span.set_status(StatusCode.ERROR, str(exc)[:300])
                    if record_exception:
                        span.record_exception(exc)
                    raise

        @functools.wraps(fn)
        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
            attrs = dict(attributes or {})
            with tracer.start_as_current_span(span_name, attributes=attrs) as span:
                try:
                    result = fn(*args, **kwargs)
                    span.set_status(StatusCode.OK)
                    return result
                except Exception as exc:
                    span.set_status(StatusCode.ERROR, str(exc)[:300])
                    if record_exception:
                        span.record_exception(exc)
                    raise

        import asyncio
        if asyncio.iscoroutinefunction(fn):
            return async_wrapper
        return sync_wrapper

    return decorator


@contextmanager
def span(
    name: str,
    *,
    attributes: dict[str, Any] | None = None,
) -> Generator[trace.Span, None, None]:
    """Synchronous context manager that creates an OTel span."""
    tracer = get_tracer("corelyx")
    with tracer.start_as_current_span(name, attributes=attributes or {}) as s:
        try:
            yield s
        except Exception as exc:
            s.set_status(StatusCode.ERROR, str(exc)[:300])
            s.record_exception(exc)
            raise


@asynccontextmanager
async def async_span(
    name: str,
    *,
    attributes: dict[str, Any] | None = None,
) -> AsyncGenerator[trace.Span, None]:
    """Async context manager that creates an OTel span."""
    tracer = get_tracer("corelyx")
    with tracer.start_as_current_span(name, attributes=attributes or {}) as s:
        try:
            yield s
        except Exception as exc:
            s.set_status(StatusCode.ERROR, str(exc)[:300])
            s.record_exception(exc)
            raise
