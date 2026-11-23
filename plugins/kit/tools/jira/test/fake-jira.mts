import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

interface FakeUser { login: string; name: string }
interface FakeIssue {
  key: string
  project: string
  type: string
  summary: string
  description: string
  assignee?: string
  parent?: string
  sprint?: string
  status?: string
}
export interface FakeState {
  loggedIn: boolean
  currentUser: FakeUser
  users: FakeUser[]
  projects: { key: string; name: string }[]
  epics: { key: string; title: string }[]
  sprints: string[]
  types: string[]
  failMode: 'none' | 'noKey' | 'error'
  hideBrowse: boolean
  disableSubmit: boolean
  flavor: 'cloud' | 'server'
  serverVisualEditor: boolean
  issues: FakeIssue[]
  submits: number
  transitionLayout: 'classic' | 'classic-overflow' | 'menu'
  transitionOptions: { label: string; destination: string }[]
  transitionMode: 'success' | 'rejected' | 'unchanged' | 'redirect-after'
  redirectIssue: boolean
  transitions: number
  issueReads: number
}
export interface FakeJira {
  url: string
  state: FakeState
  reset(): void
  close(): Promise<void>
}

const ivanov: FakeUser = { login: 'ivanov', name: 'Иван Иванов' }

const defaultState = (): FakeState => ({
  loggedIn: true,
  currentUser: ivanov,
  users: [ivanov, { login: 'petrov', name: 'Пётр Петров' }],
  projects: [{ key: 'ABCD', name: 'Alpha D' }, { key: 'ABC', name: 'Alpha' }],
  epics: [{ key: 'ABC-12', title: 'Эпик' }],
  sprints: ['Спринт 5'],
  types: ['Task', 'Bug'],
  failMode: 'none',
  hideBrowse: false,
  disableSubmit: false,
  flavor: 'cloud',
  serverVisualEditor: false,
  issues: [],
  submits: 0,
  transitionLayout: 'menu',
  transitionOptions: [{ label: 'In Progress', destination: 'In Progress' }],
  transitionMode: 'success',
  redirectIssue: false,
  transitions: 0,
  issueReads: 0,
})

const APP_HTML = readFileSync(new URL('./fake-jira-app.html', import.meta.url), 'utf8')
const SERVER_APP_HTML = readFileSync(new URL('./fake-jira-server-app.html', import.meta.url), 'utf8')
const ISSUE_HTML = readFileSync(new URL('./fake-jira-issue.html', import.meta.url), 'utf8')

const readBody = (req: IncomingMessage): Promise<string> => new Promise(resolve => {
  let data = ''
  req.on('data', chunk => { data += chunk })
  req.on('end', () => resolve(data))
})

const send = (res: ServerResponse, status: number, type: string, body: string): void => {
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8` })
  res.end(body)
}

export async function startFakeJira(): Promise<FakeJira> {
  const state = defaultState()
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake')
    if (req.method === 'GET' && !state.loggedIn && (url.pathname === '/' || url.pathname.startsWith('/browse/'))) {
      res.writeHead(302, { location: '/login' })
      res.end()
      return
    }
    if (req.method === 'GET' && url.pathname === '/') {
      const data = JSON.stringify(state).replace(/</g, '\\u003c')
      send(res, 200, 'text/html', (state.flavor === 'server' ? SERVER_APP_HTML : APP_HTML).replace('__DATA__', () => data))
      return
    }
    if (req.method === 'GET' && url.pathname === '/login') {
      send(res, 200, 'text/html', '<!doctype html><meta charset="utf-8"><h1>Login</h1>')
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/issue') {
      const body = JSON.parse(await readBody(req))
      state.submits++
      if (state.failMode === 'noKey') return
      if (state.failMode === 'error') {
        send(res, 500, 'application/json', '{"error":"boom"}')
        return
      }
      const key = `${body.project}-${state.issues.length + 1}`
      state.issues.push({ key, project: body.project, type: body.type, summary: body.summary, description: body.description, assignee: body.assignee, parent: body.parent, sprint: body.sprint })
      send(res, 200, 'application/json', JSON.stringify({ key }))
      return
    }
    const browse = url.pathname.match(/^\/browse\/([A-Z0-9_]+-\d+)$/)
    if (req.method === 'GET' && browse && !state.hideBrowse) {
      const issue = state.issues.find(candidate => candidate.key === browse[1])
      if (issue) {
        state.issueReads++
        if (issue.key === 'ABC-42' && (state.redirectIssue || (state.transitionMode === 'redirect-after' && state.transitions > 0))) {
          res.writeHead(302, { location: '/browse/ABC-43' })
          res.end()
          return
        }
        const data = JSON.stringify({
          key: issue.key,
          status: issue.status ?? 'Open',
          options: state.transitionOptions,
          layout: state.transitionLayout,
        }).replace(/</g, '\\u003c')
        send(res, 200, 'text/html', ISSUE_HTML.replace('__DATA__', () => data))
        return
      }
    }
    if (req.method === 'POST' && browse) {
      const issue = state.issues.find(candidate => candidate.key === browse[1])
      const { option } = JSON.parse(await readBody(req))
      const action = state.transitionOptions[option]
      state.transitions++
      if (!issue || !action || state.transitionMode === 'rejected') {
        send(res, 409, 'application/json', '{"error":"Jira отклонила переход"}')
        return
      }
      if (state.transitionMode !== 'unchanged') issue.status = action.destination
      send(res, 200, 'application/json', JSON.stringify({ status: issue.status }))
      return
    }
    send(res, 404, 'text/html', '<!doctype html><meta charset="utf-8"><h1>Issue Does Not Exist</h1>')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    state,
    reset: () => { Object.assign(state, defaultState()) },
    close: () => new Promise<void>(resolve => {
      server.closeAllConnections()
      server.close(() => resolve())
    }),
  }
}
