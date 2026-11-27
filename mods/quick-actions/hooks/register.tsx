import type { EngineInterface, Register } from 'claude-code'

// Buttons above the prompt: each one runs a kit skill as a command in the current session.
const ACTIONS = [
  { key: 'pr-dashboard', label: 'PR dashboard', hotkey: 'd', command: 'kit:forgejo-pr-dashboard' },
  { key: 'roadmap', label: 'Roadmap', hotkey: 'r', command: 'kit:roadmap' },
] as const

async function launch($: EngineInterface, command: string): Promise<void> {
  try {
    await $.command.run({ command, args: '' })
  } catch (error) {
    $.ui.toast(`Не удалось запустить /${command}: ${String(error)}`)
  }
}

export const register: Register = on => {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const below = await next(e)
    const { Box, Button } = $.ui.resolve(e)

    return (
      <Box>
        {below}
        {ACTIONS.map(action => (
          <Button key={action.key} label={action.label} hotkey={action.hotkey} onPress={() => launch($, action.command)} />
        ))}
      </Box>
    )
  })
}
