#!/usr/bin/env bash
# Install the kit's external Claude Code plugins and Plannotator CLI.
# Run from a consuming project's git tree. --update also refreshes installed versions.
set -euo pipefail

UPDATE=0
case "${1:-}" in
  '') [ "$#" -eq 0 ] || { echo "Usage: install.sh [--update]" >&2; exit 1; } ;;
  --update) [ "$#" -eq 1 ] || { echo "Usage: install.sh [--update]" >&2; exit 1; }; UPDATE=1 ;;
  *) echo "Usage: install.sh [--update]" >&2; exit 1 ;;
esac

die() { echo "Error: $*" >&2; exit 1; }
command -v node >/dev/null 2>&1 || die "Node.js is required."
command -v claude >/dev/null 2>&1 || die "claude CLI not found. Install Claude Code, then rerun: bash .claude/ai-dev-kit/dependencies/install.sh"
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETTINGS_FILE="$PROJECT_ROOT/.claude/settings.json"
mkdir -p "$PROJECT_ROOT/.claude"
[ -f "$SETTINGS_FILE" ] || echo '{}' > "$SETTINGS_FILE"

# Materialize the registry before the loop so a JSON error cannot disappear inside
# process substitution. The same registry is used on setup and update.
PLUGINS="$(node -e '
  const plugins = require(process.argv[1]);
  for (const {plugin, marketplace, repo} of plugins) {
    if (![plugin, marketplace, repo].every(v => typeof v === "string" && /^[a-zA-Z0-9_./-]+$/.test(v))) {
      throw new Error("Invalid plugin registry entry");
    }
    console.log([plugin, marketplace, repo].join("\t"));
  }
' "$SCRIPT_DIR/plugins.json")"
PLANNOTATOR_ENABLED=0
while IFS=$'\t' read -r PLUGIN MARKETPLACE REPO; do
  node -e '
    const raw = require("fs").readFileSync(process.argv[1], "utf8");
    const settings = raw.trim() ? JSON.parse(raw) : {};
    const existing = settings.extraKnownMarketplaces?.[process.argv[2]];
    if (existing && (existing.source?.source !== "github" || existing.source?.repo !== process.argv[3])) {
      throw new Error(`Project marketplace ${process.argv[2]} has a different source; resolve it manually.`);
    }
  ' "$SETTINGS_FILE" "$MARKETPLACE" "$REPO"
  node "$SCRIPT_DIR/../mods/merge-plugin-settings.js" "$SETTINGS_FILE" "$MARKETPLACE" "$REPO" "$PLUGIN"
  ENABLED="$(node -e 'const s = require(process.argv[1]); console.log(s.enabledPlugins[process.argv[2]] === true ? "yes" : "no")' "$SETTINGS_FILE" "$PLUGIN@$MARKETPLACE")"
  if [ "$ENABLED" != yes ]; then
    echo "-- $PLUGIN@$MARKETPLACE is explicitly disabled; leaving it disabled"
    continue
  fi
  [ "$PLUGIN" != plannotator ] || PLANNOTATOR_ENABLED=1
  MARKETPLACES="$(claude plugin marketplace list --json)"
  REGISTERED="$(printf '%s' "$MARKETPLACES" | node -e '
    let raw = "";
    process.stdin.on("data", chunk => raw += chunk);
    process.stdin.on("end", () => {
      const existing = JSON.parse(raw).find(m => m.name === process.argv[1]);
      if (existing && existing.repo !== process.argv[2]) {
        throw new Error(`Marketplace ${process.argv[1]} has a different source; resolve it manually.`);
      }
      console.log(existing ? "yes" : "no");
    });
  ' "$MARKETPLACE" "$REPO")"
  if [ "$REGISTERED" != yes ]; then
    claude plugin marketplace add "$REPO" --scope project
  fi
  if [ "$UPDATE" -eq 1 ]; then
    claude plugin marketplace update "$MARKETPLACE"
  fi
  claude plugin install "$PLUGIN@$MARKETPLACE" --scope project
  if [ "$UPDATE" -eq 1 ]; then
    claude plugin update "$PLUGIN@$MARKETPLACE" --scope project
  fi
done <<< "$PLUGINS"

if [ "$PLANNOTATOR_ENABLED" -eq 1 ]; then
  # An explicit binary path also supports custom installs outside PATH.
  PLANNOTATOR_BIN="${AI_DEV_KIT_PLANNOTATOR_BIN:-$(command -v plannotator || true)}"
  if [ -z "$PLANNOTATOR_BIN" ] && [ -x "$HOME/.local/bin/plannotator" ]; then
    PLANNOTATOR_BIN="$HOME/.local/bin/plannotator"
  fi
  if [ "$UPDATE" -eq 1 ] || [ -z "$PLANNOTATOR_BIN" ] || [ ! -x "$PLANNOTATOR_BIN" ]; then
    command -v curl >/dev/null 2>&1 || die "curl is required to install Plannotator."
    INSTALLER="$(mktemp)"
    trap 'rm -f "$INSTALLER"' EXIT
    curl -fsSL https://plannotator.ai/install.sh -o "$INSTALLER"
    # Only install the binary; the project plugin supplies Claude integration.
    bash "$INSTALLER" --minimal
    # The official installer writes ~/.local/bin, regardless of the old PATH entry.
    # An override changes the expected path for externally managed/mirrored installs,
    # not the official installer's destination.
    PLANNOTATOR_BIN="${AI_DEV_KIT_PLANNOTATOR_BIN:-$HOME/.local/bin/plannotator}"
  fi
  [ -x "$PLANNOTATOR_BIN" ] || die "Plannotator binary not found after installation; check installer output and PATH."
  "$PLANNOTATOR_BIN" --version
  if ! command -v plannotator >/dev/null 2>&1; then
    die "Plannotator installed at $PLANNOTATOR_BIN but is not on PATH. Add its directory to PATH and rerun."
  fi
  ACTIVE_PLANNOTATOR="$(command -v plannotator)"
  if [ ! "$ACTIVE_PLANNOTATOR" -ef "$PLANNOTATOR_BIN" ]; then
    die "$ACTIVE_PLANNOTATOR shadows $PLANNOTATOR_BIN. Put the installed binary's directory first in PATH and rerun."
  fi
fi

echo "-- External workflow dependencies installed. Restart Claude Code to load plugins."
