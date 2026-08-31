---
name: nestjs-personal-conventions
description: Use when writing or reviewing NestJS code — services, controllers, DTOs, or any integration with a database or external HTTP API — to apply this developer's personal architectural conventions on top of general NestJS best practices.
---

# NestJS Personal Conventions

## Overview

**REQUIRED SUB-SKILL:** Invoke `nestjs-best-practices` first — it covers generic NestJS architecture, DI, and security. This skill is a personal layer on top of it: four opinionated conventions this developer applies to every NestJS project, closing gaps generic best-practice guidance leaves open (it doesn't mandate a repository layer, doesn't say DTOs must implement shared interfaces, and doesn't prescribe a shape for external HTTP integrations).

Baseline testing (an agent asked to add a DB lookup + outbound webhook call, no skill loaded) reproducibly violates all four: it calls the ORM client directly from a service, writes a DTO with no shared-interface contract, and bundles the outbound HTTP call into an ad-hoc service instead of a dedicated one. None of this is exotic knowledge — it just isn't default NestJS style, so it has to be stated explicitly.

## Quick Reference

| Concern | Rule |
|---|---|
| DB/ORM access | Only through a dedicated `*.repository.ts` class — never call the ORM client (Prisma/TypeORM/etc.) from a service |
| Repository method naming | `get*` throws when missing, `find*` returns `null`/`undefined` when missing |
| DTO ↔ shared contract | Every DTO class `implements` an interface from the project's shared-contracts package/folder |
| Outbound call to one external API | Lives in a dedicated `*.api.service.ts`, `async`, returns `Promise<T>` |
| Whole external system integration | Gets its own `<domain>-http/` module with `forRootAsync()`, registered once, `global: true` |
| M2M auth (no OAuth) | Bearer token guard comparing against a configured secret, registered as `APP_GUARD` |
| Error logging | `PinoLogger.error(err, message)` — error first, message second — never `@nestjs/common Logger` for this call shape |
| Branch logging | `logger.debug(...)` on every meaningful guard/branch/skip path |
| Cross-field validation | Never stack a cross-field decorator on a property also guarded by `@IsOptional()`/`@ValidateIf()` |

## Repository Layer (mandatory)

Never call the ORM client directly from a service — always through a dedicated, `@Injectable()` repository class registered in the module. The service injects the repository; the repository injects the ORM client.

```typescript
// ❌ Baseline violation: service touches Prisma directly
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
  async getByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }
}

// ✅ Repository owns the query; service orchestrates
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}
  async getByEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundException(`User ${email} not found`);
    return user;
  }
}

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}
  getByEmail(email: string) {
    return this.usersRepository.getByEmail(email);
  }
}
```

**Exception:** a controller may inject a repository directly, skipping the service, when the handler does nothing but forward the call with zero business logic. The moment it needs any logic (auth beyond the guard, mapping, combining calls), route it back through a service.

Type the repository's row-mapping input with the ORM's own generated model type (e.g. `import type { users } from '@prisma/client'`) — never a hand-written structural interface duplicating the schema by hand; it silently drifts when the schema changes.

## DTOs Implement Shared Interfaces

Every DTO class `implements` a corresponding interface from wherever this project keeps cross-cutting request/response contracts (a shared lib, a `contracts/` folder — whatever the repo's own convention is) — never declare DTO fields independently of that contract. This keeps the wire contract and the validated shape from drifting apart.

```typescript
// shared contracts package
export interface CreateUserRequest {
  email: string;
  name?: string;
}

// DTO
export class CreateUserDto implements CreateUserRequest {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  name?: string;
}
```

A non-null assertion (`!`) is acceptable here — and only here — to suppress TS errors on fields the `ValidationPipe` initializes at runtime.

## External HTTP Calls

**One outbound call to one external API** → a dedicated `*.api.service.ts`. `async`, returns `Promise<T>`, uses `HttpService` (Axios-based):

```typescript
// with error handling — map MUST be inside the same pipe as catchError
return firstValueFrom(
  this.http.post<T>(url, body).pipe(
    map(({ data }) => data),
    catchError((err) => { throw new InternalServerErrorException(...); }),
  ),
);

// without error handling — response.data after await is fine ONLY when there's no catchError
const response = await firstValueFrom(this.http.post<T>(url, body));
return response.data;
```

Never mix the two shapes: if `catchError` is in the pipe, data must also come from `map` inside that same pipe — `response.data` after `await` when `catchError` is already present silently swallows the mapped value.

**A whole external system** (not just one call) → its own `<domain>-http/` module: `*.token.ts` for injection tokens, `*.types.ts` for `XxxHttpConfig`/`XxxHttpModuleAsyncOptions`, a `static forRootAsync(options)` returning a `DynamicModule` (config provider + `HttpService` provider, auth via an Axios request interceptor built inside `useFactory`). Mark it `global: true`, call `forRootAsync` exactly once in the root app module — every other module just `@Inject()`s the token, never re-imports or re-configures it.

## Cron Schedules

Always use the `CronExpression` enum from `@nestjs/schedule` (e.g. `CronExpression.EVERY_5_MINUTES`) — never a raw cron string. The enum is self-documenting and catches typos at compile time that a raw string like `'*/5 * * * *'` wouldn't.

## Logging

**Log messages in the same language you communicate with the user in** (this developer's default: Russian) — both `Logger`/diagnostic `console` output and structured logger calls.

**Error logging — use `PinoLogger`, not `@nestjs/common`'s `Logger`, for the call shape.** Inject via `@InjectPinoLogger(ClassName.name) private readonly logger: PinoLogger` from `nestjs-pino` (constructor parameter, not a field initializer). Call pattern: `this.logger.error(err, 'Human-readable error message')` — the raw caught error **first**, the message **second**. Never pass a formatted error string as the trailing argument instead: `@nestjs/common`'s `Logger` (which `nestjs-pino` wraps for global output) treats a trailing string argument as the log `context` field and silently drops extra positional arguments that don't match a `%s`-style placeholder — so a `logger.error(getErrorMessage(err))`-shaped call never actually reaches stdout with the error detail. `PinoLogger.error(err, message)` is the only shape that reliably produces both a readable message and a structured `err` field (message + stack) for log parsing. `.warn`/`.debug` keep the plain single-string signature. `PinoLogger` has **no `.log()` method** — its levels are `trace/debug/info/warn/error/fatal`; a pre-`nestjs-pino` `logger.log('text')` becomes `logger.info('text')`.

**Debug log every meaningful branch.** A guard clause, an `if`/`else`, a conditional early return, a skip/no-op path — each gets a `logger.debug('human-readable text')` call explaining which branch was taken and why. This makes branch-dependent bugs (a skipped write, a silently ignored duplicate) diagnosable from logs alone, without reproducing the issue or querying the database. Applies to services and repositories alike; a class with no logger yet gains one via the same constructor-injected `PinoLogger` pattern used for error logging.

## M2M Bearer Guard

For service-to-service auth with no OAuth flow: extract the token via `bearer.replace('Bearer ', '')`, compare against a config value with `config.getOrThrow<string>(...)`, register the guard as `APP_GUARD`.

## AppModule DI Test Pattern

To test that the root `AppModule` actually wires up (env vars validated, every provider resolvable), set `process.env` in `beforeAll`, then use a dynamic `await import('./app.module')` inside the `it()` body — this guarantees the module is loaded after the env vars are set, not at file-parse time. Compile with `Test.createTestingModule({ imports: [AppModule] }).compile().resolves.toBeDefined()`. No `overrideProvider`, no `useMocker` — the point is verifying the real DI graph resolves, not stubbing pieces of it.

## Cross-Field Validation Gotcha

`@IsOptional()` and `@ValidateIf()` both suppress **every** decorator stacked on that property when their condition is false — not just their own check. Stacking a custom cross-field decorator (one reading sibling properties via `args.object`) on a property that's also `@IsOptional()`-guarded means the exact case you need to catch (that property being empty) is the case where the cross-field check silently never runs.

Fix by normalizing instead of gating: use `@Transform(({ value }) => value ?? '')` (class-transformer, runs before `class-validator`) so the field is never `undefined` by validation time — no gating decorator needed, and any cross-field decorator on it always runs.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Service calls `PrismaService`/ORM client directly | Add a `*.repository.ts`, move the query there |
| DTO fields typed ad hoc, no shared interface | `implements` the shared contract interface |
| Outbound API call inlined in an orchestrating service | Extract to `*.api.service.ts` |
| `catchError` in pipe but `response.data` used after `await` | Use `map(({ data }) => data)` inside the same pipe |
| Cross-field decorator on an `@IsOptional()` property | Normalize via `@Transform`, drop the gate |
| Hand-written interface mirroring an ORM row shape | Import the ORM's generated model type instead |
