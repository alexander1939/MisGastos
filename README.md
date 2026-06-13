# MisGastos

App personal de finanzas — controla ingresos, gastos, compras a crédito y saldo por cuenta.

## Levantar el proyecto

```bash
docker-compose up
```

- Frontend: http://localhost:5173
- API: http://localhost:4000/api/health

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React + Vite + Tailwind + Recharts |
| Estado servidor | React Query (@tanstack/react-query) |
| Estado UI/auth | Zustand |
| Backend | Node.js + Express |
| Base de datos | PostgreSQL |
| Caché | Redis (TTL 30s) |
| Auth | JWT (access 15m + refresh 30d httpOnly cookie) |
| Infra | Docker Compose |

## Funcionalidades

### Dashboard
- Resumen del mes: ingresos, total que debes, balance
- Gráfica de tendencia (30 días)
- Gastos por categoría del ciclo actual (filtrado por mes de pago, no fecha de compra)
- Deuda por tarjeta de crédito del ciclo actual
- Historial de los últimos 6 meses
- Feed de actividad semanal

### Movimientos
- Registro de ingresos y gastos diarios
- Ingresos: selecciona a qué cuenta va el dinero (tarjeta de débito o efectivo físico)
- Gastos: método de pago libre
- Categorías separadas por tipo (ingreso vs gasto)
- Editar movimientos registrados
- Gráfica de saldo actual por tarjeta de débito y efectivo — incluye transferencias

### Tarjetas
- Crédito: nombre, color, límite, día de corte, día de pago
- Débito / Transporte: solo nombre y color
- Muestra deuda pendiente del ciclo actual por tarjeta de crédito
- **Botón "Pagar"**: marca todas las compras del ciclo como pagadas, registra gasto en la tarjeta débito origen y crea una transferencia automáticamente

### Compras
- Registro de compras a crédito con ciclo de cobro
- Campo "Pagar en" determina el mes al que pertenece la compra (puede ser diferente al mes de compra según el día de corte)
- Resumen por mes de pago
- Máquina de estados: pendiente → pagado → archivado

### Transferencias
- Movimientos entre tarjetas o al banco
- Se reflejan automáticamente en el saldo de cada cuenta en Movimientos

### Calendario
- Grid mensual navegable
- Muestra compras en el mes que se deben pagar (por ciclo de cobro), no en el mes de compra
- Compras del mismo mes: aparecen en su fecha de compra
- Compras de otro mes (ciclo anterior): aparecen en la fecha de pago de la tarjeta
- Eventos de corte y pago de tarjetas con deuda pendiente
- Eventos manuales (tareas, pagos fijos) con repetición mensual/quincenal

## Lógica de ciclo de cobro

```
Si día_de_compra <= día_de_corte de la tarjeta
  → la compra pertenece al ciclo del MES ACTUAL → pagar en pay_day de ese mes
Si día_de_compra > día_de_corte
  → la compra pertenece al ciclo del MES SIGUIENTE → pagar en pay_day del mes siguiente
```

El campo `pay_month` en purchases permite override manual de este cálculo.

Esta lógica aplica en: Dashboard, Compras, Calendario, analíticas por categoría y cálculo de deuda por tarjeta.

## Saldo por cuenta

El saldo de cada tarjeta de débito / efectivo físico se calcula como:

```
Saldo = Ingresos (transactions con method=cuenta)
      + Recibido (transfers donde to_card = cuenta)
      - Gastos   (transactions con method=cuenta)
      - Enviado  (transfers donde from_card = cuenta)
```

## Variables de entorno requeridas

```env
DATABASE_URL=postgres://...
REDIS_URL=redis://...
JWT_SECRET=...
REFRESH_TOKEN_SECRET=...
```
