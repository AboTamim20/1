const { getDb, transaction } = require('../db');
const { HttpError } = require('../middleware/errors');
const { CYCLE_MONTHS, addMonths, today, daysBetween } = require('../utils/dates');

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

// الحالة الفعلية: العقد "النشط" الذي مضى تاريخ نهايته يُعرض كمنتهٍ
function withStatus(lease, asOf = today()) {
  const expired = lease.status === 'active' && lease.end_date < asOf;
  return {
    ...lease,
    effective_status: expired ? 'expired' : lease.status,
    days_remaining: lease.status === 'active' ? daysBetween(asOf, lease.end_date) : null,
  };
}

const isTrue = (v) => v === true || v === 'true' || v === 'on' || v === 1 || v === '1';

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
    contract_number: input.contract_number || null,
  };
  if (!(lease.rent_amount > 0)) throw new HttpError(400, 'قيمة القسط يجب أن تكون أكبر من صفر');
  const schedule = buildSchedule(lease);
  const markPaid = isTrue(input.mark_paid);

  return transaction((db) => {
    // لا يُسمح بتداخل فترتين لعقدين ساريين على نفس الوحدة
    const clash = db
      .prepare(`SELECT id FROM leases WHERE unit_id = ? AND status = 'active' AND start_date < ? AND end_date > ?`)
      .get(lease.unit_id, lease.end_date, lease.start_date);
    if (clash) throw new HttpError(409, 'الوحدة مؤجرة بعقد ساري في هذه الفترة');

    const { lastInsertRowid: leaseId } = db
      .prepare(
        `INSERT INTO leases (unit_id, tenant_id, start_date, end_date, rent_amount, payment_cycle, deposit, notes, contract_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(...Object.values(lease));

    const insertDue = db.prepare('INSERT INTO installments (lease_id, due_date, amount) VALUES (?, ?, ?)');
    const insertPay = db.prepare(`INSERT INTO payments (installment_id, amount, paid_at) VALUES (?, ?, ?)`);
    const markDue = db.prepare(`UPDATE installments SET paid_amount = amount, status = 'paid' WHERE id = ?`);
    for (const d of schedule) {
      const { lastInsertRowid: instId } = insertDue.run(leaseId, d.due_date, d.amount);
      if (markPaid) {
        insertPay.run(instId, d.amount, d.due_date);
        markDue.run(instId);
      }
    }

    if (lease.end_date >= today()) db.prepare(`UPDATE units SET status = 'occupied' WHERE id = ?`).run(lease.unit_id);
    return getLease(leaseId);
  });
}

const LEASE_SELECT = `SELECT l.*, t.full_name AS tenant_name, t.phone AS tenant_phone, u.unit_number, p.name AS property_name
       FROM leases l
       JOIN tenants t ON t.id = l.tenant_id
       JOIN units u ON u.id = l.unit_id
       JOIN properties p ON p.id = u.property_id`;

function getLease(id) {
  const db = getDb();
  const lease = db.prepare(`${LEASE_SELECT} WHERE l.id = ?`).get(id);
  if (!lease) throw new HttpError(404, 'العقد غير موجود');
  const out = withStatus(lease);
  out.installments = db.prepare('SELECT * FROM installments WHERE lease_id = ? ORDER BY due_date').all(id);
  return out;
}

function listLeases({ status, tenant_id } = {}) {
  const where = [];
  const params = [];
  if (status) where.push('l.status = ?') && params.push(status);
  if (tenant_id) where.push('l.tenant_id = ?') && params.push(tenant_id);
  return getDb()
    .prepare(`${LEASE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY l.start_date DESC, l.id DESC`)
    .all(...params)
    .map((l) => withStatus(l));
}

// إنهاء العقد: يلغي الأقساط المستقبلية غير المدفوعة ويحرر الوحدة
function endLease(id, { status = 'ended', end_date } = {}) {
  return transaction((db) => {
    const lease = getLease(id);
    if (lease.status !== 'active') throw new HttpError(409, 'العقد منتهٍ مسبقاً');
    const finalDate = end_date || today();
    db.prepare(`DELETE FROM installments WHERE lease_id = ? AND due_date > ? AND paid_amount = 0`).run(id, finalDate);
    db.prepare('UPDATE leases SET status = ?, end_date = ? WHERE id = ?').run(status, finalDate, id);
    db.prepare(`UPDATE units SET status = 'vacant' WHERE id = ?`).run(lease.unit_id);
    return getLease(id);
  });
}

// حذف العقد نهائياً مع أقساطه ودفعاته
function deleteLease(id) {
  return transaction((db) => {
    const lease = getLease(id);
    db.prepare('DELETE FROM leases WHERE id = ?').run(id);
    db.prepare(
      `UPDATE units SET status = 'vacant' WHERE id = ?
         AND NOT EXISTS (SELECT 1 FROM leases WHERE unit_id = units.id AND status = 'active' AND end_date >= date('now'))`
    ).run(lease.unit_id);
  });
}

module.exports = { buildSchedule, createLease, getLease, listLeases, endLease, deleteLease };
