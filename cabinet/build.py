#!/usr/bin/env python3
"""Build the document cabinet: discover dossier docs, render via Pandoc, emit index."""

from __future__ import annotations

import html
import json
import posixpath
import re
import shutil
import subprocess
import sys
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SITE_ROOT = REPO_ROOT / "site"
CABINET_DIR = SITE_ROOT / "cabinet"
TEMPLATE = CABINET_DIR / "cabinet-template.html"
INDEX_TEMPLATE = CABINET_DIR / "index-template.html"
DOC_ID_MAP = CABINET_DIR / "doc-id-map.json"
DOC_ID_MAP_VERSION = 1
DOC_ID_RE = re.compile(r"^[A-Z0-9]+-[0-9]{3,}$")
WIKILINK_RE = re.compile(r"\[\[([^\]\n]+)\]\]")
MD_LINK_RE = re.compile(r"(?<!!)\[([^\]\n]+)\]\(([^)\n]+)\)")
FENCE_RE = re.compile(r"^\s*(```|~~~)")
INLINE_CODE_RE = re.compile(r"(`[^`\n]*`)")
BACKLINKS_MARKER = "<!-- BACKLINKS -->"

DOSSIER_ROOTS = [REPO_ROOT / "dossiers"]

DISPLAY_NAMES: dict[str, str] = {
    "wonton-soup": "Wonton Soup",
    "lenia-swarm": "Lenia Swarm",
}

DOSSIER_CODES: dict[str, str] = {
    "wonton-soup": "WS",
    "lenia-swarm": "LS",
}

def category_sort_key(category: str) -> tuple[int, str]:
    if not category:
        return (1, "")
    return (0, category.lower())


def entry_sort_key(entry: dict[str, str]) -> tuple[tuple[int, str], str, str]:
    category = entry["category"]
    return (category_sort_key(category), entry["title"].lower(), entry["slug"])


def allocation_sort_key(entry: dict[str, str]) -> str:
    return entry["slug"]


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
                # Top-level subdirectory becomes category; docs at root are uncategorized.
                category = rel.parts[0] if len(rel.parts) > 1 else ""
                entries.append({
                    "path": str(md),
                    "docs_root": str(docs_dir),
                    "dossier": dossier,
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


def empty_registry() -> dict[str, object]:
    return {"version": DOC_ID_MAP_VERSION, "dossiers": {}}


def load_doc_id_registry() -> dict[str, object]:
    if not DOC_ID_MAP.is_file():
        return empty_registry()

    try:
        raw = json.loads(DOC_ID_MAP.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON: {exc}") from exc

    if not isinstance(raw, dict):
        raise ValueError("top-level value must be an object")
    if raw.get("version") != DOC_ID_MAP_VERSION:
        raise ValueError(
            f"unsupported version {raw.get('version')}; expected {DOC_ID_MAP_VERSION}"
        )

    dossiers_raw = raw.get("dossiers")
    if not isinstance(dossiers_raw, dict):
        raise ValueError("missing or invalid 'dossiers' object")

    normalized_dossiers: dict[str, dict[str, object]] = {}
    seen_doc_ids: set[str] = set()

    for dossier, section in dossiers_raw.items():
        if not isinstance(dossier, str) or not dossier:
            raise ValueError("dossier keys must be non-empty strings")
        if not isinstance(section, dict):
            raise ValueError(f"{dossier}: section must be an object")

        code = section.get("code")
        expected_code = dossier_code(dossier)
        if not isinstance(code, str) or not code:
            raise ValueError(f"{dossier}: missing or invalid 'code'")
        if code != expected_code:
            raise ValueError(
                f"{dossier}: code '{code}' does not match expected '{expected_code}'"
            )

        next_counter = section.get("next_counter")
        if not isinstance(next_counter, int) or next_counter < 1:
            raise ValueError(f"{dossier}: 'next_counter' must be an integer >= 1")

        docs_raw = section.get("docs")
        if not isinstance(docs_raw, dict):
            raise ValueError(f"{dossier}: missing or invalid 'docs' object")

        docs: dict[str, str] = {}
        max_counter = 0
        prefix = f"{code}-"
        for slug, doc_id in docs_raw.items():
            if not isinstance(slug, str) or not slug:
                raise ValueError(f"{dossier}: doc slugs must be non-empty strings")
            if not isinstance(doc_id, str) or DOC_ID_RE.match(doc_id) is None:
                raise ValueError(f"{dossier}:{slug}: invalid doc id '{doc_id}'")
            if not doc_id.startswith(prefix):
                raise ValueError(
                    f"{dossier}:{slug}: doc id '{doc_id}' must start with '{prefix}'"
                )
            if doc_id in seen_doc_ids:
                raise ValueError(f"duplicate doc id '{doc_id}' in registry")

            suffix = int(doc_id.split("-")[-1])
            if suffix > max_counter:
                max_counter = suffix

            docs[slug] = doc_id
            seen_doc_ids.add(doc_id)

        if next_counter <= max_counter:
            raise ValueError(
                f"{dossier}: next_counter ({next_counter}) "
                f"must be > max existing id ({max_counter})"
            )

        normalized_dossiers[dossier] = {
            "code": code,
            "next_counter": next_counter,
            "docs": docs,
        }

    return {"version": DOC_ID_MAP_VERSION, "dossiers": normalized_dossiers}


def canonicalize_registry(registry: dict[str, object]) -> dict[str, object]:
    dossiers = registry.get("dossiers")
    if not isinstance(dossiers, dict):
        raise ValueError("registry is missing 'dossiers'")

    canonical: dict[str, object] = {"version": DOC_ID_MAP_VERSION, "dossiers": {}}
    canonical_dossiers: dict[str, object] = {}
    for dossier in sorted(dossiers.keys()):
        section = dossiers[dossier]
        if not isinstance(section, dict):
            raise ValueError(f"{dossier}: registry section must be an object")

        code = section.get("code")
        if not isinstance(code, str) or not code:
            raise ValueError(f"{dossier}: missing or invalid 'code'")

        next_counter = section.get("next_counter")
        if not isinstance(next_counter, int) or next_counter < 1:
            raise ValueError(f"{dossier}: missing or invalid 'next_counter'")

        docs = section.get("docs")
        if not isinstance(docs, dict):
            raise ValueError(f"{dossier}: missing or invalid 'docs'")

        canonical_docs = {slug: docs[slug] for slug in sorted(docs.keys())}
        canonical_dossiers[dossier] = {
            "code": code,
            "next_counter": next_counter,
            "docs": canonical_docs,
        }

    canonical["dossiers"] = canonical_dossiers
    return canonical


def save_doc_id_registry(registry: dict[str, object]) -> None:
    canonical = canonicalize_registry(registry)
    payload = json.dumps(canonical, indent=2) + "\n"
    if DOC_ID_MAP.is_file() and DOC_ID_MAP.read_text(encoding="utf-8") == payload:
        return
    DOC_ID_MAP.write_text(payload, encoding="utf-8")
    print(f"  {DOC_ID_MAP.relative_to(SITE_ROOT)}")


def assign_doc_ids(
    dossiers: dict[str, list[dict[str, str]]], registry: dict[str, object]
) -> None:
    dossiers_registry = registry.get("dossiers")
    if not isinstance(dossiers_registry, dict):
        raise ValueError("registry is missing 'dossiers'")

    used_doc_ids: set[str] = set()
    for section in dossiers_registry.values():
        if not isinstance(section, dict):
            raise ValueError("registry section must be an object")
        docs = section.get("docs")
        if not isinstance(docs, dict):
            raise ValueError("registry section is missing 'docs'")
        used_doc_ids.update(docs.values())

    for dossier, entries in sorted(dossiers.items()):
        code = dossier_code(dossier)
        section = dossiers_registry.get(dossier)
        if section is None:
            section = {"code": code, "next_counter": 1, "docs": {}}
            dossiers_registry[dossier] = section

        if not isinstance(section, dict):
            raise ValueError(f"{dossier}: registry section must be an object")
        section_code = section.get("code")
        if not isinstance(section_code, str) or not section_code:
            raise ValueError(f"{dossier}: registry section is missing 'code'")
        if section_code != code:
            raise ValueError(
                f"{dossier}: registry code '{section_code}' "
                f"does not match expected '{code}'"
            )

        docs = section.get("docs")
        if not isinstance(docs, dict):
            raise ValueError(f"{dossier}: registry section is missing 'docs'")

        next_counter = section.get("next_counter")
        if not isinstance(next_counter, int) or next_counter < 1:
            raise ValueError(f"{dossier}: registry section has invalid 'next_counter'")

        for entry in entries:
            slug = entry["slug"]
            if slug in docs:
                entry["doc_id"] = docs[slug]

        for entry in sorted(entries, key=allocation_sort_key):
            slug = entry["slug"]
            if slug in docs:
                entry["doc_id"] = docs[slug]
                continue

            doc_id = f"{code}-{next_counter:03d}"
            while doc_id in used_doc_ids:
                next_counter += 1
                doc_id = f"{code}-{next_counter:03d}"

            docs[slug] = doc_id
            used_doc_ids.add(doc_id)
            entry["doc_id"] = doc_id
            next_counter += 1

        section["next_counter"] = next_counter


def source_key(entry: dict[str, str]) -> tuple[str, str]:
    return (entry["dossier"], entry["slug"])


def build_doc_lookup(dossiers: dict[str, list[dict[str, str]]]) -> dict[str, object]:
    by_dossier_slug: dict[str, dict[str, dict[str, str]]] = {}
    by_dossier_basename: dict[str, dict[str, list[dict[str, str]]]] = {}
    by_slug: dict[str, list[dict[str, str]]] = defaultdict(list)
    by_basename: dict[str, list[dict[str, str]]] = defaultdict(list)
    by_path: dict[Path, dict[str, str]] = {}
    docs_roots: dict[str, Path] = {}

    for dossier, entries in dossiers.items():
        slug_map: dict[str, dict[str, str]] = {}
        basename_map: dict[str, list[dict[str, str]]] = defaultdict(list)
        for entry in entries:
            slug = entry["slug"]
            slug_map[slug] = entry

            basename = Path(slug).name
            basename_map[basename].append(entry)
            by_slug[slug].append(entry)
            by_basename[basename].append(entry)
            by_path[Path(entry["path"]).resolve()] = entry
            docs_roots[dossier] = Path(entry["docs_root"]).resolve()

        by_dossier_slug[dossier] = slug_map
        by_dossier_basename[dossier] = dict(basename_map)

    return {
        "by_dossier_slug": by_dossier_slug,
        "by_dossier_basename": by_dossier_basename,
        "by_slug": dict(by_slug),
        "by_basename": dict(by_basename),
        "by_path": by_path,
        "docs_roots": docs_roots,
        "dossiers": set(dossiers.keys()),
    }


def split_anchor(target: str) -> tuple[str, str]:
    if "#" not in target:
        return target, ""
    base, anchor = target.split("#", 1)
    return base, f"#{anchor}"


def normalize_doc_target(raw_target: str) -> str:
    target = raw_target.strip().replace("\\", "/")
    while target.startswith("./"):
        target = target[2:]
    if target.startswith("docs/"):
        target = target[5:]
    target = target.lstrip("/")
    if target.endswith(".md"):
        target = target[:-3]
    target = target.rstrip("/")
    if target.endswith("/index"):
        target = target[:-6]
    return target


def target_candidates(
    target: str, source: dict[str, str], lookup: dict[str, object]
) -> list[dict[str, str]]:
    by_dossier_slug = lookup["by_dossier_slug"]
    by_dossier_basename = lookup["by_dossier_basename"]
    by_slug = lookup["by_slug"]
    by_basename = lookup["by_basename"]
    source_dossier = source["dossier"]

    candidates: list[dict[str, str]] = []

    if "/" in target:
        first, rest = target.split("/", 1)
        explicit = by_dossier_slug.get(first, {}).get(rest)
        if explicit is not None:
            candidates.append(explicit)
            return candidates

    same_slug = by_dossier_slug.get(source_dossier, {}).get(target)
    if same_slug is not None:
        candidates.append(same_slug)
        return candidates

    same_basename = by_dossier_basename.get(source_dossier, {}).get(target, [])
    if len(same_basename) == 1:
        candidates.append(same_basename[0])
        return candidates
    if len(same_basename) > 1:
        return same_basename

    global_slug = by_slug.get(target, [])
    if len(global_slug) == 1:
        candidates.append(global_slug[0])
        return candidates
    if len(global_slug) > 1:
        return global_slug

    global_basename = by_basename.get(target, [])
    return global_basename


def resolve_wikilink_target(
    raw_target: str, source: dict[str, str], lookup: dict[str, object]
) -> dict[str, str]:
    target = normalize_doc_target(raw_target)
    if not target:
        raise ValueError(f"{source['path']}: empty wikilink target")

    candidates = target_candidates(target, source, lookup)
    if len(candidates) == 1:
        return candidates[0]

    if len(candidates) == 0:
        raise ValueError(
            f"{source['path']}: unresolved wikilink [[{raw_target}]] from {source['slug']}"
        )

    options = ", ".join(
        f"{candidate['dossier']}/{candidate['slug']}" for candidate in candidates[:8]
    )
    raise ValueError(
        f"{source['path']}: ambiguous wikilink [[{raw_target}]] from {source['slug']}; "
        f"candidates: {options}"
    )


def is_external_href(href: str) -> bool:
    return bool(re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", href)) or href.startswith("//")


def parse_markdown_href(raw_href: str) -> str:
    href = raw_href.strip()
    if href.startswith("<") and href.endswith(">"):
        href = href[1:-1].strip()

    parts = href.split(maxsplit=1)
    if len(parts) == 2 and (
        parts[1].startswith('"')
        or parts[1].startswith("'")
        or parts[1].startswith("(")
    ):
        return parts[0]
    return href


def candidate_paths(base: Path) -> list[Path]:
    candidates = [base]
    if base.suffix == "":
        candidates.append(base.with_suffix(".md"))
    return [candidate.resolve() for candidate in candidates]


def resolve_markdown_target(
    href: str, source: dict[str, str], lookup: dict[str, object]
) -> dict[str, object] | None:
    if not href or href.startswith("#") or is_external_href(href):
        return None

    path_part, anchor = split_anchor(href)
    normalized = path_part.strip()
    if not normalized:
        return None

    by_dossier_slug = lookup["by_dossier_slug"]
    by_path = lookup["by_path"]
    docs_roots = lookup["docs_roots"]

    if normalized.startswith("/cabinet/"):
        parts = normalized.strip("/").split("/")
        if len(parts) >= 3:
            dossier = parts[1]
            slug = "/".join(parts[2:])
            if slug.endswith("/index.html"):
                slug = slug[:-11]
            slug = slug.rstrip("/")
            resolved = by_dossier_slug.get(dossier, {}).get(slug)
            if resolved is not None:
                return {"entry": resolved, "anchor": anchor}

    source_path = Path(source["path"]).resolve()
    source_root = docs_roots[source["dossier"]]
    raw_path = normalized.replace("\\", "/")

    path_candidates: list[Path] = []
    if raw_path.startswith("docs/"):
        path_candidates.append(source_root / raw_path[5:])
    elif raw_path.startswith("/"):
        path_candidates.append(Path(raw_path))
    else:
        path_candidates.append(source_path.parent / raw_path)
        path_candidates.append(source_root / raw_path)

    for candidate in path_candidates:
        for resolved_path in candidate_paths(candidate):
            resolved = by_path.get(resolved_path)
            if resolved is not None:
                return {"entry": resolved, "anchor": anchor}

    fallback = normalize_doc_target(raw_path)
    if fallback:
        candidates = target_candidates(fallback, source, lookup)
        if len(candidates) == 1:
            return {"entry": candidates[0], "anchor": anchor}

    return None


def relative_doc_href(
    source: dict[str, str], target: dict[str, str], anchor: str = ""
) -> str:
    source_dir = posixpath.join(source["dossier"], source["slug"])
    target_dir = posixpath.join(target["dossier"], target["slug"])
    relative = posixpath.relpath(target_dir, start=source_dir)
    if relative == ".":
        href = "./"
    else:
        href = f"{relative}/"
    return f"{href}{anchor}"


def rewrite_markdown_links(
    segment: str,
    source: dict[str, str],
    lookup: dict[str, object],
    outgoing: set[tuple[str, str]],
) -> str:
    def replace(match: re.Match[str]) -> str:
        label = match.group(1)
        raw_target = match.group(2)
        href = parse_markdown_href(raw_target)
        resolved = resolve_markdown_target(href, source, lookup)
        if resolved is None:
            if href.endswith(".md") or href.startswith("docs/"):
                raise ValueError(
                    f"{source['path']}: unresolved markdown doc link ({href}) in {source['slug']}"
                )
            return match.group(0)

        target_entry = resolved["entry"]
        anchor = resolved["anchor"]
        outgoing.add(source_key(target_entry))
        return f"[{label}]({relative_doc_href(source, target_entry, anchor)})"

    return MD_LINK_RE.sub(replace, segment)


def rewrite_wikilinks(
    segment: str,
    source: dict[str, str],
    lookup: dict[str, object],
    outgoing: set[tuple[str, str]],
) -> str:
    def replace(match: re.Match[str]) -> str:
        inner = match.group(1).strip()
        if "|" in inner:
            raw_target, label = inner.split("|", 1)
            link_label = label.strip()
        else:
            raw_target = inner
            link_label = ""

        target_part, anchor = split_anchor(raw_target.strip())
        target_entry = resolve_wikilink_target(target_part, source, lookup)
        outgoing.add(source_key(target_entry))
        if not link_label:
            link_label = target_entry["title"]
        return f"[{link_label}]({relative_doc_href(source, target_entry, anchor)})"

    return WIKILINK_RE.sub(replace, segment)


def transform_markdown(
    text: str,
    source: dict[str, str],
    lookup: dict[str, object],
    outgoing: set[tuple[str, str]],
) -> str:
    output_lines: list[str] = []
    in_fence = False

    for line in text.splitlines():
        fence_match = FENCE_RE.match(line)
        if fence_match:
            in_fence = not in_fence
            output_lines.append(line)
            continue

        if in_fence:
            output_lines.append(line)
            continue

        pieces = INLINE_CODE_RE.split(line)
        rewritten: list[str] = []
        for idx, piece in enumerate(pieces):
            if idx % 2 == 1:
                rewritten.append(piece)
                continue

            with_md_links = rewrite_markdown_links(piece, source, lookup, outgoing)
            with_wikilinks = rewrite_wikilinks(with_md_links, source, lookup, outgoing)
            rewritten.append(with_wikilinks)

        output_lines.append("".join(rewritten))

    output = "\n".join(output_lines)
    if text.endswith("\n"):
        output += "\n"
    return output


def build_backlink_graph(
    dossiers: dict[str, list[dict[str, str]]], lookup: dict[str, object]
) -> dict[tuple[str, str], list[dict[str, str]]]:
    backlinks: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)

    for entries in dossiers.values():
        for entry in entries:
            raw_text = Path(entry["path"]).read_text(encoding="utf-8")
            outgoing: set[tuple[str, str]] = set()
            entry["render_markdown"] = transform_markdown(raw_text, entry, lookup, outgoing)
            entry["outgoing_links"] = sorted(outgoing)

            for target in outgoing:
                if target == source_key(entry):
                    continue
                backlinks[target].append(entry)

    deduped: dict[tuple[str, str], list[dict[str, str]]] = {}
    for target, sources in backlinks.items():
        unique: dict[tuple[str, str], dict[str, str]] = {}
        for source in sources:
            unique[source_key(source)] = source
        deduped[target] = sorted(
            unique.values(),
            key=lambda entry: (entry["dossier"], entry["doc_id"], entry["slug"]),
        )

    return deduped


def render_backlinks_html(
    entry: dict[str, str], backlinks: dict[tuple[str, str], list[dict[str, str]]]
) -> str:
    sources = backlinks.get(source_key(entry), [])
    if not sources:
        return (
            '<section class="doc-backlinks" aria-label="Backlinks">'
            '<div class="toc-title">Backlinks</div>'
            '<p class="doc-backlinks-empty">No backlinks yet.</p>'
            "</section>"
        )

    items = []
    for source in sources:
        href = relative_doc_href(entry, source)
        doc_id = html.escape(source["doc_id"])
        title = html.escape(source["title"])
        category = source["category"]
        category_html = ""
        if category:
            category_html = (
                f'<span class="doc-backlinks-category">{html.escape(category)}</span>'
            )
        items.append(
            f'<li class="doc-backlinks-item">'
            f'<a href="{html.escape(href)}" class="doc-backlinks-link">'
            f'<span class="doc-backlinks-id">{doc_id}</span>'
            f'<span class="doc-backlinks-title">{title}</span>'
            f"{category_html}"
            f"</a>"
            f"</li>"
        )

    return (
        '<section class="doc-backlinks" aria-label="Backlinks">'
        '<div class="toc-title">Backlinks</div>'
        '<ul class="doc-backlinks-list">'
        f"{''.join(items)}"
        "</ul>"
        "</section>"
    )


def output_dir_for(dossier: str, slug: str) -> Path:
    return CABINET_DIR / dossier / slug


def render_doc(
    entry: dict[str, str],
    built_at: str,
    backlinks: dict[tuple[str, str], list[dict[str, str]]],
) -> None:
    """Render a single markdown doc to HTML via Pandoc."""
    dossier = entry["dossier"]
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

    markdown = entry.get("render_markdown")
    if not isinstance(markdown, str):
        raise ValueError(f"missing transformed markdown for {entry['path']}")

    temp_md_path: Path | None = None
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", suffix=".md", dir=md_path.parent, delete=False
    ) as temp_md:
        temp_md.write(markdown)
        temp_md_path = Path(temp_md.name)

    cmd = [
        "pandoc", str(temp_md_path),
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

    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
    finally:
        if temp_md_path is not None and temp_md_path.exists():
            temp_md_path.unlink()

    if result.returncode != 0:
        print(f"FAIL {md_path}: {result.stderr.strip()}", file=sys.stderr)
        sys.exit(1)

    if BACKLINKS_MARKER not in result.stdout:
        print(
            f"FAIL {md_path}: template missing backlinks marker ({BACKLINKS_MARKER})",
            file=sys.stderr,
        )
        sys.exit(1)

    backlinks_html = render_backlinks_html(entry, backlinks)
    rendered_html = result.stdout.replace(BACKLINKS_MARKER, backlinks_html)

    out_file.write_text(rendered_html, encoding="utf-8")
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

    try:
        registry = load_doc_id_registry()
        assign_doc_ids(dossiers, registry)
    except ValueError as exc:
        print(f"Invalid registry at {DOC_ID_MAP}: {exc}", file=sys.stderr)
        sys.exit(1)
    save_doc_id_registry(registry)

    try:
        lookup = build_doc_lookup(dossiers)
        backlinks = build_backlink_graph(dossiers, lookup)
    except ValueError as exc:
        print(f"Link graph error: {exc}", file=sys.stderr)
        sys.exit(1)

    built_at = (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )

    total = sum(len(v) for v in dossiers.values())
    print(f"Cabinet: {total} docs across {len(dossiers)} dossiers")

    clean_generated()

    for dossier, entries in sorted(dossiers.items()):
        print(f"[{dossier}]")
        for entry in entries:
            render_doc(entry, built_at, backlinks)

    build_index(dossiers)
    print("Done.")


if __name__ == "__main__":
    main()
