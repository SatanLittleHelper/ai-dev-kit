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

## Response DTOs When Swagger Is Enabled

If the app's `main.ts` wires up `SwaggerModule.setup(...)` (whatever config flag gates it), this rule extends to responses, not just requests: **every controller method's return type must be a response DTO class**, following the same `implements SomeInterface` pattern as above. A bare interface or inline type is erased at compile time — the `@nestjs/swagger/plugin` CLI transformer that generates the OpenAPI schema can only introspect an actual `class` declaration, so `Promise<SomeInterface>` silently produces an empty schema in the docs.

See `swagger.md` for the full bootstrap setup, a plain response DTO example, and the paginated-response pattern.

## Common Mistakes

| Mistake | Fix |
|---|---|
| DTO fields typed ad hoc, no shared interface | `implements` the shared contract interface |
| Controller returns `Promise<SomeInterface>` in a Swagger-enabled app | Return a response DTO **class** that `implements` the interface — see `swagger.md` |
