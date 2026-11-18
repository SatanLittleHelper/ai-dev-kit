// НЕ создавать новый Dockerfile для нового приложения в Nx-монорепозитории.
// Проверить, есть ли уже общий параметризованный devops/Dockerfile (принимает ARG APP_NAME и
// собирает конкретное приложение через `npx nx build $APP_NAME`). Если есть — переиспользовать
// его без изменений, просто передав APP_NAME для нового сервиса в docker-compose.
//
// Референс (пример из chatbot-platform, devops/Dockerfile):
//
// # ---------- BUILD STAGE ----------
// FROM chatbot-platform-deps:local AS builder
// WORKDIR /app
// ARG APP_NAME
// COPY apps ./apps
// COPY libs ./libs
// RUN npx nx build $APP_NAME --configuration=production
//
// # ---------- RUNTIME STAGE ----------
// FROM node:24-alpine
// WORKDIR /app
// ENV NODE_ENV=production
// ARG APP_NAME
// COPY --from=builder /app/node_modules ./node_modules
// COPY --from=builder /app/dist/apps/$APP_NAME ./dist
// ARG EXPOSE_PORT=3000
// EXPOSE ${EXPOSE_PORT}
// CMD ["node", "dist/main.js"]
//
// Если общего devops/*-Dockerfile ещё нет (это первое приложение в монорепозитории) — создать его
// по этому образцу, плюс отдельный лёгкий Dockerfile.deps-образ (npm ci один раз, общий для всех
// приложений), если сборка нескольких приложений будет переиспользовать node_modules.
