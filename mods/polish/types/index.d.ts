export type Step = 'idle' | 'simplify' | 'review' | 'fix'

declare module 'claude-code' {
  interface PluginState {
    polish: {
      step: StateFamily<Step>
      baseline: StateFamily<string>
      turnCount: StateFamily<number>
      turnsAtStart: StateFamily<number>
      runningTurnId: StateFamily<string>
      turnsAtFix: StateFamily<number>
      fixGraceOver: StateFamily<boolean>
    }
  }
}
