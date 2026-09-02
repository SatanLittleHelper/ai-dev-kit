# Repository Layer (mandatory)

Never call the ORM client directly from a service — always through a dedicated, `@Injectable()` repository class registered in the module. The service injects the repository, never `PrismaService` or `TransactionHost` directly.

```typescript
// ❌ Baseline violation: service touches Prisma directly
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
  async getByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }
}

// ✅ Repository owns the query; service orchestrates.
@Injectable()
export class UsersRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  async getByEmail(email: string) {
    const user = await this.client.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundException(`User ${email} not found`);
    return user;
  }

  private get client() {
    return this.txHost.tx;
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

**Transactional access — `TransactionHost`, not `PrismaService`:** a repository injects `TransactionHost<TransactionalAdapterPrisma<PrismaService>>` (from `@nestjs-cls/transactional`/`@nestjs-cls/transactional-adapter-prisma`, see `nest/prisma.md`) — never `PrismaService` directly as a runtime dependency, and never an explicit `client`/`tx` parameter on a repository method. Atomicity across several repositories in one call is achieved by putting `@Transactional()` on the orchestrating service method that calls them, never by threading a transaction client through repository method parameters.

**Единая точка доступа к клиенту — приватный геттер `client`:** a repository never reads `this.txHost.tx` directly inside a method body — it wraps it in a private getter instead:

```typescript
@Injectable()
export class SomeRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  someMethod() {
    return this.client.someTable.findMany();
  }

  private get client() {
    return this.txHost.tx;
  }
}
```

`this.client` transparently resolves to the base `PrismaService` outside a transaction and to the active transaction client inside one — a repository method has one signature regardless of whether it runs standalone or as part of a multi-repository transaction. Renaming/replacing the underlying client touches one getter, not every method.

Type the repository's row-mapping input with the ORM's own generated model type (e.g. `import type { users } from '@prisma/client'`) — never a hand-written structural interface duplicating the schema by hand; it silently drifts when the schema changes.

**Repository method naming:** `get*` throws when missing, `find*` returns `null`/`undefined` when missing.

## Known Gotchas

### Prisma: Optional Filters and `undefined`

Prisma's `where` ignores fields whose value is `undefined` (documented Prisma Client behavior) — an optional filter can be written directly as `columnName: value`, without `...(value ? { columnName: value } : {})`, when `value` may be `undefined`.

This is the mirror image of the Angular `HttpParams` gotcha (`rules/angular/http.md`): there, `undefined` serializes to the literal string `"undefined"` and must be filtered out before building `HttpParams`; here, Prisma already drops `undefined` filters for you — don't wrap them in a conditional spread out of habit carried over from the frontend side.

```typescript
// ❌ Unnecessary conditional spread — Prisma already ignores undefined
async findUsers(email: string | undefined) {
  return this.prisma.user.findMany({
    where: { ...(email ? { email } : {}) },
  });
}

// ✅ Pass the optional value straight through
async findUsers(email: string | undefined) {
  return this.prisma.user.findMany({ where: { email } });
}
```

This applies to Prisma specifically — verify the same guarantee before relying on it with a different ORM.

## Common Mistakes

| Mistake                                                             | Fix                                                            |
| ------------------------------------------------------------------- | -------------------------------------------------------------- |
| Service calls `PrismaService`/`TransactionHost`/ORM client directly | Add a `*.repository.ts`, move the query there                  |
| Hand-written interface mirroring an ORM row shape                   | Import the ORM's generated model type instead                  |
| `...(value ? { column: value } : {})` for an optional Prisma filter | Pass `{ column: value }` directly — Prisma ignores `undefined` |
