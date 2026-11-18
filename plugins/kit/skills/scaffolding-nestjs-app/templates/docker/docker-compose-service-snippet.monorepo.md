Для нового приложения в Nx-монорепозитории **не создавать** отдельный `docker-compose.yml` — добавить один
сервис-блок в существующий `devops/docker-compose.prod.yml` (и при необходимости в `docker-compose.local.yml`,
если у сервиса есть публичный роут через Traefik уже на локальном окружении), по образцу соседних сервисов:

```yaml
services:
  __APP_NAME__:
    build:
      context: ..
      dockerfile: devops/Dockerfile
      args:
        APP_NAME: __APP_NAME__
    deploy:
      resources:
        limits:
          memory: 512m
        reservations:
          memory: 256m
    environment:
      NODE_ENV: production
      LOG_LEVEL: ${__APP_NAME_UPPER__LOG_LEVEL:-debug}
      LOG_PRETTY: ${__APP_NAME_UPPER__LOG_PRETTY:-true}
      PORT: ${__APP_NAME_UPPER__PORT}
    restart: unless-stopped
    networks:
      - traefik_network
      - internal
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.__APP_NAME__.rule=Host(`${HOSTNAME}`) && PathPrefix(`/__APP_NAME__/api`)"
      - "traefik.http.routers.__APP_NAME__.entrypoints=websecure"
      - "traefik.http.routers.__APP_NAME__.tls=true"
      - "traefik.http.routers.__APP_NAME__.service=__APP_NAME__"
      - "traefik.http.services.__APP_NAME__.loadbalancer.server.port=${__APP_NAME_UPPER__PORT}"
      - "traefik.http.services.__APP_NAME__.loadbalancer.passhostheader=true"
      - "traefik.docker.network=chatbot-network"
      # Роут `/{service_name}/api` требует middleware stripPrefix — см. существующие сервисы для точного
      # имени middleware, зарегистрированного в traefik/dynamic-prod.
```

Также прописать переменные сервиса (`__APP_NAME_UPPER__PORT`, `__APP_NAME_UPPER__LOG_LEVEL`, `__APP_NAME_UPPER__LOG_PRETTY`
и любые доменные env) в корневом `.env.example` и в `devops/.env.example` — см. правило «Environment variables» в
CLAUDE.md/AGENTS.md (обязательны все три места: Joi-схема приложения, корневой `.env.example`, `devops/.env.example` +
`environment:`-блок в `docker-compose.prod.yml`).
