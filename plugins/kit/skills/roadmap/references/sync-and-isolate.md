# Fresh Main, PR Sync, Branch Isolation

Run `node <base>/../../tools/roadmap/cli/main.mts status`: it fetches and reads `origin/<default>`, overlays open GitHub or Forgejo PRs, and reports `ready`, `blocked`, `in-flight` and `stackable` steps. If `prSync: skipped`, tell the user why. `node <base>/../../tools/roadmap/cli/main.mts pick <id>` creates a branch from the chosen base and hides other roadmaps; `node <base>/../../tools/roadmap/cli/main.mts close <id>` restores isolation. Ask the user about each `needs-input` result.
