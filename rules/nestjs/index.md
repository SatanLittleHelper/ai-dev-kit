# NestJS Personal Conventions

**REQUIRED SUB-SKILL:** Invoke `nestjs-best-practices` first — it covers generic NestJS architecture, DI, and security. This directory is a personal layer on top of it: opinionated conventions this developer applies to every NestJS project, closing gaps generic best-practice guidance leaves open (it doesn't mandate a repository layer, doesn't say DTOs must implement shared interfaces, and doesn't prescribe a shape for external HTTP integrations).

Baseline testing (an agent asked to add a DB lookup + outbound webhook call, no rule loaded) reproducibly violates the core ones: it calls the ORM client directly from a service, writes a DTO with no shared-interface contract, and bundles the outbound HTTP call into an ad-hoc service instead of a dedicated one. None of this is exotic knowledge — it just isn't default NestJS style, so it has to be stated explicitly.

## Quick Reference

| Concern | Rule | File |
|---|---|---|
| DB/ORM access | Only through a dedicated `*.repository.ts` class — never call the ORM client (Prisma/TypeORM/etc.) from a service; Prisma's `where` ignores `undefined` filters, no conditional spread needed | `repository.md` |
| DTO ↔ shared contract | Every DTO class `implements` an interface from the project's shared-contracts package/folder | `dto.md` |
| Outbound HTTP calls | One call → `*.api.service.ts`; a whole external system → its own `<domain>-http/` module | `http-client.md` |
| Cron schedules | `CronExpression` enum, never a raw cron string | `scheduling.md` |
| Logging | `PinoLogger.error(err, message)`, debug-log every branch | `logging.md` |
| M2M auth (no OAuth) | Bearer guard registered as `APP_GUARD` | `guard.md` |
| AppModule DI test | Dynamic import after `process.env` set, real DI graph, no mocking | `module.md` |
| Cross-field validation gotcha | Never stack a cross-field decorator on an `@IsOptional()`/`@ValidateIf()` property | `validation.md` |
| Flyway migrations | `V<N>__desc.sql`/`R__desc.sql` naming, `common/` vs. env-specific split, column conventions (snake_case, `BIGSERIAL`, `TIMESTAMPTZ`, explicit `ON DELETE`) | `flyway.md` |
| Prisma workflow, `PrismaService`, transactions across repositories | DB-first via Flyway + `db pull`; two transaction variants (direct `$transaction` vs. `nestjs-cls` AsyncLocalStorage) — check which the project uses | `prisma.md` |

Read the specific file(s) the current task touches — this index is the map, not a substitute for reading them. `@import` doesn't apply here: this directory is on-demand, reached via `Read`, not via the always-on `rules/RULES.md` chain — `Read` doesn't resolve `@file.md` references, so read each needed file explicitly by its path (`rules/nestjs/repository.md`, etc.).
