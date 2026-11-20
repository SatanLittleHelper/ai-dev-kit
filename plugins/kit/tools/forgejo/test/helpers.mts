import { readFileSync } from 'node:fs'
import { createForgejo } from '../src/provider.mts'
import type { Comment, HttpInit, HttpResponse, PullRequest, Review, Thread } from '../src/types.mts'
import type { PrData } from '../src/status.mts'

export const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
export const TOKEN = 'tok-123'
export const API = 'https://git.example.org/api/v1/repos/team/app'
export const USER_URL = 'https://git.example.org/api/v1/user'

export type Route = HttpResponse | Error

export function fakeHttp(routes: Record<string, Route | Route[]>) {
  const calls: Array<{ url: string; init?: HttpInit }> = []
  const http = async (url: string, init?: HttpInit): Promise<HttpResponse> => {
    calls.push({ url, init })
    const key = `${init?.method ?? 'GET'} ${url}`
    const route = routes[key]
    const next = Array.isArray(route) ? route.shift() : route
    if (!next) throw new Error(`нет маршрута ${key}`)
    if (next instanceof Error) throw next
    return next
  }
  return { http, calls }
}

export const ok = (text: string, headers: Record<string, string> = {}): HttpResponse => ({ status: 200, ok: true, headers, text })
export const failure = (status: number, text = ''): HttpResponse => ({ status, ok: false, headers: {}, text })
export const list = (text: string, total?: number): HttpResponse => ok(text, { 'x-total-count': String(total ?? (JSON.parse(text) as unknown[]).length) })

export function provider(routes: Record<string, Route | Route[]>, token = TOKEN, timeoutMs?: number) {
  const { http, calls } = fakeHttp(routes)
  const sleeps: number[] = []
  const instance = createForgejo({ repo: { host: 'git.example.org', owner: 'team', repo: 'app' }, token, http, sleep: async ms => { sleeps.push(ms) }, timeoutMs })
  return { instance, calls, sleeps }
}

export const REVIEWS_KEY = `GET ${API}/pulls/42/reviews?page=1&limit=50`
export const USER_KEY = `GET ${USER_URL}`
export const READ_ROUTES = {
  [REVIEWS_KEY]: list(fixture('reviews.json')),
  [`GET ${API}/pulls/42/reviews/11/comments`]: ok(fixture('review-comments-11.json')),
  [`GET ${API}/pulls/42/reviews/12/comments`]: ok(fixture('review-comments-12.json')),
  [`GET ${API}/pulls/42/reviews/13/comments`]: ok('[]'),
  [`GET ${API}/pulls/42/reviews/15/comments`]: ok('[]'),
  [`GET ${API}/issues/42/comments?page=1&limit=50`]: list(fixture('issue-comments.json')),
}

export const pull = (over: Partial<PullRequest> = {}): PullRequest => ({
  number: 1, title: 'Заголовок', body: '', author: 'bob', headRef: 'feature', headSha: 'h2', baseRef: 'main', state: 'open', merged: false, url: 'https://git.example.org/team/app/pulls/1', conflicted: false, updatedAt: '2026-10-01T10:00:00Z', fromFork: false, ...over,
})
export const review = (over: Partial<Review> = {}): Review => ({
  id: 'r1', author: 'me', state: 'approved', body: '', commitSha: 'h2', submittedAt: '2026-10-01T10:00:00Z', dismissed: false, ...over,
})
export const comment = (over: Partial<Comment> = {}): Comment => ({
  id: 'c1', author: 'alice', body: 'Замечание', createdAt: '2026-10-01T10:00:00Z', ...over,
})
export const thread = (over: Partial<Thread> = {}): Thread => ({
  id: '11:a.ts:1', path: 'a.ts', line: 1, commitSha: 'h2', comments: [], resolved: false, ...over,
})
export const data = (over: Partial<PrData> = {}): PrData => ({ pull: pull(), me: 'me', reviews: [], threads: [], general: [], ci: { state: 'none', failed: [] }, ...over })
