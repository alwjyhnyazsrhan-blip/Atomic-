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
  Tag,
  Plus,
  AlertTriangle,
  Info,
  UserCheck
} from 'lucide-react';
import { Courier, Order } from '../types';

interface CouriersViewProps {
  couriers: Courier[];
  orders: Order[];
  onOpenAddCourierModal: () => void;
  onEditCourier: (courier: Courier) => void;
  onDeleteCourier: (id: string) => void;
  onAssignOrderToCourier?: (courier: Courier) => void;
}

// Arabic normalization helper for accurate matching
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

function doesCourierMatchOrder(c: Courier, o: Order): boolean {
  if (o.courierId && o.courierId === c.id) return true;
  const cName = normalizeArabic(c.name);
  const oName = normalizeArabic(o.courierName || '');
  const oAcc = normalizeArabic(o.locatAccount || '');
  const cPhone = c.phone.replace(/\D/g, '');
  const oPhone = (o.courierPhone || '').replace(/\D/g, '');

  if (cPhone && oPhone && (cPhone === oPhone || cPhone.endsWith(oPhone) || oPhone.endsWith(cPhone))) return true;

  if (c.locatAccounts.some((acc) => {
    const a = normalizeArabic(acc);
    return a === oAcc || a === oName || (oAcc && (a.includes(oAcc) || oAcc.includes(a)));
  })) return true;

  if (cName && (cName === oName || cName === oAcc || cName.includes(oName) || oName.includes(cName) || cName.includes(oAcc) || oAcc.includes(cName))) return true;

  return false;
}

export const CouriersView: React.FC<CouriersViewProps> = ({
  couriers,
  orders,
  onOpenAddCourierModal,
  onEditCourier,
  onDeleteCourier,
  onAssignOrderToCourier,
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
            ربط اسم المندوب وحساباته في لوكيت برقم الواتساب الفعلي لضمان وصول التنبيهات المباشرة حتى عند تنقله بين الحسابات.
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

      {/* Locate Direct Auto-Sync Banner */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-950 text-xs shadow-2xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 font-bold text-xs shadow-xs">
            <UserCheck className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-xs sm:text-sm text-emerald-900">
              جميع المناديب ({couriers.length} مندوب) مسحوبين مباشرة من حسابك في لوكيت ومطابقين تماماً
            </h4>
            <p className="text-[11px] text-emerald-700 mt-0.5">
              يتم سحب وتحديث الأسماء، أرقام الجوال، أرقام الهويات الوطنية، وحالات الاتصال لحظياً مع المنصة بدون أي نقص.
            </p>
          </div>
        </div>
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
            // Calculate real-time active orders held right now using flexible smart matching
            const currentActiveOrders = orders.filter((o) => doesCourierMatchOrder(courier, o));
            const currentDelayed = currentActiveOrders.filter((o) => o.isDelayed).length;
            const cleanPhone = courier.phone.replace(/[^0-9]/g, '');
            const waUrl = `https://wa.me/${cleanPhone}`;

            const isTop = courier.totalDeliveredToday >= 14 && courier.delayedOrdersCount === 0;
            const isNeedsAttention = courier.delayedOrdersCount >= 2 || (courier.totalDeliveredToday <= 6 && courier.avgDeliveryTimeMinutes >= 38);

            return (
              <div
                key={courier.id}
                className={`bg-white rounded-xl border transition duration-200 p-4 space-y-3.5 shadow-2xs hover:shadow-sm flex flex-col justify-between ${
                  isNeedsAttention
                    ? 'border-rose-200 bg-rose-50/10'
                    : isTop
                    ? 'border-emerald-200 bg-emerald-50/10'
                    : 'border-slate-200'
                }`}
              >
                <div className="space-y-3.5">
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
                    <span className="text-slate-500 font-medium">رقم الواتساب:</span>
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1.5 transition"
                      dir="ltr"
                      title="فتح محادثة واتساب مع المندوب"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{courier.phone || 'غير مسجل'}</span>
                    </a>
                  </div>

                  {/* Locate Metadata (Iqama/ID, Balance/Gift) */}
                  {(courier.idNumber || courier.gift !== undefined) && (
                    <div className="bg-slate-50/80 px-2.5 py-1.5 rounded-lg border border-slate-100 flex items-center justify-between text-[11px]">
                      {courier.idNumber && (
                        <div className="flex items-center gap-1 text-slate-600">
                          <span className="text-slate-400">الهوية/الإقامة:</span>
                          <span className="font-mono font-semibold text-slate-800">{courier.idNumber}</span>
                        </div>
                      )}
                      {courier.gift !== undefined && Number(courier.gift) > 0 && (
                        <div className="flex items-center gap-1 text-emerald-700">
                          <span className="text-slate-400">نقاط/مكافآت:</span>
                          <span className="font-mono font-bold">{Math.round(Number(courier.gift))}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Stats Bar */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
                    <div className={`p-2 rounded-lg ${currentActiveOrders.length > 0 ? 'bg-blue-50/80 border border-blue-100' : 'bg-slate-50'}`}>
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

                  {/* Active Orders Section on Courier Card */}
                  <div className="pt-2 border-t border-slate-100">
                    {currentActiveOrders.length > 0 ? (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <Package className="w-3 h-3 text-blue-600" />
                            الطلبات بحوزته حالياً ({currentActiveOrders.length}):
                          </span>
                          {currentDelayed > 0 && (
                            <span className="text-rose-600 text-[10px] font-bold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 flex items-center gap-1">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              {currentDelayed} متأخر
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {currentActiveOrders.map((ord) => (
                            <div
                              key={ord.id}
                              className={`px-2 py-1 rounded text-2xs font-mono font-bold flex items-center gap-1.5 border shadow-2xs ${
                                ord.isDelayed 
                                  ? 'bg-rose-50 border-rose-300 text-rose-800' 
                                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              }`}
                              title={`${ord.restaurant} • منقضي: ${ord.elapsedMinutes} دقيقة`}
                            >
                              <span>{ord.id}</span>
                              <span className="text-[10px] opacity-80 font-sans">({ord.elapsedMinutes}د)</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-50 p-2 rounded-lg text-center flex items-center justify-between text-xs">
                        <span className="text-slate-400 text-[11px]">لا توجد طلبات جارية بحوزته حالياً</span>
                        {onAssignOrderToCourier && (
                          <button
                            onClick={() => onAssignOrderToCourier(courier)}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded border border-indigo-200 transition inline-flex items-center gap-1"
                            title="إسناد طلب جاري يدوي لهذا المندوب"
                          >
                            <Plus className="w-3 h-3" />
                            <span>إسناد طلب</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  {courier.notes && (
                    <p className="text-[11px] text-slate-500 italic bg-slate-50/50 p-2 rounded border border-slate-100">
                      {courier.notes}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 mt-2">
                  {onAssignOrderToCourier && (
                    <button
                      onClick={() => onAssignOrderToCourier(courier)}
                      className="px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg flex items-center gap-1 transition"
                      title="إسناد أو تسجيل طلب جاري لهذا المندوب"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إسناد طلب جاري</span>
                    </button>
                  )}

                  <div className="flex items-center gap-1.5 mr-auto">
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
