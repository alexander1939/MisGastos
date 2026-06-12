# 💸 MisGastos

Aplicación web de finanzas personales. Permite registrar sueldo, gastos diarios, tarjetas de crédito/débito y hacer seguimiento de pagos mensuales.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite + TailwindCSS |
| Estado | Zustand + React Query |
| Gráficas | Recharts |
| Backend | Node.js 20 + Express 4 |
| Base de datos | PostgreSQL 16 |
| Cache / Sesiones | Redis 7 |
| Validación | Zod |
| Auth | JWT (access token) + Refresh token (httpOnly cookie) |
| Jobs | node-cron |
| Tiempo real | WebSockets (ws) |
| Contenedores | Docker + Docker Compose |

---

## Arquitectura

```
client (React)
    │
    │ REST + WebSocket
    ▼
Express API
    ├── auth middleware (JWT)
    ├── rate limiter (Redis)
    └── módulos (ver abajo)
         │
         ├── PostgreSQL  ← datos principales
         └── Redis       ← cache, sesiones, rate limiting
```

---

## Módulos

### `auth`
Registro, login, logout y refresco de token.

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/auth/me
PUT    /api/auth/me
DELETE /api/auth/me
```

---

### `transactions`
Gastos e ingresos del día a día.

```
GET    /api/transactions          ?period=semana|quincena|mes &category= &method= &from= &to= &page= &limit=
POST   /api/transactions
PUT    /api/transactions/:id
DELETE /api/transactions/:id
POST   /api/transactions/import   ← carga masiva CSV
GET    /api/transactions/summary  ← totales por periodo
```

---

### `cards`
Tarjetas de crédito, débito y transporte.

```
GET    /api/cards
POST   /api/cards
PUT    /api/cards/:id
DELETE /api/cards/:id
GET    /api/cards/:id/summary     ← balance, deuda, % de uso
```

---

### `purchases`
Compras cargadas a tarjeta, con soporte de mensualidades.

```
GET    /api/purchases             ?cardId= &status= &period=
POST   /api/purchases
PUT    /api/purchases/:id
PUT    /api/purchases/:id/status  ← cambiar estado
DELETE /api/purchases/:id
GET    /api/purchases/stats       ← agrupado por categoría y tarjeta
```

Estados posibles:

```
pendiente ──(manual)──▶ pagado
pendiente ──(cron, ≤5 días fin de mes)──▶ urgente
urgente   ──(manual)──▶ pagado
pagado    ──(cierre de mes)──▶ archivado
```

---

### `budgets`
Límites de gasto por categoría.

```
GET    /api/budgets
PUT    /api/budgets               ← upsert masivo
GET    /api/budgets/status        ← % gastado vs límite por categoría
```

---

### `archive`
Cierre mensual e historial.

```
GET    /api/archive
GET    /api/archive/:monthKey
POST   /api/archive/close-month
DELETE /api/archive/:monthKey
```

Lógica de `close-month`:
1. Mover `purchases` con `status = pagado` a `archive_items`
2. Marcar los restantes como `urgente`
3. Crear registro en `archive_months`

---

### `analytics`
Datos para gráficas del dashboard. Resultados cacheados en Redis (TTL 5 min).

```
GET    /api/analytics/by-category         ?period=
GET    /api/analytics/by-method           ?period=
GET    /api/analytics/trend               ?days=
GET    /api/analytics/cards-debt
GET    /api/analytics/monthly-comparison  ?months=
```

---

### `calendar`
Eventos del calendario: fechas de tarjetas, quincenas, pagos fijos y recordatorios.

```
GET    /api/calendar              ?month=2024-06 &type=tarjeta|quincena|pago|tarea
POST   /api/calendar
PUT    /api/calendar/:id
PUT    /api/calendar/:id/done     <- marcar completado / pendiente
DELETE /api/calendar/:id
GET    /api/calendar/upcoming     <- proximos 7 dias
```

Tipos de evento:

| Tipo | Descripcion | Se genera |
|------|-------------|-----------|
| `tarjeta` | Corte y fecha limite de pago de tarjeta | Auto desde `cards.cut_day` / `cards.pay_day` |
| `quincena` | Dia de cobro (1 y 16 de cada mes) | Auto al crear usuario |
| `pago` | Pago fijo recurrente (luz, internet, renta) | Manual |
| `tarea` | Recordatorio libre (pagar X, llamar al banco) | Manual |

Logica de urgencia (calculada al vuelo, no persistida):

```
diff = event.date - today
diff <= 1 dia  -> urgente (rojo)
diff <= 4 dias -> pronto  (amarillo)
diff >  4 dias -> ok      (verde)
done = true    -> sin color
```

Repeticion soportada: `none` · `monthly` · `biweekly`


---

## Base de datos

```sql
users
  id, email, name, password, salary, created_at

cards
  id, user_id, name, type, color, credit_limit, cut_day, pay_day, created_at

transactions
  id, user_id, amount, type, category, method, description, date, created_at

purchases
  id, user_id, card_id, description, amount, category, months, status, date, created_at

budgets
  id, user_id, category, amount, period
  UNIQUE (user_id, category)

archive_months
  id, user_id, month_key, label, total_paid, archived_at
  UNIQUE (user_id, month_key)

archive_items
  id, archive_month_id, description, amount, category, card_name, months, original_date

calendar_events
  id, user_id, title, type, date, amount, note, repeat, done, auto_generated, created_at
  -- auto_generated = true para eventos creados automaticamente (cortes, quincenas)
```

Índices:

```sql
CREATE INDEX ON transactions (user_id, date);
CREATE INDEX ON purchases    (user_id, status);
CREATE INDEX ON archive_months    (user_id, month_key);
CREATE INDEX ON calendar_events  (user_id, date);
```

---

## Estructura del proyecto

```
misgastos/
├── client/
│   ├── Dockerfile
│   └── src/
│       ├── api/           ← fetch wrappers por módulo
│       ├── components/    ← ui/, charts/, cards/, purchases/, dashboard/
│       ├── pages/         ← Dashboard, Transactions, Cards, Purchases, Archive, Budgets, Login
│       ├── store/         ← authStore, financeStore, uiStore (Zustand)
│       ├── hooks/         ← useTransactions, useCards, usePeriod
│       └── utils/         ← formatCurrency, dateHelpers, csvParser
│
├── server/
│   ├── Dockerfile
│   └── src/
│       ├── config/        ← db, redis, env
│       ├── middleware/    ← auth, rateLimiter, validate, errorHandler
│       ├── modules/       ← auth/, transactions/, cards/, purchases/, budgets/, archive/, analytics/
│       ├── jobs/          ← urgentChecker.js  (cron diario)
│       └── ws/            ← notificationGateway.js
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Variables de entorno

```env
PORT=4000
NODE_ENV=development

DATABASE_URL=postgresql://user:password@localhost:5432/misgastos
REDIS_URL=redis://localhost:6379

JWT_SECRET=
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=
REFRESH_TOKEN_EXPIRES_IN=30d

CLIENT_ORIGIN=http://localhost:5173

# Opcional — notificaciones por email
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
```

---

## Levantar en local

Un solo comando levanta todos los servicios:

```bash
docker-compose up
```

Al arrancar, Docker levanta los servicios en este orden:

```
postgres  ─┐
redis     ─┴─▶  server (:4000)  ─▶  client (:5173)
```

- `postgres` y `redis` arrancan primero
- `server` espera a que ambos estén listos antes de iniciar
- `client` queda disponible en `http://localhost:5173`

Para correr en background:

```bash
docker-compose up -d
```

Para ver logs de un servicio específico:

```bash
docker-compose logs -f server
docker-compose logs -f client
```

Para detener todo:

```bash
docker-compose down
```

Para detener y borrar volúmenes (reset completo de BD):

```bash
docker-compose down -v
```

---

## Seguridad

- Contraseñas con `bcrypt` (cost 12)
- Access token en memoria + refresh token en `httpOnly cookie`
- Rate limiting en login (5 intentos / min por IP)
- Validación de inputs con Zod en todos los endpoints
- Queries parametrizadas (sin SQL injection)
- CORS restringido al origen del cliente
- Cada usuario solo accede a sus propios datos (check en cada query)

---

## Roadmap

- [ ] Backend: auth + transactions + cards
- [ ] Backend: purchases + budgets + archive + analytics
- [ ] Frontend React (Dashboard, Tarjetas, Compras, Historial, Presupuestos, Calendario)
- [ ] WebSocket para alertas en tiempo real
- [ ] Deploy (Railway + Vercel)
- [ ] PWA / notificaciones móvil