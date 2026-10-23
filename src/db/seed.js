// بيانات تجريبية: npm run seed
const { openDb, getDb } = require('./index');
const { createLease } = require('../services/leaseService');
const { recordPayment } = require('../services/paymentService');
const { addMonths, today } = require('../utils/dates');

openDb();
const db = getDb();

const prop = db.prepare(`INSERT INTO properties (name, address, type) VALUES (?, ?, 'building')`)
  .run('عمارة النخيل', 'الرياض - حي الملقا').lastInsertRowid;

const addUnit = db.prepare('INSERT INTO units (property_id, unit_number, rent_amount) VALUES (?, ?, ?)');
const units = ['101', '102', '201', '202'].map((n) => addUnit.run(prop, n, 2500).lastInsertRowid);

const addTenant = db.prepare('INSERT INTO tenants (full_name, phone) VALUES (?, ?)');
const tenants = [
  ['محمد أحمد', '0500000001'],
  ['خالد عبدالله', '0500000002'],
  ['سارة علي', '0500000003'],
].map(([n, p]) => addTenant.run(n, p).lastInsertRowid);

const start = addMonths(today(), -4);
const leases = tenants.map((tenant_id, i) =>
  createLease({ unit_id: units[i], tenant_id, start_date: start, end_date: addMonths(start, 12), rent_amount: 2500 })
);

// المستأجر الأول ملتزم، الثاني دفع جزئياً، الثالث متأخر بالكامل
for (const inst of leases[0].installments.filter((i) => i.due_date <= today())) {
  recordPayment({ installment_id: inst.id, amount: inst.amount });
}
recordPayment({ installment_id: leases[1].installments[0].id, amount: 2500 });
recordPayment({ installment_id: leases[1].installments[1].id, amount: 1000 });

db.prepare(`INSERT INTO appointments (title, type, scheduled_at, unit_id) VALUES (?, 'viewing', ?, ?)`)
  .run('معاينة شقة 202', `${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}T17:00`, units[3]);
db.prepare(`INSERT INTO appointments (title, type, scheduled_at, tenant_id) VALUES (?, 'collection', ?, ?)`)
  .run('تحصيل إيجار متأخر', `${new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)}T20:00`, tenants[2]);

console.log('تمت إضافة البيانات التجريبية');
