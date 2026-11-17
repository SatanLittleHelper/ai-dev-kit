import type { Http, HttpResponse, ProviderDeps } from './types.mts'

export const PAGE_LIMIT = 50
const ERROR_BODY_LIMIT = 500
const MASK = '***'
const MS_IN_SECOND = 1000

export interface Client {
  repoPath: string
  call(method: string, path: string, body?: unknown): Promise<unknown>
  paged<T>(path: string): Promise<T[]>
}

function withTimeout(http: Http, sleep: ProviderDeps['sleep'], ms: number | undefined): Http {
  if (!ms) return http
  return (url, init) => Promise.race<HttpResponse>([
    http(url, init),
    sleep(ms, { ref: false }).then((): never => { throw new Error(`нет ответа за ${ms / MS_IN_SECOND} с`) }),
  ])
}

export function createClient(deps: ProviderDeps): Client {
  const send = withTimeout(deps.http, deps.sleep, deps.timeoutMs)
  const mask = (text: string): string => (deps.token ? text.split(deps.token).join(MASK) : text)

  const request = async (method: string, path: string, body?: unknown): Promise<{ data: unknown; headers: Record<string, string> }> => {
    const response = await send(`${deps.repo.scheme ?? 'https'}://${deps.repo.host}/api/v1${path}`, {
      method,
      headers: { Authorization: `token ${deps.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }).catch(error => { throw new Error(`${method} ${path}: сеть: ${mask(String(error))}`) })
    if (!response.ok) {
      throw Object.assign(new Error(`${method} ${path}: HTTP ${response.status} ${mask(response.text.slice(0, ERROR_BODY_LIMIT))}`), { status: response.status })
    }
    return { data: response.text ? JSON.parse(response.text) : null, headers: response.headers }
  }

  const paged = async <T>(path: string): Promise<T[]> => {
    const all: T[] = []
    const join = path.includes('?') ? '&' : '?'
    for (let page = 1; ; page++) {
      const { data, headers } = await request('GET', `${path}${join}page=${page}&limit=${PAGE_LIMIT}`)
      const items = (data ?? []) as T[]
      all.push(...items)
      const total = Number(headers['x-total-count'])
      if (items.length === 0 || (Number.isFinite(total) && all.length >= total)) return all
    }
  }

  return {
    repoPath: `/repos/${deps.repo.owner}/${deps.repo.repo}`,
    call: async (method, path, body) => (await request(method, path, body)).data,
    paged,
  }
}
