import type { Page } from 'playwright-core'
import { CliError, EXIT } from '../errors.mts'
import type { Ticket } from '../draft/tickets.mts'
import type { Created } from '../roadmap/created.mts'
import { createIssue } from './create-issue.mts'
import type { CreateContext } from './create-issue.mts'

interface Request {
  project: string
  storyType: string
  childType: string
  story: Ticket
  children: Ticket[]
  created: Created
  dryRun: boolean
  save(created: Created): void
}

interface Result {
  story: { key: string; url: string } | null
  children: { id: string; key: string; url: string }[]
  skipped: string[]
  dryRun?: true
  planned?: string[]
}

// Стори, затем подзадачи по порядку документа; всё, что уже записано в created, пропускается.
export async function createRoadmap(page: Page, context: CreateContext, request: Request): Promise<Result> {
  const { created } = request
  const items = [{ ticket: request.story, story: true }, ...request.children.map(ticket => ({ ticket, story: false }))]
  const skipped: string[] = []
  const pending = items.filter(item => !(item.story ? created.story : created.children[item.ticket.id]))
  for (const item of items) {
    if (!pending.includes(item)) skipped.push(item.ticket.id)
  }

  if (request.dryRun) {
    const first = pending[0]
    if (first) {
      await createIssue(page, context, {
        project: request.project,
        type: first.story ? request.storyType : request.childType,
        title: first.ticket.title,
        body: first.ticket.body,
        ...(first.story || !created.story ? {} : { parent: created.story.key }),
        dryRun: true,
      })
    }
    return { story: created.story, children: [], skipped, dryRun: true, planned: pending.map(item => item.ticket.id) }
  }

  for (const item of pending) {
    try {
      const issue = await createIssue(page, context, {
        project: request.project,
        type: item.story ? request.storyType : request.childType,
        title: item.ticket.title,
        body: item.ticket.body,
        ...(item.story ? {} : { parent: created.story!.key }),
      })
      if (!('key' in issue)) throw new CliError('Jira не вернула ключ созданной задачи.', EXIT.UNKNOWN)
      if (item.story) created.story = { key: issue.key, url: issue.url }
      else created.children[item.ticket.id] = { key: issue.key, url: issue.url }
      request.save(created)
    } catch (error) {
      if (error instanceof CliError && error.code === EXIT.UNKNOWN) {
        created.unknown = item.ticket.id
        request.save(created)
      }
      throw error
    }
  }
  return {
    story: created.story,
    children: request.children.flatMap(child => created.children[child.id] ? [{ id: child.id, ...created.children[child.id] }] : []),
    skipped,
  }
}
