#!/usr/bin/env bash
# Installs the given ai-dev-kit plugins for Codex and enables them for the project:
#   1. adds the kit's marketplace to this machine's Codex (codex plugin marketplace add);
#   2. installs each plugin (codex plugin add <plugin>@ai-dev-kit);
#   3. writes [plugins."<plugin>@ai-dev-kit"] enabled = true into the project's .codex/config.toml,
#      so the enablement is shared (Codex has no install scope: steps 1-2 are per developer);
#   4. registers the kit-sync SessionStart hook in .codex/hooks.json.
# Without the codex CLI only the project files are written and a hint is printed.
#
# Usage: bash .claude/ai-dev-kit/mods/install-codex-plugins.sh <plugin>...

set -euo pipefail

REPO="${AI_DEV_KIT_REPO:-SatanLittleHelper/ai-dev-kit}"
MARKETPLACE="ai-dev-kit"
SOURCE="${AI_DEV_KIT_CODEX_SOURCE:-git@github.com:${REPO}.git}"

[ "$#" -gt 0 ] || { echo "Usage: install-codex-plugins.sh <plugin>..." >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
git rev-parse --show-toplevel >/dev/null 2>&1 || { echo "Error: run this inside a git repository (project root)." >&2; exit 1; }
PROJECT_ROOT="$(git rev-parse --show-toplevel)"

IDS=()
PR_FLOW_REQUESTED=0
KIT_REQUESTED=0
for PLUGIN in "$@"; do
  IDS+=("$PLUGIN@$MARKETPLACE")
  case "$PLUGIN" in
    kit) KIT_REQUESTED=1 ;;
    pr-flow) PR_FLOW_REQUESTED=1 ;;
  esac
done
if [ "$KIT_REQUESTED" -eq 1 ] && [ "$PR_FLOW_REQUESTED" -eq 0 ]; then
  IDS+=("pr-flow@$MARKETPLACE")
fi

mkdir -p "$PROJECT_ROOT/.codex"
node "$SCRIPT_DIR/merge-codex-config.js" "$PROJECT_ROOT/.codex/config.toml" "${IDS[@]}"
bash "$SCRIPT_DIR/../rules/hooks/install-kit-sync.sh" --codex

if ! command -v codex >/dev/null 2>&1; then
  echo "-- codex CLI not found; later run: codex plugin marketplace add $SOURCE && codex plugin add ${IDS[0]}" >&2
  exit 0
fi

if codex plugin marketplace list --json 2>/dev/null | grep -q "\"$MARKETPLACE\""; then
  echo "-- Codex marketplace $MARKETPLACE already added"
else
  codex plugin marketplace add "$SOURCE" || echo "-- could not add the Codex marketplace; run: codex plugin marketplace add $SOURCE" >&2
fi

for ID in "${IDS[@]}"; do
  if codex plugin add "$ID"; then
    echo "-- installed $ID for Codex"
  elif [ "$ID" = "pr-flow@$MARKETPLACE" ] &&
       codex plugin marketplace upgrade "$MARKETPLACE" &&
       codex plugin add "$ID"; then
    echo "-- installed $ID for Codex after marketplace upgrade"
  else
    echo "-- could not install $ID; run: codex plugin marketplace upgrade $MARKETPLACE then codex plugin add $ID" >&2
  fi
done
