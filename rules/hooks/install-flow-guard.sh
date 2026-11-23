#!/usr/bin/env bash
# Idempotently registers the task-flow hooks (rules/hooks/flow-guard.js: SessionStart, Stop, PreToolUse on Bash) in the
# current project's committed .claude/settings.json; with --codex also in .codex/hooks.json (Codex then asks the
# developer to approve the hooks once via /hooks). Same reasoning for the target files as install-kit-sync.sh.
#
# Usage: bash .claude/ai-dev-kit/rules/hooks/install-flow-guard.sh [--codex]

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
  *) echo "Usage: install-flow-guard.sh [--codex]" >&2; exit 1 ;;
esac

REL=".claude/ai-dev-kit/rules/hooks/flow-guard.js"

# A missing submodule script is silent: the hook must never get in the way (kit-sync already reports a missing submodule).
CLAUDE_CMD="if [ -f \"\$CLAUDE_PROJECT_DIR/$REL\" ]; then node \"\$CLAUDE_PROJECT_DIR/$REL\"; fi"
mkdir -p "$PROJECT_ROOT/.claude"
node "$MERGE_JS" "$PROJECT_ROOT/.claude/settings.json" "$CLAUDE_CMD" "flow-guard.js" --event SessionStart --timeout 10
node "$MERGE_JS" "$PROJECT_ROOT/.claude/settings.json" "$CLAUDE_CMD" "flow-guard.js" --event Stop --timeout 10
node "$MERGE_JS" "$PROJECT_ROOT/.claude/settings.json" "$CLAUDE_CMD" "flow-guard.js" --event PreToolUse --matcher Bash --timeout 10

if [ "$WITH_CODEX" -eq 1 ]; then
  CODEX_CMD="f=\"\$(git rev-parse --show-toplevel)/$REL\"; if [ -f \"\$f\" ]; then node \"\$f\"; fi"
  mkdir -p "$PROJECT_ROOT/.codex"
  node "$MERGE_JS" "$PROJECT_ROOT/.codex/hooks.json" "$CODEX_CMD" "flow-guard.js" --event SessionStart --matcher startup --timeout 10
  node "$MERGE_JS" "$PROJECT_ROOT/.codex/hooks.json" "$CODEX_CMD" "flow-guard.js" --event Stop --timeout 10
  node "$MERGE_JS" "$PROJECT_ROOT/.codex/hooks.json" "$CODEX_CMD" "flow-guard.js" --event PreToolUse --matcher Bash --timeout 10
  echo "-- Codex: откройте проект в Codex и одобрите хуки task-flow через /hooks (один раз; после изменения скрипта — снова)"
fi
