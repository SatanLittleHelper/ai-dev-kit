# DTOs Implement Shared Interfaces

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

A non-null assertion (`!`) is acceptable here — and only here — to suppress TS errors on fields the `ValidationPipe` initializes at runtime (see `rules/base/naming.md` for the general non-null-assertion ban this is the one exception to).

## Common Mistakes

| Mistake | Fix |
|---|---|
| DTO fields typed ad hoc, no shared interface | `implements` the shared contract interface |
