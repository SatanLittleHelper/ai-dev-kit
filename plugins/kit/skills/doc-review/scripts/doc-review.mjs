#!/usr/bin/env node
// doc-review sidecar — drives a warm Codex review loop over a single markdown doc.
// Owns: Codex process lifecycle, session-id capture, state persistence.
// State lives in `<cwd>/.doc-review/<slug>/`, never in the plugin/skill directory.
// Does NOT touch git. Pre-flight checks and the optional final commit are the skill's job.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { resolveProfile as resolveCodexProfile } from "./profiles.mjs";

// ---------- constants ----------
const DEFAULT_MAX = 6;
const HARD_MAX = 10;
const DEFAULT_EFFORT = "medium";
const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_TIMEOUT_MIN = 20; // overridable via --timeout=<minutes>
const HARD_TIMEOUT_MIN = 60;
const STATE_ROOT = ".doc-review";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Shared across prompt builders. Declared up here so the top-level
// `await cmdNext(...)` entry point can use them without a TDZ error —
// `const` declarations later in the file wouldn't be initialized yet
// when cmdNext runs.
const FINDING_AND_VERDICT = `For each finding:
- **Severity**: critical | high | medium | low
- **Location**: section / step / screen (with line numbers if helpful)
- **Issue**: what's wrong
- **Recommendation**: specific fix

End your report with exactly one of these verdict lines on its own line:
  VERDICT: NO_MAJOR_ISSUES   (no critical/high findings left; only nits)
  VERDICT: ISSUES_REMAIN     (at least one critical/high finding)

Be rigorous but honest — don't invent nits to keep iterating.`;

// ---------- entrypoint ----------
const [cmd, ...rest] = process.argv.slice(2);

try {
  switch (cmd) {
    case "status":
      await cmdStatus(rest);
      break;
    case "next":
      await cmdNext(rest);
      break;
    case "record-iteration":
      await cmdRecordIteration(rest);
      break;
    case "finish":
      await cmdFinish(rest);
      break;
    case "reset":
      await cmdReset(rest);
      break;
    case "--help":
    case "-h":
      printUsage();
      break;
    case undefined:
      printUsage();
      break;
    default:
      die(`unknown command: ${cmd}\n\n${usageText()}`);
  }
} catch (err) {
  process.stderr.write(`doc-review: ${err.message}\n`);
  if (process.env.DOC_REVIEW_DEBUG) process.stderr.write(`${err.stack}\n`);
  process.exit(err.exitCode ?? 1);
}

// ---------- CLI parsing ----------
function parseArgs(args) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function requireDocPath(positional) {
  if (positional.length === 0) die("doc-path is required");
  return positional[0];
}

// ---------- slug + paths ----------
function slugify(docPath) {
  const base = basename(docPath).replace(/\.md$/i, "");
  const clean = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "doc";
  return clean;
}

function resolveDocPath(docPathArg) {
  const cwd = process.cwd();
  const abs = isAbsolute(docPathArg) ? docPathArg : resolve(cwd, docPathArg);
  if (!existsSync(abs)) die(`doc not found: ${docPathArg}`);
  if (!statSync(abs).isFile()) die(`doc path is not a file: ${docPathArg}`);
  const rel = relative(cwd, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    die(`doc must live inside the working directory (${cwd}); got ${docPathArg}`);
  }
  return { abs, rel, cwd };
}

function stateDirFor(docInfo) {
  const stateRoot = join(docInfo.cwd, STATE_ROOT);
  const baseSlug = slugify(docInfo.rel);
  let slug = baseSlug;
  // Collision check: if .doc-review/<slug>/state.json exists and references a different doc_path,
  // append a 6-char hash of the relative path.
  const candidate = join(stateRoot, slug);
  const candidateState = join(candidate, "state.json");
  if (existsSync(candidateState)) {
    try {
      const existing = JSON.parse(readFileSync(candidateState, "utf8"));
      if (existing.doc_path && existing.doc_path !== docInfo.rel) {
        const hash = createHash("sha1").update(docInfo.rel).digest("hex").slice(0, 6);
        slug = `${baseSlug}-${hash}`;
      }
    } catch {
      // malformed state — treat as fresh using baseSlug
    }
  }
  return { slug, dir: join(stateRoot, slug), root: stateRoot };
}

// ---------- state ----------
function loadState(stateDir) {
  const p = join(stateDir.dir, "state.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (err) {
    die(`state.json is malformed at ${p}: ${err.message}`);
  }
}

function saveState(stateDir, state) {
  if (!existsSync(stateDir.dir)) mkdirSync(stateDir.dir, { recursive: true });
  writeFileSync(join(stateDir.dir, "state.json"), `${JSON.stringify(state, null, 2)}\n`);
}

function initState({ docInfo, slug, max, effort, model, focus, type, profile, modelProvider, codexProfile, overrides, timeoutMin }) {
  return {
    doc_path: docInfo.rel,
    doc_slug: slug,
    doc_type: type,
    session_id: null,
    iter: 0,
    pending_iter: null,
    max,
    profile,
    effort,
    model,
    model_provider: modelProvider ?? null,
    codex_profile: codexProfile ?? null,
    codex_overrides: overrides ?? [],
    timeout_min: timeoutMin ?? null,
    focus,
    status: "active",
    started_at: new Date().toISOString(),
    last_iter_at: null,
    last_verdict: null,
    iter_notes: [],
  };
}

function resolveDocType(explicit, docRel) {
  if (explicit) {
    if (!["plan", "design", "test-plan"].includes(explicit)) {
      die(`--type must be one of: plan, design, test-plan (or omit for auto-detect); got ${explicit}`);
    }
    return explicit;
  }
  // Auto-detect from path. Normalize separators so the heuristic works on any OS.
  const norm = docRel.replace(/\\/g, "/").toLowerCase();
  // Test plans (Stage A of two-stage planning): `<feature>-tests.md` / `<feature>-test-plan.md`. Checked before `plans/`.
  if (/(-tests|-test-plan)\.md$/.test(norm)) return "test-plan";
  if (/(^|\/)plans\//.test(norm)) return "plan";
  if (/(^|\/)(design-docs|design|proposals)\//.test(norm)) return "design";
  // Fallback: treat as plan (the harsher, claim-checking prompt). The skill explains how to override.
  return "plan";
}

// ---------- locking ----------
function acquireLock(stateDir) {
  const lockPath = join(stateDir.dir, ".lock");
  if (!existsSync(stateDir.dir)) mkdirSync(stateDir.dir, { recursive: true });
  if (existsSync(lockPath)) {
    const pid = Number(readFileSync(lockPath, "utf8").trim());
    if (pid && pidIsAlive(pid)) {
      const err = new Error(`state dir locked by pid ${pid}: ${stateDir.dir}`);
      err.exitCode = 2;
      throw err;
    }
  }
  writeFileSync(lockPath, String(process.pid));
  return () => {
    try { unlinkSync(lockPath); } catch {}
  };
}

function pidIsAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// ---------- gitignore ----------
function ensureGitignore(cwd) {
  const gi = join(cwd, ".gitignore");
  const entry = `${STATE_ROOT}/`;
  if (!existsSync(gi)) {
    // only write if we're inside a git repo
    if (!inGitRepo(cwd)) return;
    writeFileSync(gi, `${entry}\n`);
    return;
  }
  const contents = readFileSync(gi, "utf8");
  const hit = contents
    .split(/\r?\n/)
    .some((line) => line.trim() === entry || line.trim() === STATE_ROOT);
  if (!hit) {
    const sep = contents.endsWith("\n") || contents.length === 0 ? "" : "\n";
    writeFileSync(gi, `${contents}${sep}${entry}\n`);
  }
}

function inGitRepo(cwd) {
  const r = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd, encoding: "utf8" });
  return r.status === 0 && r.stdout.trim() === "true";
}

// ---------- prompts ----------
function buildInitialPrompt(docRel, focus, docType) {
  if (docType === "design") return buildDesignInitialPrompt(docRel, focus);
  if (docType === "test-plan") return buildTestPlanInitialPrompt(docRel, focus);
  return buildPlanInitialPrompt(docRel, focus);
}

function buildTestPlanInitialPrompt(docRel, focus) {
  const focusLine = focus ? `\n**Inputs and focus from the author:** ${focus}\n` : "";
  return `Review the **test plan** at ${docRel}.

A test plan states *what* each test verifies and *why*, as behavior, with no code. It is written from an approved design spec and is later turned into test code and an implementation by a coding agent. You only read; you never edit the plan, the spec or any other file, and you do not judge the implementation design itself.

Read the plan, then the inputs the author names below: the approved design spec it is built from, the project's testing rules (layer table, test-execution policy) and the testing anti-patterns document. If an input is not named, look for it in the repository (the spec next to the plan, \`testing.md\` / \`test-execution-policy.md\` in the project rules) before judging.

Mechanical formatting (case IDs numbering, a "Ловит" line present, placeholders, test code inside the document) is checked by the author before you are called: do not report it unless it breaks one of the points below.

Check the plan against these points:

1. **Spec coverage.** Every requirement and success criterion in the spec has its own \`## R*\` heading with cases, or a line \`Не покрываем: <причина>\`.
2. **Layers.** Each case sits in the right layer per the project's testing rules; there are no cases for excluded layers (components, thin repositories/API clients, pure mappers, Markdown); repositories with query logic have integration cases, not mocked-client unit cases.
3. **Branches.** Every try/catch, null check, early return, upstream error, timeout and non-\`Error\` rejection for which the spec defines behavior has a case. Do not require tests for branches the spec does not define.
4. **Tautology.** Judge from Дано / Когда / Тогда: would the case still pass if the implementation were replaced with \`return mockResult\`? If yes, it is a tautology.
5. **Behavior, not implementation.** A case asserts internals (private methods, call order, logger/console calls, mock call history by index) instead of an observable result.
6. **Anti-patterns** from the testing anti-patterns document: testing mock behavior, test-only methods in production code, mocking without understanding the dependency.

Do not report: missing infrastructure notes (the author checks runners silently and the document has no such section), the absence of a \`Tautology:\` line, mocks not repeated per case (they are stated once per unit group), wording, naming or ordering.

**Severity mapping.** A *major* problem — following the plan as written would give a missing test for spec behavior, a test in the wrong layer, a test for an excluded layer, a tautological test, or a test coupled to implementation — is \`critical\` or \`high\`. Everything else (wording, naming, ordering, style) is \`medium\` or \`low\` and never blocks the verdict. Name the case ID or section in **Location**.
${focusLine}
${FINDING_AND_VERDICT}`;
}

function buildDesignInitialPrompt(docRel, focus) {
  const focusLine = focus ? `\n**User-supplied focus:** ${focus}\n` : "";
  return `Review the **design doc** at ${docRel}.

A design doc shapes direction — UX, architecture, principles. It is not the place to pin down code-level details. Your job is to pressure-test whether this doc can actually guide the decisions it claims to guide.

Read the doc. Then explore the surrounding project to understand its context — other design docs it sits alongside, product specs and binding rules it leans on, the shape of the codebase it tries to steer. Follow every citation the doc makes; each one is a claim you should verify at the source. Then step back and look at the whole picture.

Watch for the following failure modes — but treat this as a lens, not a checklist. Use your judgment. Explore.

- Internal contradictions (rules ↔ examples, rules ↔ other rules)
- Misquoted or hallucinated cross-references to other docs or rules
- Decisions stated without rationale, or with rationale that doesn't actually support the decision
- Trade-offs left unacknowledged — a design doc that only surfaces upsides becomes a liability when implemented
- Scope boundaries too blurry to apply to a future ask
- Over-specification leaking code-level detail (belongs in a plan), or under-specification too abstract to guide a real decision
- Missing cross-cutting concerns the principles implicitly promise to cover (error/empty states, parity across modalities, concurrency, lifecycle transitions, etc.)
${focusLine}
Do not implement or edit anything.

${FINDING_AND_VERDICT}`;
}

function buildPlanInitialPrompt(docRel, focus) {
  const focusLine = focus ? `\n**User-supplied focus:** ${focus}\n` : "";
  return `Review the **implementation plan** at ${docRel}.

A plan will be handed to a coding agent to execute. Any ambiguity becomes a decision the agent will make — sometimes wrong. Your job is to pressure-test whether this plan can be executed as written, and whether executing it will produce the right result.

Read the plan. Then explore: the design doc or proposal the plan cites, the conventions / testing / architecture rules the project expects the plan to respect, and — most importantly — the actual source files the plan names. Open the code. Every file path, function, type, method signature, SQL column, config key, or "existing helper" the plan names is a claim; verify it at the source. This is the single most valuable thing you do here; hallucinated or stale references are the most common and most damaging plan defect at execution time.

Watch for the following failure modes — but treat this as a lens, not a checklist. Use your judgment. Explore.

- Claims about the code that don't match reality (the big one)
- Scope drift from the design doc — more, less, or different than what was authorized
- Step ordering that can't actually execute linearly; commit boundaries that leave the tree broken until a later commit
- Testing strategy that doesn't fit project conventions, misses regression impact, or leans on manual verification where automated coverage is feasible
- Conflicts with binding rules the project already commits to (accepted design docs, team conventions, architectural patterns)
- Ambiguity a coding agent would resolve wrong — unnamed routers, "appropriate" logging, "the existing helper" without naming it, wiring described without specifying the wiring
- Missing error paths, edge cases, or failure modes
${focusLine}
Do not implement or edit anything.

${FINDING_AND_VERDICT}`;
}

function buildFollowupPrompt(docRel, iterNotes, docType) {
  const lens = docType === "design"
    ? `This is still a **design doc** — same lens as iter 1 (coherence, cross-doc integrity, trade-offs, scope). Don't drift into exhaustive code review.`
    : docType === "test-plan"
    ? `This is still a **test plan** — same six checks and severity mapping as iter 1 (spec coverage, layers, branches, tautology, behavior not implementation, anti-patterns). From this round on you only **verify the fixes**: for each previous critical/high finding confirm it is fixed or say it is not; a finding the author rejected with a reason is accepted unless the reason is factually wrong (contradicts the spec, the testing rules or the case text) — then repeat it and say exactly which fact it contradicts; disagreeing on taste is not a reason. A **new** critical/high finding is allowed only on text that changed since the last round; text that did not change and was not reported before is accepted.`
    : `This is still an **implementation plan** — same lens as iter 1. Claim accuracy against the actual code remains the primary thing; re-verify newly introduced code references at the source.`;

  const lastNote = iterNotes.length > 0 ? iterNotes[iterNotes.length - 1] : null;
  const noChangesThisRound = lastNote && lastNote.no_changes;
  const notesBlock = docType === "test-plan" && lastNote?.note
    ? `\n**The author's notes on the last round** (what was fixed, and which findings were rejected and why):\n${lastNote.note}\n`
    : "";

  if (noChangesThisRound) {
    return `No revisions were made this round — prior findings were nits or rejected.

${lens}
${notesBlock}
Re-read the current doc at ${docRel} with fresh eyes. Decide whether anything you flagged previously still deserves critical/high severity, or whether the doc is genuinely ready. Don't invent nits to keep the loop going.

${FINDING_AND_VERDICT}`;
  }

  return `The doc was revised based on your prior findings. You already have the previous version of ${docRel} in your context from the last round — re-read the current file fresh and let your own memory provide the diff.

${lens}
${notesBlock}
1. Re-read the current full doc at ${docRel}.
2. Compare against what you reviewed last round (already in your context). Identify what changed.
3. For each changed section, re-verify any new claims fresh — especially file paths, function names, signatures, and any other concrete references the revision introduced.

Focus on: whether revisions actually addressed prior findings, NEW problems introduced by the fixes (regressions are real), and anything you missed last round.

${FINDING_AND_VERDICT}`;
}

// ---------- Codex invocation ----------
// Model/provider selection as exec args. -m / -c are accepted by both `exec` and `exec resume`.
function modelArgsFor({ model, effort, overrides }) {
  const args = [];
  for (const o of overrides ?? []) args.push("-c", o);
  if (model) args.push("-m", model);
  args.push("-c", `model_reasoning_effort=${effort}`);
  return args;
}

async function runCodex({ stateDir, iter, sessionId, prompt, model, effort, overrides, cwd, timeoutMs }) {
  const promptPath = join(stateDir.dir, `iter-${iter}-prompt.md`);
  writeFileSync(promptPath, prompt);

  const reportPath = join(stateDir.dir, `iter-${iter}-report.md`);
  const stdoutPath = join(stateDir.dir, `iter-${iter}-stdout.jsonl`);
  // Pre-clear any stale files from a crashed prior attempt at this iter.
  for (const p of [reportPath, stdoutPath]) {
    if (existsSync(p)) { try { unlinkSync(p); } catch {} }
  }

  const argv = ["exec"];
  if (sessionId) argv.push("resume", sessionId);
  argv.push(
    "--json",
    "--output-last-message", reportPath,
    ...modelArgsFor({ model, effort, overrides }),
    prompt
  );

  const { default: fs } = await import("node:fs");
  const outStream = fs.createWriteStream(stdoutPath);

  let capturedSessionId = sessionId ?? null;
  let exitCode = null;
  let timedOut = false;

  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("codex", argv, { cwd, stdio: ["ignore", "pipe", "pipe"] });

    const timeout = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGTERM"); } catch {}
      setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 5000);
    }, timeoutMs);

    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      outStream.write(`${line}\n`);
      if (!capturedSessionId) {
        const id = extractSessionId(line);
        if (id) capturedSessionId = id;
      }
    });

    child.stderr.on("data", (chunk) => process.stderr.write(chunk));

    child.on("error", (err) => {
      clearTimeout(timeout);
      outStream.end();
      rejectPromise(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      outStream.end();
      exitCode = code;
      resolvePromise();
    });
  });

  if (timedOut) {
    const err = new Error(`codex exec timed out after ${Math.round(timeoutMs / 1000)}s (override with --timeout=<minutes>)`);
    err.capturedSessionId = capturedSessionId;
    err.exitCode = 124;
    throw err;
  }
  if (exitCode !== 0) {
    const err = new Error(`codex exec exited with code ${exitCode} (check ${stdoutPath})`);
    err.capturedSessionId = capturedSessionId;
    err.exitCode = exitCode || 1;
    if (exitCode !== 0) err.hint = "run `codex login` or `/codex:setup` if this is an auth issue";
    throw err;
  }
  if (!existsSync(reportPath)) {
    const err = new Error(`codex did not write report to ${reportPath}`);
    err.capturedSessionId = capturedSessionId;
    err.exitCode = 1;
    throw err;
  }

  return { reportPath, stdoutPath, sessionId: capturedSessionId };
}

function extractSessionId(line) {
  let evt;
  try { evt = JSON.parse(line); } catch { return null; }
  // `codex exec --json` emits {"type":"thread.started","thread_id":"<uuid>"} as its first event.
  // Older / alternate shapes (session_configured, session_meta) use different keys — probe them all.
  const candidates = [
    evt?.thread_id,
    evt?.session_id,
    evt?.id,
    evt?.payload?.thread_id,
    evt?.payload?.session_id,
    evt?.payload?.id,
    evt?.msg?.thread_id,
    evt?.msg?.session_id,
    evt?.msg?.id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && UUID_RE.test(c)) return c;
  }
  return null;
}

// ---------- report parsing ----------
function parseReport(reportPath) {
  const text = readFileSync(reportPath, "utf8");
  const verdict = parseVerdict(text);
  const severities = countSeverities(text);
  const blocking = (severities.critical || 0) + (severities.high || 0);
  const total = blocking + (severities.medium || 0) + (severities.low || 0);
  return { verdict, severities, blocking, total };
}

function parseVerdict(text) {
  const match = text.match(/^\s*VERDICT:\s*(NO_MAJOR_ISSUES|ISSUES_REMAIN)\b/m);
  return match ? match[1] : null;
}

function countSeverities(text) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  const re = /\*\*Severity\*\*:\s*(critical|high|medium|low)\b/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const key = m[1].toLowerCase();
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

// ---------- commands ----------
async function cmdStatus(args) {
  const { positional } = parseArgs(args);
  const docPathArg = requireDocPath(positional);
  const docInfo = resolveDocPath(docPathArg);
  const stateDir = stateDirFor(docInfo);
  const state = loadState(stateDir);
  if (!state) {
    process.stdout.write(JSON.stringify({ exists: false, state_dir: stateDir.dir }) + "\n");
    return;
  }
  process.stdout.write(JSON.stringify({ exists: true, state_dir: stateDir.dir, state }, null, 2) + "\n");
}

async function cmdNext(args) {
  const { positional, flags } = parseArgs(args);
  const docPathArg = requireDocPath(positional);
  const docInfo = resolveDocPath(docPathArg);
  const stateDir = stateDirFor(docInfo);

  if (!existsSync(stateDir.dir)) mkdirSync(stateDir.dir, { recursive: true });

  const releaseLock = acquireLock(stateDir);
  try {
    let state = loadState(stateDir);

    const requestedMax = flags.max !== undefined ? Number(flags.max) : null;
    if (requestedMax !== null && (!Number.isFinite(requestedMax) || requestedMax < 1)) {
      die(`--max must be a positive integer; got ${flags.max}`);
    }
    if (requestedMax !== null && requestedMax > HARD_MAX) {
      die(`--max exceeds hard cap of ${HARD_MAX}`);
    }

    // Profile is resolved once, on the first `next`, and stored in state; resumes reuse it.
    const resolved = state
      ? null
      : resolveCodexProfile({ flags, cwd: docInfo.cwd, role: "review", defaults: { model: DEFAULT_MODEL, effort: DEFAULT_EFFORT } });
    const profileTimeoutMin = state ? (state.timeout_min ?? null) : resolved.timeoutMin;
    const requestedTimeout = flags.timeout !== undefined ? Number(flags.timeout)
      : profileTimeoutMin != null ? Number(profileTimeoutMin) : null;
    if (requestedTimeout !== null && (!Number.isFinite(requestedTimeout) || requestedTimeout < 1)) {
      die(`timeout must be a positive integer (minutes); got ${flags.timeout ?? profileTimeoutMin}`);
    }
    if (requestedTimeout !== null && requestedTimeout > HARD_TIMEOUT_MIN) {
      die(`timeout exceeds hard cap of ${HARD_TIMEOUT_MIN} minutes`);
    }
    const timeoutMs = (requestedTimeout ?? DEFAULT_TIMEOUT_MIN) * 60 * 1000;

    const explicitType = typeof flags.type === "string" ? flags.type : null;

    if (!state) {
      const docType = resolveDocType(explicitType, docInfo.rel);
      state = initState({
        docInfo,
        slug: stateDir.slug,
        max: requestedMax ?? DEFAULT_MAX,
        effort: resolved.effort,
        model: resolved.model,
        profile: resolved.profile,
        modelProvider: resolved.modelProvider,
        codexProfile: resolved.codexProfile,
        overrides: resolved.overrides,
        timeoutMin: resolved.timeoutMin,
        focus: typeof flags.focus === "string" ? flags.focus : null,
        type: docType,
      });
      writeFileSync(join(stateDir.dir, "initial-prompt.md"), buildInitialPrompt(docInfo.rel, state.focus, state.doc_type));
      writeFileSync(join(stateDir.dir, "followup-prompt.md"), "(populated per iteration at iter-N-prompt.md)\n");
      saveState(stateDir, state);
    } else {
      // Allow overriding max/focus/effort/model/type on resume; harmless if same.
      if (requestedMax !== null) state.max = requestedMax;
      if (flags.effort) state.effort = flags.effort;
      if (flags.model) state.model = flags.model;
      if (typeof flags.focus === "string") state.focus = flags.focus;
      if (explicitType) state.doc_type = resolveDocType(explicitType, docInfo.rel);
      // Back-fill doc_type on older state files that predate this flag.
      if (!state.doc_type) state.doc_type = resolveDocType(null, docInfo.rel);
      if (state.status && state.status !== "active") {
        die(`review already finished with status=${state.status}; run 'reset' to start fresh`);
      }
    }

    // Determine iteration to run.
    const candidateIter = state.pending_iter ?? state.iter + 1;
    if (candidateIter > state.max) {
      die(`iteration cap reached (iter=${state.iter}, max=${state.max}); call 'finish --reason=cap-hit'`);
    }

    // Record pending_iter so a crash mid-call is recoverable.
    state.pending_iter = candidateIter;
    saveState(stateDir, state);

    // Build prompt for this iteration.
    let prompt;
    if (candidateIter === 1) {
      prompt = buildInitialPrompt(docInfo.rel, state.focus, state.doc_type);
    } else {
      prompt = buildFollowupPrompt(docInfo.rel, state.iter_notes ?? [], state.doc_type);
    }

    // Invoke Codex.
    let result;
    try {
      result = await runCodex({
        stateDir,
        iter: candidateIter,
        // Reuse session_id whenever it's set — covers N>=2 (warm context)
        // and iter-1 retries after a crash (preserve Codex reasoning).
        sessionId: state.session_id ?? null,
        prompt,
        model: state.model,
        effort: state.effort,
        overrides: state.codex_overrides ?? [],
        cwd: docInfo.cwd,
        timeoutMs,
      });
    } catch (err) {
      // Persist any captured session id so a resume is still possible.
      if (err.capturedSessionId && !state.session_id) {
        state.session_id = err.capturedSessionId;
        saveState(stateDir, state);
      }
      if (err.hint) process.stderr.write(`hint: ${err.hint}\n`);
      throw err;
    }

    if (result.sessionId && !state.session_id) state.session_id = result.sessionId;

    const parsed = parseReport(result.reportPath);
    const converged = parsed.verdict === "NO_MAJOR_ISSUES";

    // Finalize state for this iteration.
    state.iter = candidateIter;
    state.pending_iter = null;
    state.last_iter_at = new Date().toISOString();
    state.last_verdict = {
      blocking: parsed.blocking,
      total: parsed.total,
      verdict: parsed.verdict,
      converged,
      severities: parsed.severities,
    };
    if (converged) state.status = "converged-pending"; // becomes "converged" on `finish`
    saveState(stateDir, state);

    const out = {
      iter: candidateIter,
      report_path: relative(docInfo.cwd, result.reportPath),
      status_path: relative(docInfo.cwd, join(stateDir.dir, "state.json")),
      state_dir: relative(docInfo.cwd, stateDir.dir),
      session_id: state.session_id,
      verdict: parsed.verdict,
      converged,
      blocking_count: parsed.blocking,
      total_count: parsed.total,
      max: state.max,
      at_cap: candidateIter >= state.max,
    };
    process.stdout.write(JSON.stringify(out) + "\n");
  } finally {
    releaseLock();
  }
}

async function cmdRecordIteration(args) {
  const { positional, flags } = parseArgs(args);
  const docPathArg = requireDocPath(positional);
  const docInfo = resolveDocPath(docPathArg);
  const stateDir = stateDirFor(docInfo);
  const state = loadState(stateDir);
  if (!state) die(`no state for ${docPathArg}; run 'next' first`);
  if (state.iter < 1) die(`no completed iteration to record against`);

  const iter = state.iter;
  const appliedPath = join(stateDir.dir, `iter-${iter}-applied.md`);
  if (existsSync(appliedPath)) die(`iter-${iter}-applied.md already exists; cannot record twice`);

  const note = typeof flags.note === "string" ? flags.note.trim() : "";
  const noChanges = flags["no-changes"] === true || flags["no-changes"] === "true";

  if (noChanges) {
    const body = `# iter-${iter}-applied\n\n(no edits this round — all findings classified as nits or rejected)\n\n${note ? `**Note:** ${note}\n` : ""}`;
    writeFileSync(appliedPath, body);
    if (!Array.isArray(state.iter_notes)) state.iter_notes = [];
    state.iter_notes.push({ iter, note: note || "(no changes)", no_changes: true });
    saveState(stateDir, state);
    process.stdout.write(JSON.stringify({ iter, no_changes: true, applied_path: relative(docInfo.cwd, appliedPath) }) + "\n");
    return;
  }

  if (!note) die(`--note is required unless --no-changes is passed`);

  const body = `# iter-${iter}-applied\n\n**Note:** ${note}\n`;
  writeFileSync(appliedPath, body);

  if (!Array.isArray(state.iter_notes)) state.iter_notes = [];
  state.iter_notes.push({ iter, note, no_changes: false });
  saveState(stateDir, state);

  process.stdout.write(JSON.stringify({
    iter,
    no_changes: false,
    applied_path: relative(docInfo.cwd, appliedPath),
  }) + "\n");
}

async function cmdFinish(args) {
  const { positional, flags } = parseArgs(args);
  const docPathArg = requireDocPath(positional);
  const docInfo = resolveDocPath(docPathArg);
  const stateDir = stateDirFor(docInfo);
  const state = loadState(stateDir);
  if (!state) die(`no state for ${docPathArg}`);

  const reason = flags.reason;
  const allowed = new Set(["converged", "cap-hit", "aborted"]);
  if (!reason || !allowed.has(reason)) die(`--reason must be one of: ${[...allowed].join(", ")}`);

  state.status = reason;
  state.finished_at = new Date().toISOString();
  saveState(stateDir, state);

  const summary = buildFinalSummary(state, stateDir, docInfo);
  const summaryPath = join(stateDir.dir, "final-summary.md");
  writeFileSync(summaryPath, summary);

  process.stdout.write(JSON.stringify({
    reason,
    summary_path: relative(docInfo.cwd, summaryPath),
    state,
  }) + "\n");
}

function buildFinalSummary(state, stateDir, docInfo) {
  const lines = [];
  lines.push(`# Doc review summary — ${state.doc_path}`);
  lines.push("");
  lines.push(`- **Status:** ${state.status}`);
  lines.push(`- **Iterations run:** ${state.iter} / ${state.max}`);
  lines.push(`- **Session id:** \`${state.session_id ?? "(none captured)"}\``);
  lines.push(`- **Profile:** ${state.profile ?? "codex"}${state.model_provider ? `, provider=${state.model_provider}` : ""}${state.codex_profile ? `, codex-profile=${state.codex_profile}` : ""}`);
  lines.push(`- **Model:** ${state.model ?? "(from codex config)"}, effort=${state.effort}`);
  lines.push(`- **Started:** ${state.started_at}`);
  lines.push(`- **Finished:** ${state.finished_at ?? "(in progress)"}`);
  if (state.focus) lines.push(`- **Focus:** ${state.focus}`);
  lines.push("");
  lines.push(`## Per-iteration edits`);
  lines.push("");
  const notes = state.iter_notes ?? [];
  if (notes.length === 0) {
    lines.push("_(no iterations recorded edits)_");
  } else {
    for (const c of notes) {
      const tag = c.no_changes ? "_(no changes)_" : "**edits**";
      lines.push(`- **iter ${c.iter}** ${tag}: ${c.note}`);
    }
  }
  lines.push("");
  lines.push(`## Last Codex verdict`);
  lines.push("");
  if (state.last_verdict) {
    lines.push(`- **verdict:** \`${state.last_verdict.verdict ?? "(missing)"}\``);
    lines.push(`- **blocking:** ${state.last_verdict.blocking} (critical+high)`);
    lines.push(`- **total findings:** ${state.last_verdict.total}`);
    lines.push(`- **severities:** ${JSON.stringify(state.last_verdict.severities)}`);
  } else {
    lines.push("_(no verdict recorded)_");
  }
  lines.push("");
  // Remaining medium/low findings from the last report, if available.
  if (state.iter > 0) {
    const lastReportPath = join(stateDir.dir, `iter-${state.iter}-report.md`);
    if (existsSync(lastReportPath)) {
      const nits = extractNitFindings(readFileSync(lastReportPath, "utf8"));
      if (nits.length > 0) {
        lines.push(`## Remaining medium/low items worth considering`);
        lines.push("");
        for (const n of nits) lines.push(`- ${n}`);
        lines.push("");
      }
    }
  }
  lines.push(`## Per-iteration reports`);
  lines.push("");
  for (let i = 1; i <= state.iter; i++) {
    lines.push(`- [iter-${i}-report.md](./iter-${i}-report.md)`);
    lines.push(`- [iter-${i}-applied.md](./iter-${i}-applied.md)`);
  }
  return lines.join("\n") + "\n";
}

function extractNitFindings(text) {
  // Very loose heuristic: collect lines that pair a medium/low severity with the preceding/next Location.
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/\*\*Severity\*\*:\s*(medium|low)\b/i);
    if (!m) continue;
    // Look for Location within next 4 lines.
    let location = "";
    let issue = "";
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const ml = lines[j].match(/\*\*Location\*\*:\s*(.+)/i);
      if (ml) location = ml[1].trim();
      const mi = lines[j].match(/\*\*Issue\*\*:\s*(.+)/i);
      if (mi) issue = mi[1].trim();
    }
    out.push(`[${m[1]}] ${location}${location && issue ? " — " : ""}${issue}`);
  }
  return out;
}

async function cmdReset(args) {
  const { positional } = parseArgs(args);
  const docPathArg = requireDocPath(positional);
  const docInfo = resolveDocPath(docPathArg);
  const stateDir = stateDirFor(docInfo);
  if (!existsSync(stateDir.dir)) {
    process.stdout.write(JSON.stringify({ archived: false, reason: "no state dir" }) + "\n");
    return;
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const archive = `${stateDir.dir}.archived-${ts}`;
  renameSync(stateDir.dir, archive);
  process.stdout.write(JSON.stringify({
    archived: true,
    archive_path: relative(docInfo.cwd, archive),
  }) + "\n");
}

// ---------- helpers ----------
function die(msg) {
  const err = new Error(msg);
  err.exitCode = 1;
  throw err;
}

function usageText() {
  return `Usage:
  doc-review status            <doc-path>
  doc-review next              <doc-path> [--type=plan|design] [--max=N] [--timeout=<minutes>] [--profile=<name>] [--effort=medium] [--model=<name>] [--focus="..."]
  doc-review record-iteration  <doc-path> --note="..." [--no-changes]
  doc-review finish            <doc-path> --reason=converged|cap-hit|aborted
  doc-review reset             <doc-path>

Profiles: --profile > .claude/dev-conventions.json "codex.review.profile" > "codex.profile" > "codex" (stock Codex). Fixed at the first "next" and stored in state.json. See skills/doc-review/SKILL.md.
Defaults: --max=${DEFAULT_MAX} (hard cap ${HARD_MAX}), --timeout=${DEFAULT_TIMEOUT_MIN} minutes (hard cap ${HARD_TIMEOUT_MIN}).
--type auto-detects from path: /plans/ → plan, /design-docs|/design|/proposals/ → design; fallback is plan.
State: writes to ./.doc-review/<doc-slug>/ in the current working directory.
Git: this sidecar never touches git. The skill handles pre-flight dirty-doc checks and the optional final commit.`;
}

function printUsage() {
  process.stdout.write(usageText() + "\n");
}
