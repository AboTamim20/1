const readXlsx = require('read-excel-file/node');
const { getDb, transaction } = require('../db');
const { HttpError } = require('../middleware/errors');
const { createLease } = require('./leaseService');
const { today } = require('../utils/dates');
const { parseDate, parseNumber, rawText } = require('../utils/excel');

// أسماء الأعمدة المقبولة لكل حقل (تُقارن بعد التنظيف)
const COLUMNS = {
  contract_number: ['رقم العقد', 'العقد', 'رقم', 'contract', 'contract number'],
  tenant: ['اسم المستأجر', 'المستأجر', 'اسم العميل', 'العميل', 'الاسم', 'tenant', 'name'],
  unit: ['الوحدة', 'اسم الوحدة', 'الوحدة السكنية', 'الاستراحة', 'رقم الوحدة', 'unit'],
  property: ['العقار', 'اسم العقار', 'property'],
  start_date: ['تاريخ البداية', 'تاريخ بداية العقد', 'البداية', 'بداية العقد', 'من', 'start', 'start date'],
  end_date: ['تاريخ الانتهاء', 'تاريخ نهاية العقد', 'تاريخ النهاية', 'الانتهاء', 'النهاية', 'نهاية العقد', 'إلى', 'الى', 'end', 'end date'],
  amount: ['قيمة العقد', 'قيمة الإيجار', 'قيمة الايجار', 'الإيجار', 'الايجار', 'المبلغ', 'القيمة', 'الإيراد', 'الايراد', 'amount', 'rent'],
  status: ['الحالة', 'status'],
  phone: ['الجوال', 'رقم الجوال', 'الهاتف', 'رقم الهاتف', 'phone', 'mobile'],
  national_id: ['الهوية', 'رقم الهوية', 'national id'],
};

const clean = (h) => String(h ?? '').replace(/[ً-ٟـ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

function mapHeader(headerRow) {
  const idx = {};
  const normalized = headerRow.map(clean);
  for (const [field, names] of Object.entries(COLUMNS)) {
    const wanted = names.map(clean);
    const i = normalized.findIndex((h) => wanted.includes(h));
    if (i >= 0) idx[field] = i;
  }
  return idx;
}

// يحوّل نص الحالة إلى (active | ended | terminated)؛ المنتهي بتاريخه يُحسب تلقائياً من التواريخ
function mapStatus(s) {
  const t = String(s ?? '');
  if (/فسخ|مفسوخ|ملغ/.test(t)) return 'terminated';
  if (/إنهاء|انهاء|تم الإنهاء|محلول/.test(t)) return 'ended';
  return 'active';
}

async function importLeases(buffer, { dryRun = false, markPaid = true } = {}) {
  let rows;
  try {
    rows = await readXlsx.readSheet(buffer);
  } catch {
    throw new HttpError(400, 'تعذر قراءة الملف. تأكد أنه بصيغة Excel ‎.xlsx');
  }
  if (rows.length < 2) throw new HttpError(400, 'الملف فارغ أو لا يحتوي على صفوف بيانات');

  const col = mapHeader(rows[0]);
  const missing = ['tenant', 'unit', 'start_date', 'end_date'].filter((f) => col[f] === undefined);
  if (missing.length) {
    const ar = { tenant: 'اسم المستأجر', unit: 'الوحدة', start_date: 'تاريخ البداية', end_date: 'تاريخ الانتهاء' };
    throw new HttpError(400, `أعمدة مطلوبة غير موجودة في الصف الأول: ${missing.map((m) => ar[m]).join('، ')}`);
  }

  const summary = { total: 0, created: 0, skipped: 0, new_tenants: 0, new_units: 0, errors: [], columns: Object.keys(col) };
  const DRY = Symbol('dry');

  const run = () => {
    const db = getDb();
    const tenantCache = new Map(db.prepare('SELECT id, full_name FROM tenants').all().map((t) => [t.full_name.trim(), t.id]));
    const unitCache = new Map(db.prepare('SELECT id, unit_number FROM units').all().map((u) => [u.unit_number.trim(), u.id]));
    const propCache = new Map(db.prepare('SELECT id, name FROM properties').all().map((p) => [p.name.trim(), p.id]));
    const hasContract = db.prepare('SELECT id FROM leases WHERE contract_number = ?');
    const get = (r, f) => (col[f] === undefined ? null : r[col[f]]);

    rows.slice(1).forEach((r, i) => {
      if (r.every((c) => c === null || c === '')) return; // صف فارغ
      const line = i + 2;
      summary.total++;
      const fail = (msg) => summary.errors.push({ row: line, message: msg });

      const tenantName = rawText(get(r, 'tenant'));
      const unitName = rawText(get(r, 'unit'));
      const start = parseDate(get(r, 'start_date'));
      const end = parseDate(get(r, 'end_date'));
      const contractNo = rawText(get(r, 'contract_number')) || null;
      const amountRaw = get(r, 'amount');
      const amount = amountRaw === null || amountRaw === '' ? 0 : parseNumber(amountRaw);

      if (!tenantName) return fail('اسم المستأجر فارغ');
      if (!unitName) return fail('اسم الوحدة فارغ');
      if (!start) return fail(`تاريخ البداية غير مفهوم: «${rawText(get(r, 'start_date'))}»`);
      if (!end) return fail(`تاريخ الانتهاء غير مفهوم: «${rawText(get(r, 'end_date'))}»`);
      if (amount === null || amount < 0) return fail(`قيمة العقد غير صحيحة: «${rawText(amountRaw)}»`);
      if (contractNo && hasContract.get(contractNo)) {
        summary.skipped++;
        return;
      }

      // ما أُضيف في هذا الصف يُتراجع عنه إن فشل، فنُرجع الذاكرة المؤقتة والعدّادات معه
      const undo = [];
      try {
        // كل صف في savepoint: فشله لا يلغي بقية الصفوف
        transaction((conn) => {
          let tenantId = tenantCache.get(tenantName);
          if (!tenantId) {
            tenantId = conn
              .prepare('INSERT INTO tenants (full_name, phone, national_id) VALUES (?, ?, ?)')
              .run(tenantName, rawText(get(r, 'phone')) || null, rawText(get(r, 'national_id')) || null).lastInsertRowid;
            tenantCache.set(tenantName, tenantId);
            summary.new_tenants++;
            undo.push(() => { tenantCache.delete(tenantName); summary.new_tenants--; });
          }

          let unitId = unitCache.get(unitName);
          if (!unitId) {
            const propName = rawText(get(r, 'property')) || 'العقارات المستوردة';
            let propId = propCache.get(propName);
            if (!propId) {
              propId = conn.prepare('INSERT INTO properties (name) VALUES (?)').run(propName).lastInsertRowid;
              propCache.set(propName, propId);
              undo.push(() => propCache.delete(propName));
            }
            unitId = conn.prepare('INSERT INTO units (property_id, unit_number) VALUES (?, ?)').run(propId, unitName).lastInsertRowid;
            unitCache.set(unitName, unitId);
            summary.new_units++;
            undo.push(() => { unitCache.delete(unitName); summary.new_units--; });
          }

          const status = mapStatus(get(r, 'status'));
          // نُنشئ العقد ساريّاً ثم نغيّر حالته إن كان مُنهىً أو مفسوخاً (الفحص يتجاهل غير الساري)
          const lease = createLease({
            unit_id: unitId, tenant_id: tenantId, contract_number: contractNo, start_date: start, end_date: end,
            rent_amount: amount, payment_cycle: 'once', mark_paid: markPaid && amount > 0,
          });
          if (status !== 'active') {
            conn.prepare('UPDATE leases SET status = ? WHERE id = ?').run(status, lease.id);
            conn.prepare(
              `UPDATE units SET status = 'vacant' WHERE id = ?
                 AND NOT EXISTS (SELECT 1 FROM leases WHERE unit_id = units.id AND status = 'active' AND end_date >= ?)`
            ).run(unitId, today());
          }
          summary.created++;
        });
      } catch (e) {
        undo.forEach((f) => f());
        fail(e instanceof HttpError ? e.message : 'تعذر حفظ الصف');
      }
    });

    if (dryRun) throw DRY;
  };

  try {
    transaction(run);
  } catch (e) {
    if (e !== DRY) throw e;
  }
  return { dry_run: dryRun, ...summary };
}

module.exports = { importLeases };
