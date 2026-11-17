// Run: node --test defaults/merge-dev-conventions.test.cjs
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { merge } = require("./merge-dev-conventions.cjs");

const DEFAULTS = path.join(__dirname, "dev-conventions.defaults.json");
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dc-")), ".claude", "dev-conventions.json");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

test("creates the file with default profiles when missing", () => {
  const t = tmp();
  const added = merge(DEFAULTS, t);
  const cfg = read(t);
  assert.ok(added.length > 0);
  assert.deepStrictEqual(Object.keys(cfg.codex.profiles).sort(), ["codex", "local"]);
  assert.strictEqual(cfg.codex.profiles.local.provider.envKey, "LOCAL_LLM_API_KEY");
});

test("never writes a secret: only an env var name, no key material", () => {
  const t = tmp();
  merge(DEFAULTS, t);
  assert.ok(!/api[_-]?key"\s*:\s*"/i.test(fs.readFileSync(t, "utf8")));
});

test("keeps unrelated keys and existing project values untouched", () => {
  const t = tmp();
  fs.mkdirSync(path.dirname(t), { recursive: true });
  fs.writeFileSync(t, JSON.stringify({
    ticketPrefix: "ABC",
    codex: { profile: "local", profiles: { local: { model: "my-model" } } },
  }));
  const added = merge(DEFAULTS, t);
  const cfg = read(t);
  assert.strictEqual(cfg.ticketPrefix, "ABC");
  assert.strictEqual(cfg.codex.profile, "local");
  assert.strictEqual(cfg.codex.profiles.local.model, "my-model", "existing model must not be overwritten");
  assert.ok(cfg.codex.profiles.codex, "missing codex profile is added");
  assert.ok(!added.includes("codex.profiles.local.model"));
});

test("is idempotent", () => {
  const t = tmp();
  merge(DEFAULTS, t);
  const before = fs.readFileSync(t, "utf8");
  assert.deepStrictEqual(merge(DEFAULTS, t), []);
  assert.strictEqual(fs.readFileSync(t, "utf8"), before);
});

test("malformed JSON is reported and the file is left untouched", () => {
  const t = tmp();
  fs.mkdirSync(path.dirname(t), { recursive: true });
  fs.writeFileSync(t, "{ not json");
  assert.throws(() => merge(DEFAULTS, t), /not valid JSON/);
  assert.strictEqual(fs.readFileSync(t, "utf8"), "{ not json");
});
