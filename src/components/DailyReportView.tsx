import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Send, 
  Copy, 
  Check, 
  Award, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  CheckCircle2, 
  Package, 
  Phone, 
  ExternalLink,
  RotateCw,
  Sparkles,
  Download
} from 'lucide-react';
import { DailyReportSummary, SystemSettings } from '../types';

interface DailyReportViewProps {
  settings: SystemSettings;
  onSendReportToAdmin: () => void;
}

export const DailyReportView: React.FC<DailyReportViewProps> = ({
  settings,
  onSendReportToAdmin,
}) => {
  const [report, setReport] = useState<DailyReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [adminLink, setAdminLink] = useState('');

  const fetchDailyReport = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reports/daily');
      const data = await res.json();
      if (data.success) {
        setReport(data.summary);
        setAdminLink(data.adminWhatsAppLink);
      }
    } catch (err) {
      console.error('Failed to fetch daily report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDailyReport();
  }, []);

  const handleCopyText = () => {
    if (report?.whatsappFormattedText) {
      navigator.clipboard.writeText(report.whatsappFormattedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleDownload = () => {
    if (!report) return;
    const blob = new Blob([report.whatsappFormattedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `locat-daily-report-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-16 text-center shadow-2xs">
        <RotateCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-800">جاري حساب وتوليد تقرير أداء اليوم...</h3>
        <p className="text-xs text-slate-500 mt-1">يتم جمع بيانات جميع المناديب وحساب معدلات الإنتاجية والتأخيرات</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <p className="text-slate-600">تعذر تحميل التقرير حالياً.</p>
        <button
          onClick={fetchDailyReport}
          className="mt-3 px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner with Direct Action to send to WhatsApp */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">تقرير الأداء والإنتاجية اليومي الشامل</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              جاهز للإرسال
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            ملخص ختامي يرسل للإدارة عبر الواتساب: إجمالي طلبات كل مندوب، والمناديب الأكثر إنتاجية مقابل ضعاف الإنجاز.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchDailyReport}
            className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            title="إعادة احتساب وتحديث التقرير"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleDownload}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition"
            title="تنزيل كملف نصي"
          >
            <Download className="w-3.5 h-3.5" />
            <span>تنزيل التقرير</span>
          </button>

          <a
            href={adminLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onSendReportToAdmin}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-2xs transition"
          >
            <Send className="w-4 h-4" />
            <span>إرسال التقرير لـ واتساب الإدارة الآن</span>
          </a>
        </div>
      </div>

      {/* KPI Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 mb-1">إجمالي طلبات اليوم</div>
          <div className="text-2xl font-black text-slate-900">{report.totalOrdersToday}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {report.deliveredOrdersToday} منجز | {report.activeOrdersRightNow} نشط حالياً
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-xs font-semibold text-emerald-600 mb-1">نسبة الالتزام بالوقت</div>
          <div className="text-2xl font-black text-emerald-600">{report.onTimeRate}%</div>
          <p className="text-[11px] text-slate-400 mt-0.5">تسليم دون تجاوز الحد</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 mb-1">متوسط زمن التوصيل</div>
          <div className="text-2xl font-black text-slate-900">{report.overallAvgTimeMinutes} دقيقة</div>
          <p className="text-[11px] text-slate-400 mt-0.5">المعدل العام لكافة المناديب</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-xs font-semibold text-rose-600 mb-1">إجمالي التأخيرات المسجلة</div>
          <div className="text-2xl font-black text-rose-600">{report.delayedOrdersToday}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">طلبات تجاوزت {settings.delayThresholdMinutes} دقيقة</p>
        </div>
      </div>

      {/* Two Column: Top Performers vs Underperformers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Performers Card */}
        <div className="bg-white rounded-xl border border-emerald-200 p-5 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">المناديب الأكثر إنتاجية (الأعلى أداءً)</h3>
                <p className="text-[11px] text-emerald-700 font-medium">تسليمات مرتفعة، سرعة فائقة، والتزام كامل بالوقت</p>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
              {report.topPerformers.length} مناديب
            </span>
          </div>

          {report.topPerformers.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-4 text-center">
              لا يوجد مناديب وصلوا لمعايير النخبة بعد لهذا اليوم.
            </p>
          ) : (
            <div className="space-y-3">
              {report.topPerformers.map((c, i) => (
                <div
                  key={c.courierId}
                  className="bg-emerald-50/50 border border-emerald-200/80 rounded-lg p-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                      #{i + 1}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                        <span>{c.courierName}</span>
                        <span className="text-[10px] text-slate-500 font-mono">({c.locatAccounts[0]})</span>
                      </div>
                      <div className="text-[11px] text-emerald-800 flex items-center gap-2 mt-0.5">
                        <span>إنجاز: <strong>{c.deliveredCount} طلب</strong></span>
                        <span>•</span>
                        <span>متوسط: <strong>{c.avgTime} دقيقة</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="text-left shrink-0">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-white px-2.5 py-1 rounded border border-emerald-200">
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      كفاءة {c.efficiencyScore}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Underperformers / Needs Attention Card */}
        <div className="bg-white rounded-xl border border-rose-200 p-5 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-rose-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">المناديب الأقل أداءً (ضعاف الإنجاز)</h3>
                <p className="text-[11px] text-rose-700 font-medium">بطء ملحوظ، قلة عدد التسليمات، أو تكرار تأخير الطلبات</p>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
              {report.underPerformers.length} مناديب
            </span>
          </div>

          {report.underPerformers.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-4 text-center">
              ممتاز! جميع المناديب اليوم ضمن معدلات الأداء المقبولة ولا يوجد ضعاف إنجاز.
            </p>
          ) : (
            <div className="space-y-3">
              {report.underPerformers.map((c, i) => (
                <div
                  key={c.courierId}
                  className="bg-rose-50/50 border border-rose-200/80 rounded-lg p-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                      !
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                        <span>{c.courierName}</span>
                        <span className="text-[10px] text-slate-500 font-mono">({c.locatAccounts[0]})</span>
                      </div>
                      <div className="text-[11px] text-rose-800 flex items-center gap-2 mt-0.5">
                        <span>إنجاز: <strong>{c.deliveredCount} فقط</strong></span>
                        <span>•</span>
                        <span>تأخر في: <strong className="text-rose-700">{c.delayedCount} طلبات</strong></span>
                        <span>•</span>
                        <span>معدل: <strong>{c.avgTime}د</strong></span>
                      </div>
                      <div className="text-[10px] text-rose-600 italic mt-0.5">
                        {c.assessmentNote}
                      </div>
                    </div>
                  </div>

                  <a
                    href={`https://wa.me/${c.phone.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 text-xs font-bold text-rose-700 bg-white hover:bg-rose-100 rounded border border-rose-200 flex items-center gap-1 shrink-0 transition"
                    title="تواصل مباشر مع المندوب للمتابعة"
                  >
                    <Phone className="w-3 h-3" />
                    <span>تواصل</span>
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* WhatsApp Message Preview Box */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <h3 className="font-bold text-sm text-slate-900">نص رسالة الواتساب اليومية المجهزة للإدارة</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyText}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-600 font-bold">تم نسخ التقرير</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>نسخ التقرير</span>
                </>
              )}
            </button>

            <a
              href={adminLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onSendReportToAdmin}
              className="px-3.5 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg flex items-center gap-1.5 transition shadow-2xs"
            >
              <Send className="w-3.5 h-3.5 text-emerald-600" />
              <span>إرسال عبر الواتساب</span>
              <ExternalLink className="w-3 h-3 text-emerald-500" />
            </a>
          </div>
        </div>

        <div className="bg-slate-900 text-emerald-400 p-4 rounded-xl font-mono text-xs leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto border border-slate-800 dir-rtl select-all">
          {report.whatsappFormattedText}
        </div>
      </div>

      {/* All Couriers Detailed Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-900">جدول تفصيلي لإنتاجية المناديب لليوم</h3>
          <span className="text-xs text-slate-500 font-medium">محدث تلقائياً</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3">المندوب</th>
                <th className="p-3">حسابات لوكيت</th>
                <th className="p-3">الطلبات المنجزة</th>
                <th className="p-3">النشطة الآن</th>
                <th className="p-3">التأخيرات</th>
                <th className="p-3">متوسط الزمن</th>
                <th className="p-3">كفاءة الأداء</th>
                <th className="p-3">التقييم العام</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.allCouriers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    لم يتم تسجيل أي مندوب بعد. ابدأ بإضافة مناديبك في لوحة التحكم لعرض إحصائيات الأداء اليومية هنا.
                  </td>
                </tr>
              ) : (
                report.allCouriers.map((c) => (
                  <tr key={c.courierId} className="hover:bg-slate-50/60 transition">
                    <td className="p-3 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span>{c.courierName}</span>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-slate-500">
                      {c.locatAccounts.join(', ')}
                    </td>
                    <td className="p-3 font-bold text-slate-800">
                      {c.deliveredCount} طلب
                    </td>
                    <td className="p-3 text-blue-700 font-semibold">
                      {c.activeCount}
                    </td>
                    <td className="p-3">
                      {c.delayedCount > 0 ? (
                        <span className="font-bold text-rose-600">{c.delayedCount} تأخير</span>
                      ) : (
                        <span className="text-emerald-600 font-semibold">0 (ممتاز)</span>
                      )}
                    </td>
                    <td className="p-3 font-mono text-slate-700">
                      {c.avgTime} دقيقة
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              c.efficiencyScore >= 80 ? 'bg-emerald-500' : c.efficiencyScore >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                            }`}
                            style={{ width: `${c.efficiencyScore}%` }}
                          />
                        </div>
                        <span className="font-bold text-slate-700">{c.efficiencyScore}%</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        c.performanceTier === 'top'
                          ? 'bg-emerald-100 text-emerald-800'
                          : c.performanceTier === 'low'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {c.performanceTier === 'top' ? '🌟 متميز جداً' : c.performanceTier === 'low' ? '⚠️ ضعيف الإنجاز' : 'جيد'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
