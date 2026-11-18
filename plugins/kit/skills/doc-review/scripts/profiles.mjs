// Shared Codex backend-profile resolver. IDENTICAL copy lives in plugins/kit/skills/codex-implement/scripts and
// plugins/kit/skills/doc-review/scripts (skills are installed independently, so they cannot import across
// directories) — keep both in sync; `diff` them after any edit.
//
// Config: <cwd>/.claude/dev-conventions.json -> "codex":
//   {
//     "profile": "codex",                       // optional shared default
//     "profiles": { "<name>": { model, effort, timeoutMin, provider|modelProvider|codexProfile } },
//     "implement": { "profile", "model", "effort", "timeoutMin" },   // role overrides (codex-implement)
//     "review":    { "profile", "model", "effort", "timeoutMin" }    // role overrides (doc-review)
//   }
// Precedence, highest first: CLI flags > role section (only for the role's own default profile) > profile
// fields > built-in role defaults.
// Profile name: --profile > codex.<role>.profile > codex.profile > "codex".
//
// Profile backend fields (any profile, built-in or custom):
//   modelProvider - id of a provider already declared in ~/.codex/config.toml   (-c model_provider)
//   codexProfile  - a [profiles.<name>] entry from ~/.codex/config.toml          (-c profile)
//   provider      - inline provider { id?, name?, baseUrl, envKey, wireApi?, queryParams? } declared on
//                   the fly via -c model_providers.<id>.*. The API key itself is never stored — only
//                   the NAME of the env var holding it (envKey).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const PROJECT_CONFIG_PATH = ".claude/dev-conventions.json";
export const DEFAULT_PROFILE = "codex";

// Profiles shipped by the kit carry YOUR-… placeholders until the project fills in its own values.
const PLACEHOLDER_RE = /YOUR-/;
const hasPlaceholder = (profile) =>
  PLACEHOLDER_RE.test(String(profile?.model ?? "")) || PLACEHOLDER_RE.test(String(profile?.provider?.baseUrl ?? ""));

function fail(msg) {
  const err = new Error(msg);
  err.exitCode = 1;
  throw err;
}

export function loadCodexConfig(cwd) {
  const p = join(cwd, PROJECT_CONFIG_PATH);
  if (!existsSync(p)) return {};
  let json;
  try {
    json = JSON.parse(readFileSync(p, "utf8"));
  } catch (err) {
    fail(`${PROJECT_CONFIG_PATH} is malformed: ${err.message}`);
  }
  const cfg = json?.codex;
  return cfg && typeof cfg === "object" ? cfg : {};
}

// Names a user can pick from: built-in `codex` plus every configured profile in the config.
// The kit ships a default `local` profile with YOUR-… placeholders (defaults/dev-conventions.defaults.json,
// installed by setup.sh / update-ai-dev-kit); a profile that still has placeholders is not configured
// yet and is not offered. Used by the skills to decide whether to ask.
export function listProfiles(cwd) {
  const cfg = loadCodexConfig(cwd);
  const configured = Object.entries(cfg.profiles ?? {})
    .filter(([, p]) => !hasPlaceholder(p))
    .map(([n]) => n);
  return [...new Set([DEFAULT_PROFILE, ...configured])];
}

// role: "implement" | "review". defaults: { model, effort }  (the built-in `codex` profile for that role).
export function resolveProfile({ flags = {}, cwd, role, defaults }) {
  const cfg = loadCodexConfig(cwd);
  const roleCfg = cfg[role] && typeof cfg[role] === "object" ? cfg[role] : {};
  const roleDefault = String(roleCfg.profile ?? cfg.profile ?? DEFAULT_PROFILE);
  const name = String(flags.profile ?? roleDefault);

  const builtin = name === "codex" ? { model: defaults.model, effort: defaults.effort } : null;
  const custom = cfg.profiles?.[name];
  if (!builtin && !custom) {
    const known = [...new Set(["codex", ...Object.keys(cfg.profiles ?? {})])].join(", ");
    fail(`unknown profile "${name}" (known: ${known})`);
  }
  const merged = { ...(builtin ?? {}), ...(custom ?? {}) };
  // Role-section tuning (model/effort/timeoutMin) belongs to the role's own default profile; when another
  // profile is picked via --profile it must not leak in (e.g. a gpt model name sent to a remote backend).
  const roleApplies = name === roleDefault;
  const pick = (key) => flags[key] ?? (roleApplies ? roleCfg[key] : undefined) ?? merged[key] ?? null;

  const model = pick("model");
  const prov = merged.provider ?? null;
  if (hasPlaceholder({ model, provider: prov })) {
    fail(`profile "${name}" is not configured yet: replace the YOUR-… placeholders (model, provider.baseUrl) in codex.profiles.${name} in ${PROJECT_CONFIG_PATH}`);
  }
  if (!model && name !== DEFAULT_PROFILE && !merged.codexProfile) {
    fail(`profile "${name}" needs a model: set codex.profiles.${name}.model (or codex.${role}.model) in ${PROJECT_CONFIG_PATH}, pass --model, or use a codexProfile that defines it`);
  }

  // Everything Codex needs beyond -m, as `-c key=value` overrides (valid for `exec` and `exec resume`).
  const overrides = [];
  let modelProvider = merged.modelProvider ?? null;
  if (prov) {
    if (!prov.baseUrl) fail(`profile "${name}": provider.baseUrl is required`);
    const id = String(prov.id ?? `aidk-${name}`);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) fail(`profile "${name}": provider.id must match [A-Za-z0-9_-]+`);
    if (prov.envKey && !process.env[prov.envKey]) {
      fail(`profile "${name}": env var ${prov.envKey} (provider.envKey) is not set — export it before running; the key is never stored in config`);
    }
    const q = (k, v) => overrides.push(`model_providers.${id}.${k}=${JSON.stringify(String(v))}`);
    q("name", prov.name ?? id);
    q("base_url", prov.baseUrl);
    if (prov.envKey) q("env_key", prov.envKey);
    q("wire_api", prov.wireApi ?? "responses");
    if (prov.queryParams && typeof prov.queryParams === "object") {
      overrides.push(`model_providers.${id}.query_params=${JSON.stringify(prov.queryParams)}`);
    }
    modelProvider = id;
  }
  if (merged.codexProfile) overrides.push(`profile=${JSON.stringify(merged.codexProfile)}`);
  if (modelProvider) overrides.push(`model_provider=${JSON.stringify(modelProvider)}`);

  return {
    profile: name,
    model,
    effort: String(pick("effort") ?? defaults.effort),
    modelProvider,
    codexProfile: merged.codexProfile ?? null,
    overrides,
    timeoutMin: pick("timeoutMin"),
  };
}
