import { main } from './forgejo/cli/main.mts'
import { CliError } from './forgejo/cli/draft.mts'
import { checkBody } from './hooks/check.mts'

process.exitCode = await main(process.argv.slice(2), draft => {
  const { problem, incomplete } = checkBody(draft.body, draft.base, process.cwd())
  if (problem || incomplete) {
    throw new CliError([problem, incomplete].filter(Boolean).join(' '), 2)
  }
})
