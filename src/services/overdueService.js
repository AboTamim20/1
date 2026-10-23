const { getDb } = require('../db');
const { today, daysBetween } = require('../utils/dates');

// الأقساط المتأخرة: تاريخ استحقاقها مضى (مع مهلة سماح) ولم تُسدَّد بالكامل
function overdueInstallments({ asOf = today(), graceDays = Number(process.env.GRACE_DAYS || 0) } = {}) {
  const rows = getDb()
    .prepare(
      `SELECT i.id AS installment_id, i.due_date, i.amount, i.paid_amount,
              (i.amount - i.paid_amount) AS balance,
              l.id AS lease_id, t.id AS tenant_id, t.full_name AS tenant_name, t.phone,
              u.unit_number, p.name AS property_name
       FROM installments i
       JOIN leases l ON l.id = i.lease_id
       JOIN tenants t ON t.id = l.tenant_id
       JOIN units u ON u.id = l.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE i.status != 'paid' AND date(i.due_date, '+' || ? || ' days') < ?
       ORDER BY i.due_date`
    )
    .all(graceDays, asOf);
  return rows.map((r) => ({ ...r, days_late: daysBetween(r.due_date, asOf) }));
}

// تجميع المتأخرين حسب المستأجر مع إجمالي المبالغ وأقدم تأخير
function overdueTenants(opts) {
  const byTenant = new Map();
  for (const r of overdueInstallments(opts)) {
    const t = byTenant.get(r.tenant_id) || {
      tenant_id: r.tenant_id,
      tenant_name: r.tenant_name,
      phone: r.phone,
      total_balance: 0,
      installments_count: 0,
      max_days_late: 0,
      installments: [],
    };
    t.total_balance += r.balance;
    t.installments_count += 1;
    t.max_days_late = Math.max(t.max_days_late, r.days_late);
    t.installments.push(r);
    byTenant.set(r.tenant_id, t);
  }
  return [...byTenant.values()].sort((a, b) => b.max_days_late - a.max_days_late);
}

// الأقساط المستحقة خلال الأيام القادمة (للتذكير قبل التأخر)
function upcomingInstallments({ days = 7, asOf = today() } = {}) {
  return getDb()
    .prepare(
      `SELECT i.*, (i.amount - i.paid_amount) AS balance, t.full_name AS tenant_name, t.phone, u.unit_number
       FROM installments i
       JOIN leases l ON l.id = i.lease_id
       JOIN tenants t ON t.id = l.tenant_id
       JOIN units u ON u.id = l.unit_id
       WHERE i.status != 'paid' AND i.due_date >= ? AND i.due_date <= date(?, '+' || ? || ' days')
       ORDER BY i.due_date`
    )
    .all(asOf, asOf, days);
}

module.exports = { overdueInstallments, overdueTenants, upcomingInstallments };
