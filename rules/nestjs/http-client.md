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

**Only the HTTP client is global, not the domain module.** The sibling domain module (repository, `*.api.service.ts`, domain services) stays a plain non-global `@Module`; its services `@Inject()` the global token without importing anything. A consumer that only needs the domain module imports the plain class with no arguments — Nest deduplicates it into one app-wide singleton, so cron jobs and other domain singletons still run exactly once. Never make a feature module call `forRootAsync` itself: that creates a second Axios instance/interceptor and duplicates secret handling.

**The HTTP module never touches `ConfigService` or `ConfigModule`.** Everything it needs (base URL, credentials, timeout, flags such as "allow insecure TLS outside production") is a field of `XxxHttpConfig`. The root `AppModule` is the only place that injects `ConfigService`: its `useFactory` reads the env keys and builds the config object. Inside the module, `HttpModule.registerAsync` reuses `options.imports`/`options.inject`/`options.useFactory` and only maps the config to Axios options, so there is a single source of configuration and no dependency on env key names.

```typescript
// xxx-http.types.ts
export interface XxxHttpConfig {
  baseUrl: string;
  token: string;
  allowInsecure: boolean;
}

// xxx-http.module.ts
HttpModule.registerAsync({
  imports: options.imports,
  inject: options.inject,
  useFactory: async (...args: T) => {
    const { baseUrl, allowInsecure } = await options.useFactory(...args);

    return {
      baseURL: `${baseUrl}/api`,
      httpsAgent: allowInsecure ? new https.Agent({ rejectUnauthorized: false }) : undefined,
      timeout: 10 * 1000,
    };
  },
});

// app.module.ts — the only place with ConfigService
XxxHttpModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService): XxxHttpConfig => ({
    baseUrl: config.getOrThrow<string>('XXX_URL'),
    token: config.getOrThrow<string>('XXX_TOKEN'),
    allowInsecure: config.get<string>('NODE_ENV') !== 'production',
  }),
}),
```

Reference implementation: `MailPublisherHttpModule` in `bot-publisher`.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Outbound API call inlined in an orchestrating service | Extract to `*.api.service.ts` |
| `catchError` in pipe but `response.data` used after `await` | Use `map(({ data }) => data)` inside the same pipe |
| An `<domain>-http` module imports `ConfigModule`/injects `ConfigService` and reads env keys itself | Put `baseUrl`, credentials and flags into `XxxHttpConfig`; build it from `ConfigService` only in the root `AppModule`'s `useFactory` |
