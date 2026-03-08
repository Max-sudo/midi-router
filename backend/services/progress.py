# ── Shared progress tracker for long-running jobs ──────────────────
import asyncio
import json
import threading
import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ProgressState:
    percent: float = 0
    stage: str = ""
    message: str = ""
    complete: bool = False
    error: str | None = None
    result: dict = field(default_factory=dict)


class ProgressTracker:
    """Thread-safe progress tracker. Backend services call update() from worker
    threads; the SSE endpoint reads state from the async event loop."""

    def __init__(self):
        self._state = ProgressState()
        self._lock = threading.Lock()
        self._updated = threading.Event()

    def update(self, percent: float, stage: str = "", message: str = ""):
        with self._lock:
            self._state.percent = percent
            self._state.stage = stage
            self._state.message = message
        self._updated.set()

    def complete(self, result: dict | None = None):
        with self._lock:
            self._state.percent = 100
            self._state.complete = True
            self._state.result = result or {}
        self._updated.set()

    def fail(self, error: str):
        with self._lock:
            self._state.error = error
            self._state.complete = True
        self._updated.set()

    def get_state(self) -> dict:
        with self._lock:
            s = self._state
            d: dict[str, Any] = {
                "percent": round(s.percent, 1),
                "stage": s.stage,
                "message": s.message,
            }
            if s.complete:
                d["complete"] = True
                if s.error:
                    d["error"] = s.error
                else:
                    d.update(s.result)
            return d

    async def stream_sse(self):
        """Async generator yielding SSE-formatted events until complete."""
        while True:
            state = self.get_state()
            yield f"data: {json.dumps(state)}\n\n"
            if state.get("complete"):
                break
            await asyncio.sleep(0.3)


# ── Job registry ───────────────────────────────────────────────────
_jobs: dict[str, ProgressTracker] = {}
_jobs_lock = threading.Lock()


def create_job(job_id: str) -> ProgressTracker:
    tracker = ProgressTracker()
    with _jobs_lock:
        _jobs[job_id] = tracker
    return tracker


def get_job(job_id: str) -> ProgressTracker | None:
    with _jobs_lock:
        return _jobs.get(job_id)


def remove_job(job_id: str):
    with _jobs_lock:
        _jobs.pop(job_id, None)
