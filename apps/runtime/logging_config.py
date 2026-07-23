"""Centralized structured logging configuration for the Corelyx runtime.

Uses structlog to emit machine-readable JSON logs in production and
human-friendly coloured logs in development. Import ``get_logger`` from
this module everywhere in the runtime::

    from logging_config import get_logger

    log = get_logger("engine.executor")
    log.info("node_executed", node_id=node.id, status="completed", duration_ms=142)
"""

from __future__ import annotations

import logging
import os
import sys
from typing import Any

import structlog


def _env_flag(name: str, default: bool = False) -> bool:
    val = os.environ.get(name, "").strip().lower()
    if not val:
        return default
    return val not in ("0", "false", "no", "off")


LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
JSON_LOGS = _env_flag("STRUCTURED_LOGS_JSON", default=True)


def setup_logging() -> None:
    """Configure structlog + stdlib logging. Call once at process start."""
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if JSON_LOGS:
        renderer: structlog.types.Processor = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
        foreign_pre_chain=shared_processors,
    )

    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))

    # Quiet noisy third-party loggers
    for name in ("httpx", "httpcore", "urllib3", "openai", "anthropic"):
        logging.getLogger(name).setLevel(logging.WARNING)


def get_logger(name: str, **initial_ctx: Any) -> structlog.stdlib.BoundLogger:
    """Return a structlog-bound logger for the given module/component name."""
    return structlog.get_logger(name, **initial_ctx)  # type: ignore[return-value]


# Eagerly configure on import so every module that imports this gets
# structured logs from the moment it logs.
setup_logging()
