# Repository Layer — Code Examples

Referenced from `rules/nestjs/repository.md`. Each section below matches a rule from that file.

## Repository owns the query; service orchestrates

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
// extends the shared PrismaTransactionalRepository base class — see "Shared base class" below for why
@Injectable()
export class UsersRepository extends PrismaTransactionalRepository {
  async getByEmail(email: string) {
    const user = await this.client.user.findUnique({ where: { email } });
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

## Shared base class for transactional client access

```typescript
// common/prisma/prisma-transactional.repository.ts — defined once
@Injectable()
export abstract class PrismaTransactionalRepository {
  @Inject(TransactionHost)
  private readonly txHost!: TransactionHost<TransactionalAdapterPrisma<PrismaService>>;

  protected get client(): PrismaTransactionalClient<PrismaService> {
    return this.txHost.tx;
  }
}

// every repository — no constructor, no client getter of its own
@Injectable()
export class SomeRepository extends PrismaTransactionalRepository {
  someMethod() {
    return this.client.someTable.findMany();
  }
}
```

## Repository write-params derived from a shared request contract

```typescript
// shared contracts package
export interface CreateApplicationRequest {
  vacancyId: number;
  careerTrackChoices: CreateCareerTrackChoiceRequest[];
  generalCommentOnCareerPaths?: string;
}

// repository params — careerTrackChoices is written by CareerTrackChoiceRepository, not this upsert;
// userId comes from the auth context, never from the request body
import type { CreateApplicationRequest } from '<shared-contracts-package>';

export interface UpsertApplicationParams extends Omit<CreateApplicationRequest, 'careerTrackChoices'> {
  userId: number;
}
```

## Prisma: Optional Filters and `undefined`

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
