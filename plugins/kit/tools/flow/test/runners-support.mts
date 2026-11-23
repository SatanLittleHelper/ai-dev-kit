import { writeFileSync } from 'node:fs'
import type { ReviewOptions, ReviewOutcome, Runners, StartOptions } from '../src/runners.mts'

export interface StubOptions {
  startError?: Error
  result?: object | string
  review?: ReviewOutcome[] | Error
}

export function stubRunners(options: StubOptions = {}): { runners: Runners; calls: { plannotator: StartOptions[]; review: ReviewOptions[]; codeReview: { resultFile: string; cwd: string }[] } } {
  const calls = { plannotator: [] as StartOptions[], review: [] as ReviewOptions[], codeReview: [] as { resultFile: string; cwd: string }[] }
  const queue = Array.isArray(options.review) ? [...options.review] : []
  const runners: Runners = {
    plannotator: {
      startReview(review) {
        calls.codeReview.push(review)
        if (options.startError) throw options.startError
        if (options.result !== undefined) writeFileSync(review.resultFile, typeof options.result === 'string' ? options.result : JSON.stringify(options.result))
      },
      start(start) {
        calls.plannotator.push(start)
        if (options.result !== undefined) writeFileSync(start.resultFile, typeof options.result === 'string' ? options.result : JSON.stringify(options.result))
      },
    },
    review: {
      run(review) {
        calls.review.push(review)
        if (options.review instanceof Error) throw options.review

        const next = queue.shift()
        if (!next) throw new Error('заглушка ревью: нет заготовленного ответа')
        return next
      },
      reset() {},
      finish() {},
    },
  }

  return { runners, calls }
}
