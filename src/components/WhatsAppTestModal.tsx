import React, { useState, useEffect, useCallback } from 'react';
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
  MessageSquare,
  LogOut,
  AlertCircle,
  Clock,
  HardDrive,
  CheckCheck,
} from 'lucide-react';
import { SystemSettings, Courier, WhatsAppConnectionState } from '../types';

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
  const [activeTab, setActiveTab] = useState<'qr' | 'test' | 'terminal' | 'server'>('qr');
  const [connectionState, setConnectionState] = useState<WhatsAppConnectionState>({
    status: 'disconnected',
    isLoggedIn: false,
    userPhone: undefined,
    userName: undefined,
    qrDataUrl: null,
    qrRaw: null,
    lastConnectedAt: null,
    lastError: null,
  });
  const [terminalQr, setTerminalQr] = useState<string>('');
  const [hasSavedSession, setHasSavedSession] = useState<boolean>(false);
  const [sessionDir, setSessionDir] = useState<string>('');
  const [isPolling, setIsPolling] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Test Message States
  const [recipientType, setRecipientType] = useState<'admin' | 'admin2' | 'courier' | 'custom'>('admin');
  const [customPhone, setCustomPhone] = useState(settings.adminPhone || '');
  const [customName, setCustomName] = useState(settings.adminName || 'مشرف العمليات');
  const [selectedCourierId, setSelectedCourierId] = useState<string>(couriers[0]?.id || '');
  const [customMessageText, setCustomMessageText] = useState('');
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
    textSent?: string;
  } | null>(null);

  const [copied, setCopied] = useState(false);

  // Fetch live WhatsApp status from server
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      const data = await res.json();
      if (data.success) {
        setConnectionState(data.whatsappState);
        if (data.terminalQr) setTerminalQr(data.terminalQr);
        if (typeof data.hasSavedSession === 'boolean') setHasSavedSession(data.hasSavedSession);
        if (data.sessionDir) setSessionDir(data.sessionDir);
      }
    } catch (err) {
      console.error('Failed to fetch whatsapp status:', err);
    }
  }, []);

  // Poll status while modal is open
  useEffect(() => {
    if (!isOpen) return;

    fetchStatus();
    setIsPolling(true);

    const interval = setInterval(() => {
      fetchStatus();
    }, 3500);

    return () => {
      clearInterval(interval);
      setIsPolling(false);
    };
  }, [isOpen, fetchStatus]);

  // Sync custom phone with settings
  useEffect(() => {
    if (settings.adminPhone && !customPhone) {
      setCustomPhone(settings.adminPhone);
    }
  }, [settings.adminPhone]);

  if (!isOpen) return null;

  // Handle Reconnect / Fresh QR
  const handleReconnect = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/whatsapp/reconnect', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        fetchStatus();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Logout / Clear Session
  const handleLogout = async () => {
    if (!confirm('هل أنت متأكد من رغبتك في تسجيل الخروج ومسح بيانات الجلسة القديمة وتوليد رمز QR جديد؟')) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch('/api/whatsapp/logout', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTestResult(null);
        fetchStatus();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Sending Real Test Message
  const handleSendTestMessage = async () => {
    setActionLoading(true);
    setTestResult(null);

    let targetPhone = customPhone;
    let targetName = customName;

    if (recipientType === 'admin') {
      targetPhone = settings.adminPhone || '';
      targetName = settings.adminName || 'مشرف العمليات';
    } else if (recipientType === 'admin2') {
      targetPhone = settings.adminPhone2 || '';
      targetName = settings.adminName2 || 'مشرف التصعيد الثاني';
    } else if (recipientType === 'courier') {
      const found = couriers.find((c) => c.id === selectedCourierId);
      if (found) {
        targetPhone = found.phone;
        targetName = found.name;
      }
    }

    if (!targetPhone) {
      alert('يرجى تحديد رقم واتساب صالح لإجراء الاختبار');
      setActionLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/whatsapp/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientPhone: targetPhone,
          recipientName: targetName,
          message: customMessageText.trim() || undefined,
        }),
      });

      const data = await res.json();
      setTestResult(data);
      if (onAlertGenerated) onAlertGenerated();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: 'فشل الاتصال بالخادم لإرسال الرسالة',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8 space-y-5 animate-in fade-in zoom-in duration-200">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              connectionState.isLoggedIn
                ? 'bg-emerald-100 text-emerald-700 ring-4 ring-emerald-50'
                : 'bg-emerald-600 text-white'
            }`}>
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  إدارة وربط جلسة الواتساب (Baileys Session Engine)
                </h3>
                {connectionState.isLoggedIn ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>متصل ومستقر</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                    <span>بانتظار المسح</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                تثبيت اتصال الواتساب على السيرفر (Render/VPS)، حفظ الجلسة محلياً، وإرسال التنبيهات عبر طابور الحماية من الحظر
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

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('qr')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'qr'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>رمز الاستجابة السريعة (QR Code)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('test')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'test'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>إرسال رسالة فحص حقيقية</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('server')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'server'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>ثبات الجلسة على Render</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('terminal')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'terminal'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>سجل الـ Terminal</span>
          </button>
        </div>

        {/* TAB 1: QR CODE & CONNECTION STATUS */}
        {activeTab === 'qr' && (
          <div className="space-y-4">
            {/* Status Card */}
            {connectionState.isLoggedIn ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-emerald-900">
                      جلسة الواتساب نشطة ومتصلة بنجاح
                    </h4>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      رقم الحساب المرتبط: <strong className="font-mono text-slate-900 font-bold" dir="ltr">+{connectionState.userPhone || '966'}</strong>
                      {connectionState.userName && ` (${connectionState.userName})`}
                    </p>
                    <p className="text-[11px] text-emerald-600 mt-1">
                      الجلسة محفوظة في مجلد الخادم: <code className="font-mono bg-emerald-100/70 px-1.5 py-0.5 rounded text-emerald-800">baileys_auth_info</code>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleReconnect}
                    disabled={actionLoading}
                    className="px-3 py-1.5 text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-lg transition flex items-center gap-1 shadow-2xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                    <span>تحديث</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={actionLoading}
                    className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 rounded-lg transition flex items-center gap-1 shadow-2xs"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>تسجيل خروج</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-amber-900">
                      بانتظار مسح رمز QR لربط الحساب
                    </h4>
                    <p className="text-xs text-amber-700 mt-0.5">
                      امسح الرمز أدناه من تطبيق واتساب لربط رقم الهاتف بالنظام بشكل دائم ومستقر.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleReconnect}
                  disabled={actionLoading}
                  className="px-3 py-1.5 text-xs font-bold text-amber-900 bg-white hover:bg-amber-100 border border-amber-300 rounded-lg transition flex items-center gap-1 shadow-2xs shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                  <span>تحديث الرمز</span>
                </button>
              </div>
            )}

            {/* QR Box & Steps */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center bg-slate-50 p-5 rounded-2xl border border-slate-200/80">
              
              {/* QR Frame */}
              <div className="flex flex-col items-center justify-center p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
                {connectionState.isLoggedIn ? (
                  <div className="text-center py-8 px-4 space-y-3">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto ring-8 ring-emerald-50">
                      <CheckCircle2 className="w-9 h-9" />
                    </div>
                    <div className="text-sm font-bold text-slate-800">
                      الجلسة مقترنة وجاهزة لإرسال التنبيهات
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
                      تم ربط رقم الواتساب بنجاح. سيتم إرسال كافة التنبيهات المباشرة للمناديب والإدارة آلياً عبر هذا الحساب.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('test')}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs transition"
                    >
                      إجراء فحص إرسال رسالة الآن
                    </button>
                  </div>
                ) : connectionState.qrDataUrl ? (
                  <div className="text-center space-y-2.5">
                    <img
                      src={connectionState.qrDataUrl}
                      alt="WhatsApp QR Code"
                      className="w-56 h-56 rounded-lg mx-auto shadow-sm border border-slate-100"
                    />
                    <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                      <span>الرمز حي ومحدث تلقائياً</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 px-4 space-y-3">
                    <RefreshCw className="w-8 h-8 text-slate-400 animate-spin mx-auto" />
                    <div className="text-xs font-bold text-slate-700">جاري تهيئة جلسة Baileys واستخراج الرمز...</div>
                    <p className="text-[11px] text-slate-500">إذا تأخر ظهور الرمز، اضغط على زر "تحديث الرمز" أعلاه</p>
                  </div>
                )}
              </div>

              {/* Instructions */}
              <div className="space-y-3 text-xs">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-emerald-600" />
                  <span>خطوات الربط السريع من الهاتف:</span>
                </h4>
                
                <ol className="space-y-2.5 text-slate-700 leading-relaxed list-decimal list-inside pr-1 font-medium">
                  <li className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                    افتح تطبيق <strong>واتساب</strong> على هاتفك المحمول.
                  </li>
                  <li className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                    اضغط على <strong>الإعدادات (أو القائمة ⋮)</strong> ثم اختر <strong>الأجهزة المرتبطة (Linked Devices)</strong>.
                  </li>
                  <li className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                    اضغط على زر <strong>ربط جهاز (Link a device)</strong>.
                  </li>
                  <li className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                    وجّه كاميرا الهاتف نحو رمز الـ <strong>QR Code</strong> المجاور.
                  </li>
                </ol>

                <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl text-emerald-800 text-[11px] leading-relaxed flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>ملاحظة هامة:</strong> جلسة Baileys تُحفظ بشكل دائم في ملفات السيرفر، وتظل متصلة ومستمرة حتى بعد إعادة تشغيل السيرفر على Render أو VPS دون الحاجة لإعادة المسح المتكرر.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: REAL TEST MESSAGE DISPATCH (ZERO DUMMY DATA) */}
        {activeTab === 'test' && (
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
              <div className="text-xs font-bold text-slate-800">توجيه رسالة الفحص التجريبية إلى:</div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setRecipientType('admin')}
                  className={`p-2 rounded-lg text-xs font-bold border transition text-center ${
                    recipientType === 'admin'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  مشرف الإدارة 1
                </button>

                <button
                  type="button"
                  onClick={() => setRecipientType('admin2')}
                  className={`p-2 rounded-lg text-xs font-bold border transition text-center ${
                    recipientType === 'admin2'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  إدارة التصعيد 2
                </button>

                <button
                  type="button"
                  onClick={() => setRecipientType('courier')}
                  className={`p-2 rounded-lg text-xs font-bold border transition text-center ${
                    recipientType === 'courier'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  مندوب مسجل
                </button>

                <button
                  type="button"
                  onClick={() => setRecipientType('custom')}
                  className={`p-2 rounded-lg text-xs font-bold border transition text-center ${
                    recipientType === 'custom'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  رقم مخصص
                </button>
              </div>

              {/* Conditional target selector */}
              {recipientType === 'admin' && (
                <div className="text-xs text-slate-600 bg-white p-3 rounded-lg border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 block">رقم المشرف الأساسي (الإدارة الأولى):</span>
                    <span className="font-mono text-slate-600" dir="ltr">{settings.adminPhone || 'لم يتم إدخال رقم بعد في الإعدادات'}</span>
                  </div>
                  <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded font-bold">
                    {settings.adminPhone ? 'جاهز للفحص' : 'تنبيه: أضف الرقم في الإعدادات'}
                  </span>
                </div>
              )}

              {recipientType === 'admin2' && (
                <div className="text-xs text-slate-600 bg-white p-3 rounded-lg border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 block">رقم إدارة التصعيد الثاني (التأخير الحرج):</span>
                    <span className="font-mono text-slate-600" dir="ltr">{settings.adminPhone2 || 'لم يتم إدخال رقم بعد في الإعدادات'}</span>
                  </div>
                  <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded font-bold">
                    {settings.adminPhone2 ? 'جاهز للفحص' : 'تنبيه: أضف الرقم في الإعدادات'}
                  </span>
                </div>
              )}

              {recipientType === 'courier' && (
                <div>
                  {couriers.length === 0 ? (
                    <div className="text-xs text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-200">
                      لا يوجد مناديب مسجلين في النظام حالياً. انتقل إلى تبويب "بيانات المناديب" لإضافة مناديب حقيقيين، أو استخدم خيار "رقم مخصص".
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">اختر المندوب المستهدف:</label>
                      <select
                        value={selectedCourierId}
                        onChange={(e) => setSelectedCourierId(e.target.value)}
                        className="w-full text-xs font-medium p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none"
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
                    <label className="text-[11px] text-slate-600 font-bold block mb-1">اسم المستلم:</label>
                    <input
                      type="text"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="مثال: مشرف التوصيل"
                      className="w-full text-xs font-medium p-2 bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600 font-bold block mb-1">رقم الواتساب مع المفتاح الدولي:</label>
                    <input
                      type="text"
                      value={customPhone}
                      onChange={(e) => setCustomPhone(e.target.value)}
                      placeholder="9665xxxxxxxx"
                      className="w-full text-xs font-medium p-2 bg-white border border-slate-300 rounded-lg font-mono"
                      dir="ltr"
                    />
                  </div>
                </div>
              )}

              {/* Message text override */}
              <div>
                <label className="text-[11px] text-slate-600 font-bold block mb-1">نص الرسالة (اختياري، أو سيتم استخدام النص القياسي):</label>
                <textarea
                  rows={2}
                  value={customMessageText}
                  onChange={(e) => setCustomMessageText(e.target.value)}
                  placeholder="مرحباً، هذه رسالة فحص مباشر من نظام أتمتة لوكيت للتأكد من ثبات واستقرار الاتصال."
                  className="w-full text-xs font-medium p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none resize-none leading-relaxed"
                />
              </div>

              <button
                type="button"
                onClick={handleSendTestMessage}
                disabled={actionLoading}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition"
              >
                <Send className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} />
                <span>{actionLoading ? 'جاري الإرسال عبر الواتساب...' : 'إرسال رسالة الفحص الآن'}</span>
              </button>
            </div>

            {/* Test Outcome feedback */}
            {testResult && (
              <div className={`p-4 rounded-xl border animate-in fade-in duration-200 text-xs ${
                testResult.success 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold">
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span>{testResult.message}</span>
                  </div>

                  {testResult.details?.waLink && (
                    <a
                      href={testResult.details.waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-700 hover:underline flex items-center gap-1 font-bold shrink-0"
                    >
                      <span>فتح في واتساب</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                {testResult.textSent && (
                  <div className="mt-2.5 bg-white/80 p-2.5 rounded-lg border border-emerald-200/60 font-mono text-[11px] text-slate-700 whitespace-pre-wrap">
                    {testResult.textSent}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: RENDER & VPS PERSISTENCE DETAILS */}
        {activeTab === 'server' && (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <HardDrive className="w-4 h-4 text-emerald-600" />
                <span>كيفية بقاء الجلسة محفوظة ومستقرة على Render / VPS:</span>
              </div>
              
              <p className="text-slate-600 leading-relaxed">
                يستخدم النظام مكتبة <strong>Baileys</strong> مع محرك التخزين المتعدد <code className="font-mono bg-slate-200 px-1 py-0.5 rounded text-slate-900">useMultiFileAuthState</code>، مما يعني أن مفاتيح التشفير وبيانات المصادقة تُحفظ في المسار:
              </p>

              <div className="bg-slate-900 text-slate-100 font-mono p-3 rounded-lg text-xs flex items-center justify-between" dir="ltr">
                <span>{sessionDir || './baileys_auth_info'}</span>
                <span className="text-[11px] text-emerald-400 font-sans">
                  {hasSavedSession ? '✅ توجد بيانات جلسة محفوظة' : '⚠️ بانتظار حفظ أول جلسة'}
                </span>
              </div>

              <div className="space-y-2 text-slate-700 pt-1">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>إعادة تشغيل الخادم (Server Restart):</strong> عند إعادة تشغيل السيرفر أو عمل Deploy جديد، يقوم السيرفر تلقائياً بقراءة ملفات الجلسة والاتصال بواتساب بدون الحاجة لإعادة مسح الـ QR مطلقاً.
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>نصيحة لنشر Render:</strong> للحفاظ على الجلسة حتى لو تم حذف القرص المؤقت في الباقة المجانية، يمكنك إضافة <strong>Persistent Disk</strong> على Render بنقطة تثبيت <code className="font-mono">/app/baileys_auth_info</code> وتعيين المتغير <code className="font-mono">BAILEYS_AUTH_DIR=/app/baileys_auth_info</code>.
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>إعادة ضبط الاتصال:</strong> إذا أردت استبدال رقم الواتساب برقم آخر، يمكنك ببساطة الضغط على "تسجيل خروج" ليقوم السيرفر بمسح الجلسة وتوليد رمز QR جديد فوراً.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: TERMINAL CONSOLE LOG VIEW */}
        {activeTab === 'terminal' && (
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-slate-600" />
                <span>مخرجات الـ Terminal في السيرفر (Render Logs / Console):</span>
              </div>
              {terminalQr && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(terminalQr)}
                  className="px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1 transition"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'تم النسخ!' : 'نسخ كود الـ Terminal'}</span>
                </button>
              )}
            </div>

            <div className="bg-slate-950 text-emerald-400 font-mono p-4 rounded-xl text-[11px] overflow-x-auto leading-tight max-h-72 border border-slate-800 shadow-inner select-all" dir="ltr">
              {terminalQr ? (
                <pre>{terminalQr}</pre>
              ) : (
                <div className="text-slate-400 py-6 text-center font-sans">
                  {connectionState.isLoggedIn 
                    ? '✅ جلسة الواتساب مقترنة بالفعل على الخادم. لا يتطلب السيرفر عرض رمز Terminal حالياً.'
                    : 'جاري انتظار بث رمز الـ QR إلى التيرمينال...'}
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              يمكنك أيضاً رؤية رمز الـ QR مباشرة في لوحة تحكم Render بالذهاب إلى <strong>Render Dashboard &gt; Logs</strong> ومسحه مباشرة من سجل السيرفر.
            </p>
          </div>
        )}

        {/* Modal Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>طابور الحماية من الحظر: تأخير عشوائي 5-10 ثوانٍ + Cooldown {settings.alertCooldownMinutes} دقيقة</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
