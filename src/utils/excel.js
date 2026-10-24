// تحويل قيم خلايا Excel (عربية أو إنجليزية) إلى قيم قياسية

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function westernDigits(s) {
  return String(s)
    .replace(/[٠-٩]/g, (d) => AR_DIGITS.indexOf(d))
    .replace(/[۰-۹]/g, (d) => FA_DIGITS.indexOf(d))
    .replace(/[٬،]/g, ',')
    .replace(/٫/g, '.');
}

const MONTHS = {
  يناير: 1, 'كانون الثاني': 1, فبراير: 2, شباط: 2, مارس: 3, آذار: 3, أبريل: 4, ابريل: 4, نيسان: 4,
  مايو: 5, أيار: 5, يونيو: 6, حزيران: 6, يوليو: 7, تموز: 7, أغسطس: 8, اغسطس: 8, آب: 8,
  سبتمبر: 9, أيلول: 9, أكتوبر: 10, اكتوبر: 10, 'تشرين الأول': 10, نوفمبر: 11, 'تشرين الثاني': 11,
  ديسمبر: 12, 'كانون الأول': 12,
};

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
};

// يرجع YYYY-MM-DD أو null إن تعذر الفهم
function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10); // رقم تسلسلي Excel

  const s = westernDigits(v).trim().replace(/\s+/g, ' ');
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2}) (.+?) (\d{4})/);
  if (m && MONTHS[m[2]]) return iso(+m[3], MONTHS[m[2]], +m[1]);
  return null;
}

// يرجع رقماً أو null
function parseNumber(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(westernDigits(v).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) && /\d/.test(String(westernDigits(v))) ? n : null;
}

const text = (v) => (v === null || v === undefined ? '' : westernDigits(v instanceof Date ? '' : v).trim());
// نص يحافظ على الأرقام كما هي (أرقام العقود والهوية والجوال) دون تحويل
const rawText = (v) => (v === null || v === undefined ? '' : String(v).trim());

module.exports = { parseDate, parseNumber, text, rawText };
