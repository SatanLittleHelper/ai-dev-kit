# AppModule DI Test Pattern

To test that the root `AppModule` actually wires up (env vars validated, every provider resolvable), set `process.env` in `beforeAll`, then use a dynamic `await import('./app.module')` inside the `it()` body — this guarantees the module is loaded after the env vars are set, not at file-parse time. Compile with `Test.createTestingModule({ imports: [AppModule] }).compile().resolves.toBeDefined()`. No `overrideProvider`, no `useMocker` — the point is verifying the real DI graph resolves, not stubbing pieces of it.
