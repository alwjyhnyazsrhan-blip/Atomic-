import React, { useState, useEffect } from 'react';
import {
  X,
  QrCode,
  Send,
  Terminal,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  Smartphone,
  MessageSquare
} from 'lucide-react';
import { SystemSettings, Courier } from '../types';

interface WhatsAppTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SystemSettings;
  couriers: Courier[];
  onAlertGenerated?: () => void;
}

export const WhatsAppTestModal: React.FC<WhatsAppTestModalProps> = ({
  isOpen,
  onClose,
  settings,
  couriers,
  onAlertGenerated,
}) => {
  const [recipientType, setRecipientType] = useState<'admin' | 'courier' | 'custom'>('admin');
  const [customPhone, setCustomPhone] = useState(settings.adminPhone || '');
  const [customName, setCustomName] = useState(settings.adminName || 'مشرف العمليات');
  const [selectedCourierId, setSelectedCourierId] = useState<string>(couriers[0]?.id || '');
  
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<{
    qrDataUrl: string;
    terminalQr: string;
    directWaLink: string;
    messageText: string;
    recipientPhone: string;
    recipientName: string;
    orderId: string;
  } | null>(null);

  const [copied, setCopied] = useState(false);
  const [showTerminalPreview, setShowTerminalPreview] = useState(false);

  // Sync custom phone when settings change
  useEffect(() => {
    if (settings.adminPhone && !customPhone) {
      setCustomPhone(settings.adminPhone);
    }
  }, [settings.adminPhone]);

  if (!isOpen) return null;

  const handleRunTest = async () => {
    setLoading(true);
    try {
      let targetPhone = customPhone;
      let targetName = customName;

      if (recipientType === 'admin') {
        targetPhone = settings.adminPhone || '966500000000';
        targetName = settings.adminName || 'مشرف العمليات';
      } else if (recipientType === 'courier') {
        const found = couriers.find((c) => c.id === selectedCourierId);
        if (found) {
          targetPhone = found.phone;
          targetName = found.name;
        }
      }

      const res = await fetch('/api/whatsapp/test-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientPhone: targetPhone,
          recipientName: targetName,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setTestResult(data);
        if (onAlertGenerated) onAlertGenerated();
      } else {
        alert('حدث خطأ أثناء إجراء الاختبار: ' + (data.message || 'فشل الاتصال'));
      }
    } catch (err: any) {
      alert('تعذر إجراء الاختبار. تأكد من عمل الخادم.');
    } finally {
      setLoading(false);
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8 space-y-5 animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>اختبار إرسال تنبيه الواتساب المباشر</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  QR Code & Terminal
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                التحقق من كود الإرسال التلقائي، وتوليد رمز QR لربط جلسة الواتساب وعرضه بالـ Terminal واللوحة
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Configuration Controls */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
          <div className="text-xs font-bold text-slate-800">توجيه التنبيه التجريبي إلى:</div>
          
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setRecipientType('admin')}
              className={`p-2.5 rounded-lg text-xs font-bold border transition text-center ${
                recipientType === 'admin'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              مشرف النظام (الإدارة)
            </button>
            <button
              type="button"
              onClick={() => setRecipientType('courier')}
              className={`p-2.5 rounded-lg text-xs font-bold border transition text-center ${
                recipientType === 'courier'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              مندوب مسجل
            </button>
            <button
              type="button"
              onClick={() => setRecipientType('custom')}
              className={`p-2.5 rounded-lg text-xs font-bold border transition text-center ${
                recipientType === 'custom'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              رقم مخصص
            </button>
          </div>

          {/* Conditional target input */}
          {recipientType === 'admin' && (
            <div className="text-xs text-slate-600 bg-white p-3 rounded-lg border border-slate-200 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900 block">رقم المشرف المعتمد:</span>
                <span className="font-mono text-slate-600" dir="ltr">{settings.adminPhone || 'لم يتم إدخاله في الإعدادات (سيتم استخدام رقم افتراضي)'}</span>
              </div>
              <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded">جاهز للاختبار</span>
            </div>
          )}

          {recipientType === 'courier' && (
            <div>
              {couriers.length === 0 ? (
                <div className="text-xs text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-200">
                  لا يوجد مناديب مسجلين حالياً. يمكنك التبديل لخيار "مشرف النظام" أو "رقم مخصص".
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-600">اختر المندوب المراد اختباره:</label>
                  <select
                    value={selectedCourierId}
                    onChange={(e) => setSelectedCourierId(e.target.value)}
                    className="w-full text-xs font-medium p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {couriers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} - ({c.phone})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {recipientType === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">الاسم التجريبي:</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="مثال: كابتن أحمد"
                  className="w-full text-xs font-medium p-2 bg-white border border-slate-300 rounded-lg focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">رقم الواتساب (مع رمز الدولة):</label>
                <input
                  type="text"
                  value={customPhone}
                  onChange={(e) => setCustomPhone(e.target.value)}
                  placeholder="9665xxxxxxxx"
                  className="w-full text-xs font-medium p-2 bg-white border border-slate-300 rounded-lg focus:outline-none"
                  dir="ltr"
                />
              </div>
            </div>
          )}

          <div className="pt-1">
            <button
              onClick={handleRunTest}
              disabled={loading}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'جاري توليد الفحص والـ QR...' : 'تشغيل الاختبار وتوليد QR Code الآن'}</span>
            </button>
          </div>
        </div>

        {/* Results Showcase */}
        {testResult ? (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* Terminal Status Notification Banner */}
            <div className="p-3.5 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
                <div>
                  <span className="font-bold text-emerald-400 block">🟢 تم إخراج رمز الـ QR بنجاح في الـ Terminal!</span>
                  <span className="text-[11px] text-slate-400">راجع شاشة موجه الأوامر (Console) لرؤية الـ ASCII QR المنعكس من الخادم مباشرة.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTerminalPreview(!showTerminalPreview)}
                className="px-2.5 py-1 text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition flex items-center gap-1"
              >
                <Terminal className="w-3 h-3 text-emerald-400" />
                <span>{showTerminalPreview ? 'إخفاء المعاينة' : 'معاينة الـ Terminal'}</span>
              </button>
            </div>

            {/* Terminal ASCII Preview if toggled */}
            {showTerminalPreview && (
              <div className="p-3 bg-black text-emerald-400 rounded-xl font-mono text-[10px] leading-tight overflow-x-auto border border-emerald-900/50 max-h-48 dir-ltr select-all">
                <pre>{testResult.terminalQr || testResult.sessionPayload}</pre>
              </div>
            )}

            {/* Split Grid: QR Code in UI & WhatsApp Action */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* QR Code Card */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col items-center justify-center text-center space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Smartphone className="w-4 h-4 text-emerald-600" />
                  <span>رمز QR لجلسة الواتساب في اللوحة</span>
                </div>

                <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-inner">
                  <img
                    src={testResult.qrDataUrl}
                    alt="WhatsApp Session QR Code"
                    className="w-48 h-48 rounded-lg object-contain mx-auto"
                  />
                </div>

                <div className="text-[11px] text-slate-500 leading-relaxed max-w-[220px]">
                  افتح تطبيق واتساب على هاتفك ← <strong>الأجهزة المرتبطة</strong> ← <strong>ربط جهاز</strong> لمسح الرمز.
                </div>
              </div>

              {/* Message Details & Direct Action Card */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4 text-emerald-600" />
                      <span>نص رسالة التنبيه الموجهة:</span>
                    </span>
                    <button
                      onClick={() => copyText(testResult.messageText)}
                      className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1 transition"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? 'تم النسخ' : 'نسخ'}</span>
                    </button>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                    {testResult.messageText}
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <div className="text-[11px] text-slate-500 flex items-center justify-between">
                    <span>المستلم: <strong>{testResult.recipientName}</strong></span>
                    <span className="font-mono text-slate-700" dir="ltr">{testResult.recipientPhone}</span>
                  </div>

                  <a
                    href={testResult.directWaLink}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-2xs transition"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>فتح المحادثة الفورية في WhatsApp Web / مباشر</span>
                  </a>
                </div>

              </div>

            </div>

          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            <QrCode className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-xs">اضغط على زر "تشغيل الاختبار وتوليد QR Code الآن" لتنفيذ الفحص الفعلي وعرض الرمز في اللوحة والـ Terminal.</p>
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>يتم تسجيل هذا الاختبار تلقائياً في سجل التنبيهات</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
          >
            إغلاق النافذة
          </button>
        </div>

      </div>
    </div>
  );
};
