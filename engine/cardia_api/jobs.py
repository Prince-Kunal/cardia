"""Jobs: slices analysed in a pool of worker processes, with progress and cancel (PLAN.md §6).

A job is one upload of one or more files. Each file becomes a slice entry. A slice whose result is
already stored is done at once (`cached`). The same slice in two jobs is analysed once. The manager
sends at most `workers` slices to the pool at a time, so cancel can drop every slice not yet started.
Slices already running finish (a slice takes seconds) and their results are kept.

When a job finishes, its done slices are handed to `on_done` in upload order (the library files them
into their hearts, so a heart's slices keep the order they were imported in). Jobs live in memory until
the engine stops; slice results stay on disk (store.py) and hearts in the library.
"""

import hashlib
import logging
import multiprocessing as mp
import threading
import time
import uuid
from collections import deque
from collections.abc import Callable
from concurrent.futures import CancelledError, ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from dataclasses import dataclass, field
from datetime import UTC, datetime
from functools import partial

from . import worker
from .settings import Settings
from .store import Store

log = logging.getLogger("cardia.jobs")
FINAL = ("done", "failed", "cancelled")
STAGE_PROGRESS = {"reading": 0.05, "front_end": 0.1, "method_a": 0.45, "method_b": 0.75, "layers": 0.9}
KEEP_FINISHED_JOBS = 200


@dataclass(eq=False)
class Entry:
    """One uploaded file in a job."""

    index: int
    file_name: str
    heart_id: str
    weight_mg: float | None
    image_sha256: str | None = None
    image_path: str | None = None
    slice_id: str | None = None
    state: str = "queued"
    cached: bool = False
    error: dict | None = None
    typed_weight_mg: float | None = None  # typed at import; the library keeps it with the heart
    heart_key: str | None = None  # the library heart it was filed into, once done
    seconds: float | None = None  # analysis time, from sending it to a worker to its result


@dataclass(eq=False)
class JobRecord:
    job_id: str
    created_at: datetime
    entries: list[Entry]
    source: str = "upload"
    cancel_requested: bool = False
    finished_at: datetime | None = None


@dataclass
class _Slot:
    """A slice waiting for, or running in, a worker; shared by every entry that needs it."""

    task: dict
    entries: list[Entry] = field(default_factory=list)
    stage: str | None = None
    generation: int = -1  # pool generation it was sent to; -1 while waiting
    started: float | None = None  # time.monotonic() when sent to a worker


class JobManager:
    def __init__(
        self,
        settings: Settings,
        store: Store,
        pipeline_version: str,
        manifest_sha256: str | None,
        on_done: Callable[[Entry], str | None] | None = None,
    ):
        self.settings = settings
        self.on_done = on_done  # called (lock held) per done entry when its job finishes; returns its heart key
        self.store = store
        self.pipeline_version = pipeline_version
        self.manifest_sha256 = manifest_sha256
        self._ctx = mp.get_context("spawn")  # the same start method on macOS, Linux and Windows
        self._lock = threading.RLock()
        self._jobs: dict[str, JobRecord] = {}
        self._slots: dict[str, _Slot] = {}  # slice id -> slot, waiting or running
        self._waiting: deque[str] = deque()
        self._running: set[str] = set()
        self._pool: ProcessPoolExecutor | None = None
        self._generation = 0
        self._events = None
        self._event_thread: threading.Thread | None = None
        self._stopping = False

    # lifecycle ---------------------------------------------------------------------------------

    def start(self) -> None:
        self._events = self._ctx.Queue()
        self._event_thread = threading.Thread(target=self._drain_events, name="cardia-events", daemon=True)
        self._event_thread.start()
        self._pool = self._new_pool()

    def stop(self) -> None:
        with self._lock:
            self._stopping = True
            for sid in list(self._waiting):
                self._finish_slot(sid, {"ok": False, "error": _engine_stopped()})
            self._waiting.clear()
        if self._pool is not None:
            self._pool.shutdown(wait=True, cancel_futures=True)
        if self._events is not None:
            self._events.put(None)
            self._event_thread.join(timeout=5)
            self._events.close()
            self._events.join_thread()

    def _new_pool(self) -> ProcessPoolExecutor:
        s = self.settings
        pool = ProcessPoolExecutor(
            max_workers=s.workers,
            mp_context=self._ctx,
            initializer=worker.init,
            initargs=(str(s.models_dir), s.mock, s.mock_delay_s, self._events),
        )
        for _ in range(s.workers):  # start the workers (and load the models) now, not on the first slice
            pool.submit(worker.ready)
        return pool

    # jobs --------------------------------------------------------------------------------------

    def slice_id(self, image_sha256: str, file_name: str) -> str:
        key = "\0".join([image_sha256, file_name, self.pipeline_version, self.manifest_sha256 or "none"])
        return hashlib.sha256(key.encode()).hexdigest()[:24]

    def submit(self, entries: list[Entry], source: str = "upload") -> str:
        job = JobRecord(job_id=uuid.uuid4().hex, created_at=datetime.now(UTC), entries=entries, source=source)
        with self._lock:
            for e in entries:
                if e.error is not None:
                    e.state = "failed"
                elif e.slice_id in self._slots:
                    self._slots[e.slice_id].entries.append(e)
                    e.state = "running" if e.slice_id in self._running else "queued"
                elif self.store.has_result(e.slice_id):
                    e.state, e.cached = "done", True
                else:
                    self._slots[e.slice_id] = _Slot(task=self._task(e), entries=[e])
                    self._waiting.append(e.slice_id)
            self._jobs[job.job_id] = job
            self._forget_old_jobs()
            self._update_finished()
            self._dispatch()
        return job.job_id

    def cancel(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return False
            job.cancel_requested = True
            for e in job.entries:
                if e.state != "queued":
                    continue
                slot = self._slots[e.slice_id]
                slot.entries.remove(e)
                e.state = "cancelled"
                if not slot.entries:
                    self._waiting.remove(e.slice_id)
                    del self._slots[e.slice_id]
            self._update_finished()
            return True

    def get(self, job_id: str) -> dict | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return None if job is None else self._view(job)

    def list(self) -> list[dict]:
        with self._lock:
            return [self._view(j) for j in reversed(self._jobs.values())]

    # internals (called with the lock held) -----------------------------------------------------

    def _task(self, e: Entry) -> dict:
        return {
            "slice_id": e.slice_id,
            "image_path": e.image_path,
            "file_name": e.file_name,
            "heart_id": e.heart_id,
            "weight_mg": e.weight_mg,
            "image_sha256": e.image_sha256,
            "slices_dir": str(self.store.slices),
            "pipeline_version": self.pipeline_version,
        }

    def _dispatch(self) -> None:
        while self._waiting and len(self._running) < self.settings.workers and not self._stopping:
            sid = self._waiting.popleft()
            slot = self._slots[sid]
            self._running.add(sid)
            slot.generation = self._generation
            slot.started = time.monotonic()
            for e in slot.entries:
                e.state = "running"
            try:
                future = self._pool.submit(worker.run, slot.task)
            except (BrokenProcessPool, RuntimeError) as exc:
                self._finish_slot(sid, {"ok": False, "error": _engine_stopped(exc)})
                self._replace_pool(slot.generation)
                continue
            future.add_done_callback(partial(self._done, sid, slot.generation))

    def _done(self, sid: str, generation: int, future) -> None:
        broken = False
        try:
            out = future.result()
        except BrokenProcessPool as exc:
            out, broken = {"ok": False, "error": _engine_stopped(exc)}, True
        except CancelledError:
            out = {"ok": False, "error": _engine_stopped()}
        except Exception as exc:  # noqa: BLE001 - e.g. a result that could not be sent back
            out = {"ok": False, "error": {"code": "analysis_failed", "message": f"{type(exc).__name__}: {exc}"}}
        with self._lock:
            self._finish_slot(sid, out)
            if broken:
                self._replace_pool(generation)
            self._update_finished()
            self._dispatch()

    def _finish_slot(self, sid: str, out: dict) -> None:
        slot = self._slots.pop(sid, None)
        self._running.discard(sid)
        seconds = time.monotonic() - slot.started if slot and slot.started is not None else None
        for e in slot.entries if slot else []:
            e.seconds = seconds
            if out["ok"]:
                e.state = "done"
            else:
                e.state, e.error = "failed", out["error"]

    def _file(self, e: Entry) -> None:
        if self.on_done is None:
            return
        try:
            e.heart_key = self.on_done(e)
        except Exception:  # the analysis is done and stored; filing it must not break the job
            log.exception("could not file slice %s into the library", e.slice_id)

    def _replace_pool(self, generation: int) -> None:
        """A worker died (e.g. out of memory): start a new pool once, unless the engine is stopping."""
        if generation != self._generation or self._stopping:
            return
        self._generation += 1
        old, self._pool = self._pool, self._new_pool()
        old.shutdown(wait=False, cancel_futures=True)

    def _update_finished(self) -> None:
        now = datetime.now(UTC)
        for job in self._jobs.values():
            if job.finished_at is None and all(e.state in FINAL for e in job.entries):
                for e in job.entries:
                    if e.state == "done":
                        self._file(e)
                job.finished_at = now

    def _forget_old_jobs(self) -> None:
        finished = [j for j in self._jobs.values() if j.finished_at is not None]
        for job in finished[: max(0, len(finished) - KEEP_FINISHED_JOBS)]:
            del self._jobs[job.job_id]

    def _drain_events(self) -> None:
        while (item := self._events.get()) is not None:
            sid, stage = item
            with self._lock:
                if sid in self._running:
                    self._slots[sid].stage = stage

    def _view(self, job: JobRecord) -> dict:
        slices = []
        for e in job.entries:
            stage = self._slots[e.slice_id].stage if e.state == "running" else None
            progress = 1.0 if e.state in FINAL else STAGE_PROGRESS.get(stage, 0.0)
            slices.append(
                {
                    "index": e.index,
                    "file_name": e.file_name,
                    "heart_id": e.heart_id,
                    "weight_mg": e.weight_mg,
                    "image_sha256": e.image_sha256,
                    "state": e.state,
                    "stage": stage,
                    "progress": progress,
                    "slice_id": e.slice_id if e.state == "done" else None,
                    "cached": e.cached,
                    "error": e.error,
                    "heart_key": e.heart_key,
                    "seconds": e.seconds,
                }
            )
        counts = {s: sum(x["state"] == s for x in slices) for s in ("queued", "running", "done", "failed", "cancelled")}
        if job.cancel_requested:
            state = "cancelled"
        elif job.finished_at is not None:
            state = "done"
        elif counts["running"] or counts["done"] or counts["failed"]:
            state = "running"
        else:
            state = "queued"
        return {
            "job_id": job.job_id,
            "source": job.source,
            "state": state,
            "created_at": job.created_at,
            "finished_at": job.finished_at,
            "progress": sum(x["progress"] for x in slices) / len(slices) if slices else 1.0,
            "counts": {"total": len(slices), **counts},
            "slices": slices,
        }


def _engine_stopped(exc: BaseException | None = None) -> dict:
    why = f" ({type(exc).__name__})" if exc else ""
    return {"code": "engine_stopped", "message": f"The analysis process stopped before this slice finished{why}."}
