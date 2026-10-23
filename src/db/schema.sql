-- العقارات (عمارة، فيلا، مجمع...)
CREATE TABLE IF NOT EXISTS properties (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  address     TEXT,
  type        TEXT NOT NULL DEFAULT 'building',   -- building | villa | compound | shop | other
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- الوحدات داخل كل عقار (شقة، محل، مكتب...)
CREATE TABLE IF NOT EXISTS units (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id  INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_number  TEXT NOT NULL,
  rent_amount  REAL NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'vacant',     -- vacant | occupied | maintenance
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (property_id, unit_number)
);

-- المستأجرون
CREATE TABLE IF NOT EXISTS tenants (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name    TEXT NOT NULL,
  phone        TEXT,
  email        TEXT,
  national_id  TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- عقود الإيجار
CREATE TABLE IF NOT EXISTS leases (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id        INTEGER NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  tenant_id      INTEGER NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  start_date     TEXT NOT NULL,                    -- YYYY-MM-DD
  end_date       TEXT NOT NULL,                    -- YYYY-MM-DD
  rent_amount    REAL NOT NULL,                    -- قيمة القسط الواحد
  payment_cycle  TEXT NOT NULL DEFAULT 'monthly',  -- monthly | quarterly | semiannual | annual
  deposit        REAL NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'active',   -- active | ended | terminated
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- الأقساط المستحقة (تتولد تلقائياً عند إنشاء العقد)
CREATE TABLE IF NOT EXISTS installments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lease_id    INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  due_date    TEXT NOT NULL,
  amount      REAL NOT NULL,
  paid_amount REAL NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'pending'      -- pending | partial | paid
);

-- الدفعات المستلمة
CREATE TABLE IF NOT EXISTS payments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  installment_id  INTEGER NOT NULL REFERENCES installments(id) ON DELETE CASCADE,
  amount          REAL NOT NULL,
  paid_at         TEXT NOT NULL DEFAULT (date('now')),
  method          TEXT NOT NULL DEFAULT 'cash',    -- cash | transfer | cheque | card
  reference       TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- المواعيد (معاينة، صيانة، تحصيل، تجديد عقد...)
CREATE TABLE IF NOT EXISTS appointments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'other',      -- viewing | maintenance | collection | renewal | other
  scheduled_at TEXT NOT NULL,                      -- YYYY-MM-DDTHH:MM
  tenant_id    INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  unit_id      INTEGER REFERENCES units(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled | done | cancelled
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_installments_due   ON installments(due_date, status);
CREATE INDEX IF NOT EXISTS idx_appointments_when  ON appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_leases_tenant      ON leases(tenant_id);
