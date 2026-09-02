# Flyway Migrations

Every project on this convention uses Flyway as the actual source of truth for the DB schema — plain versioned SQL files, not Prisma Migrate. Prisma only introspects the result afterward (`npx prisma db pull`, see `rules/nestjs/prisma.md`); `schema.prisma` is never the place a schema change starts.

## File Naming

- **Versioned migration:** `V<N>__<description>.sql` — `N` a plain sequential integer (no leading zeros, no date-based numbering), `<description>` snake_case, e.g. `V17__create_campuses.sql`, `V21__add_incident_files_filename.sql`. Never reuse or renumber an already-applied `V<N>` — Flyway checksums applied versions and refuses to re-run a changed one.
- **Repeatable migration:** `R__<description>.sql` — re-applied by Flyway whenever its checksum changes (a view, a function, seed/reference data that's fully replaced each time, not incrementally altered). Rare compared to versioned migrations; reach for it only when the content is genuinely idempotent-on-reapply.
- One logical change per migration file — a new table, an added column, a data backfill are separate `V<N>` files, not bundled into one.

## Directory Split: `common/` vs. Environment-Specific

Migrations live in two locations, both fed to Flyway via `FLYWAY_LOCATIONS` (`filesystem:/flyway/sql/common,filesystem:/flyway/sql/<env>`):

- **`common/`** — schema migrations that apply identically in every environment (table/column DDL, indexes, constraints). The vast majority of migrations belong here.
- **An environment-specific folder** (e.g. `dev/`, `uat/`) — environment-only seed data or config rows, never schema DDL. Keep it near-empty; a schema change that differs by environment is a design smell, not a normal case.

## Column Conventions

Migrations are themselves the schema's source of truth, so the column-level rules other files assume start here, not in Prisma:

- **Primary key:** `BIGSERIAL PRIMARY KEY` (or `BIGINT GENERATED ALWAYS AS IDENTITY`) — matches `rules/nestjs/prisma.md`'s `bigint`/`bigserial` → `number` mapping.
- **Column names:** snake_case, matching what `rules/nestjs/prisma.md` expects Prisma to introspect verbatim (no naming translation layer).
- **Timestamps:** `TIMESTAMPTZ NOT NULL DEFAULT now()` for `created_at`/`updated_at`/any similar column — never bare `TIMESTAMP` (see `rules/nestjs/prisma.md` for why). `DEFAULT now()` covers `created_at`; `updated_at` still gets set explicitly on every `update*` call at the application layer (Prisma has no `@updatedAt` in this workflow) — the migration-level default only covers the row's initial insert.
- **Foreign keys:** explicit `REFERENCES <table> (id)` with an explicit `ON DELETE CASCADE`/`ON DELETE RESTRICT` — never left at the (implicit) default, which silently means `NO ACTION`.
- **Required vs. optional:** `NOT NULL` stated explicitly on every column that is actually required — don't rely on the column simply not having a default.

```sql
CREATE TABLE application (
    id                 BIGSERIAL PRIMARY KEY,
    user_id            BIGINT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    vacancy_id         BIGINT NOT NULL REFERENCES competition_vacancy (id) ON DELETE RESTRICT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, vacancy_id)
);
```

## Applying Migrations

Flyway runs as its own container/service against the local Postgres instance, wired through the project's own local-infra command (a `make local-up`-style target, or equivalent) — never run `flyway migrate` by hand outside that wiring, and never apply a schema change by connecting to the DB directly and running DDL ad hoc. After the migration is applied, run `npx prisma db pull` (+ regenerate the client) to bring `schema.prisma`/the Prisma client in sync — a Flyway migration without the matching `db pull` leaves the two out of sync silently.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Editing an already-applied `V<N>__*.sql` file to fix a mistake | Write a new `V<N+1>__*.sql` that corrects it — Flyway checksums applied migrations |
| Date-based or zero-padded migration numbers (`V2026_09_02__...`, `V001__...`) | Plain sequential integer, no padding: `V17__...` |
| Schema DDL placed in the environment-specific folder instead of `common/` | Schema changes belong in `common/` — the env-specific folder is for environment-only data |
| A foreign key with no explicit `ON DELETE` behavior | State `ON DELETE CASCADE`/`RESTRICT` explicitly |
| `TIMESTAMP` instead of `TIMESTAMPTZ` for a new timestamp column | Always `TIMESTAMPTZ` |
| Running a schema change directly against the DB instead of through a new migration file | Every schema change is a new `V<N>__*.sql`, applied through Flyway — never ad hoc DDL |
| Forgetting `npx prisma db pull` after a migration lands | Prisma's schema/client silently drift from the real DB until re-pulled |
