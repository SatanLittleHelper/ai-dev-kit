#!/usr/bin/env bash
# Idempotently installs the flow-guard block into the current repository's pre-push git hook: refuses a push
# until the simplify, check, local-test and review stages of the branch's flow task are closed. Existing hooks
# are kept; the hook directory comes from `git rev-parse --git-path hooks` (core.hooksPath and worktrees aware).
#
# Usage: bash .claude/ai-dev-kit/rules/hooks/install-pre-push.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
git rev-parse --show-toplevel >/dev/null 2>&1 || { echo "Error: run this inside a git repository (project root)." >&2; exit 1; }
cd "$(git rev-parse --show-toplevel)"

HOOKS_DIR="$(git rev-parse --git-path hooks)"
node "$SCRIPT_DIR/install-pre-push.js" "$HOOKS_DIR/pre-push" "$SCRIPT_DIR/pre-push-block.sh"
