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
  const [syncInterval, setSyncInterval] = useState(settings.locatSyncIntervalSeconds || 30);

  if (!isOpen) return null;

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
      autoDailyReport,
      dailyReportTime,
      locatSyncIntervalSeconds: Number(syncInterval) || 30,
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

          {/* Section 4: 24/7 Linux VPS & Puppeteer Headless Engine */}
          <div className="space-y-3 bg-indigo-50/50 p-4 rounded-xl border border-indigo-200">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Server className="w-4 h-4 text-indigo-600" />
                تشغيل الخادم الخفي 24/7 على Linux VPS
              </h3>
              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded font-mono text-[10px] font-bold">
                Baileys + Puppeteer
              </span>
            </div>
            
            <p className="text-slate-600 leading-relaxed">
              يعمل الخادم عبر <strong>@whiskeysockets/baileys</strong> لمسح QR Code لمرة واحدة دون اشتراكات شهرية، مع محرك <strong>Puppeteer</strong> لسحب طلبات لوكيت آلياً دون الحاجة لفتح اللابتوب.
            </p>

            <label className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-indigo-200 cursor-pointer hover:bg-indigo-50/50 transition">
              <div>
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-indigo-600" />
                  <span>تفعيل محرك Puppeteer Headless لسحب الطلبات تلقائياً</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  يتصفح صفحة supplier.locate.sa/orders دورياً في الخلفية ويسحب البيانات مباشرة إلى الخادم
                </div>
              </div>
              <input
                type="checkbox"
                checked={enablePuppeteerHeadless}
                onChange={(e) => setEnablePuppeteerHeadless(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
              />
            </label>

            {enablePuppeteerHeadless && (
              <div className="p-3 bg-white rounded-lg border border-indigo-200 space-y-2 animate-in fade-in duration-150">
                <div className="text-[11px] font-bold text-slate-700">بيانات الدخول للوكيت (اختياري، في حال طلب إعادة تسجيل الدخول بالـ VPS):</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={locateUsername}
                    onChange={(e) => setLocateUsername(e.target.value)}
                    placeholder="اسم المستخدم / البريد في لوكيت"
                    className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-md"
                  />
                  <input
                    type="password"
                    value={locatePassword}
                    onChange={(e) => setLocatePassword(e.target.value)}
                    placeholder="كلمة المرور في لوكيت"
                    className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-md"
                  />
                </div>
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
