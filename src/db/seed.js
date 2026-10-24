// بيانات تجريبية: npm run seed
const { openDb, getDb } = require('./index');
const { createLease } = require('../services/leaseService');
const { recordPayment } = require('../services/paymentService');
const { addMonths, today } = require('../utils/dates');

openDb();
const db = getDb();
const t0 = today();

const prop = db.prepare(`INSERT INTO properties (name, address, type) VALUES (?, ?, 'compound')`)
  .run('مجمع الاستراحات', 'الرياض').lastInsertRowid;

const addUnit = db.prepare('INSERT INTO units (property_id, unit_number, rent_amount) VALUES (?, ?, ?)');
const units = [1, 2, 3, 4, 5, 6].map((n) => addUnit.run(prop, `استراحة-${n}`, 30000).lastInsertRowid);

const addTenant = db.prepare('INSERT INTO tenants (full_name, phone) VALUES (?, ?)');
const tenants = ['عميل أول', 'عميل ثانٍ', 'عميل ثالث', 'عميل رابع', 'عميل خامس', 'عميل سادس'].map((n, i) =>
  addTenant.run(n, `05000000${10 + i}`).lastInsertRowid
);

let no = 1000;
const lease = (u, t, from, to, rent, cycle, extra = {}) =>
  createLease({
    unit_id: units[u], tenant_id: tenants[t], contract_number: String(++no),
    start_date: addMonths(t0, from), end_date: addMonths(t0, to), rent_amount: rent, payment_cycle: cycle, ...extra,
  });
const payDue = (l, count) => {
  for (const i of l.installments.filter((x) => x.due_date <= t0).slice(0, count)) {
    recordPayment({ installment_id: i.id, amount: i.amount, paid_at: i.due_date });
  }
};

// عقود سابقة منتهية ومسددة بالكامل
lease(0, 0, -30, -18, 40000, 'annual', { mark_paid: true });
lease(0, 1, -17, -5, 42000, 'annual', { mark_paid: true });
lease(5, 5, -26, -14, 36000, 'annual', { mark_paid: true });
// عقد ساري ومتأخر في السداد (4 أقساط مستحقة، دُفع منها قسطان)
payDue(lease(1, 2, -4, 8, 3500, 'monthly'), 2);
// عقد ينتهي خلال شهر
payDue(lease(2, 3, -11, 1, 36000, 'annual'), 1);
// عقد ساري ملتزم
payDue(lease(3, 4, -2, 10, 9000, 'quarterly'), 1);
payDue(lease(4, 1, -9, 3, 3000, 'monthly'), 9);

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
db.prepare(`INSERT INTO appointments (title, type, scheduled_at, unit_id) VALUES (?, 'viewing', ?, ?)`)
  .run('معاينة استراحة-6', `${day(1)}T17:00`, units[5]);
db.prepare(`INSERT INTO appointments (title, type, scheduled_at, tenant_id) VALUES (?, 'collection', ?, ?)`)
  .run('تحصيل إيجار متأخر', `${day(2)}T20:00`, tenants[2]);

console.log('تمت إضافة البيانات التجريبية');
