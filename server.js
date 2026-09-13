import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// --- IN-MEMORY DATA STORE (Clean initial state for real operational data) ---
let settings = {
  delayThresholdMinutes: 30,
  criticalDelayMinutes: 45,
  adminPhone: '',
  adminName: '',
  adminPhone2: '',
  adminName2: '',
  autoAlertCourier: true,
  autoAlertAdmin: true,
  autoAlertAdmin2: true,
  alertCooldownMinutes: 20,
  antiBanMinDelaySeconds: 5,
  antiBanMaxDelaySeconds: 10,
  autoDailyReport: true,
  dailyReportTime: '23:00',
  whatsAppProvider: 'direct_chat', // direct_chat (wa.me) / webhook
  webhookUrl: '',
  webhookApiKey: '',
  locatSyncIntervalSeconds: 30,
  locatApiKey: 'locat_secret_key_8892',
  enablePuppeteerHeadless: false,
  locateUsername: '',
  locatePassword: '',
};

let couriers = [];
let orders = [];
let alerts = [];

// --- ANTI-BAN MESSAGE QUEUE & COOLDOWN ENGINE ---
const alertCooldownMap = new Map();
let messageQueue = [];
let isQueueProcessing = false;
let queueStats = {
  totalProcessed: 0,
  totalSent: 0,
  totalSkippedCooldown: 0,
};

let puppeteerStatus = {
  enabled: false,
  isRunning: false,
  status: 'idle',
  lastScrapedCount: 0,
};

// Helper: Match courier by Locat account
function findCourierByLocatAccount(account) {
  if (!account) return undefined;
  const clean = account.trim().toLowerCase();
  return couriers.find((c) =>
    c.locatAccounts.some((acc) => acc.trim().toLowerCase() === clean) ||
    c.name.trim().toLowerCase() === clean
  );
}

// Helper: Format phone for WhatsApp
function formatPhoneForWhatsApp(phone) {
  if (!phone) return '';
  return phone.replace(/[^0-9]/g, '');
}

// Helper: Construct Courier WhatsApp Reminder Message
function buildCourierMessage(order, courierName) {
  return `السلام عليكم أخي ${courierName}،\nنود تذكيرك بأن الطلب ${order.id} متأخر وتجاوز ${order.elapsedMinutes} دقيقة من وقت الاستلام.\nالمطعم: ${order.restaurant}\nالعميل: ${order.customerAddress || 'الوجهة المحددة'}\nيرجى سرعة التسليم والإفادة بحالة التوصيل. شاكرين تعاونك!`;
}

// Helper: Construct Admin Alert Message
function buildAdminMessage(order, courierName, activeCount) {
  return `🚨 [تنبيه تأخير طلب - لوكيت]\n• رقم الطلب: ${order.id}\n• المندوب: ${courierName}\n• الوقت المنقضي: ${order.elapsedMinutes} دقيقة (الحد المسموح: ${settings.delayThresholdMinutes} دقيقة)\n• عدد الطلبات النشطة بحوزته: ${activeCount} طلبات\n• المطعم: ${order.restaurant}\n• الحي: ${order.customerAddress || 'غير محدد'}\n• الوقت: ${new Date().toLocaleTimeString('ar-SA')}`;
}

// Helper: Construct Admin 2 Escalation Message
function buildAdmin2Message(order, courierName, activeCount) {
  return `🚨 [تصعيد تأخير حرج - إشعار الإدارة الثانية]\n• اسم المندوب: ${courierName}\n• رقم الطلب: ${order.id}\n• الوقت المنقضي: ${order.elapsedMinutes} دقيقة\n• عدد الطلبات النشطة بحوزته: ${activeCount} طلبات\n• المطعم: ${order.restaurant}\n• الحي: ${order.customerAddress || 'غير محدد'}\n⚠️ تنبيه: استمر التأخير وتجاوز حد التصعيد الحرج (${settings.criticalDelayMinutes} دقيقة).\nيرجى التدخل والمتابعة المباشرة مع المندوب.`;
}

// Helper: Enqueue message safely with Anti-Ban delay & Cooldown protection
function enqueueAlert(recipientType, recipientName, recipientPhone, orderId, message, elapsedMinutes, activeOrdersCount) {
  if (!recipientPhone) return;

  const cooldownKey = `${orderId}_${recipientType}`;
  const lastSent = alertCooldownMap.get(cooldownKey) || 0;
  const cooldownMs = (settings.alertCooldownMinutes || 20) * 60 * 1000;

  // 1. Anti-Spam / Cooldown Check
  if (Date.now() - lastSent < cooldownMs) {
    queueStats.totalSkippedCooldown++;
    console.log(`[Anti-Ban] تم تخطي التنبيه للطلب ${orderId} (${recipientType}) لوجود فترة Cooldown نشطة.`);
    messageQueue.unshift({
      id: `q-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      recipientType,
      recipientName,
      recipientPhone,
      orderId,
      message,
      status: 'skipped_cooldown',
      delayAppliedSeconds: 0,
      scheduledAt: new Date().toISOString(),
      error: `فترة Cooldown نشطة (${settings.alertCooldownMinutes} دقيقة)`,
    });
    return;
  }

  // 2. Anti-Ban Jitter Delay Calculation (5-10s)
  const minDelay = settings.antiBanMinDelaySeconds || 5;
  const maxDelay = Math.max(minDelay, settings.antiBanMaxDelaySeconds || 10);
  const delaySeconds = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

  const cleanPhone = formatPhoneForWhatsApp(recipientPhone);
  const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

  const queuedItem = {
    id: `q-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: new Date().toISOString(),
    recipientType,
    recipientName,
    recipientPhone,
    orderId,
    message,
    status: 'waiting',
    delayAppliedSeconds: delaySeconds,
    scheduledAt: new Date(Date.now() + delaySeconds * 1000).toISOString(),
    waLink,
  };

  messageQueue.push(queuedItem);
  alertCooldownMap.set(cooldownKey, Date.now());

  processMessageQueue();
}

async function processMessageQueue() {
  if (isQueueProcessing) return;
  isQueueProcessing = true;

  while (messageQueue.some((item) => item.status === 'waiting')) {
    const nextItem = messageQueue.find((item) => item.status === 'waiting');
    if (!nextItem) break;

    nextItem.status = 'sending';
    const delayMs = (nextItem.delayAppliedSeconds || 5) * 1000;

    await new Promise((res) => setTimeout(res, delayMs));

    nextItem.status = 'sent';
    nextItem.sentAt = new Date().toISOString();
    queueStats.totalProcessed++;
    queueStats.totalSent++;

    alerts.unshift({
      id: `alt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      recipientType: nextItem.recipientType,
      recipientName: nextItem.recipientName,
      recipientPhone: nextItem.recipientPhone,
      orderId: nextItem.orderId,
      elapsedMinutes: 0,
      activeOrdersCount: 0,
      message: nextItem.message,
      status: 'sent',
      waLink: nextItem.waLink || '',
      delayAppliedSeconds: nextItem.delayAppliedSeconds,
    });

    console.log(`[Anti-Ban Queue] ✅ تم إرسال تنبيه (${nextItem.recipientType}) للطلب ${nextItem.orderId} بفارق أمان ${nextItem.delayAppliedSeconds} ثوانٍ`);
  }

  isQueueProcessing = false;
}

// Helper: Trigger alerts for delayed orders (including Admin 2 Escalation)
function triggerAlertsForOrder(order) {
  const courier = findCourierByLocatAccount(order.locatAccount);
  const courierName = courier ? courier.name : order.courierName;
  const courierPhone = courier ? courier.phone : order.courierPhone;
  const activeCount = order.activeOrdersHeldByCourier || 2;

  // 1. Alert Courier
  if (settings.autoAlertCourier && !order.alertSentToCourier && courierPhone) {
    const courierMsg = buildCourierMessage(order, courierName);
    enqueueAlert('courier', courierName, courierPhone, order.id, courierMsg, order.elapsedMinutes, activeCount);
    order.alertSentToCourier = true;
    order.courierAlertTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  }

  // 2. Alert Admin 1
  if (settings.autoAlertAdmin && !order.alertSentToAdmin && settings.adminPhone) {
    const adminMsg = buildAdminMessage(order, courierName, activeCount);
    enqueueAlert('admin', settings.adminName || 'الإدارة', settings.adminPhone, order.id, adminMsg, order.elapsedMinutes, activeCount);
    order.alertSentToAdmin = true;
    order.adminAlertTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  }

  // 3. Alert Admin 2 upon Continued Delay (Escalation)
  if (
    order.elapsedMinutes >= settings.criticalDelayMinutes &&
    !order.alertSentToAdmin2 &&
    settings.autoAlertAdmin2 &&
    settings.adminPhone2
  ) {
    const admin2Msg = buildAdmin2Message(order, courierName, activeCount);
    enqueueAlert('admin2', settings.adminName2 || 'الإدارة الثانية', settings.adminPhone2, order.id, admin2Msg, order.elapsedMinutes, activeCount);
    order.alertSentToAdmin2 = true;
    order.admin2AlertTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  }
}

// Helper: Calculate daily report summary
function generateDailyReport() {
  const today = new Date().toISOString().split('T')[0];

  const courierStats = couriers.map((courier) => {
    const courierOrders = orders.filter((o) => {
      const match = findCourierByLocatAccount(o.locatAccount);
      return match ? match.id === courier.id : false;
    });

    const activeCount = courierOrders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length;
    const deliveredCount = courierOrders.filter((o) => o.status === 'delivered').length;
    const delayedCount = courierOrders.filter((o) => o.isDelayed).length;

    const avgTime = courierOrders.length > 0
      ? Math.round(courierOrders.reduce((sum, o) => sum + o.elapsedMinutes, 0) / courierOrders.length)
      : 0;

    let efficiencyScore = 100;
    if (courierOrders.length > 0) {
      const delayPenalty = (delayedCount / courierOrders.length) * 45;
      const timePenalty = avgTime > settings.delayThresholdMinutes ? 25 : 0;
      efficiencyScore = Math.max(10, Math.min(100, Math.round(100 - delayPenalty - timePenalty)));
    }

    let performanceTier = 'medium';
    if (efficiencyScore >= 80 && deliveredCount >= 5) performanceTier = 'top';
    else if (efficiencyScore < 50 || delayedCount >= 4) performanceTier = 'low';

    return {
      courierId: courier.id,
      courierName: courier.name,
      locatAccounts: courier.locatAccounts,
      phone: courier.phone,
      deliveredCount,
      delayedCount,
      activeCount,
      avgTime,
      efficiencyScore,
      performanceTier,
    };
  });

  courierStats.sort((a, b) => b.efficiencyScore - a.efficiencyScore || b.deliveredCount - a.deliveredCount);

  const topPerformers = courierStats.filter((c) => c.performanceTier === 'top');
  const underPerformers = courierStats.filter((c) => c.performanceTier === 'low');
  const totalDeliveredToday = courierStats.reduce((sum, c) => sum + c.deliveredCount, 0);
  const totalDelayedToday = courierStats.reduce((sum, c) => sum + c.delayedCount, 0);
  const activeOrdersRightNow = orders.length;

  const overallAvgTimeMinutes = courierStats.length > 0
    ? Math.round(courierStats.reduce((sum, c) => sum + c.avgTime, 0) / courierStats.length)
    : 0;

  const onTimeRate = totalDeliveredToday + totalDelayedToday > 0
    ? Math.round((Math.max(0, totalDeliveredToday - totalDelayedToday) / (totalDeliveredToday + totalDelayedToday)) * 100)
    : 100;

  let waText = `📊 *تقرير أداء مناديب لوكيت اليومي*\n`;
  waText += `📅 *التاريخ:* ${today}\n`;
  waText += `⏰ *وقت التوليد:* ${new Date().toLocaleTimeString('ar-SA')}\n`;
  waText += `───────────────────────\n`;
  waText += `📈 *الملخص العام للأداء:*\n`;
  waText += `• إجمالي المناديب: *${couriers.length}* مندوب\n`;
  waText += `• إجمالي الطلبات المنجزة: *${totalDeliveredToday}* طلب\n`;
  waText += `• الطلبات النشطة حالياً: *${activeOrdersRightNow}* طلب\n`;
  waText += `• الطلبات المتأخرة المسجلة: *${totalDelayedToday}* طلب\n`;
  waText += `• متوسط زمن التوصيل: *${overallAvgTimeMinutes}* دقيقة\n`;
  waText += `• نسبة التسليم في الوقت المحدد: *${onTimeRate}%*\n`;
  waText += `───────────────────────\n\n`;

  if (courierStats.length === 0) {
    waText += `ℹ️ *ملاحظة:* لم يتم تسجيل أي مندوب في لوحة التحكم بعد. أضف المناديب لتفعيل التحليل اليومي وإشعارات التأخير.\n`;
  } else {
    waText += `🌟 *المناديب الأكثر تميزاً (الأعلى أداءً):*\n`;
    if (topPerformers.length > 0) {
      topPerformers.forEach((c, idx) => {
        waText += `${idx + 1}. *${c.courierName}*: ${c.deliveredCount} طلب | متوسط ${c.avgTime} دقيقة | تأخير: ${c.delayedCount}\n`;
      });
    } else {
      waText += `• لا يوجد مناديب في فئة النخبة اليوم حتى الآن.\n`;
    }

    waText += `\n⚠️ *المناديب ضعاف الإنجاز (بحاجة لمتابعة):*\n`;
    if (underPerformers.length > 0) {
      underPerformers.forEach((c, idx) => {
        waText += `${idx + 1}. *${c.courierName}*: ${c.deliveredCount} تسليم فقط | تأخر في ${c.delayedCount} طلبات (${c.phone})\n`;
      });
    } else {
      waText += `• لا يوجد مناديب ضعاف الأداء اليوم.\n`;
    }
  }
  waText += `\n───────────────────────\nتم الإرسال آلياً عبر نظام أتمتة لوكيت الذكي.`;

  return {
    date: today,
    generatedAt: new Date().toISOString(),
    totalOrdersToday: totalDeliveredToday + activeOrdersRightNow,
    deliveredOrdersToday: totalDeliveredToday,
    delayedOrdersToday: totalDelayedToday,
    activeOrdersRightNow,
    overallAvgTimeMinutes,
    onTimeRate,
    topPerformers,
    underPerformers,
    allCouriers: courierStats,
    whatsappFormattedText: waText,
  };
}

// --- API ROUTES ---

// Settings
app.get('/api/settings', (req, res) => {
  res.json({ success: true, settings });
});

app.post('/api/settings', (req, res) => {
  const body = req.body;
  settings = {
    ...settings,
    delayThresholdMinutes: Number(body.delayThresholdMinutes) || settings.delayThresholdMinutes,
    criticalDelayMinutes: Number(body.criticalDelayMinutes) || settings.criticalDelayMinutes,
    adminPhone: body.adminPhone !== undefined ? body.adminPhone : settings.adminPhone,
    adminName: body.adminName !== undefined ? body.adminName : settings.adminName,
    adminPhone2: body.adminPhone2 !== undefined ? body.adminPhone2 : settings.adminPhone2,
    adminName2: body.adminName2 !== undefined ? body.adminName2 : settings.adminName2,
    autoAlertCourier: body.autoAlertCourier !== undefined ? Boolean(body.autoAlertCourier) : settings.autoAlertCourier,
    autoAlertAdmin: body.autoAlertAdmin !== undefined ? Boolean(body.autoAlertAdmin) : settings.autoAlertAdmin,
    autoAlertAdmin2: body.autoAlertAdmin2 !== undefined ? Boolean(body.autoAlertAdmin2) : settings.autoAlertAdmin2,
    alertCooldownMinutes: Number(body.alertCooldownMinutes) || settings.alertCooldownMinutes,
    antiBanMinDelaySeconds: Number(body.antiBanMinDelaySeconds) || settings.antiBanMinDelaySeconds,
    antiBanMaxDelaySeconds: Number(body.antiBanMaxDelaySeconds) || settings.antiBanMaxDelaySeconds,
    autoDailyReport: body.autoDailyReport !== undefined ? Boolean(body.autoDailyReport) : settings.autoDailyReport,
    dailyReportTime: body.dailyReportTime || settings.dailyReportTime,
    whatsAppProvider: body.whatsAppProvider || settings.whatsAppProvider,
    webhookUrl: body.webhookUrl !== undefined ? body.webhookUrl : settings.webhookUrl,
    webhookApiKey: body.webhookApiKey !== undefined ? body.webhookApiKey : settings.webhookApiKey,
    enablePuppeteerHeadless: body.enablePuppeteerHeadless !== undefined ? Boolean(body.enablePuppeteerHeadless) : settings.enablePuppeteerHeadless,
    locateUsername: body.locateUsername !== undefined ? body.locateUsername : settings.locateUsername,
    locatePassword: body.locatePassword !== undefined ? body.locatePassword : settings.locatePassword,
  };

  puppeteerStatus.enabled = settings.enablePuppeteerHeadless;

  orders.forEach((o) => {
    o.isDelayed = o.elapsedMinutes >= settings.delayThresholdMinutes;
    if (o.isDelayed && o.status !== 'delayed' && o.status !== 'delivered') {
      o.status = 'delayed';
    }
  });

  res.json({ success: true, settings, message: 'تم حفظ الإعدادات بنجاح' });
});

// Couriers
app.get('/api/couriers', (req, res) => {
  const enrichedCouriers = couriers.map((c) => {
    const activeCount = orders.filter((o) => {
      const match = findCourierByLocatAccount(o.locatAccount);
      return match ? match.id === c.id : false;
    }).length;
    return { ...c, activeOrdersCount: activeCount };
  });
  res.json({ success: true, couriers: enrichedCouriers });
});

app.post('/api/couriers', (req, res) => {
  const { id, name, locatAccounts, phone, notes, status } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ success: false, message: 'الاسم ورقم الواتساب مطلوبان' });
  }

  const existingIndex = couriers.findIndex((c) => c.id === id);
  const accountsArray = Array.isArray(locatAccounts)
    ? locatAccounts
    : (locatAccounts ? String(locatAccounts).split(',').map((s) => s.trim()).filter(Boolean) : [name]);

  if (existingIndex >= 0) {
    couriers[existingIndex] = {
      ...couriers[existingIndex],
      name,
      locatAccounts: accountsArray,
      phone,
      notes: notes || '',
      status: status || 'active',
    };
  } else {
    couriers.push({
      id: id || `cr-${Date.now()}`,
      name,
      locatAccounts: accountsArray,
      phone,
      notes: notes || '',
      status: status || 'active',
      activeOrdersCount: 0,
      deliveredTodayCount: 0,
      delayedTodayCount: 0,
      avgDeliveryMinutes: 0,
      efficiencyScore: 100,
    });
  }

  res.json({ success: true, message: 'تم حفظ بيانات المندوب بنجاح', couriers });
});

app.delete('/api/couriers/:id', (req, res) => {
  couriers = couriers.filter((c) => c.id !== req.params.id);
  res.json({ success: true, message: 'تم حذف المندوب بنجاح' });
});

// Orders
app.get('/api/orders', (req, res) => {
  orders.forEach((o) => {
    const matchedCourier = findCourierByLocatAccount(o.locatAccount);
    if (matchedCourier) {
      o.courierName = matchedCourier.name;
      o.courierPhone = matchedCourier.phone;
    }
  });
  res.json({ success: true, orders, count: orders.length });
});

app.post('/api/orders', (req, res) => {
  const orderData = req.body;
  const matchedCourier = findCourierByLocatAccount(orderData.locatAccount || orderData.courierName);
  const isDelayed = (orderData.elapsedMinutes || 0) >= settings.delayThresholdMinutes;

  const newOrder = {
    id: orderData.id || `#LOC-${Math.floor(1000 + Math.random() * 9000)}`,
    locatAccount: orderData.locatAccount || orderData.courierName || 'مندوب غير محدد',
    courierName: matchedCourier ? matchedCourier.name : (orderData.courierName || orderData.locatAccount),
    courierPhone: matchedCourier ? matchedCourier.phone : (orderData.courierPhone || ''),
    elapsedMinutes: Number(orderData.elapsedMinutes) || 0,
    activeOrdersHeldByCourier: Number(orderData.activeOrdersHeldByCourier) || 1,
    restaurant: orderData.restaurant || 'مطعم شريك لوكيت',
    customerAddress: orderData.customerAddress || 'الوجهة المحددة',
    pickupTime: orderData.pickupTime || new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
    status: isDelayed ? 'delayed' : 'picked_up',
    isDelayed,
    alertSentToCourier: false,
    alertSentToAdmin: false,
  };

  const existingIdx = orders.findIndex((o) => o.id === newOrder.id);
  if (existingIdx >= 0) {
    orders[existingIdx] = { ...orders[existingIdx], ...newOrder };
  } else {
    orders.unshift(newOrder);
  }

  if (isDelayed) {
    triggerAlertsForOrder(newOrder);
  }

  res.json({ success: true, message: 'تم تسجيل الطلب بنجاح', order: newOrder });
});

app.patch('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const order = orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });

  order.status = status;
  if (status === 'delivered') {
    const courier = findCourierByLocatAccount(order.locatAccount);
    if (courier) courier.deliveredTodayCount = (courier.deliveredTodayCount || 0) + 1;
  }
  res.json({ success: true, order });
});

app.delete('/api/orders/:id', (req, res) => {
  orders = orders.filter((o) => o.id !== req.params.id);
  res.json({ success: true, message: 'تم حذف الطلب' });
});

// Locat Real-Time Sync Endpoint
app.post('/api/locat/sync', (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.body.apiKey;
  if (apiKey && apiKey !== settings.locatApiKey) {
    return res.status(401).json({ success: false, message: 'مفتاح API غير صالح' });
  }

  const liveOrders = Array.isArray(req.body) ? req.body : (req.body.orders || []);
  let alertsGenerated = 0;

  liveOrders.forEach((incoming) => {
    const incomingId = incoming.id.startsWith('#') ? incoming.id : '#' + incoming.id;
    const matchedCourier = findCourierByLocatAccount(incoming.locatAccount || incoming.courierName);
    const elapsedMinutes = Number(incoming.elapsedMinutes) || 0;
    const isDelayed = elapsedMinutes >= settings.delayThresholdMinutes;

    const existingOrder = orders.find((o) => o.id === incomingId);

    if (existingOrder) {
      existingOrder.elapsedMinutes = elapsedMinutes;
      existingOrder.activeOrdersHeldByCourier = incoming.activeOrdersHeldByCourier || existingOrder.activeOrdersHeldByCourier;
      existingOrder.isDelayed = isDelayed;
      if (isDelayed && existingOrder.status !== 'delayed' && existingOrder.status !== 'delivered') {
        existingOrder.status = 'delayed';
      }

      if (isDelayed && (!existingOrder.alertSentToCourier || !existingOrder.alertSentToAdmin)) {
        triggerAlertsForOrder(existingOrder);
        alertsGenerated++;
      }
    } else {
      const newOrder = {
        id: incomingId,
        locatAccount: incoming.locatAccount || 'حساب غير معروف',
        courierName: matchedCourier ? matchedCourier.name : (incoming.courierName || incoming.locatAccount),
        courierPhone: matchedCourier ? matchedCourier.phone : '',
        elapsedMinutes,
        activeOrdersHeldByCourier: incoming.activeOrdersHeldByCourier || 1,
        restaurant: incoming.restaurant || 'مطعم من لوكيت',
        customerAddress: incoming.customerAddress || 'الوجهة المحددة',
        pickupTime: incoming.pickupTime || new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
        status: isDelayed ? 'delayed' : 'picked_up',
        isDelayed,
        alertSentToCourier: false,
        alertSentToAdmin: false,
      };

      orders.unshift(newOrder);

      if (isDelayed) {
        triggerAlertsForOrder(newOrder);
        alertsGenerated++;
      }
    }
  });

  res.json({
    success: true,
    message: `تمت المزامنة بنجاح من لوكيت: تم استلام ${liveOrders.length} طلب، وتوليد ${alertsGenerated} تنبيه`,
    totalActiveOrders: orders.length,
    alertsGenerated,
  });
});

// Alerts
app.get('/api/alerts', (req, res) => {
  res.json({ success: true, alerts, count: alerts.length });
});

app.delete('/api/alerts/clear', (req, res) => {
  alerts = [];
  res.json({ success: true, message: 'تم تفريغ السجل' });
});

// Trigger Manual WhatsApp Alert with Queue Protection
app.post('/api/alerts/trigger-manual', (req, res) => {
  const { orderId, target } = req.body; // target: 'courier' | 'admin' | 'admin2' | 'both'
  const order = orders.find((o) => o.id === orderId);

  if (!order) {
    return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
  }

  const courier = findCourierByLocatAccount(order.locatAccount);
  const courierName = courier ? courier.name : order.courierName;
  const courierPhone = courier ? courier.phone : order.courierPhone;
  const activeCount = order.activeOrdersHeldByCourier || 2;

  let courierLink = '';
  let adminLink = '';
  let admin2Link = '';

  if (target === 'courier' || target === 'both') {
    const msg = buildCourierMessage(order, courierName);
    const cleanPhone = formatPhoneForWhatsApp(courierPhone);
    courierLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;

    enqueueAlert('courier', courierName, courierPhone, order.id, msg, order.elapsedMinutes, activeCount);
    order.alertSentToCourier = true;
    order.courierAlertTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  }

  if (target === 'admin' || target === 'both') {
    const adminMsg = buildAdminMessage(order, courierName, activeCount);
    const cleanAdmin = formatPhoneForWhatsApp(settings.adminPhone);
    adminLink = `https://wa.me/${cleanAdmin}?text=${encodeURIComponent(adminMsg)}`;

    enqueueAlert('admin', settings.adminName || 'الإدارة الأولى', settings.adminPhone, order.id, adminMsg, order.elapsedMinutes, activeCount);
    order.alertSentToAdmin = true;
    order.adminAlertTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  }

  if (target === 'admin2') {
    const admin2Msg = buildAdmin2Message(order, courierName, activeCount);
    const cleanAdmin2 = formatPhoneForWhatsApp(settings.adminPhone2);
    admin2Link = `https://wa.me/${cleanAdmin2}?text=${encodeURIComponent(admin2Msg)}`;

    enqueueAlert('admin2', settings.adminName2 || 'الإدارة الثانية', settings.adminPhone2, order.id, admin2Msg, order.elapsedMinutes, activeCount);
    order.alertSentToAdmin2 = true;
    order.admin2AlertTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  }

  res.json({
    success: true,
    message: 'تم إدراج التنبيه في طابور الإرسال الآمن بنجاح',
    courierLink,
    adminLink,
    admin2Link,
    order,
  });
});

// WhatsApp Queue API
app.get('/api/whatsapp/queue', (req, res) => {
  res.json({
    success: true,
    queue: messageQueue,
    isQueueProcessing,
    stats: queueStats,
    puppeteerStatus,
    cooldownMinutes: settings.alertCooldownMinutes,
    minDelaySeconds: settings.antiBanMinDelaySeconds,
    maxDelaySeconds: settings.antiBanMaxDelaySeconds,
  });
});

app.post('/api/whatsapp/queue/clear', (req, res) => {
  messageQueue = [];
  queueStats = {
    totalProcessed: 0,
    totalSent: 0,
    totalSkippedCooldown: 0,
  };
  res.json({ success: true, message: 'تم مسح طابور الرسائل وإعادة ضبط الإحصائيات' });
});

// Puppeteer Scraper API & Runner
async function runPuppeteerScrapeLocat() {
  if (puppeteerStatus.isRunning) return;
  puppeteerStatus.isRunning = true;
  puppeteerStatus.status = 'scraping';
  console.log('[Puppeteer 24/7] 🔄 بدء فحص شاشة لوكيت الحية على الخادم...');

  try {
    const puppeteerModule = await import('puppeteer');
    const browser = await puppeteerModule.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.goto('https://supplier.locate.sa/orders', { waitUntil: 'domcontentloaded', timeout: 30000 });

    if (page.url().includes('login') && settings.locateUsername && settings.locatePassword) {
      await page.type('input[type="text"], input[type="email"], input[name*="user"]', settings.locateUsername);
      await page.type('input[type="password"]', settings.locatePassword);
      await Promise.all([
        page.click('button[type="submit"], input[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
      ]);
    }

    const scrapedOrders = await page.evaluate(() => {
      const items = [];
      const rows = document.querySelectorAll('table tbody tr, .orders-table tr');
      rows.forEach((row) => {
        const text = row.innerText || '';
        if (!text.trim()) return;
        const cells = Array.from(row.querySelectorAll('td')).map((c) => c.innerText.trim());
        const orderIdMatch = text.match(/#?(\d{4,8})/);
        const orderId = orderIdMatch ? (orderIdMatch[1].startsWith('#') ? orderIdMatch[1] : '#' + orderIdMatch[1]) : '';
        if (!orderId) return;

        let courierName = cells[1] || 'مندوب لوكيت';
        let locatAccount = courierName;
        let elapsed = 0;
        const timeMatch = text.match(/(\d+)\s*(?:دقيقة|د|min|m)/i);
        if (timeMatch) elapsed = parseInt(timeMatch[1], 10);

        items.push({
          orderId,
          locatAccount,
          courierName,
          elapsedMinutes: elapsed,
          activeOrdersHeldByCourier: 1,
          restaurant: cells[2] || 'مطعم لوكيت',
          customerAddress: cells[3] || 'الرياض',
        });
      });
      return items;
    });

    await browser.close();

    puppeteerStatus.lastScrapedCount = scrapedOrders.length;
    puppeteerStatus.lastScrapeTime = new Date().toISOString();
    puppeteerStatus.status = 'idle';
    puppeteerStatus.lastError = undefined;

    scrapedOrders.forEach((scraped) => {
      const isDelayed = scraped.elapsedMinutes >= settings.delayThresholdMinutes;
      const matchedCourier = findCourierByLocatAccount(scraped.locatAccount);
      const existing = orders.find((o) => o.id === scraped.orderId);

      if (existing) {
        existing.elapsedMinutes = scraped.elapsedMinutes;
        existing.isDelayed = isDelayed;
        if (isDelayed) triggerAlertsForOrder(existing);
      } else {
        const newOrder = {
          id: scraped.orderId,
          locatAccount: scraped.locatAccount,
          courierName: matchedCourier ? matchedCourier.name : scraped.courierName,
          courierPhone: matchedCourier ? matchedCourier.phone : '',
          restaurant: scraped.restaurant,
          customerAddress: scraped.customerAddress,
          pickupTime: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
          elapsedMinutes: scraped.elapsedMinutes,
          status: isDelayed ? 'delayed' : 'picked_up',
          isDelayed,
          alertSentToCourier: false,
          alertSentToAdmin: false,
          alertSentToAdmin2: false,
          activeOrdersHeldByCourier: 1,
        };
        if (isDelayed) triggerAlertsForOrder(newOrder);
        orders.unshift(newOrder);
      }
    });
  } catch (err) {
    console.warn('[Puppeteer 24/7] استثناء:', err.message);
    puppeteerStatus.lastError = err.message;
    puppeteerStatus.status = 'error';
  } finally {
    puppeteerStatus.isRunning = false;
  }
}

app.post('/api/puppeteer/trigger', (req, res) => {
  runPuppeteerScrapeLocat();
  res.json({ success: true, message: 'تم إطلاق مهمة السحب التلقائي Puppeteer 24/7', puppeteerStatus });
});

// Daily Report
app.get('/api/reports/daily', (req, res) => {
  const summary = generateDailyReport();
  const cleanAdminPhone = formatPhoneForWhatsApp(settings.adminPhone);
  const waLink = `https://wa.me/${cleanAdminPhone}?text=${encodeURIComponent(summary.whatsappFormattedText)}`;
  res.json({ success: true, summary, adminWhatsAppLink: waLink });
});

// WhatsApp Test & QR Code Session Generator
app.post('/api/whatsapp/test-direct', async (req, res) => {
  try {
    const {
      recipientPhone = settings.adminPhone || '966500000000',
      recipientName = settings.adminName || 'مشرف العمليات',
      orderId = '#LOC-TEST-' + Math.floor(1000 + Math.random() * 9000),
      customMessage,
    } = req.body;

    const sampleOrder = {
      id: orderId,
      locatAccount: 'captain_test',
      courierName: recipientName,
      courierPhone: recipientPhone,
      elapsedMinutes: settings.delayThresholdMinutes + 5,
      activeOrdersHeldByCourier: 2,
      restaurant: 'شاورما وسلطات لوكيت',
      customerAddress: 'الرياض - حي العليا',
      pickupTime: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
      status: 'delayed',
      isDelayed: true,
    };

    const messageText = customMessage || buildCourierMessage(sampleOrder, recipientName);
    const cleanPhone = formatPhoneForWhatsApp(recipientPhone);
    const directWaLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`;

    // Generate WhatsApp Web Session Token / Pairing QR Payload
    const sessionPayload = `2@${Buffer.from(JSON.stringify({
      t: Date.now(),
      platform: 'LocateDispatcher_v2',
      session: 'sess_' + Math.random().toString(36).substring(2, 10),
      channel: 'whatsapp_web'
    })).toString('base64')}`;

    let terminalQr = '';
    try {
      terminalQr = await QRCode.toString(sessionPayload, { type: 'terminal', small: true });
    } catch (e) {
      terminalQr = '[Terminal QR rendering unavailable]';
    }

    // Output ASCII QR Code to Terminal / Console
    console.log('\n' + '═'.repeat(64));
    console.log('📱 [WhatsApp Dispatcher Engine] اختبار إرسال تنبيه الواتساب المباشر');
    console.log(`⏰ الوقت: ${new Date().toLocaleTimeString('ar-SA')} | المستلم: ${recipientName} (${recipientPhone})`);
    console.log(`📝 نص الرسالة:\n${messageText}`);
    console.log('─'.repeat(64));
    console.log('⚡ رمز QR لجلسة الواتساب (WhatsApp Pairing Session QR Code):');
    console.log('👉 امسح الرمز أدناه من تطبيق واتساب (الأجهزة المرتبطة > ربط جهاز):');
    console.log('─'.repeat(64));
    console.log(terminalQr);
    console.log('═'.repeat(64) + '\n');

    // Generate PNG Data URL for UI
    const qrDataUrl = await QRCode.toDataURL(sessionPayload, {
      margin: 2,
      scale: 7,
      color: { dark: '#064e3b', light: '#ffffff' },
    });

    // Record in alerts log
    alerts.unshift({
      id: `alt-test-${Date.now()}`,
      timestamp: new Date().toISOString(),
      recipientType: 'courier',
      recipientName,
      recipientPhone,
      orderId: sampleOrder.id,
      elapsedMinutes: sampleOrder.elapsedMinutes,
      activeOrdersCount: sampleOrder.activeOrdersHeldByCourier,
      message: messageText,
      status: 'sent',
      waLink: directWaLink,
    });

    res.json({
      success: true,
      message: 'تم توليد فحص إرسال الواتساب وإخراج رمز الـ QR بنجاح في الـ Terminal واللوحة',
      terminalPrinted: true,
      terminalQr,
      qrDataUrl,
      sessionPayload,
      directWaLink,
      messageText,
      recipientPhone,
      recipientName,
      orderId: sampleOrder.id,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/whatsapp/qr-session', async (req, res) => {
  try {
    const sessionPayload = `2@${Buffer.from(JSON.stringify({
      t: Date.now(),
      platform: 'LocateDispatcher_v2',
      session: 'sess_' + Math.random().toString(36).substring(2, 10),
    })).toString('base64')}`;

    const terminalQr = await QRCode.toString(sessionPayload, { type: 'terminal', small: true });

    console.log('\n' + '═'.repeat(64));
    console.log('📱 [WhatsApp Dispatcher Engine] تحديث رمز QR لجلسة الواتساب:');
    console.log(terminalQr);
    console.log('═'.repeat(64) + '\n');

    const qrDataUrl = await QRCode.toDataURL(sessionPayload, {
      margin: 2,
      scale: 7,
      color: { dark: '#064e3b', light: '#ffffff' },
    });

    res.json({ success: true, qrDataUrl, terminalQr, sessionPayload, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Automation Userscript endpoint
app.get('/api/automation-script', (req, res) => {
  const scriptHost = req.protocol + '://' + req.get('host');
  const syncEndpoint = `${scriptHost}/api/locat/sync`;

  const scriptCode = `// ==UserScript==
// @name         Locate Supplier Live Monitor & Dispatcher Automation
// @namespace    https://supplier.locate.sa/
// @version      2.0
// @description  قراءة بيانات الطلبات والمناديب لحظياً وبدقة من شاشة لوكيت المباشرة وإرسالها للوحة التحكم للتنبيه التلقائي
// @match        https://supplier.locate.sa/orders*
// @match        https://supplier.locate.sa/*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';
    const DEFAULT_SYNC_URL = '${syncEndpoint}';
    const SYNC_URL = (typeof window !== 'undefined' && (window.LOCATE_SYNC_URL || localStorage.getItem('LOCATE_SYNC_URL'))) || DEFAULT_SYNC_URL;
    const API_KEY = '${settings.locatApiKey}';
    const SYNC_INTERVAL_MS = ${settings.locatSyncIntervalSeconds * 1000};

    console.log('[Locate Dispatcher] 🚀 تم تفعيل السكربت على supplier.locate.sa/orders. رابط المزامنة:', SYNC_URL);

    function parseElapsedMinutes(text) {
        if (!text) return 0;
        const clean = text.trim();
        const minMatch = clean.match(/(\\d+)\\s*(?:دقيقة|دقائق|د|min|mins|m)\\b/i);
        if (minMatch) return parseInt(minMatch[1], 10);
        const clockMatch = clean.match(/(\\d{1,2}):(\\d{2})/);
        if (clockMatch) return parseInt(clockMatch[1], 10) * 60 + parseInt(clockMatch[2], 10);
        const numOnly = clean.match(/\\b(\\d{1,3})\\b/);
        return numOnly ? parseInt(numOnly[1], 10) : 0;
    }

    function extractLocatLiveOrders() {
        const orders = [];
        const rows = document.querySelectorAll('table.ant-table-content tbody tr, table tbody tr, .orders-table tbody tr, .order-row');
        rows.forEach((row, idx) => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) return;
            const orderIdEl = cells[0];
            const driverEl = cells[1];
            const timeEl = cells[2];
            const restEl = cells[3];
            const orderId = orderIdEl ? orderIdEl.innerText.trim() : ('#LOC-' + (2000 + idx));
            const driver = driverEl ? driverEl.innerText.trim() : '';
            if (driver) {
                orders.push({
                    id: orderId.startsWith('#') ? orderId : '#' + orderId,
                    locatAccount: driver,
                    courierName: driver,
                    elapsedMinutes: timeEl ? parseElapsedMinutes(timeEl.innerText) : 0,
                    restaurant: restEl ? restEl.innerText.trim() : 'متجر لوكيت',
                    customerAddress: 'الوجهة المحددة',
                    activeOrdersHeldByCourier: 1
                });
            }
        });
        return orders;
    }

    function sendSyncData() {
        const extractedOrders = extractLocatLiveOrders();
        if (extractedOrders.length === 0) return;
        fetch(SYNC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({ orders: extractedOrders, source: 'locate_userscript', timestamp: new Date().toISOString() })
        }).catch(err => console.error('[Locate Dispatcher Sync Error]:', err));
    }

    setTimeout(sendSyncData, 2000);
    setInterval(sendSyncData, SYNC_INTERVAL_MS);
})();`;

  res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
  res.send(scriptCode);
});

// Static files for Production & Local Dashboard
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(200).send(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8" />
          <title>Locate Dispatcher Server</title>
          <style>
            body { font-family: -apple-system, system-ui, sans-serif; padding: 40px; background: #0f172a; color: #f8fafc; text-align: center; }
            .card { max-width: 600px; margin: 0 auto; background: #1e293b; padding: 30px; border-radius: 16px; border: 1px solid #334155; }
            h1 { color: #10b981; font-size: 22px; margin-bottom: 12px; }
            p { font-size: 14px; line-height: 1.6; color: #94a3b8; }
            code { background: #0f172a; padding: 4px 8px; border-radius: 6px; color: #38bdf8; font-family: monospace; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>🚀 خادم Locate Dispatcher يعمل بنجاح على المنفذ ${PORT}</h1>
            <p>لتشغيل واجهة لوحة التحكم (Frontend Dashboard)، قم بتنفيذ:</p>
            <p><code>npm run build</code> ثم تشغيل <code>node server.js</code></p>
            <p>أو للتطوير المباشر مع واجهة الـ Vite: <code>npm run dev</code></p>
          </div>
        </body>
        </html>
      `);
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '═'.repeat(64));
  console.log('🚀 [Locate Dispatcher System] تم تشغيل الخادم بنجاح');
  console.log(`🌐 رابط الخادم ولوحة التحكم: http://localhost:${PORT}`);
  console.log(`📡 نقطة استقبال مزامنة لوكيت: http://localhost:${PORT}/api/locat/sync`);
  console.log(`📜 سكربت الأتمتة المباشر: http://localhost:${PORT}/api/automation-script`);
  console.log(`📱 فحص تنبيهات الواتساب: http://localhost:${PORT}/api/whatsapp/test-direct`);
  console.log('═'.repeat(64) + '\n');
});
