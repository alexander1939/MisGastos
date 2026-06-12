CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  salary NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cards (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('credito', 'debito', 'transporte')),
  color VARCHAR(7) DEFAULT '#6366f1',
  credit_limit NUMERIC(12,2),
  cut_day INTEGER,
  pay_day INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('ingreso', 'gasto')),
  category VARCHAR(100) NOT NULL,
  method VARCHAR(100),
  description TEXT,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id INTEGER REFERENCES cards(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  category VARCHAR(100) NOT NULL,
  months INTEGER DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'urgente', 'pagado', 'archivado')),
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS budgets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(100) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  period VARCHAR(20) NOT NULL DEFAULT 'mes',
  UNIQUE (user_id, category)
);

CREATE TABLE IF NOT EXISTS archive_months (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_key VARCHAR(7) NOT NULL,
  label VARCHAR(100) NOT NULL,
  total_paid NUMERIC(12,2) DEFAULT 0,
  archived_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, month_key)
);

CREATE TABLE IF NOT EXISTS archive_items (
  id SERIAL PRIMARY KEY,
  archive_month_id INTEGER NOT NULL REFERENCES archive_months(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  category VARCHAR(100),
  card_name VARCHAR(255),
  months INTEGER,
  original_date DATE
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('tarjeta', 'quincena', 'pago', 'tarea')),
  date DATE NOT NULL,
  amount NUMERIC(12,2),
  note TEXT,
  repeat VARCHAR(20) DEFAULT 'none' CHECK (repeat IN ('none', 'monthly', 'biweekly')),
  done BOOLEAN DEFAULT FALSE,
  auto_generated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions (user_id, date);
CREATE INDEX IF NOT EXISTS idx_purchases_user_status ON purchases (user_id, status);
CREATE INDEX IF NOT EXISTS idx_archive_months_user_key ON archive_months (user_id, month_key);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_date ON calendar_events (user_id, date);
