import { writeFileSync } from 'node:fs'
import type { ReviewOptions, ReviewOutcome, Runners, StartOptions } from '../src/runners.mts'

export interface StubOptions {
  result?: object | string
  review?: ReviewOutcome[] | Error
}

export function stubRunners(options: StubOptions = {}): { runners: Runners; calls: { plannotator: StartOptions[]; review: ReviewOptions[] } } {
  const calls = { plannotator: [] as StartOptions[], review: [] as ReviewOptions[] }
  const queue = Array.isArray(options.review) ? [...options.review] : []
  const runners: Runners = {
    plannotator: {
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
