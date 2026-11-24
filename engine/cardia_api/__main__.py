"""Start the engine: `uv run python -m cardia_api [--mock] [--open]` (see cardia_api/README.md)."""

import argparse
import json
import multiprocessing as mp
import os
import sys
import webbrowser
from pathlib import Path
from urllib.parse import quote

import uvicorn

from ttc_pipeline import ModelFileError

from . import API_VERSION
from .app import create_app
from .settings import DEFAULT_ORIGINS, DEFAULT_PORT, HOST, Settings, default_data_dir, default_workers


def write_engine_file(path: Path, url: str, token: str) -> None:
    """Tell local tools (the Vite dev server, the desktop shell) where the engine is; only this user can read it."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.unlink(missing_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump({"url": url, "token": token, "pid": os.getpid(), "api_version": API_VERSION}, f, indent=2)


def main(argv=None) -> int:
    mp.freeze_support()  # for the desktop phase's frozen engine
    ap = argparse.ArgumentParser(prog="python -m cardia_api", description="Cardia's local analysis engine")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument(
        "--origin",
        action="append",
        help=f"a UI origin allowed to call the engine (repeatable; default {', '.join(DEFAULT_ORIGINS)})",
    )
    ap.add_argument("--data-dir", type=Path, help=f"where results are kept (default {default_data_dir()})")
    ap.add_argument("--workers", type=int, default=default_workers(), help="slices analysed at once")
    ap.add_argument("--mock", action="store_true", help="fake analysis for UI work: no model files or lab data needed")
    ap.add_argument("--open", action="store_true", help="open the UI in the browser with the engine address and token")
    ap.add_argument(
        "--fake-cloud",
        action="store_true",
        help="sync with a cloud held in memory (to try the sync screens without a Supabase project)",
    )
    args = ap.parse_args(argv)

    data_dir = args.data_dir or (default_data_dir() / "mock" if args.mock else default_data_dir())
    origins = tuple(args.origin) if args.origin else DEFAULT_ORIGINS
    settings = Settings(
        data_dir=data_dir,
        allowed_origins=origins,
        workers=max(1, args.workers),
        mock=args.mock,
        cloud_url=os.environ.get("CARDIA_SUPABASE_URL") or None,
        cloud_anon_key=os.environ.get("CARDIA_SUPABASE_ANON_KEY") or None,
        fake_cloud=args.fake_cloud,
    )
    try:
        app = create_app(settings)
    except ModelFileError as e:
        print(f"Cardia engine cannot start: {e}", file=sys.stderr)
        return 2

    url = f"http://{HOST}:{args.port}"
    ui = f"{origins[0]}/#engine={quote(url, safe='')}&token={settings.token}"
    engine_file = data_dir / "engine.json"
    listening = []

    def announce():  # only once the port is ours, so a second engine never takes over the first one's file
        write_engine_file(engine_file, url, settings.token)
        listening.append(True)
        mode = "MOCK analysis, numbers are made up" if args.mock else f"{settings.workers} worker(s)"
        print(f"Cardia engine {API_VERSION} on {url} ({mode}); data in {data_dir}")
        print(f"Open the app: {ui}", flush=True)
        if args.open:
            webbrowser.open(ui)

    server = _Server(uvicorn.Config(app, host=HOST, port=args.port, log_level="warning"), announce)
    try:
        server.run()
    except SystemExit:
        print(f"Cardia engine could not listen on {url}. Is it already running? Try --port.", file=sys.stderr)
        return 1
    finally:
        if listening:
            engine_file.unlink(missing_ok=True)
    return 0


class _Server(uvicorn.Server):
    def __init__(self, config, on_started):
        super().__init__(config)
        self._on_started = on_started

    async def startup(self, sockets=None):
        await super().startup(sockets)
        if self.started:
            self._on_started()


if __name__ == "__main__":
    sys.exit(main())
