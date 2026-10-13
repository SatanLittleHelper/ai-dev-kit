# Services: `@Service()` Instead of `@Injectable()`

Version-gated — check `@angular/core` in the project's `package.json` first.

- **Angular 22+:** every service class is declared with `@Service()` from `@angular/core`. `@Injectable()` is not used for services.
- **Below Angular 22:** `@Service()` does not exist — keep `@Injectable({ providedIn: 'root' })`. Do not mix the two styles in one project; migrate together with the Angular upgrade.

`@Service()` is root-scoped and auto-provided by default, so there is no `providedIn: 'root'` to write.

| Need | Declaration |
|---|---|
| Root singleton (the default) | `@Service()` |
| Not auto-provided — scoped via `providers` of a component, route, or `bootstrapApplication` | `@Service({ autoProvided: false })` |
| Custom factory | `@Service({ factory: () => new Foo() })` |

```ts
@Service()
export class UserService {
  private readonly http = inject(HttpClient);

  getUser(id: string): Observable<User> {
    return this.http.get<User>(`/api/user/${id}`);
  }
}
```

Dependencies still come from `inject()` only — see `di.md`.

Scope: Angular services only. NestJS providers keep `@Injectable()`.

## Common Mistakes

| Mistake | Fix |
|---|---|
| `@Injectable({ providedIn: 'root' })` on a new service in Angular 22+ | `@Service()` |
| `@Injectable()` + manual `providers: [Foo]` for a feature-scoped service in Angular 22+ | `@Service({ autoProvided: false })` + `providers: [Foo]` |
| `@Service()` in a project below Angular 22 | `@Injectable({ providedIn: 'root' })` |
| `@Service()` on a NestJS provider | `@Injectable()` — `@Service` is an Angular API |
