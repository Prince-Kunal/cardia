"""Write or check the published API contract and the web app's types made from it.

    uv run python -m cardia_api.openapi           # rewrite both after changing the API
    uv run python -m cardia_api.openapi --check   # fail if either is out of date (tests do this)

Writes cardia_api/openapi.json and web/src/api/types.gen.ts (TypeScript types of every schema).
"""

import json
import re
import sys
import tempfile
from pathlib import Path

from .app import create_app
from .settings import Settings

OPENAPI = Path(__file__).with_name("openapi.json")
TYPES = Path(__file__).resolve().parents[2] / "web" / "src" / "api" / "types.gen.ts"


def spec() -> dict:
    app = create_app(Settings(data_dir=Path(tempfile.gettempdir()) / "cardia-openapi", token="x", mock=True, workers=1))
    return app.openapi()


def contract() -> str:
    return json.dumps(spec(), indent=2, ensure_ascii=False) + "\n"


def _name(ref_or_name: str) -> str:
    """Schema name -> TypeScript name: AppSettings-Output -> AppSettings, AppSettings-Input -> AppSettingsInput."""
    name = ref_or_name.rsplit("/", 1)[-1]
    name = name.removesuffix("-Output")
    return re.sub(r"[^A-Za-z0-9_]", "", name)


def _ts(s: dict) -> str:
    if "$ref" in s:
        return _name(s["$ref"])
    if "anyOf" in s:
        parts = []
        for part in (_ts(x) for x in s["anyOf"]):
            if part not in parts:
                parts.append(part)
        return " | ".join(parts)
    if "const" in s:
        return json.dumps(s["const"])
    if "enum" in s:
        return " | ".join(json.dumps(v) for v in s["enum"])
    kind = s.get("type")
    if kind == "array":
        inner = _ts(s.get("items", {}))
        return f"({inner})[]" if "|" in inner else f"{inner}[]"
    if kind == "object" or "properties" in s:
        if "properties" in s:
            return _object(s)
        extra = s.get("additionalProperties")
        return f"Record<string, {_ts(extra) if isinstance(extra, dict) else 'unknown'}>"
    return {"string": "string", "integer": "number", "number": "number", "boolean": "boolean", "null": "null"}.get(
        kind, "unknown"
    )


def _object(s: dict, indent: str = "") -> str:
    required = set(s.get("required", []))
    lines = ["{"]
    for prop, p in s["properties"].items():
        doc = p.get("description")
        if doc:
            lines.append(f"{indent}  /** {doc} */")
        lines.append(f"{indent}  {prop}{'' if prop in required else '?'}: {_ts(p)};")
    lines.append(f"{indent}}}")
    return "\n".join(lines)


def typescript(api: dict) -> str:
    out = [
        "// Generated from engine/cardia_api/openapi.json by `uv run python -m cardia_api.openapi`. Do not edit.",
        f"// Cardia engine API {api['info']['version']}.",
        "",
        f"export const API_VERSION = {json.dumps(api['info']['version'])};",
        "",
    ]
    for raw, s in sorted(api["components"]["schemas"].items()):
        if raw in ("HTTPValidationError", "ValidationError") or raw.startswith("Body_"):
            continue
        name = _name(raw)
        doc = s.get("description")
        if doc:
            out.append("/** " + " ".join(doc.split()) + " */")
        if "properties" in s:
            out.append(f"export interface {name} {_object(s)}")
        else:
            out.append(f"export type {name} = {_ts(s)};")
        out.append("")
    return "\n".join(out)


def main(argv: list[str]) -> int:
    api = spec()
    files = {OPENAPI: json.dumps(api, indent=2, ensure_ascii=False) + "\n", TYPES: typescript(api)}
    if "--check" in argv:
        stale = [p.name for p, text in files.items() if not p.exists() or p.read_text() != text]
        if stale:
            print(f"{', '.join(stale)} out of date: run uv run python -m cardia_api.openapi", file=sys.stderr)
            return 1
        return 0
    for path, text in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        print(f"Wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
