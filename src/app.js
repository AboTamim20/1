const $ = s => document.querySelector(s);
const key = 'dar-rentals-v1';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
function day(offset) { const d = new Date(); d.setDate(d.getDate()+offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
const seed = { rentals: [
{id:'r1',name:'أحمد العتيبي',unit:'برج النخيل · شقة ١٠١',amount:2500,due:day(-12),paid:false},
{id:'r2',name:'محمد القحطاني',unit:'مجمع الروضة · شقة ٢٠٤',amount:3200,due:day(9),paid:true},
{id:'r3',name:'سارة الدوسري',unit:'عمارة الياسمين · شقة ٣٠٢',amount:2800,due:day(-5),paid:false},
{id:'r4',name:'عبدالله الحربي',unit:'برج النخيل · شقة ١٠٣',amount:2400,due:day(15),paid:false}],
appointments:[{id:'a1',name:'أحمد العتيبي',unit:'برج النخيل · شقة ١٠١',date:day(1),time:'10:00',type:'تجديد عقد'},{id:'a2',name:'سارة الدوسري',unit:'عمارة الياسمين · شقة ٣٠٢',date:day(3),time:'16:30',type:'زيارة صيانة'}]};
let state;
try { state = JSON.parse(localStorage.getItem(key)) || structuredClone(seed); if (!Array.isArray(state.rentals) || !Array.isArray(state.appointments)) throw new Error(); } catch { state = structuredClone(seed); }
let view = 'overview';
const labels = {overview:'نظرة عامة',rentals:'الإيجارات',appointments:'المواعيد',overdue:'المتأخرون عن السداد'};
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => new Intl.NumberFormat('ar-SA').format(n) + ' ر.س';
const date = s => new Intl.DateTimeFormat('ar-SA',{calendar:'gregory',month:'short',day:'numeric',year:'numeric'}).format(new Date(s+'T12:00:00'));
const late = r => !r.paid && r.due < today();
function notify(message){ $('#toast').textContent=message; $('#toast').style.display='block'; clearTimeout(notify.timer); notify.timer=setTimeout(()=>$('#toast').style.display='none',3200); }
function save(){try {localStorage.setItem(key,JSON.stringify(state)); return true;}catch{notify('تعذر الحفظ. قد تكون مساحة المتصفح ممتلئة.');return false;}}
function render(){
 document.querySelectorAll('nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 $('#breadcrumb').textContent=labels[view]; $('#title').textContent=view==='overview'?'كل أملاكك، في مكان واحد':labels[view];
 $('#subtitle').textContent=view==='appointments'?'نظّم زياراتك ومواعيد التجديد والصيانة.':'تابع إيجاراتك ومواعيدك، وابقَ على اطلاع بالمستحقات.';
 $('#add').textContent=view==='appointments'?'+ إضافة موعد':'+ إضافة إيجار';
 const overdue=state.rentals.filter(late);
 const cards=[['إجمالي الإيجارات',state.rentals.length,'سجلات الإيجار المسجلة','⌂'],['المبالغ المحصلة',money(state.rentals.filter(r=>r.paid).reduce((s,r)=>s+r.amount,0)),'مجموع السجلات المسددة','↗'],['مبالغ متأخرة',money(overdue.reduce((s,r)=>s+r.amount,0)),`${overdue.length} إيجارات تحتاج إلى متابعة`,'◷'],['المواعيد القادمة',state.appointments.filter(a=>a.date+'T'+a.time>=today()+'T'+new Date().toTimeString().slice(0,5)).length,'زيارات وتجديدات مجدولة','▣']];
 $('#stats').innerHTML=cards.map((c,i)=>`<article class="stat ${i===2?'alert':''}"><div class="stat-top">${c[0]}<span class="stat-icon">${c[3]}</span></div><strong>${c[1]}</strong><small>${c[2]}</small></article>`).join('');
 $('#overview-extra').hidden=view!=='overview'; $('#overview-extra').style.display=view==='overview'?'grid':'none';
 const next=state.appointments.filter(a=>a.date+'T'+a.time>=today()+'T'+new Date().toTimeString().slice(0,5)).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0];
 $('#next-appointment').innerHTML=next?`<div class="appointment-card"><div class="date-box">${esc(next.time)}</div><div><strong>${esc(next.type)} · ${esc(next.name)}</strong><p>${esc(next.unit)}</p><span class="eyebrow">${date(next.date)}</span></div></div>`:'<p>لا توجد مواعيد قادمة. أضف موعدك الأول.</p>';
 const appointments=view==='appointments'; const q=$('#search').value.trim().toLowerCase();
 const records=(appointments?state.appointments:view==='overdue'?overdue:state.rentals).filter(r=>(r.name+' '+r.unit).toLowerCase().includes(q));
 $('#table-title').textContent=appointments?'جدول المواعيد':view==='overdue'?'المستحقات المتأخرة':'الإيجارات الحالية'; $('#count').textContent=`${records.length} سجلات`;
 $('#thead').innerHTML=`<tr>${(appointments?['الاسم','الوحدة','نوع الموعد','التاريخ','الوقت','الإجراءات']:['المستأجر','الوحدة','قيمة الإيجار','تاريخ الاستحقاق','الحالة','الإجراءات']).map(t=>`<th scope="col">${t}</th>`).join('')}</tr>`;
 $('#tbody').innerHTML=records.map(r=>`<tr><td class="person">${esc(r.name)}</td><td>${esc(r.unit)}</td>${appointments?`<td>${esc(r.type)}</td><td>${date(r.date)}</td><td>${esc(r.time)}</td>`:`<td>${money(r.amount)}</td><td>${date(r.due)}</td><td><span class="badge ${late(r)?'late':r.paid?'':'pending'}">${r.paid?'مسدد':late(r)?'متأخر':'بانتظار السداد'}</span></td>`}<td>${!appointments?`<button class="action" data-pay="${esc(r.id)}">${r.paid?'إلغاء السداد':'تسجيل السداد'}</button>`:''}<button class="action danger" data-delete="${esc(r.id)}" aria-label="حذف سجل ${esc(r.name)}">حذف</button></td></tr>`).join('');
 $('#empty').hidden=records.length>0;
}
document.addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;
 if(button.dataset.view){view=button.dataset.view;$('#search').value='';render();}
 if(button.dataset.pay){const r=state.rentals.find(r=>r.id===button.dataset.pay); r.paid=!r.paid;save();render();}
 if(button.dataset.delete && confirm('هل تريد حذف هذا السجل؟')){const list=view==='appointments'?'appointments':'rentals';state[list]=state[list].filter(r=>r.id!==button.dataset.delete);save();render();}
});
$('#search').addEventListener('input',render);
$('#add').addEventListener('click',()=>{const ap=view==='appointments';$('#dialog-title').textContent=ap?'إضافة موعد جديد':'إضافة إيجار جديد';
 $('#fields').innerHTML='<label>الاسم<input name="name" required maxlength="80" autocomplete="name"></label><label>العقار / الوحدة<input name="unit" required maxlength="120"></label>'+(ap?`<label>نوع الموعد<select name="type"><option>تجديد عقد</option><option>زيارة صيانة</option><option>معاينة وحدة</option><option>متابعة سداد</option></select></label><label>التاريخ<input name="date" type="date" required value="${today()}"></label><label>الوقت<input name="time" type="time" required value="10:00"></label>`:`<label>قيمة الإيجار (ريال سعودي)<input name="amount" type="number" min="0.01" max="100000000" step="0.01" required></label><label>تاريخ الاستحقاق<input name="due" type="date" required value="${today()}"></label>`);
 $('#form-error').textContent='';$('#editor').showModal();});
for(const id of ['close','cancel'])$('#'+id).addEventListener('click',()=>$('#editor').close());
$('#form').addEventListener('submit',e=>{e.preventDefault(); const data=Object.fromEntries(new FormData(e.target));data.name=data.name.trim();data.unit=data.unit.trim();if(!data.name||!data.unit){$('#form-error').textContent='أدخل الاسم والوحدة بشكل صحيح.';return;}const ap=view==='appointments';if(!ap){data.amount=Number(data.amount);data.paid=false;}data.id=crypto.randomUUID();state[ap?'appointments':'rentals'].push(data);if(save()){ $('#editor').close();notify('تم حفظ السجل بنجاح');}render();});
render();
