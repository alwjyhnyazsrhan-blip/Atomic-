import React, { useState, useEffect } from 'react';
import { 
  X, 
  Phone, 
  Link2, 
  ShieldAlert, 
  CheckCircle2, 
  Send, 
  Save, 
  User, 
  Key, 
  Globe, 
  MessageSquare,
  Sparkles,
  QrCode,
  Check
} from 'lucide-react';
import { SystemSettings } from '../types';

interface QuickWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SystemSettings;
  onSave: (newSettings: Partial<SystemSettings>) => Promise<void> | void;
  onOpenFullWhatsAppSession?: () => void;
}

export const QuickWhatsAppModal: React.FC<QuickWhatsAppModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  onOpenFullWhatsAppSession,
}) => {
  const [adminPhone, setAdminPhone] = useState(settings.adminPhone || '');
  const [adminName, setAdminName] = useState(settings.adminName || 'مشرف العمليات');
  const [adminPhone2, setAdminPhone2] = useState(settings.adminPhone2 || '');
  const [adminName2, setAdminName2] = useState(settings.adminName2 || 'إدارة التصعيد الثاني');
  const [webhookUrl, setWebhookUrl] = useState(settings.webhookUrl || '');
  const [webhookApiKey, setWebhookApiKey] = useState(settings.webhookApiKey || '');
  const [whatsAppProvider, setWhatsAppProvider] = useState(settings.whatsAppProvider || 'baileys_vps');

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{ success: boolean; message: string; waLink?: string } | null>(null);

  // Sync state whenever settings change or modal opens
  useEffect(() => {
    if (isOpen) {
      setAdminPhone(settings.adminPhone || '');
      setAdminName(settings.adminName || 'مشرف العمليات');
      setAdminPhone2(settings.adminPhone2 || '');
      setAdminName2(settings.adminName2 || 'إدارة التصعيد الثاني');
      setWebhookUrl(settings.webhookUrl || '');
      setWebhookApiKey(settings.webhookApiKey || '');
      setWhatsAppProvider(settings.whatsAppProvider || 'baileys_vps');
      setSaveSuccess(false);
      setTestFeedback(null);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleSaveOnly = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const payload: Partial<SystemSettings> = {
        adminPhone: adminPhone.trim(),
        adminName: adminName.trim(),
        adminPhone2: adminPhone2.trim(),
        adminName2: adminName2.trim(),
        webhookUrl: webhookUrl.trim(),
        webhookApiKey: webhookApiKey.trim(),
        whatsAppProvider,
      };

      // 1. Direct call to server endpoint
      const res = await fetch('/api/settings/whatsapp-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      // 2. Client-side state & localStorage persistence
      if (data.success) {
        if (typeof window !== 'undefined') {
          const currentLocal = JSON.parse(localStorage.getItem('locat_settings') || '{}');
          localStorage.setItem('locat_settings', JSON.stringify({ ...currentLocal, ...payload }));
        }
        await onSave(payload);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err: any) {
      console.error('Failed to save whatsapp contact settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTestToAdmin = async () => {
    const target = adminPhone.trim();
    if (!target) {
      setTestFeedback({ success: false, message: 'يرجى إدخال رقم واتساب الإدارة أولاً لتجربة الإرسال' });
      return;
    }

    setTestSending(true);
    setTestFeedback(null);

    // Save first to ensure server has current number
    await handleSaveOnly();

    try {
      const res = await fetch('/api/whatsapp/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientPhone: target,
          recipientName: adminName.trim() || 'مشرف العمليات',
          message: `السلام عليكم، تم بنجاح تثبيت رقم التواصل ورابط الواتساب في نظام أتمتة ومتابعة لوكيت.\nالتوقيت: ${new Date().toLocaleTimeString('ar-SA', { timeZone: 'Asia/Riyadh' })} (توقيت الرياض)`,
        }),
      });
      const data = await res.json();
      setTestFeedback({
        success: data.success,
        message: data.message || (data.success ? 'تم إرسال رسالة الفحص بنجاح!' : 'تعذر الإرسال المباشر'),
        waLink: data.details?.waLink,
      });
    } catch {
      setTestFeedback({ success: false, message: 'خطأ في الاتصال بالخادم' });
    } finally {
      setTestSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm ring-4 ring-emerald-50">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-900">
                تثبيت أرقام التواصل ورابط الواتساب
              </h2>
              <p className="text-xs text-slate-500">
                حفظ مستقر ودائم على السيرفر (Render/VPS) بدون إلغاء أو إعادة ضبط
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSaveOnly} className="p-6 space-y-5 text-xs">
          
          {/* Notification Alert if saved */}
          {saveSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-center gap-2 font-bold animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>✅ تم حفظ وتثبيت أرقام التواصل ورابط الواتساب بنجاح في قاعدة البيانات!</span>
            </div>
          )}

          {/* Section 1: Admin Phone (Primary Contact) */}
          <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <Phone className="w-4 h-4 text-emerald-600" />
                <span>1. رقم التواصل الأساسي (مشرف العمليات المباشر)</span>
              </div>
              <span className="text-[10px] text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full font-bold">
                أساسي ومطلوب
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-normal">
              يتلقى إشعارات التأخير الأولية عند تجاوز الحد المسموح، والتقرير اليومي الشامل لأداء المناديب.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  رقم الواتساب (مع المفتاح الدولي):
                </label>
                <input
                  type="text"
                  value={adminPhone}
                  onChange={(e) => setAdminPhone(e.target.value)}
                  placeholder="مثال: +966501234567"
                  className="w-full font-mono text-xs px-3 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  dir="ltr"
                  required
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  يبدأ بـ +966 أو 05
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  اسم المشرف / الإدارة:
                </label>
                <input
                  type="text"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="مشرف العمليات المباشر"
                  className="w-full text-xs px-3 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Escalation Phone (Admin 2) */}
          <div className="p-4 bg-rose-50/40 rounded-xl border border-rose-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-rose-950 text-sm">
                <ShieldAlert className="w-4 h-4 text-rose-600" />
                <span>2. رقم إدارة التصعيد الثاني (التأخير الحرج)</span>
              </div>
              <span className="text-[10px] text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full font-bold">
                اختياري للتصعيد
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-normal">
              يتلقى تنبيهاً مباشراً يتضمن بيانات المندوب وعدد الطلبات النشطة بحوزته عند استمرار التأخير.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  رقم إدارة التصعيد:
                </label>
                <input
                  type="text"
                  value={adminPhone2}
                  onChange={(e) => setAdminPhone2(e.target.value)}
                  placeholder="مثال: +966590000000"
                  className="w-full font-mono text-xs px-3 py-2.5 bg-white border border-rose-200 rounded-lg focus:ring-2 focus:ring-rose-400 focus:outline-none"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  اسم جهة التصعيد:
                </label>
                <input
                  type="text"
                  value={adminName2}
                  onChange={(e) => setAdminName2(e.target.value)}
                  placeholder="الإدارة العليا / المشرف المناوب"
                  className="w-full text-xs px-3 py-2.5 bg-white border border-rose-200 rounded-lg focus:ring-2 focus:ring-rose-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 3: WhatsApp Webhook Link / Gateway URL */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <Globe className="w-4 h-4 text-indigo-600" />
                <span>3. رابط الواتساب (Webhook / API Gateway Link)</span>
              </div>
              <span className="text-[10px] text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full font-bold">
                اختياري أو إضافي
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-normal">
              إذا كان لديك رابط خدمة واتساب خارجية أو بوابة Webhook مخصصة، أدخل الرابط أدناه ليتم تحويل التنبيهات إليه آلياً فور حدوث أي تأخير:
            </p>

            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  رابط الويب هوك (WhatsApp Webhook URL):
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://api.example.com/whatsapp/send-alert"
                    className="w-full font-mono text-xs px-3 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none pl-8"
                    dir="ltr"
                  />
                  <Link2 className="w-4 h-4 text-slate-400 absolute left-2.5 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  مفتاح التوثيق للرابط (API Key / Bearer Token - اختياري):
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={webhookApiKey}
                    onChange={(e) => setWebhookApiKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                    className="w-full font-mono text-xs px-3 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none pl-8"
                    dir="ltr"
                  />
                  <Key className="w-4 h-4 text-slate-400 absolute left-2.5 top-3" />
                </div>
              </div>
            </div>
          </div>

          {/* Test Feedback if sent */}
          {testFeedback && (
            <div className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-2 ${
              testFeedback.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}>
              <div className="flex items-center gap-2">
                {testFeedback.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{testFeedback.message}</span>
              </div>
              {testFeedback.waLink && (
                <a
                  href={testFeedback.waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-emerald-700 hover:underline shrink-0"
                >
                  فتح في واتساب
                </a>
              )}
            </div>
          )}

          {/* Quick link to Baileys QR Modal if requested */}
          {onOpenFullWhatsAppSession && (
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-900 text-xs">
                <QrCode className="w-4 h-4 text-amber-600 shrink-0" />
                <span>ربط جهاز واتساب عبر الباركود (QR Code / Baileys)</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFullWhatsAppSession();
                }}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition shadow-2xs"
              >
                فتح ماسح الـ QR
              </button>
            </div>
          )}

          {/* Actions & Buttons */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleSendTestToAdmin}
              disabled={testSending || !adminPhone.trim()}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50 rounded-xl font-bold flex items-center gap-1.5 transition text-xs"
            >
              <Send className={`w-3.5 h-3.5 ${testSending ? 'animate-spin' : ''}`} />
              <span>{testSending ? 'جاري الإرسال...' : 'إرسال رسالة فحص للرقم الآن'}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl font-semibold transition text-xs"
              >
                إغلاق
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition shadow-sm text-xs"
              >
                {isSaving ? (
                  <>
                    <Save className="w-4 h-4 animate-spin" />
                    <span>جاري التثبيت...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>حفظ وتثبيت البيانات دائمياً</span>
                  </>
                )}
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
};
