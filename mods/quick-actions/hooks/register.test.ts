import { expect, test } from 'claude-code/testing'

async function mountBand($: Parameters<Parameters<typeof test>[1]>[0], hasSurvey = false) {
  return $.ui.mount({ plugin: 'quick-actions', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey } })
}

test('the PR dashboard button runs the dashboard skill', async ($, on) => {
  const ran: string[] = []

  on('command.run', ($$, e) => {
    ran.push(e.command)

    return { text: '' }
  })

  const band = await mountBand($)

  await band.press({ key: 'pr-dashboard' })

  expect(ran).toEqual(['kit:forgejo-pr-dashboard'])
})

test('the Roadmap button runs the roadmap skill', async ($, on) => {
  const ran: string[] = []

  on('command.run', ($$, e) => {
    ran.push(e.command)

    return { text: '' }
  })

  const band = await mountBand($)

  await band.press({ key: 'roadmap' })

  expect(ran).toEqual(['kit:roadmap'])
})
