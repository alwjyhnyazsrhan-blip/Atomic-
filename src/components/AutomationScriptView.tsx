import React, { useState, useEffect } from 'react';
import { 
  Code, 
  Copy, 
  Check, 
  Download, 
  Terminal, 
  ExternalLink, 
  Zap, 
  CheckCircle2, 
  Bookmark, 
  RefreshCw,
  Send,
  AlertTriangle,
  Play
} from 'lucide-react';
import { SystemSettings } from '../types';

interface AutomationScriptViewProps {
  settings: SystemSettings;
  onTestSync?: (orders: any[]) => void;
}

export const AutomationScriptView: React.FC<AutomationScriptViewProps> = ({
  settings,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'userscript' | 'bookmarklet' | 'api' | 'status'>('userscript');
  const [scriptCode, setScriptCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [healthStatus, setHealthStatus] = useState<'idle' | 'checking' | 'active'>('idle');
  const [healthMessage, setHealthMessage] = useState<string | null>(null);

  const currentHost = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const syncEndpoint = `${currentHost}/api/locat/sync`;

  useEffect(() => {
    // Load generated script code
    fetch('/api/automation-script')
      .then((res) => res.text())
      .then((text) => setScriptCode(text))
      .catch((err) => console.error(err));
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([scriptCode], { type: 'application/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'locat-monitor-automation.user.js';
    link.click();
  };

  // Bookmarklet code
  const bookmarkletCode = `javascript:(function(){const s=document.createElement('script');s.src='${currentHost}/api/automation-script';document.body.appendChild(s);})();`;

  const checkLiveConnection = async () => {
    setHealthStatus('checking');
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        setHealthStatus('active');
        setHealthMessage(`تم التحقق: خادم المزامنة جاهز لاستقبال بيانات لوكيت المباشرة على ${syncEndpoint}`);
      } else {
        setHealthStatus('idle');
        setHealthMessage('تعذر الوصول إلى خادم المزامنة.');
      }
    } catch {
      setHealthStatus('idle');
      setHealthMessage('خطأ في الاتصال بالخادم.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">سكربت الأتمتة المباشر لشاشة لوكيت (Locate Userscript)</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              محدث لـ supplier.locate.sa/orders
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            يقوم السكربت بمراقبة صفحة الطلبات المباشرة في لوكيت (<code className="font-mono bg-slate-100 px-1 text-emerald-800 font-bold">supplier.locate.sa/orders</code>)، وقراءة رقم الطلب واسم المندوب والوقت المنقضي وعدد الطلبات النشطة بدقة وإرسالها للوحة التحكم.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>تحميل .user.js</span>
          </button>

          <button
            onClick={() => handleCopy(scriptCode)}
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-1.5 transition shadow-2xs"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>تم النسخ!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ السكربت كاملاً</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveSubTab('userscript')}
          className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition ${
            activeSubTab === 'userscript'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          1. سكربت المتصفح (Tampermonkey / Violentmonkey)
        </button>
        <button
          onClick={() => setActiveSubTab('bookmarklet')}
          className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition ${
            activeSubTab === 'bookmarklet'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          2. تشغيل بنقرة واحدة (Bookmarklet)
        </button>
        <button
          onClick={() => setActiveSubTab('api')}
          className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition ${
            activeSubTab === 'api'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          3. مواصفات الـ API & Webhook
        </button>
        <button
          onClick={() => setActiveSubTab('status')}
          className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
            activeSubTab === 'status'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          <span>4. فحص اتصال خادم المزامنة</span>
        </button>
      </div>

      {/* Sub Tab 1: Tampermonkey Userscript */}
      {activeSubTab === 'userscript' && (
        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 space-y-2">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-600" />
              طريقة التثبيت والتشغيل في 3 خطوات بسيطة:
            </h3>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-600 pr-2">
              <li>
                قم بتثبيت إضافة <strong>Tampermonkey</strong> أو <strong>Violentmonkey</strong> على متصفحك (Chrome / Edge / Firefox).
              </li>
              <li>
                افتح الإضافة واضغط على <strong>Create a new script</strong> (إنشاء سكربت جديد).
              </li>
              <li>
                انسخ الكود البرمجي أدناه بالكامل والصقه هناك، ثم اضغط <strong>Save</strong> (حفظ).
              </li>
              <li>
                افتح شاشة الطلبات الحية في لوكيت: <a href="https://supplier.locate.sa/orders" target="_blank" rel="noreferrer" className="text-emerald-700 underline font-mono font-bold">https://supplier.locate.sa/orders</a>
              </li>
              <li>
                سيعمل السكربت تلقائياً وستظهر شارة خضراء عائمة أسفل يسار الشاشة: <span className="inline-flex items-center gap-1 font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full text-[11px]">🟢 Locate Dispatcher Active</span> تفيد بنجاح الربط وبدء قراءة أسطر الجدول وإرسال البيانات كل {settings.locatSyncIntervalSeconds} ثوانٍ!
              </li>
            </ol>
          </div>

          {/* Badge Preview & Features */}
          <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 text-xs space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="font-bold text-emerald-950 block">مظهر الشارة الخضراء في صفحة لوكيت:</span>
                <span className="text-emerald-700 text-[11px]">تظهر أسفل الشاشة وتوضح عدد الطلبات المقروءة ووقت آخر مزامنة. انقر عليها لتعديل رابط المزامنة (SYNC_URL) في أي وقت.</span>
              </div>
              <div className="bg-emerald-600 text-white font-bold text-xs px-3 py-1.5 rounded-full shadow-sm flex items-center gap-2 self-start shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-200 animate-pulse"></span>
                <span>🟢 Locate Dispatcher Active</span>
                <span className="text-[10px] opacity-90 font-normal">(متزامن)</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 text-slate-200 rounded-xl p-4 font-mono text-xs overflow-x-auto max-h-[480px] border border-slate-800 dir-ltr select-all">
            <pre>{scriptCode || '// Loading script...'}</pre>
          </div>
        </div>
      )}

      {/* Sub Tab 2: Bookmarklet */}
      {activeSubTab === 'bookmarklet' && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-900 space-y-2">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-emerald-600" />
              طريقة الإشارة المرجعية (Bookmarklet) - دون الحاجة لتثبيت أي إضافات:
            </h3>
            <p>
              يمكنك تشغيل الأتمتة فوراً على أي متصفح بمجرد إضافة هذا الرابط إلى شريط المفضلة لديك والضغط عليه أثناء تواجدك في صفحة لوكيت:
            </p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">كود الـ Bookmarklet:</span>
              <button
                onClick={() => handleCopy(bookmarkletCode)}
                className="px-3 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1"
              >
                <Copy className="w-3 h-3" />
                <span>نسخ الكود</span>
              </button>
            </div>

            <div className="bg-slate-900 text-emerald-400 p-3 rounded-lg font-mono text-xs break-all dir-ltr">
              {bookmarkletCode}
            </div>

            <div className="text-xs text-slate-500 pt-2 border-t border-slate-100">
              💡 <strong>نصيحة:</strong> قم بإنشاء إشارة مرجعية جديدة في المتصفح باسم "ربط لوكيت"، والصق هذا الكود في خانة الرابط (URL).
            </div>
          </div>
        </div>
      )}

      {/* Sub Tab 3: API & Webhook Specs */}
      {activeSubTab === 'api' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4 shadow-2xs">
            <div>
              <h3 className="font-bold text-sm text-slate-900">نقطة نهاية المزامنة (Live Sync Ingestion Endpoint)</h3>
              <p className="text-xs text-slate-500 mt-1">
                يمكن لأي سكربت خارجي (Puppeteer, Playwright, Python scraper) إرسال الطلبات إلى هذا الرابط:
              </p>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-mono text-xs">
              <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-bold">POST</span>
              <span className="text-slate-800 font-bold" dir="ltr">{syncEndpoint}</span>
            </div>

            <div>
              <div className="text-xs font-bold text-slate-800 mb-1.5">هيكل البيانات المطلوب (JSON Payload):</div>
              <div className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs dir-ltr overflow-x-auto">
                <pre>{`{
  "secretKey": "${settings.locatApiKey}",
  "liveOrders": [
    {
      "id": "#LOC-9901",
      "locatAccount": "khaled_omr",
      "courierName": "خالد العمري",
      "elapsedMinutes": 32,
      "restaurant": "شاورما ستيشن",
      "customerAddress": "حي النرجس",
      "activeOrdersHeldByCourier": 2
    }
  ]
}`}</pre>
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-1">
              <div className="font-bold">ملاحظات الأتمتة:</div>
              <ul className="list-disc list-inside space-y-1 pr-2 text-slate-500">
                <li>يقوم النظام تلقائياً بمطابقة <code className="font-mono bg-slate-100 px-1">locatAccount</code> مع قائمة المناديب المسجلين واستخراج رقم الواتساب الفعلي.</li>
                <li>إذا تجاوز <code className="font-mono bg-slate-100 px-1">elapsedMinutes</code> حد التأخير ({settings.delayThresholdMinutes} دقيقة)، يتم فوراً توليد وتوجيه رسالة تذكير للمندوب وإشعار للإدارة.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Sub Tab 4: Real Server Status Check */}
      {activeSubTab === 'status' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900">فحص جاهزية نقطة استقبال البيانات المباشرة</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  التحقق من اتصال الخادم واستعداده لاستقبال نبضات المزامنة اللحظية من سكربت لوكيت.
                </p>
              </div>

              <button
                onClick={checkLiveConnection}
                disabled={healthStatus === 'checking'}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-2xs transition self-start sm:self-auto"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${healthStatus === 'checking' ? 'animate-spin' : ''}`} />
                <span>{healthStatus === 'checking' ? 'جاري الفحص...' : 'فحص الاتصال بالخادم الآن'}</span>
              </button>
            </div>

            {healthMessage && (
              <div className={`p-3.5 rounded-lg text-xs font-medium flex items-center gap-2 border ${
                healthStatus === 'active'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span dir="rtl">{healthMessage}</span>
              </div>
            )}

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="font-bold text-slate-800">بيانات التوجيه والاتصال النشطة:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="bg-white p-2.5 rounded border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">عنوان نقطة النهاية (Sync URL):</span>
                  <span className="text-slate-900 font-bold break-all" dir="ltr">{syncEndpoint}</span>
                </div>
                <div className="bg-white p-2.5 rounded border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">مفتاح الأمان (API Key):</span>
                  <span className="text-slate-900 font-bold" dir="ltr">{settings.locatApiKey}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
