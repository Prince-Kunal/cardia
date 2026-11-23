// Generated from engine/cardia_api/openapi.json by `uv run python -m cardia_api.openapi`. Do not edit.
// Cardia engine API 0.2.0.

export const API_VERSION = "0.2.0";

/** Settings screen (PLAN.md §9 screen 11). Kept by the engine, so every browser sees the same. */
export interface AppSettingsInput {
  /** The method reports lead with (PLAN.md §2g) */
  headline_method?: "a" | "b";
  theme?: "system" | "light" | "dark";
  /** App language */
  language?: string;
  report_language?: string;
  reduced_motion?: boolean;
  /** Absolute path of the folder to watch for new scans */
  watch_folder?: string | null;
  watch_enabled?: boolean;
}

/** Settings screen (PLAN.md §9 screen 11). Kept by the engine, so every browser sees the same. */
export interface AppSettings {
  /** The method reports lead with (PLAN.md §2g) */
  headline_method: "a" | "b";
  theme: "system" | "light" | "dark";
  /** App language */
  language: string;
  report_language: string;
  reduced_motion: boolean;
  /** Absolute path of the folder to watch for new scans */
  watch_folder: string | null;
  watch_enabled: boolean;
}

export interface EngineInfo {
  api_version: string;
  pipeline_version: string;
  /** True when the engine runs the fake analysis for UI work (numbers are made up) */
  mock: boolean;
  models_manifest_sha256: string | null;
  models: ModelFile[];
  methods: MethodInfo[];
  layers: LayerInfo[];
  accepted_extensions: string[];
  max_upload_mb: number;
  workers: number;
}

export interface ErrorResponse {
  detail: string;
}

export interface Health {
  status: "ok";
  api_version: string;
  pipeline_version: string;
  mock: boolean;
}

export interface Heart {
  /** The heart ID, e.g. 206 */
  label: string;
  /** e.g. control, treatment */
  group: string | null;
  ischemia_min: number | null;
  reperfusion_min: number | null;
  experiment_date: string | null;
  operator: string | null;
  heart_weight_mg: number | null;
  notes: string | null;
  tags: string[];
  favourite: boolean;
  /** The library's ID for this heart */
  heart_key: string;
  created_at: string;
  updated_at: string;
  /** Set while the heart is in the trash */
  deleted_at: string | null;
  /** When a heart in the trash is removed for good (30 days) */
  purge_after: string | null;
  slices: HeartSlice[];
  /** Heart numbers; null without slices, or when they come from different pipeline versions */
  summary: HeartSummary | null;
}

export interface HeartMethodA {
  dead_pct: number | null;
  dead_mg: number | null;
  unsure_pct: number | null;
  range: PctRange;
}

export interface HeartMethodB {
  dead_pct: number | null;
  dead_mg: number | null;
  borderline_pct: number | null;
  range: PctRange;
}

export interface HeartSlice {
  slice_id: string;
  /** Order in the heart, from 0 (apex to base when the user has ordered them) */
  position: number;
  file_name: string;
  /** The typed weight, else the file name's */
  weight_mg: number | null;
  weight_source: "typed" | "file_name" | null;
  method_a_dead_pct: number | null;
  method_b_dead_pct: number | null;
  qc_flags: ("unvalidated_input" | "many_unsure" | "holes_removed" | "uncertain_holes")[];
}

export interface HeartSliceRef {
  slice_id: string;
  /** Overrides the weight from the file name */
  weight_mg?: number | null;
}

export interface HeartSliceUpdate {
  slice_id: string;
  /** A typed weight; null uses the file name's */
  weight_mg?: number | null;
}

export interface HeartSummary {
  heart_id: string;
  slice_ids: string[];
  /** Slice percentages are weighted by slice weight, or by tissue area when any weight is missing */
  weighting: "slice_weight" | "tissue_area";
  total_weight_mg: number | null;
  flags: ("weights_missing" | "mixed_heart_ids")[];
  pipeline_version: string;
  models_manifest_sha256: string | null;
  mock: boolean;
  method_a: HeartMethodA;
  method_b: HeartMethodB;
}

export interface HeartSummaryRequest {
  /** Defaults to the first slice's heart_id */
  heart_id?: string | null;
  slices: HeartSliceRef[];
}

/** Only the fields sent change. `slices` is the heart's new slice list, in order; slices left out are taken out of the heart (their results are kept). */
export interface HeartUpdate {
  label?: string | null;
  group?: string | null;
  ischemia_min?: number | null;
  reperfusion_min?: number | null;
  experiment_date?: string | null;
  operator?: string | null;
  heart_weight_mg?: number | null;
  notes?: string | null;
  tags?: string[] | null;
  favourite?: boolean | null;
  slices?: HeartSliceUpdate[] | null;
}

export interface Job {
  job_id: string;
  source: "upload" | "watch_folder";
  /** done: every slice is done or failed. cancelled: cancel was asked; slices already running finish */
  state: "queued" | "running" | "done" | "cancelled";
  created_at: string;
  finished_at: string | null;
  progress: number;
  counts: JobCounts;
  slices: JobSlice[];
}

export interface JobCounts {
  total: number;
  queued: number;
  running: number;
  done: number;
  failed: number;
  cancelled: number;
}

export interface JobSlice {
  /** Position in the upload */
  index: number;
  file_name: string;
  heart_id: string;
  weight_mg: number | null;
  image_sha256: string | null;
  state: "queued" | "running" | "done" | "failed" | "cancelled";
  /** While running: the step in progress */
  stage: "reading" | "front_end" | "method_a" | "method_b" | "layers" | null;
  progress: number;
  /** Set when done: GET /api/v1/slices/{slice_id} */
  slice_id: string | null;
  /** The result already existed, so nothing was re-analysed */
  cached: boolean;
  error: SliceError | null;
  /** Set when the job has finished: the library heart it was filed into */
  heart_key: string | null;
  /** Analysis time in seconds (null if cached or not finished) */
  seconds: number | null;
}

export type Layer = "original" | "corrected" | "tissue" | "holes_removed" | "holes_uncertain" | "filled" | "a_dead" | "a_unsure" | "a_probability" | "b_tissue" | "b_dead" | "b_borderline";

export interface LayerInfo {
  key: Layer;
  /** photo: RGB PNG. mask: PNG that is white where true and transparent elsewhere (tint it with CSS mask-image). heatmap: RGBA PNG, viridis colour map from p = 0 (dark blue) to 1 (yellow), transparent outside the tissue. */
  kind: "photo" | "mask" | "heatmap";
  title: string;
  description: string;
}

export interface MethodAResult {
  /** Dead share of the shared tissue: p >= 0.5 */
  dead_pct: number | null;
  dead_px: number;
  /** dead_pct x slice weight; null without a weight */
  dead_mg: number | null;
  /** 0.35 < p < 0.65 */
  unsure_pct: number | null;
  /** More than 15% of the tissue is unsure */
  many_unsure: boolean;
  range: PctRange;
}

export interface MethodBResult {
  /** Method B's own outline, real holes removed */
  tissue_px: number;
  tissue_mm2: number | null;
  /** Dead share of Method B's tissue: a* below the conservative cut */
  dead_pct: number | null;
  dead_px: number;
  dead_mg: number | null;
  /** a* between the conservative and the liberal cut */
  borderline_pct: number | null;
  borderline_px: number;
  range: PctRange;
}

export interface MethodInfo {
  key: "a" | "b";
  /** Label to show, e.g. "Method A: K-Means + RF" */
  name: string;
  dead_rule: string;
  /** Method A: unsure tissue; Method B: borderline tissue */
  unsure_rule: string;
  /** Whether reports show this method's range (PLAN.md §2g) */
  range_shown: boolean;
}

export interface ModelFile {
  /** Path inside engine/models/, e.g. kmeans_rf/kmeans_rf.joblib */
  file: string;
  version: string;
  sha256: string;
}

export interface PctRange {
  low_pct: number | null;
  high_pct: number | null;
  /** Show this range in reports. For now only Method B's is shown (PLAN.md §2g) */
  shown: boolean;
}

export interface SliceError {
  code: "unsupported_file" | "file_too_large" | "duplicate" | "unreadable_image" | "analysis_failed" | "engine_stopped";
  message: string;
}

export interface SliceResult {
  /** Same image, file name, pipeline and models give the same slice_id */
  slice_id: string;
  file_name: string;
  /** From names like 206IS89mg.tif; otherwise the file name without extension */
  heart_id: string;
  /** From the file name; null if it has none */
  weight_mg: number | null;
  image_sha256: string;
  width_px: number;
  height_px: number;
  /** [x, y] from the image file; null if it has none */
  dpi: number[] | null;
  mm2_per_px: number | null;
  analysed_at: string;
  pipeline_version: string;
  models_manifest_sha256: string | null;
  models: ModelFile[];
  mock: boolean;
  tissue: TissueResult;
  method_a: MethodAResult;
  method_b: MethodBResult;
  qc_flags: ("unvalidated_input" | "many_unsure" | "holes_removed" | "uncertain_holes")[];
  layers: Layer[];
}

export interface TissueResult {
  /** Shared tissue (Method A's), real holes removed, uncertain holes kept */
  tissue_px: number;
  tissue_mm2: number | null;
  holes_removed_px: number;
  holes_uncertain_px: number;
  /** Enclosed gaps filled in as tissue (glare, very pale tissue) */
  filled_px: number;
}

export interface WatchStatus {
  state: "off" | "watching" | "folder_missing";
  folder: string | null;
  last_scan_at: string | null;
  /** Files imported from the folder since the engine started */
  files_imported: number;
  last_job_id: string | null;
}
