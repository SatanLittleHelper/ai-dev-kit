# Ephemeral Workflow Artifacts

When using a multi-step workflow (planning, subagent-driven implementation, plan execution), route service files by type instead of dropping them wherever convenient:

- **Plans and specs go wherever the planning skill that produced them defaults to** (e.g. `docs/superpowers/plans/`, `docs/superpowers/specs/`) — don't override it.
- Everything else — reports, review packages, build/debug logs — goes in **typed `tmp/` subfolders** (`tmp/reports/`, `tmp/reviews/`, `tmp/logs/`, or whatever taxonomy fits the workflow), never `.git/`, the bare repo root, or an external temp directory.

**Cleanup:** once a plan is fully implemented, verified, and no longer needs review, delete its artifacts from `tmp/` and the plan/spec file itself — unless the user explicitly asked to keep them. A stale plan/spec file sitting around after the feature shipped is clutter, not documentation.

## Common Mistakes

| Mistake | Fix |
|---|---|
| A review/report file dropped in the repo root or `.git/` | Move to the right typed `tmp/` subfolder |
| A finished plan/spec file left around after the feature shipped | Delete it once implemented and verified |
