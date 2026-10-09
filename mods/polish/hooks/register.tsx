import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Step } from '../types'

const step = atom({ plugin: 'polish', key: 'step' } as const, 'idle' as Step)
const reviewAgent = atom({ plugin: 'polish', key: 'reviewAgent' } as const, '')
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

const REPORT_PATH = '/tmp/polish-report.md'
// The user's own prompts: a background agent's hand-back or a task notification must not cancel the chain.
const USER_ORIGINS = ['composer', 'bridge']
const SECTION_FIXED = 'Polish: fixed'
const SECTION_SKIPPED = 'Polish: skipped'
const SECTION_ASSESSMENT = 'Polish: оценка пропусков simplify'
const SECTION_NOT_REPORTED = 'Polish: reviewed-not-reported'
const NOT_EXTRACTED = 'не удалось выделить'
const ACTIVE_AGENT_STATUSES = ['pending', 'running']
const SETTLE_MS = 1500
const REVIEW_LOOKUP_ATTEMPTS = 20
const REVIEW_LOOKUP_STEP_MS = 500
const MAX_SKIPPED_CHARS = 6000
const RAW_TAIL_LENGTH = 1500

const SIMPLIFY_INSTRUCTION = `## Polish report (added by the polish mod)
End your final message with exactly two sections, in this order:

## Polish: fixed
- <file:line> — <what was fixed>

## Polish: skipped
- <file:line> — <the finding> — <why it was skipped>

After every item of the skipped list add a fenced code block with the current code (at most 8 lines) and, when you know the change, a second fenced block labelled "Proposed:" with the code you would write. If nothing was skipped, write the single line "- none" under "## Polish: skipped". The user reads these as a report, so write the descriptions in Russian.`

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

function hasSkips(skippedText: string): boolean {
  const text = skippedText.trim()

  return text !== '' && text !== NOT_EXTRACTED && !/^[-*]?\s*(none|нет)\.?$/i.test(text)
}

function capChars(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n- … (список обрезан)`
}

function simplifySkipsInstruction(skippedText: string): string {
  return `## Context from /simplify (added by the polish mod)
The /simplify step intentionally left these findings unfixed:
${capChars(skippedText, MAX_SKIPPED_CHARS)}

Do not report them as new findings. For each one, judge whether leaving it is safe, should be fixed, or is a bug. Add a section "## ${SECTION_ASSESSMENT}" with one line per item: "- <file:line> — ok | fix | bug — <reason>"; for "fix" and "bug" add a fenced code block with the suggested change. Write in Russian.`
}

function buildReport(fixedText: string, skippedText: string, reviewText: string, note: string): string {
  const assessment = extractSection(reviewText, SECTION_ASSESSMENT)
  const notReported = extractSection(reviewText, SECTION_NOT_REPORTED)
  const review = removeSection(removeSection(reviewText, SECTION_ASSESSMENT), SECTION_NOT_REPORTED)

  return [
    '# Polish report',
    '## Simplify: исправлено',
    fixedText || '- нет данных',
    '## Simplify: пропущено',
    skippedText || '- нет данных',
    `## Code review${note ? ` (${note})` : ''}`,
    review || '- отчёт ревью не получен',
    '## Code review: оценка пропусков simplify',
    assessment ?? (hasSkips(skippedText) ? '- нет данных' : '- пропусков simplify не было'),
    '## Code review: рассмотрено, но не заявлено',
    notReported ?? '- нет данных',
  ].join('\n\n')
}

async function reset($: EngineInterface): Promise<void> {
  await update($, step, () => 'idle')
  await update($, reviewAgent, () => '')
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

// plannotator annotate stays alive until the review in the browser is submitted, so it is only watched.
async function watchPlannotator($: EngineInterface): Promise<void> {
  try {
    for await (const piece of $.process.spawn({ argv: ['plannotator', 'annotate', REPORT_PATH] })) {
      void piece
    }
  } catch (error) {
    $.ui.toast(`Polish: не удалось открыть Plannotator: ${String(error)}`)
  }
}

async function openReport($: EngineInterface, text: string): Promise<void> {
  await $.fs.write(REPORT_PATH, text)
  void watchPlannotator($)
}

// The chain is over: build the combined report from what the steps produced, open it in Plannotator.
async function finish($: EngineInterface, reviewText: string, note: string): Promise<void> {
  const text = buildReport(await read($, fixed), await read($, skipped), reviewText, note)

  await update($, report, () => text)
  await reset($)
  await openReport($, text)
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

// /simplify ends its own turn right after launching four review agents, then applies the fixes in a
// later turn. So the first step is done only once a main turn started after the chain began, no main
// turn is running or about to start, and none of the agents spawned since then is still working.
// Called after every main turn and every agent turn; the settle pause lets a queued hand-back start
// the next main turn first, and that turn's own completion calls back in here.
async function advance($: EngineInterface): Promise<void> {
  const turnsBefore = await read($, turnCount)

  await $.clock.sleep(SETTLE_MS)

  const isStale = (await read($, step)) !== 'simplify' || (await read($, turnCount)) !== turnsBefore
  const isStarted = turnsBefore > (await read($, turnsAtStart))

  if (isStale || !isStarted || (await read($, runningTurnId)) !== '') {
    return
  }

  const known = new Set((await read($, baseline)).split(','))
  const isBusy = (await $.agent.list()).some(
    agent => !known.has(agent.id) && ACTIVE_AGENT_STATUSES.includes(agent.status),
  )

  if (isBusy) {
    return
  }

  let isClaimed = false

  await update($, step, current => {
    isClaimed = current === 'simplify'

    return isClaimed ? 'review' : current
  })

  if (isClaimed) {
    await storeSimplifyResult($)
    await runReview($)
  }
}

// /code-review runs as a background agent: its own turn.complete (carrying that agent's id) ends
// the chain, so the new agent has to be found in the agent list after the command started.
async function runReview($: EngineInterface): Promise<void> {
  const before = new Set((await $.agent.list()).map(agent => agent.id))

  await run($, 'code-review', 'low')

  for (let attempt = 0; attempt < REVIEW_LOOKUP_ATTEMPTS; attempt += 1) {
    if ((await read($, step)) !== 'review') {
      return
    }

    const added = (await $.agent.list()).find(agent => !before.has(agent.id))

    if (added !== undefined) {
      if (['completed', 'failed', 'killed'].includes(added.status)) {
        await finish($, '', 'агент завершился до того, как мод его заметил')
      } else {
        await update($, reviewAgent, () => added.id)
      }

      return
    }

    await $.clock.sleep(REVIEW_LOOKUP_STEP_MS)
  }

  if ((await read($, step)) === 'review') {
    await finish($, '', 'агент ревью не найден')
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'polish',
      description: 'simplify, затем code-review low; «/polish report» — последний отчёт в Plannotator',
    })

    return next(e)
  })

  on('command.run', { command: 'polish' }, async ($, e) => {
    if (e.args.trim() === 'report') {
      const text = await read($, report)

      if (text === '') {
        return { text: 'Отчёта Polish пока нет.' }
      }

      await openReport($, text)

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
        ? 'Запущено: /simplify → /code-review low'
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

  // The review is told what /simplify left alone, so it can judge those spots instead of re-finding them.
  on('skill.prompt', { skill: 'code-review' }, async ($, e, next) => {
    const result = await next(e)

    if ((await read($, step)) !== 'review') {
      return result
    }

    const skippedText = await read($, skipped)
    const parts = [result.text, hasSkips(skippedText) ? simplifySkipsInstruction(skippedText) : '', NOT_REPORTED_INSTRUCTION]

    return { text: parts.filter(part => part !== '').join('\n\n') }
  })

  on('turn.start', async ($, e, next) => {
    await update($, turnCount, count => count + 1)
    await update($, runningTurnId, () => e.turnId)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const current = await read($, step)

    if (e.agentId !== undefined) {
      if (current === 'review' && e.agentId === (await read($, reviewAgent))) {
        await finish($, e.answer, e.reason === 'answer' ? '' : 'ревью прервано')
      } else if (current === 'simplify') {
        void advance($)
      }

      return next(e)
    }

    await update($, runningTurnId, () => '')

    if (current === 'simplify') {
      await update($, simplifyAnswer, previous => (e.answer.trim() === '' ? previous : e.answer))

      if (e.reason !== 'answer') {
        await reset($)
      } else {
        void advance($)
      }
    }

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if ((await read($, step)) !== 'idle' && USER_ORIGINS.includes(e.origin.kind)) {
      await reset($)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const current = await read($, step)
    const isReviewInBackground = (await read($, reviewAgent)) !== ''
    const { Box, Button, Text } = $.ui.resolve(e)

    if (current === 'idle') {
      return (
        <Box>
          <Button key="polish" label="Polish" hotkey="p" onPress={() => start($)} />
        </Box>
      )
    }

    const label = current === 'simplify' ? 'simplify' : isReviewInBackground ? 'review (в фоне)' : 'review'

    return (
      <Box>
        <Text dimColor>Polish: {label}… </Text>
        <Button key="cancel" label="Cancel" hotkey="c" onPress={() => cancelAll($)} />
      </Box>
    )
  })
}
