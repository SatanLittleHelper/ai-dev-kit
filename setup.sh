#!/usr/bin/env bash
# One-command setup: wires this repository (rules + plugins) into the current project.
#
#   curl -fsSL https://raw.githubusercontent.com/SatanLittleHelper/ai-dev-kit/main/setup.sh | bash
#
# Safe to re-run: every step is skipped if already done.
# AI_DEV_KIT_REPO / AI_DEV_KIT_SUBMODULE_URL override the source (for testing a not-yet-pushed kit).

set -euo pipefail

REPO="${AI_DEV_KIT_REPO:-SatanLittleHelper/ai-dev-kit}"
SUBMODULE_URL="${AI_DEV_KIT_SUBMODULE_URL:-git@github.com:${REPO}.git}"
SUBMODULE_PATH=".claude/ai-dev-kit"
IMPORT_LINE="@${SUBMODULE_PATH}/rules/RULES.md"
# Plugins from .claude-plugin/marketplace.json enabled in every project: the kit's skills (kit) and
# the mods. Stack plugins (Angular/NestJS best-practices) are added below by package.json detection.
BASE_PLUGINS=(kit polish pr-flow)
STACK_PLUGINS=()
# Files that a submodule pinned before the plugin delivery was introduced does not have yet.
REQUIRED_KIT_FILES=(mods/install-mods.sh mods/install-codex-plugins.sh mods/migrate-legacy-skills.sh rules/hooks/install-kit-sync.sh rules/hooks/kit-sync.js dependencies/install.sh defaults/install-dev-conventions.sh)

log() { echo "-- $*"; }
die() { echo "Error: $*" >&2; exit 1; }

echo "==> ai-dev-kit setup"

# 1. Environment checks
command -v git >/dev/null 2>&1 || die "git not found."
git rev-parse --show-toplevel >/dev/null 2>&1 || die "run this inside a git repository (project root)."
cd "$(git rev-parse --show-toplevel)"
command -v node >/dev/null 2>&1 || die "node not found — install Node.js first."

# 2. Submodule
if [ -d "$SUBMODULE_PATH" ]; then
  log "$SUBMODULE_PATH already exists, skipping submodule add"
else
  log "adding submodule: $SUBMODULE_PATH"
  git submodule add "$SUBMODULE_URL" "$SUBMODULE_PATH"
fi

# 2b. Auto-update the submodule on checkout/pull, so rule fixes actually reach the working
# tree instead of sitting unpulled at a stale pinned commit. Local repo config only (.git/config,
# not committed) — each clone/dev needs to run this setup once for it to take effect for them.
if [ "$(git config --get submodule.recurse 2>/dev/null || true)" = "true" ]; then
  log "submodule.recurse already enabled, skipping"
else
  log "enabling submodule.recurse (git config, local to this clone)"
  git config submodule.recurse true
fi

# 2c. An already-added submodule can pin a commit from before the plugin delivery existed; setup
# never moves it otherwise, so bring it up to date once if any installer is missing (the pointer
# change shows in git status to be committed).
for F in "${REQUIRED_KIT_FILES[@]}"; do
  if [ ! -f "$SUBMODULE_PATH/$F" ]; then
    log "$SUBMODULE_PATH predates the plugin delivery ($F missing), updating the submodule to the latest ai-dev-kit (commit the pointer change afterwards)"
    git submodule update --init --remote "$SUBMODULE_PATH"
    break
  fi
done
for F in "${REQUIRED_KIT_FILES[@]}"; do
  [ -f "$SUBMODULE_PATH/$F" ] || die "$F not found in $SUBMODULE_PATH even after updating it — check the submodule's remote."
done

# 3. CLAUDE.md wiring
if [ ! -f CLAUDE.md ]; then
  log "creating CLAUDE.md"
  touch CLAUDE.md
fi
if grep -qF "$IMPORT_LINE" CLAUDE.md 2>/dev/null; then
  log "CLAUDE.md already imports rules/RULES.md, skipping"
else
  {
    echo ""
    echo "$IMPORT_LINE"
  } >> CLAUDE.md
  log "added '$IMPORT_LINE' to CLAUDE.md"
fi

# 3b. Hooks in the project's committed .claude/settings.json (see rules/hooks/install-hook.sh for
# why that file): the commit-rules PreToolUse hook enforces rules/base/git-and-commits.md in code;
# the kit-sync SessionStart hook warns when the kit lags behind or a plugin is enabled but not
# installed (it lives in the submodule, so it works even when the kit plugin is not installed).
log "registering commit-rules hook"
bash "$SUBMODULE_PATH/rules/hooks/install-hook.sh"
log "registering kit-sync hook"
bash "$SUBMODULE_PATH/rules/hooks/install-kit-sync.sh"

# 3c. Old delivery channel: skills installed earlier by `npx skills` are removed before the plugins
# are enabled, so nothing shows up twice.
# Best-effort: a failed cleanup must not stop the setup (kit-sync warns about leftovers).
bash "$SUBMODULE_PATH/mods/migrate-legacy-skills.sh" || log "WARNING: old npx-skills copies were not removed; rerun: bash $SUBMODULE_PATH/mods/migrate-legacy-skills.sh"

# 3d. Plugins (kit skills, mods, stack best-practices) enabled in the project's committed
# .claude/settings.json (extraKnownMarketplaces with autoUpdate + enabledPlugins), so everyone who
# opens the project gets them after trusting the folder, and Claude Code keeps them up to date.
if [ -f package.json ]; then
  if grep -q '"@angular/core"' package.json; then
    log "Angular detected, adding angular-best-practices"
    STACK_PLUGINS+=(angular-best-practices)
  fi
  if grep -q '"@nestjs/core"' package.json; then
    log "NestJS detected, adding nestjs-best-practices"
    STACK_PLUGINS+=(nestjs-best-practices)
  fi
else
  log "no package.json found, skipping stack-specific best-practices plugins (add them later: bash $SUBMODULE_PATH/mods/install-mods.sh <angular|nestjs>-best-practices)"
fi
# The ${A[@]+...} form keeps an empty array safe under `set -u` on bash 3.2 (macOS).
ALL_PLUGINS=("${BASE_PLUGINS[@]}" ${STACK_PLUGINS[@]+"${STACK_PLUGINS[@]}"})
log "enabling plugins: ${ALL_PLUGINS[*]}"
bash "$SUBMODULE_PATH/mods/install-mods.sh" "${ALL_PLUGINS[@]}"

# 3e. Official workflow plugins and the Plannotator binary, on each developer's machine.
log "installing Superpowers and Plannotator"
bash "$SUBMODULE_PATH/dependencies/install.sh"

# 3f. Default Codex backend profiles (`codex` and `local`) in .claude/dev-conventions.json.
# Adds only keys that are missing and never overwrites the project's own values. No secrets are
# written: the local profile only names the env var LOCAL_LLM_API_KEY, which each developer
# exports in their own shell.
log "adding default Codex profiles to .claude/dev-conventions.json"
bash "$SUBMODULE_PATH/defaults/install-dev-conventions.sh"

# 4. Codex — opt-in, ask the user. Reads from /dev/tty, not stdin: this script is normally run as
# `curl | bash`, where stdin is already the piped script itself, so a plain `read` here would not
# reach an actual terminal.
CODEX_ANSWER="n"
if [ -r /dev/tty ]; then
  read -r -p "Add Codex support (AGENTS.md from the always-on rules + kit plugins for Codex)? [y/N] " CODEX_ANSWER < /dev/tty || CODEX_ANSWER="n"
else
  log "no TTY available to ask about Codex support — skipping; run 'bash $SUBMODULE_PATH/rules/build-agents-md.sh' and 'bash $SUBMODULE_PATH/mods/install-codex-plugins.sh kit' later if you want it"
fi
case "$CODEX_ANSWER" in
  [Yy]*)
    log "generating AGENTS.md for Codex"
    bash "$SUBMODULE_PATH/rules/build-agents-md.sh"
    CODEX_PLUGINS=(kit ${STACK_PLUGINS[@]+"${STACK_PLUGINS[@]}"})
    log "installing kit plugins for Codex: ${CODEX_PLUGINS[*]}"
    bash "$SUBMODULE_PATH/mods/install-codex-plugins.sh" "${CODEX_PLUGINS[@]}"
    ;;
  *)
    log "skipping Codex — rerun the two commands above anytime to add it later"
    ;;
esac

echo "==> Done. Review 'git status' and commit when you're ready — nothing was committed automatically."
echo "    Restart Claude Code to load the plugins. Updates arrive on their own (autoUpdate); the kit-sync hook warns if something lags."
