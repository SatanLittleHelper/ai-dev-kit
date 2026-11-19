import type { CiStatus, Comment, ForgeProvider, PullRequest, Review, Thread } from './types.mts'

export const PULL_LIMIT = 50
const PULL_CONCURRENCY = 4

export type Scenario = 'closed' | 'conflict' | 'ci-failed' | 'feedback' | 'none-own' | 'review' | 'recheck' | 'wait-author'
export type Status = 'влит' | 'закрыт' | 'конфликт' | 'упал CI' | 'есть замечания' | 'на проверке' | 'перепроверка' | 'готов к слиянию' | 'ждём автора' | 'ждём ревью'

export const ACTIONABLE: readonly Scenario[] = ['feedback', 'conflict', 'ci-failed', 'review', 'recheck']

export interface PrData {
  pull: PullRequest
  me: string
  reviews: Review[]
  threads: Thread[]
  general: Comment[]
  ci: CiStatus
}

export interface IntakeItem {
  id: string
  kind: 'thread' | 'issue' | 'review'
  reviewId: string | null
  threadId: string | null
  path: string | null
  position: number | null
  commitId: string
  author: string
  quote: string
  stale: boolean
  disagree: boolean
  at: string
}

export interface ListRow {
  number: number
  title: string
  author: string
  isOwn: boolean
  headRef: string
  scenario: Scenario
  status: Status
  conflicted: boolean
  ci: CiStatus['state']
  failedChecks: string[]
  url: string
  activity: string
  baseRef: string
  approvals: number
  stackParent: number | null
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

// Короткий возраст последней активности: «5 мин», «3 ч», «2 дн»; без даты — пустая строка.
export function activityOf(updatedAt: string, now: number): string {
  const at = Date.parse(updatedAt)
  if (Number.isNaN(at)) return ''
  const age = Math.max(0, now - at)
  if (age < HOUR_MS) return `${Math.floor(age / MINUTE_MS)} мин`
  if (age < DAY_MS) return `${Math.floor(age / HOUR_MS)} ч`
  return `${Math.floor(age / DAY_MS)} дн`
}

// Сводка ревью-бота с вердиктом «Готово к мержу: 🟢 Да» — не замечание, даже если пришла позже моей активности.
const CLEAN_SUMMARY = /готово к мерж[а-яё]*[:*\s]*🟢\s*да/i

function same(a: string, b: string): boolean {
  return a !== '' && a.toLowerCase() === b.toLowerCase()
}

function lastOf(thread: Thread): Comment {
  return thread.comments[thread.comments.length - 1]
}

export function live(data: PrData): { reviews: Review[]; threads: Thread[] } {
  const drafts = new Set(data.reviews.filter(review => review.state === 'pending').map(review => review.id))
  return {
    reviews: data.reviews.filter(review => !drafts.has(review.id)),
    threads: data.threads.filter(thread => thread.comments.length > 0 && !drafts.has(thread.comments[0].reviewId ?? '')),
  }
}

export async function loadPr(provider: ForgeProvider, number: number, pull?: PullRequest): Promise<PrData> {
  const [loaded, me, reviews, discussion] = await Promise.all([pull ?? provider.getPull(number), provider.currentUser(), provider.listReviews(number), provider.listThreads(number)])
  const ci = loaded.state === 'open' ? await provider.getCiStatus(loaded.headSha) : { state: 'none' as const, failed: [] }
  return { pull: loaded, me, reviews, threads: discussion.threads, general: discussion.general, ci }
}

export function intakeItems(data: PrData): IntakeItem[] {
  const { reviews, threads } = live(data)
  const { me } = data
  const myTimes = [
    ...[...threads.flatMap(thread => thread.comments), ...data.general].filter(comment => same(comment.author, me)).map(comment => Date.parse(comment.createdAt)),
    ...reviews.filter(review => same(review.author, me)).map(review => Date.parse(review.submittedAt)),
  ]
  const myLast = Math.max(-Infinity, ...myTimes)
  const later = (iso: string) => Date.parse(iso) > myLast

  const threadItems: IntakeItem[] = threads.filter(thread => !thread.resolved && !same(lastOf(thread).author, me)).map(thread => {
    const first = thread.comments[0]
    const commit = first.commitSha ?? ''
    return {
      id: `${first.reviewId ?? thread.id}/${first.id}`, kind: 'thread', reviewId: first.reviewId ?? null, threadId: thread.id, path: first.path ?? null,
      position: first.line ?? null, commitId: commit, author: lastOf(thread).author,
      quote: thread.comments.map(comment => `${comment.author}: ${comment.body}`).join('\n'), stale: commit !== data.pull.headSha,
      disagree: thread.comments.slice(0, -1).some(comment => same(comment.author, me)), at: lastOf(thread).createdAt,
    }
  })
  const issueItems: IntakeItem[] = data.general.filter(comment => !same(comment.author, me) && later(comment.createdAt) && !CLEAN_SUMMARY.test(comment.body)).map(comment => ({
    id: `issue/${comment.id}`, kind: 'issue', reviewId: null, threadId: null, path: null, position: null, commitId: '',
    author: comment.author, quote: comment.body, stale: false, disagree: false, at: comment.createdAt,
  }))
  const reviewItems: IntakeItem[] = reviews
    .filter(review => (review.state === 'changes' || review.state === 'comment') && review.body.trim() && !same(review.author, me) && later(review.submittedAt))
    .map(review => ({
      id: `review/${review.id}`, kind: 'review', reviewId: review.id, threadId: null, path: null, position: null, commitId: review.commitSha,
      author: review.author, quote: review.body, stale: false, disagree: false, at: review.submittedAt,
    }))
  return [...threadItems, ...issueItems, ...reviewItems]
}

function latestMine(reviews: Review[], me: string): Review | undefined {
  return reviews.filter(review => same(review.author, me)).sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt)).at(-1)
}

export function scenarioOf(data: PrData): Scenario {
  if (data.pull.state === 'closed') return 'closed'
  if (same(data.pull.author, data.me)) {
    if (intakeItems(data).length > 0) return 'feedback'
    if (data.pull.conflicted) return 'conflict'
    return data.ci.state === 'failure' ? 'ci-failed' : 'none-own'
  }

  const { reviews, threads } = live(data)
  const last = latestMine(reviews, data.me)
  if (!last) return 'review'
  if (last.state === 'approved' && !last.dismissed) return 'wait-author'
  if (last.commitSha !== data.pull.headSha) return 'recheck'
  const answered = threads.some(thread => thread.comments.some(comment => same(comment.author, data.me)) && same(lastOf(thread).author, data.pull.author))
  return answered ? 'recheck' : 'wait-author'
}

function activeReviews(data: PrData): Review[] {
  const latest = new Map<string, Review>()
  for (const review of [...live(data).reviews].sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt))) latest.set(review.author.toLowerCase(), review)
  return [...latest.values()].filter(review => !review.dismissed)
}

function approvalsOf(data: PrData): number {
  return activeReviews(data).filter(review => review.state === 'approved' && !same(review.author, data.pull.author)).length
}

// Родитель в стеке — открытый PR из ветки этого же репозитория, чья head-ветка равна base этого PR. PR из форков родителями не считаются.
export function stackParentOf(pull: PullRequest, pulls: readonly PullRequest[]): number | null {
  return pull.state !== 'open' ? null : pulls.find(other => other.number !== pull.number && other.state === 'open' && !other.fromFork && other.headRef === pull.baseRef)?.number ?? null
}

function readyToMerge(data: PrData): boolean {
  const active = activeReviews(data)
  return !data.pull.conflicted && data.ci.state !== 'failure' && active.some(review => review.state === 'approved' && !same(review.author, data.pull.author)) && !active.some(review => review.state === 'changes') && live(data).threads.every(thread => thread.resolved)
}

const READY: Status = 'готов к слиянию'

function depthOf(row: ListRow, byNumber: ReadonlyMap<number, ListRow>): number {
  const seen = new Set<number>([row.number])
  let depth = 0
  for (let parent = row.stackParent; parent !== null && !seen.has(parent); parent = byNumber.get(parent)?.stackParent ?? null) {
    seen.add(parent)
    depth++
  }
  return depth
}

export function statusOf(data: PrData, scenario: Scenario): Status {
  if (scenario === 'closed') return data.pull.merged ? 'влит' : 'закрыт'
  if (scenario === 'feedback') return 'есть замечания'
  if (scenario === 'conflict') return 'конфликт'
  if (scenario === 'ci-failed') return 'упал CI'
  if (scenario === 'review') return 'на проверке'
  if (scenario === 'recheck') return 'перепроверка'
  if (readyToMerge(data)) return READY
  return scenario === 'wait-author' ? 'ждём автора' : 'ждём ревью'
}

export async function pullRows(provider: ForgeProvider, now: number = Date.now()): Promise<{ rows: ListRow[]; truncated: boolean }> {
  const pulls = await provider.listPulls('open')
  const rows: ListRow[] = []
  for (let at = 0; at < pulls.length; at += PULL_CONCURRENCY) {
    const batch = await Promise.all(pulls.slice(at, at + PULL_CONCURRENCY).map(async pull => {
      const data = await loadPr(provider, pull.number, pull)
      const scenario = scenarioOf(data)
      const status = statusOf(data, scenario)
      const stackParent = stackParentOf(pull, pulls)
      return {
        number: pull.number, title: pull.title, author: pull.author, isOwn: same(pull.author, data.me), headRef: pull.headRef, scenario, status,
        conflicted: pull.conflicted, ci: data.ci.state, failedChecks: data.ci.failed, url: pull.url, activity: activityOf(pull.updatedAt, now),
        baseRef: pull.baseRef, approvals: approvalsOf(data), stackParent,
      }
    }))
    rows.push(...batch)
  }
  return { rows: stackOrder(rows), truncated: pulls.length >= PULL_LIMIT }
}

// Стек идёт цепочкой от корня к потомкам, а не россыпью: PR, который можно влить только после родителя, не поднимается выше него.
// Цепочки между собой: сначала с требующими действия, затем с готовыми к слиянию, затем свои, затем по номеру корня.
function stackOrder(rows: readonly ListRow[]): ListRow[] {
  const byNumber = new Map(rows.map(row => [row.number, row]))
  const depth = new Map(rows.map(row => [row.number, depthOf(row, byNumber)]))
  const rootOf = (row: ListRow): ListRow => {
    const seen = new Set<number>([row.number])
    let current = row
    while (current.stackParent !== null) {
      const parent = byNumber.get(current.stackParent)
      if (!parent || seen.has(parent.number)) break
      seen.add(parent.number)
      current = parent
    }
    return current
  }
  const chains = new Map<number, ListRow[]>()
  for (const row of rows) {
    const root = rootOf(row).number
    chains.set(root, [...(chains.get(root) ?? []), row])
  }
  const key = (members: readonly ListRow[]) => ({
    due: members.some(isDue) ? 0 : 1,
    ready: members.some(row => row.status === READY) ? 0 : 1,
    own: members.some(row => row.isOwn) ? 0 : 1,
  })
  return [...chains.entries()]
    .map(([root, members]) => ({ root, members: [...members].sort((a, b) => (depth.get(a.number) ?? 0) - (depth.get(b.number) ?? 0) || a.number - b.number), key: key(members) }))
    .sort((a, b) => a.key.due - b.key.due || a.key.ready - b.key.ready || (a.key.ready === 0 ? 0 : a.key.own - b.key.own) || a.root - b.root)
    .flatMap(chain => chain.members)
  return { rows: sorted, truncated: pulls.length >= PULL_LIMIT }
}

// «Требует действия»: сценарий из ACTIONABLE, а также свой PR, который уже можно влить (готов и не стоит на открытом родителе): слить его — действие пользователя.
export function isDue(row: ListRow): boolean {
  return ACTIONABLE.includes(row.scenario) || (row.isOwn && row.status === READY && row.stackParent === null)
}

export function groupRows(rows: readonly ListRow[]): { due: ListRow[]; waiting: ListRow[] } {
  return { due: rows.filter(isDue), waiting: rows.filter(row => !isDue(row)) }
}

export type Action = 'merge' | 'merge-blocked' | 'open-review' | 'triage' | 'overview'

export interface Route {
  number: number
  url: string
  isOwn: boolean
  scenario: Scenario
  status: Status
  ci: CiStatus['state']
  baseRef: string
  headSha: string
  stackParent: number | null
  action: Action
}

export function actionOf(scenario: Scenario, status: Status, isOwn: boolean, stackParent: number | null): Action {
  if (status === READY) return stackParent === null ? 'merge' : 'merge-blocked'
  if (isOwn) return scenario === 'feedback' || scenario === 'conflict' || scenario === 'ci-failed' ? 'triage' : 'overview'
  return scenario === 'review' || scenario === 'recheck' ? 'open-review' : 'overview'
}

export async function routeOf(provider: ForgeProvider, number: number): Promise<Route> {
  const [data, pulls] = await Promise.all([loadPr(provider, number), provider.listPulls('open')])
  const scenario = scenarioOf(data)
  const status = statusOf(data, scenario)
  const isOwn = same(data.pull.author, data.me)
  const stackParent = stackParentOf(data.pull, pulls)
  return { number, url: data.pull.url, isOwn, scenario, status, ci: data.ci.state, baseRef: data.pull.baseRef, headSha: data.pull.headSha, stackParent, action: actionOf(scenario, status, isOwn, stackParent) }
}
