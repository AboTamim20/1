const express = require('express');
const leases = require('../services/leaseService');

const router = express.Router();

router.get('/', (req, res) => res.json(leases.listLeases(req.query)));
router.get('/:id', (req, res) => res.json(leases.getLease(req.params.id)));
router.post('/', (req, res) => res.status(201).json(leases.createLease(req.body)));
router.post('/:id/end', (req, res) => res.json(leases.endLease(req.params.id, req.body)));

module.exports = router;
