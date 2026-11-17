#!/usr/bin/env bash
# Idempotently adds the kit's default values (currently: the Codex backend profiles `codex` and
# `local`) to the current project's .claude/dev-conventions.json. Existing keys are never
# overwritten; only missing ones are added. No secrets are written — the `local` profile
# references the env var LOCAL_LLM_API_KEY by name; export it in your shell yourself. Its model and
# baseUrl are YOUR-… placeholders: replace them in .claude/dev-conventions.json.
#
# Usage: bash .claude/ai-dev-kit/defaults/install-dev-conventions.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
git rev-parse --show-toplevel >/dev/null 2>&1 || { echo "Error: run this inside a git repository (project root)." >&2; exit 1; }
PROJECT_ROOT="$(git rev-parse --show-toplevel)"

command -v node >/dev/null 2>&1 || { echo "Error: node not found." >&2; exit 1; }
[ -f "$SCRIPT_DIR/dev-conventions.defaults.json" ] || { echo "Error: $SCRIPT_DIR/dev-conventions.defaults.json not found." >&2; exit 1; }

node "$SCRIPT_DIR/merge-dev-conventions.cjs" \
  "$SCRIPT_DIR/dev-conventions.defaults.json" \
  "$PROJECT_ROOT/.claude/dev-conventions.json"
