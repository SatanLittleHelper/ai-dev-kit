# Lifecycle Hooks and Startup Dependencies

An init hook (`onModuleInit`, `onApplicationBootstrap`) and an async provider factory both block application startup. If one throws or rejects, Nest aborts bootstrap and the process exits. This is not an unhandled rejection, so a process-level "log and keep running" policy does not help. An external call there ties the application's ability to start to a foreign system's availability.

An HTTP call in an init hook is not wrong in itself — warming a cache or verifying a connection is a legitimate use. What matters is whether the dependency is critical.

## Classify the dependency first

- **Critical** (database, Redis, a required secret — the process is useless without it): fail fast. Let the hook throw so the orchestrator sees a failed start and restarts the service.
- **Non-critical** (an external system behind a limited feature: Max API, Jira, BPM, mail): it must never fail startup. The rest of the application keeps working while that one feature is degraded.

## Non-critical dependency — in order of preference

1. Don't call it at startup. Take the value from configuration (a technical chat id from an env var instead of a `GET /chats` lookup) or resolve it lazily on first use.
2. If a warm-up is genuinely needed, wrap the call in `try/catch`, log the failure, and leave the feature degraded — or run the warm-up as a background task with its own `.catch` so startup does not wait for it.
3. The degraded feature reports its unavailability at call time (for example, the endpoint that needs it throws `BadGatewayException`) instead of crashing the process.

```typescript
// ❌ a failing external call aborts bootstrap
async onModuleInit(): Promise<void> {
  this.technicalChatId = await this.resolveTechnicalChatId();
}

// ✅ non-critical: configuration instead of a startup request
constructor(configService: ConfigService) {
  this.technicalChatId = configService.getOrThrow<number>('MAX_TECHNICAL_CHAT_ID');
}
```

## Libraries that start work on their own

Some modules begin network work at bootstrap without being asked. `nestjs-max` runs `void bot.start(...)` — a `getMyInfo()` request, then a polling loop — unless `launchOptions: false` is passed. For an app that only needs the API client (send messages, upload files), pass `launchOptions: false`: otherwise its startup depends on that system, and a failure surfaces as an unhandled rejection inside the library, where it cannot be caught.

## Common Mistakes

| Mistake | Fix |
|---|---|
| `await` of an external call in `onModuleInit`/`onApplicationBootstrap` with no handling | Classify the dependency: critical → let it throw deliberately; non-critical → configuration, lazy resolution, or `try/catch` + degraded feature |
| Treating every startup call as forbidden | Critical dependencies (database, Redis) should fail fast — the rule is a conscious decision, not a ban |
| Fire-and-forget initialization (`void this.warmUp()`) with no `.catch` | Run it as a background task with its own `.catch` and a log |
| Letting a library auto-start polling in an app that only calls the API | Disable the auto-start (`nestjs-max`: `launchOptions: false`) |
