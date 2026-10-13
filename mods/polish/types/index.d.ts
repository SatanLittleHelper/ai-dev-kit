export type Step = 'idle' | 'simplify' | 'review'

declare module 'claude-code' {
  interface PluginState {
    polish: {
      step: Step
      baseline: string
      turnCount: number
      turnsAtStart: number
      runningTurnId: string
      simplifyAnswer: string
      reviewAnswer: string
      fixed: string
      skipped: string
      report: string
    }
  }
}
