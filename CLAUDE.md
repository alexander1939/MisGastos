# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the project

```bash
# Levantar todo (postgres + redis + server + client)
docker-compose up

# Background
docker-compose up -d

# Ver logs de un servicio
docker-compose logs -f server
docker-compose logs -f client

# Detener
docker-compose down

# Reset completo (borra datos de BD)
docker-compose down -v
```

App en `http://localhost:5173`. API en `http://localhost:4000/api/health`.

No hay comandos de build, lint ni test configurados todavía — el proyecto está en fase inicial.

## Arquitectura

```
client (React/Vite :5173)
    │  proxy /api → server:4000
    │  proxy /ws  → server:4000 (WebSocket)
    ▼
server (Express :4000)
    ├── corre migraciones SQL al arrancar (server/src/index.js)
    ├── PostgreSQL  ← datos principales
    └── Redis       ← cache analíticas (TTL 5min), rate limiting, blacklist JWT
```

**Flujo de arranque del server:** `start()` en `index.js` corre `001_initial.sql` con `IF NOT EXISTS` antes de montar rutas — idempotente, seguro en cada reinicio.

**Auth:** access token JWT (15m) devuelto en body → almacenado en Zustand + localStorage. Refresh token (30d) en `httpOnly cookie`. El interceptor de Axios en `client/src/api/client.js` renueva el access token automáticamente en 401.

## Convenciones del servidor

Cada módulo en `server/src/modules/<nombre>/` sigue el patrón `routes → controller → service`:
- **routes**: define endpoints, aplica middlewares (`auth`, `validate`, `rateLimiter`)
- **controller**: maneja req/res, llama al service, pasa errores a `next(err)`
- **service**: lógica de negocio y queries SQL con `pool` de pg

Los errores de negocio se lanzan con `err.status` para que `errorHandler` los envíe con el código correcto. Las queries siempre filtran por `user_id` para aislar datos entre usuarios.

## Convenciones del cliente

- **React Query** (`@tanstack/react-query`) para todo el estado servidor — no usar useState para datos remotos
- **Zustand** solo para estado de UI (authStore, uiStore)
- `client/src/api/client.js` es el único lugar donde se configura Axios (baseURL `/api`, interceptors de auth)
- Los hooks en `src/hooks/` son wrappers de React Query sobre las funciones de `src/api/`
- Rutas protegidas con `<PrivateRoute>` en `App.jsx`

## Base de datos

Schema en `server/migrations/001_initial.sql`. Tablas principales: `users`, `cards`, `transactions`, `purchases`, `budgets`, `archive_months`, `archive_items`, `calendar_events`.

El campo `purchases.status` sigue la máquina de estados: `pendiente → pagado`, `urgente → pagado`, `pagado → archivado`. La transición se valida en `purchases.service.js` (`validTransitions`).

El cron en `server/src/jobs/urgentChecker.js` marca compras como `urgente` a las 8am diariamente cuando faltan ≤5 días para fin de mes.

Las analíticas (`/api/analytics/*`) se cachean en Redis con TTL de 5 minutos.

## Variables de entorno

El server valida al arrancar que existan `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` y `REFRESH_TOKEN_SECRET` — lanzará error si faltan.

En Docker, `DATABASE_URL` y `REDIS_URL` usan los nombres de servicio del compose (`postgres`, `redis`) como hostname, no `localhost`.

El proxy de Vite (`vite.config.js`) apunta a `http://server:4000` (nombre de servicio Docker), por lo que el frontend nunca llama directamente a `localhost:4000`.
