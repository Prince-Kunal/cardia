"""The engine API contract (published as `cardia_api/openapi.json`).

Percentages are 0-100 and `None` (JSON null) when a method found no tissue. Pixel counts are of the
full-resolution scan. mm² values are `None` when the image has no DPI.
"""

from datetime import date, datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Model(BaseModel):
    # In responses every field is always present, so mark fields with defaults as required there too.
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)


QcFlag = Literal["unvalidated_input", "many_unsure", "holes_removed", "uncertain_holes"]
SliceErrorCode = Literal[
    "unsupported_file", "file_too_large", "duplicate", "unreadable_image", "analysis_failed", "engine_stopped"
]


class Layer(StrEnum):
    original = "original"
    corrected = "corrected"
    tissue = "tissue"
    holes_removed = "holes_removed"
    holes_uncertain = "holes_uncertain"
    filled = "filled"
    a_dead = "a_dead"
    a_unsure = "a_unsure"
    a_probability = "a_probability"
    b_tissue = "b_tissue"
    b_dead = "b_dead"
    b_borderline = "b_borderline"


class Health(Model):
    status: Literal["ok"]
    api_version: str
    pipeline_version: str
    mock: bool


class ModelFile(Model):
    file: str = Field(description="Path inside engine/models/, e.g. kmeans_rf/kmeans_rf.joblib")
    version: str
    sha256: str


class MethodInfo(Model):
    key: Literal["a", "b"]
    name: str = Field(description='Label to show, e.g. "Method A: K-Means + RF"')
    dead_rule: str
    unsure_rule: str = Field(description="Method A: unsure tissue; Method B: borderline tissue")
    range_shown: bool = Field(description="Whether reports show this method's range (PLAN.md §2g)")


class LayerInfo(Model):
    key: Layer
    kind: Literal["photo", "mask", "heatmap"] = Field(
        description="photo: RGB PNG. mask: PNG that is white where true and transparent elsewhere (tint it with "
        "CSS mask-image). heatmap: RGBA PNG, viridis colour map from p = 0 (dark blue) to 1 (yellow), "
        "transparent outside the tissue."
    )
    title: str
    description: str


class EngineInfo(Model):
    api_version: str
    pipeline_version: str
    mock: bool = Field(description="True when the engine runs the fake analysis for UI work (numbers are made up)")
    models_manifest_sha256: str | None
    models: list[ModelFile]
    methods: list[MethodInfo]
    layers: list[LayerInfo]
    accepted_extensions: list[str]
    max_upload_mb: int
    workers: int


class TissueResult(Model):
    tissue_px: int = Field(description="Shared tissue (Method A's), real holes removed, uncertain holes kept")
    tissue_mm2: float | None
    holes_removed_px: int
    holes_uncertain_px: int
    filled_px: int = Field(description="Enclosed gaps filled in as tissue (glare, very pale tissue)")


class PctRange(Model):
    low_pct: float | None
    high_pct: float | None
    shown: bool = Field(description="Show this range in reports. For now only Method B's is shown (PLAN.md §2g)")


class MethodAResult(Model):
    dead_pct: float | None = Field(description="Dead share of the shared tissue: p >= 0.5")
    dead_px: int
    dead_mg: float | None = Field(description="dead_pct x slice weight; null without a weight")
    unsure_pct: float | None = Field(description="0.35 < p < 0.65")
    many_unsure: bool = Field(description="More than 15% of the tissue is unsure")
    range: PctRange


class MethodBResult(Model):
    tissue_px: int = Field(description="Method B's own outline, real holes removed")
    tissue_mm2: float | None
    dead_pct: float | None = Field(description="Dead share of Method B's tissue: a* below the conservative cut")
    dead_px: int
    dead_mg: float | None
    borderline_pct: float | None = Field(description="a* between the conservative and the liberal cut")
    borderline_px: int
    range: PctRange


class SliceResult(Model):
    slice_id: str = Field(description="Same image, file name, pipeline and models give the same slice_id")
    file_name: str
    heart_id: str = Field(description="From names like 206IS89mg.tif; otherwise the file name without extension")
    weight_mg: float | None = Field(description="From the file name; null if it has none")
    image_sha256: str
    width_px: int
    height_px: int
    dpi: list[float] | None = Field(description="[x, y] from the image file; null if it has none")
    mm2_per_px: float | None
    analysed_at: datetime
    pipeline_version: str
    models_manifest_sha256: str | None
    models: list[ModelFile]
    mock: bool
    tissue: TissueResult
    method_a: MethodAResult
    method_b: MethodBResult
    qc_flags: list[QcFlag]
    layers: list[Layer]


class SliceError(Model):
    code: SliceErrorCode
    message: str


class JobSlice(Model):
    index: int = Field(description="Position in the upload")
    file_name: str
    heart_id: str
    weight_mg: float | None
    image_sha256: str | None
    state: Literal["queued", "running", "done", "failed", "cancelled"]
    stage: Literal["reading", "front_end", "method_a", "method_b", "layers"] | None = Field(
        description="While running: the step in progress"
    )
    progress: float = Field(ge=0, le=1)
    slice_id: str | None = Field(description="Set when done: GET /api/v1/slices/{slice_id}")
    cached: bool = Field(description="The result already existed, so nothing was re-analysed")
    error: SliceError | None
    heart_key: str | None = Field(description="Set when the job has finished: the library heart it was filed into")
    seconds: float | None = Field(description="Analysis time in seconds (null if cached or not finished)")


class JobCounts(Model):
    total: int
    queued: int
    running: int
    done: int
    failed: int
    cancelled: int


class Job(Model):
    job_id: str
    source: Literal["upload", "watch_folder"]
    state: Literal["queued", "running", "done", "cancelled"] = Field(
        description="done: every slice is done or failed. cancelled: cancel was asked; slices already running finish"
    )
    created_at: datetime
    finished_at: datetime | None
    progress: float = Field(ge=0, le=1)
    counts: JobCounts
    slices: list[JobSlice]


class HeartSliceRef(Model):
    model_config = ConfigDict(extra="forbid")
    slice_id: str
    weight_mg: float | None = Field(default=None, gt=0, description="Overrides the weight from the file name")


class HeartSummaryRequest(Model):
    model_config = ConfigDict(extra="forbid")
    heart_id: str | None = Field(default=None, description="Defaults to the first slice's heart_id")
    slices: list[HeartSliceRef] = Field(min_length=1)


class HeartMethodA(Model):
    dead_pct: float | None
    dead_mg: float | None
    unsure_pct: float | None
    range: PctRange


class HeartMethodB(Model):
    dead_pct: float | None
    dead_mg: float | None
    borderline_pct: float | None
    range: PctRange


class HeartSummary(Model):
    heart_id: str
    slice_ids: list[str]
    weighting: Literal["slice_weight", "tissue_area"] = Field(
        description="Slice percentages are weighted by slice weight, or by tissue area when any weight is missing"
    )
    total_weight_mg: float | None
    flags: list[Literal["weights_missing", "mixed_heart_ids"]]
    pipeline_version: str
    models_manifest_sha256: str | None
    mock: bool
    method_a: HeartMethodA
    method_b: HeartMethodB


class UploadMeta(Model):
    """What the user typed at import for one file (createJob's `meta`, in file order)."""

    model_config = ConfigDict(extra="forbid")
    heart_id: str | None = Field(default=None, min_length=1, max_length=100, description="Overrides the file name's")
    weight_mg: float | None = Field(default=None, gt=0, description="Overrides the file name's")


class HeartSlice(Model):
    slice_id: str
    position: int = Field(description="Order in the heart, from 0 (apex to base when the user has ordered them)")
    file_name: str
    weight_mg: float | None = Field(description="The typed weight, else the file name's")
    weight_source: Literal["typed", "file_name"] | None
    method_a_dead_pct: float | None
    method_b_dead_pct: float | None
    qc_flags: list[QcFlag]


class HeartDetails(Model):
    """Experiment details the user may type (PLAN.md §1b). All optional except the label."""

    label: str = Field(min_length=1, max_length=100, description="The heart ID, e.g. 206")
    group: str | None = Field(default=None, max_length=100, description="e.g. control, treatment")
    ischemia_min: float | None = Field(default=None, ge=0)
    reperfusion_min: float | None = Field(default=None, ge=0)
    experiment_date: date | None = None
    operator: str | None = Field(default=None, max_length=100)
    heart_weight_mg: float | None = Field(default=None, gt=0)
    notes: str | None = Field(default=None, max_length=10000)
    tags: list[str] = Field(default_factory=list, max_length=50)
    favourite: bool = False


class Heart(HeartDetails):
    heart_key: str = Field(description="The library's ID for this heart")
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = Field(description="Set while the heart is in the trash")
    purge_after: datetime | None = Field(description="When a heart in the trash is removed for good (30 days)")
    slices: list[HeartSlice]
    summary: HeartSummary | None = Field(
        description="Heart numbers; null without slices, or when they come from different pipeline versions"
    )


class MethodsParagraph(Model):
    """A Methods paragraph for one method (PLAN.md §1d): what was done, with versions and model hashes."""

    method: Literal["a", "b"]
    name: str = Field(description='e.g. "Method A: K-Means + RF"')
    text: str = Field(description="English. For demo (--mock) results, a warning instead of a paragraph")
    mock: bool


class HeartSliceUpdate(Model):
    model_config = ConfigDict(extra="forbid")
    slice_id: str
    weight_mg: float | None = Field(default=None, gt=0, description="A typed weight; null uses the file name's")


class HeartUpdate(Model):
    """Only the fields sent change. `slices` is the heart's new slice list, in order; slices left out are
    taken out of the heart (their results are kept)."""

    model_config = ConfigDict(extra="forbid")
    label: str | None = Field(default=None, min_length=1, max_length=100)
    group: str | None = Field(default=None, max_length=100)
    ischemia_min: float | None = Field(default=None, ge=0)
    reperfusion_min: float | None = Field(default=None, ge=0)
    experiment_date: date | None = None
    operator: str | None = Field(default=None, max_length=100)
    heart_weight_mg: float | None = Field(default=None, gt=0)
    notes: str | None = Field(default=None, max_length=10000)
    tags: list[str] | None = Field(default=None, max_length=50)
    favourite: bool | None = None
    slices: list[HeartSliceUpdate] | None = None

    @field_validator("label", "tags", "favourite")
    @classmethod
    def not_null(cls, v):
        if v is None:
            raise ValueError("may be left out, but not null")
        return v


class AppSettings(Model):
    """Settings screen (PLAN.md §9 screen 11). Kept by the engine, so every browser sees the same."""

    model_config = ConfigDict(extra="forbid")
    headline_method: Literal["a", "b"] = Field(default="a", description="The method reports lead with (PLAN.md §2g)")
    theme: Literal["system", "light", "dark"] = "system"
    language: str = Field(default="en", pattern=r"^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$", description="App language")
    report_language: str = Field(default="en", pattern=r"^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$")
    reduced_motion: bool = False
    watch_folder: str | None = Field(default=None, description="Absolute path of the folder to watch for new scans")
    watch_enabled: bool = False

    @field_validator("watch_folder")
    @classmethod
    def absolute(cls, v):
        if v is not None and not (v.startswith("/") or (len(v) > 2 and v[1] == ":")):
            raise ValueError("must be an absolute path")
        return v


class WatchStatus(Model):
    state: Literal["off", "watching", "folder_missing"]
    folder: str | None
    last_scan_at: datetime | None
    files_imported: int = Field(description="Files imported from the folder since the engine started")
    last_job_id: str | None


class StudyHeart(Model):
    heart_id: str
    slices: int
    total_weight_mg: float | None
    method_a_dead_pct: float | None
    method_b_dead_pct: float | None


class StudySet(Model):
    """The hearts the pipeline was checked on (PLAN.md §1d), as context for a report. Compare a heart with
    them only when it was measured with the same pipeline version and model files."""

    pipeline_version: str
    models_manifest_sha256: str | None
    hearts: list[StudyHeart]


class DemoScan(Model):
    name: str = Field(description="The file name, which gives the heart ID and the slice weight")
    size_bytes: int


class DemoHeart(Model):
    """The demo heart for the walkthrough (PLAN.md §1h): real scans of one study heart, bundled with the
    engine. Fetch each scan from GET /demo/{name} and import it like any other."""

    heart_id: str
    group: str = Field(description="The study group: infarct or timecontrol")
    scans: list[DemoScan]


class RestoreReport(Model):
    """What a restore added. Restoring never overwrites: hearts already here are skipped."""

    hearts_added: int
    hearts_skipped: int = Field(description="Hearts already in this library (by key), or whose slices all are")
    slices_added: int
    slice_results_copied: int
    images_copied: int
    backup_created_at: datetime | None


class SyncWorkspace(Model):
    id: str
    name: str
    kind: Literal["personal", "lab"]
    role: Literal["owner", "editor", "viewer"]
    upload_images: bool = Field(description="Original scans are uploaded too (opt-in per workspace)")


class SyncDevice(Model):
    id: str
    name: str
    app_version: str | None = None
    last_seen_at: datetime | None = None
    this_device: bool


class SyncStatus(Model):
    """Cloud sync (PLAN.md §5). `not_configured` until the engine has a cloud to sync with."""

    state: Literal["not_configured", "signed_out", "syncing", "synced", "offline", "error"]
    backend: Literal["supabase", "memory"] | None = Field(
        description='"memory": --fake-cloud, nothing leaves this engine'
    )
    email: str | None
    workspace: SyncWorkspace | None
    workspaces: list[SyncWorkspace]
    read_only: bool = Field(description="A viewer: this computer pulls but does not send")
    pending: int = Field(description="Changes here not yet sent")
    last_sync_at: datetime | None
    error: str | None
    devices: list[SyncDevice]


class SyncSignIn(Model):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+$")
    password: str = Field(min_length=6, max_length=200)
    create_account: bool = False


class SyncWorkspaceChoice(Model):
    model_config = ConfigDict(extra="forbid")
    workspace_id: str


class SyncNewWorkspace(Model):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=100)


class LearnProgressDoc(Model):
    """The Learn section's progress, kept by the engine so it can sync (the app merges before sending)."""

    progress: dict | None
    updated_at: datetime | None = None


class ErrorResponse(Model):
    detail: str
