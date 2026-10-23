const express = require('express');
const { getDb } = require('../db');
const overdue = require('../services/overdueService');

const router = express.Router();

router.get('/overdue', (req, res) => {
  const opts = { asOf: req.query.as_of, graceDays: req.query.grace_days };
  for (const k of Object.keys(opts)) if (opts[k] === undefined) delete opts[k];
  res.json(req.query.group === 'installment' ? overdue.overdueInstallments(opts) : overdue.overdueTenants(opts));
});

router.get('/upcoming-dues', (req, res) => {
  res.json(overdue.upcomingInstallments({ days: Number(req.query.days || 7) }));
});

// ملخص لوحة التحكم
router.get('/dashboard', (req, res) => {
  const db = getDb();
  const units = db.prepare(`SELECT status, COUNT(*) AS n FROM units GROUP BY status`).all();
  const count = (s) => units.find((u) => u.status === s)?.n || 0;
  const late = overdue.overdueTenants();
  const month = new Date().toISOString().slice(0, 7);

  res.json({
    properties: db.prepare('SELECT COUNT(*) AS n FROM properties').get().n,
    units: { total: units.reduce((s, u) => s + u.n, 0), occupied: count('occupied'), vacant: count('vacant') },
    active_leases: db.prepare(`SELECT COUNT(*) AS n FROM leases WHERE status = 'active'`).get().n,
    collected_this_month: db
      .prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE substr(paid_at, 1, 7) = ?`)
      .get(month).s,
    overdue: { tenants: late.length, total: late.reduce((s, t) => s + t.total_balance, 0) },
    upcoming_appointments: db
      .prepare(
        `SELECT COUNT(*) AS n FROM appointments
         WHERE status = 'scheduled' AND scheduled_at >= strftime('%Y-%m-%dT%H:%M', 'now')
           AND scheduled_at <= strftime('%Y-%m-%dT%H:%M', 'now', '+7 days')`
      )
      .get().n,
    expiring_leases: db
      .prepare(
        `SELECT l.id, l.end_date, t.full_name AS tenant_name, u.unit_number
         FROM leases l JOIN tenants t ON t.id = l.tenant_id JOIN units u ON u.id = l.unit_id
         WHERE l.status = 'active' AND l.end_date <= date('now', '+30 days')
         ORDER BY l.end_date`
      )
      .all(),
  });
});

module.exports = router;
