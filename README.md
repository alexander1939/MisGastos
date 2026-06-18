# MisGastos

App personal de finanzas — controla ingresos, gastos, compras a crédito, transferencias, presupuestos y saldo por cuenta.

## Levantar el proyecto

```bash
docker-compose up          # levanta todo
docker-compose up -d       # background
docker-compose logs -f server
docker-compose down        # detener
docker-compose down -v     # reset completo (borra BD)
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000/api/health`

No hay comandos de build, lint ni test configurados todavía.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite + TailwindCSS |
| Estado servidor | React Query (@tanstack/react-query) |
| Estado UI/auth | Zustand |
| Gráficas | Recharts |
| Backend | Node.js + Express |
| Base de datos | PostgreSQL 16 |
| Caché | Redis 7 (TTL 30s) |
| Validación | Zod |
| Auth | JWT (15m) + Refresh token (30d, httpOnly cookie) |
| Jobs | node-cron |
| Infra | Docker Compose |

---

## Arquitectura

```
client (React/Vite :5173)
    │  proxy /api → server:4000
    │  proxy /ws  → server:4000 (WebSocket)
    ▼
server (Express :4000)
    ├── corre migraciones SQL al arrancar
    ├── PostgreSQL  ← datos principales
    └── Redis       ← caché analíticas (TTL 30s), rate limiting, blacklist JWT
```

Al arrancar, el server ejecuta todos los `.sql` de `server/migrations/` en orden alfabético (idempotente, seguro en cada reinicio).

---

## Módulos de la API

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

### `transactions` — gastos e ingresos diarios
```
GET    /api/transactions                  ← ?period= &category= &method= &from= &to= &page= &limit=
GET    /api/transactions/summary          ← totales ingresos vs gastos
GET    /api/transactions/account-balance  ← saldo por tarjeta débito/transporte + efectivo
GET    /api/transactions/export           ← CSV
POST   /api/transactions
POST   /api/transactions/import           ← carga masiva CSV
PUT    /api/transactions/:id
DELETE /api/transactions/:id
```

### `cards` — tarjetas crédito, débito y transporte
```
GET    /api/cards
GET    /api/cards/:id/summary     ← deuda y % de uso
GET    /api/cards/export
POST   /api/cards
POST   /api/cards/import
PUT    /api/cards/:id
DELETE /api/cards/:id
```

### `purchases` — compras a tarjeta con ciclo de cobro
```
GET    /api/purchases             ← ?cardId= &status= &from= &to= &limit=
GET    /api/purchases/stats       ← agrupado por categoría y tarjeta
GET    /api/purchases/export
POST   /api/purchases
POST   /api/purchases/import
POST   /api/purchases/pay-card    ← paga ciclo completo de una tarjeta
PUT    /api/purchases/:id
PUT    /api/purchases/:id/status
DELETE /api/purchases/:id
```

Estados: `pendiente → pagado`, `urgente → pagado`, `pagado → archivado`

### `transfers` — transferencias entre tarjetas o al banco
```
GET    /api/transfers
GET    /api/transfers/export
POST   /api/transfers             ← type: 'transfer' | 'retiro'
POST   /api/transfers/import
DELETE /api/transfers/:id
```

### `budgets`
```
GET    /api/budgets
GET    /api/budgets/status        ← % gastado vs límite por categoría
PUT    /api/budgets               ← upsert masivo
```

### `archive`
```
GET    /api/archive
GET    /api/archive/:monthKey
POST   /api/archive/close-month
DELETE /api/archive/:monthKey
```

### `analytics` — cacheado en Redis (TTL 30s)
```
GET    /api/analytics/by-category         ← ?period=mes|semana
GET    /api/analytics/by-method           ← ?period=
GET    /api/analytics/trend               ← ?days=30
GET    /api/analytics/cards-debt
GET    /api/analytics/monthly-comparison  ← ?months=6
```

Incluyen tanto `transactions` como `purchases` en todos los cálculos de gastos. La caché se invalida explícitamente tras cada mutación.

### `calendar`
```
GET    /api/calendar              ← ?month=YYYY-MM &type=
GET    /api/calendar/upcoming     ← próximos 7 días
POST   /api/calendar
PUT    /api/calendar/:id
PUT    /api/calendar/:id/done
DELETE /api/calendar/:id
```

---

## Páginas del frontend

| Ruta | Descripción |
|------|-------------|
| `/` | Dashboard — stats del mes, gráficas, actividad de la semana |
| `/transactions` | Movimientos — gastos/ingresos + saldo por cuenta (débito + transporte + efectivo) |
| `/cards` | Tarjetas — crédito (con botón Pagar ciclo), débito, transporte |
| `/purchases` | Compras — ciclo de cobro, resumen por mes de pago |
| `/transfers` | Transferencias entre tarjetas o al banco |
| `/budgets` | Presupuestos por categoría con barra de progreso |
| `/archive` | Historial de meses cerrados |
| `/calendar` | Calendario grid — eventos, compras por mes de pago, fechas de tarjetas |
| `/profile` | Perfil — nombre, salario, contraseña |
| `/datos` | Exportar / importar todo (CSV unificado: tarjetas, movimientos, compras, transferencias) |

---

## Base de datos

```sql
users           id, email, name, password, salary, created_at
cards           id, user_id, name, type, color, credit_limit, cut_day, pay_day
transactions    id, user_id, amount, type, category, method, description, date
purchases       id, user_id, card_id, description, amount, category, months,
                status, date, pay_month, created_at
transfers       id, user_id, from_card_id, to_card_id, amount, description, date, type
budgets         id, user_id, category, amount, period
archive_months  id, user_id, month_key, label, total_paid, archived_at
archive_items   id, archive_month_id, description, amount, category, card_name, months
calendar_events id, user_id, title, type, date, amount, note, repeat, done,
                auto_generated, created_at
```

Migraciones: `001_initial.sql`, `002_transfers.sql`, `003_pay_month.sql`, `004_transfer_type.sql`

---

## Lógica de ciclo de cobro

```
Si día_de_compra <= día_de_corte de la tarjeta
  → la compra pertenece al ciclo del MES ACTUAL → pagar en pay_day de ese mes
Si día_de_compra > día_de_corte
  → la compra pertenece al ciclo del MES SIGUIENTE → pagar en pay_day del mes siguiente
```

`pay_month` en purchases permite override manual. Esta lógica aplica en: Dashboard, Compras, Calendario, analíticas por categoría y deuda por tarjeta.

---

## Saldo por cuenta

```
Saldo = Ingresos (transactions con method = nombre de cuenta)
      + Recibido (transfers donde to_card = cuenta)
      - Gastos   (transactions con method = nombre de cuenta)
      - Enviado  (transfers donde from_card = cuenta)
```

Aparecen en la gráfica: tarjetas débito, tarjetas transporte y "Efectivo físico". Solo se muestran cuentas con saldo distinto de $0.

Las transferencias entre tarjetas propias no afectan analytics — mover dinero entre cuentas propias no es ingreso ni gasto real.

---

## Qué NO se cuenta como gasto en analytics

- Transferencias entre tarjetas propias (tabla `transfers`)
- Pagos de tarjeta de crédito — las purchases ya están contadas; el pago solo cambia su status a `pagado` y genera una transferencia

---

## Seguridad

- Contraseñas con bcrypt (cost 12)
- Access token en memoria + refresh token en httpOnly cookie
- Rate limiting global (200 req / 15min por IP)
- Validación de inputs con Zod en todos los endpoints
- Queries parametrizadas
- CORS restringido al origen del cliente en producción
- Cada usuario solo accede a sus propios datos (filtro `user_id` en todas las queries)

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

El server lanza error al arrancar si faltan `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` o `REFRESH_TOKEN_SECRET`.
