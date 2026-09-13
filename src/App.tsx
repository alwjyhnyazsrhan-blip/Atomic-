import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { LiveOrdersView } from './components/LiveOrdersView';
import { CouriersView } from './components/CouriersView';
import { AlertsLogView } from './components/AlertsLogView';
import { DailyReportView } from './components/DailyReportView';
import { AutomationScriptView } from './components/AutomationScriptView';
import { SettingsModal } from './components/SettingsModal';
import { CourierModal } from './components/CourierModal';
import { QuickOrderModal } from './components/QuickOrderModal';
import { Order, Courier, SystemSettings, AlertLog } from './types';
import { Bell, CheckCircle2, AlertTriangle, X } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'orders' | 'couriers' | 'alerts' | 'report' | 'automation'>('orders');
  
  // Data states
  const [settings, setSettings] = useState<SystemSettings>({
    delayThresholdMinutes: 30,
    criticalDelayMinutes: 45,
    adminPhone: '+966551234567',
    adminName: 'إدارة العمليات والتشغيل',
    autoAlertCourier: true,
    autoAlertAdmin: true,
    autoDailyReport: true,
    dailyReportTime: '23:00',
    whatsAppProvider: 'direct_chat',
    webhookUrl: '',
    webhookApiKey: '',
    locatSyncIntervalSeconds: 30,
    locatApiKey: 'locat_secret_key_8892',
  });

  const [orders, setOrders] = useState<Order[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'alert'; text: string } | null>(null);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCourierModalOpen, setIsCourierModalOpen] = useState(false);
  const [courierToEdit, setCourierToEdit] = useState<Courier | null>(null);
  const [isAddOrderOpen, setIsAddOrderOpen] = useState(false);

  const showToast = (text: string, type: 'success' | 'alert' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Fetch initial and poll data
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsSyncing(true);
    try {
      const [settingsRes, couriersRes, ordersRes, alertsRes] = await Promise.all([
        fetch('/api/settings').then((r) => r.json()),
        fetch('/api/couriers').then((r) => r.json()),
        fetch('/api/orders').then((r) => r.json()),
        fetch('/api/alerts').then((r) => r.json()),
      ]);

      if (settingsRes.success) setSettings(settingsRes.settings);
      if (couriersRes.success) setCouriers(couriersRes.couriers);
      if (ordersRes.success) setOrders(ordersRes.orders);
      if (alertsRes.success) setAlerts(alertsRes.alerts);
    } catch (err) {
      console.error('Failed to sync system data:', err);
    } finally {
      if (!silent) setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Background polling every 20 seconds to sync live order changes from the script
    const interval = setInterval(() => {
      fetchData(true);
    }, 20000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Advance time simulation (+5 / +15 mins)
  const handleAdvanceTime = async (minutes: number) => {
    try {
      const res = await fetch('/api/orders/advance-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'alert');
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Trigger manual WhatsApp alert
  const handleTriggerManualAlert = async (orderId: string, target: 'courier' | 'admin' | 'admin2' | 'both') => {
    try {
      const res = await fetch('/api/alerts/trigger-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, target }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`تم توجيه التنبيه للطلب ${orderId} وتحديث السجل`, 'success');
        fetchData(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Save Settings
  const handleSaveSettings = async (newSettings: Partial<SystemSettings>) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      const data = await res.json();
      if (data.success) {
        setSettings(data.settings);
        showToast('تم حفظ وضبط إعدادات الأتمتة وحدود التأخير بنجاح');
        fetchData(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Save / Update Courier
  const handleSaveCourier = async (courierData: Partial<Courier>) => {
    try {
      const res = await fetch('/api/couriers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(courierData),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete Courier
  const handleDeleteCourier = async (id: string) => {
    try {
      const res = await fetch(`/api/couriers/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Clear Alerts Log
  const handleClearAlerts = async () => {
    try {
      const res = await fetch('/api/alerts/clear', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setAlerts([]);
        showToast('تم مسح سجل التنبيهات');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Send Daily Report to Admin WhatsApp
  const handleSendReportToAdmin = async () => {
    try {
      const res = await fetch('/api/reports/send-daily', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('تم إرسال التقرير اليومي الشامل للإدارة عبر الواتساب بنجاح');
        fetchData(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Test sync or manual order intake
  const handleLocatSyncIngest = async (incomingOrders: any[]) => {
    try {
      const res = await fetch('/api/locat/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secretKey: settings.locatApiKey,
          liveOrders: incomingOrders,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, data.alertsGenerated > 0 ? 'alert' : 'success');
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col antialiased">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 left-5 z-50 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div className={`px-4 py-3 rounded-xl shadow-lg border flex items-center gap-2.5 text-xs font-bold ${
            toastMessage.type === 'alert'
              ? 'bg-rose-900 text-white border-rose-800'
              : 'bg-emerald-900 text-white border-emerald-800'
          }`}>
            {toastMessage.type === 'alert' ? (
              <AlertTriangle className="w-4 h-4 text-rose-300" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            )}
            <span>{toastMessage.text}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="p-1 hover:opacity-75 transition mr-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Header */}
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        settings={settings}
        orders={orders}
        unreadAlertsCount={alerts.length}
        onRefresh={() => fetchData(false)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onAdvanceTime={handleAdvanceTime}
        onSendQuickDailyReport={handleSendReportToAdmin}
        isSyncing={isSyncing}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentTab === 'orders' && (
          <LiveOrdersView
            orders={orders}
            couriers={couriers}
            settings={settings}
            onTriggerManualAlert={handleTriggerManualAlert}
            onOpenAddOrderModal={() => setIsAddOrderOpen(true)}
            onAdvanceTime={handleAdvanceTime}
          />
        )}

        {currentTab === 'couriers' && (
          <CouriersView
            couriers={couriers}
            orders={orders}
            onOpenAddCourierModal={() => {
              setCourierToEdit(null);
              setIsCourierModalOpen(true);
            }}
            onEditCourier={(c) => {
              setCourierToEdit(c);
              setIsCourierModalOpen(true);
            }}
            onDeleteCourier={handleDeleteCourier}
          />
        )}

        {currentTab === 'alerts' && (
          <AlertsLogView
            alerts={alerts}
            onClearAlerts={handleClearAlerts}
          />
        )}

        {currentTab === 'report' && (
          <DailyReportView
            settings={settings}
            onSendReportToAdmin={handleSendReportToAdmin}
          />
        )}

        {currentTab === 'automation' && (
          <AutomationScriptView
            settings={settings}
            onTestSync={handleLocatSyncIngest}
          />
        )}
      </main>

      {/* Modals */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
      />

      <CourierModal
        isOpen={isCourierModalOpen}
        onClose={() => setIsCourierModalOpen(false)}
        courierToEdit={courierToEdit}
        onSave={handleSaveCourier}
      />

      <QuickOrderModal
        isOpen={isAddOrderOpen}
        onClose={() => setIsAddOrderOpen(false)}
        couriers={couriers}
        onAddOrder={(single) => handleLocatSyncIngest([single])}
        onPasteJson={handleLocatSyncIngest}
      />
    </div>
  );
}
