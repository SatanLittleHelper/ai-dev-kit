# Missing Workflow Dependencies

When the current task needs an unavailable skill, mod, plugin, CLI, or routed rule:

1. Name what is missing and which requested step depends on it. If status is uncertain, inspect the host's available skills/tools/injected instructions and plugin status. An `enabledPlugins` entry alone does not prove a plugin is installed or loaded.
2. Offer installation or repair with the applicable command below. Do not install merely because this rule was triggered; an explicit request to set up or update the kit already authorizes its installer.
3. Continue independent work. Keep the dependent step pending until the dependency is available or the user explicitly chooses to proceed without it. Do not silently substitute a workflow or claim a skipped step passed.
4. Explain any required session restart: installing a plugin does not necessarily load it into the current session.

## Claude Code

Run from the consuming project's root:

| Missing dependency | Offer this command |
|---|---|
| Superpowers, Plannotator plugin/skills or CLI | `bash .claude/ai-dev-kit/dependencies/install.sh` |
| `pr-flow`, `quick-actions`, or another kit mod | `bash .claude/ai-dev-kit/mods/install-mods.sh <mod-name>` — use the actual name from the kit's marketplace |
| Codex CLI (`codex`) — needed by `doc-review` and `codex-implement` | `npm install -g @openai/codex`, then `codex login`; for the `local` profile also replace its `YOUR-…` placeholders in `.claude/dev-conventions.json` and export `LOCAL_LLM_API_KEY` in your shell (never in a project file) |
| `doc-review` or another kit-owned skill (`codex-implement`, …) — also a missing default profile in `.claude/dev-conventions.json` | skill: below; profile: `bash .claude/ai-dev-kit/defaults/install-dev-conventions.sh` |
| A kit-owned skill (skills are named `kit:<skill>`) | `bash .claude/ai-dev-kit/mods/install-mods.sh kit` |
| Angular best practices (`angular-best-practices:angular-best-practices`) | `bash .claude/ai-dev-kit/mods/install-mods.sh angular-best-practices` |
| NestJS best practices (`nestjs-best-practices:nestjs-best-practices`) | `bash .claude/ai-dev-kit/mods/install-mods.sh nestjs-best-practices` |
| Kit plugins in Codex | `bash .claude/ai-dev-kit/mods/install-codex-plugins.sh kit` |
| A routed rule or installer missing from an existing kit submodule | `git submodule update --init --remote .claude/ai-dev-kit`; regenerate the Codex block if already enabled |

If the kit itself is not installed, offer its README setup instructions. If `claude` is missing, explain that Claude Code must be installed first. Never present the project installer as a Codex plugin installer.

For an intentionally disabled plugin, say it is disabled and ask whether to enable it; installers preserve explicit `false` entries. For an installed but unloaded plugin, offer a restart instead of repeatedly reinstalling it.

## Codex and other hosts

Claude Code plugins and mods are host-specific. Do not claim they are available in Codex merely because the project has `.claude/settings.json`.

- Superpowers: offer installation through Codex's plugin catalog; see current official instructions at `https://github.com/obra/superpowers`.
- Plannotator: offer `curl -fsSL https://plannotator.ai/install.sh | bash` for host integrations, including Codex. Unlike the kit's minimal binary installation, this installer can configure detected agents; explain that scope before running it. Follow current official host instructions at `https://github.com/backnotprop/plannotator`.
- PR-flow in Codex: run `bash .claude/ai-dev-kit/mods/install-codex-plugins.sh kit` and start a new session. The skill requires Node.js 24+ for validation. Trust the bundled hooks via `/hooks` if you want automatic checks of supported shell calls.
- `quick-actions` and other Claude-only mods require Claude Code. Offer the supported manual workflow in the current host when applicable.

For unknown dependencies, locate official installation instructions before suggesting a command; never invent repositories or flags.
