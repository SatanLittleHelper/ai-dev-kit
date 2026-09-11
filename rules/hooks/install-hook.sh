#!/usr/bin/env bash
# Idempotently registers the commit-rules PreToolUse hook (enforce-commit-rules.js) in the
# current project's committed .claude/settings.json.
#
# Deliberately targets that file and not ~/.claude/settings.json (global, per-user) or
# .claude/settings.local.json (personal, gitignored): Claude Code loads and merges hooks
# from all three independently, so writing here can never clobber a user's own global or
# local hooks — they live in separate files. Project settings.json is the right place for a
# team-wide convention like this one, same as CLAUDE.md's rules import.
#
# Usage: bash .claude/ai-dev-kit/rules/hooks/install-hook.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
git rev-parse --show-toplevel >/dev/null 2>&1 || { echo "Error: run this inside a git repository (project root)." >&2; exit 1; }
PROJECT_ROOT="$(git rev-parse --show-toplevel)"

HOOK_JS="$SCRIPT_DIR/enforce-commit-rules.js"
MERGE_JS="$SCRIPT_DIR/merge-settings.js"
[ -f "$HOOK_JS" ] || { echo "Error: $HOOK_JS not found." >&2; exit 1; }
[ -f "$MERGE_JS" ] || { echo "Error: $MERGE_JS not found." >&2; exit 1; }

# Relative path via node's realpath, not a plain string-prefix strip: PROJECT_ROOT (from
# `git rev-parse`, symlinks unresolved) and HOOK_JS's directory (from `cd && pwd`, symlinks
# resolved) can disagree when any path component is a symlink — e.g. macOS's /tmp ->
# /private/tmp — which silently produced a broken path here in testing. Resolving both
# through the same realpath before diffing avoids that regardless of symlink placement.
REL_HOOK_PATH="$(node -e '
const path = require("path");
const fs = require("fs");
const root = fs.realpathSync(process.argv[1]);
const hook = fs.realpathSync(process.argv[2]);
console.log(path.relative(root, hook));
' "$PROJECT_ROOT" "$HOOK_JS")"
# $CLAUDE_PROJECT_DIR is set by Claude Code for hook commands, regardless of the shell's cwd
# at hook-execution time — more reliable than a path relative to wherever the hook happens
# to run from.
HOOK_COMMAND="node \"\$CLAUDE_PROJECT_DIR/$REL_HOOK_PATH\""

SETTINGS_DIR="$PROJECT_ROOT/.claude"
SETTINGS_FILE="$SETTINGS_DIR/settings.json"
mkdir -p "$SETTINGS_DIR"
[ -f "$SETTINGS_FILE" ] || echo "{}" > "$SETTINGS_FILE"

node "$MERGE_JS" "$SETTINGS_FILE" "$HOOK_COMMAND" "enforce-commit-rules.js"
