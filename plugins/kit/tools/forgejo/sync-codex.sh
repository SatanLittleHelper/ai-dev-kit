#!/usr/bin/env bash
# Copies plugins/kit/tools/forgejo/{src,cli} into the Codex PR-flow plugin; --check only compares.
# The Codex plugin is a separate plugin and cannot see the kit files, so it is the only place with a copy:
# kit skills call the tool in place (node <base>/../../tools/forgejo/cli/main.mts).
# Overrides for tests: FORGEJO_SYNC_SRC, FORGEJO_SYNC_CODEX.
set -euo pipefail

SRC="${FORGEJO_SYNC_SRC:-$(cd "$(dirname "$0")" && pwd)}"
DEST="${FORGEJO_SYNC_CODEX:-$SRC/../../../pr-flow-codex/forgejo}"
MODE="${1:-sync}"
status=0

if [ "$MODE" = "--check" ]; then
  extra=$(ls -A "$DEST" 2>/dev/null | grep -vxE 'src|cli' || true)
  if [ -n "$extra" ]; then echo "$DEST: лишние файлы: $extra" >&2; status=1; fi
  for part in src cli; do
    diff -rq "$SRC/$part" "$DEST/$part" >&2 || status=1
  done
else
  rm -rf "$DEST"
  mkdir -p "$DEST"
  cp -R "$SRC/src" "$SRC/cli" "$DEST/"
fi

if [ "$status" -ne 0 ]; then
  echo "Копия CLI расходится с plugins/kit/tools/forgejo: запустите plugins/kit/tools/forgejo/sync-codex.sh" >&2
fi
exit "$status"
