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
  assert.equal((await call('GET', `/units/${unit.id}`)).body.status, 'occupied');

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
  assert.equal((await call('GET', `/units/${unit.id}`)).body.status, 'vacant');
});

test('appointments CRUD and validation', async () => {
  assert.equal((await call('POST', '/appointments', { type: 'viewing' })).status, 400);
  const a = (await call('POST', '/appointments', { title: 'معاينة', type: 'viewing', scheduled_at: '2099-01-01T10:00' })).body;
  const updated = (await call('PUT', `/appointments/${a.id}`, { status: 'done' })).body;
  assert.equal(updated.status, 'done');
  assert.equal((await call('DELETE', `/appointments/${a.id}`)).status, 204);
  assert.equal((await call('GET', `/appointments/${a.id}`)).status, 404);
});

test('dashboard returns summary', async () => {
  const d = (await call('GET', '/reports/dashboard')).body;
  assert.equal(typeof d.units.total, 'number');
  assert.ok('overdue' in d);
});
