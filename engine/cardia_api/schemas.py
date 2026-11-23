"""The engine API contract (published as `cardia_api/openapi.json`).

Percentages are 0-100 and `None` (JSON null) when a method found no tissue. Pixel counts are of the
full-resolution scan. mm² values are `None` when the image has no DPI.
"""

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

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


class Health(BaseModel):
    status: Literal["ok"]
    api_version: str
    pipeline_version: str
    mock: bool


class ModelFile(BaseModel):
    file: str = Field(description="Path inside engine/models/, e.g. kmeans_rf/kmeans_rf.joblib")
    version: str
    sha256: str


class MethodInfo(BaseModel):
    key: Literal["a", "b"]
    name: str = Field(description='Label to show, e.g. "Method A: K-Means + RF"')
    dead_rule: str
    unsure_rule: str = Field(description="Method A: unsure tissue; Method B: borderline tissue")
    range_shown: bool = Field(description="Whether reports show this method's range (PLAN.md §2g)")


class LayerInfo(BaseModel):
    key: Layer
    kind: Literal["photo", "mask", "heatmap"] = Field(
        description="photo: RGB PNG. mask: PNG that is white where true and transparent elsewhere (tint it with "
        "CSS mask-image). heatmap: RGBA PNG, viridis colour map from p = 0 (dark blue) to 1 (yellow), "
        "transparent outside the tissue."
    )
    title: str
    description: str


class EngineInfo(BaseModel):
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


class TissueResult(BaseModel):
    tissue_px: int = Field(description="Shared tissue (Method A's), real holes removed, uncertain holes kept")
    tissue_mm2: float | None
    holes_removed_px: int
    holes_uncertain_px: int
    filled_px: int = Field(description="Enclosed gaps filled in as tissue (glare, very pale tissue)")


class PctRange(BaseModel):
    low_pct: float | None
    high_pct: float | None
    shown: bool = Field(description="Show this range in reports. For now only Method B's is shown (PLAN.md §2g)")


class MethodAResult(BaseModel):
    dead_pct: float | None = Field(description="Dead share of the shared tissue: p >= 0.5")
    dead_px: int
    dead_mg: float | None = Field(description="dead_pct x slice weight; null without a weight")
    unsure_pct: float | None = Field(description="0.35 < p < 0.65")
    many_unsure: bool = Field(description="More than 15% of the tissue is unsure")
    range: PctRange


class MethodBResult(BaseModel):
    tissue_px: int = Field(description="Method B's own outline, real holes removed")
    tissue_mm2: float | None
    dead_pct: float | None = Field(description="Dead share of Method B's tissue: a* below the conservative cut")
    dead_px: int
    dead_mg: float | None
    borderline_pct: float | None = Field(description="a* between the conservative and the liberal cut")
    borderline_px: int
    range: PctRange


class SliceResult(BaseModel):
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


class SliceError(BaseModel):
    code: SliceErrorCode
    message: str


class JobSlice(BaseModel):
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


class JobCounts(BaseModel):
    total: int
    queued: int
    running: int
    done: int
    failed: int
    cancelled: int


class Job(BaseModel):
    job_id: str
    state: Literal["queued", "running", "done", "cancelled"] = Field(
        description="done: every slice is done or failed. cancelled: cancel was asked; slices already running finish"
    )
    created_at: datetime
    finished_at: datetime | None
    progress: float = Field(ge=0, le=1)
    counts: JobCounts
    slices: list[JobSlice]


class HeartSliceRef(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slice_id: str
    weight_mg: float | None = Field(default=None, gt=0, description="Overrides the weight from the file name")


class HeartSummaryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    heart_id: str | None = Field(default=None, description="Defaults to the first slice's heart_id")
    slices: list[HeartSliceRef] = Field(min_length=1)


class HeartMethodA(BaseModel):
    dead_pct: float | None
    dead_mg: float | None
    unsure_pct: float | None
    range: PctRange


class HeartMethodB(BaseModel):
    dead_pct: float | None
    dead_mg: float | None
    borderline_pct: float | None
    range: PctRange


class HeartSummary(BaseModel):
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


class ErrorResponse(BaseModel):
    detail: str
