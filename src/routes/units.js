const express = require('express');
const { getDb } = require('../db');
const { crudRouter } = require('./crud');

const router = express.Router();

// الوحدات مع إيراداتها وحالة الإشغال الفعلية — يجب أن يسبق /:id
router.get('/summary', (req, res) => {
  res.json(
    getDb()
      .prepare(
        `SELECT u.*, p.name AS property_name,
                COALESCE((SELECT SUM(pay.amount)
                          FROM payments pay
                          JOIN installments i ON i.id = pay.installment_id
                          JOIN leases l ON l.id = i.lease_id
                          WHERE l.unit_id = u.id), 0) AS revenue,
                (SELECT COUNT(*) FROM leases l WHERE l.unit_id = u.id) AS leases_count,
                EXISTS (SELECT 1 FROM leases l
                        WHERE l.unit_id = u.id AND l.status = 'active'
                          AND l.start_date <= date('now') AND l.end_date >= date('now')) AS occupied
         FROM units u JOIN properties p ON p.id = u.property_id
         ORDER BY revenue DESC, u.unit_number`
      )
      .all()
  );
});

router.use(
  crudRouter({
    table: 'units',
    fields: ['property_id', 'unit_number', 'rent_amount', 'status', 'notes'],
    required: ['property_id', 'unit_number'],
    filters: ['property_id', 'status'],
  })
);

module.exports = router;
