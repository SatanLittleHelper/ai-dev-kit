# Cron Schedules

Always use the `CronExpression` enum from `@nestjs/schedule` (e.g. `CronExpression.EVERY_5_MINUTES`) — never a raw cron string. The enum is self-documenting and catches typos at compile time that a raw string like `'*/5 * * * *'` wouldn't.
