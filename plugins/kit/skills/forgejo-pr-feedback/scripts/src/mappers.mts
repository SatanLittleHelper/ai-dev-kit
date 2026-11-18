import type { CiStatus, Comment, PullRequest, Review, Thread, Verdict } from './types.mts'

export const REVIEW_STATES: Record<string, Review['state']> = { APPROVED: 'approved', REQUEST_CHANGES: 'changes', COMMENT: 'comment', PENDING: 'pending' }
export const EVENTS: Record<Verdict, string> = { approve: 'APPROVED', 'request-changes': 'REQUEST_CHANGES', comment: 'COMMENT' }

type RawUser = { login: string } | null
export interface RawPull { number: number; title: string; body?: string; user: RawUser; head: { ref: string; sha: string; repo?: { full_name?: string } | null }; base: { ref: string }; state: string; merged?: boolean; mergeable?: boolean; html_url: string; updated_at?: string }
export interface RawReview { id: number; user: RawUser; state: string; body?: string; commit_id: string; submitted_at: string | null; dismissed?: boolean; html_url?: string }
export interface RawReviewComment { id: number; user: RawUser; body: string; created_at: string; path: string; position: number; commit_id: string; pull_request_review_id: number; resolver?: RawUser }
export interface RawIssueComment { id: number; user: RawUser; body: string; created_at: string }

export function login(user: RawUser): string {
  return user?.login ?? ''
}

export function toPull(raw: RawPull): PullRequest {
  const state = raw.state === 'closed' ? 'closed' : 'open'
  const merged = Boolean(raw.merged)
  return {
    number: raw.number, title: raw.title, body: raw.body ?? '', author: login(raw.user), headRef: raw.head.ref, headSha: raw.head.sha,
    baseRef: raw.base.ref, state, merged, url: raw.html_url, conflicted: state === 'open' && !merged && raw.mergeable === false, updatedAt: raw.updated_at ?? '',
  }
}

export function toReview(raw: RawReview): Review | null {
  const state = REVIEW_STATES[raw.state]
  return state ? { id: String(raw.id), author: login(raw.user), state, body: raw.body ?? '', commitSha: raw.commit_id, submittedAt: raw.submitted_at ?? '', dismissed: Boolean(raw.dismissed) } : null
}

function toCodeComment(raw: RawReviewComment): Comment {
  return { id: String(raw.id), author: login(raw.user), body: raw.body, createdAt: raw.created_at, path: raw.path, line: raw.position, commitSha: raw.commit_id, reviewId: String(raw.pull_request_review_id) }
}

export function toGeneralComment(raw: RawIssueComment): Comment {
  return { id: String(raw.id), author: login(raw.user), body: raw.body, createdAt: raw.created_at }
}

function threadKey(raw: RawReviewComment): string {
  return `${raw.pull_request_review_id}:${raw.path}:${raw.position}`
}

export function parseThreadKey(key: string): { reviewId: string; path: string; line: number } | null {
  const match = /^(\d+):(.+):(\d+)$/.exec(key)
  return match ? { reviewId: match[1], path: match[2], line: Number(match[3]) } : null
}

export function toThreads(comments: RawReviewComment[]): Thread[] {
  const groups = comments.reduce((map, raw) => map.set(threadKey(raw), [...(map.get(threadKey(raw)) ?? []), raw]), new Map<string, RawReviewComment[]>())
  return [...groups.values()].map(group => {
    const sorted = [...group].sort((a, b) => a.created_at.localeCompare(b.created_at))
    return { id: threadKey(sorted[0]), path: sorted[0].path, line: sorted[0].position, commitSha: sorted[0].commit_id, comments: sorted.map(toCodeComment), resolved: sorted.some(raw => Boolean(raw.resolver)) }
  })
}

export interface RawCombinedStatus { state: string; total_count?: number; statuses?: Array<{ status: string; context: string }> }

const CI_FAILED = ['failure', 'error']

export function toCiStatus(raw: RawCombinedStatus): CiStatus {
  const failed = (raw.statuses ?? []).filter(item => CI_FAILED.includes(item.status)).map(item => item.context)
  if (failed.length > 0 || CI_FAILED.includes(raw.state)) return { state: 'failure', failed }
  if (!raw.total_count && !raw.statuses?.length) return { state: 'none', failed: [] }
  return { state: raw.state === 'success' ? 'success' : 'pending', failed: [] }
}
