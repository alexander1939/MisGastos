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

**Auth:** access token JWT (15m) devuelto en body → almacenado en Zustand + localStorage. Refresh token (30d) en `httpOnly cookie`. El interceptor de Axios en `client/src/api/client.js` renueva el access token automáticamente en 401. Al hacer login, se llama `queryClient.clear()` para forzar refetch de todos los datos con el nuevo token.

## Convenciones del servidor

Cada módulo en `server/src/modules/<nombre>/` sigue el patrón `routes → controller → service`:
- **routes**: define endpoints, aplica middlewares (`auth`, `validate`, `rateLimiter`)
- **controller**: maneja req/res, llama al service, pasa errores a `next(err)`
- **service**: lógica de negocio y queries SQL con `pool` de pg

Los errores de negocio se lanzan con `err.status` para que `errorHandler` los envíe con el código correcto. Las queries siempre filtran por `user_id` para aislar datos entre usuarios.

**Invalidación de caché Redis:** los services de `transactions` y `purchases` llaman a funciones de invalidación después de cada mutación. Se invalidan las keys `:mes`, `:semana` y `:all` de analytics. TTL del caché es 30 segundos.

## Convenciones del cliente

- **React Query** (`@tanstack/react-query`) para todo el estado servidor — no usar useState para datos remotos
- **Zustand** solo para estado de UI/auth (`authStore`, `uiStore`)
- `client/src/api/client.js` es el único lugar donde se configura Axios (baseURL `/api`, interceptors de auth)
- Los hooks en `src/hooks/` son wrappers de React Query sobre las funciones de `src/api/`
- Rutas protegidas con `<PrivateRoute>` en `App.jsx`
- Utilidad de ciclo de cobro en `client/src/utils/billingHelpers.js` — usar `getPayMonth()` y `effectivePayMonth()` para calcular a qué mes pertenece una compra
- **IMPORTANTE:** Todos los componentes que usan `['purchases-pending']` como queryKey deben usar `queryFn: () => purchasesApi.list({ limit: 500 })` (sin `.then(r => r.data)`) y acceder a los datos con `result?.data || []`. Si se mezclan queryFns para la misma key, React Query servirá datos en formato incorrecto desde caché.

## Base de datos

Schema base en `server/migrations/001_initial.sql`. Tablas: `users`, `cards`, `transactions`, `purchases`, `budgets`, `archive_months`, `archive_items`, `calendar_events`, `transfers`.

**purchases.pay_month** (`VARCHAR(7)`, nullable): mes al que pertenece la compra en formato `YYYY-MM`. Si es null, se calcula dinámicamente con `getPayMonth()` según `cards.cut_day`. Permite override manual del ciclo de cobro.

**purchases.status** sigue la máquina de estados: `pendiente → pagado`, `urgente → pagado`, `pagado → archivado`. La transición se valida en `purchases.service.js` (`validTransitions`).

**transactions.method**: en ingresos almacena la cuenta destino (nombre de tarjeta de débito o "Efectivo físico"). En gastos almacena el método de pago libre (efectivo, débito, etc.).

**transfers**: registra movimientos entre tarjetas del usuario. Campos: `from_card_id`, `to_card_id`, `amount`, `description`, `date`. Se incluyen en el cálculo de saldo por cuenta junto con las transactions.

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
- `Calendar.jsx` — compras mostradas en el mes de pago (no fecha de compra); compras de otro mes aparecen en el pay_day de la tarjeta
- `Dashboard.jsx` — sección "Lo que debes pagar este mes por tarjeta"
- `analytics.service.js` — `byCategory` con `period: 'mes'` filtra por effective pay_month, no por fecha de compra
- `Cards.jsx` — deuda por tarjeta del ciclo actual

## Módulos del servidor

```
/api/auth               registro, login, logout, refresh, perfil (GET/PUT/DELETE)
/api/transactions       CRUD + import CSV + summary + account-balance
/api/cards              CRUD + summary (deuda y % de uso)
/api/purchases          CRUD + stats + updateStatus + pay-card
/api/budgets            upsert masivo + status (% gastado)
/api/archive            historial + close-month
/api/analytics          byCategory, byMethod, trend, cardsDebt, monthlyComparison
/api/calendar           CRUD + upcoming + toggleDone
/api/transfers          CRUD (transferencias entre tarjetas)
```

### Endpoints clave

**POST /api/purchases/pay-card** — paga un ciclo completo de tarjeta de crédito:
- Marca todas las compras `pendiente`/`urgente` con `effective_pay_month = month` como `pagado`
- Registra una transferencia en `transfers` (from_card_débito → credit_card) — **NO crea transaction de gasto**; el balance de la cuenta débito se maneja vía transfers
- Body: `{ cardId, month, fromCardName }`
- **IMPORTANTE:** No usar `category = 'Pago tarjeta'` en transactions. Los analytics excluyen esa categoría para evitar doble conteo con las purchases.

**GET /api/transactions/account-balance** — saldo por cuenta (tarjetas débito + efectivo):
- Combina `transactions` (ingresos/gastos por method) + `transfers` (recibido/enviado por card)
- Saldo = ingresos + recibido - gastos - enviado

**GET /api/analytics/by-category?period=mes** — gastos del mes actual por categoría:
- Para purchases: filtra por `effective_pay_month` (COALESCE de pay_month o cálculo por cut_day), no por fecha de compra
- Excluye transactions con `category = 'Pago tarjeta'` (las purchases ya se cuentan)

**Analytics en general** — `trend`, `byCategory`, `monthlyComparison` excluyen `category = 'Pago tarjeta'` de transactions para evitar doble conteo. Las transferencias entre tarjetas (tabla `transfers`) tampoco se incluyen — mover dinero entre cuentas propias no es ingreso ni gasto real.

## Páginas del cliente

```
/              Dashboard — stats del mes, gráficas, actividad de la semana
/transactions  Movimientos — ingresos/gastos + gráfica de saldo por cuenta débito
/cards         Tarjetas — crédito (con botón Pagar ciclo), débito, transporte
/purchases     Compras — con ciclo de cobro, resumen por mes de pago
/transfers     Transferencias — entre tarjetas o al banco
/calendar      Calendario — grid mensual con eventos, compras por mes de pago
/profile       Perfil — editar nombre, salario, contraseña
```

## Formularios y categorías

**Movimientos (Transactions):**
- Categorías de **gasto**: Comida, Transporte, Renta, Salud, Entretenimiento, Ropa, Servicios, Otro
- Categorías de **ingreso**: Salario, Transferencia, Regalo, Freelance, Venta, Otro
- Campo "Entró a" (ingresos): selector con tarjetas de débito + "Efectivo físico" → se guarda en `method`
- Campo "Método de pago" (gastos): texto libre

**Tarjetas (Cards):**
- Tipo **crédito**: nombre, color, límite, día de corte, día de pago
- Tipo **débito** o **transporte**: solo nombre y color (sin campos de ciclo)

## Variables de entorno

El server valida al arrancar que existan `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` y `REFRESH_TOKEN_SECRET` — lanzará error si faltan.

En Docker, `DATABASE_URL` y `REDIS_URL` usan los nombres de servicio del compose (`postgres`, `redis`) como hostname, no `localhost`.

El proxy de Vite (`vite.config.js`) apunta a `http://server:4000` (nombre de servicio Docker), por lo que el frontend nunca llama directamente a `localhost:4000`.
