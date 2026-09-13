import React from 'react';
import { 
  Bell, 
  Clock, 
  Phone, 
  RotateCw, 
  Send, 
  ShieldAlert, 
  Zap, 
  Sliders, 
  FileText, 
  Users, 
  ListOrdered, 
  Code,
  Radio,
  QrCode,
  Play
} from 'lucide-react';
import { SystemSettings, Order, WhatsAppConnectionState, CloudSyncState } from '../types';

interface HeaderProps {
  currentTab: 'orders' | 'couriers' | 'alerts' | 'report' | 'automation';
  setCurrentTab: (tab: 'orders' | 'couriers' | 'alerts' | 'report' | 'automation') => void;
  settings: SystemSettings;
  orders: Order[];
  unreadAlertsCount: number;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onAdvanceTime: (mins: number) => void;
  onSendQuickDailyReport: () => void;
  isSyncing: boolean;
  onOpenWhatsApp?: () => void;
  whatsappState?: WhatsAppConnectionState | null;
  cloudSyncState?: CloudSyncState | null;
  onOpenGuide?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  settings,
  orders,
  unreadAlertsCount,
  onRefresh,
  onOpenSettings,
  onAdvanceTime,
  onSendQuickDailyReport,
  isSyncing,
  onOpenWhatsApp,
  whatsappState,
  cloudSyncState,
  onOpenGuide,
}) => {
  const delayedOrdersCount = orders.filter((o) => o.isDelayed).length;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      {/* Top Banner with Quick Status & Actions */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between py-3.5 gap-3 border-b border-slate-100">
          {/* Logo & Identity */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-sm ring-4 ring-emerald-50">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 leading-tight">
                  نظام أتمتة ومتابعة لوكيت
                </h1>
                {cloudSyncState?.isConfigured ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    سحب سحابي مباشر 24/7
                  </span>
                ) : (
                  <button
                    onClick={onOpenSettings}
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition cursor-pointer"
                    title="اضغط لربط حساب لوكيت وتفعيل السحب التلقائي"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    <span>ربط السحب التلقائي</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500">
                المراقبة اللحظية للطلبات، تنبيهات التأخير الآلية للواتساب، والتقارير اليومية
              </p>
            </div>
          </div>

          {/* Quick Metrics & Simulation Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Delay Threshold indicator */}
            <button
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
              title="اضغط لتعديل حد التأخير"
            >
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>حد التنبيه:</span>
              <strong className="text-amber-800">{settings.delayThresholdMinutes} دقيقة</strong>
            </button>

            {/* Admin WhatsApp indicator */}
            <button
              onClick={onOpenSettings}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                settings.adminPhone 
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' 
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
              }`}
              title="رقم إدارة العمليات"
            >
              <Phone className="w-3.5 h-3.5 text-emerald-600" />
              <span>واتساب الإدارة:</span>
              <strong className="font-mono" dir="ltr">
                {settings.adminPhone || 'اضغط لتعيين رقم الإدارة'}
              </strong>
            </button>

            {/* WhatsApp Session / QR Button */}
            {onOpenWhatsApp && (
              <button
                type="button"
                onClick={onOpenWhatsApp}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs border ${
                  whatsappState?.isLoggedIn
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                }`}
                title="اضغط لفتح شاشة ربط جلسة الواتساب ورمز الـ QR"
              >
                <QrCode className="w-3.5 h-3.5 text-emerald-600" />
                <span>واتساب:</span>
                {whatsappState?.isLoggedIn ? (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="font-mono text-emerald-900" dir="ltr">
                      +{whatsappState.userPhone || 'متصل'}
                    </span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-900">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                    <span>امسح الـ QR</span>
                  </span>
                )}
              </button>
            )}

            {/* Refresh */}
            <button
              onClick={onRefresh}
              disabled={isSyncing}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition"
              title="تحديث البيانات"
            >
              <RotateCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-emerald-600' : ''}`} />
            </button>

            {/* Quick WhatsApp Daily Report */}
            <button
              onClick={onSendQuickDailyReport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>إرسال تقرير اليوم للإدارة</span>
            </button>

            {/* Video Guide & Interactive Walkthrough */}
            {onOpenGuide && (
              <button
                onClick={onOpenGuide}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-2xs transition"
                title="شرح بالفيديو ودليل الاستخدام التفاعلي"
              >
                <Play className="w-3.5 h-3.5 fill-current text-indigo-600" />
                <span>فيديو الشرح والدليل 🎬</span>
              </button>
            )}

            {/* Settings */}
            <button
              onClick={onOpenSettings}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition"
              title="إعدادات النظام والأتمتة"
            >
              <Sliders className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex space-x-1 space-x-reverse py-2 overflow-x-auto">
          <button
            onClick={() => setCurrentTab('orders')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition shrink-0 ${
              currentTab === 'orders'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ListOrdered className="w-4 h-4" />
            <span>شاشة الطلبات المباشرة</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              currentTab === 'orders' ? 'bg-slate-700 text-slate-100' : 'bg-slate-200 text-slate-700'
            }`}>
              {orders.length}
            </span>
            {delayedOrdersCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-rose-500 text-white animate-pulse">
                {delayedOrdersCount} متأخر
              </span>
            )}
          </button>

          <button
            onClick={() => setCurrentTab('couriers')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition shrink-0 ${
              currentTab === 'couriers'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>بيانات المناديب وربط الحسابات</span>
          </button>

          <button
            onClick={() => setCurrentTab('alerts')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition shrink-0 ${
              currentTab === 'alerts'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>سجل التنبيهات الفورية</span>
            {unreadAlertsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white">
                {unreadAlertsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setCurrentTab('report')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition shrink-0 ${
              currentTab === 'report'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>التقارير اليومية وتقييم الأداء</span>
          </button>

          <button
            onClick={() => setCurrentTab('automation')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition shrink-0 ${
              currentTab === 'automation'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Code className="w-4 h-4" />
            <span>سكربت الأتمتة والربط (Script)</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
              Userscript
            </span>
          </button>
        </nav>
      </div>
    </header>
  );
};
