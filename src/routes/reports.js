const express = require('express');
const { getDb } = require('../db');
const overdue = require('../services/overdueService');
const { today, addMonths, daysBetween } = require('../utils/dates');

const router = express.Router();

router.get('/overdue', (req, res) => {
  const opts = { asOf: req.query.as_of, graceDays: req.query.grace_days };
  for (const k of Object.keys(opts)) if (opts[k] === undefined) delete opts[k];
  res.json(req.query.group === 'installment' ? overdue.overdueInstallments(opts) : overdue.overdueTenants(opts));
});

router.get('/upcoming-dues', (req, res) => {
  res.json(overdue.upcomingInstallments({ days: Number(req.query.days || 7) }));
});

const EXPIRING_DAYS = 60;

// النظرة العامة: بطاقات الإحصاء + الإيرادات الشهرية لآخر 12 شهراً
router.get('/overview', (req, res) => {
  const db = getDb();
  const one = (sql, ...p) => db.prepare(sql).get(...p);

  const total = one('SELECT COUNT(*) AS n FROM leases').n;
  const active = one(`SELECT COUNT(*) AS n FROM leases WHERE status = 'active' AND end_date >= date('now')`).n;
  const expiring = one(
    `SELECT COUNT(*) AS n FROM leases
     WHERE status = 'active' AND end_date >= date('now') AND end_date <= date('now', '+' || ? || ' days')`,
    EXPIRING_DAYS
  ).n;
  const expired = one(`SELECT COUNT(*) AS n FROM leases WHERE status = 'active' AND end_date < date('now')`).n;
  const early = one(`SELECT COUNT(*) AS n FROM leases WHERE status IN ('ended', 'terminated')`).n;
  const since = one(`SELECT MIN(substr(start_date, 1, 4)) AS y FROM leases`).y;

  const byMonth = Object.fromEntries(
    db.prepare(`SELECT substr(paid_at, 1, 7) AS m, SUM(amount) AS s FROM payments GROUP BY m`).all().map((r) => [r.m, r.s])
  );
  const firstOfMonth = `${today().slice(0, 7)}-01`;
  const monthly = [];
  for (let i = 11; i >= 0; i--) {
    const m = addMonths(firstOfMonth, -i).slice(0, 7);
    monthly.push({ month: m, total: byMonth[m] || 0 });
  }

  res.json({
    total,
    active,
    expiring_soon: expiring,
    expiring_days: EXPIRING_DAYS,
    expired,
    early_ended: early,
    since,
    revenue_total: one('SELECT COALESCE(SUM(amount), 0) AS s FROM payments').s,
    monthly,
  });
});

// التنبيهات: عقود تنتهي قريباً أو انتهت مؤخراً + متأخرون + مواعيد الأسبوع
router.get('/alerts', (req, res) => {
  const db = getDb();
  const expiring = db
    .prepare(
      `SELECT l.id, l.contract_number, l.end_date, t.full_name AS tenant_name, t.phone, u.unit_number
       FROM leases l JOIN tenants t ON t.id = l.tenant_id JOIN units u ON u.id = l.unit_id
       WHERE l.status = 'active'
         AND l.end_date <= date('now', '+' || ? || ' days') AND l.end_date >= date('now', '-30 days')
       ORDER BY l.end_date`
    )
    .all(EXPIRING_DAYS)
    .map((l) => ({ ...l, days_remaining: daysBetween(today(), l.end_date) }));

  const appointments = db
    .prepare(
      `SELECT a.*, t.full_name AS tenant_name, u.unit_number
       FROM appointments a
       LEFT JOIN tenants t ON t.id = a.tenant_id
       LEFT JOIN units u ON u.id = a.unit_id
       WHERE a.status = 'scheduled'
         AND a.scheduled_at >= strftime('%Y-%m-%dT%H:%M', 'now')
         AND a.scheduled_at <= strftime('%Y-%m-%dT%H:%M', 'now', '+7 days')
       ORDER BY a.scheduled_at`
    )
    .all();

  res.json({ expiring, overdue: overdue.overdueTenants(), appointments });
});

module.exports = router;
