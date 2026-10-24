const express = require('express');
const { importLeases } = require('../services/importService');
const { HttpError } = require('../middleware/errors');

const router = express.Router();

// يستقبل ملف xlsx خاماً في جسم الطلب. ‎?dry_run=1 للمعاينة دون حفظ، ‎?mark_paid=0 لإبقاء الأقساط غير مسددة
router.post('/leases', express.raw({ type: 'application/octet-stream', limit: '20mb' }), async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'لم يتم إرسال ملف');
    const flag = (v, d) => (v === undefined ? d : v === '1' || v === 'true');
    res.json(await importLeases(req.body, { dryRun: flag(req.query.dry_run, false), markPaid: flag(req.query.mark_paid, true) }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
