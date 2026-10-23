const { getDb, transaction } = require('../db');
const { HttpError } = require('../middleware/errors');

// تسجيل دفعة على قسط وتحديث حالته (جزئي / مدفوع)
function recordPayment({ installment_id, amount, paid_at, method, reference, notes }) {
  amount = Number(amount);
  if (!installment_id || !(amount > 0)) throw new HttpError(400, 'القسط والمبلغ (أكبر من صفر) مطلوبان');

  return transaction((db) => {
    const inst = db.prepare('SELECT * FROM installments WHERE id = ?').get(installment_id);
    if (!inst) throw new HttpError(404, 'القسط غير موجود');
    const remaining = inst.amount - inst.paid_amount;
    if (amount > remaining + 1e-9) throw new HttpError(400, `المبلغ أكبر من المتبقي (${remaining})`);

    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO payments (installment_id, amount, paid_at, method, reference, notes)
         VALUES (?, ?, COALESCE(?, date('now')), COALESCE(?, 'cash'), ?, ?)`
      )
      .run(installment_id, amount, paid_at ?? null, method ?? null, reference ?? null, notes ?? null);

    const paid = inst.paid_amount + amount;
    const status = paid >= inst.amount - 1e-9 ? 'paid' : 'partial';
    db.prepare('UPDATE installments SET paid_amount = ?, status = ? WHERE id = ?').run(paid, status, installment_id);

    return db.prepare('SELECT * FROM payments WHERE id = ?').get(lastInsertRowid);
  });
}

function listPayments({ lease_id, from, to } = {}) {
  const where = [];
  const params = [];
  if (lease_id) where.push('i.lease_id = ?') && params.push(lease_id);
  if (from) where.push('p.paid_at >= ?') && params.push(from);
  if (to) where.push('p.paid_at <= ?') && params.push(to);
  return getDb()
    .prepare(
      `SELECT p.*, i.lease_id, i.due_date, t.full_name AS tenant_name
       FROM payments p
       JOIN installments i ON i.id = p.installment_id
       JOIN leases l ON l.id = i.lease_id
       JOIN tenants t ON t.id = l.tenant_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY p.paid_at DESC, p.id DESC`
    )
    .all(...params);
}

module.exports = { recordPayment, listPayments };
