#!/usr/bin/env bash
# One-time cleanup of the old delivery channel: removes from the project the skills installed by
# `npx skills` that the kit now ships as plugins (the kit's own skills and the two stack
# best-practices), so they don't appear twice (`roadmap` and `kit:roadmap`). Skills from other
# sources in skills-lock.json are never touched. Safe to re-run: nothing to do → exits 0.
#
# Usage: bash .claude/ai-dev-kit/mods/migrate-legacy-skills.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
git rev-parse --show-toplevel >/dev/null 2>&1 || { echo "Error: run this inside a git repository (project root)." >&2; exit 1; }
cd "$(git rev-parse --show-toplevel)"

[ -f skills-lock.json ] || { echo "-- no skills-lock.json, nothing to migrate"; exit 0; }
NAMES="$(node "$SCRIPT_DIR/../rules/hooks/legacy-skills.js" skills-lock.json)"
[ -n "$NAMES" ] || { echo "-- no legacy kit skills in skills-lock.json, nothing to migrate"; exit 0; }

command -v npx >/dev/null 2>&1 || { echo "Error: npx not found — install Node.js, then rerun this script." >&2; exit 1; }
echo "-- removing skills that are now shipped as plugins: $(echo "$NAMES" | tr '\n' ' ')"
# Word splitting is intended: one argument per skill name (names are [a-z0-9-]).
# shellcheck disable=SC2086
npx --yes skills remove $NAMES -y
