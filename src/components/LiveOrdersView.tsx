import React, { useState } from 'react';
import { 
  AlertTriangle, 
  Clock, 
  MessageCircle, 
  Send, 
  ShieldAlert, 
  Store, 
  MapPin, 
  User, 
  CheckCircle2, 
  Filter, 
  Plus, 
  ExternalLink,
  Package,
  Layers,
  ArrowUpRight,
  Sparkles,
  QrCode,
  ShieldCheck,
  Zap,
  RotateCw,
  Sliders,
  CheckCircle,
  LayoutGrid,
  Table as TableIcon,
  DollarSign,
  CreditCard,
  Phone
} from 'lucide-react';
import { Order, Courier, SystemSettings, CloudSyncState } from '../types';
import { WhatsAppTestModal } from './WhatsAppTestModal';
import { AntiBanQueueModal } from './AntiBanQueueModal';
import { LocateOrdersTable } from './LocateOrdersTable';

interface LiveOrdersViewProps {
  orders: Order[];
  couriers: Courier[];
  settings: SystemSettings;
  onTriggerManualAlert: (orderId: string, target: 'courier' | 'admin' | 'admin2' | 'both') => void;
  onOpenAddOrderModal: () => void;
  onAdvanceTime: (mins: number) => void;
  cloudSyncState?: CloudSyncState | null;
  onTriggerCloudSync?: () => void;
  onOpenSettings?: () => void;
}

function normalizeArabic(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/\s+/g, ' ');
}

function findMatchingCourier(couriers: Courier[], order: Order): Courier | undefined {
  if (order.courierId) {
    const byId = couriers.find((c) => c.id === order.courierId);
    if (byId) return byId;
  }
  const oName = normalizeArabic(order.courierName || '');
  const oAcc = normalizeArabic(order.locatAccount || '');
  const oPhone = (order.courierPhone || '').replace(/\D/g, '');

  return couriers.find((c) => {
    const cName = normalizeArabic(c.name);
    const cPhone = c.phone.replace(/\D/g, '');

    if (oPhone && cPhone && (oPhone === cPhone || oPhone.endsWith(cPhone) || cPhone.endsWith(oPhone))) {
      return true;
    }
    if (c.locatAccounts.some((acc) => {
      const a = normalizeArabic(acc);
      return a === oAcc || a === oName || (oAcc && (a.includes(oAcc) || oAcc.includes(a)));
    })) {
      return true;
    }
    if (cName && (cName === oName || cName === oAcc || cName.includes(oName) || oName.includes(cName) || cName.includes(oAcc) || oAcc.includes(cName))) {
      return true;
    }
    return false;
  });
}

export const LiveOrdersView: React.FC<LiveOrdersViewProps> = ({
  orders,
  couriers,
  settings,
  onTriggerManualAlert,
  onOpenAddOrderModal,
  onAdvanceTime,
  cloudSyncState,
  onTriggerCloudSync,
  onOpenSettings,
}) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'delayed' | 'delivered'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [isWhatsAppTestModalOpen, setIsWhatsAppTestModalOpen] = useState(false);
  const [isQueueModalOpen, setIsQueueModalOpen] = useState(false);

  const activeOrders = orders.filter((o) => o.status === 'in_transit' || o.status === 'delayed');
  const delayedOrders = orders.filter((o) => o.isDelayed);
  const deliveredOrders = orders.filter((o) => o.status === 'delivered');

  const filteredOrders = orders.filter((order) => {
    if (filter === 'active' && order.status !== 'in_transit' && order.status !== 'delayed') return false;
    if (filter === 'delayed' && !order.isDelayed) return false;
    if (filter === 'delivered' && order.status !== 'delivered') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = order.id.toLowerCase().includes(q);
      const matchName = order.courierName.toLowerCase().includes(q);
      const matchAccount = order.locatAccount.toLowerCase().includes(q);
      const matchRestaurant = order.restaurant.toLowerCase().includes(q);
      const matchPhone = order.courierPhone.includes(q);
      return matchId || matchName || matchAccount || matchRestaurant || matchPhone;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Cloud Auto-Sync Direct Status Banner */}
      {cloudSyncState?.isConfigured ? (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-emerald-950 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Zap className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-emerald-900">
                  السحب التلقائي السحابي المباشر شغال بدون أي تدخل منك (24/7 Auto-Sync)
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                  نشط ومربوط
                </span>
              </div>
              <p className="text-xs text-emerald-700 mt-0.5">
                {cloudSyncState.lastSyncTime
                  ? `آخر سحب ناجح: ${new Date(cloudSyncState.lastSyncTime).toLocaleTimeString('ar-SA')} | تم سحب ${cloudSyncState.lastCouriersCount || couriers.length} مندوب و ${cloudSyncState.lastOrdersCount || orders.length} طلب (${cloudSyncState.activeOrdersCount || activeOrders.length} نشط) | فحص آلي كل ${settings.locatSyncIntervalSeconds || 20} ثانية`
                  : `يقوم الخادم بالاتصال المباشر بـ Locate وسحب ومراقبة المناديب والطلبات تلقائياً كل ${settings.locatSyncIntervalSeconds || 20} ثانية`}
              </p>
              {cloudSyncState.lastError && (
                <p className="text-xs text-rose-600 mt-0.5 font-medium">
                  ملاحظة السحب: {cloudSyncState.lastError}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onTriggerCloudSync && (
              <button
                type="button"
                onClick={onTriggerCloudSync}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-2xs cursor-pointer"
                title="تنفيذ سحب فوري للطلبات الآن من لوكيت"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>سحب فوري الآن</span>
              </button>
            )}
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 transition shadow-2xs cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>إعدادات الحساب</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 border border-emerald-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-slate-800 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900">
                تفعيل سحب بيانات لوكيت تلقائياً وبدون أي تدخل منك (Zero-Touch Cloud Sync)
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                اربط بريد وكلمة مرور حسابك في لوكيت مرة واحدة ليقوم النظام بسحب ومراقبة الطلبات تلقائياً في الخلفية على مدار الساعة دون الحاجة لفتح المتصفح إطلاقاً.
              </p>
            </div>
          </div>
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-2xs shrink-0 self-start md:self-center cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              <span>ربط حساب لوكيت الآن 🚀</span>
            </button>
          )}
        </div>
      )}

      {/* Top Banner Alert if delayed orders exist */}
      {delayedOrders.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-900 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <AlertTriangle className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">
                يوجد {delayedOrders.length} طلب تجاوز حد التأخير ({settings.delayThresholdMinutes} دقيقة)
              </h3>
              <p className="text-xs text-rose-700">
                يقوم النظام بإرسال تذكيرات فورية للمناديب وإشعارات مباشرة للإدارة فور تجاوز الحد المحدد
              </p>
            </div>
          </div>
          <button
            onClick={() => setFilter('delayed')}
            className="self-start sm:self-center px-3.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition shadow-2xs"
          >
            عرض الطلبات المتأخرة فقط ({delayedOrders.length})
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-semibold">إجمالي الطلبات المسحوبة</span>
            <Package className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900">{orders.length}</span>
            <span className="text-xs text-slate-500">طلب في النظام</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/20 shadow-2xs">
          <div className="flex items-center justify-between text-rose-600 mb-1.5">
            <span className="text-xs font-semibold">الطلبات المتأخرة (تنبيه)</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-rose-600">{delayedOrders.length}</span>
            <span className="text-xs text-rose-500">&gt; {settings.delayThresholdMinutes} دقيقة</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-600 mb-1.5">
            <span className="text-xs font-semibold">طلبات مكتملة ومسلمة</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-emerald-600">{deliveredOrders.length}</span>
            <span className="text-xs text-slate-500">تم إنجازها</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-semibold">إجمالي المناديب المسحوبين</span>
            <User className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900">{couriers.length}</span>
            <span className="text-xs text-slate-500">مندوب مسجل</span>
          </div>
        </div>
      </div>

      {/* Control Bar & Filter */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px]">
            <input
              type="text"
              placeholder="بحث برقم الطلب، اسم المندوب، حسابه أو المطعم..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs font-medium pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 focus:bg-white transition"
            />
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
          </div>

          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                filter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الكل ({orders.length})
            </button>
            <button
              onClick={() => setFilter('active')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                filter === 'active' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              النشطة في الطريق ({activeOrders.length})
            </button>
            <button
              onClick={() => setFilter('delayed')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition flex items-center gap-1 ${
                filter === 'delayed'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'text-rose-600 hover:bg-rose-50'
              }`}
            >
              المتأخرة ({delayedOrders.length})
            </button>
            <button
              onClick={() => setFilter('delivered')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                filter === 'delivered' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              المكتملة ({deliveredOrders.length})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Switcher: Table (Locate Platform Style) vs Cards */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition flex items-center gap-1.5 ${
                viewMode === 'table'
                  ? 'bg-white text-emerald-800 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="جدول مطابق لمنصة لوكيت (Locate Orders Table)"
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>جدول لوكيت</span>
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition flex items-center gap-1.5 ${
                viewMode === 'cards'
                  ? 'bg-white text-emerald-800 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="بطاقات المراقبة الحية"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>بطاقات</span>
            </button>
          </div>

          <button
            onClick={() => setIsQueueModalOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 transition flex items-center gap-1.5 shadow-2xs"
            title="نظام طابور حماية الواتساب من الحظر وتفاصيل تشغيل VPS"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">حماية الواتساب</span>
          </button>

          <button
            onClick={() => setIsWhatsAppTestModalOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 transition flex items-center gap-1.5 shadow-2xs"
            title="فحص كود إرسال الواتساب واستخراج QR Code في التيرمينال واللوحة"
          >
            <QrCode className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">فحص الواتساب</span>
          </button>

          <button
            onClick={onOpenAddOrderModal}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 transition flex items-center gap-1.5 shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>إضافة طلب</span>
          </button>
        </div>
      </div>

      {/* Orders Grid / Table */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800 mb-1">
            {orders.length === 0 ? 'لا توجد طلبات جارية حالياً' : 'لا توجد طلبات تطابق الفلتر المحدد'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-4 leading-relaxed">
            {orders.length === 0 
              ? 'في انتظار قراءة وسحب البيانات المباشرة من شاشة لوكيت عبر سكربت الأتمتة، أو يمكنك إدراج الطلبات يدوياً.'
              : 'قم بإلغاء الفلتر الحالي للرجوع إلى جميع الطلبات المسجلة.'}
          </p>
          {orders.length > 0 ? (
            <button
              onClick={() => { setFilter('all'); setSearchQuery(''); }}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              إعادة تعيين الفلاتر
            </button>
          ) : (
            <button
              onClick={onOpenAddOrderModal}
              className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>إدراج طلب من لوكيت يدوياً</span>
            </button>
          )}
        </div>
      ) : viewMode === 'table' ? (
        <LocateOrdersTable
          orders={filteredOrders}
          couriers={couriers}
          settings={settings}
          onTriggerManualAlert={onTriggerManualAlert}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOrders.map((order) => {
            const isCritical = order.elapsedMinutes >= settings.criticalDelayMinutes;
            const courier = findMatchingCourier(couriers, order);
            const courierPhone = courier?.phone || order.courierPhone;
            const cleanPhone = courierPhone.replace(/[^0-9]/g, '');

            const courierWaMsg = encodeURIComponent(
              `السلام عليكم أخي ${order.courierName}،\nنود تذكيرك بأن الطلب ${order.id} متأخر وتجاوز ${order.elapsedMinutes} دقيقة من وقت الاستلام.\nالمطعم: ${order.restaurant}\nيرجى سرعة التسليم والإفادة.`
            );
            const courierWaUrl = `https://wa.me/${cleanPhone}?text=${courierWaMsg}`;

            const adminCleanPhone = settings.adminPhone.replace(/[^0-9]/g, '');
            const adminWaMsg = encodeURIComponent(
              `⚠️ [تنبيه تأخير - لوكيت]\nالطلب: ${order.id}\nالمندوب: ${order.courierName}\nالوقت: ${order.elapsedMinutes} دقيقة\nعدد طلباته النشطة: ${order.activeOrdersHeldByCourier} طلبات\nالمطعم: ${order.restaurant}`
            );
            const adminWaUrl = `https://wa.me/${adminCleanPhone}?text=${adminWaMsg}`;

            const admin2CleanPhone = (settings.adminPhone2 || '').replace(/[^0-9]/g, '');
            const admin2WaMsg = encodeURIComponent(
              `🚨 [تصعيد تأخير حرج - إشعار الإدارة الثانية]\n• اسم المندوب: ${order.courierName}\n• رقم الطلب: ${order.id}\n• الوقت المنقضي: ${order.elapsedMinutes} دقيقة\n• عدد الطلبات النشطة بحوزته: ${order.activeOrdersHeldByCourier} طلبات\n• المطعم: ${order.restaurant}\n⚠️ تنبيه: استمر التأخير وتجاوز حد التصعيد (${settings.criticalDelayMinutes} دقيقة).`
            );
            const admin2WaUrl = `https://wa.me/${admin2CleanPhone}?text=${admin2WaMsg}`;

            return (
              <div
                key={order.id}
                className={`bg-white rounded-xl border transition-all duration-200 overflow-hidden shadow-2xs hover:shadow-sm ${
                  order.isDelayed
                    ? isCritical
                      ? 'border-rose-300 ring-1 ring-rose-200 bg-rose-50/10'
                      : 'border-amber-300 ring-1 ring-amber-200'
                    : 'border-slate-200'
                }`}
              >
                {/* Header of card */}
                <div className={`px-4 py-3 border-b flex items-center justify-between ${
                  order.isDelayed
                    ? isCritical
                      ? 'bg-rose-50/80 border-rose-100 text-rose-900'
                      : 'bg-amber-50/80 border-amber-100 text-amber-900'
                    : 'bg-slate-50 border-slate-100 text-slate-800'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-slate-900">{order.id}</span>
                    {order.status === 'delivered' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        تم التسليم
                      </span>
                    ) : order.status === 'cancelled' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-700">
                        ملغي
                      </span>
                    ) : order.isDelayed ? (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        isCritical ? 'bg-rose-600 text-white animate-pulse' : 'bg-amber-500 text-white'
                      }`}>
                        <AlertTriangle className="w-3 h-3" />
                        متأخر (+{order.elapsedMinutes - settings.delayThresholdMinutes}د)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800">
                        <Clock className="w-3 h-3 text-blue-600" />
                        قيد التوصيل في الموعد
                      </span>
                    )}
                  </div>

                  {/* Elapsed Time Badge */}
                  <div className="flex items-center gap-1.5 font-semibold text-xs">
                    <Clock className={`w-3.5 h-3.5 ${order.isDelayed ? 'text-rose-600' : 'text-slate-500'}`} />
                    <span className={`font-mono text-sm font-bold ${order.isDelayed ? 'text-rose-600' : 'text-slate-700'}`}>
                      {order.elapsedMinutes} دقيقة
                    </span>
                  </div>
                </div>

                {/* Body of card */}
                <div className="p-4 space-y-3">
                  {/* Courier info */}
                  <div className="bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 text-xs font-bold shrink-0">
                          {order.courierName.slice(0, 1)}
                        </div>
                        <div>
                          <div className="font-bold text-xs text-slate-900">{order.courierName}</div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                            <span className="font-mono">حساب لوكيت: {order.locatAccount || 'غير محدد'}</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Active orders held badge */}
                      <div className="text-left">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 text-[11px] font-bold">
                          <Layers className="w-3 h-3" />
                          {order.activeOrdersHeldByCourier} نشطة معه
                        </span>
                      </div>
                    </div>

                    {courierPhone && (
                      <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                        <span className="text-[11px] text-slate-500">واتساب المندوب الفعلي:</span>
                        <span className="font-mono font-bold text-slate-800 text-[11px]" dir="ltr">
                          {courierPhone}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Order Details */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-600 truncate">
                        <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate font-medium">{order.restaurant}</span>
                      </div>
                      {order.deliveryCost && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold shrink-0">
                          {order.deliveryCost} ر.س {order.paymentMethod ? `• ${order.paymentMethod}` : ''}
                        </span>
                      )}
                    </div>
                    {order.customerAddress ? (
                      <div className="flex items-center gap-2 text-slate-600">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{order.customerAddress}</span>
                      </div>
                    ) : order.customerCoordinates ? (
                      <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-mono">إحداثيات الوجهة: {order.customerCoordinates}</span>
                      </div>
                    ) : null}
                  </div>

                  {/* Alert status indicators */}
                  <div className="pt-2 border-t border-slate-100 flex flex-col gap-1 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">تنبيه المندوب:</span>
                      {order.alertSentToCourier ? (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          تم الإرسال ({order.courierAlertTime || 'تلقائي'})
                        </span>
                      ) : order.isDelayed ? (
                        <span className="text-amber-600 font-semibold">جاهز للإرسال</span>
                      ) : (
                        <span className="text-slate-400">غير مطلوب حالياً</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">تنبيه الإدارة:</span>
                      {order.alertSentToAdmin ? (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          تم الإرسال ({order.adminAlertTime || 'تلقائي'})
                        </span>
                      ) : order.isDelayed ? (
                        <span className="text-amber-600 font-semibold">جاهز للإرسال</span>
                      ) : (
                        <span className="text-slate-400">غير مطلوب حالياً</span>
                      )}
                    </div>

                    {/* Admin 2 Escalation Indicator */}
                    <div className="flex items-center justify-between pt-0.5">
                      <span className="text-slate-500">تصعيد الإدارة 2:</span>
                      {order.alertSentToAdmin2 ? (
                        <span className="text-rose-700 font-semibold flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3 text-rose-600" />
                          تم التصعيد ({order.admin2AlertTime || 'تلقائي'})
                        </span>
                      ) : order.elapsedMinutes >= settings.criticalDelayMinutes ? (
                        <span className="text-rose-600 font-bold animate-pulse flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          مستحق التصعيد فوراً
                        </span>
                      ) : (
                        <span className="text-slate-400">عند استمرار التأخير ({settings.criticalDelayMinutes} د)</span>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-1 flex flex-wrap items-center gap-1.5">
                    {/* Courier WhatsApp Button */}
                    {courierPhone ? (
                      <a
                        href={courierWaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => onTriggerManualAlert(order.id, 'courier')}
                        className="flex-1 min-w-[100px] py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-2xs"
                        title="فتح محادثة وتذكير المندوب عبر الواتساب"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>واتساب المندوب</span>
                      </a>
                    ) : (
                      <button
                        disabled
                        className="flex-1 min-w-[100px] py-1.5 px-2 bg-slate-100 text-slate-400 rounded-lg text-xs font-medium cursor-not-allowed"
                      >
                        لا يوجد رقم
                      </button>
                    )}

                    {/* Admin 1 WhatsApp Button */}
                    <a
                      href={adminWaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onTriggerManualAlert(order.id, 'admin')}
                      className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition"
                      title="إرسال إشعار فوري لـ واتساب الإدارة الأولى بهذا الطلب"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 text-slate-600" />
                      <span>إدارة 1</span>
                    </a>

                    {/* Admin 2 Escalation WhatsApp Button */}
                    {settings.adminPhone2 && (
                      <a
                        href={admin2WaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => onTriggerManualAlert(order.id, 'admin2')}
                        className="py-1.5 px-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition"
                        title="إرسال إشعار تصعيد فوري لرقم الإدارة الثاني"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                        <span>تصعيد إدارة 2</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* WhatsApp Direct Test & QR Code Session Modal */}
      <WhatsAppTestModal
        isOpen={isWhatsAppTestModalOpen}
        onClose={() => setIsWhatsAppTestModalOpen(false)}
        settings={settings}
        couriers={couriers}
      />

      {/* WhatsApp Anti-Ban Queue & VPS Info Modal */}
      <AntiBanQueueModal
        isOpen={isQueueModalOpen}
        onClose={() => setIsQueueModalOpen(false)}
        settings={settings}
      />
    </div>
  );
};
