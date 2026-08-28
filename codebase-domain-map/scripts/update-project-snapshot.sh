#!/usr/bin/env bash
# Generates/refreshes a lightweight project snapshot for fast codebase orientation.
# Usage: update-project-snapshot.sh [repo-root]  (defaults to git toplevel, else cwd)

set -euo pipefail

ROOT_DIR="${1:-}"
if [ -z "$ROOT_DIR" ]; then
  ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
fi
ROOT_DIR="$(cd "$ROOT_DIR" && pwd)"

OUTPUT_DIR="$ROOT_DIR/.claude/project-snapshot"
OVERVIEW_FILE="$OUTPUT_DIR/overview.md"
FILES_FILE="$OUTPUT_DIR/files.txt"
DOMAINS_FILE="$OUTPUT_DIR/domains.tsv"

mkdir -p "$OUTPUT_DIR"

# Known multi-project container directories, checked in this order.
CONTAINER_CANDIDATES=(apps packages libs services modules src crates cmd internal pkg)
NOISE_DIRS='^(node_modules|\.git|dist|build|out|target|vendor|\.next|\.nx|\.venv|__pycache__|coverage)$'

is_noise_dir() {
  [[ "$1" == .* ]] && return 0
  [[ "$1" =~ $NOISE_DIRS ]]
}

containers=()
for c in "${CONTAINER_CANDIDATES[@]}"; do
  if [ -d "$ROOT_DIR/$c" ]; then
    containers+=("$c")
  fi
done

# Fallback: no recognizable container dirs — treat repo root's own top-level dirs as one container.
fallback_mode=false
if [ ${#containers[@]} -eq 0 ]; then
  fallback_mode=true
  containers=(".")
fi

find_source_root() {
  local project_dir="$1"
  local candidate
  for candidate in src/app src/lib app lib src; do
    if [ -d "$project_dir/$candidate" ]; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  printf ''
}

find_entry_points() {
  local project_dir="$1"
  local rel="$2"
  local entry
  for entry in src/main.ts src/index.ts main.go cmd/main.go main.py __main__.py src/main.rs; do
    if [ -f "$project_dir/$entry" ]; then
      printf '  - `%s/%s`\n' "$rel" "$entry"
    fi
  done
  return 0
}

timestamp="$(date '+%Y-%m-%d %H:%M:%S %Z')"

{
  printf '# Project Snapshot\n\n'
  printf -- '- Generated: `%s`\n' "$timestamp"
  printf -- '- Repo root: `%s`\n' "$ROOT_DIR"
  printf -- '- Purpose: fast orientation before codebase search — read this before grep/find\n\n'

  for container in "${containers[@]}"; do
    if [ "$fallback_mode" = true ]; then
      heading="Top-level modules"
      scan_dir="$ROOT_DIR"
    else
      heading="\`$container\`"
      scan_dir="$ROOT_DIR/$container"
    fi
    printf '## %s\n\n' "$heading"

    while IFS= read -r project_path; do
      [ -z "$project_path" ] && continue
      project_name="$(basename "$project_path")"
      if is_noise_dir "$project_name"; then
        continue
      fi
      rel_project="${project_path#$ROOT_DIR/}"

      printf '### `%s`\n\n' "$project_name"

      source_root="$(find_source_root "$project_path")"
      if [ -n "$source_root" ]; then
        printf -- '- Source root: `%s`\n' "$source_root"
        printf -- '- Sections/domains:\n'
        while IFS= read -r part_path; do
          [ -z "$part_path" ] && continue
          printf '  - `%s`\n' "$(basename "$part_path")"
        done < <(find "$project_path/$source_root" -mindepth 1 -maxdepth 1 \( -type d -o -type f \) 2>/dev/null | sort || true)
      else
        printf -- '- No recognized source root (src/app, src/lib, src, app, lib) — treat as opaque, search directly\n'
      fi

      entries="$(find_entry_points "$project_path" "$rel_project" || true)"
      if [ -n "$entries" ]; then
        printf -- '- Entry points:\n%s\n' "$entries"
      fi
      printf '\n'
    done < <(find "$scan_dir" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort || true)
  done

  printf '## Quick Search Commands\n\n'
  printf '```bash\n'
  printf 'rg -n "<Symbol|Keyword>" %s\n' "${containers[0]}"
  printf 'rg --files %s | rg "<domain-keyword>"\n' "${containers[*]}"
  printf 'sed -n "1,200p" .claude/project-snapshot/overview.md\n'
  printf '```\n'
} > "$OVERVIEW_FILE"

if command -v rg >/dev/null 2>&1; then
  if [ "$fallback_mode" = true ]; then
    (cd "$ROOT_DIR" && rg --files . 2>/dev/null | sort > "$FILES_FILE") || true
  else
    (cd "$ROOT_DIR" && rg --files "${containers[@]}" 2>/dev/null | sort > "$FILES_FILE") || true
  fi
else
  echo "Note: ripgrep (rg) not found — falling back to find (slower, no .gitignore filtering)" >&2
  if [ "$fallback_mode" = true ]; then
    (cd "$ROOT_DIR" && find . -type f -not -path './.git/*' | sed 's|^\./||' | sort > "$FILES_FILE")
  else
    (cd "$ROOT_DIR" && find "${containers[@]}" -type f | sort > "$FILES_FILE")
  fi
fi

{
  printf "scope\ttype\tname\tpath\n"

  for container in "${containers[@]}"; do
    if [ "$fallback_mode" = true ]; then
      scan_dir="$ROOT_DIR"
      scope_label="root"
    else
      scan_dir="$ROOT_DIR/$container"
      scope_label="$container"
    fi

    while IFS= read -r project_path; do
      [ -z "$project_path" ] && continue
      project_name="$(basename "$project_path")"
      if is_noise_dir "$project_name"; then
        continue
      fi
      rel_project="${project_path#$ROOT_DIR/}"
      printf "%s\tproject\t%s\t%s\n" "$scope_label" "$project_name" "$rel_project"

      source_root="$(find_source_root "$project_path")"
      if [ -z "$source_root" ]; then
        continue
      fi

      while IFS= read -r part_path; do
        [ -z "$part_path" ] && continue
        part_name="$(basename "$part_path")"
        rel_part="${part_path#$ROOT_DIR/}"
        printf "%s\tsection\t%s.%s\t%s\n" "$scope_label" "$project_name" "$part_name" "$rel_part"
      done < <(find "$project_path/$source_root" -mindepth 1 -maxdepth 1 \( -type d -o -type f \) 2>/dev/null | sort || true)
    done < <(find "$scan_dir" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort || true)
  done
} > "$DOMAINS_FILE"

printf 'Snapshot updated: %s\n' "$OUTPUT_DIR"
