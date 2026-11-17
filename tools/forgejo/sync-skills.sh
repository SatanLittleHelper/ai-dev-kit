#!/usr/bin/env bash
# Copies tools/forgejo/{src,cli} into scripts/ of both Forgejo skills; with --check only compares.
# Overrides for tests: FORGEJO_SYNC_SRC (tool folder), FORGEJO_SYNC_SKILLS (skills folder).
set -euo pipefail

SRC="${FORGEJO_SYNC_SRC:-$(cd "$(dirname "$0")" && pwd)}"
SKILLS_ROOT="${FORGEJO_SYNC_SKILLS:-$SRC/../../skills}"
SKILLS=(forgejo-pr-dashboard forgejo-pr-feedback)
MODE="${1:-sync}"
status=0

for skill in "${SKILLS[@]}"; do
  dest="$SKILLS_ROOT/$skill/scripts"
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
  echo "Копии CLI в скиллах расходятся с tools/forgejo: запустите tools/forgejo/sync-skills.sh" >&2
fi
exit "$status"
