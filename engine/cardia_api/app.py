"""The engine's HTTP API (PLAN.md §6). Every route is under /api/v1; the contract is `openapi.json`."""

import re
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, Path, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from ttc_pipeline import PIPELINE_VERSION, Models, heart_numbers, parse_name
from ttc_pipeline.method_b import ACuts

from . import API_VERSION
from .catalog import LAYERS, RANGE_SHOWN, methods
from .jobs import Entry, JobManager
from .mock import MOCK_PIPELINE_VERSION
from .schemas import (
    EngineInfo,
    ErrorResponse,
    Health,
    HeartSummary,
    HeartSummaryRequest,
    Job,
    Layer,
    SliceResult,
)
from .security import OriginGuard, require_token
from .settings import ACCEPTED_SUFFIXES, Settings
from .store import FileTooLarge, Store
from .worker import model_files

JobId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]
SliceId = Annotated[str, Path(pattern=r"^[0-9a-f]{24}$")]
NOT_FOUND = {404: {"model": ErrorResponse}}


def create_app(settings: Settings) -> FastAPI:
    """Build the app. Outside mock mode this loads every model file first, so a bad one stops the launch."""
    models = None if settings.mock else Models.load(settings.models_dir)
    cuts = models.cuts if models else ACuts.load(settings.models_dir)
    pipeline_version = MOCK_PIPELINE_VERSION if settings.mock else PIPELINE_VERSION
    manifest_sha256 = models.manifest_sha256 if models else None
    store = Store(settings.data_dir)
    manager = JobManager(settings, store, pipeline_version, manifest_sha256)
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

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        store.open()
        manager.start()
        try:
            yield
        finally:
            manager.stop()

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
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_methods=["GET", "POST"],
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

    @api.post("/jobs", status_code=202, operation_id="createJob", tags=["jobs"])
    def create_job(
        files: Annotated[list[UploadFile], File(description="One or more slice scans (TIFF; PNG or JPG are flagged)")],
    ) -> Job:
        """Upload scans and start analysing them. Poll GET /jobs/{job_id} for progress.

        Problems with a single file (unsupported type, too large, duplicate) fail that slice, not the job.
        """
        entries, seen = [], {}
        for i, upload in enumerate(files):
            name = re.split(r"[\\/]", upload.filename or "")[-1] or f"file-{i + 1}"
            heart_id, weight = parse_name(name)
            entry = Entry(index=i, file_name=name, heart_id=heart_id, weight_mg=weight)
            suffix = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
            if suffix not in ACCEPTED_SUFFIXES:
                entry.error = _error("unsupported_file", f"{suffix or 'Files without an extension'} is not supported")
            else:
                try:
                    entry.image_sha256, path = store.save_upload(upload.file, suffix, settings.max_upload_bytes)
                except FileTooLarge:
                    entry.error = _error("file_too_large", f"Larger than {settings.max_upload_bytes // 2**20} MB")
                else:
                    entry.image_path = str(path)
                    if entry.image_sha256 in seen:
                        entry.error = _error("duplicate", f"Same image as {seen[entry.image_sha256]}")
                    else:
                        seen[entry.image_sha256] = name
                        entry.slice_id = manager.slice_id(entry.image_sha256, name)
            entries.append(entry)
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

    @api.post(
        "/hearts/summary",
        operation_id="summariseHeart",
        tags=["hearts"],
        responses={**NOT_FOUND, 409: {"model": ErrorResponse}},
    )
    def summarise_heart(req: HeartSummaryRequest) -> HeartSummary:
        """Heart numbers from its slices (PLAN.md §2g). Weights typed by the user override the file names'."""
        ids = [ref.slice_id for ref in req.slices]
        if len(set(ids)) != len(ids):
            raise HTTPException(422, "List each slice once.")
        results = []
        for ref in req.slices:
            if not re.fullmatch(r"[0-9a-f]{24}", ref.slice_id) or (r := store.read_result(ref.slice_id)) is None:
                raise HTTPException(404, f"No such slice: {ref.slice_id}")
            results.append(r)
        if len({(r["pipeline_version"], r["models_manifest_sha256"]) for r in results}) > 1:
            raise HTTPException(409, "These slices were analysed with different pipeline versions or models.")
        hn = heart_numbers([_heart_row(r, ref.weight_mg) for r, ref in zip(results, req.slices, strict=True)])
        flags = list(hn.flags) + (["mixed_heart_ids"] if len({r["heart_id"] for r in results}) > 1 else [])
        return HeartSummary(
            heart_id=req.heart_id or results[0]["heart_id"],
            slice_ids=ids,
            weighting=hn.weighting,
            total_weight_mg=hn.total_weight_mg,
            flags=flags,
            pipeline_version=results[0]["pipeline_version"],
            models_manifest_sha256=results[0]["models_manifest_sha256"],
            mock=results[0]["mock"],
            method_a={
                "dead_pct": hn.pct["a_dead_pct"],
                "dead_mg": hn.a_dead_mg,
                "unsure_pct": hn.pct["a_unsure_pct"],
                "range": {"low_pct": hn.pct["a_low_pct"], "high_pct": hn.pct["a_high_pct"], "shown": RANGE_SHOWN["a"]},
            },
            method_b={
                "dead_pct": hn.pct["b_dead_pct"],
                "dead_mg": hn.b_dead_mg,
                "borderline_pct": hn.pct["b_borderline_pct"],
                "range": {"low_pct": hn.pct["b_low_pct"], "high_pct": hn.pct["b_high_pct"], "shown": RANGE_SHOWN["b"]},
            },
        )

    app.include_router(public)
    app.include_router(api)
    return app


def _error(code: str, message: str) -> dict:
    return {"code": code, "message": message}


def _found(value, what: str):
    if value is None:
        raise HTTPException(404, f"No such {what}.")
    return value


def _nan(x):
    return float("nan") if x is None else x


def _heart_row(r: dict, weight_override: float | None) -> dict:
    a, b = r["method_a"], r["method_b"]
    return {
        "weight_mg": weight_override if weight_override is not None else r["weight_mg"],
        "tissue_px": r["tissue"]["tissue_px"],
        "b_tissue_px": b["tissue_px"],
        "a_dead_pct": _nan(a["dead_pct"]),
        "a_unsure_pct": _nan(a["unsure_pct"]),
        "a_low_pct": _nan(a["range"]["low_pct"]),
        "a_high_pct": _nan(a["range"]["high_pct"]),
        "b_dead_pct": _nan(b["dead_pct"]),
        "b_borderline_pct": _nan(b["borderline_pct"]),
        "b_low_pct": _nan(b["range"]["low_pct"]),
        "b_high_pct": _nan(b["range"]["high_pct"]),
    }
