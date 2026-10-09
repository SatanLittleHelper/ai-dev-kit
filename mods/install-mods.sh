#!/usr/bin/env bash
# Idempotently enables the given ai-dev-kit mods in the current project's committed
# .claude/settings.json (extraKnownMarketplaces + enabledPlugins), so everyone who opens the
# project gets them. Same target file and reasoning as rules/hooks/install-hook.sh: the
# project's settings.json is shared and merged with, never replaces, the user's own settings.
#
# Also installs the mods through the claude CLI (project scope), when it is on PATH.
#
# Usage: bash .claude/ai-dev-kit/mods/install-mods.sh <mod>...

set -euo pipefail

REPO="${AI_DEV_KIT_REPO:-SatanLittleHelper/ai-dev-kit}"
MARKETPLACE="ai-dev-kit"

[ "$#" -gt 0 ] || { echo "Usage: install-mods.sh <mod>..." >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
git rev-parse --show-toplevel >/dev/null 2>&1 || { echo "Error: run this inside a git repository (project root)." >&2; exit 1; }
PROJECT_ROOT="$(git rev-parse --show-toplevel)"

MERGE_JS="$SCRIPT_DIR/merge-plugin-settings.js"
[ -f "$MERGE_JS" ] || { echo "Error: $MERGE_JS not found." >&2; exit 1; }

SETTINGS_DIR="$PROJECT_ROOT/.claude"
SETTINGS_FILE="$SETTINGS_DIR/settings.json"
mkdir -p "$SETTINGS_DIR"
[ -f "$SETTINGS_FILE" ] || echo "{}" > "$SETTINGS_FILE"

node "$MERGE_JS" "$SETTINGS_FILE" "$MARKETPLACE" "$REPO" "$@"

# Writing enabledPlugins is not an install: the plugin must also be installed on this machine, or it
# silently never loads ("enabled but not installed"). Done through the CLI when it is available;
# anything else is a hint, not a failure. Installs are per user, so every teammate runs this once
# (setup.sh does it) or installs by hand.
if command -v claude >/dev/null 2>&1; then
  claude plugin marketplace add "$REPO" --scope project >/dev/null 2>&1 || true
  for MOD in "$@"; do
    if claude plugin install "$MOD@$MARKETPLACE" --scope project; then
      echo "-- installed $MOD@$MARKETPLACE (project scope)"
    else
      echo "-- could not install $MOD@$MARKETPLACE; run: claude plugin install $MOD@$MARKETPLACE --scope project" >&2
    fi
  done
else
  echo "-- claude CLI not found; install the mods by hand: claude plugin install <mod>@$MARKETPLACE --scope project" >&2
fi
