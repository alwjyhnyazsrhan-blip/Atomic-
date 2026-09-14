import React, { useState, useMemo } from 'react';
import { 
  AlertTriangle, 
  Clock, 
  MessageCircle, 
  ShieldAlert, 
  CheckCircle2, 
  Copy, 
  ChevronLeft, 
  ChevronRight,
  ChevronFirst,
  ChevronLast,
  MapPin,
  ExternalLink,
  Store,
  CreditCard,
  Banknote
} from 'lucide-react';
import { Order, Courier, SystemSettings } from '../types';

interface LocateOrdersTableProps {
  orders: Order[];
  couriers: Courier[];
  settings: SystemSettings;
  onTriggerManualAlert: (orderId: string, target: 'courier' | 'admin' | 'admin2' | 'both') => void;
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

function formatLocatTime(dateStr?: string): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const time = d.toLocaleTimeString('ar-SA', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' });
    const date = d.toLocaleDateString('ar-SA', { timeZone: 'Asia/Riyadh', month: 'numeric', day: 'numeric' });
    return `${time} (${date})`;
  } catch (e) {
    return dateStr;
  }
}

export const LocateOrdersTable: React.FC<LocateOrdersTableProps> = ({
  orders,
  couriers,
  settings,
  onTriggerManualAlert,
}) => {
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const totalOrders = orders.length;
  const totalPages = pageSize === 0 ? 1 : Math.ceil(totalOrders / pageSize) || 1;

  // Safe page index bounds
  const activePage = Math.min(currentPage, totalPages);

  const displayedOrders = useMemo(() => {
    if (pageSize === 0) return orders;
    const startIndex = (activePage - 1) * pageSize;
    return orders.slice(startIndex, startIndex + pageSize);
  }, [orders, activePage, pageSize]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
      {/* Table Sub-Header Controls */}
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-700">عدد الأسطر لكل صفحة:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            <option value={15}>15 طلب</option>
            <option value={25}>25 طلب (افتراضي)</option>
            <option value={50}>50 طلب</option>
            <option value={100}>100 طلب</option>
            <option value={0}>عرض الكل ({totalOrders})</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-slate-500 font-medium">
            عرض {pageSize === 0 ? totalOrders : Math.min((activePage - 1) * pageSize + 1, totalOrders)} - {pageSize === 0 ? totalOrders : Math.min(activePage * pageSize, totalOrders)} من أصل {totalOrders} طلب متطابق من لوكيت
          </span>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={activePage <= 1}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent transition"
                title="الصفحة الأولى"
              >
                <ChevronLast className="w-4 h-4 text-slate-600" />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={activePage <= 1}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent transition"
                title="السابق"
              >
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
              <span className="px-2 py-0.5 text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded">
                {activePage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={activePage >= totalPages}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent transition"
                title="التالي"
              >
                <ChevronLeft className="w-4 h-4 text-slate-600" />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={activePage >= totalPages}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent transition"
                title="الصفحة الأخيرة"
              >
                <ChevronFirst className="w-4 h-4 text-slate-600" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-right border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 text-[11px] whitespace-nowrap select-none">
              <th className="py-3 px-3.5 text-right">رقم الطلب</th>
              <th className="py-3 px-3 text-right">اسم المندوب / السائق</th>
              <th className="py-3 px-3 text-right">رقم الجوال</th>
              <th className="py-3 px-3 text-center">الحالة</th>
              <th className="py-3 px-3 text-center">وقت الطلب</th>
              <th className="py-3 px-3 text-center">وقت القبول</th>
              <th className="py-3 px-3 text-center">وقت الانهاء</th>
              <th className="py-3 px-3 text-center">المدة المستغرقة</th>
              <th className="py-3 px-3 text-center">قيمة التوصيل</th>
              <th className="py-3 px-3 text-center">طريقة الدفع</th>
              <th className="py-3 px-3.5 text-center">إرسال تنبيه واتساب</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {displayedOrders.map((order, idx) => {
              const isCritical = order.elapsedMinutes >= settings.criticalDelayMinutes;
              const courier = findMatchingCourier(couriers, order);
              const courierPhone = courier?.phone || order.courierPhone;
              const cleanPhone = courierPhone.replace(/[^0-9]/g, '');

              const nowSaudiTime = new Date().toLocaleTimeString('ar-SA', {
                timeZone: 'Asia/Riyadh',
                hour: '2-digit',
                minute: '2-digit',
              });
              const isDelivered = order.isDelivered || order.status === 'delivered';

              const courierWaMsg = encodeURIComponent(
                isDelivered
                  ? `السلام عليكم أخي ${order.courierName}،\nبخصوص الطلب ${order.id} (مسلّم):\n• المطعم: ${order.restaurant}\n• المدة المستغرقة: ${order.elapsedMinutes} دقيقة\n• وقت الاستلام: ${order.pickupTime || '-'}\n• وقت الإشعار: ${nowSaudiTime}\nشكراً لجهودك!`
                  : `السلام عليكم أخي ${order.courierName}،\nنود تذكيرك بأن الطلب ${order.id} متأخر وتجاوز ${order.elapsedMinutes} دقيقة منذ الاستلام.\n• وقت الاستلام: ${order.pickupTime || '-'}\n• وقت التنبيه: ${nowSaudiTime}\n• المطعم: ${order.restaurant}\nيرجى سرعة التسليم والإفادة.`
              );
              const courierWaUrl = `https://wa.me/${cleanPhone}?text=${courierWaMsg}`;

              const adminCleanPhone = settings.adminPhone.replace(/[^0-9]/g, '');
              const adminWaMsg = encodeURIComponent(
                isDelivered
                  ? `ℹ️ [إشعار طلب مسلّم - لوكيت]\n• الطلب: ${order.id}\n• المندوب: ${order.courierName}\n• الحالة: تم التسليم\n• المدة المستغرقة: ${order.elapsedMinutes} دقيقة\n• وقت الاستلام: ${order.pickupTime || '-'}\n• وقت الإشعار: ${nowSaudiTime}\n• المطعم: ${order.restaurant}`
                  : `⚠️ [تنبيه تأخير - لوكيت]\n• الطلب: ${order.id}\n• المندوب: ${order.courierName}\n• المدة المستغرقة: ${order.elapsedMinutes} دقيقة\n• وقت الاستلام: ${order.pickupTime || '-'}\n• وقت التنبيه: ${nowSaudiTime}\n• عدد طلباته النشطة: ${order.activeOrdersHeldByCourier} طلبات\n• المطعم: ${order.restaurant}`
              );
              const adminWaUrl = `https://wa.me/${adminCleanPhone}?text=${adminWaMsg}`;

              return (
                <tr
                  key={order.id}
                  className={`transition hover:bg-slate-50/80 ${
                    order.isDelayed
                      ? isCritical
                        ? 'bg-rose-50/40 font-semibold'
                        : 'bg-amber-50/30'
                      : idx % 2 === 0
                      ? 'bg-white'
                      : 'bg-slate-50/30'
                  }`}
                >
                  {/* Order Number */}
                  <td className="py-3 px-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-slate-900 text-xs select-all">
                        {order.id}
                      </span>
                      <button
                        onClick={() => handleCopy(order.id)}
                        className="p-1 text-slate-400 hover:text-slate-700 transition rounded"
                        title="نسخ رقم الطلب"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      {copiedId === order.id && (
                        <span className="text-[10px] text-emerald-600 font-bold animate-in fade-in">تم النسخ</span>
                      )}
                    </div>
                  </td>

                  {/* Driver / Courier Name */}
                  <td className="py-3 px-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                        {order.courierName.slice(0, 1)}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-900 text-xs truncate max-w-[170px]" title={order.courierName}>
                          {order.courierName}
                        </span>
                        {order.restaurant && order.restaurant !== 'متجر لوكيت' && (
                          <span className="text-[10px] text-slate-400 truncate max-w-[150px] flex items-center gap-1">
                            <Store className="w-2.5 h-2.5" />
                            {order.restaurant}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Courier Phone */}
                  <td className="py-3 px-3 whitespace-nowrap font-mono text-xs text-slate-700" dir="ltr">
                    {courierPhone ? (
                      <a
                        href={courierWaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-700 hover:text-emerald-800 font-bold hover:underline inline-flex items-center gap-1"
                        title="محادثة واتساب"
                      >
                        <span>{courierPhone}</span>
                        <MessageCircle className="w-3 h-3 text-emerald-600" />
                      </a>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>

                  {/* Status Badge */}
                  <td className="py-3 px-3 text-center whitespace-nowrap">
                    {order.status === 'delivered' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        تم التسليم
                      </span>
                    ) : order.status === 'cancelled' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        ملغي
                      </span>
                    ) : order.isDelayed ? (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        isCritical
                          ? 'bg-rose-600 text-white animate-pulse'
                          : 'bg-amber-500 text-white'
                      }`}>
                        <AlertTriangle className="w-3 h-3" />
                        متأخر ({order.elapsedMinutes}د)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                        <Clock className="w-3 h-3 text-blue-600" />
                        ساري في الموعد
                      </span>
                    )}
                  </td>

                  {/* Created At / Order Time */}
                  <td className="py-3 px-3 text-center whitespace-nowrap text-slate-600 text-[11px] font-mono" dir="ltr">
                    {formatLocatTime(order.createdAt)}
                  </td>

                  {/* Assigned At / Acceptance Time */}
                  <td className="py-3 px-3 text-center whitespace-nowrap text-slate-600 text-[11px] font-mono" dir="ltr">
                    {formatLocatTime(order.assignedAt)}
                  </td>

                  {/* Delivery Time / Finish Time */}
                  <td className="py-3 px-3 text-center whitespace-nowrap text-slate-600 text-[11px] font-mono" dir="ltr">
                    {formatLocatTime(order.deliveryTime)}
                  </td>

                  {/* Elapsed Minutes */}
                  <td className="py-3 px-3 text-center whitespace-nowrap">
                    <span className={`font-mono font-bold text-xs ${
                      order.isDelayed ? 'text-rose-600' : 'text-slate-700'
                    }`}>
                      {order.elapsedMinutes} دقيقة
                    </span>
                  </td>

                  {/* Delivery Cost */}
                  <td className="py-3 px-3 text-center whitespace-nowrap">
                    <span className="font-mono font-bold text-slate-800 text-xs">
                      {order.deliveryCost ? `${order.deliveryCost} ر.س` : '-'}
                    </span>
                  </td>

                  {/* Payment Method */}
                  <td className="py-3 px-3 text-center whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-semibold">
                      {order.paymentMethod?.toLowerCase().includes('cash') ? (
                        <>
                          <Banknote className="w-3 h-3 text-amber-600" />
                          <span>كاش</span>
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-3 h-3 text-blue-600" />
                          <span>بطاقة (Card)</span>
                        </>
                      )}
                    </span>
                  </td>

                  {/* WhatsApp Direct Actions */}
                  <td className="py-3 px-3.5 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5">
                      {courierPhone ? (
                        <a
                          href={courierWaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => onTriggerManualAlert(order.id, 'courier')}
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-md text-[11px] font-bold inline-flex items-center gap-1 transition"
                          title="إرسال رسالة واتساب مباشرة للمندوب"
                        >
                          <MessageCircle className="w-3 h-3 text-emerald-600" />
                          <span>المندوب</span>
                        </a>
                      ) : (
                        <span className="text-slate-400 text-2xs">بدون رقم</span>
                      )}

                      <a
                        href={adminWaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => onTriggerManualAlert(order.id, 'admin')}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition"
                        title="إرسال للإدارة"
                      >
                        <ShieldAlert className="w-3 h-3 text-slate-600" />
                        <span>الإدارة</span>
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Table Footer */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-slate-500 text-xs flex flex-wrap items-center justify-between gap-2">
        <span>عرض {displayedOrders.length} من أصل {totalOrders} طلب مطابق للفرز من منصة لوكيت مباشرة</span>
        <span className="text-slate-400 text-[11px]">محدث ومتزامن لحظياً بتوقيت الرياض (GMT+3)</span>
      </div>
    </div>
  );
};
