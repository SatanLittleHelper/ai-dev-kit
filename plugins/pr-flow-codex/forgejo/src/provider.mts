import { createClient, PAGE_LIMIT } from './client.mts'
import {
  EVENTS, REVIEW_STATES, login, parseThreadKey, toCiStatus, toGeneralComment, toPull, toReview, toThreads,
} from './mappers.mts'
import type { RawCombinedStatus, RawIssueComment, RawPull, RawReview, RawReviewComment } from './mappers.mts'
import { PublishUnknownError } from './types.mts'
import type { ForgeProvider, ProviderDeps, Review } from './types.mts'

const RECONCILE_ATTEMPTS = 3
const RECONCILE_PAUSE_MS = 5000

// Сервер явно отклонил запрос (4xx кроме 408): ничего не применено, ошибку можно показать как есть.
function rejectedByServer(error: unknown): boolean {
  const { status } = error as { status?: number }
  return status !== undefined && status < 500 && status !== 408
}

export function createForgejo(deps: ProviderDeps): ForgeProvider {
  const { repoPath, call, paged } = createClient(deps)
  const me: { value?: Promise<string> } = {}

  const rawReviews = (number: number) => paged<RawReview>(`${repoPath}/pulls/${number}/reviews`)

  const currentUser = (): Promise<string> => (me.value ??= call('GET', '/user').then(user => (user as { login: string }).login).catch(error => {
    me.value = undefined
    throw error
  }))

  const reconcile = async (number: number, before: Set<number>, author: string, body: string): Promise<string | undefined> => {
    for (let attempt = 0; attempt < RECONCILE_ATTEMPTS; attempt++) {
      if (attempt > 0) await deps.sleep(RECONCILE_PAUSE_MS)
      const reviews = await rawReviews(number).catch(() => undefined)
      const found = reviews?.filter(review => !before.has(review.id) && login(review.user).toLowerCase() === author && (review.body ?? '') === body).at(-1)
      if (found) return found.html_url ?? ''
    }
    return undefined
  }

  return {
    currentUser,
    listPulls: async state => ((await call('GET', `${repoPath}/pulls?state=${state}&page=1&limit=${PAGE_LIMIT}`)) as RawPull[]).map(toPull),
    findOpenPull: async head => {
      const name = `${deps.repo.owner}/${deps.repo.repo}`.toLowerCase()
      const pulls = await paged<RawPull>(`${repoPath}/pulls?state=open`)
      const candidates = pulls.filter(pull => pull.head?.ref === head)
      const found = candidates.find(pull => pull.head.repo?.full_name?.toLowerCase() === name)
      if (found) return toPull(found)
      if (candidates.some(pull => !pull.head.repo?.full_name)) {
        throw new Error('не удалось определить репозиторий head для открытого PR')
      }
      return null
    },
    createPull: async draft => {
      try {
        const posted = (await call('POST', `${repoPath}/pulls`, draft)) as Partial<RawPull> | null
        if (typeof posted?.number !== 'number' || !Number.isInteger(posted.number) || posted.number < 1 ||
            typeof posted.html_url !== 'string' || !posted.html_url.trim()) {
          throw new Error('сервер не вернул номер и URL PR')
        }
        return { number: posted.number, url: posted.html_url }
      } catch (error) {
        if (rejectedByServer(error)) throw error
        const reason = error instanceof SyntaxError ? 'сервер вернул невалидный JSON' : (error as Error).message
        throw new PublishUnknownError(`${reason}; статус создания PR неизвестен — проверьте ветку через pr find перед повтором`)
      }
    },
    getPull: async number => toPull((await call('GET', `${repoPath}/pulls/${number}`)) as RawPull),
    listPullFiles: async number => (await paged<{ filename: string }>(`${repoPath}/pulls/${number}/files`)).map(file => file.filename),
    getCiStatus: async sha => toCiStatus((await call('GET', `${repoPath}/commits/${sha}/status`)) as RawCombinedStatus),
    listReviews: async number => (await rawReviews(number)).map(toReview).filter((review): review is Review => review !== null),
    listThreads: async number => {
      const reviews = (await rawReviews(number)).filter(review => REVIEW_STATES[review.state])
      const comments = (await Promise.all(reviews.map(review => call('GET', `${repoPath}/pulls/${number}/reviews/${review.id}/comments`)))).flat() as RawReviewComment[]
      const general = await paged<RawIssueComment>(`${repoPath}/issues/${number}/comments`)
      return { threads: toThreads(comments), general: general.map(toGeneralComment) }
    },
    publishReview: async (number, draft) => {
      const body = { body: draft.body, event: EVENTS[draft.verdict], comments: draft.comments.map(c => ({ path: c.path, new_position: c.line, body: c.body })) }
      const before = new Set((await rawReviews(number)).map(review => review.id))
      const author = (await currentUser()).toLowerCase()
      try {
        const posted = (await call('POST', `${repoPath}/pulls/${number}/reviews`, body)) as { html_url?: string }
        return { url: posted.html_url ?? '' }
      } catch (error) {
        if ((error as { status?: number }).status !== undefined) throw error
        const url = await reconcile(number, before, author, draft.body)
        if (url !== undefined) return { url }
        throw new PublishUnknownError(`${(error as Error).message}; статус публикации неизвестен — проверьте PR ${number} перед повтором`)
      }
    },
    publishReplies: async (number, replies) => {
      const targets = replies.map(reply => {
        if (reply.threadId === undefined) return { reply, thread: null }
        const thread = parseThreadKey(reply.threadId)
        if (!thread) throw new Error(`неизвестный тред ${reply.threadId}`)
        return { reply, thread }
      })
      for (const [index, { reply, thread }] of targets.entries()) {
        try {
          if (thread) await call('POST', `${repoPath}/pulls/${number}/reviews/${thread.reviewId}/comments`, { path: thread.path, new_position: thread.line, body: reply.body })
          else await call('POST', `${repoPath}/issues/${number}/comments`, { body: reply.quote ? `> ${reply.quote}\n\n${reply.body}` : reply.body })
        } catch (error) {
          const message = `${(error as Error).message}; уже отправлено ${index} из ${replies.length}`
          if ((error as { status?: number }).status === undefined) {
            throw new PublishUnknownError(`${message}; статус публикации неизвестен — проверьте PR ${number} перед повтором: текущий ответ мог быть отправлен`)
          }
          throw new Error(message)
        }
      }
    },
    mergePull: async (number, method, headSha) => {
      try {
        await call('POST', `${repoPath}/pulls/${number}/merge`, { Do: method, head_commit_id: headSha })
      } catch (error) {
        if (rejectedByServer(error)) throw error
        throw new PublishUnknownError(`${(error as Error).message}; статус слияния неизвестен — проверьте PR ${number} через pr get перед повтором`)
      }
    },
    pullRef: number => `refs/pull/${number}/head`,
  }
}
