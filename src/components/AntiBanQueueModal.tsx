import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  Clock,
  Send,
  RefreshCw,
  Server,
  Bot,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  ExternalLink,
  ShieldAlert,
  Smartphone,
  Info
} from 'lucide-react';
import { QueuedWhatsAppMessage, PuppeteerScraperStatus, SystemSettings } from '../types';

interface AntiBanQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SystemSettings;
}

export const AntiBanQueueModal: React.FC<AntiBanQueueModalProps> = ({
  isOpen,
  onClose,
  settings,
}) => {
  const [queue, setQueue] = useState<QueuedWhatsAppMessage[]>([]);
  const [stats, setStats] = useState<{
    totalProcessed: number;
    totalSent: number;
    totalSkippedCooldown: number;
    isQueueProcessing: boolean;
  }>({
    totalProcessed: 0,
    totalSent: 0,
    totalSkippedCooldown: 0,
    isQueueProcessing: false,
  });
  const [puppeteerStatus, setPuppeteerStatus] = useState<PuppeteerScraperStatus>({
    enabled: settings.enablePuppeteerHeadless || false,
    isRunning: false,
    status: 'idle',
    lastScrapedCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'queue' | 'vps_info'>('queue');

  const fetchQueueData = async () => {
    try {
      const res = await fetch('/api/whatsapp/queue');
      if (res.ok) {
        const data = await res.json();
        setQueue(data.queue || []);
        setStats({
          totalProcessed: data.totalProcessed || 0,
          totalSent: data.totalSent || 0,
          totalSkippedCooldown: data.totalSkippedCooldown || 0,
          isQueueProcessing: !!data.isQueueProcessing,
        });
        if (data.puppeteerStatus) {
          setPuppeteerStatus(data.puppeteerStatus);
        }
      }
    } catch (e) {
      console.error('Error fetching queue:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchQueueData();
      const interval = setInterval(fetchQueueData, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClearQueue = async () => {
    if (!confirm('هل تريد تفريغ طابور الرسائل الحالية؟')) return;
    try {
      await fetch('/api/whatsapp/queue/clear', { method: 'POST' });
      fetchQueueData();
    } catch (e) {
      alert('تعذر تفريغ الطابور');
    }
  };

  const handleTriggerScrape = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/puppeteer/trigger', { method: 'POST' });
      const data = await res.json();
      alert(data.message || 'تم بدء محرك السحب');
      fetchQueueData();
    } catch (e) {
      alert('تعذر تشغيل فحص Puppeteer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 my-8 space-y-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <span>نظام حماية الواتساب من الحظر (Anti-Ban Queue)</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  فارق {settings.antiBanMinDelaySeconds || 5}-{settings.antiBanMaxDelaySeconds || 10} ثوانٍ
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                طابور متسلسل مؤمن لمنع الحظر، فترات سماح (Cooldown {settings.alertCooldownMinutes || 20} دقيقة)، وتشغيل 24/7 بالـ VPS
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'queue'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900 bg-slate-100'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>طابور الرسائل المباشر ({queue.filter(q => q.status === 'waiting' || q.status === 'sending').length})</span>
          </button>
          <button
            onClick={() => setActiveTab('vps_info')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'vps_info'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900 bg-slate-100'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>إعدادات تشغيل 24/7 بالـ VPS (Baileys + Puppeteer)</span>
          </button>
        </div>

        {/* Tab 1: Live Message Queue */}
        {activeTab === 'queue' && (
          <div className="space-y-4">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500 block">حالة المعالج</span>
                <span className="font-bold text-xs flex items-center gap-1.5 mt-1">
                  <span className={`w-2 h-2 rounded-full ${stats.isQueueProcessing ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`}></span>
                  <span className={stats.isQueueProcessing ? 'text-emerald-700' : 'text-slate-600'}>
                    {stats.isQueueProcessing ? 'جاري الإرسال بأمان' : 'في الانتظار'}
                  </span>
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500 block">إجمالي المرسل بأمان</span>
                <span className="font-bold text-sm text-emerald-700 mt-1 block">
                  {stats.totalSent} رسائل
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500 block">تخطي تكرار (Cooldown)</span>
                <span className="font-bold text-sm text-amber-700 mt-1 block">
                  {stats.totalSkippedCooldown} مرة
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500 block">الفارق الزمني الآمن</span>
                <span className="font-bold text-sm text-slate-800 mt-1 block font-mono">
                  {settings.antiBanMinDelaySeconds || 5}-{settings.antiBanMaxDelaySeconds || 10} ثوانٍ
                </span>
              </div>
            </div>

            {/* Actions Toolbar */}
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-800">سجل عناصر الطابور الحالية:</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchQueueData}
                  className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-1 transition"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>تحديث</span>
                </button>
                {queue.length > 0 && (
                  <button
                    onClick={handleClearQueue}
                    className="px-2.5 py-1 text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>تفريغ الطابور</span>
                  </button>
                )}
              </div>
            </div>

            {/* Queue Table */}
            {queue.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">الطابور فارغ حالياً</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  كل الرسائل والتنبيهات المجدولة تم إرسالها بأمان بدون أي تراكم مفاجئ للرسائل.
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs max-h-72 overflow-y-auto">
                <table className="w-full text-right">
                  <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">المستلم والوجهة</th>
                      <th className="p-2.5">نوع التنبيه</th>
                      <th className="p-2.5">رقم الطلب</th>
                      <th className="p-2.5">تأخير الأمان المطبق</th>
                      <th className="p-2.5">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {queue.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-2.5">
                          <div className="font-bold text-slate-800">{item.recipientName}</div>
                          <div className="font-mono text-[10px] text-slate-500" dir="ltr">{item.recipientPhone}</div>
                        </td>
                        <td className="p-2.5">
                          {item.recipientType === 'courier' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              تذكير مندوب
                            </span>
                          )}
                          {item.recipientType === 'admin' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                              إشعار إدارة أول
                            </span>
                          )}
                          {item.recipientType === 'admin2' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 flex items-center gap-1 w-fit">
                              <ShieldAlert className="w-2.5 h-2.5" />
                              تصعيد إدارة 2
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 font-mono text-slate-700">{item.orderId}</td>
                        <td className="p-2.5">
                          <span className="font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            +{item.delayAppliedSeconds || 5} ثوانٍ
                          </span>
                        </td>
                        <td className="p-2.5">
                          {item.status === 'waiting' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 animate-pulse">
                              في طابور الأمان
                            </span>
                          )}
                          {item.status === 'sending' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                              جاري الإرسال...
                            </span>
                          )}
                          {item.status === 'sent' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1 w-fit">
                              <CheckCircle2 className="w-3 h-3" />
                              تم الإرسال
                            </span>
                          )}
                          {item.status === 'skipped_cooldown' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600" title="تم التخطي لأن الطلب أرسل له تنبيه حديثاً">
                              فترة Cooldown نشطة
                            </span>
                          )}
                          {item.status === 'failed' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                              فشل ({item.error || 'خطأ'})
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: VPS 24/7 Architecture & Puppeteer */}
        {activeTab === 'vps_info' && (
          <div className="space-y-4 text-xs">
            {/* Puppeteer Scraper Status Banner */}
            <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-indigo-600" />
                  <span className="font-bold text-sm text-slate-900">محرك Puppeteer لسحب الطلبات آلياً بدون لابتوب</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  puppeteerStatus.isRunning ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                }`}>
                  {puppeteerStatus.isRunning ? 'جاري السحب الآن' : 'في وضع الاستعداد'}
                </span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                يقوم الخادم بتشغيل متصفح خفي (Headless Chromium) يتصفح دورياً رابط <code>https://supplier.locate.sa/orders</code> ويسحب الطلبات والمناديب لحظياً لتغذية نظام التنبيهات دون الحاجة لفتح المتصفح يدوياً.
              </p>
              <div className="flex items-center justify-between pt-1">
                <div className="text-[11px] text-slate-500">
                  آخر عملية سحب: <strong>{puppeteerStatus.lastScrapeTime ? new Date(puppeteerStatus.lastScrapeTime).toLocaleTimeString('ar-SA', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' }) : 'لم تُنفذ بعد'}</strong> (تم استخراج {puppeteerStatus.lastScrapedCount} طلب)
                </div>
                <button
                  onClick={handleTriggerScrape}
                  disabled={loading || puppeteerStatus.isRunning}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>بدء سحب تجريبي الآن</span>
                </button>
              </div>
            </div>

            {/* Baileys WhatsApp 24/7 Socket Card */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-emerald-600" />
                  <span className="font-bold text-sm text-slate-900">ربط الواتساب 24/7 عبر @whiskeysockets/baileys</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  بدون اشتراك شهري
                </span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                يتم مسح رمز الـ QR لمرة واحدة من خيار "الأجهزة المرتبطة" بتطبيق واتساب. يقوم الخادم بتخزين مفاتيح الجلسة في مجلد <code>./baileys_auth_info</code> ليعمل على مدار الساعة (24/7) دون انقطاع.
              </p>
            </div>

            {/* Linux VPS Commands Guide */}
            <div className="p-4 bg-slate-900 text-slate-200 rounded-xl border border-slate-800 space-y-2 font-mono text-[11px]">
              <div className="flex items-center justify-between text-emerald-400 font-bold">
                <span>أوامر التشغيل الدائم 24/7 على Linux VPS (PM2):</span>
                <span>Ubuntu / Debian</span>
              </div>
              <pre className="bg-black/60 p-3 rounded-lg text-slate-300 leading-relaxed overflow-x-auto select-all dir-ltr">
{`# 1. تثبيت الحزم ومحرك المتصفح
npm install

# 2. تشغيل الخادم الدائم عبر PM2 مع إعادة التشغيل التلقائي عند التوقف
npm install -g pm2
pm2 start server.js --name "locate-dispatcher"

# 3. حفظ التشغيل ليبدأ تلقائياً عند إعادة إقلاع السيرفر
pm2 save
pm2 startup`}
              </pre>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>نظام الحماية من الحظر نشط تلقائياً مع كافة التنبيهات</span>
          </span>
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
