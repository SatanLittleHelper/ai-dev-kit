#!/usr/bin/env node
// codex-implement sidecar — hands an already-approved implementation plan to a single
// long-running Codex session that writes code directly (workspace-write sandbox).
// Owns: Codex process lifecycle, session-id capture, checkpoint/resume state persistence.
// State lives in `<cwd>/.codex-implement/<slug>/`, never in the skill directory, and is
// never added to .gitignore by this script. On a clean `finish --reason=complete` the
// whole state dir is deleted; it's kept on disk for inspection on blocked/checkpoint-cap/aborted.
// Does NOT touch git — ever. No pre-flight commit, no post-run commit. The skill (SKILL.md)
// only ever runs read-only git commands (status/diff/log) for verification/review scoping.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { resolveProfile as resolveCodexProfile } from "./profiles.mjs";

// ---------- constants ----------
const DEFAULT_MAX_CHECKPOINTS = 14; // handoff round-trips with Claude also consume checkpoints
const HARD_MAX_CHECKPOINTS = 20;
const DEFAULT_EFFORT = "medium";
const DEFAULT_MODEL = "gpt-6.1-sol";
const DEFAULT_TIMEOUT_MIN = 45; // overridable via --timeout=<minutes>
const HARD_TIMEOUT_MIN = 120;
const STATE_ROOT = ".codex-implement";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RESULT_CHARS = 40000;
const TERMINAL_STATUSES = new Set(["complete", "blocked", "checkpoint-cap", "aborted"]);

// ---------- entrypoint ----------
const [cmd, ...rest] = process.argv.slice(2);

try {
  switch (cmd) {
    case "status":
      await cmdStatus(rest);
      break;
    case "start":
      await cmdStart(rest);
      break;
    case "resume":
      await cmdResume(rest);
      break;
    case "finish":
      await cmdFinish(rest);
      break;
    case "reset":
      await cmdReset(rest);
      break;
    case "--help":
    case "-h":
    case undefined:
      printUsage();
      break;
    default:
      die(`unknown command: ${cmd}\n\n${usageText()}`);
  }
} catch (err) {
  process.stderr.write(`codex-implement: ${err.message}\n`);
  if (process.env.CODEX_IMPLEMENT_DEBUG) process.stderr.write(`${err.stack}\n`);
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

function requirePlanPath(positional) {
  if (positional.length === 0) die("plan-path is required");
  return positional[0];
}

// ---------- slug + paths ----------
function slugify(planPath) {
  const base = basename(planPath).replace(/\.md$/i, "");
  const clean = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "plan";
  return clean;
}

function resolvePlanPath(planPathArg) {
  const cwd = process.cwd();
  const abs = isAbsolute(planPathArg) ? planPathArg : resolve(cwd, planPathArg);
  if (!existsSync(abs)) die(`plan not found: ${planPathArg}`);
  if (!statSync(abs).isFile()) die(`plan path is not a file: ${planPathArg}`);
  const rel = relative(cwd, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    die(`plan must live inside the working directory (${cwd}); got ${planPathArg}`);
  }
  return { abs, rel, cwd };
}

function stateDirFor(planInfo) {
  const stateRoot = join(planInfo.cwd, STATE_ROOT);
  const baseSlug = slugify(planInfo.rel);
  let slug = baseSlug;
  const candidateState = join(stateRoot, slug, "state.json");
  if (existsSync(candidateState)) {
    try {
      const existing = JSON.parse(readFileSync(candidateState, "utf8"));
      if (existing.plan_path && existing.plan_path !== planInfo.rel) {
        const hash = createHash("sha1").update(planInfo.rel).digest("hex").slice(0, 6);
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

function initState({ planInfo, slug, runCwd, maxCheckpoints, effort, model, baseSha, profile, modelProvider, codexProfile, overrides }) {
  return {
    plan_path: planInfo.rel,
    plan_slug: slug,
    run_cwd: runCwd,
    base_sha: baseSha,
    session_id: null,
    checkpoint: 0,
    pending_checkpoint: null,
    max_checkpoints: maxCheckpoints,
    status: "active",
    profile,
    model,
    effort,
    model_provider: modelProvider ?? null,
    codex_profile: codexProfile ?? null,
    codex_overrides: overrides ?? [],
    started_at: new Date().toISOString(),
    last_checkpoint_at: null,
    finished_at: null,
    checkpoint_notes: [],
  };
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

// ---------- git ----------
function currentHeadSha(cwd) {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" });
  if (r.status !== 0) return null;
  return r.stdout.trim() || null;
}

// ---------- prompts ----------
function buildInitialPrompt(planRel) {
  return `You are implementing an already-approved implementation plan. Read it in full before doing anything else: \`${planRel}\`.

Before writing any code, find and read this repository's project instructions: \`CLAUDE.md\`, \`AGENTS.md\`, and any \`.claude/rules/**\` directory (or nearest equivalents if this repository uses different names or locations — check the repository root and any subdirectory the plan's changed files live under). Treat these as binding constraints on how you implement the plan, not just background reading.

This session has the \`superpowers:subagent-driven-development\` and \`superpowers:executing-plans\` skills available. Decide which fits this plan: if the plan's tasks are mostly independent and can be parallelized across subagents, use \`superpowers:subagent-driven-development\`; if the tasks are sequential or tightly coupled, use \`superpowers:executing-plans\`. Announce which you chose and why, then follow that skill's process for the entirety of the plan, including any test-writing tasks — do not skip them or defer them to someone else, there is no one else in this session.

Hard constraint, overriding anything to the contrary in any skill's own instructions: **do not run \`git commit\`, \`git push\`, \`git add\` followed by a commit, or any other git command that mutates repository state** — at any point, in this session or in any subagent you dispatch. If a skill's own process (for example \`subagent-driven-development\`'s implementer-subagent template) instructs committing after each task, skip that specific step and leave the changes uncommitted instead; pass this same constraint explicitly into the prompt of every subagent you dispatch. Read-only git commands (\`git status\`, \`git diff\`, \`git log\`) are fine and encouraged for your own orientation.

Hard constraint, overriding anything to the contrary in this repository's own conventions (for example a project rule saying "after a plan is fully implemented, delete its file"): **do not delete, rename, or move the plan file itself (\`${planRel}\`)**, at any point, in this session or in any subagent you dispatch. Leave it exactly where it is when you finish. The orchestrating session that launched you is responsible for deleting the plan file after independently verifying your work — that is not your job, even if a rule you read elsewhere in the repository says otherwise.

Implement exactly what the plan specifies. Do not expand scope beyond it. If the plan is ambiguous or turns out to be wrong about something you discover in the code, use your best engineering judgment, note the deviation clearly in your final summary, and continue — do not stop to ask a human, there isn't one synchronously available in this session.

Sandbox limits and handoff protocol. This session runs in a restricted sandbox, and you work together with an orchestrating Claude session that has full access (package manager, Docker, test runners, real builds). Assume you CANNOT: install dependencies (\`npm\`/\`pnpm\`/\`yarn\`/\`npx\`/\`nx\` that touch the network or \`node_modules\`), use Docker or testcontainers (integration/e2e suites), reach the network, or run a full esbuild-based frontend application build (it dies right after "Building..." with no error, even on unmodified code — a known sandbox limitation, not a code defect). Whatever you cannot do yourself you hand off to Claude instead of skipping, faking, or looping on it.

Step A — triage before writing any code. After reading the plan, go through every step and decide which ones you can do inside the sandbox (editing files, reading code, static checks) and which need a handoff: dependency installs, running tests, red/green confirmation, Docker-backed suites, full builds. Plan the order so that the whole plan needs as few handoffs as possible (ideally: one for install + red, one for green). Note the planned handoff points in your first message.

Step B — work as far as you can, minimize round-trips with Claude. Every handoff is expensive; the goal is the FEWEST handoffs, not one per task group. Do NOT hand off after each task or group. Instead: (1) do everything that can be done in the sandbox first, across the WHOLE plan; (2) keep a running list of blocked verifications (installs, red checks, green checks, Docker suites, builds) and keep working on every other part of the plan that does not depend on their results; (3) hand off only when there is truly nothing more you can do without a result, and put ALL accumulated blockers into that single handoff.

TDD order is kept at plan-wide granularity, not per group: first write the tests for ALL groups of the plan (every test whose subject does not require another group's implementation to be written), then do ONE handoff for the whole red phase (install, if needed, plus the red run of all those test files). Only after the red results come back (each red must be for the right reason: missing behavior/assertion failure, not an import error, typo or config problem) write the implementation for all groups, then do ONE handoff for the whole green phase. A test that passes before the implementation exists is a defect in the test — fix the test. Never write implementation code for a unit before its tests were confirmed red. If a wrong-reason red or a green failure comes back, fix everything reported and batch the re-check again into one handoff. Tests that genuinely depend on an earlier group's implementation (not merely on its being "next in the plan") form a later red phase; do not batch them with requests that depend on earlier results.

Step C — try once, then hand off. For anything that is not categorically impossible in the sandbox (for example running a single unit-test file), try the command ONCE. If it fails for an environment reason (EPERM, ENOTFOUND, network, missing module that needs an install, Docker socket, spawn error), do not retry or work around it — add it to the pending blockers list and continue with other work. Dependency installs and Docker-backed suites are categorically added to the list without trying.

How to hand off: only after all sandbox-doable work that does not depend on a blocked result is finished, end your final message — in place of the completion sentinels — with a section named "## Handoff requests" containing a numbered list, and after it, as the last line, exactly:
IMPLEMENTATION_HANDOFF: <one-line summary of what you need from Claude>
Each numbered request states: (1) the exact command to run, from the repository root (prefer the narrowest form, e.g. one spec file per the project's TDD loop commands); (2) the expected outcome — "must FAIL because <expected missing behavior>", "must PASS", or "install only, no output needed"; (3) what to report back (failing test names and first error lines, or the pass counts). Batch EVERY blocked request that you can already specify into ONE handoff — each round-trip is expensive, and ending a turn with work still left that you could have done is a defect — but never batch a request that depends on the result of an earlier one. Then stop; do not keep working after the handoff line. You will be resumed in this same session with Claude's results; continue from there without re-reading the whole plan.

If a handoff outcome contradicts the expectation (a "must FAIL" test passed, a "must PASS" run failed), treat the plan step as not done and fix it before moving on.

When — and only when — you have finished implementing the entire plan (all tasks complete, and every verification the plan requires has been confirmed passing — by you, or by Claude through a handoff; never claim a green run nobody actually observed), end your final message with a line containing exactly:
IMPLEMENTATION_COMPLETE

If you must stop because you are blocked (missing information, an unresolvable ambiguity, a failing check you cannot fix even after handoff feedback — a step merely needing a command you cannot run is a handoff, not a block), end your final message instead with exactly:
IMPLEMENTATION_BLOCKED: <one-line reason>

Exactly one sentinel per final message: IMPLEMENTATION_COMPLETE, IMPLEMENTATION_BLOCKED, or IMPLEMENTATION_HANDOFF. Do not emit a sentinel unless it is actually true — no self-congratulation, no partial completion labeled complete.`;
}

function RESUME_CONSTRAINTS(planRel) {
  return `All constraints from your original instructions still apply, in particular: do not run any git command that mutates repository state (no commit, no push, no add-then-commit), in this session or in any subagent you dispatch; do not delete, rename, or move the plan file at \`${planRel}\` even if a repository rule says to delete it after implementation — that is the orchestrating session's job, not yours; keep following the sandbox limits and handoff protocol (hand off what you cannot run, TDD order, one sentinel per final message) —
IMPLEMENTATION_COMPLETE
or
IMPLEMENTATION_BLOCKED: <one-line reason>
or
IMPLEMENTATION_HANDOFF: <one-line summary>`;
}

function buildResumePrompt({ planRel, kind, resultText }) {
  if (kind === "handoff") {
    return `The orchestrating Claude session executed your handoff requests outside the sandbox. Its report follows verbatim.

<handoff-results>
${resultText}
</handoff-results>

Compare each result with the expectation you stated. Where it matches, move on and do ALL the work that has been unblocked (every remaining part of the plan reachable now), not just the next step. Where it does not (a "must FAIL" test passed, a failure for the wrong reason, a "must PASS" run that failed), fix the cause everywhere it applies. Hand off again only when nothing more can be done without a new result, with all pending blockers batched into one handoff. Orient with read-only git commands (\`git status\`, \`git diff\`) only if you need to, then continue the plan.

${RESUME_CONSTRAINTS(planRel)}`;
  }
  if (kind === "verification") {
    return `You signaled IMPLEMENTATION_COMPLETE, but the orchestrating Claude session's independent verification found problems. Its report follows verbatim.

<verification-feedback>
${resultText}
</verification-feedback>

Fix every reported problem in the code (change a test only if the test itself is wrong), then hand off the verification again or finish. Do not declare completion until the failures reported above are addressed.

${RESUME_CONSTRAINTS(planRel)}`;
  }
  return `Your previous attempt at implementing the plan at \`${planRel}\` was interrupted (timeout or crash) before you signaled completion.

Resume from where you left off: check the current state of the working tree with read-only git commands (\`git status\`, \`git diff\`) to see what you'd already changed, then continue the plan.

${RESUME_CONSTRAINTS(planRel)}`;
}

// ---------- completion parsing ----------
function parseCompletion(text) {
  if (/^\s*IMPLEMENTATION_COMPLETE\s*$/m.test(text)) return { done: true, blocked: false, handoff: false, reason: null };
  const m = text.match(/^\s*IMPLEMENTATION_BLOCKED:\s*(.+)$/m);
  if (m) return { done: true, blocked: true, handoff: false, reason: m[1].trim() };
  const h = text.match(/^\s*IMPLEMENTATION_HANDOFF:\s*(.+)$/m);
  if (h) return { done: false, blocked: false, handoff: true, reason: h[1].trim() };
  return { done: false, blocked: false, handoff: false, reason: null };
}

// ---------- Codex invocation ----------
async function runCheckpoint({ stateDir, checkpoint, sessionId, prompt, model, effort, overrides, runCwd, timeoutMs }) {
  const promptPath = join(stateDir.dir, `checkpoint-${checkpoint}-prompt.md`);
  writeFileSync(promptPath, prompt);

  const messagePath = join(stateDir.dir, `checkpoint-${checkpoint}-message.md`);
  const stdoutPath = join(stateDir.dir, `checkpoint-${checkpoint}-stdout.jsonl`);
  for (const p of [messagePath, stdoutPath]) {
    if (existsSync(p)) { try { unlinkSync(p); } catch {} }
  }

  // Model/provider selection is passed via -m/-c, which both `exec` and `exec resume` accept
  // (`resume` has no -p, hence `-c profile=...` instead).
  const modelArgs = [];
  for (const o of overrides ?? []) modelArgs.push("-c", o);
  if (model) modelArgs.push("-m", model);
  modelArgs.push("-c", `model_reasoning_effort=${effort}`);

  const argv = ["exec"];
  if (sessionId) {
    // `codex exec resume` re-attaches to the stored session's workspace and
    // sandbox mode implicitly — it does not accept -C or -s on this subcommand.
    argv.push("resume", sessionId);
    argv.push("--json", "--output-last-message", messagePath, ...modelArgs, prompt);
  } else {
    argv.push("-C", runCwd);
    argv.push("-s", "workspace-write", "--json", "--output-last-message", messagePath, ...modelArgs, prompt);
  }

  const { default: fs } = await import("node:fs");
  const outStream = fs.createWriteStream(stdoutPath);

  let capturedSessionId = sessionId ?? null;
  let exitCode = null;
  let timedOut = false;

  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("codex", argv, { cwd: runCwd, stdio: ["ignore", "pipe", "pipe"] });

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
    err.hint = "run `codex login` or `/codex:setup` if this is an auth issue";
    throw err;
  }
  if (!existsSync(messagePath)) {
    const err = new Error(`codex did not write a final message to ${messagePath}`);
    err.capturedSessionId = capturedSessionId;
    err.exitCode = 1;
    throw err;
  }

  return { messagePath, stdoutPath, sessionId: capturedSessionId };
}

function extractSessionId(line) {
  let evt;
  try { evt = JSON.parse(line); } catch { return null; }
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

// ---------- shared checkpoint-running logic ----------
async function runOneCheckpoint({ stateDir, state, prompt, timeoutMs }) {
  const checkpointNum = state.checkpoint + 1;
  if (checkpointNum > state.max_checkpoints) {
    die(`checkpoint cap reached (checkpoint=${state.checkpoint}, max=${state.max_checkpoints}); call 'finish --reason=checkpoint-cap'`);
  }

  state.pending_checkpoint = checkpointNum;
  saveState(stateDir, state);

  let result;
  try {
    result = await runCheckpoint({
      stateDir,
      checkpoint: checkpointNum,
      sessionId: state.session_id ?? null,
      prompt,
      model: state.model,
      effort: state.effort,
      overrides: state.codex_overrides ?? [],
      runCwd: state.run_cwd,
      timeoutMs,
    });
  } catch (err) {
    if (err.capturedSessionId && !state.session_id) {
      state.session_id = err.capturedSessionId;
      saveState(stateDir, state);
    }
    if (err.hint) process.stderr.write(`hint: ${err.hint}\n`);
    throw err;
  }

  if (result.sessionId && !state.session_id) state.session_id = result.sessionId;

  const messageText = readFileSync(result.messagePath, "utf8");
  const completion = parseCompletion(messageText);

  state.checkpoint = checkpointNum;
  state.pending_checkpoint = null;
  state.last_checkpoint_at = new Date().toISOString();
  state.checkpoint_notes.push({ checkpoint: checkpointNum, timed_out: false });

  if (completion.done && !completion.blocked) {
    state.status = "complete-pending"; // becomes "complete" on `finish`
  } else if (completion.done && completion.blocked) {
    state.status = "blocked-pending"; // becomes "blocked" on `finish`
    state.blocked_reason = completion.reason;
  } else if (completion.handoff) {
    state.status = "handoff-pending"; // Claude must act, then `resume --result-file=...`
    state.handoff_count = (state.handoff_count ?? 0) + 1;
    state.handoff_reason = completion.reason;
  }
  saveState(stateDir, state);

  return {
    checkpoint: checkpointNum,
    message_path: relative(state.run_cwd, result.messagePath),
    state_dir: relative(state.run_cwd, stateDir.dir),
    session_id: state.session_id,
    done: completion.done,
    blocked: completion.blocked,
    blocked_reason: completion.blocked ? completion.reason : null,
    handoff: completion.handoff,
    handoff_reason: completion.handoff ? completion.reason : null,
    handoff_count: state.handoff_count ?? 0,
    needs_resume: !completion.done && !completion.handoff,
    at_cap: checkpointNum >= state.max_checkpoints,
    max_checkpoints: state.max_checkpoints,
  };
}

function readResultFile({ flags, kind, cwd }) {
  const given = flags["result-file"];
  if (kind === "timeout") {
    if (given) die(`--result-file is only valid when resuming after a handoff or a completion signal (state was a plain timeout)`);
    return null;
  }
  if (!given || given === true) {
    die(kind === "handoff"
      ? `run is waiting on a handoff: pass --result-file=<path> with the results of the requested commands`
      : `run signaled completion: to send it back for fixes pass --result-file=<path> with the verification failures`);
  }
  const abs = isAbsolute(given) ? given : resolve(cwd, given);
  if (!existsSync(abs) || !statSync(abs).isFile()) die(`--result-file not found: ${given}`);
  const rel = relative(cwd, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) die(`--result-file must live inside the working directory (${cwd})`);
  const text = readFileSync(abs, "utf8").trim();
  if (!text) die(`--result-file is empty: ${given}`);
  if (text.length <= MAX_RESULT_CHARS) return text;
  return `[truncated: kept the last ${MAX_RESULT_CHARS} characters]\n${text.slice(-MAX_RESULT_CHARS)}`;
}

function resolveTimeoutMs(flags, profileTimeoutMin = null) {
  const requestedTimeout = flags.timeout !== undefined ? Number(flags.timeout)
    : profileTimeoutMin != null ? Number(profileTimeoutMin) : null;
  if (requestedTimeout !== null && (!Number.isFinite(requestedTimeout) || requestedTimeout < 1)) {
    die(`timeout must be a positive integer (minutes); got ${flags.timeout ?? profileTimeoutMin}`);
  }
  if (requestedTimeout !== null && requestedTimeout > HARD_TIMEOUT_MIN) {
    die(`timeout exceeds hard cap of ${HARD_TIMEOUT_MIN} minutes`);
  }
  return (requestedTimeout ?? DEFAULT_TIMEOUT_MIN) * 60 * 1000;
}

// ---------- commands ----------
async function cmdStatus(args) {
  const { positional } = parseArgs(args);
  const planPathArg = requirePlanPath(positional);
  const planInfo = resolvePlanPath(planPathArg);
  const stateDir = stateDirFor(planInfo);
  const state = loadState(stateDir);
  if (!state) {
    process.stdout.write(JSON.stringify({ exists: false, state_dir: stateDir.dir }) + "\n");
    return;
  }
  process.stdout.write(JSON.stringify({ exists: true, state_dir: stateDir.dir, state }, null, 2) + "\n");
}

async function cmdStart(args) {
  const { positional, flags } = parseArgs(args);
  const planPathArg = requirePlanPath(positional);
  const planInfo = resolvePlanPath(planPathArg);
  const stateDir = stateDirFor(planInfo);

  const releaseLock = acquireLock(stateDir);
  try {
    let state = loadState(stateDir);
    if (state) {
      die(`plan already has a run in progress or finished (status=${state.status}); use 'resume', 'status', or 'reset'`);
    }

    const requestedMax = flags["max-checkpoints"] !== undefined ? Number(flags["max-checkpoints"]) : null;
    if (requestedMax !== null && (!Number.isFinite(requestedMax) || requestedMax < 1)) {
      die(`--max-checkpoints must be a positive integer; got ${flags["max-checkpoints"]}`);
    }
    if (requestedMax !== null && requestedMax > HARD_MAX_CHECKPOINTS) {
      die(`--max-checkpoints exceeds hard cap of ${HARD_MAX_CHECKPOINTS}`);
    }

    const resolved = resolveCodexProfile({ flags, cwd: planInfo.cwd, role: "implement", defaults: { model: DEFAULT_MODEL, effort: DEFAULT_EFFORT } });
    const timeoutMs = resolveTimeoutMs(flags, resolved.timeoutMin);
    const baseSha = currentHeadSha(planInfo.cwd);

    state = initState({
      planInfo,
      slug: stateDir.slug,
      runCwd: planInfo.cwd,
      maxCheckpoints: requestedMax ?? DEFAULT_MAX_CHECKPOINTS,
      effort: resolved.effort,
      model: resolved.model,
      profile: resolved.profile,
      modelProvider: resolved.modelProvider,
      codexProfile: resolved.codexProfile,
      overrides: resolved.overrides,
      baseSha,
    });
    state.timeout_min = resolved.timeoutMin;
    saveState(stateDir, state);

    const prompt = buildInitialPrompt(planInfo.rel);
    const out = await runOneCheckpoint({ stateDir, state, prompt, timeoutMs });
    process.stdout.write(JSON.stringify(out) + "\n");
  } finally {
    releaseLock();
  }
}

async function cmdResume(args) {
  const { positional, flags } = parseArgs(args);
  const planPathArg = requirePlanPath(positional);
  const planInfo = resolvePlanPath(planPathArg);
  const stateDir = stateDirFor(planInfo);

  const releaseLock = acquireLock(stateDir);
  try {
    const state = loadState(stateDir);
    if (!state) die(`no state for ${planPathArg}; run 'start' first`);
    if (TERMINAL_STATUSES.has(state.status)) {
      die(`run already finished with status=${state.status}; run 'reset' to start fresh`);
    }
    if (!state.session_id) {
      die(`no session id captured yet for ${planPathArg}; the first checkpoint may still be pending — check 'status'`);
    }

    const kind = state.status === "handoff-pending" ? "handoff"
      : state.status === "complete-pending" ? "verification"
      : "timeout";
    const resultText = readResultFile({ flags, kind, cwd: planInfo.cwd });

    const timeoutMs = resolveTimeoutMs(flags, state.timeout_min ?? null);
    const prompt = buildResumePrompt({ planRel: planInfo.rel, kind, resultText });
    state.status = "active";
    const out = await runOneCheckpoint({ stateDir, state, prompt, timeoutMs });
    process.stdout.write(JSON.stringify(out) + "\n");
  } finally {
    releaseLock();
  }
}

async function cmdFinish(args) {
  const { positional, flags } = parseArgs(args);
  const planPathArg = requirePlanPath(positional);
  const planInfo = resolvePlanPath(planPathArg);
  const stateDir = stateDirFor(planInfo);
  const state = loadState(stateDir);
  if (!state) die(`no state for ${planPathArg}`);

  const reason = flags.reason;
  const allowed = new Set(["complete", "blocked", "checkpoint-cap", "aborted"]);
  if (!reason || !allowed.has(reason)) die(`--reason must be one of: ${[...allowed].join(", ")}`);

  state.status = reason;
  state.finished_at = new Date().toISOString();

  const summary = buildFinalSummary(state, stateDir);

  if (reason === "complete") {
    // Clean run: nothing left to resume or inspect, so remove the whole service
    // directory (state.json, checkpoint prompts/messages/stdout, .lock) rather than
    // leaving it behind. The full summary still goes out inline on stdout.
    rmSync(stateDir.dir, { recursive: true, force: true });
    process.stdout.write(JSON.stringify({
      reason,
      summary_path: null,
      cleaned_up: true,
      summary,
      state,
    }) + "\n");
    return;
  }

  saveState(stateDir, state);
  const summaryPath = join(stateDir.dir, "final-summary.md");
  writeFileSync(summaryPath, summary);

  process.stdout.write(JSON.stringify({
    reason,
    summary_path: relative(planInfo.cwd, summaryPath),
    cleaned_up: false,
    state,
  }) + "\n");
}

function buildFinalSummary(state, stateDir) {
  const lines = [];
  lines.push(`# codex-implement summary — ${state.plan_path}`);
  lines.push("");
  lines.push(`- **Status:** ${state.status}`);
  lines.push(`- **Checkpoints run:** ${state.checkpoint} / ${state.max_checkpoints}`);
  lines.push(`- **Session id:** \`${state.session_id ?? "(none captured)"}\``);
  lines.push(`- **Base SHA:** \`${state.base_sha ?? "(not a git repo)"}\``);
  lines.push(`- **Profile:** ${state.profile ?? "codex"}${state.model_provider ? `, provider=${state.model_provider}` : ""}${state.codex_profile ? `, codex-profile=${state.codex_profile}` : ""}`);
  lines.push(`- **Model:** ${state.model ?? "(from codex config)"}, effort=${state.effort}`);
  lines.push(`- **Started:** ${state.started_at}`);
  lines.push(`- **Finished:** ${state.finished_at ?? "(in progress)"}`);
  if (state.blocked_reason) lines.push(`- **Blocked reason:** ${state.blocked_reason}`);
  lines.push("");
  lines.push(`## Checkpoints`);
  lines.push("");
  if (state.checkpoint_notes.length === 0) {
    lines.push("_(no checkpoints recorded)_");
  } else {
    for (const c of state.checkpoint_notes) {
      lines.push(`- checkpoint ${c.checkpoint}${c.timed_out ? " (timed out, resumed)" : ""}`);
    }
  }
  lines.push("");
  lines.push(`## Checkpoint transcripts`);
  lines.push("");
  for (let i = 1; i <= state.checkpoint; i++) {
    lines.push(`- [checkpoint-${i}-message.md](./checkpoint-${i}-message.md)`);
  }
  return lines.join("\n") + "\n";
}

async function cmdReset(args) {
  const { positional } = parseArgs(args);
  const planPathArg = requirePlanPath(positional);
  const planInfo = resolvePlanPath(planPathArg);
  const stateDir = stateDirFor(planInfo);
  if (!existsSync(stateDir.dir)) {
    process.stdout.write(JSON.stringify({ archived: false, reason: "no state dir" }) + "\n");
    return;
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const archive = `${stateDir.dir}.archived-${ts}`;
  renameSync(stateDir.dir, archive);
  process.stdout.write(JSON.stringify({
    archived: true,
    archive_path: relative(planInfo.cwd, archive),
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
  codex-implement status  <plan-path>
  codex-implement start   <plan-path> [--max-checkpoints=N] [--timeout=<minutes>] [--profile=<name>] [--effort=medium] [--model=<name>]
  codex-implement resume  <plan-path> [--result-file=<path>] [--timeout=<minutes>]
  codex-implement finish  <plan-path> --reason=complete|blocked|checkpoint-cap|aborted
  codex-implement reset   <plan-path>

Handoff: when start/resume prints handoff=true, Codex needs commands run that its sandbox cannot (installs, tests, Docker). Run them, write the report to a file inside the working directory, then "resume --result-file=<path>" (required in that state; also used to send failed verification back after done=true).
Profiles: --profile > .claude/dev-conventions.json "codex.implement.profile" > "codex.profile" > "codex" (stock Codex). Other profiles (e.g. the kit-default "local", your own OpenAI-compatible model server; it ships with YOUR-… placeholders that must be replaced first) are defined in codex.profiles. The model of any profile, "codex" included, can be overridden via codex.profiles.<name>.model, codex.implement.model or --model. Profile is fixed at 'start' and stored in state, so 'resume' keeps it.
Defaults: --max-checkpoints=${DEFAULT_MAX_CHECKPOINTS} (hard cap ${HARD_MAX_CHECKPOINTS}), --timeout=${DEFAULT_TIMEOUT_MIN} minutes (hard cap ${HARD_TIMEOUT_MIN}).
State: writes to ./.codex-implement/<plan-slug>/ in the current working directory.
Git: this sidecar never touches git except read-only 'rev-parse HEAD' to record a base SHA. No commit, ever — neither the sidecar nor the Codex prompts it builds permit one.`;
}

function printUsage() {
  process.stdout.write(usageText() + "\n");
}
