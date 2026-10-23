const express = require('express');
const payments = require('../services/paymentService');

const router = express.Router();

router.get('/', (req, res) => res.json(payments.listPayments(req.query)));
router.post('/', (req, res) => res.status(201).json(payments.recordPayment(req.body)));

module.exports = router;
