# مجمع الهفهاف

تطبيق ويب عربي لإدارة الزبائن والمخزون والديون والتسديدات.

## قاعدة البيانات والنشر

- المالك: `abbas1987fdel-hash`، فريق Convex: `bs-fdl`، المشروع: `majma-alhafhaf`.
- Production: `industrious-walrus-342`. عنوان العميل محفوظ في `deployment.json` وهو إعداد عام وليس مفتاحًا سريًا.
- `npm run build:pages` يثبّت عنوان Production حتى لو كانت `.env.local` تشير إلى Development.
- الرابط: https://abbas1987fdel-hash.github.io/majma-alhafhaf/
- GitHub Pages ينشر الواجهة فقط. تغييرات الخادم تُنشر منفصلة بواسطة `npx convex deploy` بعد التحقق من الفريق ووسم Production.

## التشغيل والفحص

```sh
npm ci
npm test
npx vitest run --config tests/backend.test.config.mjs
npx tsc --noEmit
npx oxlint app lib/ledger.ts lib/preferences.ts convex tests/backend.test.mjs vite.pages.config.ts
npm run build:pages
npm run preview:pages
```

للتطوير، هيئ Convex Development في `.env.local` ثم شغّل `npx vite --config vite.pages.config.ts --mode development`.

## الحفظ والدخول

تُحفظ البيانات والإعدادات والرمز في Convex. الواجهة لا تستخدم LocalStorage أو IndexedDB أو Cache Storage. يتطلب التطبيق الإنترنت، ويطلب الرمز عند كل فتح جديد. لا تُرسل أي رسالة واتساب تلقائيًا.

كل قراءة وكتابة للحسابات تتطلب جلسة يتحقق منها الخادم. الرمز يُشتق عبر scrypt بملح عشوائي، والجلسات عشوائية ومحدودة باثنتي عشرة ساعة. تغيير الرمز يبطل الجلسات السابقة. تُحد محاولات التخمين. لا يوجد رمز افتراضي أو تلميح داخل حزمة الواجهة.

تهيئة الرمز الأولى تتم بمتغير خادم خاص `INITIAL_PIN` وتشغيل الدالة الداخلية `auth:bootstrap`، ثم حذف المتغير. التهيئة لا تستبدل إعدادات موجودة. لا تحفظ الرمز أو مفاتيح النشر في Git.

يتحقق الخادم من المبالغ وترتيب الدين والتسديد ومنع تجاوز الرصيد. إصدارات السجلات تمنع الكتابة فوق تعديل متزامن دون تنبيه. الشعار يُرفع عبر رابط جلسة محدود الاستخدام والحجم. `APP_ORIGIN` يحدد أصل موقع الإنتاج، و`DEV_APP_ORIGIN` مخصص لبيئة التطوير فقط.

## المتابعة

يستخدم المشروع Sentry الحالي `majma-alhabhab` دون إنشاء مشروع مكرر. DSN في إعدادات البيئة وGitHub Secret فقط. لا تجمع المتابعة بيانات الزبائن أو محتوى المعاملات أو رموز الدخول.

الفحص الشامل للقالب يحتوي 19 خطأ قديمًا في مكونات غير مستخدمة؛ فحص ملفات التطبيق والخادم المعدّلة مستقل وناجح. التثبيت يحتاج متصفحًا يدعم تطبيقات الويب؛ اسم وأيقونة التطبيق المثبت يأتيان من manifest، وتخص إعدادات الهوية الواجهة ورسائل المشاركة.
