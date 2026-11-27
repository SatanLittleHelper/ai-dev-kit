import { existsSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { run, register } from './run.mts'
import { repositoryRoot } from '../src/root.mts'
import { estimateCommand } from '../src/estimate.mts'
import { validateCommand } from '../src/validate.mts'
import { initCommand } from '../src/init.mts'
import { createCommand } from '../src/create.mts'
import { statusCommand } from '../src/status.mts'
import { pickCommand } from '../src/pick.mts'
import { closeCommand } from '../src/close.mts'
import { markCommand } from '../src/mark.mts'
import { ticketsCommand } from '../src/tickets.mts'
import { linkCommand } from '../src/link.mts'

register('estimate', (a, io) => estimateCommand(repositoryRoot(io.cwd), a.positional[0]))
register('validate', (a, io) => validateCommand(repositoryRoot(io.cwd), a.positional[0]))
register('init', (a, io) => initCommand(repositoryRoot(io.cwd), a.positional[0]))
register('create', (a, io) => createCommand(repositoryRoot(io.cwd), a.positional[0], a.positional[1], { limit: a.flags.limit, date: a.flags.date }))
register('status', (a, io) => statusCommand(repositoryRoot(io.cwd), a.positional[0], io.env))
register('pick', (a, io) => pickCommand(repositoryRoot(io.cwd), a.positional[0], { slug: a.flags.slug, base: a.flags.base, name: a.flags.name, stepSlug: a.flags['step-slug'], sync: a.flags.sync }, io.env))
register('close', (a, io) => closeCommand(repositoryRoot(io.cwd), a.positional[0], { slug: a.flags.slug, days: a.flags.days }, io.env))
register('mark', (a, io) => markCommand(repositoryRoot(io.cwd), a.positional[0], { slug: a.flags.slug, status: a.flags.status, spec: a.flags.spec, plan: a.flags.plan }))
register('tickets', (a, io) => ticketsCommand(repositoryRoot(io.cwd), a.positional[0]))
register('link', (a, io) => linkCommand(repositoryRoot(io.cwd), a.positional[0], a.flags.from))

export function main(argv = process.argv.slice(2)): number {
  return run(argv, { cwd: process.cwd(), env: process.env, out: text => process.stdout.write(`${text}\n`) })
}

if (process.argv[1] && existsSync(process.argv[1]) && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  process.exitCode = main()
}
