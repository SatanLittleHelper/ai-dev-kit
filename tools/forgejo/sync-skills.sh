#!/usr/bin/env bash
# Copies tools/forgejo/{src,cli} into the kit plugin (one copy shared by all its Forgejo skills) and the Codex PR-flow plugin; --check only compares.
# Overrides for tests: FORGEJO_SYNC_SRC, FORGEJO_SYNC_KIT, FORGEJO_SYNC_CODEX.
set -euo pipefail

SRC="${FORGEJO_SYNC_SRC:-$(cd "$(dirname "$0")" && pwd)}"
DESTINATIONS=("${FORGEJO_SYNC_KIT:-$SRC/../../plugins/kit/tools/forgejo}")
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
