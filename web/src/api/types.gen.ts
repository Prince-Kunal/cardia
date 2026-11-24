// Generated from engine/cardia_api/openapi.json by `uv run python -m cardia_api.openapi`. Do not edit.
// Cardia engine API 0.7.0.

export const API_VERSION = "0.7.0";

/** Settings screen (PLAN.md §9 screen 11). Kept by the engine, so every browser sees the same. */
export interface AppSettingsInput {
  /** The method reports lead with. Default Method B (the stain ratio) since pipeline 0.5.0 */
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
  /** The method reports lead with. Default Method B (the stain ratio) since pipeline 0.5.0 */
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

/** The demo heart for the walkthrough (PLAN.md §1h): real scans of one study heart, bundled with the engine. Fetch each scan from GET /demo/{name} and import it like any other. */
export interface DemoHeart {
  heart_id: string;
  /** The study group: infarct or timecontrol */
  group: string;
  scans: DemoScan[];
}

export interface DemoScan {
  /** The file name, which gives the heart ID and the slice weight */
  name: string;
  size_bytes: number;
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
  /** Null when any slice was analysed before pipeline 0.5.0 (the retired a* cut) */
  method_b: HeartMethodB | null;
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

export type Layer = "original" | "corrected" | "tissue" | "holes_removed" | "holes_uncertain" | "filled" | "a_dead" | "a_unsure" | "a_probability" | "b_dead" | "b_borderline" | "b_stain_missing";

export interface LayerInfo {
  key: Layer;
  /** photo: RGB PNG. mask: PNG that is white where true and transparent elsewhere (tint it with CSS mask-image). heatmap: RGBA PNG, viridis colour map from p = 0 (dark blue) to 1 (yellow), transparent outside the tissue. */
  kind: "photo" | "mask" | "heatmap";
  title: string;
  description: string;
}

/** The Learn section's progress, kept by the engine so it can sync (the app merges before sending). */
export interface LearnProgressDocInput {
  progress: Record<string, unknown> | null;
  updated_at?: string | null;
}

/** The Learn section's progress, kept by the engine so it can sync (the app merges before sending). */
export interface LearnProgressDoc {
  progress: Record<string, unknown> | null;
  updated_at: string | null;
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
  /** Dead share of the shared tissue: less than half the red stain of living muscle, leaning cream */
  dead_pct: number | null;
  dead_px: number;
  dead_mg: number | null;
  /** Between 40% and 60% of the living stain */
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

/** A Methods paragraph for one method (PLAN.md §1d): what was done, with versions and model hashes. */
export interface MethodsParagraph {
  method: "a" | "b";
  /** e.g. "Method B: stain ratio" */
  name: string;
  /** English. For demo (--mock) results, a warning instead of a paragraph */
  text: string;
  mock: boolean;
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
  /** Show this range in reports. Method B shows its range; Method A's is hidden (PLAN.md §2g) */
  shown: boolean;
}

/** What a restore added. Restoring never overwrites: hearts already here are skipped. */
export interface RestoreReport {
  hearts_added: number;
  /** Hearts already in this library (by key), or whose slices all are */
  hearts_skipped: number;
  slices_added: number;
  slice_results_copied: number;
  images_copied: number;
  backup_created_at: string | null;
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
  /** Method B, the stain ratio (pipeline 0.5.0 on); null for results stored by an earlier pipeline, whose Method B was the retired a* cut */
  method_b: MethodBResult | null;
  qc_flags: ("unvalidated_input" | "many_unsure" | "holes_removed" | "uncertain_holes")[];
  layers: Layer[];
}

export interface StudyHeart {
  heart_id: string;
  slices: number;
  total_weight_mg: number | null;
  method_a_dead_pct: number | null;
  method_b_dead_pct: number | null;
}

/** The hearts the pipeline was checked on (PLAN.md §1d), as context for a report. Compare a heart with them only when it was measured with the same pipeline version and model files. */
export interface StudySet {
  pipeline_version: string;
  models_manifest_sha256: string | null;
  hearts: StudyHeart[];
}

export interface SyncDevice {
  id: string;
  name: string;
  app_version: string | null;
  last_seen_at: string | null;
  this_device: boolean;
}

export interface SyncNewWorkspace {
  name: string;
}

export interface SyncSignIn {
  email: string;
  password: string;
  create_account?: boolean;
}

/** Cloud sync (PLAN.md §5). `not_configured` until the engine has a cloud to sync with. */
export interface SyncStatus {
  state: "not_configured" | "signed_out" | "syncing" | "synced" | "offline" | "error";
  /** "memory": --fake-cloud, nothing leaves this engine */
  backend: "supabase" | "memory" | null;
  email: string | null;
  workspace: SyncWorkspace | null;
  workspaces: SyncWorkspace[];
  /** A viewer: this computer pulls but does not send */
  read_only: boolean;
  /** Changes here not yet sent */
  pending: number;
  last_sync_at: string | null;
  error: string | null;
  devices: SyncDevice[];
}

export interface SyncWorkspace {
  id: string;
  name: string;
  kind: "personal" | "lab";
  role: "owner" | "editor" | "viewer";
  /** Original scans are uploaded too (opt-in per workspace) */
  upload_images: boolean;
}

export interface SyncWorkspaceChoice {
  workspace_id: string;
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
