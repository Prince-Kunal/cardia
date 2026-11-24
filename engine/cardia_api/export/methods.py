"""The Methods paragraph for a heart's report and export (PLAN.md §1d): what was done, with the exact
pipeline version, model files and SHA-256 hashes, so a paper can describe the measurement precisely.

English only (PLAN.md §4: scientific text defaults to English). One paragraph per method; the report
shows the headline method's first. Numbers that can change (cut-offs, model versions, hashes) come from
the stored results and the model files, never from this text.
"""

from ttc_pipeline.method_a import UNSURE, UNSURE_FLAG_PCT
from ttc_pipeline.method_b import StainRatioModel

from ..catalog import METHOD_NAMES, RANGE_SHOWN


def _models(results: list[dict]) -> dict[str, dict]:
    """The model files the slices were analysed with, by file name (all slices share them)."""
    return {m["file"]: m for m in results[0].get("models", [])} if results else {}


def _model_ref(models: dict[str, dict], file: str, name: str) -> str:
    m = models.get(file)
    if not m:
        return name
    return f"{name} (version {m['version']}, SHA-256 {m['sha256'][:12]}…)"


def _slices_sentence(n: int, label: str, summary: dict) -> str:
    weighting = (
        "weighted by slice weight"
        if summary["weighting"] == "slice_weight"
        else "weighted by tissue area, because not every slice weight was known"
    )
    return (
        f"Heart {label} was cut into {n} short-axis slice{'s' if n != 1 else ''}, stained with "
        f"2,3,5-triphenyltetrazolium chloride (TTC) and scanned. Each scan was analysed automatically by "
        f"Cardia (pipeline {summary['pipeline_version']}), with no manual tracing or correction. Slice infarct size "
        f"is the infarcted share of the tissue area; the heart's infarct size is the mean of the slice values "
        f"{weighting}, and infarct mass is each slice's infarcted share times its weight, summed."
    )


def _shared_front_end(models: dict[str, dict]) -> str:
    holes = _model_ref(models, "holes/hole_model.joblib", "a logistic-regression hole model")
    return (
        "Uneven illumination was corrected by fitting a second-order polynomial surface to the paper "
        "background of each scan, per channel in linear light, and dividing it out. Tissue was separated from "
        "the paper by a per-scan threshold on CIE L*a*b* chroma, followed by morphological clean-up; enclosed "
        "gaps were filled as tissue when small (under 0.2% of the slice) or no more than 10 L* units darker than "
        f"the paper. Holes in the tissue, such as the cut chambers, were identified by {holes} on three "
        "measures of each dark region (edge sharpness, contrast and thickness): regions scoring 0.8 or more "
        "were removed from the tissue, and regions scoring 0.5 to 0.8 were kept as tissue and reported as "
        "uncertain."
    )


def paragraph_a(results: list[dict], summary: dict, label: str) -> str:
    models = _models(results)
    forest = _model_ref(models, "kmeans_rf/kmeans_rf.joblib", "a random forest")
    lo, hi = UNSURE
    text = [
        _slices_sentence(len(results), label, summary),
        _shared_front_end(models),
        (
            f"Infarct was then identified with Method A (K-Means + random forest): every tissue pixel was given a "
            f"probability of infarction by {forest} of 150 trees on 22 per-pixel features (CIE L*a*b* colour, also "
            f"averaged over tissue-only neighbourhoods at four scales; saturation, value and chromaticity; local "
            f"texture; edge strength; and distance from the slice edge). The forest was trained once, before "
            f"use, on pixels labelled by K-Means clustering of 30 slices from 8 guinea pig hearts, and is not "
            f"retrained. Pixels with a probability of 0.5 or more were counted as infarct; pixels between {lo:g} "
            f"and {hi:g} were reported as unsure, and slices with more than {UNSURE_FLAG_PCT:g}% unsure tissue were "
            f"flagged."
        ),
    ]
    if RANGE_SHOWN["a"]:
        text.append(
            f"The reported range counts pixels with a probability of {hi:g} or more, with uncertain holes "
            f"removed, as its low end, and pixels with {lo:g} or more, with uncertain holes kept, as its high end."
        )
    return " ".join(text)


def paragraph_b(results: list[dict], summary: dict, label: str, stain: StainRatioModel) -> str:
    models = _models(results)
    stain_file = _model_ref(models, "stain_ratio/stain_ratio.json", "cut-off file")
    text = [
        _slices_sentence(len(results), label, summary),
        _shared_front_end(models),
        (
            f"Infarct was then identified with Method B (stain ratio): a pixel was counted as infarct when it held "
            f"less than half the red stain of living muscle and its colour leaned towards the cream of unstained "
            f"tissue. Each scan's lighting correction was kept in linear light without clipping, with the paper as "
            f"reference white; each channel was averaged over tissue-only Gaussian neighbourhoods (σ = {stain.sigma:g} "
            f"px) and converted to optical density (OD = −log10 of the light returned). Stain was measured as "
            f"OD(green) − OD(red) and tint as the angle atan2(OD(green) − OD(red), OD(blue) − OD(red)); both are "
            f"unchanged by shadows, which add the same optical density to every channel. Pixels within "
            f"{stain.edge_px:g} px of the slice outline, where tissue thins and the paper shows through, took the "
            f"colour of the nearest pixel further in. Two reference colours, of unstained and of fully stained "
            f"tissue, were taken from 30 slices of 8 guinea pig hearts without reference measurements or labels "
            f"({stain_file}); the colour of tissue holding half the living stain lies midway between them in "
            f"optical density, at a stain of {stain.s_cut:.3g} and a tint of {stain.tint_cut:.3g}°. Pixels below both "
            f"were counted as infarct. Pixels holding between 40% and 60% of the living stain were reported as "
            f"borderline."
        ),
    ]
    if RANGE_SHOWN["b"]:
        text.append(
            "The reported range runs from the same rule at 40% of the living stain, with uncertain holes removed, "
            "to the rule at 60%, with uncertain holes kept as tissue."
        )
    return " ".join(text)


def methods_paragraphs(
    results: list[dict], summary: dict, label: str, stain: StainRatioModel, headline: str
) -> list[dict]:
    """Every method's paragraph, the headline method first. Demo (mock) results get a warning instead.
    Method B is left out for slices analysed before pipeline 0.5.0 (their Method B was the retired a* cut)."""
    if results and results[0].get("mock"):
        note = (
            "These results come from the Cardia engine's demo mode (--mock): every number is made up, so there is "
            "no Methods paragraph for them. Analyse the scans with the real engine to get one."
        )
        texts = {"a": note, "b": note}
    else:
        texts = {"a": paragraph_a(results, summary, label), "b": paragraph_b(results, summary, label, stain)}
    if summary.get("method_b") is None:
        del texts["b"]
    order = [headline] + [m for m in ("b", "a") if m != headline]
    order = [m for m in order if m in texts]
    return [
        {"method": m, "name": METHOD_NAMES[m], "text": texts[m], "mock": bool(results and results[0].get("mock"))}
        for m in order
    ]
