#!/usr/bin/env bash
# Copies tools/forgejo/{src,cli} into kit skills and the Codex PR-flow plugin; --check only compares.
# Overrides for tests: FORGEJO_SYNC_SRC, FORGEJO_SYNC_SKILLS, FORGEJO_SYNC_CODEX.
set -euo pipefail

SRC="${FORGEJO_SYNC_SRC:-$(cd "$(dirname "$0")" && pwd)}"
SKILLS_ROOT="${FORGEJO_SYNC_SKILLS:-$SRC/../../plugins/kit/skills}"
SKILLS=(forgejo-pr-dashboard forgejo-pr-feedback roadmap)
DESTINATIONS=()
for skill in "${SKILLS[@]}"; do
  DESTINATIONS+=("$SKILLS_ROOT/$skill/scripts")
done
DESTINATIONS+=("${FORGEJO_SYNC_CODEX:-$SRC/../../plugins/pr-flow-codex/forgejo}")
MODE="${1:-sync}"
status=0

for dest in "${DESTINATIONS[@]}"; do
  if [ "$MODE" = "--check" ]; then
    extra=$(ls -A "$dest" 2>/dev/null | grep -vxE 'src|cli' || true)
    if [ -n "$extra" ]; then echo "$dest: лишние файлы: $extra" >&2; status=1; fi
    for part in src cli; do
      diff -rq "$SRC/$part" "$dest/$part" >&2 || status=1
    done
  else
    rm -rf "$dest"
    mkdir -p "$dest"
    cp -R "$SRC/src" "$SRC/cli" "$dest/"
  fi
done

if [ "$status" -ne 0 ]; then
  echo "Копии CLI расходятся с tools/forgejo: запустите tools/forgejo/sync-skills.sh" >&2
fi
exit "$status"
