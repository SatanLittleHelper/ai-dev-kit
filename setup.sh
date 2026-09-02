#!/usr/bin/env bash
# One-command setup: wires this repository (skills + rules) into the current project.
#
#   curl -fsSL https://raw.githubusercontent.com/SatanLittleHelper/ai-dev-kit/main/setup.sh | bash
#
# Safe to re-run: every step is skipped if already done.

set -euo pipefail

REPO="SatanLittleHelper/ai-dev-kit"
SUBMODULE_PATH=".claude/ai-dev-kit"
IMPORT_LINE="@${SUBMODULE_PATH}/rules/RULES.md"
OUR_SKILLS=(roadmap codebase-domain-map scaffolding-nestjs-app writing-prd update-project-skills)

log() { echo "-- $*"; }
die() { echo "Error: $*" >&2; exit 1; }

echo "==> ai-dev-kit setup"

# 1. Environment checks
command -v git >/dev/null 2>&1 || die "git not found."
git rev-parse --show-toplevel >/dev/null 2>&1 || die "run this inside a git repository (project root)."
cd "$(git rev-parse --show-toplevel)"

command -v npm >/dev/null 2>&1 || die "npm not found — install Node.js first."
command -v npx >/dev/null 2>&1 || die "npx not found — install Node.js first."

if command -v skills >/dev/null 2>&1; then
  log "skills CLI already installed"
else
  log "installing skills CLI globally (npm install -g skills)"
  npm install -g skills
fi

# 2. Submodule
if [ -d "$SUBMODULE_PATH" ]; then
  log "$SUBMODULE_PATH already exists, skipping submodule add"
else
  log "adding submodule: $SUBMODULE_PATH"
  git submodule add "git@github.com:${REPO}.git" "$SUBMODULE_PATH"
fi

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

# 4. AGENTS.md for Codex — opt-in, ask the user. Reads from /dev/tty, not stdin: this
# script is normally run as `curl | bash`, where stdin is already the piped script itself,
# so a plain `read` here would not reach an actual terminal.
CODEX_ANSWER="n"
if [ -r /dev/tty ]; then
  read -r -p "Add Codex support (generate AGENTS.md from the always-on rules)? [y/N] " CODEX_ANSWER < /dev/tty || CODEX_ANSWER="n"
else
  log "no TTY available to ask about Codex support — skipping; run 'bash $SUBMODULE_PATH/rules/build-agents-md.sh' later if you want it"
fi
case "$CODEX_ANSWER" in
  [Yy]*)
    log "generating AGENTS.md for Codex"
    bash "$SUBMODULE_PATH/rules/build-agents-md.sh"
    ;;
  *)
    log "skipping AGENTS.md generation — rerun 'bash $SUBMODULE_PATH/rules/build-agents-md.sh' anytime to add it later"
    ;;
esac

# 5. Our skills — installed all at once; -s takes skill *names* (SKILL.md's `name:` field,
# which matches each folder's basename here), not paths within the repo.
log "installing skills: ${OUR_SKILLS[*]}"
npx skills add "$REPO" --skill "${OUR_SKILLS[@]}" --yes || log "  (one or more failed or already installed, continuing)"

# 6. Stack-detected best-practices skills — rules/angular/ and rules/nestjs/ depend on these
if [ -f package.json ]; then
  if grep -q '"@angular/core"' package.json; then
    log "Angular detected, installing angular-best-practices"
    npx skills add alfredoperez/angular-best-practices --skill angular-best-practices --yes || log "  (failed, install manually — see README)"
  fi
  if grep -q '"@nestjs/core"' package.json; then
    log "NestJS detected, installing nestjs-best-practices"
    npx skills add kadajett/agent-nestjs-skills --skill nestjs-best-practices --yes || log "  (failed, install manually — see README)"
  fi
else
  log "no package.json found, skipping stack-specific best-practices skills (see README to install them manually later)"
fi

echo "==> Done. Review 'git status' and commit when you're ready — nothing was committed automatically."
