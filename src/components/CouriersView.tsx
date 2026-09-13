import React, { useState } from 'react';
import { 
  UserPlus, 
  Phone, 
  MessageCircle, 
  Edit3, 
  Trash2, 
  Clock, 
  Package, 
  Layers, 
  ShieldCheck, 
  AlertCircle, 
  Award,
  Search,
  CheckCircle2,
  Tag
} from 'lucide-react';
import { Courier, Order } from '../types';

interface CouriersViewProps {
  couriers: Courier[];
  orders: Order[];
  onOpenAddCourierModal: () => void;
  onEditCourier: (courier: Courier) => void;
  onDeleteCourier: (id: string) => void;
}

export const CouriersView: React.FC<CouriersViewProps> = ({
  couriers,
  orders,
  onOpenAddCourierModal,
  onEditCourier,
  onDeleteCourier,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCouriers = couriers.filter((c) => {
    const q = searchTerm.toLowerCase();
    const matchName = c.name.toLowerCase().includes(q);
    const matchAccounts = c.locatAccounts.some((a) => a.toLowerCase().includes(q));
    const matchPhone = c.phone.includes(q);
    return matchName || matchAccounts || matchPhone;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">إدارة بيانات المناديب وربط حسابات لوكيت</h2>
          <p className="text-xs text-slate-500 mt-1">
            ربط اسم المندوب وحساباته المتعددة في لوكيت برقم الواتساب الفعلي لضمان وصول التنبيهات المباشرة حتى عند تنقله بين الحسابات.
          </p>
        </div>
        <button
          onClick={onOpenAddCourierModal}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-2xs transition self-start md:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>إضافة مندوب جديد</span>
        </button>
      </div>

      {/* Search & Filter */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
        <div className="relative w-full max-w-md">
          <input
            type="text"
            placeholder="بحث باسم المندوب، حسابه في لوكيت، أو رقم الواتساب..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 focus:bg-white transition"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          إجمالي المناديب: <span className="font-bold text-slate-800">{couriers.length}</span>
        </div>
      </div>

      {/* Couriers Grid */}
      {filteredCouriers.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-2xs">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <UserPlus className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800 mb-1">
            {couriers.length === 0 ? 'لم يتم تسجيل أي مندوب حتى الآن' : 'لا توجد نتائج بحث مطابقة'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-4 leading-relaxed">
            {couriers.length === 0
              ? 'أضف أسماء المناديب وحساباتهم في لوكيت مع رقم الواتساب الفعلي لكل مندوب لبدء توجيه التنبيهات الآلية وحساب مؤشرات الأداء.'
              : 'يرجى مراجعة عبارة البحث أو مسح حقل البحث لإظهار كافة المناديب.'}
          </p>
          {couriers.length === 0 ? (
            <button
              onClick={onOpenAddCourierModal}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-2 shadow-2xs transition"
            >
              <UserPlus className="w-4 h-4" />
              <span>إضافة أول مندوب</span>
            </button>
          ) : (
            <button
              onClick={() => setSearchTerm('')}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
            >
              مسح البحث
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCouriers.map((courier) => {
          // Calculate real-time active orders held right now
          const currentActiveOrders = orders.filter((o) =>
            courier.locatAccounts.some((acc) => acc.toLowerCase() === o.locatAccount.toLowerCase()) ||
            o.courierId === courier.id
          );
          const currentDelayed = currentActiveOrders.filter((o) => o.isDelayed).length;
          const cleanPhone = courier.phone.replace(/[^0-9]/g, '');
          const waUrl = `https://wa.me/${cleanPhone}`;

          const isTop = courier.totalDeliveredToday >= 14 && courier.delayedOrdersCount === 0;
          const isNeedsAttention = courier.delayedOrdersCount >= 2 || (courier.totalDeliveredToday <= 6 && courier.avgDeliveryTimeMinutes >= 38);

          return (
            <div
              key={courier.id}
              className={`bg-white rounded-xl border transition duration-200 p-4 space-y-4 shadow-2xs hover:shadow-sm ${
                isNeedsAttention
                  ? 'border-rose-200 bg-rose-50/10'
                  : isTop
                  ? 'border-emerald-200 bg-emerald-50/10'
                  : 'border-slate-200'
              }`}
            >
              {/* Header with Name & Performance Badge */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-2xs ${
                    isTop
                      ? 'bg-emerald-600 text-white'
                      : isNeedsAttention
                      ? 'bg-rose-500 text-white'
                      : 'bg-slate-800 text-white'
                  }`}>
                    {courier.name.slice(0, 1)}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">{courier.name}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`w-2 h-2 rounded-full ${
                        courier.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'
                      }`} />
                      <span className="text-[11px] text-slate-500">
                        {courier.status === 'active' ? 'نشط في الميدان' : 'غير متصل'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Performance Badge */}
                {isTop && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    <Award className="w-3 h-3 text-emerald-600" />
                    أداء متميز
                  </span>
                )}
                {isNeedsAttention && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                    <AlertCircle className="w-3 h-3 text-rose-600" />
                    متابعة مطلوبة
                  </span>
                )}
              </div>

              {/* Locat Accounts list (Crucial requirement: can move between multiple accounts) */}
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1">
                <div className="text-[11px] font-semibold text-slate-600 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Tag className="w-3 h-3 text-slate-400" />
                    حسابات لوكيت المرتبطة ({courier.locatAccounts.length}):
                  </span>
                  <span className="text-[10px] text-slate-400">تطابق تلقائي</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {courier.locatAccounts.map((acc, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px] font-mono text-slate-700 shadow-2xs"
                    >
                      {acc}
                    </span>
                  ))}
                </div>
              </div>

              {/* Real WhatsApp Phone */}
              <div className="flex items-center justify-between text-xs px-1">
                <span className="text-slate-500 font-medium">رقم الواتساب الفعلي:</span>
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1.5 transition"
                  dir="ltr"
                  title="فتح محادثة واتساب مع المندوب"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{courier.phone}</span>
                </a>
              </div>

              {/* Stats Bar */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
                <div className="bg-slate-50 p-2 rounded-lg">
                  <div className="text-[10px] text-slate-500 font-medium">النشطة الآن</div>
                  <div className="text-base font-bold text-slate-900 mt-0.5 flex items-center justify-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-blue-500" />
                    <span>{currentActiveOrders.length}</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-2 rounded-lg">
                  <div className="text-[10px] text-slate-500 font-medium">المنجزة اليوم</div>
                  <div className="text-base font-bold text-slate-900 mt-0.5 flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{courier.totalDeliveredToday}</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-2 rounded-lg">
                  <div className="text-[10px] text-slate-500 font-medium">متوسط الوقت</div>
                  <div className="text-base font-bold text-slate-900 mt-0.5 flex items-center justify-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    <span>{courier.avgDeliveryTimeMinutes}د</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {courier.notes && (
                <p className="text-[11px] text-slate-500 italic bg-slate-50/50 p-2 rounded border border-slate-100">
                  {courier.notes}
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                <button
                  onClick={() => onEditCourier(courier)}
                  className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1 transition"
                  title="تعديل بيانات المندوب وحساباته"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>تعديل</span>
                </button>
                <button
                  onClick={() => {
                    if (confirm(`هل أنت متأكد من حذف المندوب ${courier.name}؟`)) {
                      onDeleteCourier(courier.id);
                    }
                  }}
                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition"
                  title="حذف المندوب"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};
