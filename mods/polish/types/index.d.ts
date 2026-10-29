export type Step = 'idle' | 'simplify' | 'simplify-report' | 'simplify-fix' | 'review' | 'fix' | 'review-report' | 'review-fix'

declare module 'claude-code' {
  interface PluginState {
    polish: {
      step: StateFamily<Step>
      baseline: StateFamily<string>
      turnCount: StateFamily<number>
      turnsAtStart: StateFamily<number>
      runningTurnId: StateFamily<string>
      simplifyAnswer: StateFamily<string>
      fixed: StateFamily<string>
      skipped: StateFamily<string>
      report: StateFamily<string>
      reviewAnswer: StateFamily<string>
      turnsAtFix: StateFamily<number>
      fixAnswer: StateFamily<string>
      fixGraceOver: StateFamily<boolean>
    }
  }
}
