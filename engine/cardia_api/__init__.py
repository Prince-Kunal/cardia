"""Cardia's local engine API (PLAN.md §6, milestone 1).

A FastAPI server on 127.0.0.1 that analyses slices for the web app: jobs with progress and cancel,
results as JSON, image layers as PNG, heart numbers, the library of hearts, settings, the watch folder,
and export (CSV, the ZIP bundle and the Methods paragraph). Start it with `uv run python -m cardia_api`.
The contract is `cardia_api/openapi.json`; README.md in this folder explains it for the UI.
"""

API_VERSION = "0.6.0"  # the contract's version; /api/v1 changes only by adding fields until 1.0.0
