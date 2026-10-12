export type Step = 'idle' | 'simplify' | 'review' | 'fix'

declare module 'claude-code' {
  interface PluginState {
    polish: {
      step: Step
      reviewAgent: string
      baseline: string
      turnCount: number
      turnsAtStart: number
      runningTurnId: string
      simplifyAnswer: string
      fixed: string
      skipped: string
      report: string
      reviewAnswer: string
      reviewNote: string
      turnsAtReview: number
      fixAnswer: string
      fixGraceOver: boolean
    }
  }
}
