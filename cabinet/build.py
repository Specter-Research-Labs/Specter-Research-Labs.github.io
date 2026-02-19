#!/usr/bin/env python3
"""Build the document cabinet: discover dossier docs, render via Pandoc, emit index."""

from __future__ import annotations

import html
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SITE_ROOT = REPO_ROOT / "site"
CABINET_DIR = SITE_ROOT / "cabinet"
TEMPLATE = CABINET_DIR / "cabinet-template.html"
INDEX_TEMPLATE = CABINET_DIR / "index-template.html"

DOSSIER_ROOTS = [REPO_ROOT / "dossiers"]

DISPLAY_NAMES: dict[str, str] = {
    "wonton-soup": "Wonton Soup",
    "lenia-swarm": "Lenia Swarm",
}

DOSSIER_CODES: dict[str, str] = {
    "wonton-soup": "WS",
    "lenia-swarm": "LS",
}

CATEGORY_ORDER = ["core", "backends", "providers", "corpus"]


def entry_sort_key(entry: dict[str, str]) -> tuple[int, str, str]:
    category = entry["category"]
    category_idx = (
        CATEGORY_ORDER.index(category)
        if category in CATEGORY_ORDER
        else len(CATEGORY_ORDER)
    )
    return (category_idx, entry["title"].lower(), entry["slug"])


def find_docs() -> dict[str, list[dict[str, str]]]:
    """Return {dossier_slug: [{path, title, slug, category}, ...]}."""
    dossiers: dict[str, list[dict[str, str]]] = {}
    for root in DOSSIER_ROOTS:
        if not root.is_dir():
            continue
        for docs_dir in sorted(root.glob("*/docs")):
            dossier = docs_dir.parent.name
            entries = []
            for md in sorted(docs_dir.rglob("*.md")):
                title = extract_title(md)
                rel = md.relative_to(docs_dir)
                slug = rel.with_suffix("").as_posix()
                # Subdirectory becomes category (core, backends, etc.)
                category = rel.parts[0] if len(rel.parts) > 1 else ""
                entries.append({
                    "path": str(md),
                    "title": title,
                    "slug": slug,
                    "category": category,
                })
            if entries:
                dossiers[dossier] = entries
    return dossiers


def extract_title(md_path: Path) -> str:
    """Extract title: first H1 within the first 5 lines, else first non-empty line."""
    lines = md_path.read_text(encoding="utf-8").splitlines()
    for line in lines[:5]:
        m = re.match(r"^#\s+(.+)$", line)
        if m:
            return m.group(1).strip()
    for line in lines[:3]:
        stripped = line.strip()
        if stripped:
            return stripped
    return md_path.stem.replace("-", " ").replace("_", " ").title()


def dossier_code(dossier: str) -> str:
    if dossier in DOSSIER_CODES:
        return DOSSIER_CODES[dossier]

    parts = [p for p in re.split(r"[^a-zA-Z0-9]+", dossier) if p]
    initials = "".join(p[0] for p in parts[:3]).upper()
    return initials or dossier[:2].upper()


def assign_doc_ids(dossiers: dict[str, list[dict[str, str]]]) -> None:
    for dossier, entries in dossiers.items():
        code = dossier_code(dossier)
        for idx, entry in enumerate(sorted(entries, key=entry_sort_key), start=1):
            entry["doc_id"] = f"{code}-{idx:03d}"


def output_dir_for(dossier: str, slug: str) -> Path:
    return CABINET_DIR / dossier / slug


def render_doc(entry: dict[str, str], dossier: str, built_at: str) -> None:
    """Render a single markdown doc to HTML via Pandoc."""
    md_path = Path(entry["path"])
    slug = entry["slug"]
    out_dir = output_dir_for(dossier, slug)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "index.html"

    # Depth from site root: cabinet/<dossier>/<slug-parts>/index.html
    depth = 2 + len(Path(slug).parts)
    root_prefix = "../" * depth

    dossier_display = DISPLAY_NAMES.get(dossier, dossier.replace("-", " ").title())
    source_path = md_path.relative_to(REPO_ROOT).as_posix()

    cmd = [
        "pandoc", str(md_path),
        # Some dossier docs intentionally omit a blank line before list items.
        # Enable this extension so bullets render as lists instead of inline text.
        "--from=markdown+lists_without_preceding_blankline",
        "--to=html5",
        "--standalone",
        "--wrap=none",
        f"--template={TEMPLATE}",
        "--toc",
        "--toc-depth=3",
        "--mathml",
        "--metadata", "lang=en",
        "--metadata", f"pagetitle={entry['title']} | SPECTER Labs",
        "--metadata", f"slug={slug}",
        "--metadata", f"doc_id={entry['doc_id']}",
        "--metadata", f"dossier={dossier_display}",
        "--metadata", f"root_prefix={root_prefix}",
        "--metadata", f"source_path={source_path}",
        "--metadata", f"built_at={built_at}",
    ]

    if entry["category"]:
        cmd.extend(["--metadata", f"category={entry['category']}"])

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"FAIL {md_path}: {result.stderr.strip()}", file=sys.stderr)
        sys.exit(1)

    out_file.write_text(result.stdout, encoding="utf-8")
    print(f"  {out_file.relative_to(SITE_ROOT)}")


def build_index(dossiers: dict[str, list[dict[str, str]]]) -> None:
    """Generate the cabinet index page from the template."""
    template = INDEX_TEMPLATE.read_text(encoding="utf-8")

    drawers_html = []
    for dossier in sorted(dossiers.keys()):
        entries = dossiers[dossier]
        display = DISPLAY_NAMES.get(dossier, dossier.replace("-", " ").title())
        entries_sorted = sorted(entries, key=entry_sort_key)

        items_html = []
        for entry in entries_sorted:
            href = f"{dossier}/{entry['slug']}/"
            doc_id = html.escape(entry["doc_id"])
            cat_span = ""
            if entry["category"]:
                cat_span = (
                    f'<span class="drawer-item-category">'
                    f'{html.escape(entry["category"])}</span>'
                )
            items_html.append(
                f'<a class="drawer-item" href="{html.escape(href)}">'
                f'<span class="drawer-item-id">{doc_id}</span>'
                f'<span class="drawer-item-title">'
                f'{html.escape(entry["title"])}</span>'
                f'{cat_span}'
                f"</a>"
            )

        drawer = (
            f'<div class="cabinet-drawer">'
            f'<div class="drawer-tab">'
            f'{html.escape(display)}'
            f'<span class="drawer-tab-count">{len(entries)}</span>'
            f"</div>"
            f'<div class="drawer-body">'
            f"{''.join(items_html)}"
            f"</div></div>"
        )
        drawers_html.append(drawer)

    index_html = template.replace("<!-- DRAWERS -->", "\n".join(drawers_html))
    out = CABINET_DIR / "index.html"
    out.write_text(index_html, encoding="utf-8")
    print(f"  {out.relative_to(SITE_ROOT)}")


def clean_generated() -> None:
    """Remove previously generated dossier subdirectories under cabinet/."""
    for child in CABINET_DIR.iterdir():
        if child.is_dir() and child.name not in {".", ".."}:
            shutil.rmtree(child)


def main() -> None:
    if not shutil.which("pandoc"):
        print("pandoc not found. Install pandoc >= 3.x.", file=sys.stderr)
        sys.exit(1)

    if not TEMPLATE.is_file():
        print(f"Missing template: {TEMPLATE}", file=sys.stderr)
        sys.exit(1)

    dossiers = find_docs()
    if not dossiers:
        print("No docs found in dossiers/*/docs/.", file=sys.stderr)
        sys.exit(1)

    assign_doc_ids(dossiers)
    built_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    total = sum(len(v) for v in dossiers.values())
    print(f"Cabinet: {total} docs across {len(dossiers)} dossiers")

    clean_generated()

    for dossier, entries in sorted(dossiers.items()):
        print(f"[{dossier}]")
        for entry in entries:
            render_doc(entry, dossier, built_at)

    build_index(dossiers)
    print("Done.")


if __name__ == "__main__":
    main()
