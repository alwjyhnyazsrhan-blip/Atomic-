import React, { useState } from 'react';
import { 
  Bell, 
  User, 
  ShieldAlert, 
  Clock, 
  ExternalLink, 
  Copy, 
  Check, 
  Trash2, 
  Search, 
  Filter,
  CheckCircle2,
  AlertTriangle,
  MessageCircle
} from 'lucide-react';
import { AlertLog } from '../types';

interface AlertsLogViewProps {
  alerts: AlertLog[];
  onClearAlerts: () => void;
}

export const AlertsLogView: React.FC<AlertsLogViewProps> = ({
  alerts,
  onClearAlerts,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'courier' | 'admin'>('all');
  const [search, setSearch] = useState('');

  const courierAlerts = alerts.filter((a) => a.recipientType === 'courier');
  const adminAlerts = alerts.filter((a) => a.recipientType === 'admin');

  const filtered = alerts.filter((a) => {
    if (filterType === 'courier' && a.recipientType !== 'courier') return false;
    if (filterType === 'admin' && a.recipientType !== 'admin') return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        a.orderId.toLowerCase().includes(q) ||
        a.recipientName.toLowerCase().includes(q) ||
        a.recipientPhone.includes(q) ||
        a.message.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">سجل التنبيهات الفورية الصادرة</h2>
          <p className="text-xs text-slate-500 mt-1">
            توثيق جميع رسائل الواتساب المرسلة تلقائياً ويدوياً للمناديب والإدارة عند تجاوز حدود زمن التأخير.
          </p>
        </div>
        {alerts.length > 0 && (
          <button
            onClick={() => {
              if (confirm('هل ترغب في مسح سجل التنبيهات؟')) onClearAlerts();
            }}
            className="px-3.5 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 flex items-center gap-1.5 transition self-start md:self-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>مسح السجل</span>
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 mb-1">إجمالي التنبيهات المرسلة</div>
          <div className="text-2xl font-black text-slate-900">{alerts.length}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">تنبيهات مسجلة اليوم</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-2xs">
          <div className="text-xs font-semibold text-emerald-700 mb-1 flex items-center justify-between">
            <span>تنبيهات المناديب</span>
            <User className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700">{courierAlerts.length}</div>
          <p className="text-[11px] text-emerald-600/80 mt-0.5">رسائل تذكير مباشرة للمناديب</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/20 shadow-2xs">
          <div className="text-xs font-semibold text-rose-700 mb-1 flex items-center justify-between">
            <span>تنبيهات الإدارة</span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-700">{adminAlerts.length}</div>
          <p className="text-[11px] text-rose-600/80 mt-0.5">إشعارات تفصيلية لإدارة العمليات</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full max-w-md">
          <input
            type="text"
            placeholder="بحث برقم الطلب، اسم المستلم، أو نص الرسالة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 focus:bg-white transition"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
        </div>

        <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
              filterType === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            الكل ({alerts.length})
          </button>
          <button
            onClick={() => setFilterType('courier')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
              filterType === 'courier' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            المناديب ({courierAlerts.length})
          </button>
          <button
            onClick={() => setFilterType('admin')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
              filterType === 'admin' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            الإدارة ({adminAlerts.length})
          </button>
        </div>
      </div>

      {/* Log Feed */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800 mb-1">لا توجد تنبيهات مسجلة تطابق البحث</h3>
          <p className="text-xs text-slate-500">
            سيتم تسجيل التنبيهات تلقائياً هنا بمجرد تأخر أي طلب في لوكيت أو عند إرسال تنبيه يدوي
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((alert) => {
            const isCourier = alert.recipientType === 'courier';
            const timeStr = new Date(alert.timestamp).toLocaleTimeString('ar-SA', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

            return (
              <div
                key={alert.id}
                className={`bg-white rounded-xl border p-4 transition shadow-2xs hover:shadow-sm ${
                  isCourier ? 'border-emerald-100 hover:border-emerald-200' : 'border-rose-100 hover:border-rose-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                      isCourier ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}>
                      {isCourier ? <User className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                      {isCourier ? 'تنبيه تذكير للمندوب' : 'إشعار فوري للإدارة'}
                    </span>

                    <span className="font-mono font-bold text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                      {alert.orderId}
                    </span>

                    {alert.elapsedMinutes > 0 && (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-500" />
                        تأخر: <strong className="text-rose-600 font-bold">{alert.elapsedMinutes} دقيقة</strong>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>{timeStr}</span>
                    <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      مرسل للواتساب
                    </span>
                  </div>
                </div>

                {/* Recipient details */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">المستلم:</span>
                    <strong className="text-slate-800">{alert.recipientName}</strong>
                    <span className="font-mono text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-[11px]" dir="ltr">
                      {alert.recipientPhone}
                    </span>
                  </div>

                  {alert.activeOrdersCount !== undefined && alert.activeOrdersCount > 0 && (
                    <div className="text-[11px] text-slate-500">
                      طلبات نشطة بحوزته: <strong className="text-blue-700">{alert.activeOrdersCount} طلبات</strong>
                    </div>
                  )}
                </div>

                {/* Message Content */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-700 font-mono leading-relaxed whitespace-pre-wrap">
                  {alert.message}
                </div>

                {/* Actions */}
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleCopy(alert.message, alert.id)}
                    className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1 transition"
                  >
                    {copiedId === alert.id ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span className="text-emerald-600 font-bold">تم النسخ</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>نسخ النص</span>
                      </>
                    )}
                  </button>

                  {alert.waLink && (
                    <a
                      href={alert.waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg flex items-center gap-1.5 transition shadow-2xs"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                      <span>فتح في واتساب</span>
                      <ExternalLink className="w-3 h-3 text-emerald-500" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
