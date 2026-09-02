<!--
Вставить этот раздел в CLAUDE.md и/или AGENTS.md целевого репозитория (секция ## или подсекция —
по месту, рядом с другими архитектурными конвенциями). Заменить __APP_NAME__ и адаптировать
пути под структуру целевого репозитория (монорепо apps/__APP_NAME__/... или standalone src/...).
-->

## NestJS — базовые конвенции приложения

**Логирование:** `nestjs-pino` через `AppLoggerModule.forRootAsync` (см. `common/logger/app-logger.module.ts` или
`libs/nest-logger`, если это монорепозиторий с несколькими Nest-приложениями). `main.ts` обязан вызывать
`NestFactory.create(AppModule, { bufferLogs: true })` и `app.useLogger(app.get(Logger))` (импорт `Logger` из
`nestjs-pino`). Ошибки в `catch`-блоках логировать через `PinoLogger` (`@InjectPinoLogger` в конструкторе), не через
`@nestjs/common` `Logger`: `this.logger.error(err, 'Человекочитаемый текст на русском')` — raw error первым
аргументом, сообщение вторым. `PinoLogger` не имеет `.log()` — уровни `trace/debug/info/warn/error/fatal`.

**Единый формат API-ответа:** глобальные `ApiExceptionFilter` (`APP_FILTER`) + `ApiResponseInterceptor`
(`APP_INTERCEPTOR`), регистрируются в провайдерах `app.module.ts`, не через `app.useGlobalFilters()`/
`useGlobalInterceptors()` в `main.ts`. Контракт:

```ts
type ApiResponse<T = unknown> = {
  success: boolean;
  message: string | null;
  data: T | null;
  details: ApiErrorDetail[] | Record<string, unknown> | null;
};
```

Успех — `{ success: true, message, data, details: null }`; ошибка — `{ success: false, message, data: null, details }`.
Контроллер возвращает либо сырые данные (оборачиваются автоматически), либо `{ message, data }` для явного
сообщения (интерцептор распознаёт оба поля дак-тайпингом). Для мутирующих методов (`POST/PUT/PATCH/DELETE`) без
явного `message` подставляется дефолтная русская фраза («Успешно создано»/«Успешно обновлено»/«Успешно удалено»).

**ESLint:** `eslint.config.mjs` расширяет корневой `eslint.base.config.mjs` (ESLint 9 flat config). Pre-commit hook
(`lint-staged`) прогоняет `eslint --fix` через конфиг конкретного приложения, если он существует, иначе — базовый.

**Тесты:** Vitest, `globals: true`, `environment: 'node'`, `coverage.provider: 'v8'`. Описания тестов и имена кейсов —
на русском. `*.spec.ts` живёт в dot-notation подпапке с локальным `index.ts` барелем:
`some-service/some-service.ts` + `some-service/some-service.spec.ts` + `some-service/index.ts`. `*.api.service.ts` и
`*.repository.ts` тестами не покрываются.

**Git hooks:** `husky` — `pre-commit` прогоняет `lint-staged`, `pre-push` прогоняет полный прогон тестов с покрытием
(`nx affected -t test-cli --coverage` в монорепозитории, `vitest run --coverage` в standalone-проекте).

**Деплой:** многоступенчатый `Dockerfile` (build stage на `node:24-alpine` + `npx nest build`/`npx nx build`, рантайм
stage копирует только `node_modules` и `dist`). `docker-compose.yml` + `Makefile` с таргетами `local-up`/`local-down`/
`local-clean` (и `prod-*` в монорепозитории). Каждая новая переменная окружения обязана попасть **в три места**:
Joi-схема валидации в `ConfigModule.forRoot()` приложения, корневой `.env.example`, `devops/.env.example` +
`environment:`-блок сервиса в `docker-compose.prod.yml` — пропуск любого из них ломает прод-деплой.

**Коммиты — без упоминания Claude:** сообщения коммитов не должны содержать `Co-Authored-By: Claude`, ссылки на
`claude.ai/code` или любое иное упоминание того, что изменения сделаны с помощью Claude/AI-ассистента. Коммит —
обычный, как будто его написал человек-разработчик.
