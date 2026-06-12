# 💸 MisGastos

Aplicación web de finanzas personales. Registra gastos diarios, compras a tarjeta, transferencias, presupuestos y hace seguimiento de pagos mensuales con lógica de ciclos de cobro.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite + TailwindCSS |
| Estado | Zustand + React Query |
| Gráficas | Recharts |
| Backend | Node.js 20 + Express 4 |
| Base de datos | PostgreSQL 16 |
| Cache | Redis 7 (TTL 30s) |
| Validación | Zod |
| Auth | JWT (15m) + Refresh token (30d, httpOnly cookie) |
| Jobs | node-cron |
| WebSockets | ws |
| Contenedores | Docker + Docker Compose |

---

## Levantar en local

```bash
docker-compose up
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000/api/health`

```bash
docker-compose down      # detener
docker-compose down -v   # reset completo (borra BD)
```

---

## Arquitectura

```
client (React :5173)
    │ REST + WebSocket
    ▼
Express API (:4000)
    ├── auth middleware (JWT)
    ├── rate limiter (Redis)
    └── módulos
         ├── PostgreSQL  ← datos principales
         └── Redis       ← cache analíticas (30s), rate limiting, blacklist JWT
```

Al arrancar, el server corre todas las migraciones `.sql` de `server/migrations/` en orden.

---

## Módulos

### `auth`
```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/auth/me
PUT    /api/auth/me        ← nombre, salario, contraseña
DELETE /api/auth/me
```

---

### `transactions`
Gastos e ingresos diarios (efectivo/banco).

```
GET    /api/transactions          ?period= &category= &method= &from= &to= &page= &limit=
GET    /api/transactions/summary  ← totales ingresos vs gastos
POST   /api/transactions
PUT    /api/transactions/:id
DELETE /api/transactions/:id
POST   /api/transactions/import   ← carga masiva CSV
```

---

### `cards`
Tarjetas de crédito, débito y transporte.

```
GET    /api/cards
POST   /api/cards
PUT    /api/cards/:id
DELETE /api/cards/:id
GET    /api/cards/:id/summary     ← deuda y % de uso
```

---

### `purchases`
Compras cargadas a tarjeta con lógica de ciclo de cobro.

```
GET    /api/purchases             ?cardId= &status= &from= &to= &limit=
GET    /api/purchases/stats       ← agrupado por categoría y tarjeta
POST   /api/purchases
PUT    /api/purchases/:id
PUT    /api/purchases/:id/status
DELETE /api/purchases/:id
```

Estados: `pendiente → pagado`, `urgente → pagado`, `pagado → archivado`

**Ciclo de cobro:** cada compra tiene un `pay_month (YYYY-MM)` que indica en qué mes se paga. Si no está seteado manualmente, se calcula así:
- Compra antes del corte → se paga este mes
- Compra después del corte → se paga el siguiente mes

---

### `transfers`
Transferencias entre tarjetas o al banco.

```
GET    /api/transfers
POST   /api/transfers
DELETE /api/transfers/:id
```

Campos: `from_card_id`, `to_card_id`, `amount`, `description`, `date`. Ambos campos de tarjeta son opcionales (permite "externo/banco").

---

### `budgets`
```
GET    /api/budgets
PUT    /api/budgets               ← upsert masivo
GET    /api/budgets/status        ← % gastado vs límite por categoría
```

---

### `archive`
```
GET    /api/archive
GET    /api/archive/:monthKey
POST   /api/archive/close-month   ← cierra el mes: archiva pagados, marca urgentes
DELETE /api/archive/:monthKey
```

---

### `analytics`
Resultados cacheados en Redis (TTL 30s). Incluyen tanto `transactions` como `purchases` en todos los cálculos de gastos.

```
GET    /api/analytics/by-category         ?period=mes|semana  (o sin filtro = todo el historial)
GET    /api/analytics/by-method           ?period=
GET    /api/analytics/trend               ?days=30
GET    /api/analytics/cards-debt
GET    /api/analytics/monthly-comparison  ?months=6
```

La caché se invalida automáticamente cuando se crean, editan o eliminan transacciones o compras.

---

### `calendar`
```
GET    /api/calendar              ?month=YYYY-MM &type=
GET    /api/calendar/upcoming     ← próximos 7 días
POST   /api/calendar
PUT    /api/calendar/:id
PUT    /api/calendar/:id/done
DELETE /api/calendar/:id
```

Tipos de evento: `tarjeta` | `quincena` | `pago` | `tarea`

El calendario también muestra eventos virtuales generados en el cliente:
- Corte y pago de tarjetas (solo cuando hay deuda pendiente en el ciclo del mes)
- Compras del mes con su fecha de pago calculada

---

## Páginas del frontend

| Ruta | Descripción |
|------|-------------|
| `/` | Dashboard — ingresos, gastos, deuda por tarjeta, gráficas, actividad de la semana |
| `/transactions` | Movimientos — gastos e ingresos diarios con filtros |
| `/cards` | Tarjetas — crédito, débito, transporte |
| `/purchases` | Compras — con ciclo de cobro, resumen de lo que pagas cada mes |
| `/transfers` | Transferencias entre tarjetas o al banco |
| `/budgets` | Presupuestos por categoría con barra de progreso |
| `/archive` | Historial de meses cerrados |
| `/calendar` | Calendario grid — eventos, compras, fechas de tarjetas |
| `/profile` | Perfil — nombre, salario, contraseña |

---

## Base de datos

```sql
users           id, email, name, password, salary, created_at
cards           id, user_id, name, type, color, credit_limit, cut_day, pay_day
transactions    id, user_id, amount, type, category, method, description, date
purchases       id, user_id, card_id, description, amount, category, months,
                status, date, pay_month, created_at
transfers       id, user_id, from_card_id, to_card_id, amount, description, date
budgets         id, user_id, category, amount, period
archive_months  id, user_id, month_key, label, total_paid, archived_at
archive_items   id, archive_month_id, description, amount, category, card_name, months
calendar_events id, user_id, title, type, date, amount, note, repeat, done,
                auto_generated, created_at
```

---

## Dashboard

Muestra en tiempo real:
- **Ingresos del mes** — transacciones tipo `ingreso`
- **Total que debes** — compras pendientes/urgentes del ciclo del mes actual + gastos en efectivo
- **Balance** — ingresos menos total a pagar
- **Lo que debes pagar este mes por tarjeta** — desglosado por tarjeta, filtrado por ciclo de cobro
- **Gastos por categoría** — pie chart con todo el historial (transacciones + compras)
- **Tendencia 30 días** — área chart con gastos e ingresos diarios
- **Historial 6 meses** — barras + tabla con ingresos vs gastos por mes
- **Actividad de la semana** — feed diario con transacciones, compras y eventos próximos

---

## Seguridad

- Contraseñas con bcrypt (cost 12)
- Access token en memoria + refresh token en httpOnly cookie
- Rate limiting en login (5 req/min por IP)
- Validación de inputs con Zod en todos los endpoints
- Queries parametrizadas (sin SQL injection)
- CORS restringido al origen del cliente
- Cada usuario solo accede a sus propios datos

---

## Variables de entorno

```env
PORT=4000
NODE_ENV=development
DATABASE_URL=postgresql://user:password@postgres:5432/misgastos
REDIS_URL=redis://redis:6379
JWT_SECRET=
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=
REFRESH_TOKEN_EXPIRES_IN=30d
CLIENT_ORIGIN=http://localhost:5173
```
