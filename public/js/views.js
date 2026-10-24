// شاشات التطبيق — كل شاشة دالة تُرجع HTML، وما يحتاج ربطاً بعد العرض يوضع في after
const nf = new Intl.NumberFormat('ar-SA');
const money = (n) => nf.format(Math.round(Number(n || 0) * 100) / 100) + ' ر.س';
const fmtDate = (s) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString('ar-SA-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const fmtTime = (s) => (s ? s.replace('T', ' ') : '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const LABELS = {
  monthly: 'شهري', quarterly: 'ربع سنوي', semiannual: 'نصف سنوي', annual: 'سنوي',
  viewing: 'معاينة', maintenance: 'صيانة', collection: 'تحصيل', renewal: 'تجديد', other: 'أخرى',
  scheduled: 'مجدول', done: 'تم', cancelled: 'ملغي',
  pending: 'مستحق', partial: 'جزئي', paid: 'مدفوع',
};
const label = (k) => LABELS[k] || k;

const LEASE_BADGE = {
  active: ['ok', '✅ نشط'], expired: ['late', '❌ منتهي'], ended: ['warn', '⚠️ تم الإنهاء'], terminated: ['warn', '⚠️ مفسوخ'],
};
const leaseBadge = (s) => `<span class="badge ${LEASE_BADGE[s][0]}">${LEASE_BADGE[s][1]}</span>`;

function remaining(l) {
  if (l.days_remaining === null) return '<span class="muted">-</span>';
  if (l.days_remaining < 0) return `<span class="t-red">انتهى منذ ${nf.format(-l.days_remaining)} يوم</span>`;
  return `<span class="${l.days_remaining <= 60 ? 't-amber' : 't-green'}">${nf.format(l.days_remaining)} يوم</span>`;
}

function table(columns, rows, empty = 'لا توجد بيانات') {
  if (!rows.length) return `<div class="table-wrap"><div class="empty">${empty}</div></div>`;
  const head = columns.map((c) => `<th>${c.title}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${columns.map((c) => `<td>${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}</tr>`)
    .join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

const card = (icon, title, value, sub, cls) =>
  `<div class="card ${cls}"><div class="icon">${icon}</div><div class="label">${title}</div><div class="value">${value}</div><div class="sub">${sub || '&nbsp;'}</div></div>`;

const options = (items, valueKey, textFn, placeholder) =>
  (placeholder ? `<option value="">${placeholder}</option>` : '') +
  items.map((i) => `<option value="${i[valueKey]}">${esc(textFn(i))}</option>`).join('');

const delBtn = (path, id) => `<button class="link danger" data-del="${path}/${id}">حذف</button>`;

// يحوّل نموذجاً إلى كائن ويتجاهل الحقول الفارغة
function formData(form) {
  return Object.fromEntries([...new FormData(form)].filter(([, v]) => v !== ''));
}

// رسم أعمدة بسيط بصيغة SVG للإيرادات الشهرية (الأقدم يميناً)
function barChart(points) {
  const W = 1300, H = 280, pad = { t: 24, b: 30, l: 10, r: 10 };
  const max = Math.max(...points.map((p) => p.total), 1);
  const slot = (W - pad.l - pad.r) / points.length;
  const bars = points
    .map((p, i) => {
      const h = (p.total / max) * (H - pad.t - pad.b);
      const x = W - pad.r - slot * (i + 1) + slot * 0.2;
      const y = H - pad.b - h;
      const month = new Date(`${p.month}-01T00:00:00`).toLocaleDateString('ar-SA-u-ca-gregory', { month: 'short' });
      return `<rect x="${x}" y="${y}" width="${slot * 0.6}" height="${Math.max(h, 1)}" rx="4" fill="#3b82f6"/>` +
        (p.total ? `<text class="val" x="${x + slot * 0.3}" y="${y - 5}" text-anchor="middle">${nf.format(Math.round(p.total))}</text>` : '') +
        `<text x="${x + slot * 0.3}" y="${H - 10}" text-anchor="middle">${month}</text>`;
    })
    .join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="الإيرادات الشهرية">` +
    `<line x1="0" x2="${W}" y1="${H - pad.b}" y2="${H - pad.b}" stroke="#2a3547"/>${bars}</svg>`;
}

const views = {
  async overview() {
    const d = await api.get('/reports/overview');
    const since = d.since ? `منذ ${nf.format(d.since).replace(/٬/g, '')}` : '';
    return `
      <div class="cards">
        ${card('✅', 'عقود نشطة', nf.format(d.active), `من أصل ${nf.format(d.total)} عقد`, 'c-green')}
        ${card('📄', 'إجمالي العقود', nf.format(d.total), since, 'c-blue')}
        ${card('⚠️', 'تنتهي قريباً', nf.format(d.expiring_soon), `خلال ${nf.format(d.expiring_days)} يوم`, 'c-amber')}
        ${card('❌', 'منتهية/محلولة', nf.format(d.expired + d.early_ended), `منتهي: ${nf.format(d.expired)} | إنهاء: ${nf.format(d.early_ended)}`, 'c-red')}
        ${card('💰', 'إجمالي الإيرادات', money(d.revenue_total), `المحصّل فعلياً ${since}`, 'c-purple')}
      </div>
      <div class="panel"><h2>📈 الإيرادات الشهرية (ريال سعودي)</h2>${barChart(d.monthly)}</div>`;
  },

  async leases() {
    const [rows, tenants, units] = await Promise.all([api.get('/leases'), api.get('/tenants'), api.get('/units/summary')]);
    views._leases = rows;
    views._leaseUi = views._leaseUi || { search: '', status: '', page: 1 };
    const ui = views._leaseUi;
    return `
      <details class="form-panel"><summary>➕ إضافة عقد جديد</summary>
        <form data-create="/leases">
          <select name="tenant_id" required>${options(tenants, 'id', (t) => t.full_name, 'اختر العميل')}</select>
          <select name="unit_id" required>${options(units, 'id', (u) => `${u.unit_number} (${u.property_name})`, 'اختر الوحدة')}</select>
          <input name="contract_number" placeholder="رقم العقد" />
          <label class="check">من <input name="start_date" type="date" required /></label>
          <label class="check">إلى <input name="end_date" type="date" required /></label>
          <input name="rent_amount" type="number" step="0.01" min="0" placeholder="قيمة القسط" required />
          <select name="payment_cycle">${options(['annual', 'semiannual', 'quarterly', 'monthly'].map((v) => ({ v })), 'v', (o) => label(o.v))}</select>
          <input name="deposit" type="number" step="0.01" min="0" placeholder="التأمين (اختياري)" />
          <label class="check"><input name="mark_paid" type="checkbox" /> مسدّد بالكامل (عقد سابق)</label>
          <button class="primary">حفظ العقد</button>
          <div class="form-title">لا يوجد العميل؟ أضفه أولاً من تبويب «العملاء».</div>
        </form>
      </details>
      <div class="section-head"><h2>قائمة جميع العقود</h2><span class="muted" id="lease-count"></span></div>
      <div class="toolbar">
        <input id="lease-search" placeholder="🔍 ابحث بالاسم أو رقم العقد..." value="${esc(ui.search)}" />
        <select id="lease-status">
          <option value="">جميع الحالات</option>
          <option value="active">نشط</option><option value="expired">منتهي</option>
          <option value="ended">تم الإنهاء</option><option value="terminated">مفسوخ</option>
        </select>
      </div>
      <div id="lease-table"></div>
      <div id="lease-detail"></div>`;
  },

  async leaseDetail(id) {
    const lease = await api.get(`/leases/${id}`);
    return `
      <h2>أقساط العقد ${esc(lease.contract_number || '#' + lease.id)} — ${esc(lease.tenant_name)}</h2>
      ${table([
        { title: 'الاستحقاق', render: (r) => fmtDate(r.due_date) },
        { title: 'المبلغ', render: (r) => money(r.amount) },
        { title: 'المدفوع', render: (r) => money(r.paid_amount) },
        { title: 'الحالة', render: (r) => `<span class="badge ${r.status === 'paid' ? 'ok' : r.status === 'partial' ? 'warn' : 'info'}">${label(r.status)}</span>` },
        { title: '', render: (r) => r.status !== 'paid'
          ? `<button class="link" data-pay="${r.id}" data-balance="${r.amount - r.paid_amount}" data-lease-id="${lease.id}">تسجيل دفعة</button>` : '' },
      ], lease.installments)}`;
  },

  async tenants() {
    const [rows, leases] = await Promise.all([api.get('/tenants'), api.get('/leases')]);
    const count = (id, active) => leases.filter((l) => l.tenant_id === id && (!active || l.effective_status === 'active')).length;
    return `
      <details class="form-panel" open><summary>➕ إضافة عميل جديد</summary>
        <form data-create="/tenants">
          <input name="full_name" placeholder="اسم العميل الكامل" required />
          <input name="phone" placeholder="رقم الجوال" />
          <input name="national_id" placeholder="رقم الهوية" />
          <input name="email" type="email" placeholder="البريد الإلكتروني" />
          <button class="primary">إضافة العميل</button>
        </form>
      </details>
      <div class="section-head"><h2>العملاء</h2><span class="muted">${nf.format(rows.length)} عميل</span></div>
      ${table([
        { title: 'الاسم', key: 'full_name' },
        { title: 'الجوال', render: (r) => r.phone ? `<a class="num" href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` : '' },
        { title: 'الهوية', render: (r) => `<span class="num">${esc(r.national_id)}</span>` },
        { title: 'البريد', key: 'email' },
        { title: 'عقود نشطة', render: (r) => nf.format(count(r.id, true)) },
        { title: 'كل العقود', render: (r) => nf.format(count(r.id, false)) },
        { title: '', render: (r) => delBtn('/tenants', r.id) },
      ], rows, 'لا يوجد عملاء بعد')}`;
  },

  async units() {
    const [units, props] = await Promise.all([api.get('/units/summary'), api.get('/properties')]);
    return `
      <details class="form-panel"><summary>➕ إضافة عقار أو وحدة</summary>
        <form data-create="/properties">
          <div class="form-title">عقار جديد</div>
          <input name="name" placeholder="اسم العقار" required />
          <input name="address" placeholder="العنوان" />
          <button class="primary">إضافة عقار</button>
        </form>
        <form data-create="/units">
          <div class="form-title">وحدة جديدة</div>
          <select name="property_id" required>${options(props, 'id', (p) => p.name, 'اختر العقار')}</select>
          <input name="unit_number" placeholder="اسم/رقم الوحدة" required />
          <input name="rent_amount" type="number" step="0.01" min="0" placeholder="الإيجار المعتاد" />
          <button class="primary">إضافة وحدة</button>
        </form>
      </details>
      <h2>إجمالي الإيرادات لكل وحدة</h2>
      ${units.length ? `<div class="unit-cards">${units.map((u) => `
        <div class="unit-card">
          <div class="name">🏠 ${esc(u.unit_number)}</div>
          <div class="rev">${nf.format(Math.round(u.revenue))}</div>
          <div class="sub">ريال سعودي · ${nf.format(u.leases_count)} عقد</div>
          <div class="sub">${esc(u.property_name)} · ${u.occupied ? '<span class="t-green">مؤجرة</span>' : 'شاغرة'}</div>
          <div class="actions">${delBtn('/units', u.id)}</div>
        </div>`).join('')}</div>` : '<div class="table-wrap"><div class="empty">لا توجد وحدات بعد</div></div>'}
      <h2>العقارات</h2>
      ${table([
        { title: 'العقار', key: 'name' },
        { title: 'العنوان', key: 'address' },
        { title: '', render: (p) => delBtn('/properties', p.id) },
      ], props, 'لا توجد عقارات بعد')}`;
  },

  async alerts() {
    const d = await api.get('/reports/alerts');
    const section = (icon, title, body) => `<h2><span class="alert-title">${icon} ${title}</span></h2>${body}`;
    return `
      ${section('🔴', 'عقود منتهية مؤخراً أو قريبة الانتهاء', table([
        { title: 'رقم العقد', render: (r) => `<span class="num">${esc(r.contract_number || '#' + r.id)}</span>` },
        { title: 'العميل', key: 'tenant_name' },
        { title: 'الوحدة', key: 'unit_number' },
        { title: 'تاريخ الانتهاء', render: (r) => fmtDate(r.end_date) },
        { title: 'المتبقي', render: remaining },
      ], d.expiring, 'لا توجد عقود تحتاج تنبيهاً 👍'))}
      ${section('🟠', 'عملاء متأخرون عن السداد', table([
        { title: 'العميل', key: 'tenant_name' },
        { title: 'الجوال', render: (r) => r.phone ? `<a class="num" href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` : '' },
        { title: 'الأقساط المتأخرة', render: (r) => nf.format(r.installments_count) },
        { title: 'المبلغ المتأخر', render: (r) => `<span class="t-red">${money(r.total_balance)}</span>` },
        { title: 'أقصى تأخير', render: (r) => `<span class="badge ${r.max_days_late > 30 ? 'late' : 'warn'}">${nf.format(r.max_days_late)} يوم</span>` },
        { title: '', render: (r) => `<button class="link" data-remind="${r.tenant_id}">جدولة تحصيل</button>` },
      ], d.overdue, 'لا يوجد متأخرون 👍'))}
      ${section('🔵', 'مواعيد الأسبوع القادم', table([
        { title: 'الموعد', key: 'title' },
        { title: 'النوع', render: (r) => label(r.type) },
        { title: 'الوقت', render: (r) => fmtTime(r.scheduled_at) },
        { title: 'العميل', key: 'tenant_name' },
      ], d.appointments, 'لا توجد مواعيد قادمة'))}`;
  },

  async appointments() {
    const [rows, tenants, units] = await Promise.all([api.get('/appointments'), api.get('/tenants'), api.get('/units')]);
    return `
      <details class="form-panel" open><summary>➕ إضافة موعد</summary>
        <form data-create="/appointments">
          <input name="title" placeholder="عنوان الموعد" required />
          <select name="type">${options(['viewing', 'maintenance', 'collection', 'renewal', 'other'].map((v) => ({ v })), 'v', (o) => label(o.v))}</select>
          <input name="scheduled_at" type="datetime-local" required />
          <select name="tenant_id">${options(tenants, 'id', (t) => t.full_name, 'العميل (اختياري)')}</select>
          <select name="unit_id">${options(units, 'id', (u) => u.unit_number, 'الوحدة (اختياري)')}</select>
          <button class="primary">إضافة موعد</button>
        </form>
      </details>
      <h2>المواعيد</h2>
      ${table([
        { title: 'الموعد', key: 'title' },
        { title: 'النوع', render: (r) => label(r.type) },
        { title: 'الوقت', render: (r) => fmtTime(r.scheduled_at) },
        { title: 'الحالة', render: (r) => `<span class="badge ${r.status === 'done' ? 'ok' : r.status === 'cancelled' ? 'late' : 'info'}">${label(r.status)}</span>` },
        { title: '', render: (r) => (r.status === 'scheduled'
          ? `<button class="link" data-appt-done="${r.id}">تم</button> · <button class="link" data-appt-cancel="${r.id}">إلغاء</button> · ` : '') + delBtn('/appointments', r.id) },
      ], rows, 'لا توجد مواعيد')}`;
  },

  async ideas() {
    return `<div class="panel"><h2>💡 مقترحات التطوير</h2><ul class="ideas">
      <li>تسجيل الدخول وصلاحيات (مالك / موظف تحصيل)</li>
      <li>إرسال تذكير تلقائي عبر واتساب أو SMS قبل الاستحقاق وعند التأخر</li>
      <li>سندات قبض وعقود بصيغة PDF قابلة للطباعة</li>
      <li>تصدير تقارير الإيرادات والعقود إلى Excel</li>
      <li>استيراد العقود الحالية من ملف Excel/CSV دفعة واحدة</li>
      <li>تجديد العقد بنقرة واحدة، وغرامات التأخير</li>
      <li>عرض التواريخ بالتقويم الهجري</li>
    </ul></div>`;
  },
};

// عرض جدول العقود مع البحث والتصفية والترقيم
const PAGE_SIZE = 10;
function drawLeases() {
  const ui = views._leaseUi;
  const q = ui.search.trim().toLowerCase();
  const filtered = views._leases.filter(
    (l) => (!ui.status || l.effective_status === ui.status) &&
      (!q || l.tenant_name.toLowerCase().includes(q) || String(l.contract_number || l.id).toLowerCase().includes(q))
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  ui.page = Math.min(ui.page, pages);
  const slice = filtered.slice((ui.page - 1) * PAGE_SIZE, ui.page * PAGE_SIZE);

  document.getElementById('lease-count').textContent = `${nf.format(filtered.length)} عقد`;
  document.getElementById('lease-status').value = ui.status;
  document.getElementById('lease-table').innerHTML = table([
    { title: 'رقم العقد', render: (l) => `<span class="num">${esc(l.contract_number || '#' + l.id)}</span>` },
    { title: 'اسم العميل', key: 'tenant_name' },
    { title: 'الوحدة', render: (l) => esc(l.unit_number) },
    { title: 'تاريخ البداية', render: (l) => fmtDate(l.start_date) },
    { title: 'تاريخ الانتهاء', render: (l) => fmtDate(l.end_date) },
    { title: 'المتبقي', render: remaining },
    { title: 'الحالة', render: (l) => leaseBadge(l.effective_status) },
    { title: '', render: (l) => `<button class="link" data-lease="${l.id}">الأقساط</button>` +
      (l.status === 'active' ? ` · <button class="link" data-lease-end="${l.id}">إنهاء</button>` : '') +
      ` · ${delBtn('/leases', l.id)}` },
  ], slice, 'لا توجد عقود مطابقة') +
    (pages > 1 ? `<div class="pager">${Array.from({ length: pages }, (_, i) =>
      `<button data-page="${i + 1}" class="${i + 1 === ui.page ? 'active' : ''}">${nf.format(i + 1)}</button>`).join('')}</div>` : '');
}

const after = { leases: drawLeases };
