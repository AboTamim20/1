// شاشات التطبيق — كل شاشة دالة تُرجع عنصراً جاهزاً للعرض
const money = (n) => Number(n || 0).toLocaleString('ar-SA', { maximumFractionDigits: 2 }) + ' ر.س';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const LABELS = {
  monthly: 'شهري', quarterly: 'ربع سنوي', semiannual: 'نصف سنوي', annual: 'سنوي',
  active: 'ساري', ended: 'منتهي', terminated: 'مفسوخ',
  vacant: 'شاغرة', occupied: 'مؤجرة', maintenance: 'صيانة',
  viewing: 'معاينة', collection: 'تحصيل', renewal: 'تجديد', other: 'أخرى',
  scheduled: 'مجدول', done: 'تم', cancelled: 'ملغي',
  pending: 'مستحق', partial: 'جزئي', paid: 'مدفوع',
  cash: 'نقدي', transfer: 'تحويل', cheque: 'شيك', card: 'بطاقة',
};
const label = (k) => LABELS[k] || k;

function table(columns, rows) {
  if (!rows.length) return '<div class="empty">لا توجد بيانات</div>';
  const head = columns.map((c) => `<th>${c.title}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${columns.map((c) => `<td>${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}</tr>`)
    .join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function card(title, value, cls = '') {
  return `<div class="card ${cls}"><div class="label">${title}</div><div class="value">${value}</div></div>`;
}

function options(items, valueKey, textFn, placeholder) {
  return (placeholder ? `<option value="">${placeholder}</option>` : '') +
    items.map((i) => `<option value="${i[valueKey]}">${esc(textFn(i))}</option>`).join('');
}

// يحوّل نموذجاً إلى كائن ويتجاهل الحقول الفارغة
function formData(form) {
  return Object.fromEntries([...new FormData(form)].filter(([, v]) => v !== ''));
}

const views = {
  async dashboard() {
    const [d, upcomingDues, appts] = await Promise.all([
      api.get('/reports/dashboard'),
      api.get('/reports/upcoming-dues?days=7'),
      api.get('/appointments/upcoming?days=7'),
    ]);
    return `
      <div class="cards">
        ${card('العقارات', d.properties)}
        ${card('الوحدات المؤجرة', `${d.units.occupied} / ${d.units.total}`)}
        ${card('العقود السارية', d.active_leases)}
        ${card('المحصّل هذا الشهر', money(d.collected_this_month))}
        ${card('المتأخرون', d.overdue.tenants, 'danger')}
        ${card('إجمالي المتأخرات', money(d.overdue.total), 'danger')}
      </div>
      <h2>أقساط مستحقة خلال 7 أيام</h2>
      ${table([
        { title: 'المستأجر', key: 'tenant_name' },
        { title: 'الوحدة', key: 'unit_number' },
        { title: 'تاريخ الاستحقاق', key: 'due_date' },
        { title: 'المتبقي', render: (r) => money(r.balance) },
      ], upcomingDues)}
      <h2>مواعيد الأسبوع</h2>
      ${table([
        { title: 'الموعد', key: 'title' },
        { title: 'النوع', render: (r) => label(r.type) },
        { title: 'الوقت', render: (r) => esc(r.scheduled_at.replace('T', ' ')) },
        { title: 'المستأجر', key: 'tenant_name' },
      ], appts)}
      <h2>عقود تنتهي خلال 30 يوماً</h2>
      ${table([
        { title: 'المستأجر', key: 'tenant_name' },
        { title: 'الوحدة', key: 'unit_number' },
        { title: 'تاريخ الانتهاء', key: 'end_date' },
      ], d.expiring_leases)}`;
  },

  async overdue() {
    const rows = await api.get('/reports/overdue');
    const severity = (days) => (days > 30 ? 'late' : 'warn');
    return `
      <h2>المستأجرون المتأخرون عن السداد</h2>
      ${table([
        { title: 'المستأجر', key: 'tenant_name' },
        { title: 'الجوال', render: (r) => r.phone ? `<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` : '' },
        { title: 'عدد الأقساط', key: 'installments_count' },
        { title: 'المبلغ المتأخر', render: (r) => money(r.total_balance) },
        { title: 'أقصى تأخير', render: (r) => `<span class="badge ${severity(r.max_days_late)}">${r.max_days_late} يوم</span>` },
        { title: 'الوحدات', render: (r) => esc([...new Set(r.installments.map((i) => `${i.property_name} - ${i.unit_number}`))].join('، ')) },
        { title: '', render: (r) => `<button class="link" data-remind="${r.tenant_id}">جدولة تحصيل</button>` },
      ], rows)}`;
  },

  async appointments() {
    const [rows, tenants, units] = await Promise.all([
      api.get('/appointments'), api.get('/tenants'), api.get('/units'),
    ]);
    return `
      <form class="inline" data-create="/appointments">
        <input name="title" placeholder="عنوان الموعد" required />
        <select name="type">${options(['viewing', 'maintenance', 'collection', 'renewal', 'other'].map((v) => ({ v })), 'v', (o) => label(o.v))}</select>
        <input name="scheduled_at" type="datetime-local" required />
        <select name="tenant_id">${options(tenants, 'id', (t) => t.full_name, 'المستأجر (اختياري)')}</select>
        <select name="unit_id">${options(units, 'id', (u) => u.unit_number, 'الوحدة (اختياري)')}</select>
        <button class="primary">إضافة موعد</button>
      </form>
      ${table([
        { title: 'الموعد', key: 'title' },
        { title: 'النوع', render: (r) => label(r.type) },
        { title: 'الوقت', render: (r) => esc(r.scheduled_at.replace('T', ' ')) },
        { title: 'الحالة', render: (r) => `<span class="badge ${r.status === 'done' ? 'ok' : ''}">${label(r.status)}</span>` },
        { title: '', render: (r) => r.status === 'scheduled'
          ? `<button class="link" data-appt-done="${r.id}">تم</button> · <button class="link" data-appt-cancel="${r.id}">إلغاء</button>` : '' },
      ], rows)}`;
  },

  async leases() {
    const [rows, tenants, units] = await Promise.all([
      api.get('/leases'), api.get('/tenants'), api.get('/units?status=vacant'),
    ]);
    return `
      <form class="inline" data-create="/leases">
        <select name="tenant_id" required>${options(tenants, 'id', (t) => t.full_name, 'المستأجر')}</select>
        <select name="unit_id" required>${options(units, 'id', (u) => u.unit_number, 'وحدة شاغرة')}</select>
        <input name="start_date" type="date" required title="بداية العقد" />
        <input name="end_date" type="date" required title="نهاية العقد" />
        <input name="rent_amount" type="number" step="0.01" placeholder="قيمة القسط" required />
        <select name="payment_cycle">${options(['monthly', 'quarterly', 'semiannual', 'annual'].map((v) => ({ v })), 'v', (o) => label(o.v))}</select>
        <input name="deposit" type="number" step="0.01" placeholder="التأمين" />
        <button class="primary">إنشاء عقد</button>
      </form>
      ${table([
        { title: '#', key: 'id' },
        { title: 'المستأجر', key: 'tenant_name' },
        { title: 'العقار / الوحدة', render: (r) => esc(`${r.property_name} - ${r.unit_number}`) },
        { title: 'من', key: 'start_date' },
        { title: 'إلى', key: 'end_date' },
        { title: 'القسط', render: (r) => `${money(r.rent_amount)} (${label(r.payment_cycle)})` },
        { title: 'الحالة', render: (r) => label(r.status) },
        { title: '', render: (r) => `<button class="link" data-lease="${r.id}">الأقساط</button>` +
          (r.status === 'active' ? ` · <button class="link" data-lease-end="${r.id}">إنهاء</button>` : '') },
      ], rows)}
      <div id="lease-detail"></div>`;
  },

  async leaseDetail(id) {
    const lease = await api.get(`/leases/${id}`);
    return `
      <h2>أقساط العقد #${lease.id} — ${esc(lease.tenant_name)}</h2>
      ${table([
        { title: 'الاستحقاق', key: 'due_date' },
        { title: 'المبلغ', render: (r) => money(r.amount) },
        { title: 'المدفوع', render: (r) => money(r.paid_amount) },
        { title: 'الحالة', render: (r) => `<span class="badge ${r.status === 'paid' ? 'ok' : r.status === 'partial' ? 'warn' : ''}">${label(r.status)}</span>` },
        { title: '', render: (r) => r.status !== 'paid'
          ? `<button class="link" data-pay="${r.id}" data-balance="${r.amount - r.paid_amount}" data-lease-id="${lease.id}">تسجيل دفعة</button>` : '' },
      ], lease.installments)}`;
  },

  async tenants() {
    const rows = await api.get('/tenants');
    return `
      <form class="inline" data-create="/tenants">
        <input name="full_name" placeholder="الاسم الكامل" required />
        <input name="phone" placeholder="الجوال" />
        <input name="national_id" placeholder="رقم الهوية" />
        <input name="email" type="email" placeholder="البريد الإلكتروني" />
        <button class="primary">إضافة مستأجر</button>
      </form>
      ${table([
        { title: 'الاسم', key: 'full_name' },
        { title: 'الجوال', key: 'phone' },
        { title: 'الهوية', key: 'national_id' },
        { title: 'البريد', key: 'email' },
      ], rows)}`;
  },

  async properties() {
    const [props, units] = await Promise.all([api.get('/properties'), api.get('/units')]);
    const propName = Object.fromEntries(props.map((p) => [p.id, p.name]));
    return `
      <form class="inline" data-create="/properties">
        <input name="name" placeholder="اسم العقار" required />
        <input name="address" placeholder="العنوان" />
        <button class="primary">إضافة عقار</button>
      </form>
      <form class="inline" data-create="/units">
        <select name="property_id" required>${options(props, 'id', (p) => p.name, 'العقار')}</select>
        <input name="unit_number" placeholder="رقم الوحدة" required />
        <input name="rent_amount" type="number" step="0.01" placeholder="الإيجار" />
        <button class="primary">إضافة وحدة</button>
      </form>
      ${table([
        { title: 'العقار', render: (u) => esc(propName[u.property_id]) },
        { title: 'الوحدة', key: 'unit_number' },
        { title: 'الإيجار', render: (u) => money(u.rent_amount) },
        { title: 'الحالة', render: (u) => `<span class="badge ${u.status === 'occupied' ? 'ok' : ''}">${label(u.status)}</span>` },
      ], units)}`;
  },

  async payments() {
    const rows = await api.get('/payments');
    return `
      <h2>سجل الدفعات</h2>
      ${table([
        { title: 'التاريخ', key: 'paid_at' },
        { title: 'المستأجر', key: 'tenant_name' },
        { title: 'قسط بتاريخ', key: 'due_date' },
        { title: 'المبلغ', render: (r) => money(r.amount) },
        { title: 'الطريقة', render: (r) => label(r.method) },
        { title: 'المرجع', key: 'reference' },
      ], rows)}`;
  },
};
