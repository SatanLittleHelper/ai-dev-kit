#!/usr/bin/env bash
# Idempotently registers the kit-sync SessionStart hook (rules/hooks/kit-sync.js) in the current
# project's committed .claude/settings.json; with --codex also in .codex/hooks.json (Codex then asks
# the developer to approve the hook once via /hooks). Same reasoning for the target file as
# install-hook.sh: the project's shared settings are merged with, never replace, personal ones.
#
# Usage: bash .claude/ai-dev-kit/rules/hooks/install-kit-sync.sh [--codex]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
git rev-parse --show-toplevel >/dev/null 2>&1 || { echo "Error: run this inside a git repository (project root)." >&2; exit 1; }
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
MERGE_JS="$SCRIPT_DIR/merge-settings.js"
[ -f "$MERGE_JS" ] || { echo "Error: $MERGE_JS not found." >&2; exit 1; }

WITH_CODEX=0
case "${1:-}" in
  '') ;;
  --codex) WITH_CODEX=1 ;;
  *) echo "Usage: install-kit-sync.sh [--codex]" >&2; exit 1 ;;
esac

REL=".claude/ai-dev-kit/rules/hooks/kit-sync.js"
MISSING='{"systemMessage":"ai-dev-kit: submodule .claude/ai-dev-kit не инициализирован. Выполни: git submodule update --init .claude/ai-dev-kit"}'

# If the submodule was never initialized the script file is absent: say so instead of failing silently.
# (if/else, not `&&`/`||`: a missing or crashing node must not be reported as a missing submodule.)
# An already registered hook is kept as is — merge-settings.js skips entries with the same marker.
CLAUDE_CMD="if [ -f \"\$CLAUDE_PROJECT_DIR/$REL\" ]; then node \"\$CLAUDE_PROJECT_DIR/$REL\" --agent claude; else echo '$MISSING'; fi"
mkdir -p "$PROJECT_ROOT/.claude"
node "$MERGE_JS" "$PROJECT_ROOT/.claude/settings.json" "$CLAUDE_CMD" "kit-sync.js" --event SessionStart --timeout 10

if [ "$WITH_CODEX" -eq 1 ]; then
  CODEX_CMD="f=\"\$(git rev-parse --show-toplevel)/$REL\"; if [ -f \"\$f\" ]; then node \"\$f\" --agent codex; else echo '$MISSING'; fi"
  mkdir -p "$PROJECT_ROOT/.codex"
  node "$MERGE_JS" "$PROJECT_ROOT/.codex/hooks.json" "$CODEX_CMD" "kit-sync.js" --event SessionStart --matcher startup --timeout 10
  echo "-- Codex: откройте проект в Codex и одобрите хук проверки кита через /hooks (один раз; после изменения скрипта — снова)"
fi
