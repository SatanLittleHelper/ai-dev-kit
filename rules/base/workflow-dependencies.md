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
| `pr-flow`, `polish`, or another kit mod | `bash .claude/ai-dev-kit/mods/install-mods.sh <mod-name>` — use the actual name from the kit's marketplace |
| A kit-owned skill | `npx skills add SatanLittleHelper/ai-dev-kit --skill <skill-name> -a claude-code --yes` |
| Angular best practices | `npx skills add alfredoperez/angular-best-practices --skill angular-best-practices -a claude-code --yes` |
| NestJS best practices | `npx skills add kadajett/agent-nestjs-skills --skill nestjs-best-practices -a claude-code --yes` |
| A routed rule or installer missing from an existing kit submodule | `git submodule update --init --remote .claude/ai-dev-kit`; regenerate the Codex block if already enabled |

If the kit itself is not installed, offer its README setup instructions. If `claude` is missing, explain that Claude Code must be installed first. Never present the project installer as a Codex plugin installer.

For an intentionally disabled plugin, say it is disabled and ask whether to enable it; installers preserve explicit `false` entries. For an installed but unloaded plugin, offer a restart instead of repeatedly reinstalling it.

## Codex and other hosts

Claude Code plugins and mods are host-specific. Do not claim they are available in Codex merely because the project has `.claude/settings.json`.

- Superpowers: offer installation through Codex's plugin catalog; see current official instructions at `https://github.com/obra/superpowers`.
- Plannotator: offer `curl -fsSL https://plannotator.ai/install.sh | bash` for host integrations, including Codex. Unlike the kit's minimal binary installation, this installer can configure detected agents; explain that scope before running it. Follow current official host instructions at `https://github.com/backnotprop/plannotator`.
- Kit mods such as `pr-flow` and `polish`: explain that these require Claude Code. Offer to install for Claude Code or ask whether to proceed with a supported manual workflow in the current host.

For unknown dependencies, locate official installation instructions before suggesting a command; never invent repositories or flags.
