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

## Check and change in one conditional write

```typescript
// ❌ Read, check, then write: parallel requests all read attempts = 2 and all pass the limit
async confirm(applicationId: number) {
  const record = await this.repository.getByApplicationId(applicationId);
  if (record.attempts >= MAX_ATTEMPTS) throw new HttpException('Limit reached', 429);
  await this.externalApi.check(record.salt); // slow call
  await this.repository.incrementAttempts(applicationId);
}

// ✅ The limit and the increment are one statement; the slow call runs only after it succeeded
@Injectable()
export class SignatureCodeRepository extends PrismaTransactionalRepository {
  async reserveAttempt(applicationId: number): Promise<string> {
    try {
      const { salt } = await this.client.signatureCode.update({
        where: { applicationId, attempts: { lt: MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
        select: { salt: true },
      });

      return salt;
    } catch (err) {
      if (!isPrismaError(err, PRISMA_RECORD_NOT_FOUND)) throw err;

      throw await this.toReserveError(applicationId); // reads the row only to pick 400 / 429 / 409
    }
  }
}
```
