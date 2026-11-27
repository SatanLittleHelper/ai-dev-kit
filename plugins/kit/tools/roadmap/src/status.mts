import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defaultBranch, listFiles, showFile, tryGit } from './git.mts'
import { findRoadmaps } from './files.mts'
import type { Roadmap, RoadmapState, Step } from './model.mts'
import { parseRoadmap } from './parse.mts'
import { listOpenPrs } from './prs.mts'
import type { PrInfo } from './prs.mts'
import { blocked, ok } from './responses.mts'
import type { Response } from './responses.mts'
import { readState } from './state.mts'

export interface Data { slug: string; roadmap: Roadmap; state: RoadmapState | null }
export interface PrOverlay { pr: PrInfo; states: Map<string, RoadmapState> }

export interface Waiting { id: string; roadmap?: string; pr?: number; reason?: 'broken' }
export interface StepInfo {
  id: string
  title: string
  state: 'ready' | 'blocked' | 'in-flight' | 'stackable'
  waitingFor?: Waiting[]
  pr?: { number: number; status: string; url: string }
  base?: { headRef: string; pr: number }
}

// Читает роадмапы из ref (git show) или из рабочего дерева, если ref не задан.
export function loadData(root: string, ref: string | null): Data[] {
  if (ref === null) {
    return findRoadmaps(root).map(item => ({ slug: item.slug, roadmap: parseRoadmap(readFileSync(item.mdPath, 'utf8')), state: readState(join(root, 'docs', item.slug, 'roadmap-state.json')) }))
  }
  const files = listFiles(root, ref, 'docs')
  return files.flatMap(file => {
    const match = /^docs\/([^/]+)\/[^/]+-roadmap\.md$/.exec(file)
    if (!match) return []
    const stateText = showFile(root, ref, `docs/${match[1]}/roadmap-state.json`)
    return [{ slug: match[1], roadmap: parseRoadmap(showFile(root, ref, file) ?? ''), state: stateText ? (JSON.parse(stateText) as RoadmapState) : null }]
  })
}

const key = (slug: string, id: string): string => `${slug}:${id}`
const differs = (a: Step | undefined, b: Step): boolean =>
  !a || a.status !== b.status || a.specPath !== b.specPath || a.testPlanPath !== b.testPlanPath || a.planPath !== b.planPath

export function computeStatus(main: Data[], overlays: PrOverlay[]): { roadmaps: { slug: string; steps: StepInfo[] }[]; inFlight: { roadmap: string; id: string; pr: number; status: string }[] } {
  const mainSteps = new Map<string, Step>()
  for (const data of main) for (const step of data.state?.steps ?? []) mainSteps.set(key(data.slug, step.id), step)

  const inFlight = new Map<string, { number: number; status: string; url: string }>()
  for (const overlay of overlays) {
    for (const [slug, state] of overlay.states) {
      for (const step of state.steps) {
        if (differs(mainSteps.get(key(slug, step.id)), step) && !inFlight.has(key(slug, step.id))) inFlight.set(key(slug, step.id), { number: overlay.pr.number, status: step.status, url: overlay.pr.url })
      }
    }
  }

  const closedIn = (overlay: PrOverlay, slug: string, id: string): boolean => overlay.states.get(slug)?.steps.find(step => step.id === id)?.status === 'closed'
  const chain = (overlay: PrOverlay, seen = new Set<number>()): PrOverlay[] => {
    if (seen.has(overlay.pr.number)) return []
    seen.add(overlay.pr.number)
    const parent = overlays.find(candidate => candidate.pr.headRef === overlay.pr.baseRef)
    return [overlay, ...(parent ? chain(parent, seen) : [])]
  }

  // Состояние зависимости на основной ветке: 'ok' | 'open' | 'broken'.
  const dependency = (slug: string, raw: string): { id: string; slug: string; verdict: 'ok' | 'open' | 'broken'; bare: boolean } => {
    const cross = raw.includes(':')
    const [targetSlug, id] = cross ? raw.split(':') : [slug, raw]
    const data = main.find(candidate => candidate.slug === targetSlug)
    if (cross && !data) return { id, slug: targetSlug, verdict: 'ok', bare: false }
    const step = data?.state?.steps.find(candidate => candidate.id === id)
    if (step) return { id, slug: targetSlug, verdict: step.status === 'closed' ? 'ok' : 'open', bare: !cross }
    const checkpoint = data?.roadmap.checkpoints.find(candidate => candidate.id === id)
    if (checkpoint && !data?.state) return { id, slug: targetSlug, verdict: checkpoint.checked ? 'ok' : 'open', bare: !cross }
    return { id, slug: targetSlug, verdict: 'broken', bare: !cross }
  }

  const roadmaps = main.map(data => {
    const steps: StepInfo[] = []
    for (const checkpoint of data.roadmap.checkpoints.filter(candidate => !candidate.checked)) {
      const base = { id: checkpoint.id, title: checkpoint.title }
      const flying = inFlight.get(key(data.slug, checkpoint.id))
      if (flying) {
        steps.push({ ...base, state: 'in-flight', pr: flying })
        continue
      }
      const unsatisfied = checkpoint.dependsOn.map(raw => dependency(data.slug, raw)).filter(entry => entry.verdict !== 'ok')
      if (unsatisfied.length === 0) {
        steps.push({ ...base, state: 'ready' })
        continue
      }
      const stackOn = unsatisfied.every(entry => entry.verdict === 'open')
        ? overlays.find(overlay => {
            const closed = chain(overlay).flatMap(member => unsatisfied.filter(entry => closedIn(member, entry.slug, entry.id)).map(entry => key(entry.slug, entry.id)))
            return unsatisfied.every(entry => closed.includes(key(entry.slug, entry.id)))
          })
        : undefined
      if (stackOn) {
        steps.push({ ...base, state: 'stackable', base: { headRef: stackOn.pr.headRef, pr: stackOn.pr.number } })
        continue
      }
      steps.push({
        ...base,
        state: 'blocked',
        waitingFor: unsatisfied.map(entry => {
          const waiting: Waiting = { id: entry.id }
          if (!entry.bare) waiting.roadmap = entry.slug
          const flyingDep = inFlight.get(key(entry.slug, entry.id))
          if (flyingDep) waiting.pr = flyingDep.number
          if (entry.verdict === 'broken') waiting.reason = 'broken'
          return waiting
        }),
      })
    }
    return { slug: data.slug, steps }
  })

  return {
    roadmaps,
    inFlight: [...inFlight].map(([id, info]) => ({ roadmap: id.split(':')[0], id: id.split(':')[1], pr: info.number, status: info.status })),
  }
}

export function statusCommand(root: string, slug: string | undefined, env: NodeJS.ProcessEnv): Response {
  if (tryGit(root, 'rev-parse', '--git-dir') === null) return blocked('Не git-репозиторий.')
  tryGit(root, 'fetch', 'origin', '--prune')
  const branch = defaultBranch(root)
  const ref = branch && tryGit(root, 'rev-parse', '--verify', '--quiet', `origin/${branch}`) !== null ? `origin/${branch}` : null
  const main = loadData(root, ref)
  if (main.length === 0) return blocked('Роадмапов в docs/*/*-roadmap.md нет.')
  if (slug && !main.some(data => data.slug === slug)) return blocked(`Роадмап «${slug}» не найден.`)

  const prs = listOpenPrs(root, env)
  const overlays = collectOverlays(root, env, prs)
  const result = computeStatus(main, overlays)
  return ok({
    source: ref ?? 'local',
    prSync: prs.ok ? 'ok' : 'skipped',
    ...(prs.ok ? {} : { prSyncReason: prs.reason }),
    roadmaps: slug ? result.roadmaps.filter(item => item.slug === slug) : result.roadmaps,
    inFlight: result.inFlight,
  })
}

export function collectOverlays(root: string, env: NodeJS.ProcessEnv, prs = listOpenPrs(root, env)): PrOverlay[] {
  const overlays: PrOverlay[] = []
  if (prs.ok) {
    for (const pr of prs.prs) {
      const touched = [...new Set(pr.files.flatMap(file => /^docs\/([^/]+)\/roadmap-state\.json$/.exec(file)?.[1] ?? []))]
      if (touched.length === 0) continue
      if (tryGit(root, 'fetch', 'origin', `+refs/heads/${pr.headRef}:refs/remotes/origin/${pr.headRef}`) === null) continue
      const states = new Map<string, RoadmapState>()
      for (const touchedSlug of touched) {
        const text = showFile(root, `origin/${pr.headRef}`, `docs/${touchedSlug}/roadmap-state.json`)
        if (text) states.set(touchedSlug, JSON.parse(text) as RoadmapState)
      }
      overlays.push({ pr, states })
    }
  }
  return overlays
}
