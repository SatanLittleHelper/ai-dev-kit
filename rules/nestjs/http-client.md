# External HTTP Calls

**One outbound call to one external API** → a dedicated `*.api.service.ts`. `async`, returns `Promise<T>`, uses `HttpService` (Axios-based):

```typescript
// with error handling — map MUST be inside the same pipe as catchError
return firstValueFrom(
  this.http.post<T>(url, body).pipe(
    map(({ data }) => data),
    catchError((err) => { throw new InternalServerErrorException(...); }),
  ),
);

// without error handling — response.data after await is fine ONLY when there's no catchError
const response = await firstValueFrom(this.http.post<T>(url, body));
return response.data;
```

Never mix the two shapes: if `catchError` is in the pipe, data must also come from `map` inside that same pipe — `response.data` after `await` when `catchError` is already present silently swallows the mapped value.

**A whole external system** (not just one call) → its own `<domain>-http/` module: `*.token.ts` for injection tokens, `*.types.ts` for `XxxHttpConfig`/`XxxHttpModuleAsyncOptions`, a `static forRootAsync(options)` returning a `DynamicModule` (config provider + `HttpService` provider, auth via an Axios request interceptor built inside `useFactory`). Mark it `global: true`, call `forRootAsync` exactly once in the root app module — every other module just `@Inject()`s the token, never re-imports or re-configures it.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Outbound API call inlined in an orchestrating service | Extract to `*.api.service.ts` |
| `catchError` in pipe but `response.data` used after `await` | Use `map(({ data }) => data)` inside the same pipe |
