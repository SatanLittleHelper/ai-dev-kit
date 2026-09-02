#!/usr/bin/env bash
# Regenerates the ai-dev-kit block inside the current project's AGENTS.md from the
# always-on rules (rules/RULES.md's @import chain).
#
# Why this exists: Codex (and other agents reading AGENTS.md) don't reliably expand
# `@file.md` references the way Claude Code expands `@import` in CLAUDE.md — verified
# empirically: Codex read AGENTS.md's `@rules/marker.md` line as literal text and only
# picked up the referenced file's content because the model chose, on its own, to also
# read that file — not because AGENTS.md loading auto-expands it. So instead of mirroring
# rules/RULES.md's @import lines into AGENTS.md, this script inlines the real content.
#
# Usage: bash .claude/ai-dev-kit/rules/build-agents-md.sh
# Safe to re-run — replaces only the marked block below, leaves the rest of AGENTS.md
# (and everything outside the block) untouched.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULES_MD="$SCRIPT_DIR/RULES.md"
START_MARKER="<!-- ai-dev-kit:rules:start (auto-generated, do not edit — regenerate via .claude/ai-dev-kit/rules/build-agents-md.sh) -->"
END_MARKER="<!-- ai-dev-kit:rules:end -->"

[ -f "$RULES_MD" ] || { echo "Error: $RULES_MD not found." >&2; exit 1; }
git rev-parse --show-toplevel >/dev/null 2>&1 || { echo "Error: run this inside a git repository (project root)." >&2; exit 1; }

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
AGENTS_MD="$PROJECT_ROOT/AGENTS.md"

BLOCK_FILE="$(mktemp)"
trap 'rm -f "$BLOCK_FILE"' EXIT

# 1. Build the flat block by inlining every file RULES.md @imports, in order.
{
  echo "$START_MARKER"
  echo ""
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      @*)
        rel="${line#@}"
        f="$SCRIPT_DIR/$rel"
        if [ -f "$f" ]; then
          cat "$f"
          echo ""
        else
          echo "Warning: $f referenced by RULES.md but not found, skipping" >&2
        fi
        ;;
    esac
  done < "$RULES_MD"
  echo "$END_MARKER"
} > "$BLOCK_FILE"

# 2. Insert/replace the block in the project's AGENTS.md.
if [ ! -f "$AGENTS_MD" ]; then
  echo "-- creating AGENTS.md"
  cp "$BLOCK_FILE" "$AGENTS_MD"
elif grep -qF "$START_MARKER" "$AGENTS_MD"; then
  echo "-- updating existing ai-dev-kit block in AGENTS.md"
  awk -v start="$START_MARKER" -v end="$END_MARKER" -v blockfile="$BLOCK_FILE" '
    $0 == start {
      while ((getline line < blockfile) > 0) print line
      close(blockfile)
      skipping = 1
      next
    }
    $0 == end && skipping { skipping = 0; next }
    skipping { next }
    { print }
  ' "$AGENTS_MD" > "$AGENTS_MD.tmp"
  mv "$AGENTS_MD.tmp" "$AGENTS_MD"
else
  echo "-- appending ai-dev-kit block to AGENTS.md"
  { echo ""; cat "$BLOCK_FILE"; } >> "$AGENTS_MD"
fi

echo "==> AGENTS.md updated: $AGENTS_MD"
