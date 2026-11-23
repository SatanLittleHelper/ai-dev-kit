import { spawn, spawnSync } from 'node:child_process'
import { renameSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { plannotatorCommand, plannotatorReviewCommand } from './plannotator.mts'

export interface StartOptions {
  draft: string
  resultFile: string
  cwd: string
}

export interface ReviewOptions {
  draft: string
  type: 'test-plan' | 'plan'
  max: number
  profile: string
  focus: string
  cwd: string
}

export interface ReviewOutcome {
  iter: number
  max: number
  verdict: string
  converged: boolean
  blocking: number
  reportPath: string
  atCap: boolean
}

export class ReviewUnavailable extends Error {}

export interface Runners {
  plannotator: { start(options: StartOptions): void; startReview(options: { resultFile: string; cwd: string }): void }
  review: { run(options: ReviewOptions): ReviewOutcome; reset(options: { draft: string; cwd: string }): void; finish(options: { draft: string; cwd: string; reason: 'converged' | 'cap-hit' }): void }
}

const DOC_REVIEW = fileURLToPath(new URL('../../../skills/doc-review/scripts/doc-review.mjs', import.meta.url))

const shellArg = (value: string): string => "'" + value.replaceAll("'", "'\\''") + "'"

export function recordIterationCommand(root: string, draft: string): string {
  return `(cd ${shellArg(root)} && node ${shellArg(DOC_REVIEW)} record-iteration ${shellArg(draft)} --note='опишите решения по замечаниям')`
}

function docReview(cwd: string, args: string[]): string {
  const run = spawnSync(process.execPath, [DOC_REVIEW, ...args], { cwd, encoding: 'utf8' })
  if (run.error || run.status !== 0) throw new ReviewUnavailable((run.error?.message ?? run.stderr.trim()) || `код выхода ${run.status}`)
  return run.stdout
}

const WATCHER = `
const { spawnSync } = require('node:child_process')
const { existsSync, renameSync, writeFileSync } = require('node:fs')
const [mode, resultFile, command, ...args] = process.argv.slice(1)
const run = spawnSync(command, args, { stdio: ['ignore', mode === 'stdout' ? 'pipe' : 'ignore', 'pipe'], encoding: 'utf8' })
if (mode === 'stdout' && run.status === 0 && run.stdout) {
  const temporary = resultFile + '.tmp'
  writeFileSync(temporary, run.stdout)
  renameSync(temporary, resultFile)
}
if (!existsSync(resultFile)) {
  const temporary = resultFile + '.tmp'
  const error = run.error?.message || run.stderr?.trim() || 'код ' + (run.signal || run.status)
  writeFileSync(temporary, JSON.stringify({ error: command + ' завершился без результата: ' + error }))
  renameSync(temporary, resultFile)
}
`

function publishLaunchError(resultFile: string, error: Error): void {
  const temporary = `${resultFile}.tmp`
  writeFileSync(temporary, JSON.stringify({ error: error.message }))
  renameSync(temporary, resultFile)
}

export const defaultRunners: Runners = {
  plannotator: {
    start({ draft, resultFile, cwd }) {
      const { command, args, env } = plannotatorCommand(draft, resultFile)
      // Отдельный процесс-наблюдатель переживает `flow submit`: он запускает plannotator и, если результата нет, записывает причину.
      const watcher = spawn(process.execPath, ['-e', WATCHER, 'file', resultFile, command, ...args], { cwd, env: { ...process.env, ...env }, detached: true, stdio: 'ignore' })
      watcher.on('error', error => publishLaunchError(resultFile, error))
      watcher.unref()
    },

    startReview({ resultFile, cwd }) {
      const { command, args, env } = plannotatorReviewCommand()
      const watcher = spawn(process.execPath, ['-e', WATCHER, 'stdout', resultFile, command, ...args], { cwd, env: { ...process.env, ...env }, detached: true, stdio: 'ignore' })
      watcher.on('error', error => publishLaunchError(resultFile, error))
      watcher.unref()
    },
  },
  review: {
    run({ draft, type, max, profile, focus, cwd }) {
      const raw = docReview(cwd, ['next', draft, `--type=${type}`, `--max=${max}`, `--profile=${profile}`, `--focus=${focus}`])
      try {
        const out = JSON.parse(raw)
        if (!Number.isInteger(out?.iter) || !Number.isInteger(out.max) || typeof out.verdict !== 'string' || typeof out.converged !== 'boolean' || !Number.isInteger(out.blocking_count) || typeof out.report_path !== 'string' || typeof out.at_cap !== 'boolean') {
          throw new Error('неполный ответ')
        }
        return { iter: out.iter, max: out.max, verdict: out.verdict, converged: out.converged, blocking: out.blocking_count, reportPath: out.report_path, atCap: out.at_cap }
      } catch {
        throw new ReviewUnavailable('doc-review вернул некорректный результат итерации.')
      }
    },
    reset({ draft, cwd }) {
      docReview(cwd, ['reset', draft])
    },
    finish({ draft, cwd, reason }) {
      docReview(cwd, ['finish', draft, `--reason=${reason}`])
    },
  },
}
