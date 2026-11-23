"""The engine's HTTP API (PLAN.md §6). Every route is under /api/v1; the contract is `openapi.json`."""

import json
import re
from contextlib import asynccontextmanager
from pathlib import Path as FilePath
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, File, Form, HTTPException, Path, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import TypeAdapter, ValidationError
from starlette.middleware.trustedhost import TrustedHostMiddleware

from ttc_pipeline import PIPELINE_VERSION, Models, parse_name
from ttc_pipeline.method_b import ACuts

from . import API_VERSION
from .catalog import LAYERS, methods
from .hearts import MixedVersions, heart_record, summarise
from .jobs import Entry, JobManager
from .library import Library
from .mock import MOCK_PIPELINE_VERSION
from .schemas import (
    AppSettings,
    EngineInfo,
    ErrorResponse,
    Health,
    Heart,
    HeartSummary,
    HeartSummaryRequest,
    HeartUpdate,
    Job,
    Layer,
    SliceResult,
    UploadMeta,
    WatchStatus,
)
from .security import OriginGuard, require_token
from .settings import ACCEPTED_SUFFIXES, Settings
from .store import FileTooLarge, Store
from .watch import Watcher
from .worker import model_files

JobId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]
SliceId = Annotated[str, Path(pattern=r"^[0-9a-f]{24}$")]
HeartKey = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]
NOT_FOUND = {404: {"model": ErrorResponse}}
_META = TypeAdapter(list[UploadMeta])


def create_app(settings: Settings) -> FastAPI:
    """Build the app. Outside mock mode this loads every model file first, so a bad one stops the launch."""
    models = None if settings.mock else Models.load(settings.models_dir)
    cuts = models.cuts if models else ACuts.load(settings.models_dir)
    pipeline_version = MOCK_PIPELINE_VERSION if settings.mock else PIPELINE_VERSION
    manifest_sha256 = models.manifest_sha256 if models else None
    store = Store(settings.data_dir)
    library = Library(settings.data_dir / "library.sqlite3")
    manager = JobManager(
        settings,
        store,
        pipeline_version,
        manifest_sha256,
        on_done=lambda e: library.add_slice(e.slice_id, e.heart_id, e.typed_weight_mg),
    )
    info = EngineInfo(
        api_version=API_VERSION,
        pipeline_version=pipeline_version,
        mock=settings.mock,
        models_manifest_sha256=manifest_sha256,
        models=model_files(models.files) if models else [],
        methods=methods(cuts),
        layers=LAYERS,
        accepted_extensions=list(ACCEPTED_SUFFIXES),
        max_upload_mb=settings.max_upload_bytes // 2**20,
        workers=settings.workers,
    )

    def ingest(index: int, name: str, src, meta: UploadMeta | None, seen: dict) -> Entry:
        """One file of an import: checked, copied into the store by content, and given its slice ID."""
        name = re.split(r"[\\/]", name or "")[-1] or f"file-{index + 1}"
        heart_id, weight = parse_name(name)
        entry = Entry(index=index, file_name=name, heart_id=heart_id, weight_mg=weight)
        if meta is not None:
            entry.heart_id = meta.heart_id or heart_id
            if meta.weight_mg is not None:
                entry.weight_mg = entry.typed_weight_mg = meta.weight_mg
        suffix = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if suffix not in ACCEPTED_SUFFIXES:
            entry.error = _error("unsupported_file", f"{suffix or 'Files without an extension'} is not supported")
            return entry
        try:
            entry.image_sha256, path = store.save_upload(src, suffix, settings.max_upload_bytes)
        except FileTooLarge:
            entry.error = _error("file_too_large", f"Larger than {settings.max_upload_bytes // 2**20} MB")
            return entry
        entry.image_path = str(path)
        if entry.image_sha256 in seen:
            entry.error = _error("duplicate", f"Same image as {seen[entry.image_sha256]}")
        else:
            seen[entry.image_sha256] = name
            entry.slice_id = manager.slice_id(entry.image_sha256, name)
        return entry

    def import_paths(paths: list[FilePath]) -> str:
        """Start a job for files on this computer (the watch folder)."""
        entries, seen = [], {}
        for i, path in enumerate(paths):
            try:
                with open(path, "rb") as f:
                    entries.append(ingest(i, path.name, f, None, seen))
            except OSError as e:
                entry = Entry(index=i, file_name=path.name, heart_id=parse_name(path.name)[0], weight_mg=None)
                entry.error = _error("unreadable_image", f"Could not read the file: {e}")
                entries.append(entry)
        return manager.submit(entries, source="watch_folder")

    watcher = Watcher(library, import_paths, settings.watch_interval_s)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        store.open()
        library.open()
        manager.start()
        watcher.start()
        try:
            yield
        finally:
            watcher.stop()
            manager.stop()
            library.close()

    app = FastAPI(
        title="Cardia engine",
        version=API_VERSION,
        summary="Local analysis engine for the Cardia app. Listens on 127.0.0.1 only.",
        lifespan=lifespan,
        docs_url=None,  # the docs pages load scripts from a CDN; read openapi.json instead
        redoc_url=None,
        openapi_url="/api/v1/openapi.json",
    )
    app.state.settings = settings
    app.state.watcher = watcher
    app.state.library = library
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )
    app.add_middleware(OriginGuard, allowed_origins=settings.allowed_origins)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(settings.allowed_hosts))

    public = APIRouter(prefix="/api/v1", tags=["engine"])
    api = APIRouter(
        prefix="/api/v1",
        dependencies=[Depends(require_token)],
        responses={401: {"model": ErrorResponse, "description": "Missing or wrong token"}},
    )

    @public.get("/health", operation_id="getHealth")
    def health() -> Health:
        """Whether the engine is up. The only route that needs no token."""
        return Health(status="ok", api_version=API_VERSION, pipeline_version=pipeline_version, mock=settings.mock)

    @api.get("/engine", operation_id="getEngine", tags=["engine"])
    def engine() -> EngineInfo:
        """Versions, model files, methods and image layers. Use it to check the token works."""
        return info

    # jobs --------------------------------------------------------------------------------------

    @api.post("/jobs", status_code=202, operation_id="createJob", tags=["jobs"])
    def create_job(
        files: Annotated[list[UploadFile], File(description="One or more slice scans (TIFF; PNG or JPG are flagged)")],
        meta: Annotated[
            str | None,
            Form(description="Optional JSON list of UploadMeta, one per file in order: what the user typed"),
        ] = None,
    ) -> Job:
        """Upload scans and start analysing them. Poll GET /jobs/{job_id} for progress.

        Problems with a single file (unsupported type, too large, duplicate) fail that slice, not the job.
        Each slice that is done is filed into the library heart with its heart ID.
        """
        typed: list[UploadMeta | None] = [None] * len(files)
        if meta:
            try:
                typed = _META.validate_python(json.loads(meta))
            except (ValueError, ValidationError) as e:
                raise HTTPException(422, f"meta is not a valid list of UploadMeta: {e}") from e
            if len(typed) != len(files):
                raise HTTPException(422, "meta must have one entry per file.")
        seen: dict = {}
        entries = [ingest(i, f.filename, f.file, m, seen) for i, (f, m) in enumerate(zip(files, typed, strict=True))]
        return Job.model_validate(manager.get(manager.submit(entries)))

    @api.get("/jobs", operation_id="listJobs", tags=["jobs"])
    def list_jobs() -> list[Job]:
        """Jobs since the engine started, newest first."""
        return [Job.model_validate(j) for j in manager.list()]

    @api.get("/jobs/{job_id}", operation_id="getJob", tags=["jobs"], responses=NOT_FOUND)
    def get_job(job_id: JobId) -> Job:
        """A job's state and every slice's progress."""
        return Job.model_validate(_found(manager.get(job_id), "job"))

    @api.post("/jobs/{job_id}/cancel", operation_id="cancelJob", tags=["jobs"], responses=NOT_FOUND)
    def cancel_job(job_id: JobId) -> Job:
        """Stop a job: slices not yet started are cancelled; slices already running finish and are kept."""
        if not manager.cancel(job_id):
            raise HTTPException(404, "No such job.")
        return Job.model_validate(manager.get(job_id))

    # slices ------------------------------------------------------------------------------------

    @api.get("/slices", operation_id="listSlices", tags=["slices"])
    def list_slices() -> list[SliceResult]:
        """Every stored slice result, newest first."""
        return [SliceResult.model_validate(r) for r in store.list_results()]

    @api.get("/slices/{slice_id}", operation_id="getSlice", tags=["slices"], responses=NOT_FOUND)
    def get_slice(slice_id: SliceId) -> SliceResult:
        """One slice's numbers, QC flags, versions and layer names."""
        return SliceResult.model_validate(_found(store.read_result(slice_id), "slice"))

    @api.get(
        "/slices/{slice_id}/layers/{layer}",
        operation_id="getSliceLayer",
        tags=["slices"],
        response_class=FileResponse,
        responses={200: {"content": {"image/png": {}}, "description": "PNG, full resolution"}, **NOT_FOUND},
    )
    def get_layer(slice_id: SliceId, layer: Layer):
        """A layer image. Fetch it with the token header and show it through URL.createObjectURL.

        Results never change, so the response may be cached for good.
        """
        path = store.layer_path(slice_id, layer.value)
        if not path.exists():
            raise HTTPException(404, "No such slice.")
        return FileResponse(
            path, media_type="image/png", headers={"Cache-Control": "private, max-age=31536000, immutable"}
        )

    # hearts (the library) ----------------------------------------------------------------------

    @api.get("/hearts", operation_id="listHearts", tags=["hearts"])
    def list_hearts(
        q: Annotated[
            str | None, Query(max_length=200, description="Text in label, group, operator, notes, tags")
        ] = None,
        group: Annotated[str | None, Query(max_length=100)] = None,
        tag: Annotated[str | None, Query(max_length=100)] = None,
        favourite: bool | None = None,
        trash: Annotated[bool, Query(description="List the hearts in the trash instead")] = False,
    ) -> list[Heart]:
        """Library hearts, most recently changed first."""
        hearts = library.list_hearts(q=q, group=group, tag=tag, favourite=favourite, trash=trash)
        return [heart_record(h, store) for h in hearts]

    @api.get("/hearts/{heart_key}", operation_id="getHeart", tags=["hearts"], responses=NOT_FOUND)
    def get_heart(heart_key: HeartKey) -> Heart:
        """One heart: details, slices in order, and its numbers."""
        return heart_record(_found(library.get_heart(heart_key), "heart"), store)

    @api.patch("/hearts/{heart_key}", operation_id="updateHeart", tags=["hearts"], responses=NOT_FOUND)
    def update_heart(heart_key: HeartKey, change: HeartUpdate) -> Heart:
        """Change experiment details, tags, favourite, slice order or typed weights. Only fields sent change."""
        sent = change.model_dump(exclude_unset=True)
        slices = sent.pop("slices", None)
        try:
            heart = library.update_heart(heart_key, sent, slices)
        except ValueError as e:
            raise HTTPException(422, str(e)) from e
        return heart_record(_found(heart, "heart"), store)

    @api.delete("/hearts/{heart_key}", operation_id="trashHeart", tags=["hearts"], responses=NOT_FOUND)
    def trash_heart(heart_key: HeartKey) -> Heart:
        """Move a heart to the trash. It can be restored for 30 days."""
        return heart_record(_found(library.trash_heart(heart_key), "heart"), store)

    @api.post("/hearts/{heart_key}/restore", operation_id="restoreHeart", tags=["hearts"], responses=NOT_FOUND)
    def restore_heart(heart_key: HeartKey) -> Heart:
        """Take a heart out of the trash."""
        return heart_record(_found(library.trash_heart(heart_key, restore=True), "heart"), store)

    @api.post(
        "/hearts/summary",
        operation_id="summariseHeart",
        tags=["hearts"],
        responses={**NOT_FOUND, 409: {"model": ErrorResponse}},
    )
    def summarise_heart(req: HeartSummaryRequest) -> HeartSummary:
        """Heart numbers from any slices (PLAN.md §2g). Weights typed by the user override the file names'."""
        ids = [ref.slice_id for ref in req.slices]
        if len(set(ids)) != len(ids):
            raise HTTPException(422, "List each slice once.")
        results = []
        for ref in req.slices:
            if not re.fullmatch(r"[0-9a-f]{24}", ref.slice_id) or (r := store.read_result(ref.slice_id)) is None:
                raise HTTPException(404, f"No such slice: {ref.slice_id}")
            results.append(r)
        weights = [
            ref.weight_mg if ref.weight_mg is not None else r["weight_mg"] for r, ref in zip(results, req.slices)
        ]
        try:
            return summarise(results, weights, req.heart_id)
        except MixedVersions as e:
            raise HTTPException(409, str(e)) from e

    # settings and the watch folder -------------------------------------------------------------

    @api.get("/settings", operation_id="getSettings", tags=["settings"])
    def get_settings() -> AppSettings:
        """The app's settings (defaults until changed)."""
        stored = library.get_settings()
        return AppSettings.model_validate({k: v for k, v in stored.items() if k in AppSettings.model_fields})

    @api.put("/settings", operation_id="putSettings", tags=["settings"])
    def put_settings(new: AppSettings) -> AppSettings:
        """Replace the settings. Choosing a watch folder takes effect within seconds."""
        library.set_settings(new.model_dump())
        return new

    @api.get("/watch", operation_id="getWatchStatus", tags=["settings"])
    def watch_status() -> WatchStatus:
        """Whether the watch folder is being watched, and what it imported since the engine started."""
        return WatchStatus.model_validate(watcher.status())

    app.include_router(public)
    app.include_router(api)
    return app


def _error(code: str, message: str) -> dict:
    return {"code": code, "message": message}


def _found(value, what: str):
    if value is None:
        raise HTTPException(404, f"No such {what}.")
    return value
