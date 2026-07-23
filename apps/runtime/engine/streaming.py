"""
SSE (Server-Sent Events) streaming support for runtime execution.

Provides an event-driven mechanism for streaming node execution events
to the frontend in real-time.
"""
from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, AsyncGenerator, Callable, Optional


class StreamEventType(str, Enum):
    """Event types for SSE streaming."""
    RUN_STARTED = "run_started"
    NODE_STARTED = "node_started"
    NODE_COMPLETED = "node_completed"
    NODE_ERROR = "node_error"
    RUN_COMPLETED = "run_completed"
    RUN_FAILED = "run_failed"
    CHECKPOINT_SAVED = "checkpoint_saved"
    CHECKPOINT_RESUMED = "checkpoint_resumed"


@dataclass
class StreamEvent:
    """A single SSE event."""
    event_type: StreamEventType
    run_id: str
    node_id: Optional[str] = None
    data: dict[str, Any] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)

    def to_sse(self) -> str:
        """Format as SSE message."""
        payload = {
            "event": self.event_type.value,
            "run_id": self.run_id,
            "timestamp": self.timestamp,
            "data": self.data,
        }
        if self.node_id:
            payload["node_id"] = self.node_id
        return f"data: {json.dumps(payload, default=str)}\n\n"


class EventStream:
    """Manages SSE event streaming for a single run execution."""

    def __init__(self, run_id: str, max_queue_size: int = 1000):
        self.run_id = run_id
        self._queue: asyncio.Queue[StreamEvent | None] = asyncio.Queue(maxsize=max_queue_size)
        self._subscribers: list[Callable[[StreamEvent], None]] = []
        self._started = time.time()

    async def emit(self, event: StreamEvent) -> None:
        """Emit an event to the stream."""
        try:
            self._queue.put_nowait(event)
        except asyncio.QueueFull:
            # Drop oldest event if queue is full
            try:
                self._queue.get_nowait()
                self._queue.put_nowait(event)
            except asyncio.QueueEmpty:
                pass

        # Notify subscribers
        for subscriber in self._subscribers:
            try:
                subscriber(event)
            except Exception:
                pass

    async def close(self) -> None:
        """Close the stream by sending None sentinel."""
        await self._queue.put(None)

    def subscribe(self, callback: Callable[[StreamEvent], None]) -> None:
        """Subscribe to events."""
        self._subscribers.append(callback)

    async def events(self) -> AsyncGenerator[str, None]:
        """Generate SSE events from the queue."""
        while True:
            event = await self._queue.get()
            if event is None:
                break
            yield event.to_sse()

    @property
    def elapsed(self) -> float:
        """Time since stream started."""
        return time.time() - self._started


# Global registry of active streams
_active_streams: dict[str, EventStream] = {}


def get_stream(run_id: str) -> EventStream | None:
    """Get an active stream for a run."""
    return _active_streams.get(run_id)


def create_stream(run_id: str) -> EventStream:
    """Create and register a new stream for a run."""
    stream = EventStream(run_id)
    _active_streams[run_id] = stream
    return stream


def remove_stream(run_id: str) -> None:
    """Remove a stream from the registry."""
    _active_streams.pop(run_id, None)


class StreamingExecutor:
    """Mixin for executor to emit streaming events."""

    def __init__(self, *args, stream: EventStream | None = None, **kwargs):
        super().__init__(*args, **kwargs)
        self._stream = stream

    async def emit_event(
        self,
        event_type: StreamEventType,
        node_id: str | None = None,
        data: dict[str, Any] | None = None,
    ) -> None:
        """Emit an event if streaming is enabled."""
        if self._stream:
            event = StreamEvent(
                event_type=event_type,
                run_id=self._stream.run_id,
                node_id=node_id,
                data=data or {},
            )
            await self._stream.emit(event)
