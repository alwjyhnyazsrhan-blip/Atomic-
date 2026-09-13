import React, { useState, useEffect } from 'react';
import { 
  X, 
  Package, 
  Store, 
  User, 
  Clock, 
  Plus, 
  FileCode, 
  Sparkles, 
  Layers 
} from 'lucide-react';
import { Courier } from '../types';

interface QuickOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  couriers: Courier[];
  initialCourier?: Courier | null;
  onAddOrder: (orderData: any) => void;
  onPasteJson: (jsonArray: any[]) => void;
}

export const QuickOrderModal: React.FC<QuickOrderModalProps> = ({
  isOpen,
  onClose,
  couriers,
  initialCourier,
  onAddOrder,
  onPasteJson,
}) => {
  const [tab, setTab] = useState<'single' | 'json'>('single');
  const [orderId, setOrderId] = useState('');
  const [courierAccount, setCourierAccount] = useState('');
  const [elapsedMinutes, setElapsedMinutes] = useState(35);
  const [restaurant, setRestaurant] = useState('شاورما كلاسيك');
  const [customerAddress, setCustomerAddress] = useState('حي العليا، الرياض');
  const [activeHeld, setActiveHeld] = useState(1);
  const [jsonText, setJsonText] = useState('');

  useEffect(() => {
    if (isOpen) {
      const generatedId = `#LOC-${Math.floor(10000 + Math.random() * 90000)}`;
      setOrderId(generatedId);
      setElapsedMinutes(35);
      setRestaurant('مطعم شريك (لوكيت)');
      setCustomerAddress('حي الملقا، الرياض');

      if (initialCourier) {
        setCourierAccount(initialCourier.locatAccounts[0] || initialCourier.name);
      } else if (couriers.length > 0) {
        setCourierAccount(couriers[0].locatAccounts[0] || couriers[0].name);
      } else {
        setCourierAccount('driver_01');
      }
    }
  }, [isOpen, initialCourier, couriers]);

  if (!isOpen) return null;

  const handleSingleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const matchedCourier = couriers.find((c) =>
      c.id === initialCourier?.id ||
      c.locatAccounts.some((acc) => acc.toLowerCase() === courierAccount.toLowerCase()) ||
      c.name.toLowerCase() === courierAccount.toLowerCase()
    );

    onAddOrder({
      id: orderId.trim(),
      locatAccount: courierAccount,
      courierId: matchedCourier?.id,
      courierName: matchedCourier?.name || courierAccount,
      courierPhone: matchedCourier?.phone || '',
      elapsedMinutes: Number(elapsedMinutes) || 0,
      restaurant: restaurant.trim() || 'مطعم شريك',
      customerAddress: customerAddress.trim() || 'الوجهة المحددة',
      activeOrdersHeldByCourier: Number(activeHeld) || 1,
    });
    onClose();
  };

  const handleJsonSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed)) {
        onPasteJson(parsed);
        onClose();
      } else {
        alert('يجب أن يكون الـ JSON عبارة عن مصفوفة (Array) من الطلبات [ ... ]');
      }
    } catch (err: any) {
      alert('صيغة الـ JSON غير صحيحة: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-900">إضافة أو لصق بيانات من لوكيت</h2>
              <p className="text-xs text-slate-500">محاكاة طلب حي من شاشة لوكيت المباشرة</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="px-6 pt-4 flex gap-2 border-b border-slate-100 pb-2">
          <button
            onClick={() => setTab('single')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              tab === 'single' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            إضافة طلب فردي
          </button>
          <button
            onClick={() => setTab('json')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              tab === 'json' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>لصق كود JSON من لوكيت</span>
          </button>
        </div>

        {tab === 'single' ? (
          <form onSubmit={handleSingleSubmit} className="p-6 space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">رقم الطلب:</label>
                <input
                  type="text"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  className="w-full font-mono font-bold px-3 py-2 bg-white border border-slate-300 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">الوقت المنقضي (بالدقائق):</label>
                <input
                  type="number"
                  value={elapsedMinutes}
                  onChange={(e) => setElapsedMinutes(Number(e.target.value))}
                  className="w-full font-mono font-bold px-3 py-2 bg-white border border-slate-300 rounded-lg text-amber-800"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">حساب المندوب في لوكيت:</label>
              <select
                value={courierAccount}
                onChange={(e) => setCourierAccount(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
              >
                {couriers.map((c) => (
                  <optgroup key={c.id} label={c.name}>
                    {c.locatAccounts.map((acc) => (
                      <option key={acc} value={acc}>
                        {acc} ({c.name} - {c.phone})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">اسم المطعم/المتجر:</label>
                <input
                  type="text"
                  value={restaurant}
                  onChange={(e) => setRestaurant(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">الحي أو وجهة العميل:</label>
                <input
                  type="text"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">عدد الطلبات النشطة مع المندوب الآن:</label>
              <input
                type="number"
                min={1}
                max={10}
                value={activeHeld}
                onChange={(e) => setActiveHeld(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono font-bold"
              />
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-slate-600 bg-slate-100 rounded-lg font-semibold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-slate-900 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-2xs"
              >
                <Plus className="w-4 h-4" />
                <span>إدراج الطلب وفحص التأخير</span>
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleJsonSubmit} className="p-6 space-y-3.5 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                الصق مصفوفة كائنات JSON المستخرجة من لوكيت:
              </label>
              <textarea
                rows={8}
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                placeholder={`[\n  {\n    "id": "#LOC-9951",\n    "locatAccount": "mohammed_locat1",\n    "elapsedMinutes": 35,\n    "restaurant": "شاورما ستيشن",\n    "activeOrdersHeldByCourier": 2\n  }\n]`}
                className="w-full font-mono text-xs p-3 bg-slate-900 text-emerald-400 rounded-xl dir-ltr border border-slate-800"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-slate-600 bg-slate-100 rounded-lg font-semibold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-2xs"
              >
                <Sparkles className="w-4 h-4" />
                <span>مزامنة ومعالجة البيانات</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
