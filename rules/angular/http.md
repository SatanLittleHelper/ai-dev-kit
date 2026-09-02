# HTTP: `HttpParams`, Headers, `FormData`

## `HttpParams` and `undefined`

Angular's `HttpParams` (including via `fromObject`) does **not** ignore `undefined` values — it serializes them to the literal string `"undefined"` (verified against the actual `HttpParams` class in `@angular/common`). Passing an object with optional/conditional fields straight into `params` silently produces a query string like `?filter=undefined` instead of omitting the parameter. Build optional/conditional query parameters through a small helper that filters out `undefined` entries before constructing `HttpParams`, instead of passing the raw object in directly.

Mirror image on the backend: Prisma's `where` *does* ignore `undefined` filters (see `rules/nestjs/repository.md`) — don't carry the "always guard `undefined`" habit from this file over to Prisma queries, the two ORMs/APIs behave oppositely here.

## HTTP Headers and `FormData`: Centralize in the API-Service Layer

**Custom HTTP headers go through an `HttpInterceptor`, never set manually in individual services.** Keep every custom header name in one shared enum/constant, not scattered string literals across services — a header renamed in one place should not require hunting through every service that sets it.

**`FormData` for multipart requests is assembled inside the `*.api.service.ts` method itself, never by the calling component.** The API method accepts a typed payload object (mirroring the shared request contract) and builds `FormData` internally before the `HttpClient` call. Passing a pre-built `FormData` into an API method loses the type guarantee that the request body actually matches the expected contract — the component could put anything into it.

```typescript
// ❌ Component builds FormData itself — no type guarantee on the body
const formData = new FormData();
formData.append('comment', this.comment());
this.api.addComment(formData);

// ✅ API service accepts a typed payload, builds FormData internally
addComment(payload: AddCommentRequest): Observable<void> {
  const formData = this.formDataService.build(payload);
  return this.http.post<void>(url, formData);
}
```

**Migration debt is normal — expect exceptions.** When adopting this pattern in an existing codebase, some call sites will predate it and still pass a pre-built `FormData` in from the component. Don't treat that as "an alternative style" — mark it explicitly as tech debt (a `// TODO` at each pre-existing call site) and track the concrete list of not-yet-migrated methods/components, so the debt doesn't get silently normalized into "how it's sometimes done here."

## Known Gotchas

### Testing: jsdom ↔ Native `fetch` Interop Gotcha

jsdom doesn't implement the Fetch API, but it does replace the global `Blob`/`File` with its own DOM classes — a *different* class than the one the test runner's native `fetch`/`Response` (e.g. undici under Node/Vitest) expects. A test that round-trips a `Blob` through `new Response(blob)` / `response.blob()` sees the body's `Content-Type` collapse to `text/plain;charset=utf-8` instead of preserving the original blob's `type`, because `Response` no longer recognizes the jsdom `Blob` as `instanceof` its own `Blob`. Fix per-file, not by reverting the whole app to a non-DOM environment: add a per-file environment override (e.g. Vitest's `// @vitest-environment node` as the file's first line) on just the spec file that hits this, so the rest of the suite keeps jsdom.
