const express = require('express');
const { getDb } = require('../db');
const { crudRouter } = require('./crud');

const router = express.Router();

// المواعيد القادمة مع اسم المستأجر والوحدة — يجب أن يسبق /:id
router.get('/upcoming', (req, res) => {
  const days = Number(req.query.days || 7);
  res.json(
    getDb()
      .prepare(
        `SELECT a.*, t.full_name AS tenant_name, u.unit_number
         FROM appointments a
         LEFT JOIN tenants t ON t.id = a.tenant_id
         LEFT JOIN units u ON u.id = a.unit_id
         WHERE a.status = 'scheduled'
           AND a.scheduled_at >= strftime('%Y-%m-%dT%H:%M', 'now')
           AND a.scheduled_at <= strftime('%Y-%m-%dT%H:%M', 'now', '+' || ? || ' days')
         ORDER BY a.scheduled_at`
      )
      .all(days)
  );
});

router.use(
  crudRouter({
    table: 'appointments',
    fields: ['title', 'type', 'scheduled_at', 'tenant_id', 'unit_id', 'status', 'notes'],
    required: ['title', 'scheduled_at'],
    filters: ['status', 'type', 'tenant_id', 'unit_id'],
    orderBy: 'scheduled_at ASC',
  })
);

module.exports = router;
