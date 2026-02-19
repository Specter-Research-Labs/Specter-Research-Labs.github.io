#!/usr/bin/env bash
set -euo pipefail

if ! command -v pandoc >/dev/null 2>&1; then
    echo "pandoc not found. Install pandoc >= 3.x." >&2
    exit 1
fi

repo_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
site_root="${repo_root}/site"
cd "$site_root"

sync_wonton_soup_figures() {
    local md="blog/wonton-soup/index.md"
    local assets_dir="assets/blog/wonton-soup"
    local pdf_dir="${repo_root}/dossiers/wonton-soup/docs/figures/out"
    local converter=""

    if [ ! -f "$md" ]; then
        echo "Missing blog markdown: $md" >&2
        exit 1
    fi
    if [ ! -d "$pdf_dir" ]; then
        echo "Missing figure PDF directory: $pdf_dir" >&2
        exit 1
    fi

    mkdir -p "$assets_dir"

    mapfile -t png_names < <(
        grep -oE 'assets/blog/wonton-soup/[A-Za-z0-9._-]+\.png' "$md" \
            | sed -E 's#^.*/##' \
            | sort -u
    )

    if [ "${#png_names[@]}" -eq 0 ]; then
        echo "No wonton-soup figure PNG references found in $md" >&2
        exit 1
    fi

    # Remove stale derived assets so the blog folder mirrors markdown references.
    shopt -s nullglob
    for existing in "$assets_dir"/*.png; do
        base="$(basename -- "$existing")"
        keep=0
        for wanted in "${png_names[@]}"; do
            if [ "$base" = "$wanted" ]; then
                keep=1
                break
            fi
        done
        if [ "$keep" -eq 0 ]; then
            rm -f "$existing"
            echo "Removed stale ${existing}"
        fi
    done
    shopt -u nullglob

    if command -v sips >/dev/null 2>&1; then
        converter="sips"
    elif command -v pdftoppm >/dev/null 2>&1; then
        converter="pdftoppm"
    else
        echo "No PDF->PNG tool found. Install sips (macOS) or pdftoppm (poppler)." >&2
        exit 1
    fi

    for png_name in "${png_names[@]}"; do
        local pdf_name="${png_name%.png}.pdf"
        local pdf_path="${pdf_dir}/${pdf_name}"
        local png_path="${assets_dir}/${png_name}"

        if [ ! -f "$pdf_path" ]; then
            echo "Missing required figure PDF: $pdf_path" >&2
            exit 1
        fi

        if [ "$converter" = "sips" ]; then
            sips -s format png --resampleHeightWidthMax 2200 "$pdf_path" --out "$png_path" >/dev/null
        else
            pdftoppm -png -r 300 -singlefile "$pdf_path" "${png_path%.png}" >/dev/null
        fi
        echo "Synced ${png_path}"
    done
}

sync_wonton_soup_figures

template="blog/pandoc-template.html"
if [ ! -f "$template" ]; then
    echo "Missing pandoc template: $template" >&2
    exit 1
fi

shopt -s nullglob
posts=(blog/*/index.md)
shopt -u nullglob

if [ "${#posts[@]}" -eq 0 ]; then
    echo "No blog posts found (expected blog/*/index.md)." >&2
    exit 1
fi

for md in "${posts[@]}"; do
    post_dir="$(dirname -- "$md")"
    slug="$(basename -- "$post_dir")"
    out="$post_dir/index.html"

    title="$(sed -n 's/^# //p' "$md" | head -n 1 | sed 's/[[:space:]]*$//')"
    if [ -z "$title" ]; then
        echo "Missing H1 title in $md (expected first '# ...' heading)." >&2
        exit 1
    fi

    pandoc "$md" \
        --from=markdown \
        --to=html5 \
        --standalone \
        --wrap=none \
        --template="$template" \
        --toc \
        --toc-depth=2 \
        --mathml \
        --metadata "lang=en" \
        --metadata "pagetitle=${title} | SPECTER Labs" \
        --metadata "slug=${slug}" \
        --metadata "status=Draft" \
        --output="$out"

    echo "Built $out"
done
