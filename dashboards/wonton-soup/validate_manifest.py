#!/usr/bin/env python3
"""Validate Wonton Soup dashboard manifest and referenced payload files."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def _load_json_dict(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError(f"Expected JSON object in {path}")
    return payload


def validate_manifest(root: Path) -> dict[str, Any]:
    manifest_path = (root / "data" / "manifest.json").resolve()
    if not manifest_path.exists():
        raise RuntimeError(f"Manifest not found: {manifest_path}")

    manifest = _load_json_dict(manifest_path)
    runs = manifest.get("runs")
    if not isinstance(runs, list) or not runs:
        raise RuntimeError("Manifest field `runs` must be a non-empty list")

    schema_version = manifest.get("schema_version")
    if schema_version is not None and not isinstance(schema_version, int):
        raise RuntimeError("Manifest field `schema_version` must be an integer when present")
    for key in ("compiled_at", "release_id"):
        value = manifest.get(key)
        if value is not None and not isinstance(value, str):
            raise RuntimeError(f"Manifest field `{key}` must be a string when present")
    for key in ("selection_spec", "lake_snapshot"):
        value = manifest.get(key)
        if value is not None and not isinstance(value, dict):
            raise RuntimeError(f"Manifest field `{key}` must be an object when present")
    notes = manifest.get("notes")
    if notes is not None:
        if not isinstance(notes, list) or not all(isinstance(line, str) for line in notes):
            raise RuntimeError("Manifest field `notes` must be list[str] when present")

    seen_ids: set[str] = set()
    for idx, run in enumerate(runs, start=1):
        if not isinstance(run, dict):
            raise RuntimeError(f"`runs[{idx}]` must be an object")
        run_id = run.get("id")
        label = run.get("label")
        dashboard = run.get("dashboard")
        if not isinstance(run_id, str) or not run_id:
            raise RuntimeError(f"`runs[{idx}].id` must be a non-empty string")
        if run_id in seen_ids:
            raise RuntimeError(f"Duplicate run id in manifest: {run_id}")
        seen_ids.add(run_id)
        if not isinstance(label, str) or not label:
            raise RuntimeError(f"`runs[{idx}].label` must be a non-empty string")
        if not isinstance(dashboard, str) or not dashboard:
            raise RuntimeError(f"`runs[{idx}].dashboard` must be a non-empty string")
        rel_path = Path(dashboard)
        if rel_path.is_absolute():
            raise RuntimeError(f"`runs[{idx}].dashboard` must be relative: {dashboard}")
        payload_path = (root / rel_path).resolve()
        if not payload_path.exists():
            raise RuntimeError(f"Dashboard payload missing for run {run_id}: {payload_path}")

    default_run = manifest.get("default_run")
    if default_run is not None:
        if not isinstance(default_run, str) or default_run not in seen_ids:
            raise RuntimeError("Manifest `default_run` must match one of `runs[].id`")

    return {
        "manifest_path": str(manifest_path),
        "run_count": len(runs),
        "default_run": default_run,
        "schema_version": schema_version,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate Wonton Soup dashboard manifest")
    parser.add_argument(
        "--root",
        default=str(Path(__file__).resolve().parent),
        help="Dashboard root directory (default: this file's directory)",
    )
    args = parser.parse_args()
    root = Path(args.root).resolve()
    report = validate_manifest(root)
    print(
        "manifest-ok "
        f"path={report['manifest_path']} runs={report['run_count']} "
        f"default_run={report['default_run'] or '-'} schema={report['schema_version'] or '-'}"
    )


if __name__ == "__main__":
    main()
