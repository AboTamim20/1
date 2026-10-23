const { getDb, transaction } = require('../db');
const { HttpError } = require('../middleware/errors');
const { CYCLE_MONTHS, addMonths } = require('../utils/dates');

// يولّد جدول الأقساط من بداية العقد حتى نهايته حسب دورة الدفع
function buildSchedule({ start_date, end_date, rent_amount, payment_cycle }) {
  const step = CYCLE_MONTHS[payment_cycle];
  if (!step) throw new HttpError(400, 'دورة الدفع غير صحيحة');
  if (end_date <= start_date) throw new HttpError(400, 'تاريخ نهاية العقد يجب أن يكون بعد البداية');

  const dues = [];
  for (let i = 0; ; i++) {
    const due = addMonths(start_date, i * step);
    if (due >= end_date) break;
    dues.push({ due_date: due, amount: rent_amount });
  }
  return dues;
}

function createLease(input) {
  const required = ['unit_id', 'tenant_id', 'start_date', 'end_date', 'rent_amount'];
  const missing = required.filter((f) => input[f] === undefined || input[f] === '');
  if (missing.length) throw new HttpError(400, `حقول مطلوبة: ${missing.join(', ')}`);

  const lease = {
    unit_id: input.unit_id,
    tenant_id: input.tenant_id,
    start_date: input.start_date,
    end_date: input.end_date,
    rent_amount: Number(input.rent_amount),
    payment_cycle: input.payment_cycle || 'monthly',
    deposit: Number(input.deposit || 0),
    notes: input.notes ?? null,
  };
  const schedule = buildSchedule(lease);

  return transaction((db) => {
    const active = db
      .prepare(`SELECT id FROM leases WHERE unit_id = ? AND status = 'active'`)
      .get(lease.unit_id);
    if (active) throw new HttpError(409, 'الوحدة مؤجرة بعقد ساري');

    const { lastInsertRowid: leaseId } = db
      .prepare(
        `INSERT INTO leases (unit_id, tenant_id, start_date, end_date, rent_amount, payment_cycle, deposit, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(...Object.values(lease));

    const insertDue = db.prepare('INSERT INTO installments (lease_id, due_date, amount) VALUES (?, ?, ?)');
    for (const d of schedule) insertDue.run(leaseId, d.due_date, d.amount);

    db.prepare(`UPDATE units SET status = 'occupied' WHERE id = ?`).run(lease.unit_id);
    return getLease(leaseId);
  });
}

function getLease(id) {
  const db = getDb();
  const lease = db
    .prepare(
      `SELECT l.*, t.full_name AS tenant_name, u.unit_number, p.name AS property_name
       FROM leases l
       JOIN tenants t ON t.id = l.tenant_id
       JOIN units u ON u.id = l.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE l.id = ?`
    )
    .get(id);
  if (!lease) throw new HttpError(404, 'العقد غير موجود');
  lease.installments = db.prepare('SELECT * FROM installments WHERE lease_id = ? ORDER BY due_date').all(id);
  return lease;
}

function listLeases({ status, tenant_id } = {}) {
  const where = [];
  const params = [];
  if (status) where.push('l.status = ?') && params.push(status);
  if (tenant_id) where.push('l.tenant_id = ?') && params.push(tenant_id);
  return getDb()
    .prepare(
      `SELECT l.*, t.full_name AS tenant_name, u.unit_number, p.name AS property_name
       FROM leases l
       JOIN tenants t ON t.id = l.tenant_id
       JOIN units u ON u.id = l.unit_id
       JOIN properties p ON p.id = u.property_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY l.start_date DESC`
    )
    .all(...params);
}

// إنهاء العقد: يلغي الأقساط المستقبلية غير المدفوعة ويحرر الوحدة
function endLease(id, { status = 'ended', end_date } = {}) {
  return transaction((db) => {
    const lease = getLease(id);
    if (lease.status !== 'active') throw new HttpError(409, 'العقد منتهٍ مسبقاً');
    const finalDate = end_date || new Date().toISOString().slice(0, 10);
    db.prepare(`DELETE FROM installments WHERE lease_id = ? AND due_date > ? AND paid_amount = 0`).run(id, finalDate);
    db.prepare('UPDATE leases SET status = ?, end_date = ? WHERE id = ?').run(status, finalDate, id);
    db.prepare(`UPDATE units SET status = 'vacant' WHERE id = ?`).run(lease.unit_id);
    return getLease(id);
  });
}

module.exports = { buildSchedule, createLease, getLease, listLeases, endLease };
