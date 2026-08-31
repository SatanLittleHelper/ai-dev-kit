Для нового приложения в Nx-монорепозитории добавить переменные **в оба** файла (правило «Environment variables» —
пропуск любого из них ломает прод-деплой):

**Корневой `.env.example`** (для локальной разработки, `nx run __APP_NAME__:serve`):

```
__APP_NAME_UPPER___PORT=30NN
LOG_LEVEL=info
LOG_PRETTY=true
```

**`devops/.env.example`** (для прод-деплоя через docker-compose, плюс `environment:`-блок в
`devops/docker-compose.prod.yml` — см. `docker-compose-service-snippet.monorepo.md`):

```
__APP_NAME_UPPER___PORT=30NN
```

Плюс любые доменные переменные приложения (URL внешних сервисов, токены) — задать Joi-схему валидации в
`app.module.ts` нового приложения одновременно с добавлением в оба `.env.example`.
