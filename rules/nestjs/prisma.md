# Prisma — DB-First Workflow

Prisma models are added by running `npx prisma db pull` against the live database after applying a Flyway migration — `schema.prisma` is never hand-designed from imagination. Every project on this convention uses Flyway for the actual migration; Prisma only introspects the result. For migration file naming, the `common`/environment split, and column-level conventions (they originate at the SQL layer, not in Prisma), see `rules/nestjs/flyway.md`.

Model and field names mirror the introspected DB exactly: model name = table name, field names = column names, all snake_case — no camelCase, no `@map`/`@@map` when the name already matches (this is Prisma's default introspection output).

**No `@updatedAt`, no DB-level auto-update triggers.** `schema.prisma` is never hand-edited after `db pull`, including to add Prisma's `@updatedAt` — every `updated_at`-style column stays a plain introspected field. Repository `update*` methods pass `updated_at: new Date()` explicitly in the Prisma `data` object on every call instead of relying on client-side or DB-side automatic timestamp behavior — this keeps the written value visible at the call site and out of hidden ORM/trigger magic.

**Timestamps are timezone-aware.** Every timestamp column (`created_at`, `updated_at`, and any similar column) is declared `TIMESTAMPTZ` in the Flyway migration, never bare `TIMESTAMP` — Postgres `TIMESTAMP` silently drops timezone information, which breaks correctness once the app or its users span more than one timezone.

**`bigint`/`bigserial` columns are represented as `number` in shared contracts, DTOs, and repository input types — never as `bigint`.** A `*.mapper.ts` function converts the raw Prisma row's `bigint` fields to `number` via `Number(...)` on the way out. On the way in (`create`/`update`/`where` filters), pass the `number` straight into the Prisma client call without wrapping it in `BigInt(...)` — Prisma's generated client accepts a plain `number` for `BigInt` columns and converts it internally.

For the `where`-ignores-`undefined` gotcha and repository-layer rules in general, see `rules/nestjs/repository.md`.

## `PrismaService`

```typescript
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    const adapter = new PrismaPg({ connectionString: config.getOrThrow<string>('DATABASE_URL') });
    super({ adapter });
  }

  onModuleDestroy(): Promise<void> {
    return this.$disconnect();
  }
}
```

Requires `@prisma/adapter-pg` + `pg` (the `datasource` block in `schema.prisma` has no `url` — the connection is supplied at runtime via a driver adapter).

## Transactions Across Multiple Repositories: Two Variants

When a service call needs to write through more than one repository atomically, this developer has used two different approaches across projects — check which one the current project has actually adopted (grep for `nestjs-cls`/`@nestjs-cls/transactional-adapter-prisma` in `package.json`, or check whether repositories inject `TransactionHost` vs. `PrismaService`) before assuming either. **Default for a new project, absent a stated decision: the direct variant** — it's simpler and has no extra dependency; adopt the AsyncLocalStorage variant deliberately, the same way `forms.md`'s Signal Forms section is opted into, not assumed.

| Signal in the project | Variant |
|---|---|
| Repositories inject `PrismaService` directly; no `nestjs-cls` in `package.json` | Direct `$transaction` |
| Repositories inject `TransactionHost<TransactionalAdapterPrisma>`; `nestjs-cls` + `@nestjs-cls/transactional-adapter-prisma` in `package.json` | AsyncLocalStorage (`nestjs-cls`) |

### Variant A — Direct `$transaction` (default)

`PrismaModule` is `@Global()` and exports `PrismaService`; every repository injects `PrismaService` via constructor, per `rules/nestjs/repository.md`.

The orchestrating service (or the repository itself, for a transaction scoped to one repository's own methods) calls `this.prisma.$transaction(async (tx) => { ... })` and passes `tx` to every write inside the callback:

```typescript
async setCampuses(campuses: Omit<Campus, 'id'>[]): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    await tx.campuses.updateMany({ data: { active: false } });
    await Promise.all(campuses.map((campus) => tx.campuses.upsert({ where: { ... }, ...})));
  });
}
```

Simple, no extra dependency — the tradeoff is that a repository method called from inside a transaction and one called standalone need either two call shapes, or an explicit optional `client: Prisma.TransactionClient = this.prisma` parameter threaded through every method that might participate in a transaction.

### Variant B — AsyncLocalStorage via `nestjs-cls`

Adopted when the explicit-`client`-parameter cost of Variant A becomes real (a repository called from multiple orchestrating services, some inside a transaction and some not) — a per-request/per-call AsyncLocalStorage context propagates the active transaction client into every repository transparently, with no parameter threading.

**`PrismaModule` is no longer `@Global()` and no longer exports `PrismaService`** — it's only needed internally by the Cls transactional adapter:

```typescript
@Module({
  providers: [PrismaService],
})
export class PrismaModule {}
```

**`ClsModule` is registered once, in the root `AppModule`**, and becomes the thing that's global (its `global: true` option also makes every provider added by its plugins global — including `TransactionHost`):

```typescript
@Module({
  imports: [
    PrismaModule,
    ClsModule.forRoot({
      global: true,
      plugins: [
        new ClsPluginTransactional({
          imports: [PrismaModule],
          adapter: new TransactionalAdapterPrisma({ prismaInjectionToken: PrismaService }),
        }),
      ],
    }),
    // ...other feature modules
  ],
})
export class AppModule {}
```

**Repositories inject `TransactionHost<TransactionalAdapterPrisma>` instead of `PrismaService`**, and read through `this.txHost.tx` everywhere — no `client` parameter in any method signature:

```typescript
@Injectable()
export class ApplicationRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma>) {}

  upsert({ userId, vacancyId }: UpsertApplicationParams) {
    return this.txHost.tx.application.upsert({
      where: { user_id_vacancy_id: { user_id: userId, vacancy_id: vacancyId } },
      create: { user_id: userId, vacancy_id: vacancyId },
      update: {},
    });
  }
}
```

Outside an active transaction, `txHost.tx` resolves to the plain `PrismaService` automatically — the repository's own code is identical in both cases; nothing in it says whether it's currently inside a transaction.

**The orchestrating service uses `@Transactional()` on the method**, not a manual `$transaction(cb)` call, and injects only repositories — never `PrismaService` directly:

```typescript
@Injectable()
export class GeneralInformationService {
  constructor(
    private readonly applicationRepository: ApplicationRepository,
    private readonly careerTrackChoiceRepository: CareerTrackChoiceRepository,
  ) {}

  @Transactional()
  async saveStep(userId: number, dto: CreateGeneralInformationStepRequestDto) {
    const application = await this.applicationRepository.upsert({ userId, ...dto.application });
    await this.careerTrackChoiceRepository.replaceAll(application.id, dto.application.careerTrackChoices);
    return { applicationId: application.id };
  }
}
```

### Common Mistakes

| Mistake | Fix |
|---|---|
| Assuming either transaction variant without checking the project | Grep `package.json` for `nestjs-cls`, or check whether repositories inject `TransactionHost` vs. `PrismaService` |
| Adding `nestjs-cls` to a project that only needs one repository per transaction | Stay on Variant A — the AsyncLocalStorage variant earns its cost only once multiple repositories/call-sites genuinely need to share a transaction transparently |
| In Variant B, a repository still injecting `PrismaService` instead of `TransactionHost` | Switch the constructor injection — mixing both patterns in one project defeats the point |
| In Variant B, an orchestrating service calling `this.prisma.$transaction(cb)` manually | Use `@Transactional()` on the method instead |
| Hand-editing `schema.prisma` after `db pull`, including adding `@updatedAt` | Re-run `db pull`; pass `updated_at: new Date()` explicitly in `update*` methods instead |
| A timestamp column declared `TIMESTAMP` instead of `TIMESTAMPTZ` in the Flyway migration | Always `TIMESTAMPTZ` for any `*_at` column |
| Wrapping a `bigint`/`bigserial` value in `BigInt(...)` before passing it into a Prisma call | Pass the plain `number` — Prisma's generated client converts it internally |
