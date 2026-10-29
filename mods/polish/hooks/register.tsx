import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Step } from '../types'

const step = atom({ plugin: 'polish', key: 'step' } as const, 'idle' as Step)
// Comma-joined ids of the agents that existed when the chain started: only newer ones count as ours.
const baseline = atom({ plugin: 'polish', key: 'baseline' } as const, '')
const turnCount = atom({ plugin: 'polish', key: 'turnCount' } as const, 0)
const turnsAtStart = atom({ plugin: 'polish', key: 'turnsAtStart' } as const, 0)
// Id of the running main-loop turn, '' between turns: what Cancel aborts, and what advance waits out.
const runningTurnId = atom({ plugin: 'polish', key: 'runningTurnId' } as const, '')
const simplifyAnswer = atom({ plugin: 'polish', key: 'simplifyAnswer' } as const, '')
const fixed = atom({ plugin: 'polish', key: 'fixed' } as const, '')
const skipped = atom({ plugin: 'polish', key: 'skipped' } as const, '')
const report = atom({ plugin: 'polish', key: 'report' } as const, '')
// The review answer is kept until the fixes that follow it are done: only then the review report opens.
const reviewAnswer = atom({ plugin: 'polish', key: 'reviewAnswer' } as const, '')
const turnsAtFix = atom({ plugin: 'polish', key: 'turnsAtFix' } as const, 0)
// Last answer of the main assistant while it applied the fixes: what the review report says was fixed.
const fixAnswer = atom({ plugin: 'polish', key: 'fixAnswer' } as const, '')
// Set once the wait for the assistant to start on the findings is over: a quiet session then ends the fixes.
const fixGraceOver = atom({ plugin: 'polish', key: 'fixGraceOver' } as const, false)

const REVIEW_COMMAND = 'superpowers:requesting-code-review'
// Every opened report gets its own file: one shared path let a report from another session or worktree overwrite the one still being read.
const newReportPath = (): string => `/tmp/polish-report-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.md`
// The user's own prompts: a background agent's hand-back or a task notification must not cancel the chain.
const USER_ORIGINS = ['composer', 'bridge']
const SECTION_FIXED = 'Polish: fixed'
const SECTION_SKIPPED = 'Polish: skipped'
const SECTION_NOT_REPORTED = 'Polish: reviewed-not-reported'
const SECTION_FINDINGS = 'Polish: review-findings'
const NOT_EXTRACTED = 'не удалось выделить'
const ACTIVE_AGENT_STATUSES = ['pending', 'running']
const FEEDBACK_PREFIX = 'Замечания к отчёту Polish (из Plannotator). Разбери каждое и исправь, что нужно:'
// Steps where the main assistant applies fixes, and the step that follows each of them.
const FIX_NEXT: Partial<Record<Step, Step>> = { 'simplify-fix': 'review', fix: 'review-report', 'review-fix': 'idle' }
const STEP_LABELS: Record<Step, string> = {
  idle: '',
  simplify: 'simplify',
  'simplify-report': 'отчёт simplify в Plannotator',
  'simplify-fix': 'правки по замечаниям simplify',
  review: 'review',
  fix: 'правки по ревью',
  'review-report': 'отчёт ревью в Plannotator',
  'review-fix': 'правки по замечаниям ревью',
}
// What plannotator prints when the review is closed without a single annotation.
const NO_FEEDBACK = /^user reviewed the document and has no feedback\.?$/i
const SETTLE_MS = 1500
const FIX_START_GRACE_MS = 30 * 1000
const FEEDBACK_IDLE_STEP_MS = 500
const FEEDBACK_IDLE_ATTEMPTS = 120
const MAX_FIX_CHARS = 6000
const NO_FIXES = '- правок после ревью не было'
const RAW_TAIL_LENGTH = 1500

const APPLY_FINDINGS_PROMPT = `Ревью завершено. Примени находки ревью, которые стоит исправить (Critical и Important; Minor — по своему усмотрению).

Закончи финальное сообщение секцией "## ${SECTION_FINDINGS}" со ВСЕМИ замечаниями ревью (Critical / Important / Minor), по одному на строку:
- ✅ <file:line> — [Critical|Important|Minor] <замечание> — <что исправлено>
- ⬜ <file:line> — [Critical|Important|Minor] <замечание> — <почему не исправлено>
Исправленные помечай ✅, неисправленные ⬜. Если у ревью не было замечаний, напиши одну строку "- none".`

const REVIEW_SCOPE_INSTRUCTION = `## Polish scope (added by the polish mod)
Review the uncommitted changes in the working tree: BASE_SHA is HEAD, the diff is \`git diff HEAD\` plus the untracked files. Do not fix anything and do not commit at this step — report findings only; the fixes are applied in a separate step afterwards. Put the reviewer's findings (Critical / Important / Minor, with file:line) into your final message.`

const SIMPLIFY_INSTRUCTION = `## Polish report (added by the polish mod)
End your final message with exactly two sections, in this order:

## Polish: fixed
- <file:line> — <what was fixed>

## Polish: skipped
- <file:line> — <the finding> — <why it was skipped>

After every item of the skipped list add a fenced code block with the current code (at most 8 lines) and, when you know the change, a second fenced block labelled "Proposed:" with the code you would write. If nothing was fixed, write the single line "- none" under "## Polish: fixed"; if nothing was skipped, write the single line "- none" under "## Polish: skipped". The user reads these as a report, so write the descriptions in Russian.`

const NOT_REPORTED_INSTRUCTION = `## Polish: candidates you did not report (added by the polish mod)
After your report add a section "## ${SECTION_NOT_REPORTED}": the candidate issues you examined but left out of the main report (low confidence, out of scope for this level, or covered elsewhere). One item per line as "- <file:line> — <suspected issue> — <why it was not reported>", each followed by a fenced code block with the relevant code (at most 8 lines). If there are none, write the single line "- none". Write the descriptions in Russian.`

// Line range of the "## <title>" section: from its heading to the next heading outside code fences.
function findSection(lines: string[], title: string): { start: number; end: number } | undefined {
  const heading = `## ${title}`.toLowerCase()
  const start = lines.findIndex(line => line.trim().toLowerCase() === heading)

  if (start === -1) {
    return undefined
  }

  let isFenced = false

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? ''

    if (line.trim().startsWith('```')) {
      isFenced = !isFenced
    } else if (!isFenced && /^#{1,6}\s/.test(line)) {
      return { start, end: index }
    }
  }

  return { start, end: lines.length }
}

// The body of the "## <title>" section, or undefined when there is none.
function extractSection(text: string, title: string): string | undefined {
  const lines = text.split('\n')
  const range = findSection(lines, title)

  return range === undefined ? undefined : lines.slice(range.start + 1, range.end).join('\n').trim()
}

function removeSection(text: string, title: string): string {
  const lines = text.split('\n')
  const range = findSection(lines, title)

  return range === undefined ? text : [...lines.slice(0, range.start), ...lines.slice(range.end)].join('\n').trim()
}

function capChars(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n- … (список обрезан)`
}

// True for a list the model left empty on purpose ("- none"); a failed extraction is not empty.
function isNoneList(text: string): boolean {
  return /^-?\s*none\.?$/i.test(text.trim())
}

function buildSimplifyReport(fixedText: string, skippedText: string): string {
  return [
    '# Polish: simplify',
    '## Simplify: исправлено',
    fixedText || '- нет данных',
    '## Simplify: пропущено',
    skippedText || '- нет данных',
  ].join('\n\n')
}

function buildReviewReport(reviewText: string, fixesText: string): string {
  const notReported = extractSection(reviewText, SECTION_NOT_REPORTED)
  const review = removeSection(reviewText, SECTION_NOT_REPORTED)
  const findings = extractSection(fixesText, SECTION_FINDINGS)

  // The fix step lists every finding with its status, so the reviewer's own text (written before any fix) is not repeated.
  if (findings !== undefined) {
    return [
      '# Polish: code review',
      '## Code review: замечания (✅ — исправлено)',
      findings,
      '## Code review: рассмотрено, но не заявлено',
      notReported ?? '- нет данных',
    ].join('\n\n')
  }

  return [
    '# Polish: code review',
    '## Code review',
    review || '- отчёт ревью не получен',
    '## Code review: исправлено после ревью',
    fixesText.trim() === '' ? NO_FIXES : capChars(fixesText.trim(), MAX_FIX_CHARS),
    '## Code review: рассмотрено, но не заявлено',
    notReported ?? '- нет данных',
  ].join('\n\n')
}

async function reset($: EngineInterface): Promise<void> {
  await update($, step, () => 'idle')
  await update($, fixGraceOver, () => false)
}

// Agents started since the chain began that are still working.
async function hasActiveAgents($: EngineInterface): Promise<boolean> {
  const known = new Set((await read($, baseline)).split(','))

  return (await $.agent.list()).some(agent => !known.has(agent.id) && ACTIVE_AGENT_STATUSES.includes(agent.status))
}

// Atomically moves the chain from one step to another; false when something else already did.
async function claim($: EngineInterface, from: Step, to: Step): Promise<boolean> {
  let isClaimed = false

  await update($, step, current => {
    isClaimed = current === from

    return isClaimed ? to : current
  })

  return isClaimed
}

// Cancel: stop the chain first (so no hook moves it on), then abort the running turn and the agents it started.
async function cancelAll($: EngineInterface): Promise<void> {
  const known = new Set((await read($, baseline)).split(','))
  const turnId = await read($, runningTurnId)

  await reset($)

  if (turnId !== '') {
    await $.turn.abort({ turnId }).catch(() => undefined)
  }

  const running = (await $.agent.list()).filter(
    agent => !known.has(agent.id) && ACTIVE_AGENT_STATUSES.includes(agent.status),
  )

  await Promise.all(
    running.map(agent => $.tool.call({ tool: 'TaskStop', task_id: agent.id }).catch(() => undefined)),
  )
}

// The only toasts the mod shows: a step that could not be started, so the chain stops for a reason.
async function fail($: EngineInterface, message: string): Promise<void> {
  await reset($)
  $.ui.toast(message)
}

// plannotator annotate stays alive until the review in the browser is submitted, then prints the
// user's annotations on stdout. Resolves with them once it exits; '' when there are none or it failed to open.
async function watchPlannotator($: EngineInterface, reportPath: string): Promise<string> {
  let feedback = ''

  try {
    for await (const piece of $.process.spawn({ argv: ['plannotator', 'annotate', reportPath] })) {
      if ('stream' in piece && piece.stream === 'stdout') {
        feedback += piece.text
      }
    }
  } catch (error) {
    $.ui.toast(`Polish: не удалось открыть Plannotator: ${String(error)}`)

    return ''
  }

  const trimmed = feedback.trim()

  return NO_FEEDBACK.test(trimmed) ? '' : trimmed
}

// The annotations must not land in the middle of a running turn: they go out once the session is quiet.
async function waitForIdleTurn($: EngineInterface): Promise<void> {
  for (let attempt = 0; attempt < FEEDBACK_IDLE_ATTEMPTS && (await read($, runningTurnId)) !== ''; attempt += 1) {
    await $.clock.sleep(FEEDBACK_IDLE_STEP_MS)
  }
}

// Opens the report and waits until the user closes it; resolves with the annotations ('' when none).
async function showReport($: EngineInterface, text: string): Promise<string> {
  const reportPath = newReportPath()

  await update($, report, () => text)
  await $.fs.write(reportPath, text)

  return watchPlannotator($, reportPath)
}

// "/polish report": the last report outside the chain; its annotations go straight to the model.
async function reopenReport($: EngineInterface, text: string): Promise<void> {
  const feedback = await showReport($, text)

  if (feedback !== '') {
    await waitForIdleTurn($)
    void $.prompt.submit({ text: `${FEEDBACK_PREFIX}\n\n${feedback}` })
  }
}

// The annotations of a chain report go to the main assistant as a fix phase; nothing happens when the chain moved on meanwhile.
async function applyFeedback($: EngineInterface, from: Step, to: Step, feedback: string): Promise<void> {
  await waitForIdleTurn($)

  if (await claim($, from, to)) {
    await startFixes($, to)
    void $.prompt.submit({ text: `${FEEDBACK_PREFIX}\n\n${feedback}` })
  }
}

// The simplify report: no annotations -> straight to the review, otherwise the fixes first.
async function presentSimplifyReport($: EngineInterface): Promise<void> {
  const fixedText = await read($, fixed)
  const skippedText = await read($, skipped)

  // Nothing to simplify: there is nothing to report, so the review starts right away.
  if (isNoneList(fixedText) && isNoneList(skippedText)) {
    if (await claim($, 'simplify-report', 'review')) {
      await runReview($)
    }

    return
  }

  const feedback = await showReport($, buildSimplifyReport(fixedText, skippedText))

  if ((await read($, step)) !== 'simplify-report') {
    return
  }

  if (feedback === '') {
    if (await claim($, 'simplify-report', 'review')) {
      await runReview($)
    }
  } else {
    await applyFeedback($, 'simplify-report', 'simplify-fix', feedback)
  }
}

// The review report is the last one: annotations are fixed and the chain ends, none ends it at once.
async function presentReviewReport($: EngineInterface): Promise<void> {
  const feedback = await showReport($, buildReviewReport(await read($, reviewAnswer), await read($, fixAnswer)))

  if ((await read($, step)) !== 'review-report') {
    return
  }

  if (feedback === '') {
    await reset($)
  } else {
    await applyFeedback($, 'review-report', 'review-fix', feedback)
  }
}

async function run($: EngineInterface, command: string, args: string): Promise<void> {
  try {
    await $.command.run({ command, args })
  } catch (error) {
    await fail($, `Polish: не удалось запустить /${command}: ${String(error)}`)
  }
}

// Sets the chain up (state only); the caller starts the first step itself.
async function prepare($: EngineInterface): Promise<boolean> {
  if ((await read($, step)) !== 'idle') {
    return false
  }

  const ids = (await $.agent.list()).map(agent => agent.id).join(',')
  const turns = await read($, turnCount)

  await update($, baseline, () => ids)
  await update($, turnsAtStart, () => turns)
  await update($, simplifyAnswer, () => '')
  await update($, fixed, () => '')
  await update($, skipped, () => '')
  await update($, reviewAnswer, () => '')
  await update($, fixAnswer, () => '')
  await update($, fixGraceOver, () => false)
  await update($, step, () => 'simplify')

  return true
}

async function start($: EngineInterface): Promise<boolean> {
  const isPrepared = await prepare($)

  if (isPrepared) {
    void run($, 'simplify', '')
  }

  return isPrepared
}

// Splits the last /simplify answer into the "fixed" and "skipped" lists the mod asked it to write.
async function storeSimplifyResult($: EngineInterface): Promise<void> {
  const answer = await read($, simplifyAnswer)
  const tail = answer.trim().slice(-RAW_TAIL_LENGTH)

  await update($, fixed, () => extractSection(answer, SECTION_FIXED) ?? `${NOT_EXTRACTED}. Ответ simplify:\n\n${tail}`)
  await update($, skipped, () => extractSection(answer, SECTION_SKIPPED) ?? NOT_EXTRACTED)
}

// Both steps run as skills in the main loop and may end their turn right after launching background
// agents (/simplify does, the reviewer subagent may), then finish in a later turn. So a step is done only
// once a main turn started after the step began, no main turn is running or about to start, and none of
// the agents spawned since the chain began is still working.
// Called after every main turn and every agent turn; the settle pause lets a queued hand-back start
// the next main turn first, and that turn's own completion calls back in here.
async function advance($: EngineInterface, current: 'simplify' | 'review'): Promise<void> {
  const turnsBefore = await read($, turnCount)

  await $.clock.sleep(SETTLE_MS)

  const isStale = (await read($, step)) !== current || (await read($, turnCount)) !== turnsBefore
  const isStarted = turnsBefore > (await read($, turnsAtStart))

  if (isStale || !isStarted || (await read($, runningTurnId)) !== '') {
    return
  }

  if (await hasActiveAgents($)) {
    return
  }

  if (current === 'simplify') {
    if (await claim($, 'simplify', 'simplify-report')) {
      await storeSimplifyResult($)
      await presentSimplifyReport($)
    }
  } else if (await claim($, 'review', 'fix')) {
    await startFixes($, 'fix')
    void $.prompt.submit({ text: APPLY_FINDINGS_PROMPT })
  }
}

// The main assistant applies fixes in its own turns (the review findings, or the annotations of a report).
// The next step waits for them: it starts once a turn started after the fixes began, no turn is running
// and no agent is still working. Nothing to fix may start no turn at all, hence the grace timer.
async function startFixes($: EngineInterface, phase: Step): Promise<void> {
  const turns = await read($, turnCount)

  await update($, turnsAtFix, () => turns)
  await update($, fixAnswer, () => '')
  await update($, fixGraceOver, () => false)

  $.clock.after(FIX_START_GRACE_MS, () => {
    void expireFixGrace($, phase)
  })
}

async function expireFixGrace($: EngineInterface, phase: Step): Promise<void> {
  if ((await read($, step)) !== phase) {
    return
  }

  await update($, fixGraceOver, () => true)
  await advanceFix($)
}

// Called after every main turn and every agent turn while the fixes run; the settle pause lets a queued
// turn start first, and that turn's own completion calls back in here.
async function advanceFix($: EngineInterface): Promise<void> {
  const turnsBefore = await read($, turnCount)
  const phase = await read($, step)

  await $.clock.sleep(SETTLE_MS)

  const next = FIX_NEXT[phase]
  const isStale = next === undefined || (await read($, step)) !== phase || (await read($, turnCount)) !== turnsBefore
  const isStarted = turnsBefore > (await read($, turnsAtFix)) || (await read($, fixGraceOver))

  if (isStale || !isStarted || (await read($, runningTurnId)) !== '' || (await hasActiveAgents($))) {
    return
  }

  if (!(await claim($, phase, next))) {
    return
  }

  if (next === 'review') {
    await runReview($)
  } else if (next === 'review-report') {
    await presentReviewReport($)
  } else {
    await update($, fixGraceOver, () => false)
  }
}

// The review is a skill run in the main loop: its turns count from here, and advance() ends it.
async function runReview($: EngineInterface): Promise<void> {
  const turns = await read($, turnCount)

  await update($, turnsAtStart, () => turns)
  await run($, REVIEW_COMMAND, '')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'polish',
      description: 'simplify → отчёт → superpowers:requesting-code-review → отчёт, каждый в Plannotator; «/polish report» — последний отчёт',
    })

    return next(e)
  })

  on('command.run', { command: 'polish' }, async ($, e) => {
    if (e.args.trim() === 'report') {
      const text = await read($, report)

      if (text === '') {
        return { text: 'Отчёта Polish пока нет.' }
      }

      void reopenReport($, text)

      return { text: 'Отчёт Polish открыт в Plannotator.' }
    }

    const isStarted = await prepare($)

    // A command run may not start another command from inside its own hook: the first step goes out
    // from a timer, a separate dispatch.
    if (isStarted) {
      $.clock.after(0, () => {
        void run($, 'simplify', '')
      })
    }

    return {
      text: isStarted
        ? 'Запущено: /simplify → отчёт → /superpowers:requesting-code-review → отчёт'
        : 'Цепочка уже выполняется',
    }
  })

  // While the chain runs, /simplify is asked to end with machine-readable fixed/skipped lists.
  on('skill.prompt', { skill: 'simplify' }, async ($, e, next) => {
    const result = await next(e)

    if ((await read($, step)) !== 'simplify') {
      return result
    }

    return { text: `${result.text}\n\n${SIMPLIFY_INSTRUCTION}` }
  })

  // While the chain runs, the review is scoped to the working tree and asked to list what it left out.
  on('skill.prompt', { skill: REVIEW_COMMAND }, async ($, e, next) => {
    const result = await next(e)

    if ((await read($, step)) !== 'review') {
      return result
    }

    return { text: [result.text, REVIEW_SCOPE_INSTRUCTION, NOT_REPORTED_INSTRUCTION].join('\n\n') }
  })

  on('turn.start', async ($, e, next) => {
    await update($, turnCount, count => count + 1)
    await update($, runningTurnId, () => e.turnId)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const current = await read($, step)

    if (e.agentId !== undefined) {
      if (current === 'simplify' || current === 'review') {
        void advance($, current)
      } else if (FIX_NEXT[current] !== undefined) {
        void advanceFix($)
      }

      return next(e)
    }

    await update($, runningTurnId, () => '')

    if (FIX_NEXT[current] !== undefined) {
      await update($, fixAnswer, previous => (e.answer.trim() === '' ? previous : e.answer))
      void advanceFix($)
    }

    if (current === 'simplify' || current === 'review') {
      if (current === 'simplify') {
        await update($, simplifyAnswer, previous => (e.answer.trim() === '' ? previous : e.answer))
      } else {
        await update($, reviewAnswer, previous => (e.answer.trim() === '' ? previous : e.answer))
      }

      if (e.reason !== 'answer') {
        await reset($)
      } else {
        void advance($, current)
      }
    }

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // Only a running skill step is cancelled by the user's message; while a report is open or fixes run it only adds a turn.
    const current = await read($, step)

    if ((current === 'simplify' || current === 'review') && USER_ORIGINS.includes(e.origin.kind)) {
      await reset($)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const current = await read($, step)
    const { Box, Button, Text } = $.ui.resolve(e)

    if (current === 'idle') {
      return (
        <Box>
          <Button key="polish" label="Polish" hotkey="p" onPress={() => start($)} />
        </Box>
      )
    }

    return (
      <Box>
        <Text dimColor>Polish: {STEP_LABELS[current]}… </Text>
        <Button key="cancel" label="Cancel" hotkey="c" onPress={() => cancelAll($)} />
      </Box>
    )
  })
}
