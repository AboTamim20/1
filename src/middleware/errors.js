class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function notFound(req, res) {
  res.status(404).json({ error: 'المسار غير موجود' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (/FOREIGN KEY constraint failed/.test(err.message)) {
    return res.status(409).json({ error: 'لا يمكن تنفيذ العملية بسبب ارتباط السجل ببيانات أخرى' });
  }
  if (/UNIQUE constraint failed/.test(err.message)) {
    return res.status(409).json({ error: 'السجل موجود مسبقاً' });
  }
  console.error(err);
  res.status(500).json({ error: 'خطأ داخلي في الخادم' });
}

module.exports = { HttpError, notFound, errorHandler };
