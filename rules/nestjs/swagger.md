# Swagger (OpenAPI) Setup & Response Conventions

## Setup

### 1. CLI plugin (per app, `webpack.config.js`)

The `@nestjs/swagger/plugin` transformer auto-generates `@ApiProperty()` for DTO class fields and infers a response schema from a controller method's `Promise<SomeDto>` return type — **without it, DTO classes need every property decorated by hand and every endpoint needs an explicit `@ApiResponse`.**

```javascript
// apps/<app>/webpack.config.js
plugins: [
  new NxAppWebpackPlugin({
    // ...
    transformers: [{ name: '@nestjs/swagger/plugin', options: { introspectComments: true } }],
  }),
],
```

`introspectComments: true` pulls JSDoc comments above DTO fields into the generated schema's `description`.

### 2. Bootstrap (`main.ts`), gated by an env var

Swagger setup is wrapped in a config check — never mounted unconditionally in production. The gate itself (an env var like `SWAGGER_ENABLED`, a `NODE_ENV` check, whatever the project already uses) isn't the point; what matters is that `SwaggerModule.setup(...)` never runs unconditionally. If it's an env var, validate it in the app's Joi schema per your project's own env-var conventions.

```typescript
const configService = app.get(ConfigService);
if (configService.getOrThrow<boolean>('SWAGGER_ENABLED')) {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Bot Gateway API')
    .setVersion('1.0')
    .addGlobalResponse({
      status: 'default',
      description: 'Ошибка запроса',
      schema: buildEnvelopeSchema(),
    })
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, wrapResponsesInEnvelope(swaggerDocument));
}
```

`buildEnvelopeSchema` and `wrapResponsesInEnvelope` are shared helpers, not reimplemented per app:

- `buildEnvelopeSchema()` — the shape of the project's global API response envelope (e.g. `{ success, message, data, details }`), used both as the `default` global error response and as the wrapper every 2xx schema gets nested into.
- `wrapResponsesInEnvelope(document)` — post-processes the generated `OpenAPIObject`, wrapping every 2xx response's existing schema as `data` inside the envelope (`allOf: [envelopeRef, { properties: { data: originalSchema } }]`). Run it once, right before `SwaggerModule.setup`.

## Response DTOs are mandatory when Swagger is enabled

**If an app's `main.ts` wires up `SwaggerModule`, every controller method's return type must be a response DTO class — never a bare shared interface, never an inline object type.** A TS `interface`/`type` is erased at compile time; the `@nestjs/swagger/plugin` transformer can only read a `class` declaration to generate a schema. Returning `Promise<SomeInterface>` from a handler compiles fine but produces an empty/absent schema in the generated docs.

Response DTOs follow the same [DTO ↔ shared contract](dto.md) rule as request DTOs — `implements` the corresponding interface from the shared-contracts package, just for the response shape instead of the request shape:

```typescript
// dto/search-result-response.dto.ts
import { SearchResult } from '@your-org/api-interfaces';

export class SearchResultResponseDto implements SearchResult {
  id!: number;
  url!: string;
  name!: string;
  description!: string;
}
```

```typescript
@Get()
async search(@Query() { query }: SearchRequestDto): Promise<SearchResultResponseDto> {
  return this.searchService.search(query);
}
```

With the CLI plugin active, this alone is enough — no `@ApiOkResponse` needed for a plain single-object or single-array response; the plugin infers it from `Promise<SearchResultResponseDto>` / `Promise<SearchResultResponseDto[]>`.

## Paginated Responses

A paginated endpoint returns `PaginatedList<T>` (`{ items: T[], pagination: {...} }`), which the CLI plugin **cannot** infer a nested-`$ref` schema for automatically — declare it explicitly with `@ApiExtraModels` + `@ApiOkResponse` + `buildPaginatedListSchema`:

```typescript
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { PaginatedList } from '@your-org/api-interfaces';
import { buildPaginatedListSchema } from '@your-org/helpers/nest';
import { SearchResultResponseDto } from './dto/search-result-response.dto';

@Get()
@ApiExtraModels(SearchResultResponseDto)
@ApiOkResponse({
  schema: buildPaginatedListSchema({ $ref: getSchemaPath(SearchResultResponseDto) }),
})
async search(@Query() { query }: SearchRequestDto, @Query() pagination: SearchPaginationDto): Promise<PaginatedList<SearchResultResponseDto>> {
  return this.searchService.search({ query, ...pagination });
}
```

- `@ApiExtraModels(ItemDto)` registers the item DTO in `components.schemas` even though it only appears nested inside the paginated wrapper, never as a top-level response type.
- `getSchemaPath(ItemDto)` resolves to `#/components/schemas/ItemDto` — pass that as a `$ref` into `buildPaginatedListSchema`, never the DTO class itself.
- `buildPaginatedListSchema(itemSchema)` (same module as `buildEnvelopeSchema`) returns the `{ items: [...], pagination: {...} }` schema shape.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Controller method returns `Promise<SomeInterface>` | Return a response DTO class instead — interfaces are erased at compile time, the CLI plugin can't read them |
| Paginated endpoint has no explicit `@ApiOkResponse` | Add `@ApiExtraModels` + `@ApiOkResponse({ schema: buildPaginatedListSchema(...) })` — the plugin can't infer the nested wrapper |
| `buildPaginatedListSchema(SomeDto)` (class passed directly) | Pass `{ $ref: getSchemaPath(SomeDto) }`, and add `@ApiExtraModels(SomeDto)` so the `$ref` resolves |
| Swagger mounted unconditionally | Gate `SwaggerModule.setup(...)` behind a config check (env var, `NODE_ENV`, etc.) |
| Reimplementing the envelope/pagination schema helpers per app | Import the shared `buildEnvelopeSchema`/`buildPaginatedListSchema`/`wrapResponsesInEnvelope` helpers from wherever the project keeps them |
