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

No hay comandos de build, lint ni test configurados todavía.

## Arquitectura

```
client (React/Vite :5173)
    │  proxy /api → server:4000
    │  proxy /ws  → server:4000 (WebSocket)
    ▼
server (Express :4000)
    ├── corre migraciones SQL al arrancar (server/src/index.js)
    ├── PostgreSQL  ← datos principales
    └── Redis       ← cache analíticas (TTL 30s), rate limiting, blacklist JWT
```

**Flujo de arranque del server:** `start()` en `index.js` lee todos los archivos `.sql` de `server/migrations/` en orden alfabético y los ejecuta con `IF NOT EXISTS` — idempotente, seguro en cada reinicio.

Migraciones actuales:
- `001_initial.sql` — schema base
- `002_transfers.sql` — tabla de transferencias entre tarjetas
- `003_pay_month.sql` — columna `pay_month` en purchases

**Auth:** access token JWT (15m) devuelto en body → almacenado en Zustand + localStorage. Refresh token (30d) en `httpOnly cookie`. El interceptor de Axios en `client/src/api/client.js` renueva el access token automáticamente en 401.

## Convenciones del servidor

Cada módulo en `server/src/modules/<nombre>/` sigue el patrón `routes → controller → service`:
- **routes**: define endpoints, aplica middlewares (`auth`, `validate`, `rateLimiter`)
- **controller**: maneja req/res, llama al service, pasa errores a `next(err)`
- **service**: lógica de negocio y queries SQL con `pool` de pg

Los errores de negocio se lanzan con `err.status` para que `errorHandler` los envíe con el código correcto. Las queries siempre filtran por `user_id` para aislar datos entre usuarios.

**Invalidación de caché Redis:** los services de `transactions` y `purchases` llaman a funciones de invalidación después de cada mutación para que las analíticas sean inmediatas. TTL del caché es 30 segundos.

## Convenciones del cliente

- **React Query** (`@tanstack/react-query`) para todo el estado servidor — no usar useState para datos remotos
- **Zustand** solo para estado de UI/auth (`authStore`, `uiStore`)
- `client/src/api/client.js` es el único lugar donde se configura Axios (baseURL `/api`, interceptors de auth)
- Los hooks en `src/hooks/` son wrappers de React Query sobre las funciones de `src/api/`
- Rutas protegidas con `<PrivateRoute>` en `App.jsx`
- Utilidad de ciclo de cobro en `client/src/utils/billingHelpers.js` — usar `getPayMonth()` y `effectivePayMonth()` para calcular a qué mes pertenece una compra

## Base de datos

Schema base en `server/migrations/001_initial.sql`. Tablas: `users`, `cards`, `transactions`, `purchases`, `budgets`, `archive_months`, `archive_items`, `calendar_events`, `transfers`.

**purchases.pay_month** (`VARCHAR(7)`, nullable): mes al que pertenece la compra en formato `YYYY-MM`. Si es null, se calcula dinámicamente con `getPayMonth()` según `cards.cut_day`. Permite override manual del ciclo de cobro.

**purchases.status** sigue la máquina de estados: `pendiente → pagado`, `urgente → pagado`, `pagado → archivado`. La transición se valida en `purchases.service.js` (`validTransitions`).

**transfers**: registra movimientos entre tarjetas del usuario. Campos: `from_card_id`, `to_card_id`, `amount`, `description`, `date`.

El cron en `server/src/jobs/urgentChecker.js` marca compras como `urgente` a las 8am diariamente cuando faltan ≤5 días para fin de mes.

Las analíticas (`/api/analytics/*`) incluyen tanto `transactions` como `purchases` en todos los cálculos de gastos. Se cachean en Redis con TTL de 30 segundos y se invalidan explícitamente en cada mutación.

## Lógica de ciclo de cobro (billing cycle)

Función en `client/src/utils/billingHelpers.js`:

```
si purchase.date <= card.cut_day del mes de compra
  → pertenece al ciclo de ESE mes → pagar en pay_day de ese mes
sino
  → pertenece al ciclo del MES SIGUIENTE → pagar en pay_day del mes siguiente
```

`effectivePayMonth(purchase, card)` devuelve `purchase.pay_month` si existe (override manual), sino calcula con la lógica anterior.

Esta lógica se usa consistentemente en:
- `Purchases.jsx` — columna "Pagar en" y resumen por mes
- `Calendar.jsx` — eventos virtuales de tarjeta y monto mostrado en "Pagar: [tarjeta]"
- `Dashboard.jsx` — sección "Lo que debes pagar este mes por tarjeta"

## Módulos del servidor

```
/api/auth          registro, login, logout, refresh, perfil (GET/PUT/DELETE)
/api/transactions  CRUD + import CSV + summary
/api/cards         CRUD + summary (deuda y % de uso)
/api/purchases     CRUD + stats + updateStatus
/api/budgets       upsert masivo + status (% gastado)
/api/archive       historial + close-month
/api/analytics     byCategory, byMethod, trend, cardsDebt, monthlyComparison
/api/calendar      CRUD + upcoming + toggleDone
/api/transfers     CRUD (transferencias entre tarjetas)
```

## Páginas del cliente

```
/              Dashboard — stats del mes, gráficas, actividad de la semana
/transactions  Movimientos — gastos e ingresos diarios
/cards         Tarjetas — crédito, débito, transporte
/purchases     Compras — con ciclo de cobro, resumen por mes de pago
/transfers     Transferencias — entre tarjetas o al banco
/budgets       Presupuestos — límites por categoría
/archive       Historial — cierre mensual
/calendar      Calendario — grid mensual con eventos, compras y fechas de tarjetas
/profile       Perfil — editar nombre, salario, contraseña
```

## Variables de entorno

El server valida al arrancar que existan `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` y `REFRESH_TOKEN_SECRET` — lanzará error si faltan.

En Docker, `DATABASE_URL` y `REDIS_URL` usan los nombres de servicio del compose (`postgres`, `redis`) como hostname, no `localhost`.

El proxy de Vite (`vite.config.js`) apunta a `http://server:4000` (nombre de servicio Docker), por lo que el frontend nunca llama directamente a `localhost:4000`.
