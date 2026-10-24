const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

let db;

function openDb(file = process.env.DB_FILE || path.join(__dirname, '../../data/rental.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  migrate(db);
  return db;
}

// ترقية قواعد البيانات القديمة التي أُنشئت قبل إضافة الأعمدة الجديدة
function migrate(conn) {
  const leaseCols = conn.prepare('PRAGMA table_info(leases)').all().map((c) => c.name);
  if (!leaseCols.includes('contract_number')) conn.exec('ALTER TABLE leases ADD COLUMN contract_number TEXT');
}

function getDb() {
  return db || openDb();
}

function transaction(fn) {
  const conn = getDb();
  conn.exec('BEGIN');
  try {
    const result = fn(conn);
    conn.exec('COMMIT');
    return result;
  } catch (err) {
    conn.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { openDb, getDb, transaction };
