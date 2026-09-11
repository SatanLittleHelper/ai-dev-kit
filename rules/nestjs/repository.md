# Repository Layer (mandatory)

Never call the ORM client directly from a service — always through a dedicated, `@Injectable()` repository class registered in the module. The service injects the repository, never `PrismaService` or `TransactionHost` directly. See `rules/nestjs/repository.examples.md` → "Repository owns the query; service orchestrates".

**Exception:** a controller may inject a repository directly, skipping the service, when the handler does nothing but forward the call with zero business logic. The moment it needs any logic (auth beyond the guard, mapping, combining calls), route it back through a service.

**Transactional access — `TransactionHost`, not `PrismaService`:** a repository injects `TransactionHost<TransactionalAdapterPrisma<PrismaService>>` (from `@nestjs-cls/transactional`/`@nestjs-cls/transactional-adapter-prisma`, see `nest/prisma.md`) — never `PrismaService` directly as a runtime dependency, and never an explicit `client`/`tx` parameter on a repository method. Atomicity across several repositories in one call is achieved by putting `@Transactional()` on the orchestrating service method that calls them, never by threading a transaction client through repository method parameters.

**Единая точка доступа к клиенту — общий базовый класс, не per-repository геттер:** every repository needing transactional access extends a single shared `PrismaTransactionalRepository` base class instead of repeating the `txHost` constructor param and `client` getter in each one. See `rules/nestjs/repository.examples.md` → "Shared base class for transactional client access".

The base class uses **property injection** (`@Inject()` on a field), not constructor injection — NestJS only reflects constructor parameter types (`design:paramtypes`) for the class that declares the constructor, so a subclass with no constructor of its own would get no DI metadata for an inherited constructor param. Property injection sidesteps this: the base class's own `@Inject()` resolves regardless of how many subclasses extend it, and subclasses need no constructor at all.

`this.client` transparently resolves to the base `PrismaService` outside a transaction and to the active transaction client inside one — a repository method has one signature regardless of whether it runs standalone or as part of a multi-repository transaction. Renaming/replacing the underlying client touches one base class, not every repository.

Type the repository's row-mapping input with the ORM's own generated model type (e.g. `import type { users } from '@prisma/client'`) — never a hand-written structural interface duplicating the schema by hand; it silently drifts when the schema changes.

**Repository write-params derived from the shared request contract:** when a repository method's parameters overlap heavily with an existing shared request interface (from wherever the project keeps cross-cutting contracts — a shared lib, `contracts/`, etc.) minus a few server-derived fields (e.g. `userId` from the auth context) or fields owned by a sibling repository (e.g. a nested collection written through its own `replaceAll`), derive the params type via `Omit<>` intersection instead of re-declaring every field by hand. See `rules/nestjs/repository.examples.md` → "Repository write-params derived from a shared request contract".

This keeps the repository-layer params type structurally locked to the shared request contract — a field added, renamed, or removed there surfaces as a compile error here instead of silently drifting out of sync.

**Repository method naming:** `get*` throws when missing, `find*` returns `null`/`undefined` when missing.

## Known Gotchas

### Prisma: Optional Filters and `undefined`

Prisma's `where` ignores fields whose value is `undefined` (documented Prisma Client behavior) — an optional filter can be written directly as `columnName: value`, without `...(value ? { columnName: value } : {})`, when `value` may be `undefined`.

This is the mirror image of the Angular `HttpParams` gotcha (`rules/angular/http.md`): there, `undefined` serializes to the literal string `"undefined"` and must be filtered out before building `HttpParams`; here, Prisma already drops `undefined` filters for you — don't wrap them in a conditional spread out of habit carried over from the frontend side. See `rules/nestjs/repository.examples.md` → "Prisma: Optional Filters and `undefined`".

This applies to Prisma specifically — verify the same guarantee before relying on it with a different ORM.

## Common Mistakes

| Mistake                                                             | Fix                                                            |
| ------------------------------------------------------------------- | -------------------------------------------------------------- |
| Service calls `PrismaService`/`TransactionHost`/ORM client directly | Add a `*.repository.ts`, move the query there                  |
| Hand-written interface mirroring an ORM row shape                   | Import the ORM's generated model type instead                  |
| Repository params type hand-duplicates fields from an existing shared request contract | Derive via `Omit<SharedRequest, 'fieldsOwnedElsewhere'> & { serverDerivedField }` |
| `...(value ? { column: value } : {})` for an optional Prisma filter | Pass `{ column: value }` directly — Prisma ignores `undefined` |
| Repeating the `txHost` constructor param + `client` getter in every repository | Extend the shared `PrismaTransactionalRepository` base class instead |
