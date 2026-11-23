"""Write or check the published API contract, cardia_api/openapi.json.

uv run python -m cardia_api.openapi           # rewrite it after changing the API
uv run python -m cardia_api.openapi --check   # fail if it is out of date (tests do this)
"""

import json
import sys
import tempfile
from pathlib import Path

from .app import create_app
from .settings import Settings

OPENAPI = Path(__file__).with_name("openapi.json")


def contract() -> str:
    app = create_app(Settings(data_dir=Path(tempfile.gettempdir()) / "cardia-openapi", token="x", mock=True, workers=1))
    return json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n"


def main(argv: list[str]) -> int:
    text = contract()
    if "--check" in argv:
        if not OPENAPI.exists() or OPENAPI.read_text() != text:
            print("cardia_api/openapi.json is out of date: run uv run python -m cardia_api.openapi", file=sys.stderr)
            return 1
        return 0
    OPENAPI.write_text(text)
    print(f"Wrote {OPENAPI}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
