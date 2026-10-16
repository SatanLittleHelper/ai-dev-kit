export type Step = 'idle' | 'simplify' | 'simplify-report' | 'simplify-fix' | 'review' | 'fix' | 'review-report' | 'review-fix'

declare module 'claude-code' {
  interface PluginState {
    polish: {
      step: Step
      baseline: string
      turnCount: number
      turnsAtStart: number
      runningTurnId: string
      simplifyAnswer: string
      fixed: string
      skipped: string
      report: string
      reviewAnswer: string
      turnsAtFix: number
      fixAnswer: string
      fixGraceOver: boolean
    }
  }
}
