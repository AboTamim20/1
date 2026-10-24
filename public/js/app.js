// التنقل بين الشاشات وربط الأحداث
const viewEl = document.getElementById('view');
let current = 'overview';

document.getElementById('today').textContent = new Date().toLocaleDateString('ar-SA-u-ca-gregory', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 3000);
}

async function show(name) {
  current = name;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  viewEl.innerHTML = '<div class="empty">جاري التحميل...</div>';
  try {
    viewEl.innerHTML = await views[name]();
    if (after[name]) after[name]();
  } catch (e) {
    viewEl.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

async function run(action, successMsg) {
  try {
    await action();
    if (successMsg) toast(successMsg);
    return true;
  } catch (e) {
    toast(e.message);
    return false;
  }
}

async function showLease(id) {
  document.getElementById('lease-detail').innerHTML = await views.leaseDetail(id);
}

document.getElementById('tabs').addEventListener('click', (e) => {
  if (e.target.dataset.view) show(e.target.dataset.view);
});

viewEl.addEventListener('input', (e) => {
  if (e.target.id === 'lease-search') {
    views._leaseUi.search = e.target.value;
    views._leaseUi.page = 1;
    drawLeases();
  }
});

viewEl.addEventListener('change', (e) => {
  if (e.target.id === 'lease-status') {
    views._leaseUi.status = e.target.value;
    views._leaseUi.page = 1;
    drawLeases();
  }
});

viewEl.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-create]');
  if (!form) return;
  e.preventDefault();
  if (await run(() => api.post(form.dataset.create, formData(form)), 'تم الحفظ')) show(current);
});

viewEl.addEventListener('click', async (e) => {
  const d = e.target.dataset;

  if (d.page) {
    views._leaseUi.page = Number(d.page);
    return drawLeases();
  }

  if (d.lease) return showLease(d.lease);

  if (d.del) {
    if (confirm('هل أنت متأكد من الحذف؟ لا يمكن التراجع عن هذا الإجراء.') &&
        (await run(() => api.del(d.del), 'تم الحذف'))) show(current);
    return;
  }

  if (d.leaseEnd && confirm('إنهاء العقد وإلغاء الأقساط المستقبلية؟')) {
    if (await run(() => api.post(`/leases/${d.leaseEnd}/end`, {}), 'تم إنهاء العقد')) show(current);
  }

  if (d.pay) {
    const amount = prompt('مبلغ الدفعة', d.balance);
    if (amount && (await run(() => api.post('/payments', { installment_id: d.pay, amount }), 'تم تسجيل الدفعة'))) {
      showLease(d.leaseId);
    }
  }

  if (d.apptDone || d.apptCancel) {
    const id = d.apptDone || d.apptCancel;
    const status = d.apptDone ? 'done' : 'cancelled';
    if (await run(() => api.put(`/appointments/${id}`, { status }))) show(current);
  }

  if (d.remind) {
    const when = prompt('موعد التحصيل (YYYY-MM-DDTHH:MM)', new Date(Date.now() + 86400000).toISOString().slice(0, 11) + '10:00');
    if (when && (await run(() => api.post('/appointments', {
      title: 'تحصيل إيجار متأخر', type: 'collection', scheduled_at: when, tenant_id: d.remind,
    }), 'تمت جدولة موعد التحصيل'))) show('appointments');
  }
});

show(current);
