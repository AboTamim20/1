const path = require('node:path');
const express = require('express');
const { crudRouter } = require('./routes/crud');
const { notFound, errorHandler } = require('./middleware/errors');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../public')));

  const api = express.Router();
  api.use(
    '/properties',
    crudRouter({ table: 'properties', fields: ['name', 'address', 'type', 'notes'], required: ['name'] })
  );
  api.use('/units', require('./routes/units'));
  api.use(
    '/tenants',
    crudRouter({
      table: 'tenants',
      fields: ['full_name', 'phone', 'email', 'national_id', 'notes'],
      required: ['full_name'],
      orderBy: 'full_name',
    })
  );
  api.use('/leases', require('./routes/leases'));
  api.use('/payments', require('./routes/payments'));
  api.use('/appointments', require('./routes/appointments'));
  api.use('/reports', require('./routes/reports'));

  app.use('/api', api);
  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
