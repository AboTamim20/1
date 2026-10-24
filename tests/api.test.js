const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { buildSchedule } = require('../src/services/leaseService');

let server;
let base;

const call = async (method, url, body) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
};

before(async () => {
  openDb(':memory:');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api`;
});

after(() => server.close());

test('buildSchedule: monthly and quarterly cycles, clamps month end', () => {
  assert.equal(buildSchedule({ start_date: '2026-01-01', end_date: '2027-01-01', rent_amount: 1, payment_cycle: 'monthly' }).length, 12);
  assert.equal(buildSchedule({ start_date: '2026-01-01', end_date: '2027-01-01', rent_amount: 1, payment_cycle: 'quarterly' }).length, 4);
  const s = buildSchedule({ start_date: '2026-01-31', end_date: '2026-04-01', rent_amount: 1, payment_cycle: 'monthly' });
  assert.deepEqual(s.map((d) => d.due_date), ['2026-01-31', '2026-02-28', '2026-03-31']);
});

test('full flow: lease, partial payment, overdue report', async () => {
  const prop = (await call('POST', '/properties', { name: 'عمارة 1' })).body;
  const unit = (await call('POST', '/units', { property_id: prop.id, unit_number: 'A1', rent_amount: 1000 })).body;
  const tenant = (await call('POST', '/tenants', { full_name: 'مستأجر تجريبي', phone: '0500' })).body;

  const lease = await call('POST', '/leases', {
    unit_id: unit.id, tenant_id: tenant.id, start_date: '2026-01-01', end_date: '2027-01-01', rent_amount: 1000,
  });
  assert.equal(lease.status, 201);
  assert.equal(lease.body.installments.length, 12);

  // لا يمكن تأجير نفس الوحدة مرتين
  const dup = await call('POST', '/leases', {
    unit_id: unit.id, tenant_id: tenant.id, start_date: '2026-01-01', end_date: '2027-01-01', rent_amount: 1000,
  });
  assert.equal(dup.status, 409);

  const [jan, feb] = lease.body.installments;
  assert.equal((await call('POST', '/payments', { installment_id: jan.id, amount: 1000 })).status, 201);
  assert.equal((await call('POST', '/payments', { installment_id: feb.id, amount: 400 })).status, 201);
  assert.equal((await call('POST', '/payments', { installment_id: feb.id, amount: 5000 })).status, 400);

  const overdue = (await call('GET', '/reports/overdue?as_of=2026-03-15')).body;
  assert.equal(overdue.length, 1);
  assert.equal(overdue[0].installments_count, 2); // فبراير (جزئي) + مارس
  assert.equal(overdue[0].total_balance, 600 + 1000);
  assert.equal(overdue[0].max_days_late, 42);

  const withGrace = (await call('GET', '/reports/overdue?as_of=2026-03-15&grace_days=20')).body;
  assert.equal(withGrace[0].installments_count, 1);

  const ended = (await call('POST', `/leases/${lease.body.id}/end`, { end_date: '2026-03-15' })).body;
  assert.equal(ended.status, 'ended');
  assert.equal(ended.installments.length, 3);
});

test('appointments CRUD and validation', async () => {
  assert.equal((await call('POST', '/appointments', { type: 'viewing' })).status, 400);
  const a = (await call('POST', '/appointments', { title: 'معاينة', type: 'viewing', scheduled_at: '2099-01-01T10:00' })).body;
  const updated = (await call('PUT', `/appointments/${a.id}`, { status: 'done' })).body;
  assert.equal(updated.status, 'done');
  assert.equal((await call('DELETE', `/appointments/${a.id}`)).status, 204);
  assert.equal((await call('GET', `/appointments/${a.id}`)).status, 404);
});

test('historical paid lease counts as expired revenue; delete works', async () => {
  const prop = (await call('POST', '/properties', { name: 'مجمع' })).body;
  const unit = (await call('POST', '/units', { property_id: prop.id, unit_number: 'H1' })).body;
  const tenant = (await call('POST', '/tenants', { full_name: 'عميل سابق' })).body;

  const before = (await call('GET', '/reports/overview')).body;
  const lease = await call('POST', '/leases', {
    unit_id: String(unit.id), tenant_id: String(tenant.id), contract_number: '555',
    start_date: '2020-01-01', end_date: '2021-01-01', rent_amount: '12000', payment_cycle: 'annual', mark_paid: 'on',
  });
  assert.equal(lease.status, 201);
  assert.equal(lease.body.effective_status, 'expired');
  assert.equal(lease.body.installments[0].status, 'paid');

  const after = (await call('GET', '/reports/overview')).body;
  assert.equal(after.total, before.total + 1);
  assert.equal(after.expired, before.expired + 1);
  assert.equal(after.revenue_total, before.revenue_total + 12000);

  const summary = (await call('GET', '/units/summary')).body.find((u) => u.id === unit.id);
  assert.equal(summary.revenue, 12000);
  assert.equal(summary.occupied, 0);

  // لا يمكن حذف عميل له عقد، لكن حذف العقد ثم العميل ينجح
  assert.equal((await call('DELETE', `/tenants/${tenant.id}`)).status, 409);
  assert.equal((await call('DELETE', `/leases/${lease.body.id}`)).status, 204);
  assert.equal((await call('DELETE', `/tenants/${tenant.id}`)).status, 204);
  assert.equal((await call('GET', '/reports/overview')).body.revenue_total, before.revenue_total);
});

test('alerts endpoint returns the three sections', async () => {
  const d = (await call('GET', '/reports/alerts')).body;
  assert.ok(Array.isArray(d.expiring) && Array.isArray(d.overdue) && Array.isArray(d.appointments));
});

test('excel import: dry run changes nothing, real run creates leases and reports row errors', async () => {
  const file = fs.readFileSync(path.join(__dirname, 'fixtures/leases.xlsx'));
  const post = async (qs) => {
    const res = await fetch(`${base}/import/leases?${qs}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
    return { status: res.status, body: await res.json() };
  };
  const before = (await call('GET', '/reports/overview')).body;

  const dry = await post('dry_run=1');
  assert.equal(dry.status, 200);
  assert.equal(dry.body.created, 4);
  assert.equal((await call('GET', '/reports/overview')).body.total, before.total); // لم يُحفظ شيء

  const real = (await post('dry_run=0')).body;
  assert.deepEqual(
    [real.total, real.created, real.skipped, real.errors.length, real.new_tenants, real.new_units],
    [7, 4, 1, 2, 3, 3]
  );
  assert.deepEqual(real.errors.map((e) => e.row), [6, 7]);

  const after = (await call('GET', '/reports/overview')).body;
  assert.equal(after.total, before.total + 4);
  assert.equal(after.revenue_total, before.revenue_total + 80000);
  assert.equal(after.early_ended, before.early_ended + 1);

  // الاستيراد مرة ثانية لا يكرر شيئاً (رقم العقد)
  const again = (await post('dry_run=0')).body;
  assert.equal(again.created, 0);
  assert.equal(again.skipped, 5);

  const leases = (await call('GET', '/leases')).body.filter((l) => ['9002', '9003'].includes(l.contract_number));
  assert.equal(leases.find((l) => l.contract_number === '9002').start_date, '2022-01-27');
  assert.equal(leases.find((l) => l.contract_number === '9003').effective_status, 'ended');

  // ملف غير صالح
  const bad = await fetch(`${base}/import/leases`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: Buffer.from('not excel') });
  assert.equal(bad.status, 400);
});
