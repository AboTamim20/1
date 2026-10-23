# تطبيق إدارة الإيجارات والمواعيد والمتأخرين

تطبيق ويب لإدارة العقارات والوحدات والمستأجرين وعقود الإيجار، مع توليد الأقساط تلقائياً،
وتسجيل الدفعات، وتتبع المواعيد، وكشف المستأجرين المتأخرين عن السداد.

## التشغيل

يتطلب Node.js 22.5 أو أحدث (يستخدم قاعدة SQLite المدمجة `node:sqlite`، فلا توجد مكتبات أصلية تحتاج تجميعاً).

```bash
npm install
npm run seed     # بيانات تجريبية (اختياري)
npm start        # http://localhost:3000
npm test
```

متغيرات البيئة:

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `PORT` | `3000` | منفذ الخادم |
| `DB_FILE` | `data/rental.db` | مسار قاعدة البيانات |
| `GRACE_DAYS` | `0` | أيام السماح قبل اعتبار القسط متأخراً |

## هيكل المشروع

```
├── src/
│   ├── server.js               نقطة التشغيل
│   ├── app.js                  إعداد Express وربط المسارات
│   ├── db/
│   │   ├── schema.sql          جداول قاعدة البيانات
│   │   ├── index.js            الاتصال بالقاعدة والمعاملات (transactions)
│   │   └── seed.js             بيانات تجريبية
│   ├── routes/
│   │   ├── crud.js             موجّه CRUD عام (العقارات، الوحدات، المستأجرون)
│   │   ├── leases.js           العقود
│   │   ├── payments.js         الدفعات
│   │   ├── appointments.js     المواعيد
│   │   └── reports.js          لوحة التحكم، المتأخرون، الأقساط القادمة
│   ├── services/
│   │   ├── leaseService.js     إنشاء العقد وتوليد الأقساط وإنهاؤه
│   │   ├── paymentService.js   تسجيل الدفعات وتحديث حالة القسط
│   │   └── overdueService.js   حساب المتأخرين وأيام التأخير
│   ├── middleware/errors.js    معالجة الأخطاء برسائل عربية
│   └── utils/dates.js          أدوات التواريخ
├── public/                     واجهة عربية (RTL) بدون أدوات بناء
│   ├── index.html
│   ├── css/style.css
│   └── js/{api,views,app}.js
└── tests/api.test.js
```

## نموذج البيانات

```
properties ─┬─< units ─┬─< leases >── tenants
            │          │      └─< installments ─< payments
            │          └─< appointments >── tenants
```

- **العقد** له دورة دفع (`monthly` / `quarterly` / `semiannual` / `annual`)، وعند إنشائه تتولد
  **الأقساط** من تاريخ البداية حتى النهاية، وتتحول الوحدة إلى "مؤجرة".
- **الدفعة** تُسجَّل على قسط محدد؛ يصبح القسط `partial` أو `paid` حسب المبلغ، ولا يُقبل مبلغ أكبر من المتبقي.
- **المتأخر**: قسط غير مسدد بالكامل مضى تاريخ استحقاقه (+ أيام السماح).
- **إنهاء العقد** يحذف الأقساط المستقبلية غير المدفوعة ويحرر الوحدة.

## واجهة API

| الطريقة | المسار | الوصف |
|---|---|---|
| CRUD | `/api/properties` | العقارات |
| CRUD | `/api/units` | الوحدات (`?property_id=&status=`) |
| CRUD | `/api/tenants` | المستأجرون |
| GET/POST | `/api/leases` | قائمة العقود / إنشاء عقد مع أقساطه |
| GET | `/api/leases/:id` | العقد مع أقساطه |
| POST | `/api/leases/:id/end` | إنهاء العقد (`{ end_date, status }`) |
| GET/POST | `/api/payments` | سجل الدفعات / تسجيل دفعة (`{ installment_id, amount, method }`) |
| CRUD | `/api/appointments` | المواعيد (`?status=&type=&tenant_id=`) |
| GET | `/api/appointments/upcoming?days=7` | المواعيد القادمة |
| GET | `/api/reports/overdue` | المتأخرون مجمّعين حسب المستأجر (`?as_of=&grace_days=&group=installment`) |
| GET | `/api/reports/upcoming-dues?days=7` | أقساط تستحق قريباً |
| GET | `/api/reports/dashboard` | ملخص لوحة التحكم |

## أفكار للتطوير لاحقاً

- تسجيل الدخول والصلاحيات (مالك / موظف تحصيل)
- إرسال تذكير تلقائي عبر SMS أو واتساب للمتأخرين وقبل موعد الاستحقاق
- غرامات التأخير، وسندات القبض بصيغة PDF
- دعم التقويم الهجري في العرض
