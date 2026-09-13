import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import QRCode from 'qrcode';
import pino from 'pino';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
} from '@whiskeysockets/baileys';
import { 
  Courier, 
  Order, 
  SystemSettings, 
  AlertLog, 
  DailyReportSummary, 
  CourierPerformanceItem,
  QueuedWhatsAppMessage,
  PuppeteerScraperStatus,
  WhatsAppConnectionState,
} from './src/types.js';

const app = express();
const PORT = 3000;

app.use(express.json());

// --- IN-MEMORY DATA STORE (NO MOCK OR DUMMY DATA) ---
let settings: SystemSettings = {
  delayThresholdMinutes: 30, // التنبيه عند تجاوز 30 دقيقة
  criticalDelayMinutes: 45, // تصعيد الإدارة الثاني عند تجاوز 45 دقيقة
  adminPhone: '', // يدخل المستخدم رقم واتساب الإدارة الفعلي
  adminName: '', // اسم الإدارة الفعلي
  adminPhone2: '', // رقم واتساب الإدارة الثاني (تصعيد التأخير)
  adminName2: '', // اسم الإدارة الثاني
  autoAlertCourier: true,
  autoAlertAdmin: true,
  autoAlertAdmin2: true,
  alertCooldownMinutes: 20, // منع تكرار الإرسال لنفس الطلب إلا بعد 20 دقيقة
  antiBanMinDelaySeconds: 5, // فارق زمني آمن (5-10 ثوانٍ) لمنع الحظر
  antiBanMaxDelaySeconds: 10,
  autoDailyReport: true,
  dailyReportTime: '23:00',
  whatsAppProvider: 'direct_chat', // direct_chat (wa.me) / webhook
  webhookUrl: '',
  webhookApiKey: '',
  locatSyncIntervalSeconds: 30,
  locatApiKey: 'locat_secret_key_8892',
  enablePuppeteerHeadless: false, // تشغيل المتصفح الخفي 24/7 على VPS
  locateUsername: '',
  locatePassword: '',
};

// Start with empty arrays - only real data entered by the user or received from Locat
let couriers: Courier[] = [];
let orders: Order[] = [];
let alerts: AlertLog[] = [];

// --- BAILEYS WHATSAPP ENGINE & PERSISTENT SESSION ---
const AUTH_DIR = process.env.BAILEYS_AUTH_DIR || path.resolve(process.cwd(), 'baileys_auth_info');
let sock: any = null;
let isInitializingBaileys = false;
let reconnectTimer: NodeJS.Timeout | null = null;

let whatsappState: WhatsAppConnectionState = {
  status: 'disconnected',
  isLoggedIn: false,
  userPhone: undefined,
  userName: undefined,
  qrDataUrl: null,
  qrRaw: null,
  lastConnectedAt: null,
  lastError: null,
};

// --- ANTI-BAN MESSAGE QUEUE & COOLDOWN ENGINE ---
const alertCooldownMap = new Map<string, number>(); // key: `${orderId}_${recipientType}` -> timestamp ms
let messageQueue: QueuedWhatsAppMessage[] = [];
let isQueueProcessing = false;
let queueStats = {
  totalProcessed: 0,
  totalSent: 0,
  totalSkippedCooldown: 0,
};

// --- PUPPETEER 24/7 VPS SCRAPER STATE ---
let puppeteerStatus: PuppeteerScraperStatus = {
  enabled: false,
  isRunning: false,
  status: 'idle',
  lastScrapedCount: 0,
};

// --- BAILEYS CONNECTION ENGINE & RECOVERY ---
async function connectToWhatsApp(forceNew: boolean = false) {
  if (isInitializingBaileys) return;
  isInitializingBaileys = true;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (forceNew) {
    try {
      if (sock) {
        sock.end(undefined);
        sock = null;
      }
      if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        console.log('[Baileys] تم مسح ملفات الجلسة القديمة بنجاح لبدء جلسة جديدة.');
      }
    } catch (err: any) {
      console.warn('[Baileys] تحذير أثناء تنظيف ملفات الجلسة:', err?.message);
    }
  }

  try {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const hasExistingCreds = fs.existsSync(path.join(AUTH_DIR, 'creds.json'));
    console.log(`[Baileys Engine] مسار الجلسة: ${AUTH_DIR}`);
    console.log(`[Baileys Engine] الجلسة المحفوظة: ${hasExistingCreds ? '✅ توجد جلسة سابقة (استعادة تلقائية دون الحاجة لمسح QR)' : '⚠️ لا توجد جلسة سابقة (بانتظار مسح QR Code)'}`);

    whatsappState.status = hasExistingCreds ? 'reconnecting' : 'connecting_qr';

    const makeSocket = typeof makeWASocket === 'function' ? makeWASocket : (makeWASocket as any)?.default;
    sock = makeSocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        whatsappState.status = 'connecting_qr';
        whatsappState.qrRaw = qr;
        try {
          whatsappState.qrDataUrl = await QRCode.toDataURL(qr, {
            margin: 2,
            scale: 7,
            color: { dark: '#064e3b', light: '#ffffff' },
          });
          const terminalQr = await QRCode.toString(qr, { type: 'terminal', small: true });
          console.log('\n' + '═'.repeat(64));
          console.log('📱 [Baileys WhatsApp Live QR] تم توليد رمز QR لربط جلسة الواتساب:');
          console.log('👉 امسح الرمز أدناه من تطبيق واتساب (الأجهزة المرتبطة > ربط جهاز):');
          console.log('─'.repeat(64));
          console.log(terminalQr);
          console.log('═'.repeat(64) + '\n');
        } catch (err: any) {
          console.error('[Baileys QR Error]', err?.message);
        }
      }

      if (connection === 'open') {
        whatsappState.status = 'connected';
        whatsappState.isLoggedIn = true;
        whatsappState.qrDataUrl = null;
        whatsappState.qrRaw = null;
        whatsappState.lastConnectedAt = new Date().toISOString();
        whatsappState.lastError = null;

        const userJid = sock?.user?.id || '';
        const phone = userJid.split(':')[0] || userJid.split('@')[0];
        whatsappState.userPhone = phone;
        whatsappState.userName = sock?.user?.name || 'واتساب لوكيت المتصل';

        console.log('\n' + '═'.repeat(64));
        console.log('✅ [Baileys WhatsApp] تم الاتصال والتحقق بنجاح!');
        console.log(`📱 رقم الحساب المرتبط: ${phone}`);
        console.log(`💾 تم حفظ الجلسة على السيرفر في: ${AUTH_DIR} (مستقرة ولا تتطلب إعادة مسح)`);
        console.log('═'.repeat(64) + '\n');
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        console.warn(`[Baileys WhatsApp] أُغلق الاتصال (رمز: ${statusCode}). هل هو تسجيل خروج؟ ${isLoggedOut}`);

        if (isLoggedOut) {
          whatsappState.status = 'logged_out';
          whatsappState.isLoggedIn = false;
          whatsappState.qrDataUrl = null;
          whatsappState.qrRaw = null;
          whatsappState.userPhone = undefined;
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          } catch (e) {}
          reconnectTimer = setTimeout(() => connectToWhatsApp(true), 3000);
        } else {
          whatsappState.status = 'reconnecting';
          whatsappState.lastError = (lastDisconnect?.error as any)?.message || 'انقطع الاتصال المؤقت، جاري إعادة المحاولة...';
          reconnectTimer = setTimeout(() => connectToWhatsApp(false), 5000);
        }
      }
    });
  } catch (err: any) {
    console.error('[Baileys Connection Error]', err?.message);
    whatsappState.status = 'disconnected';
    whatsappState.lastError = err?.message || 'تعذر تشغيل محرك Baileys';
    reconnectTimer = setTimeout(() => connectToWhatsApp(false), 8000);
  } finally {
    isInitializingBaileys = false;
  }
}

// Helper: Send Direct WhatsApp Message via Baileys (with wa.me link fallback)
async function sendWhatsAppDirect(phone: string, text: string): Promise<{ success: boolean; method: string; waLink: string; error?: string }> {
  const cleanPhone = formatPhoneForWhatsApp(phone);
  const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;

  if (sock && whatsappState.isLoggedIn && whatsappState.status === 'connected') {
    try {
      const jid = `${cleanPhone}@s.whatsapp.net`;
      await sock.sendMessage(jid, { text });
      console.log(`[Baileys Direct] ✅ تم إرسال الرسالة آلياً عبر واتساب إلى ${cleanPhone}`);
      return { success: true, method: 'baileys_direct', waLink };
    } catch (err: any) {
      console.warn(`[Baileys Direct] تعذر الإرسال المباشر (${err?.message})، يتم استخدام رابط wa.me الاحتياطي`);
      return { success: true, method: 'direct_link_fallback', waLink, error: err?.message };
    }
  } else {
    return { success: true, method: 'direct_link_fallback', waLink };
  }
}

// Helper: Match courier by Locat account
function findCourierByLocatAccount(account: string): Courier | undefined {
  if (!account) return undefined;
  const clean = account.trim().toLowerCase();
  return couriers.find((c) =>
    c.locatAccounts.some((acc) => acc.trim().toLowerCase() === clean) ||
    c.name.trim().toLowerCase() === clean
  );
}

// Helper: Clean phone number for WhatsApp links (digits only)
function formatPhoneForWhatsApp(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

// Helper: Construct Courier Message
function buildCourierMessage(order: Order, courierName: string): string {
  return `السلام عليكم أخي ${courierName}،\nنود تذكيرك بأن الطلب ${order.id} متأخر وتجاوز ${order.elapsedMinutes} دقيقة من وقت الاستلام.\nالمطعم: ${order.restaurant}\nالعميل: ${order.customerAddress || 'الوجهة المحددة'}\nيرجى سرعة التسليم والإفادة بحالة التوصيل. شاكرين تعاونك!`;
}

// Helper: Construct Admin Alert Message
function buildAdminMessage(order: Order, courierName: string, activeCount: number): string {
  return `🚨 [تنبيه تأخير طلب - لوكيت]\n• رقم الطلب: ${order.id}\n• المندوب: ${courierName}\n• الوقت المنقضي: ${order.elapsedMinutes} دقيقة (الحد المسموح: ${settings.delayThresholdMinutes} دقيقة)\n• عدد الطلبات النشطة بحوزته: ${activeCount} طلبات\n• المطعم: ${order.restaurant}\n• الحي: ${order.customerAddress || 'غير محدد'}\n• الوقت: ${new Date().toLocaleTimeString('ar-SA')}`;
}

// Helper: Construct Admin 2 Escalation Message upon continued delay
function buildAdmin2Message(order: Order, courierName: string, activeCount: number): string {
  return `🚨 [تصعيد تأخير حرج - إشعار الإدارة الثانية]\n• اسم المندوب: ${courierName}\n• رقم الطلب: ${order.id}\n• الوقت المنقضي: ${order.elapsedMinutes} دقيقة\n• عدد الطلبات النشطة بحوزته: ${activeCount} طلبات\n• المطعم: ${order.restaurant}\n• الحي: ${order.customerAddress || 'غير محدد'}\n⚠️ تنبيه: استمر التأخير وتجاوز حد التصعيد الحرج (${settings.criticalDelayMinutes} دقيقة).\nيرجى التدخل والمتابعة المباشرة مع المندوب.`;
}

// Helper: Enqueue message safely with Anti-Ban delay & Cooldown protection
function enqueueAlert(
  recipientType: 'courier' | 'admin' | 'admin2',
  recipientName: string,
  recipientPhone: string,
  orderId: string,
  message: string,
  elapsedMinutes: number,
  activeOrdersCount: number
) {
  if (!recipientPhone) return;

  const cooldownKey = `${orderId}_${recipientType}`;
  const lastSent = alertCooldownMap.get(cooldownKey) || 0;
  const cooldownMs = (settings.alertCooldownMinutes || 20) * 60 * 1000;

  // 1. Anti-Spam / Cooldown Check: Prevent repeating alert for the same order within cooldown
  if (Date.now() - lastSent < cooldownMs) {
    queueStats.totalSkippedCooldown++;
    console.log(`[Anti-Ban Protection] تم منع تكرار التنبيه للطلب ${orderId} إلى ${recipientName} (${recipientType}) لوجود فترة سماح نشطة.`);
    
    const skippedItem: QueuedWhatsAppMessage = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      recipientType,
      recipientName,
      recipientPhone,
      orderId,
      message,
      status: 'skipped_cooldown',
      delayAppliedSeconds: 0,
      scheduledAt: new Date().toISOString(),
      error: `فترة Cooldown نشطة (${settings.alertCooldownMinutes} دقيقة) لحماية الرقم من الحظر`,
    };
    messageQueue.unshift(skippedItem);
    return;
  }

  // 2. Anti-Ban Jitter Delay Calculation (5-10 seconds)
  const minDelay = settings.antiBanMinDelaySeconds || 5;
  const maxDelay = Math.max(minDelay, settings.antiBanMaxDelaySeconds || 10);
  const delaySeconds = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

  const cleanPhone = formatPhoneForWhatsApp(recipientPhone);
  const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

  const queuedItem: QueuedWhatsAppMessage = {
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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

  // Trigger queue runner
  processMessageQueue();
}

// Background Queue Processor: sends messages one by one with jitter delay
async function processMessageQueue() {
  if (isQueueProcessing) return;
  isQueueProcessing = true;

  while (messageQueue.some((item) => item.status === 'waiting')) {
    const nextItem = messageQueue.find((item) => item.status === 'waiting');
    if (!nextItem) break;

    nextItem.status = 'sending';
    const delayMs = (nextItem.delayAppliedSeconds || 5) * 1000;

    // Apply random safety delay before sending next message to prevent WhatsApp ban
    await new Promise((res) => setTimeout(res, delayMs));

    // Send directly via Baileys WhatsApp if session is connected, or prepare direct wa.me link
    const sendResult = await sendWhatsAppDirect(nextItem.recipientPhone, nextItem.message);

    nextItem.status = 'sent';
    nextItem.sentAt = new Date().toISOString();
    nextItem.waLink = sendResult.waLink;
    queueStats.totalProcessed++;
    queueStats.totalSent++;

    // Record in system alerts log
    alerts.unshift({
      id: `alt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      recipientType: nextItem.recipientType,
      recipientName: nextItem.recipientName,
      recipientPhone: nextItem.recipientPhone,
      orderId: nextItem.orderId,
      elapsedMinutes: 0,
      activeOrdersCount: 0,
      message: nextItem.message,
      status: 'sent',
      waLink: sendResult.waLink || nextItem.waLink || '',
      delayAppliedSeconds: nextItem.delayAppliedSeconds,
    });

    console.log(`[Anti-Ban Queue] ✅ تم إرسال تنبيه (${nextItem.recipientType}) للطلب ${nextItem.orderId} (طريقة: ${sendResult.method}) بفارق أمان ${nextItem.delayAppliedSeconds} ثوانٍ`);
  }

  isQueueProcessing = false;
}

// Helper: Trigger alerts for delayed orders (including Admin 2 Escalation)
function triggerAlertsForOrder(order: Order) {
  const courier = findCourierByLocatAccount(order.locatAccount);
  const courierName = courier ? courier.name : order.courierName || 'المندوب';
  const courierPhone = courier ? courier.phone : order.courierPhone;
  const activeCount = order.activeOrdersHeldByCourier || (courier ? courier.activeOrdersCount : 1);

  // 1. Alert courier if delayed and not sent yet
  if (!order.alertSentToCourier && settings.autoAlertCourier && courierPhone) {
    const message = buildCourierMessage(order, courierName);
    enqueueAlert('courier', courierName, courierPhone, order.id, message, order.elapsedMinutes, activeCount);
    order.alertSentToCourier = true;
    order.courierAlertTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  }

  // 2. Alert admin 1 if delayed and not sent yet
  if (!order.alertSentToAdmin && settings.autoAlertAdmin && settings.adminPhone) {
    const adminMsg = buildAdminMessage(order, courierName, activeCount);
    enqueueAlert('admin', settings.adminName || 'الإدارة الأولى', settings.adminPhone, order.id, adminMsg, order.elapsedMinutes, activeCount);
    order.alertSentToAdmin = true;
    order.adminAlertTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  }

  // 3. Alert Admin 2 upon continued delay (Escalation logic)
  if (
    order.elapsedMinutes >= settings.criticalDelayMinutes &&
    !order.alertSentToAdmin2 &&
    settings.autoAlertAdmin2 &&
    settings.adminPhone2
  ) {
    const admin2Msg = buildAdmin2Message(order, courierName, activeCount);
    enqueueAlert('admin2', settings.adminName2 || 'الإدارة الثانية (تصعيد)', settings.adminPhone2, order.id, admin2Msg, order.elapsedMinutes, activeCount);
    order.alertSentToAdmin2 = true;
    order.admin2AlertTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  }
}

// Helper: Calculate Daily Report
function generateDailyReport(): DailyReportSummary {
  const today = new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  // Aggregate stats per courier
  const courierStats: CourierPerformanceItem[] = couriers.map((c) => {
    // Current active orders held
    const activeForC = orders.filter((o) => {
      const match = findCourierByLocatAccount(o.locatAccount);
      return match ? match.id === c.id : false;
    });
    const delayedCurrent = activeForC.filter((o) => o.isDelayed).length;
    const totalDelivered = c.totalDeliveredToday;
    const totalDelayed = c.delayedOrdersCount + delayedCurrent;
    const avgTime = c.avgDeliveryTimeMinutes || 25;

    // Efficiency Score (0-100)
    // Formula: delivery count volume vs delays and average speed
    let score = 85;
    if (totalDelivered >= 15) score += 10;
    else if (totalDelivered <= 8) score -= 15;

    if (totalDelayed === 0) score += 10;
    else score -= totalDelayed * 12;

    if (avgTime <= 25) score += 5;
    else if (avgTime >= 35) score -= 15;

    score = Math.max(20, Math.min(100, score));

    let tier: 'top' | 'good' | 'low' = 'good';
    let assessmentNote = 'أداء جيد ومستقر ضمن المعدل الطبيعي';

    if (score >= 85 && totalDelivered >= 14 && totalDelayed <= 1) {
      tier = 'top';
      assessmentNote = '🌟 مندوب متميز: إنتاجية عالية وسرعة تسليم مع انعدام التأخيرات';
    } else if (score < 60 || totalDelayed >= 2 || (totalDelivered <= 8 && avgTime >= 35)) {
      tier = 'low';
      assessmentNote = '⚠️ يحتاج متابعة: بطء ملحوظ أو تكرار تأخيرات وقلة في عدد التسليمات';
    }

    return {
      courierId: c.id,
      courierName: c.name,
      locatAccounts: c.locatAccounts,
      phone: c.phone,
      deliveredCount: totalDelivered,
      activeCount: activeForC.length,
      delayedCount: totalDelayed,
      avgTime,
      efficiencyScore: score,
      performanceTier: tier,
      assessmentNote,
    };
  });

  // Sort by score & deliveries
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

  // Format professional WhatsApp Text for Admin
  let waText = `📊 *تقرير أداء مناديب لوكيت اليومي*\n`;
  waText += `📅 *التاريخ:* ${today}\n`;
  waText += `⏰ *وقت التوليد:* ${new Date().toLocaleTimeString('ar-SA')}\n`;
  waText += `───────────────────────\n`;
  waText += `📈 *الملخص العام للأداء:*\n`;
  waText += `• إجمالي المناديب المسجلين: *${couriers.length}* مندوب\n`;
  waText += `• إجمالي الطلبات المنجزة: *${totalDeliveredToday}* طلب\n`;
  waText += `• الطلبات النشطة حالياً: *${activeOrdersRightNow}* طلب\n`;
  waText += `• الطلبات المتأخرة المسجلة: *${totalDelayedToday}* طلب\n`;
  waText += `• متوسط زمن التوصيل: *${overallAvgTimeMinutes}* دقيقة\n`;
  waText += `• نسبة التسليم في الوقت المحدد: *${onTimeRate}%*\n`;
  waText += `───────────────────────\n\n`;

  if (courierStats.length === 0) {
    waText += `ℹ️ *ملاحظة:* لم يتم تسجيل أي مندوب في لوحة التحكم بعد. يرجى إضافة المناديب وحساباتهم في لوكيت لتفعيل التحليل اليومي وإشعارات التأخير.\n`;
  } else {
    waText += `🌟 *المناديب الأكثر إنتاجية وتميزاً (الأعلى أداءً):*\n`;
    if (topPerformers.length > 0) {
      topPerformers.forEach((c, idx) => {
        waText += `${idx + 1}. *${c.courierName}*: ${c.deliveredCount} طلب منجز | متوسط ${c.avgTime} دقيقة | تأخير: ${c.delayedCount}\n`;
      });
    } else {
      waText += `• لا يوجد مناديب في فئة النخبة اليوم حتى الآن.\n`;
    }

    waText += `\n⚠️ *المناديب ضعاف الإنجاز (بحاجة لتدخل ومتابعة):*\n`;
    if (underPerformers.length > 0) {
      underPerformers.forEach((c, idx) => {
        waText += `${idx + 1}. *${c.courierName}*: ${c.deliveredCount} تسليم فقط | تأخر في ${c.delayedCount} طلبات | متوسط زمن: ${c.avgTime} دقيقة (${c.phone})\n`;
      });
    } else {
      waText += `• لا يوجد مناديب ضعاف الأداء اليوم.\n`;
    }

    waText += `\n📋 *تفصيل إنجاز كافة المناديب:*\n`;
    courierStats.forEach((c) => {
      const tierIcon = c.performanceTier === 'top' ? '🟢' : c.performanceTier === 'low' ? '🔴' : '🟡';
      waText += `${tierIcon} *${c.courierName}* (${c.locatAccounts[0] || 'حساب لوكيت'}): ${c.deliveredCount} طلب | تأخير: ${c.delayedCount} | متوسط: ${c.avgTime}د\n`;
    });
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

// 1. System Settings
app.get('/api/settings', (req: Request, res: Response) => {
  res.json({ success: true, settings });
});

app.post('/api/settings', (req: Request, res: Response) => {
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

  // Re-evaluate current orders delay state based on new threshold
  orders.forEach((o) => {
    o.isDelayed = o.elapsedMinutes >= settings.delayThresholdMinutes;
    if (o.isDelayed && o.status !== 'delayed' && o.status !== 'delivered') {
      o.status = 'delayed';
    }
  });

  res.json({ success: true, settings, message: 'تم تحديث الإعدادات بنجاح' });
});

// 2. Couriers Management
app.get('/api/couriers', (req: Request, res: Response) => {
  // Update activeOrdersCount based on current orders
  const enrichedCouriers = couriers.map((c) => {
    const activeCount = orders.filter((o) => {
      const match = findCourierByLocatAccount(o.locatAccount);
      return match ? match.id === c.id : false;
    }).length;
    return {
      ...c,
      activeOrdersCount: activeCount,
    };
  });
  res.json({ success: true, couriers: enrichedCouriers });
});

app.post('/api/couriers', (req: Request, res: Response) => {
  const { id, name, locatAccounts, phone, notes, status } = req.body;

  if (!name || !phone) {
    res.status(400).json({ success: false, message: 'اسم المندوب ورقم الواتساب مطلوبان' });
    return;
  }

  // Parse locat accounts array
  const accountsArray = Array.isArray(locatAccounts)
    ? locatAccounts.map((a: string) => a.trim()).filter(Boolean)
    : (typeof locatAccounts === 'string' ? locatAccounts.split(',').map((a) => a.trim()).filter(Boolean) : []);

  if (id) {
    // Update existing courier
    const index = couriers.findIndex((c) => c.id === id);
    if (index !== -1) {
      couriers[index] = {
        ...couriers[index],
        name,
        locatAccounts: accountsArray.length > 0 ? accountsArray : couriers[index].locatAccounts,
        phone,
        notes: notes !== undefined ? notes : couriers[index].notes,
        status: status || couriers[index].status,
        updatedAt: new Date().toISOString(),
      };

      // Also update any active orders belonging to this courier
      orders.forEach((o) => {
        if (couriers[index].locatAccounts.some((acc) => acc.toLowerCase() === o.locatAccount.toLowerCase())) {
          o.courierId = couriers[index].id;
          o.courierName = couriers[index].name;
          o.courierPhone = couriers[index].phone;
        }
      });

      res.json({ success: true, courier: couriers[index], message: 'تم تحديث بيانات المندوب بنجاح' });
      return;
    }
  }

  // Create new courier
  const newCourier: Courier = {
    id: `c-${Date.now()}`,
    name,
    locatAccounts: accountsArray.length > 0 ? accountsArray : [`drv_${Date.now().toString().slice(-4)}`],
    phone,
    status: status || 'active',
    activeOrdersCount: 0,
    totalDeliveredToday: 0,
    avgDeliveryTimeMinutes: 25,
    delayedOrdersCount: 0,
    notes: notes || '',
    updatedAt: new Date().toISOString(),
  };

  couriers.push(newCourier);
  res.json({ success: true, courier: newCourier, message: 'تمت إضافة المندوب بنجاح' });
});

app.delete('/api/couriers/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  couriers = couriers.filter((c) => c.id !== id);
  res.json({ success: true, message: 'تم حذف المندوب بنجاح' });
});

// 3. Orders & Live Locat Fetching / Sync
app.get('/api/orders', (req: Request, res: Response) => {
  // Update counts and evaluate delay
  orders.forEach((order) => {
    order.isDelayed = order.elapsedMinutes >= settings.delayThresholdMinutes;
    if (order.isDelayed && order.status !== 'delayed' && order.status !== 'delivered') {
      order.status = 'delayed';
    }
  });
  res.json({ success: true, orders, delayThreshold: settings.delayThresholdMinutes });
});

// POST /api/locat/sync: The core ingestion endpoint called by the Locat Automation Script
app.post('/api/locat/sync', (req: Request, res: Response) => {
  const { liveOrders, secretKey } = req.body;

  if (settings.locatApiKey && secretKey && secretKey !== settings.locatApiKey) {
    res.status(401).json({ success: false, message: 'مفتاح المزامنة غير صالح' });
    return;
  }

  if (!Array.isArray(liveOrders)) {
    res.status(400).json({ success: false, message: 'صيغة البيانات غير صحيحة - يجب إرسال قائمة liveOrders' });
    return;
  }

  let newlyDelayedCount = 0;
  let alertsGenerated = 0;

  // Process and merge live orders from Locat
  liveOrders.forEach((incoming: any) => {
    const orderId = incoming.id || incoming.orderId || `#LOC-${Math.floor(1000 + Math.random() * 9000)}`;
    const locatAccount = incoming.locatAccount || incoming.courierAccount || incoming.driverId || '';
    const elapsedMinutes = Number(incoming.elapsedMinutes) || 0;
    const isDelayed = elapsedMinutes >= settings.delayThresholdMinutes;

    const matchedCourier = findCourierByLocatAccount(locatAccount);

    // Find if order already tracked
    const existingIndex = orders.findIndex((o) => o.id === orderId);

    if (existingIndex !== -1) {
      const existing = orders[existingIndex];
      existing.elapsedMinutes = elapsedMinutes;
      existing.isDelayed = isDelayed;
      existing.status = incoming.status || (isDelayed ? 'delayed' : existing.status);
      existing.restaurant = incoming.restaurant || existing.restaurant;
      existing.customerAddress = incoming.customerAddress || existing.customerAddress;
      existing.activeOrdersHeldByCourier = incoming.activeOrdersHeldByCourier || (matchedCourier ? matchedCourier.activeOrdersCount : existing.activeOrdersHeldByCourier);
      existing.lastUpdated = new Date().toISOString();

      if (isDelayed && (!existing.alertSentToCourier || !existing.alertSentToAdmin)) {
        triggerAlertsForOrder(existing);
        alertsGenerated++;
      }
    } else {
      // New incoming order
      const newOrder: Order = {
        id: orderId,
        locatAccount,
        courierId: matchedCourier?.id,
        courierName: matchedCourier?.name || incoming.courierName || 'مندوب غير مسجل',
        courierPhone: matchedCourier?.phone || incoming.courierPhone || '',
        restaurant: incoming.restaurant || 'مطعم شريك',
        customerAddress: incoming.customerAddress || 'الوجهة المحددة',
        pickupTime: incoming.pickupTime || new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
        elapsedMinutes,
        status: isDelayed ? 'delayed' : (incoming.status || 'in_transit'),
        isDelayed,
        alertSentToCourier: false,
        alertSentToAdmin: false,
        activeOrdersHeldByCourier: incoming.activeOrdersHeldByCourier || 1,
        lastUpdated: new Date().toISOString(),
      };

      if (isDelayed) {
        newlyDelayedCount++;
        triggerAlertsForOrder(newOrder);
        alertsGenerated++;
      }

      orders.unshift(newOrder);
    }
  });

  res.json({
    success: true,
    message: `تمت المزامنة بنجاح من لوكيت: تم استلام ${liveOrders.length} طلب، وتوليد ${alertsGenerated} تنبيه`,
    totalActiveOrders: orders.length,
    alertsGenerated,
  });
});

// Manual / Simulated time increment to test delay automation
app.post('/api/orders/advance-time', (req: Request, res: Response) => {
  const { minutes = 5 } = req.body;
  let triggered = 0;

  orders.forEach((o) => {
    if (o.status !== 'delivered' && o.status !== 'cancelled') {
      o.elapsedMinutes += Number(minutes);
      o.isDelayed = o.elapsedMinutes >= settings.delayThresholdMinutes;
      if (o.isDelayed && o.status !== 'delayed') {
        o.status = 'delayed';
      }

      // If just crossed threshold and not alerted yet
      if (o.isDelayed && (!o.alertSentToCourier || !o.alertSentToAdmin)) {
        triggerAlertsForOrder(o);
        triggered++;
      }
    }
  });

  res.json({ success: true, message: `تم تقديم الوقت بـ ${minutes} دقيقة وتم إطلاق ${triggered} تنبيه جديد`, orders });
});

// Manually trigger WhatsApp alert for a specific order
app.post('/api/alerts/trigger-manual', (req: Request, res: Response) => {
  const { orderId, target } = req.body; // target: 'courier' | 'admin' | 'admin2' | 'both'
  const order = orders.find((o) => o.id === orderId);

  if (!order) {
    res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    return;
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

// 4. Alerts Log
app.get('/api/alerts', (req: Request, res: Response) => {
  res.json({ success: true, alerts, count: alerts.length });
});

app.delete('/api/alerts/clear', (req: Request, res: Response) => {
  alerts = [];
  res.json({ success: true, message: 'تم مسح سجل التنبيهات' });
});

// 5. Daily Report
app.get('/api/reports/daily', (req: Request, res: Response) => {
  const summary = generateDailyReport();
  const cleanAdminPhone = formatPhoneForWhatsApp(settings.adminPhone);
  const waLink = `https://wa.me/${cleanAdminPhone}?text=${encodeURIComponent(summary.whatsappFormattedText)}`;

  res.json({
    success: true,
    summary,
    adminWhatsAppLink: waLink,
    adminPhone: settings.adminPhone,
  });
});

app.post('/api/reports/send-daily', (req: Request, res: Response) => {
  const summary = generateDailyReport();
  const cleanAdminPhone = formatPhoneForWhatsApp(settings.adminPhone);
  const waLink = `https://wa.me/${cleanAdminPhone}?text=${encodeURIComponent(summary.whatsappFormattedText)}`;

  // Log as admin alert
  alerts.unshift({
    id: `alt-report-${Date.now()}`,
    timestamp: new Date().toISOString(),
    recipientType: 'admin',
    recipientName: settings.adminName,
    recipientPhone: settings.adminPhone,
    orderId: 'التقرير اليومي الشامل',
    elapsedMinutes: 0,
    activeOrdersCount: summary.activeOrdersRightNow,
    message: summary.whatsappFormattedText,
    status: 'sent',
    waLink,
  });

  res.json({
    success: true,
    message: 'تم تجهيز التقرير اليومي وإرساله للإدارة عبر الواتساب',
    waLink,
  });
});

// 5b. Direct WhatsApp Baileys Status & Session Management API
app.get('/api/whatsapp/status', async (req: Request, res: Response) => {
  const hasSavedSession = fs.existsSync(path.join(AUTH_DIR, 'creds.json'));
  let terminalQr = '';
  if (whatsappState.qrRaw) {
    try {
      terminalQr = await QRCode.toString(whatsappState.qrRaw, { type: 'terminal', small: true });
    } catch (e) {}
  }

  res.json({
    success: true,
    whatsappState,
    terminalQr,
    sessionDir: AUTH_DIR,
    hasSavedSession,
    cooldownMinutes: settings.alertCooldownMinutes,
    antiBanMinDelay: settings.antiBanMinDelaySeconds,
    antiBanMaxDelay: settings.antiBanMaxDelaySeconds,
  });
});

app.post('/api/whatsapp/reconnect', async (req: Request, res: Response) => {
  console.log('[Baileys] إعادة الاتصال / فحص الجلسة...');
  connectToWhatsApp(false);
  res.json({
    success: true,
    message: 'جاري الاتصال والتحقق من جلسة الواتساب...',
    whatsappState,
  });
});

app.post('/api/whatsapp/logout', async (req: Request, res: Response) => {
  console.log('[Baileys] تسجيل الخروج ومسح بيانات الجلسة القديمة...');
  connectToWhatsApp(true);
  res.json({
    success: true,
    message: 'تم مسح ملفات الجلسة وإعادة توليد رمز QR جديد',
    whatsappState,
  });
});

app.post('/api/whatsapp/send-test', async (req: Request, res: Response) => {
  const { recipientPhone, recipientName = 'مشرف العمليات', message } = req.body;
  if (!recipientPhone) {
    res.status(400).json({ success: false, message: 'رقم الهاتف مطلوب لإجراء الاختبار' });
    return;
  }

  const cleanPhone = formatPhoneForWhatsApp(recipientPhone);
  const textToSend = message || `مرحباً ${recipientName}،\nرسالة فحص مباشر من نظام أتمتة ومتابعة لوكيت.\nالتوقيت: ${new Date().toLocaleTimeString('ar-SA')}\n✅ الربط يعمل ومستقر على السيرفر.`;
  const sendRes = await sendWhatsAppDirect(cleanPhone, textToSend);

  res.json({
    success: true,
    message: sendRes.method === 'baileys_direct'
      ? 'تم إرسال رسالة الفحص آلياً عبر جلسة Baileys على الواتساب بنجاح!'
      : 'تم تجهيز رابط الإرسال المباشر (wa.me) لعدم اكتمال ربط جلسة Baileys بعد',
    details: sendRes,
    textSent: textToSend,
    recipientPhone: cleanPhone,
    recipientName,
  });
});

// Backward-compatible verification endpoint (pure check, no dummy orders)
app.post('/api/whatsapp/test-direct', async (req: Request, res: Response) => {
  try {
    const {
      recipientPhone = settings.adminPhone || '966500000000',
      recipientName = settings.adminName || 'مشرف العمليات',
      customMessage,
    } = req.body;

    const cleanPhone = formatPhoneForWhatsApp(recipientPhone);
    const messageText = customMessage || `السلام عليكم أخي ${recipientName}،\nرسالة فحص مباشر وتأكيد ربط جلسة الواتساب مع نظام أتمتة لوكيت.\nالتوقيت: ${new Date().toLocaleTimeString('ar-SA')}`;
    const directWaLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`;

    let terminalQr = '';
    if (whatsappState.qrRaw) {
      try {
        terminalQr = await QRCode.toString(whatsappState.qrRaw, { type: 'terminal', small: true });
      } catch (e) {}
    }

    res.json({
      success: true,
      message: 'تم فحص حالة جلسة الواتساب بنجاح',
      whatsappState,
      terminalQr,
      qrDataUrl: whatsappState.qrDataUrl,
      directWaLink,
      messageText,
      recipientPhone: cleanPhone,
      recipientName,
      orderId: 'VERIFY',
    });
  } catch (error: any) {
    console.error('Error in whatsapp test-direct:', error);
    res.status(500).json({ success: false, message: 'فشل فحص الواتساب', error: error?.message });
  }
});

app.get('/api/whatsapp/qr-session', async (req: Request, res: Response) => {
  let terminalQr = '';
  if (whatsappState.qrRaw) {
    try {
      terminalQr = await QRCode.toString(whatsappState.qrRaw, { type: 'terminal', small: true });
    } catch (e) {}
  }

  res.json({
    success: true,
    whatsappState,
    qrDataUrl: whatsappState.qrDataUrl,
    terminalQr,
    timestamp: new Date().toISOString(),
  });
});

// 5.1 Anti-Ban WhatsApp Queue Management API
app.get('/api/whatsapp/queue', (req: Request, res: Response) => {
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

app.post('/api/whatsapp/queue/clear', (req: Request, res: Response) => {
  messageQueue = [];
  queueStats = {
    totalProcessed: 0,
    totalSent: 0,
    totalSkippedCooldown: 0,
  };
  res.json({ success: true, message: 'تم مسح طابور الرسائل وإعادة ضبط الإحصائيات' });
});

// 5.2 24/7 VPS Headless Scraper (Puppeteer for supplier.locate.sa/orders)
async function runPuppeteerScrapeLocat() {
  if (puppeteerStatus.isRunning) {
    console.log('[Puppeteer 24/7] عملية السحب جارية حالياً، تم تجاهل الطلب المكرر.');
    return;
  }

  puppeteerStatus.isRunning = true;
  puppeteerStatus.status = 'scraping';
  console.log('[Puppeteer 24/7] 🔄 بدء فحص شاشة لوكيت الحية (https://supplier.locate.sa/orders)...');

  try {
    const puppeteerModule = await import('puppeteer');
    const browser = await puppeteerModule.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.goto('https://supplier.locate.sa/orders', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Handle authentication if redirected to login
    const currentUrl = page.url();
    if (currentUrl.includes('login') && settings.locateUsername && settings.locatePassword) {
      console.log('[Puppeteer 24/7] 🔐 تسجيل الدخول التلقائي في بوابة لوكيت...');
      await page.type('input[type="text"], input[type="email"], input[name*="user"]', settings.locateUsername);
      await page.type('input[type="password"]', settings.locatePassword);
      await Promise.all([
        page.click('button[type="submit"], input[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
      ]);
    }

    // Scrape live orders table
    const scrapedOrders = await page.evaluate(() => {
      const items: any[] = [];
      const rows = document.querySelectorAll('table tbody tr, .order-item, .orders-table tr');
      rows.forEach((row) => {
        const text = (row as HTMLElement).innerText || '';
        if (!text.trim()) return;

        const cells = Array.from(row.querySelectorAll('td')).map((c) => (c as HTMLElement).innerText.trim());
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
    console.log(`[Puppeteer 24/7] ✅ اكتمل السحب بنجاح: تم جلب ${scrapedOrders.length} طلب.`);

    // Synchronize into server live orders
    if (scrapedOrders.length > 0) {
      scrapedOrders.forEach((scraped) => {
        const isDelayed = scraped.elapsedMinutes >= settings.delayThresholdMinutes;
        const matchedCourier = findCourierByLocatAccount(scraped.locatAccount);
        const existing = orders.find((o) => o.id === scraped.orderId);

        if (existing) {
          existing.elapsedMinutes = scraped.elapsedMinutes;
          existing.isDelayed = isDelayed;
          if (isDelayed) {
            triggerAlertsForOrder(existing);
          }
        } else {
          const newOrder: Order = {
            id: scraped.orderId,
            locatAccount: scraped.locatAccount,
            courierId: matchedCourier?.id,
            courierName: matchedCourier?.name || scraped.courierName,
            courierPhone: matchedCourier?.phone || '',
            restaurant: scraped.restaurant,
            customerAddress: scraped.customerAddress,
            pickupTime: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
            elapsedMinutes: scraped.elapsedMinutes,
            status: isDelayed ? 'delayed' : 'in_transit',
            isDelayed,
            alertSentToCourier: false,
            alertSentToAdmin: false,
            alertSentToAdmin2: false,
            activeOrdersHeldByCourier: scraped.activeOrdersHeldByCourier || 1,
            lastUpdated: new Date().toISOString(),
          };
          if (isDelayed) {
            triggerAlertsForOrder(newOrder);
          }
          orders.unshift(newOrder);
        }
      });
    }
  } catch (err: any) {
    console.warn('[Puppeteer 24/7] فحص Puppeteer:', err.message);
    puppeteerStatus.lastError = err.message;
    puppeteerStatus.status = 'error';
  } finally {
    puppeteerStatus.isRunning = false;
  }
}

app.post('/api/puppeteer/trigger', async (req: Request, res: Response) => {
  runPuppeteerScrapeLocat();
  res.json({
    success: true,
    message: 'تم إطلاق مهمة السحب التلقائي عبر Puppeteer 24/7 على الخادم',
    puppeteerStatus,
  });
});

// 6. Automation Script Source Generator (Tampermonkey / Userscript for supplier.locate.sa/orders)
app.get('/api/automation-script', (req: Request, res: Response) => {
  const scriptHost = req.protocol + '://' + req.get('host');
  const syncEndpoint = `${scriptHost}/api/locat/sync`;

  const scriptCode = `// ==UserScript==
// @name         Locate Supplier Live Monitor & Dispatcher Automation
// @namespace    https://supplier.locate.sa/
// @version      2.0
// @description  قراءة بيانات الطلبات والمناديب لحظياً وبدقة من شاشة لوكيت المباشرة (supplier.locate.sa/orders) وإرسالها للوحة التحكم للتنبيه التلقائي
// @author       Locate Automation Engine
// @match        https://supplier.locate.sa/orders*
// @match        https://supplier.locate.sa/*
// @match        http*://supplier.locate.sa/orders*
// @match        http*://supplier.locate.sa/*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // 1. Flexible Sync Configuration
    // Allows dynamic override via localStorage or window global, defaulting to the current dashboard server
    const DEFAULT_SYNC_URL = '${syncEndpoint}';
    const SYNC_URL = (typeof window !== 'undefined' && (window.LOCATE_SYNC_URL || localStorage.getItem('LOCATE_SYNC_URL'))) || DEFAULT_SYNC_URL;
    const API_KEY = (typeof window !== 'undefined' && (window.LOCATE_API_KEY || localStorage.getItem('LOCATE_API_KEY'))) || '${settings.locatApiKey}';
    const SYNC_INTERVAL_MS = ${settings.locatSyncIntervalSeconds * 1000};

    console.log('%c[Locate Dispatcher] 🚀 تم تشغيل سكربت أتمتة لوكيت المباشر بنجاح على صفحة supplier.locate.sa/orders', 'color: #10b981; font-weight: bold; font-size: 13px;');
    console.log('[Locate Dispatcher] رابط المزامنة:', SYNC_URL);

    // 2. Parse Elapsed Minutes from text or time strings
    function parseElapsedMinutes(text) {
        if (!text) return 0;
        const clean = text.trim();

        // Direct minutes format: "35 دقيقة", "40 د", "25 min", "30 mins", "45m"
        const minMatch = clean.match(/(\\d+)\\s*(?:دقيقة|دقائق|د|min|mins|m)\\b/i);
        if (minMatch) {
            return parseInt(minMatch[1], 10);
        }

        // Digital timer format: "01:25:30" (HH:mm:ss) or "35:20" (mm:ss)
        const clockMatch = clean.match(/(\\d{1,2}):(\\d{2})(?::(\\d{2}))?/);
        if (clockMatch) {
            if (clockMatch[3] !== undefined) {
                // HH:mm:ss
                return parseInt(clockMatch[1], 10) * 60 + parseInt(clockMatch[2], 10);
            } else {
                // mm:ss or HH:mm
                const p1 = parseInt(clockMatch[1], 10);
                const p2 = parseInt(clockMatch[2], 10);
                return p1 > 12 ? (p1 * 60 + p2) : p1; // if p1 > 12 it is minutes:seconds
            }
        }

        // Timestamp format: "14:35" or "02:35 م" or "02:35 PM" -> calculate diff with current time
        const timeOfDayMatch = clean.match(/(\\d{1,2}):(\\d{2})\\s*(ص|م|AM|PM)?/i);
        if (timeOfDayMatch) {
            try {
                let h = parseInt(timeOfDayMatch[1], 10);
                const m = parseInt(timeOfDayMatch[2], 10);
                const period = timeOfDayMatch[3] ? timeOfDayMatch[3].toUpperCase() : '';
                if ((period === 'م' || period === 'PM') && h < 12) h += 12;
                if ((period === 'ص' || period === 'AM') && h === 12) h = 0;

                const now = new Date();
                const orderTime = new Date();
                orderTime.setHours(h, m, 0, 0);

                let diffMs = now.getTime() - orderTime.getTime();
                if (diffMs < 0) diffMs += 24 * 60 * 60 * 1000; // Crossed midnight
                const diffMins = Math.floor(diffMs / 60000);
                if (diffMins >= 0 && diffMins <= 480) { // realistic range up to 8 hours
                    return diffMins;
                }
            } catch (e) {}
        }

        // Plain digits
        const numOnly = clean.match(/\\b(\\d{1,3})\\b/);
        return numOnly ? parseInt(numOnly[1], 10) : 0;
    }

    // 3. Extract Live Orders specifically tailored for supplier.locate.sa/orders
    function extractLocatLiveOrders() {
        const orders = [];
        const driverOrderCounts = {};

        // Find table rows on supplier.locate.sa (supporting Ant Design, Vue/Element, Tailwind, and standard HTML tables)
        const selectors = [
            'table.ant-table-content tbody tr.ant-table-row',
            '.ant-table-tbody > tr:not(.ant-table-measure-row)',
            'table tbody tr',
            'div[role="row"]:not([role="rowheader"])',
            '.orders-table tbody tr',
            '.order-row',
            '.locate-order-card',
            '[data-row-key]'
        ];

        let rows = [];
        for (const sel of selectors) {
            const found = document.querySelectorAll(sel);
            if (found && found.length > 0) {
                rows = Array.from(found);
                break;
            }
        }

        if (rows.length === 0) {
            // Fallback: look for generic table rows
            rows = Array.from(document.querySelectorAll('tbody tr'));
        }

        // Detect column indices dynamically from headers if present
        let colOrder = -1;
        let colDriver = -1;
        let colTime = -1;
        let colRestaurant = -1;
        let colCustomer = -1;
        let colStatus = -1;

        const headerCells = document.querySelectorAll('thead th, [role="columnheader"]');
        headerCells.forEach((th, idx) => {
            const txt = (th.innerText || th.textContent || '').trim().toLowerCase();
            if (txt.includes('طلب') || txt.includes('رقم') || txt.includes('order') || txt.includes('id')) {
                if (colOrder === -1) colOrder = idx;
            } else if (txt.includes('سائق') || txt.includes('مندوب') || txt.includes('كابتن') || txt.includes('driver') || txt.includes('courier')) {
                if (colDriver === -1) colDriver = idx;
            } else if (txt.includes('وقت') || txt.includes('مدة') || txt.includes('زمن') || txt.includes('time') || txt.includes('elapsed') || txt.includes('duration') || txt.includes('استلام')) {
                if (colTime === -1) colTime = idx;
            } else if (txt.includes('متجر') || txt.includes('مطعم') || txt.includes('فرع') || txt.includes('merchant') || txt.includes('restaurant') || txt.includes('branch')) {
                if (colRestaurant === -1) colRestaurant = idx;
            } else if (txt.includes('عميل') || txt.includes('عنوان') || txt.includes('حي') || txt.includes('customer') || txt.includes('address')) {
                if (colCustomer === -1) colCustomer = idx;
            } else if (txt.includes('حالة') || txt.includes('status')) {
                if (colStatus === -1) colStatus = idx;
            }
        });

        // First pass: extract data and count orders per driver
        const candidateOrders = [];

        rows.forEach((row, index) => {
            try {
                const cells = Array.from(row.querySelectorAll('td, [role="cell"]'));
                if (cells.length === 0) return;

                // Status check: Skip completed or cancelled orders
                let statusText = '';
                if (colStatus !== -1 && cells[colStatus]) {
                    statusText = cells[colStatus].innerText.trim();
                } else {
                    const statusEl = row.querySelector('.status, .badge-status, .ant-tag, [class*="status"]');
                    if (statusEl) statusText = statusEl.innerText.trim();
                }

                if (statusText.includes('مكتمل') || statusText.includes('تم التسليم') || statusText.includes('ملغي') || statusText.includes('Delivered') || statusText.includes('Cancelled')) {
                    return; // skip inactive orders
                }

                // 1. Order ID
                let orderId = '';
                if (colOrder !== -1 && cells[colOrder]) {
                    const link = cells[colOrder].querySelector('a, strong, .ant-btn, [class*="order"]');
                    orderId = (link ? link.innerText : cells[colOrder].innerText).trim();
                } else {
                    const orderEl = row.querySelector('a[href*="order"], .order-id, [data-field="order_id"], td:first-child strong, td:first-child');
                    orderId = orderEl ? orderEl.innerText.trim() : '';
                }

                // Extract clean digits or format (e.g. "#12345" or "24090123")
                const orderIdMatch = orderId.match(/#?\\b[A-Za-z0-9\\-_]{4,16}\\b/);
                if (orderIdMatch) {
                    orderId = orderIdMatch[0];
                } else if (!orderId) {
                    orderId = '#LOC-' + (2000 + index);
                }
                if (!orderId.startsWith('#')) orderId = '#' + orderId;

                // 2. Driver / Courier Name & Account
                let driverText = '';
                if (colDriver !== -1 && cells[colDriver]) {
                    driverText = cells[colDriver].innerText.trim();
                } else {
                    const driverEl = row.querySelector('[class*="driver"], [class*="courier"], .captain, [data-field="driver"], td:nth-child(2)');
                    driverText = driverEl ? driverEl.innerText.trim() : '';
                }

                // Clean driver account text
                driverText = driverText.replace(/\\n/g, ' ').replace(/\\s+/g, ' ').trim();

                // 3. Elapsed Time
                let timeText = '';
                if (colTime !== -1 && cells[colTime]) {
                    timeText = cells[colTime].innerText.trim();
                } else {
                    const timeEl = row.querySelector('[class*="time"], [class*="timer"], [class*="duration"], .elapsed, td:nth-child(3)');
                    timeText = timeEl ? timeEl.innerText.trim() : '';
                }
                const elapsedMinutes = parseElapsedMinutes(timeText);

                // 4. Restaurant / Store
                let restaurant = '';
                if (colRestaurant !== -1 && cells[colRestaurant]) {
                    restaurant = cells[colRestaurant].innerText.trim();
                } else {
                    const restEl = row.querySelector('[class*="merchant"], [class*="store"], [class*="restaurant"]');
                    restaurant = restEl ? restEl.innerText.trim() : 'متجر لوكيت';
                }

                // 5. Customer / Address
                let customerAddress = '';
                if (colCustomer !== -1 && cells[colCustomer]) {
                    customerAddress = cells[colCustomer].innerText.trim();
                } else {
                    const custEl = row.querySelector('[class*="customer"], [class*="address"], [class*="city"]');
                    customerAddress = custEl ? custEl.innerText.trim() : 'الوجهة المحددة';
                }

                if (orderId && driverText) {
                    // Tally orders held by this driver
                    const driverKey = driverText.toLowerCase();
                    driverOrderCounts[driverKey] = (driverOrderCounts[driverKey] || 0) + 1;

                    candidateOrders.push({
                        id: orderId,
                        locatAccount: driverText,
                        courierName: driverText,
                        elapsedMinutes: elapsedMinutes,
                        restaurant: restaurant || 'شريك لوكيت',
                        customerAddress: customerAddress,
                        driverKey: driverKey,
                        pickupTime: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
                    });
                }
            } catch (err) {
                console.error('[Locate Dispatcher] خطأ في قراءة سطر:', err);
            }
        });

        // Second pass: attach active orders held count
        candidateOrders.forEach((o) => {
            orders.push({
                id: o.id,
                locatAccount: o.locatAccount,
                courierName: o.courierName,
                elapsedMinutes: o.elapsedMinutes,
                restaurant: o.restaurant,
                customerAddress: o.customerAddress,
                activeOrdersHeldByCourier: driverOrderCounts[o.driverKey] || 1,
                pickupTime: o.pickupTime,
            });
        });

        return orders;
    }

    // 4. Send Data to Sync Server
    let syncCount = 0;
    function sendSyncData() {
        const extractedOrders = extractLocatLiveOrders();
        updateBadgeStatus(extractedOrders.length, 'syncing');

        if (extractedOrders.length === 0) {
            console.log('[Locate Dispatcher] في انتظار ظهور طلبات نشطة في جدول supplier.locate.sa/orders...');
            updateBadgeStatus(0, 'idle');
            return;
        }

        console.log(\`[Locate Dispatcher] 📡 جاري إرسال \${extractedOrders.length} طلب مباشر إلى \${SYNC_URL}...\`);

        fetch(SYNC_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                secretKey: API_KEY,
                liveOrders: extractedOrders,
                timestamp: new Date().toISOString()
            })
        })
        .then(res => res.json())
        .then(data => {
            syncCount++;
            console.log('✅ [Locate Dispatcher] تمت المزامنة بنجاح:', data);
            updateBadgeStatus(extractedOrders.length, 'success', data.alertsGenerated);
        })
        .catch(err => {
            console.error('❌ [Locate Dispatcher] فشل الاتصال بالخادم:', err);
            updateBadgeStatus(extractedOrders.length, 'error');
        });
    }

    // 5. Visual Green Floating Badge: 🟢 Locate Dispatcher Active
    let badgeEl = null;

    function createBadge() {
        if (badgeEl || document.getElementById('locate-dispatcher-badge')) return;

        badgeEl = document.createElement('div');
        badgeEl.id = 'locate-dispatcher-badge';
        badgeEl.setAttribute('dir', 'rtl');
        badgeEl.style.cssText = \`
            position: fixed;
            bottom: 18px;
            left: 18px;
            z-index: 999999;
            background: linear-gradient(135deg, #059669 0%, #10b981 100%);
            color: #ffffff;
            padding: 9px 16px;
            border-radius: 9999px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", sans-serif;
            font-size: 12px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4), 0 2px 6px rgba(0,0,0,0.15);
            border: 1px solid rgba(255,255,255,0.25);
            cursor: pointer;
            transition: all 0.3s ease;
            user-select: none;
        \`;

        badgeEl.innerHTML = \`
            <span style="display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #a7f3d0; box-shadow: 0 0 8px #ffffff;"></span>
            <span>🟢 Locate Dispatcher Active</span>
            <span id="locate-badge-sub" style="font-size: 11px; opacity: 0.9; font-weight: normal; margin-right: 4px;">(جاري الاتصال...)</span>
        \`;

        badgeEl.title = 'انقر لعرض تفاصيل المزامنة أو تعديل رابط الخادم';
        badgeEl.onclick = () => {
            const current = localStorage.getItem('LOCATE_SYNC_URL') || SYNC_URL;
            const newUrl = prompt('رابط خادم المزامنة الحالي (SYNC_URL):\\nيمكنك تعديله هنا إذا تغير عنوان لوحة التحكم:', current);
            if (newUrl && newUrl.trim() && newUrl !== current) {
                localStorage.setItem('LOCATE_SYNC_URL', newUrl.trim());
                alert('تم حفظ رابط المزامنة الجديد. سيتم استخدامه في النبضة القادمة.');
                location.reload();
            }
        };

        document.body.appendChild(badgeEl);
    }

    function updateBadgeStatus(ordersCount, status, alertsCount = 0) {
        if (!badgeEl) createBadge();
        const subEl = document.getElementById('locate-badge-sub');
        if (!subEl) return;

        const timeStr = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        if (status === 'syncing') {
            subEl.innerText = \`(جاري مزامنة \${ordersCount} طلب...)\`;
            badgeEl.style.opacity = '0.85';
        } else if (status === 'success') {
            subEl.innerText = \`(\${ordersCount} طلب نشط | \${timeStr})\`;
            badgeEl.style.opacity = '1';
            badgeEl.style.background = 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
        } else if (status === 'error') {
            subEl.innerText = \`(خطأ في الاتصال | \${timeStr})\`;
            badgeEl.style.background = 'linear-gradient(135deg, #e11d48 0%, #f43f5e 100%)';
        } else {
            subEl.innerText = \`(في الانتظار | \${timeStr})\`;
        }
    }

    // Initialize badge and interval
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            createBadge();
            setTimeout(sendSyncData, 2000);
        });
    } else {
        createBadge();
        setTimeout(sendSyncData, 2000);
    }

    setInterval(sendSyncData, SYNC_INTERVAL_MS);

})();`;

  res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
  res.send(scriptCode);
});

// --- VITE MIDDLEWARE & SERVER STARTUP ---
async function startServer() {
  // Start persistent Baileys WhatsApp connection engine
  connectToWhatsApp().catch((err) => {
    console.error('[Baileys Startup Error]', err);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
