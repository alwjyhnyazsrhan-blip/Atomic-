import React, { useState } from 'react';
import { 
  X, 
  Clock, 
  Phone, 
  ShieldAlert, 
  UserCheck, 
  Bell, 
  FileText, 
  Save, 
  Check, 
  Sliders, 
  AlertTriangle,
  ShieldCheck,
  Server,
  Terminal,
  Zap,
  Bot
} from 'lucide-react';
import { SystemSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SystemSettings;
  onSaveSettings: (newSettings: Partial<SystemSettings>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}) => {
  const [delayThreshold, setDelayThreshold] = useState(settings.delayThresholdMinutes || 45);
  const [criticalDelay, setCriticalDelay] = useState(settings.criticalDelayMinutes || 60);
  const [adminPhone, setAdminPhone] = useState(settings.adminPhone || '');
  const [adminName, setAdminName] = useState(settings.adminName || '');
  const [adminPhone2, setAdminPhone2] = useState(settings.adminPhone2 || '');
  const [adminName2, setAdminName2] = useState(settings.adminName2 || '');
  const [autoAlertCourier, setAutoAlertCourier] = useState(settings.autoAlertCourier ?? true);
  const [autoAlertAdmin, setAutoAlertAdmin] = useState(settings.autoAlertAdmin ?? true);
  const [autoAlertAdmin2, setAutoAlertAdmin2] = useState(settings.autoAlertAdmin2 ?? true);
  const [alertCooldownMinutes, setAlertCooldownMinutes] = useState(settings.alertCooldownMinutes || 20);
  const [antiBanMinDelay, setAntiBanMinDelay] = useState(settings.antiBanMinDelaySeconds || 5);
  const [antiBanMaxDelay, setAntiBanMaxDelay] = useState(settings.antiBanMaxDelaySeconds || 10);
  const [enablePuppeteerHeadless, setEnablePuppeteerHeadless] = useState(settings.enablePuppeteerHeadless ?? false);
  const [locateUsername, setLocateUsername] = useState(settings.locateUsername || '');
  const [locatePassword, setLocatePassword] = useState(settings.locatePassword || '');
  const [autoDailyReport, setAutoDailyReport] = useState(settings.autoDailyReport ?? true);
  const [dailyReportTime, setDailyReportTime] = useState(settings.dailyReportTime || '23:00');
  const [syncInterval, setSyncInterval] = useState(settings.locatSyncIntervalSeconds || 20);

  // Cloud Auto-Sync (Direct 24/7 API without intervention)
  const [enableCloudAutoSync, setEnableCloudAutoSync] = useState(settings.enableCloudAutoSync ?? true);
  const [locateEmail, setLocateEmail] = useState(settings.locateEmail || settings.locateUsername || '');
  const [locateCompanyId, setLocateCompanyId] = useState(settings.locateCompanyId || '');
  const [locateAccessToken, setLocateAccessToken] = useState(settings.locateAccessToken || '');
  const [companies, setCompanies] = useState<{ id: string | number; name?: string }[]>([]);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [isTestingCloudLogin, setIsTestingCloudLogin] = useState(false);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [cloudFeedback, setCloudFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!isOpen) return null;

  const handleCheckEmailAndCompanies = async () => {
    if (!locateEmail.trim()) {
      setCloudFeedback({ type: 'error', message: 'يرجى إدخال البريد الإلكتروني للوكيت أولاً' });
      return;
    }
    setIsCheckingEmail(true);
    setCloudFeedback(null);
    try {
      const res = await fetch('/api/locat/cloud-pre-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: locateEmail.trim() }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.companies) && data.companies.length > 0) {
        setCompanies(data.companies);
        if (!locateCompanyId && data.companies[0]?.id) {
          setLocateCompanyId(String(data.companies[0].id));
        }
        setCloudFeedback({
          type: 'success',
          message: `تم العثور على ${data.companies.length} شركة/فرع لحسابك في لوكيت`,
        });
      } else {
        setCloudFeedback({
          type: 'error',
          message: data.message || 'لم يتم العثور على شركات تابعة لهذا البريد في لوكيت',
        });
      }
    } catch {
      setCloudFeedback({ type: 'error', message: 'فشل الاتصال بسيرفر لوكيت' });
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const handleTestCloudLogin = async () => {
    if (!locateEmail.trim() || !locatePassword.trim()) {
      setCloudFeedback({ type: 'error', message: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
      return;
    }
    setIsTestingCloudLogin(true);
    setCloudFeedback(null);
    try {
      const res = await fetch('/api/locat/cloud-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: locateEmail.trim(),
          password: locatePassword.trim(),
          company_id: locateCompanyId.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCloudFeedback({
          type: 'success',
          message: `✅ تم تسجيل الدخول واختبار السحب التلقائي بنجاح! تم سحب ${data.syncResult?.count || 0} طلب.`,
        });
        if (data.cloudSyncState?.token) {
          setLocateAccessToken(data.cloudSyncState.token);
        }
      } else {
        setCloudFeedback({
          type: 'error',
          message: data.message || 'فشل تسجيل الدخول إلى لوكيت',
        });
      }
    } catch {
      setCloudFeedback({ type: 'error', message: 'فشل الاتصال بخادم تسجيل الدخول' });
    } finally {
      setIsTestingCloudLogin(false);
    }
  };

  const handleManualSyncNow = async () => {
    setIsSyncingNow(true);
    setCloudFeedback(null);
    try {
      const res = await fetch('/api/locat/cloud-sync-now', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setCloudFeedback({
          type: 'success',
          message: `✅ ${data.message} (إجمالي الطلبات النشطة: ${data.ordersCount})`,
        });
      } else {
        setCloudFeedback({
          type: 'error',
          message: data.message || 'تعذر سحب البيانات',
        });
      }
    } catch {
      setCloudFeedback({ type: 'error', message: 'فشل تنفيذ عملية السحب الفوري' });
    } finally {
      setIsSyncingNow(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings({
      delayThresholdMinutes: Number(delayThreshold) || 45,
      criticalDelayMinutes: Number(criticalDelay) || 60,
      adminPhone: adminPhone.trim(),
      adminName: adminName.trim(),
      adminPhone2: adminPhone2.trim(),
      adminName2: adminName2.trim(),
      autoAlertCourier,
      autoAlertAdmin,
      autoAlertAdmin2,
      alertCooldownMinutes: Number(alertCooldownMinutes) || 20,
      antiBanMinDelaySeconds: Number(antiBanMinDelay) || 5,
      antiBanMaxDelaySeconds: Number(antiBanMaxDelay) || 10,
      enablePuppeteerHeadless,
      locateUsername: locateUsername.trim(),
      locatePassword: locatePassword.trim(),
      locateEmail: locateEmail.trim(),
      locateCompanyId: locateCompanyId.trim(),
      locateAccessToken: locateAccessToken.trim(),
      enableCloudAutoSync,
      autoDailyReport,
      dailyReportTime,
      locatSyncIntervalSeconds: Number(syncInterval) || 20,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-900">إعدادات النظام، التصعيد، وحماية الواتساب</h2>
              <p className="text-xs text-slate-500">ضبط حدود أزمنة التأخير، تصعيد الإدارة 2، وحماية الحظر بالـ VPS</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-xs">
          
          {/* Section 1: Delay Thresholds & Escalation */}
          <div className="space-y-3 bg-amber-50/60 p-4 rounded-xl border border-amber-200/80">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              منطق التأخير والتنبيهات (الحدود والتصعيد)
            </h3>
            <p className="text-slate-600 leading-relaxed">
              عند حدوث التأخير، يرسل النظام رسالة تذكير للمندوب أولاً. وفي حال استمرار التأخير، يتم تصعيد إشعار آلي فوري لرقم الإدارة الثاني.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  زمن تنبيه المندوب الأولي:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={5}
                    max={120}
                    value={delayThreshold}
                    onChange={(e) => setDelayThreshold(Number(e.target.value))}
                    className="w-full font-bold text-sm text-amber-900 px-3 py-2 bg-white border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-none"
                    required
                  />
                  <span className="text-slate-500 font-medium">دقيقة</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  الموصى به للعميل: 45 دقيقة من استلام الطلب
                </span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  زمن تصعيد الإدارة الثاني (استمرار التأخير):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={delayThreshold + 1}
                    max={240}
                    value={criticalDelay}
                    onChange={(e) => setCriticalDelay(Number(e.target.value))}
                    className="w-full font-bold text-sm text-rose-900 px-3 py-2 bg-white border border-rose-300 rounded-lg focus:ring-2 focus:ring-rose-400 focus:outline-none"
                    required
                  />
                  <span className="text-slate-500 font-medium">دقيقة</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  يرسل إشعاراً عاجلاً لرقم الإدارة الثاني ببيانات المندوب والطلبات
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Management WhatsApp Numbers (Admin 1 & Admin 2 Escalation) */}
          <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Phone className="w-4 h-4 text-emerald-600" />
              أرقام واتساب الإدارة (المشرف الأساسي + رقم الإدارة الثاني للتصعيد)
            </h3>

            {/* Admin 1 */}
            <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
              <div className="font-bold text-slate-800 text-xs flex items-center justify-between">
                <span>1. رقم الإدارة الأول (مشرف العمليات المباشر)</span>
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold">تنبيهات عامة والتقرير اليومي</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">رقم الواتساب:</label>
                  <input
                    type="text"
                    value={adminPhone}
                    onChange={(e) => setAdminPhone(e.target.value)}
                    placeholder="+966500000000"
                    className="w-full font-mono text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400 focus:outline-none"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">اسم المشرف الأول:</label>
                  <input
                    type="text"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="مشرف العمليات المباشر"
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Admin 2 (Requested specifically by user) */}
            <div className="p-3 bg-rose-50/50 rounded-lg border border-rose-200 space-y-2">
              <div className="font-bold text-rose-900 text-xs flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                  <span>2. رقم الإدارة الثاني (تصعيد استمرار التأخير)</span>
                </span>
                <span className="text-[10px] text-rose-800 bg-rose-100 px-2 py-0.5 rounded font-semibold">مطلوب من العميل</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-normal">
                يستلم إشعاراً يتضمن: (اسم المندوب، رقم الطلب، الوقت المنقضي، وعدد الطلبات النشطة بحوزته) عند استمرار التأخير.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">رقم الإدارة الثاني (واتساب):</label>
                  <input
                    type="text"
                    value={adminPhone2}
                    onChange={(e) => setAdminPhone2(e.target.value)}
                    placeholder="+966590000000"
                    className="w-full font-mono text-xs px-3 py-2 bg-white border border-rose-300 rounded-lg focus:ring-2 focus:ring-rose-400 focus:outline-none"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">اسم جهة الإدارة الثانية:</label>
                  <input
                    type="text"
                    value={adminName2}
                    onChange={(e) => setAdminName2(e.target.value)}
                    placeholder="الإدارة العليا / المشرف المناوب"
                    className="w-full text-xs px-3 py-2 bg-white border border-rose-300 rounded-lg focus:ring-2 focus:ring-rose-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Anti-Ban & Message Queue Protection (Requested by user) */}
          <div className="space-y-3 bg-emerald-50/50 p-4 rounded-xl border border-emerald-200">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              حماية الواتساب من الحظر (Queue & Anti-Ban Logic)
            </h3>
            <p className="text-slate-600 leading-relaxed">
              إدراج نظام طابور (Message Queue) بين الرسائل المتتالية بفارق زمني، ومنع تكرار التنبيه لنفس الطلب بفترة سماح (Cooldown).
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  فترة السماح (Cooldown) لمنع التكرار:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={5}
                    max={120}
                    value={alertCooldownMinutes}
                    onChange={(e) => setAlertCooldownMinutes(Number(e.target.value))}
                    className="w-full font-bold text-sm text-emerald-900 px-3 py-2 bg-white border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                    required
                  />
                  <span className="text-slate-500 font-medium">دقيقة</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  يمنع تكرار إرسال تنبيه لنفس الطلب إلا بعد مرور هذا الوقت
                </span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  الفارق الزمني في الطابور (Delay):
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-slate-500">من</span>
                    <input
                      type="number"
                      min={2}
                      max={30}
                      value={antiBanMinDelay}
                      onChange={(e) => setAntiBanMinDelay(Number(e.target.value))}
                      className="w-full font-bold text-xs px-2 py-2 bg-white border border-emerald-300 rounded-lg text-center"
                    />
                    <span className="text-[11px] text-slate-500">ث</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-slate-500">إلى</span>
                    <input
                      type="number"
                      min={antiBanMinDelay + 1}
                      max={60}
                      value={antiBanMaxDelay}
                      onChange={(e) => setAntiBanMaxDelay(Number(e.target.value))}
                      className="w-full font-bold text-xs px-2 py-2 bg-white border border-emerald-300 rounded-lg text-center"
                    />
                    <span className="text-[11px] text-slate-500">ث</span>
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  عشوائي بين 5-10 ثوانٍ لمحاكاة السلوك البشري ومنع كشف البوت
                </span>
              </div>
            </div>
          </div>

          {/* Section 4: 24/7 Direct Cloud Auto-Sync Engine (Zero-Touch) */}
          <div className="space-y-3 bg-emerald-50/70 p-4 rounded-xl border border-emerald-300">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-600" />
                محرك السحب السحابي المباشر 24/7 (بدون أي تدخل منك)
              </h3>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px]">
                سحابي تلقائي 24/7
              </span>
            </div>
            
            <p className="text-slate-600 leading-relaxed text-[11px]">
              يقوم الخادم بالاتصال المباشر بسيرفرات لوكيت (supplier.locate.sa) وسحب الطلبات النشطة وتحديث حالة المناديب وتنبيهات التأخير لحظة بلحظة <strong>تلقائياً في الخلفية بدون الحاجة لفتح المتصفح أو أي إضافات</strong>.
            </p>

            {/* Cloud Auto-Sync Toggle */}
            <label className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-emerald-200 cursor-pointer hover:bg-emerald-50/50 transition">
              <div>
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-emerald-600" />
                  <span>تفعيل السحب التلقائي المستمر في الخلفية (24/7 Cloud Sync)</span>
                </div>
                <div className="text-[10px] text-slate-500">
                  فحص وسحب الطلبات الجديدة كل {syncInterval} ثانية آلياً وتوليد رسائل الواتساب فوراً
                </div>
              </div>
              <input
                type="checkbox"
                checked={enableCloudAutoSync}
                onChange={(e) => setEnableCloudAutoSync(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
              />
            </label>

            {enableCloudAutoSync && (
              <div className="p-3 bg-white rounded-lg border border-emerald-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">بيانات حسابك في لوكيت (Locate Supplier Credentials):</span>
                  <button
                    type="button"
                    onClick={handleManualSyncNow}
                    disabled={isSyncingNow}
                    className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition shadow-2xs disabled:opacity-50"
                  >
                    <Zap className={`w-3 h-3 ${isSyncingNow ? 'animate-spin' : ''}`} />
                    <span>{isSyncingNow ? 'جاري السحب...' : 'سحب تجريبي الآن'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                      البريد الإلكتروني في لوكيت:
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="email"
                        value={locateEmail}
                        onChange={(e) => setLocateEmail(e.target.value)}
                        placeholder="supplier@example.com"
                        className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 font-mono"
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={handleCheckEmailAndCompanies}
                        disabled={isCheckingEmail}
                        className="text-[10px] whitespace-nowrap font-bold px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-300 transition shrink-0 disabled:opacity-50"
                        title="التحقق من البريد واستخراج الشركات"
                      >
                        {isCheckingEmail ? 'فحص...' : 'فحص الحساب'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                      كلمة المرور:
                    </label>
                    <input
                      type="password"
                      value={locatePassword}
                      onChange={(e) => setLocatePassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 font-mono"
                      dir="ltr"
                    />
                  </div>
                </div>

                {/* Company / Branch Selector if available */}
                {companies.length > 0 && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                      اختر فرع / شركة الحساب:
                    </label>
                    <select
                      value={locateCompanyId}
                      onChange={(e) => setLocateCompanyId(e.target.value)}
                      className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-emerald-300 rounded-md focus:outline-none"
                    >
                      {companies.map((comp) => (
                        <option key={comp.id} value={comp.id}>
                          {comp.name || `شركة رقم #${comp.id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Test Login & Connect Button */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleTestCloudLogin}
                    disabled={isTestingCloudLogin || !locateEmail || !locatePassword}
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition shadow-2xs disabled:opacity-50"
                  >
                    <Server className={`w-3.5 h-3.5 ${isTestingCloudLogin ? 'animate-spin' : ''}`} />
                    <span>{isTestingCloudLogin ? 'جاري الاتصال والتحقق...' : 'تسجيل الدخول وربط السحب التلقائي'}</span>
                  </button>

                  <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    <span>فترة السحب التلقائي:</span>
                    <select
                      value={syncInterval}
                      onChange={(e) => setSyncInterval(Number(e.target.value))}
                      className="text-xs px-2 py-1 bg-slate-50 border border-slate-300 rounded font-bold"
                    >
                      <option value={15}>كل 15 ثانية</option>
                      <option value={20}>كل 20 ثانية (موصى به)</option>
                      <option value={30}>كل 30 ثانية</option>
                      <option value={60}>كل دقيقة</option>
                    </select>
                  </div>
                </div>

                {/* Feedback Toast Banner */}
                {cloudFeedback && (
                  <div
                    className={`p-2.5 rounded-lg text-xs font-medium border animate-in fade-in duration-150 ${
                      cloudFeedback.type === 'success'
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                        : 'bg-rose-50 text-rose-900 border-rose-200'
                    }`}
                  >
                    {cloudFeedback.message}
                  </div>
                )}

                {/* Direct Token Fallback Input (Optional) */}
                <details className="text-[10px] text-slate-500 pt-1">
                  <summary className="cursor-pointer font-bold hover:text-slate-800">
                    أو إدخال رمز التفويض السحابي مباشرة (Direct Bearer Token)
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    <input
                      type="text"
                      value={locateAccessToken}
                      onChange={(e) => setLocateAccessToken(e.target.value)}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded font-mono text-[10px]"
                      dir="ltr"
                    />
                    <span className="text-[9px] text-slate-400 block">
                      يمكنك نسخ رمز الـ Token مباشرة من طلبات شبكة متصفح لوكيت (Authorization: Bearer) إذا كنت تفضل عدم حفظ كلمة المرور.
                    </span>
                  </div>
                </details>
              </div>
            )}
          </div>

          {/* Section 5: Automation Rules Switches */}
          <div className="space-y-2.5 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 mb-2">
              <Bell className="w-4 h-4 text-slate-700" />
              تفعيل مسارات الإرسال التلقائي
            </h3>

            <label className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition">
              <div>
                <div className="font-bold text-slate-800">تذكير المندوب تلقائياً بالواتساب عند التأخير الأول</div>
                <div className="text-[11px] text-slate-500">
                  إرسال تذكير لطيف للمندوب على رقمه الفعلي بعد تجاوز {delayThreshold} دقيقة
                </div>
              </div>
              <input
                type="checkbox"
                checked={autoAlertCourier}
                onChange={(e) => setAutoAlertCourier(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition">
              <div>
                <div className="font-bold text-slate-800">تنبيه الإدارة الأول عند التأخير الأولي</div>
                <div className="text-[11px] text-slate-500">
                  إرسال إشعار للمشرف المباشر
                </div>
              </div>
              <input
                type="checkbox"
                checked={autoAlertAdmin}
                onChange={(e) => setAutoAlertAdmin(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-rose-200 cursor-pointer hover:bg-rose-50/50 transition">
              <div>
                <div className="font-bold text-rose-900">تصعيد إشعار لرقم الإدارة الثاني عند استمرار التأخير</div>
                <div className="text-[11px] text-slate-500">
                  إرسال (اسم المندوب، رقم الطلب، الوقت المنقضي، والطلبات النشطة) للإدارة الثانية عند بلوغ {criticalDelay} دقيقة
                </div>
              </div>
              <input
                type="checkbox"
                checked={autoAlertAdmin2}
                onChange={(e) => setAutoAlertAdmin2(e.target.checked)}
                className="w-4 h-4 text-rose-600 rounded focus:ring-rose-500"
              />
            </label>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200 gap-2">
              <div>
                <div className="font-bold text-slate-800">التقرير اليومي التلقائي للإدارة</div>
                <div className="text-[11px] text-slate-500">
                  توليد وإرسال ملخص إنجاز اليوم وتقييم المناديب تلقائياً
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={dailyReportTime}
                  onChange={(e) => setDailyReportTime(e.target.value)}
                  className="font-mono text-xs px-2 py-1 bg-slate-100 rounded border border-slate-300"
                />
                <input
                  type="checkbox"
                  checked={autoDailyReport}
                  onChange={(e) => setAutoDailyReport(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold transition"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold flex items-center gap-1.5 transition shadow-2xs"
            >
              <Save className="w-4 h-4" />
              <span>حفظ الإعدادات المحدثة</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
