const { openDb } = require('./db');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT || 3000);

openDb();
createApp().listen(PORT, () => {
  console.log(`تطبيق إدارة الإيجارات يعمل على http://localhost:${PORT}`);
});
