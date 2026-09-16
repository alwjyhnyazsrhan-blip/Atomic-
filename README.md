# 🚀 Atomic Abu Sultan (نسخة مستقلة تماماً | Locat Auto-Monitor & WhatsApp Dispatch)

نسخة تشغيلية ثانية ومستقلة كلياً عن أي نسخ سابقة، مهيأة للعمل بحساب لوكيت خاص بها، مع مسار تخزين وقاعدة بيانات وجلسة واتساب منفصلة تماماً بدون أي تداخل أو تعارض.

---

## 🌟 ميزات النسخة المستقلة (Isolation Features)

1. **عزل التخزين التلقائي (`INSTANCE_NAME=atomic-abu-sultan`)**:
   - جميع ملفات قاعدة البيانات (`locat_database.json`)، جلسات الواتساب (`baileys_auth_info`)، وبيانات تسجيل الدخول (`locat_credentials.json`) تُحفظ في مجلد مستقل وخاص بهذه النسخة.
   - حتى وإن تم رفع النسختين على نفس الخادم أو مشاركة نفس القرص السحابي، لن يحدث أي تداخل أو تضارب بينهما.

2. **حساب لوكيت مخصص 24/7**:
   - تسجيل الدخول التلقائي بحساب لوكيت المخصص وتجديد رمز الوصول (Bearer Token) ذاتياً فور انتهاء صلاحيته.

3. **جلسة واتساب مستقلة تماماً**:
   - مسار جلسة مستقل برقم واتساب خاص للرد والتنبيهات، غير مرتبط بأي رقم أو جلسة أخرى.

---

## ⚙️ إعداد متغيرات البيئة (Environment Variables)

أنشئ ملف `.env` أو اضبط المتغيرات التالية في منصة الاستضافة (Render / VPS / Docker):

```env
# اسم ومعرف النسخة للعزل الكامل
INSTANCE_NAME=atomic-abu-sultan

# بيانات حساب لوكيت الخاص بهذه النسخة
LOCAT_EMAIL=abdulaziz@deltaaldiyan.com.sa
LOCAT_PASSWORD=your_password_here
LOCAT_COMPANY_ID=

# مسار التخزين الدائم (في Render: /data أو اتركه فارغاً ليستخدم المجلد الافتراضي)
DATA_DIR=/data

# مفتاح Gemini الذكاء الاصطناعي (اختياري للتقارير)
GEMINI_API_KEY=
```

---

## 🛠️ التشغيل السريع محلياً (Local Development)

```bash
# تثبيت الحزم
npm install

# التشغيل في وضع التطوير
npm run dev

# بناء وتشغيل الإنتاج
npm run build
npm run start
```

---

## 🚢 النشر المستقل السحابي (Deployment)

### النشر على Render / VPS:
1. أنشئ **Web Service** جديد على Render أو خادم VPS واربطه بمستودع GitHub المستقل: `atomic-abu-sultan`.
2. حدد أمر البناء (Build Command):
   ```bash
   npm run build
   ```
3. حدد أمر التشغيل (Start Command):
   ```bash
   npm run start
   ```
4. أضف قرص تخزين دائم (Persistent Disk) في Render بمسار Mount Path:
   ```
   /data
   ```
5. أضف متغير البيئة:
   ```env
   INSTANCE_NAME=atomic-abu-sultan
   ```

---

## 🔒 الأمان وحماية البيانات
- تم إدراج جميع ملفات الاعتماد والجلسات في `.gitignore` لمنع رفع أي كلمات مرور أو مفاتيح سرية إلى المستودع.
