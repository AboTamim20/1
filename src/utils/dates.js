// أدوات التواريخ — نتعامل مع التواريخ كنص YYYY-MM-DD لتجنب مشاكل المناطق الزمنية

const CYCLE_MONTHS = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addMonths(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

function daysBetween(fromStr, toStr) {
  return Math.round((Date.parse(toStr) - Date.parse(fromStr)) / 86400000);
}

module.exports = { CYCLE_MONTHS, today, addMonths, daysBetween };
