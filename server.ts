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
  OrderStatus,
  SystemSettings, 
  AlertLog, 
  DailyReportSummary, 
  CourierPerformanceItem,
  QueuedWhatsAppMessage,
  PuppeteerScraperStatus,
  WhatsAppConnectionState,
  CloudSyncState,
} from './src/types';

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
  locatSyncIntervalSeconds: 20,
  locatApiKey: 'locat_secret_key_8892',
  enablePuppeteerHeadless: false,
  locateUsername: '',
  locatePassword: '',
  locateEmail: '',
  locateCompanyId: '',
  locateAccessToken: '',
  enableCloudAutoSync: true, // سحب تلقائي سحابي مباشر 24/7
  lastCloudSyncTimestamp: undefined,
  lastCloudSyncCount: 0,
};

let cloudSyncState: CloudSyncState = {
  isActive: true,
  status: 'idle',
  lastCount: 0,
  hasCredentials: false,
  hasToken: false,
};

// --- PERSISTENT STORAGE RESOLUTION (Render Disk, VPS, or Local) ---
function getPersistentDirectory(): string {
  if (process.env.BAILEYS_AUTH_DIR) {
    const parent = path.dirname(path.resolve(process.env.BAILEYS_AUTH_DIR));
    if (fs.existsSync(parent)) return parent;
  }
  let baseDir = process.cwd();
  if (process.env.PERSISTENT_DATA_DIR && fs.existsSync(process.env.PERSISTENT_DATA_DIR)) {
    baseDir = path.resolve(process.env.PERSISTENT_DATA_DIR);
  } else if (process.env.RENDER_DISK_PATH && fs.existsSync(process.env.RENDER_DISK_PATH)) {
    baseDir = path.resolve(process.env.RENDER_DISK_PATH);
  } else if (process.env.DATA_DIR && fs.existsSync(process.env.DATA_DIR)) {
    baseDir = path.resolve(process.env.DATA_DIR);
  } else {
    // Check standard Render persistent disk mount /data
    try {
      if (fs.existsSync('/data')) {
        fs.accessSync('/data', fs.constants.W_OK);
        console.log('[Storage Engine] 💾 تم رصد واستخدام القرص السحابي الدائم المثبت على Render: /data');
        baseDir = '/data';
      } else if (fs.existsSync('/var/data')) {
        fs.accessSync('/var/data', fs.constants.W_OK);
        console.log('[Storage Engine] 💾 تم رصد واستخدام القرص السحابي الدائم: /var/data');
        baseDir = '/var/data';
      }
    } catch (e) {}
  }

  // If INSTANCE_NAME is provided, isolate in dedicated subfolder
  const instanceName = (process.env.INSTANCE_NAME || '').trim();
  if (instanceName) {
    const instanceDir = path.resolve(baseDir, instanceName);
    if (!fs.existsSync(instanceDir)) {
      try {
        fs.mkdirSync(instanceDir, { recursive: true });
        console.log(`[Storage Engine] 📁 تم إنشاء وتخصيص مجلد التخزين المستقل للنسخة (${instanceName}): ${instanceDir}`);
      } catch (err: any) {
        console.warn(`[Storage Engine] تعذر إنشاء مجلد النسخة المستقل:`, err?.message);
      }
    }
    if (fs.existsSync(instanceDir)) return instanceDir;
  }

  return baseDir;
}

const INSTANCE_NAME = (process.env.INSTANCE_NAME || 'atomic-abu-sultan').trim();
const PERSISTENT_DIR = getPersistentDirectory();
const STORE_FILE = path.resolve(PERSISTENT_DIR, 'locat_database.json');
const SESSION_BACKUP_FILE = path.resolve(PERSISTENT_DIR, 'baileys_session_backup.json');
const LOCAT_CREDENTIALS_FILE = path.resolve(PERSISTENT_DIR, 'locat_credentials.json');
const AUTH_DIR = process.env.BAILEYS_AUTH_DIR || path.resolve(PERSISTENT_DIR, 'baileys_auth_info');

let couriers: Courier[] = [];
let orders: Order[] = [];
let alerts: AlertLog[] = [];
let customCourierPhones: Record<string, { phone: string; name?: string; updatedAt: string }> = {};
let whatsappSessionBackup: Record<string, string> = {};

function saveLocatCredentialsToDisk(creds?: {
  email?: string;
  username?: string;
  password?: string;
  companyId?: string;
  accessToken?: string;
}) {
  try {
    const emailToSave = creds?.email || creds?.username || settings.locateEmail || settings.locateUsername || '';
    const passwordToSave = creds?.password !== undefined ? creds.password : settings.locatePassword || '';
    const companyIdToSave = creds?.companyId !== undefined ? creds.companyId : settings.locateCompanyId || '';
    const tokenToSave = creds?.accessToken !== undefined ? creds.accessToken : settings.locateAccessToken || '';

    if (!emailToSave && !passwordToSave && !tokenToSave) return;

    const payload = {
      locateEmail: emailToSave,
      locateUsername: emailToSave,
      locatePassword: passwordToSave,
      locateCompanyId: companyIdToSave,
      locateAccessToken: tokenToSave,
      updatedAt: new Date().toISOString(),
      note: 'بيانات حساب لوكيت المخصص لهذه النسخة (محفوظة بشكل دائم لمنع تسجيل الخروج)',
    };

    fs.writeFileSync(LOCAT_CREDENTIALS_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    console.log(`[Store] 💾 تم حفظ وتثبيت بيانات حساب لوكيت (${emailToSave}) في الملف الدائم: ${LOCAT_CREDENTIALS_FILE}`);
  } catch (err: any) {
    console.warn('[Store] تحذير عند حفظ ملف بيانات اعتماد لوكيت:', err?.message);
  }
}

function backupBaileysSession() {
  try {
    if (!fs.existsSync(AUTH_DIR)) return;
    const files = fs.readdirSync(AUTH_DIR);
    const backup: Record<string, string> = {};
    for (const f of files) {
      if (f.endsWith('.json')) {
        const fullPath = path.join(AUTH_DIR, f);
        try {
          backup[f] = fs.readFileSync(fullPath, 'utf-8');
        } catch (e) {}
      }
    }
    if (backup['creds.json']) {
      whatsappSessionBackup = backup;
      // Write to dedicated session backup file on disk
      try {
        fs.writeFileSync(SESSION_BACKUP_FILE, JSON.stringify(backup, null, 2), 'utf-8');
      } catch (err: any) {
        console.warn('[Baileys Standalone Backup Warning]', err?.message);
      }
      saveStoreToDisk();
      console.log(`[Baileys Engine] 💾 تم حفظ نسخة احتياطية مشفرة لجلسة الواتساب (${Object.keys(backup).length} ملف) في القرص الدائم`);
    }
  } catch (err: any) {
    console.warn('[Baileys Backup Warning]', err?.message);
  }
}

function restoreBaileysSessionFromBackup(externalPayload?: Record<string, string>): boolean {
  try {
    let source = externalPayload;
    if (!source || !source['creds.json']) {
      if (whatsappSessionBackup && whatsappSessionBackup['creds.json']) {
        source = whatsappSessionBackup;
      } else if (fs.existsSync(SESSION_BACKUP_FILE)) {
        try {
          const raw = fs.readFileSync(SESSION_BACKUP_FILE, 'utf-8');
          source = JSON.parse(raw);
        } catch (e) {}
      }
    }

    if (!source || !source['creds.json']) return false;

    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    let restoredCount = 0;
    for (const [filename, content] of Object.entries(source)) {
      if (typeof content === 'string' && filename.endsWith('.json')) {
        const fullPath = path.join(AUTH_DIR, filename);
        fs.writeFileSync(fullPath, content, 'utf-8');
        restoredCount++;
      }
    }

    whatsappSessionBackup = source;
    try {
      fs.writeFileSync(SESSION_BACKUP_FILE, JSON.stringify(source, null, 2), 'utf-8');
    } catch (e) {}
    saveStoreToDisk();

    console.log(`[Baileys Engine] 🔄 تم استعادة ملفات جلسة الواتساب بنجاح (${restoredCount} ملف) إلى ${AUTH_DIR}`);
    return true;
  } catch (err: any) {
    console.warn('[Baileys Restore Warning]', err?.message);
    return false;
  }
}

function loadStoreFromDisk() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.couriers)) couriers = data.couriers;
      if (Array.isArray(data.orders)) orders = data.orders;
      if (Array.isArray(data.alerts)) alerts = data.alerts;
      if (data.settings && typeof data.settings === 'object') {
        settings = { ...settings, ...data.settings };
        if (settings.adminPhone === '966555123456') settings.adminPhone = '';
      }
      if (data.customCourierPhones && typeof data.customCourierPhones === 'object') {
        customCourierPhones = data.customCourierPhones;
      }
      if (data.whatsappSessionBackup && typeof data.whatsappSessionBackup === 'object') {
        whatsappSessionBackup = data.whatsappSessionBackup;
      }
      console.log(`[Store] ✅ تم تحميل البيانات من القرص: ${couriers.length} مندوب، ${orders.length} طلب.`);
    }

    // Check dedicated credentials file in persistent storage
    if (fs.existsSync(LOCAT_CREDENTIALS_FILE)) {
      try {
        const rawCreds = fs.readFileSync(LOCAT_CREDENTIALS_FILE, 'utf-8');
        const creds = JSON.parse(rawCreds);
        if (creds && typeof creds === 'object') {
          if (creds.locateEmail || creds.locateUsername) {
            settings.locateEmail = (creds.locateEmail || creds.locateUsername || '').trim();
            settings.locateUsername = settings.locateEmail;
          }
          if (creds.locatePassword) {
            settings.locatePassword = creds.locatePassword.trim();
          }
          if (creds.locateCompanyId) {
            settings.locateCompanyId = String(creds.locateCompanyId).trim();
          }
          if (creds.locateAccessToken && !settings.locateAccessToken) {
            settings.locateAccessToken = creds.locateAccessToken.trim();
          }
          console.log(`[Store] 🔐 تم استرجاع بيانات حساب لوكيت المخصص (${settings.locateEmail}) بنجاح من الملف الدائم`);
        }
      } catch (e: any) {
        console.warn('[Store] تحذير عند قراءة ملف بيانات الاعتماد:', e?.message);
      }
    }

    // Environment variables take precedence if provided (allowing container / deployment customization)
    const envEmail = (process.env.LOCAT_EMAIL || process.env.LOCAT_USERNAME || '').trim();
    const envPassword = (process.env.LOCAT_PASSWORD || '').trim();
    const envCompanyId = (process.env.LOCAT_COMPANY_ID || '').trim();
    const envToken = (process.env.LOCAT_ACCESS_TOKEN || '').trim();

    if (envEmail) {
      settings.locateEmail = envEmail;
      settings.locateUsername = envEmail;
      console.log(`[Store] 🌐 تم تعيين حساب لوكيت من متغيرات البيئة: ${envEmail}`);
    }
    if (envPassword) {
      settings.locatePassword = envPassword;
    }
    if (envCompanyId) {
      settings.locateCompanyId = envCompanyId;
    }
    if (envToken) {
      settings.locateAccessToken = envToken;
    }

    // Also check standalone session backup file if not present in main db
    if ((!whatsappSessionBackup || !whatsappSessionBackup['creds.json']) && fs.existsSync(SESSION_BACKUP_FILE)) {
      try {
        const raw = fs.readFileSync(SESSION_BACKUP_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed['creds.json']) {
          whatsappSessionBackup = parsed;
          console.log('[Store] ✅ تم تحميل نسخة جلسة الواتساب من ملف النسخ الاحتياطي المستقل');
        }
      } catch (e) {}
    }
  } catch (err) {
    console.error('[Store] فشل قراءة ملف التخزين المحلي:', err);
  }
}

function saveStoreToDisk() {
  try {
    const data = { couriers, orders, alerts, settings, customCourierPhones, whatsappSessionBackup };
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    if (settings.locateEmail || settings.locatePassword || settings.locateAccessToken) {
      saveLocatCredentialsToDisk();
    }
  } catch (err) {
    console.error('[Store] فشل حفظ البيانات في القرص:', err);
  }
}

// Initial load
loadStoreFromDisk();

// --- BAILEYS WHATSAPP ENGINE & PERSISTENT SESSION ---
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

  // 1. ALWAYS cleanly tear down previous socket to prevent ghost sockets fighting over session keys
  if (sock) {
    try {
      console.log('[Baileys Engine] 🧹 تنظيف مقبس الاتصال السابق لمنع تضارب الاتصالات المتعددة...');
      sock.ev?.removeAllListeners('connection.update');
      sock.ev?.removeAllListeners('creds.update');
      sock.ev?.removeAllListeners('messages.upsert');
      sock.end?.(undefined);
    } catch (cleanErr: any) {
      console.warn('[Baileys Cleanup Warning]', cleanErr?.message);
    }
    sock = null;
  }

  // 2. If forced fresh session requested, clear auth dir and backup
  if (forceNew) {
    try {
      whatsappSessionBackup = {};
      if (fs.existsSync(SESSION_BACKUP_FILE)) {
        fs.unlinkSync(SESSION_BACKUP_FILE);
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

    // Try to restore from persistent disk backup if empty
    if (!fs.existsSync(path.join(AUTH_DIR, 'creds.json'))) {
      restoreBaileysSessionFromBackup();
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
      browser: Browsers.macOS('Desktop'),
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 15000, // 15s keepAlive prevents proxies from killing idle TCP connections
      markOnlineOnConnect: true,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      getMessage: async (_key: any) => ({ conversation: '' }),
      retryRequestDelayMs: 250,
      maxMsgRetryCount: 5,
    });

    sock.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        backupBaileysSession();
      } catch (saveErr: any) {
        console.warn('[Baileys Creds Update Warning]', saveErr?.message);
      }
    });

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

        backupBaileysSession();
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const errorReason = (lastDisconnect?.error as any)?.message || 'انقطاع اتصال مؤقت';
        console.warn(`[Baileys WhatsApp] ⚠️ أُغلق الاتصال (رمز: ${statusCode}, السبب: ${errorReason})`);

        // Check if true logout from phone device settings
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        if (isLoggedOut) {
          console.error('[Baileys WhatsApp] 🛑 تم تسجيل الخروج الفعلي من الهاتف (401 Logged Out)');
          whatsappState.status = 'disconnected';
          whatsappState.isLoggedIn = false;
          whatsappState.userPhone = undefined;
          whatsappState.userName = undefined;
          whatsappState.lastError = 'تم تسجيل الخروج من الهاتف، يرجى مسح رمز QR جديد للربط';
          try {
            if (fs.existsSync(AUTH_DIR)) {
              fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            }
            if (fs.existsSync(SESSION_BACKUP_FILE)) {
              fs.unlinkSync(SESSION_BACKUP_FILE);
            }
            whatsappSessionBackup = {};
            saveStoreToDisk();
          } catch (e) {}

          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            connectToWhatsApp(false);
          }, 2000);
          return;
        }

        // Transient disconnect (515 restartRequired, 428 connectionClosed, 408 timedOut, network lag)
        // NEVER destroy auth credentials!
        whatsappState.status = 'reconnecting';
        whatsappState.lastError = `انقطع الاتصال المؤقت (رمز: ${statusCode || 'شبكة'}). جاري استعادة الاتصال التلقائي...`;

        let delayMs = 3000;
        if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
          delayMs = 1200; // Immediate reconnect required by WhatsApp protocol
        } else if (statusCode === DisconnectReason.connectionClosed || statusCode === 428) {
          delayMs = 2000;
        } else if (statusCode === DisconnectReason.timedOut || statusCode === 408) {
          delayMs = 3000;
        }

        console.log(`[Baileys WhatsApp] 🔄 استعادة الاتصال التلقائي والحفاظ على الجلسة خلال ${delayMs / 1000} ثانية...`);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          connectToWhatsApp(false);
        }, delayMs);
      }
    });
  } catch (err: any) {
    console.error('[Baileys Connection Error]', err?.message);
    whatsappState.status = 'disconnected';
    whatsappState.lastError = err?.message || 'تعذر تشغيل محرك Baileys';
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      connectToWhatsApp(false);
    }, 6000);
  } finally {
    isInitializingBaileys = false;
  }
}

// 24/7 Baileys Watchdog / Health-check heartbeat (runs every 30 seconds)
let baileysHeartbeatInterval: NodeJS.Timeout | null = null;
function setupBaileysHeartbeat() {
  if (baileysHeartbeatInterval) {
    clearInterval(baileysHeartbeatInterval);
  }
  baileysHeartbeatInterval = setInterval(() => {
    const hasCreds = fs.existsSync(path.join(AUTH_DIR, 'creds.json')) || (whatsappSessionBackup && !!whatsappSessionBackup['creds.json']);
    if (!hasCreds) return;

    if (whatsappState.isLoggedIn && sock) {
      const wsReadyState = sock.ws?.readyState;
      // readyState 1 = OPEN. If socket is closing (2) or closed (3) but Baileys didn't fire close event
      if (wsReadyState !== undefined && wsReadyState !== 1 && !isInitializingBaileys) {
        console.warn(`[Baileys Watchdog] ⚠️ تم رصد انقطاع خامل في WebSocket (حالة المقبس: ${wsReadyState})، جاري إعادة الاتصال التلقائي...`);
        whatsappState.status = 'reconnecting';
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          connectToWhatsApp(false);
        }, 1500);
      }
    } else if (!whatsappState.isLoggedIn && hasCreds && !isInitializingBaileys && whatsappState.status === 'disconnected') {
      console.log('[Baileys Watchdog] 🔄 توجد جلسة محفوظة ولكن المحرك غير متصل، جاري إعادة الاتصال التلقائي...');
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        connectToWhatsApp(false);
      }, 2000);
    }
  }, 30000);
}

// Render & Cloud Hosting 24/7 Anti-Sleep Keep-Alive Runner (prevents free instance spin-down)
let renderKeepAliveInterval: NodeJS.Timeout | null = null;
function setupRenderKeepAliveRunner() {
  if (renderKeepAliveInterval) {
    clearInterval(renderKeepAliveInterval);
    renderKeepAliveInterval = null;
  }

  const pingUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || (settings as any).renderKeepAliveUrl;
  if (!pingUrl) {
    return;
  }

  const cleanUrl = pingUrl.trim().replace(/\/$/, '');
  const target = cleanUrl.endsWith('/api/health') ? cleanUrl : `${cleanUrl}/api/health`;
  console.log(`[Render Keep-Alive] 🛡️ تفعيل الحماية التلقائية لمنع نوم السيرفر على Render كل 9 دقائق: ${target}`);

  renderKeepAliveInterval = setInterval(async () => {
    try {
      const res = await fetch(target);
      if (res.ok) {
        console.log(`[Render Keep-Alive] 💓 نبضة الحفاظ على استيقاظ السيرفر بنجاح (${getRiyadhTimeString()})`);
      }
    } catch (e: any) {
      console.warn(`[Render Keep-Alive Warning] ${e?.message}`);
    }
  }, 9 * 60 * 1000);
}

// Helper: Send Direct WhatsApp Message via Baileys and/or Webhook URL (with wa.me link fallback)
async function sendWhatsAppDirect(phone: string, text: string): Promise<{ success: boolean; method: string; waLink: string; error?: string }> {
  const cleanPhone = formatPhoneForWhatsApp(phone);
  const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;

  // 1. If custom WhatsApp Webhook URL is configured, forward message to it
  if (settings.webhookUrl && typeof settings.webhookUrl === 'string' && settings.webhookUrl.trim().startsWith('http')) {
    try {
      const webhookHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (settings.webhookApiKey) {
        webhookHeaders['Authorization'] = `Bearer ${settings.webhookApiKey}`;
        webhookHeaders['x-api-key'] = settings.webhookApiKey;
      }
      fetch(settings.webhookUrl.trim(), {
        method: 'POST',
        headers: webhookHeaders,
        body: JSON.stringify({
          phone: cleanPhone,
          to: cleanPhone,
          number: cleanPhone,
          chatId: `${cleanPhone}@c.us`,
          message: text,
          body: text,
          text: text,
          timestamp: new Date().toISOString(),
          riyadhTime: getRiyadhTimeString(),
          apiKey: settings.webhookApiKey || undefined,
        }),
      }).catch((wErr) => {
        console.warn(`[WhatsApp Webhook Forward Warning] ${wErr?.message}`);
      });
      console.log(`[WhatsApp Webhook] 🚀 تم توجيه التنبيه إلى رابط الويب هوك: ${settings.webhookUrl}`);
    } catch (err: any) {
      console.warn(`[WhatsApp Webhook Error] ${err?.message}`);
    }
  }

  // 2. Send via Baileys if connected
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

// Arabic text normalization for flexible matching (أ/إ/آ -> ا, ة -> ه, ى -> ي, no tashkeel)
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

// Strip leading number callsign/prefix (e.g., "9-وائل" -> "وائل", "12 - احمد" -> "احمد", "#5 خالد" -> "خالد")
function stripDriverPrefix(name: string): string {
  if (!name) return '';
  return name.replace(/^#?\d+[\s\-_:]*/, '').trim();
}

// Normalize Saudi phone to digits e.g. 9665xxxxxxxx
function normalizeSaudiPhone(phone: string): string {
  if (!phone) return '';
  let digits = String(phone).replace(/[^0-9]/g, '');
  if (digits.startsWith('00966')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('05')) {
    digits = '966' + digits.slice(1);
  } else if (digits.startsWith('5') && digits.length === 9) {
    digits = '966' + digits;
  }
  return digits;
}

// Clean phone for WhatsApp links and JID (e.g. 966551234567)
function formatPhoneForWhatsApp(phone: string): string {
  return normalizeSaudiPhone(phone);
}

// Format phone with international '+' prefix (e.g. +966551234567)
function formatPhoneWithPlus(phone: string): string {
  const norm = normalizeSaudiPhone(phone);
  return norm ? `+${norm}` : String(phone).trim();
}

// Smart driver name comparison (matches with or without prefixes)
function matchDriverName(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false;
  const n1 = normalizeArabic(name1);
  const n2 = normalizeArabic(name2);
  if (n1 === n2) return true;

  const s1 = normalizeArabic(stripDriverPrefix(name1));
  const s2 = normalizeArabic(stripDriverPrefix(name2));
  if (s1 && s2 && s1 === s2) return true;
  if (s1 && s2 && (s1.includes(s2) || s2.includes(s1))) return true;
  return false;
}

// Apply and lock custom phone to courier
function applyCustomPhoneToCourier(courier: Courier, phone: string, name?: string) {
  const formatted = formatPhoneWithPlus(phone);
  courier.phone = formatted;
  courier.customPhone = formatted;
  courier.isCustomPhone = true;
  courier.updatedAt = new Date().toISOString();

  const driverName = name || courier.name;
  const stripped = stripDriverPrefix(driverName);
  const normName = normalizeArabic(driverName);
  const normStripped = normalizeArabic(stripped);

  const entry = { phone: formatted, name: driverName, updatedAt: new Date().toISOString() };
  customCourierPhones[courier.id] = entry;
  if (normName) customCourierPhones[normName] = entry;
  if (normStripped) customCourierPhones[normStripped] = entry;

  courier.locatAccounts.forEach((acc) => {
    const aNorm = normalizeArabic(acc);
    const aStripped = normalizeArabic(stripDriverPrefix(acc));
    if (aNorm) customCourierPhones[aNorm] = entry;
    if (aStripped) customCourierPhones[aStripped] = entry;
  });

  // Immediately propagate this protected phone to all matching orders in the system
  orders.forEach((o) => {
    const match = findCourierForOrder(o.locatAccount, o.courierName, o.courierId, o.courierPhone);
    if (match && match.id === courier.id) {
      o.courierId = courier.id;
      o.courierName = courier.name;
      o.courierPhone = formatted;
    }
  });

  saveStoreToDisk();
}

// Helper: Match courier by Locat account, courier name, courier ID, or phone
function findCourierForOrder(account?: string, courierName?: string, courierId?: string, courierPhone?: string): Courier | undefined {
  if (courierId) {
    const foundById = couriers.find((c) => c.id === courierId);
    if (foundById) return foundById;
  }

  const cleanAccount = normalizeArabic(account || '');
  const cleanName = normalizeArabic(courierName || '');
  const cleanPhone = normalizeSaudiPhone(courierPhone || '');

  return couriers.find((c) => {
    // Phone match
    const cPhone = normalizeSaudiPhone(c.phone);
    if (cleanPhone && cPhone && (cleanPhone === cPhone || cleanPhone.endsWith(cPhone) || cPhone.endsWith(cleanPhone))) {
      return true;
    }

    // Name match with smart prefix stripping
    if (cleanName && matchDriverName(c.name, cleanName)) return true;
    if (cleanAccount && matchDriverName(c.name, cleanAccount)) return true;

    // Locat accounts list check
    const matchAccount = c.locatAccounts.some((acc) => {
      return matchDriverName(acc, cleanAccount) || matchDriverName(acc, cleanName);
    });
    if (matchAccount) return true;

    return false;
  });
}

// Helper: Match courier by Locat account
function findCourierByLocatAccount(account: string, courierName?: string): Courier | undefined {
  return findCourierForOrder(account, courierName);
}

// Helper: Get Saudi Arabia (Asia/Riyadh - GMT+3) formatted time string
function getRiyadhTimeString(date: Date = new Date(), options?: Intl.DateTimeFormatOptions): string {
  return date.toLocaleTimeString('ar-SA', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  });
}

// Helper: Construct Courier Message
function buildCourierMessage(order: Order, courierName: string): string {
  const isDelivered = order.isDelivered || order.status === 'delivered';
  const riyadhNow = getRiyadhTimeString();

  if (isDelivered) {
    return `السلام عليكم أخي ${courierName}،\nبخصوص الطلب ${order.id} (المسلّم):\n• المطعم: ${order.restaurant}\n• المدة المستغرقة: ${order.elapsedMinutes} دقيقة\n• وقت الاستلام: ${order.pickupTime || 'غير محدد'}\n• وقت الإشعار: ${riyadhNow}\nشكراً لجهودك!`;
  }

  return `السلام عليكم أخي ${courierName}،\nنود تذكيرك بأن الطلب ${order.id} متأخر وتجاوز ${order.elapsedMinutes} دقيقة منذ الاستلام.\n• وقت الاستلام: ${order.pickupTime || 'غير محدد'}\n• وقت التنبيه: ${riyadhNow}\n• المطعم: ${order.restaurant}\n• العميل: ${order.customerAddress || 'الوجهة المحددة'}\nيرجى سرعة تسليم الطلب للعميل والإفادة بحالة التوصيل الحالية. شاكرين تعاونك!`;
}

// Helper: Construct Admin Alert Message
function buildAdminMessage(order: Order, courierName: string, activeCount: number): string {
  const riyadhNow = getRiyadhTimeString();
  const isDelivered = order.isDelivered || order.status === 'delivered';

  if (isDelivered) {
    return `ℹ️ [إشعار طلب مسلّم - لوكيت]\n• رقم الطلب: ${order.id}\n• المندوب: ${courierName}\n• الحالة: تم التسليم بنجاح\n• المدة المستغرقة: ${order.elapsedMinutes} دقيقة\n• وقت الاستلام: ${order.pickupTime || 'غير محدد'}\n• وقت الإشعار: ${riyadhNow}\n• المطعم: ${order.restaurant}`;
  }

  return `🚨 [تنبيه تأخير طلب - لوكيت]\n• رقم الطلب: ${order.id}\n• المندوب: ${courierName}\n• المدة المستغرقة: ${order.elapsedMinutes} دقيقة (الحد المسموح: ${settings.delayThresholdMinutes} دقيقة)\n• وقت الاستلام: ${order.pickupTime || 'غير محدد'}\n• وقت التنبيه: ${riyadhNow}\n• عدد الطلبات النشطة بحوزته: ${activeCount} طلبات\n• المطعم: ${order.restaurant}\n• الحي: ${order.customerAddress || 'غير محدد'}`;
}

// Helper: Construct Admin Critical Delay Alert Message (Triggered at 45 minutes to check on courier)
function buildAdminCriticalDelayMessage(order: Order, courierName: string, courierPhone: string, activeCount: number): string {
  const riyadhNow = getRiyadhTimeString();
  const cleanCourierPhone = courierPhone ? formatPhoneForWhatsApp(courierPhone) : '';
  const waCourierDirectLink = cleanCourierPhone ? `https://wa.me/${cleanCourierPhone}` : '';

  let msg = `🚨 *[تنبيه تأخير حرج - تجاوز 45 دقيقة]*\n`;
  msg += `نحيطكم علماً بأن الطلب استمر بالتأخير وتجاوز *${order.elapsedMinutes} دقيقة* دون إتمام التسليم.\n`;
  msg += `يرجى التواصل الفوري مع المندوب لمتابعة الحالة.\n\n`;
  msg += `🛵 *بيانات المندوب للمتابعة:*\n`;
  msg += `• اسم المندوب: *${courierName}*\n`;
  msg += `• جوال المندوب: *${courierPhone || 'غير مسجل'}*\n`;
  msg += `• عدد الطلبات النشطة بحوزته: *${activeCount}* طلبات\n`;
  if (waCourierDirectLink) {
    msg += `💬 *رابط محادثة واتساب المباشرة مع المندوب:*\n${waCourierDirectLink}\n`;
  }
  msg += `\n📋 *تفاصيل الطلب:*\n`;
  msg += `• رقم الطلب: *${order.id}*\n`;
  msg += `• المطعم / المتجر: ${order.restaurant}\n`;
  msg += `• وجهة العميل: ${order.customerAddress || 'الوجهة المحددة'}\n`;
  msg += `• وقت الاستلام: ${order.pickupTime || 'غير محدد'}\n`;
  msg += `• المدة المستغرقة: *${order.elapsedMinutes} دقيقة* (تأخر عن 45 دقيقة)\n`;
  msg += `• وقت التنبيه: ${riyadhNow}\n`;
  msg += `───────────────────────\n`;
  msg += `⚠️ تم الإرسال آلياً بدون أي تدخل عبر نظام أتمتة لوكيت.`;

  return msg;
}

// Helper: Construct Admin 2 Escalation Message upon continued delay
function buildAdmin2Message(order: Order, courierName: string, courierPhone: string, activeCount: number): string {
  return buildAdminCriticalDelayMessage(order, courierName, courierPhone, activeCount);
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

// Helper: Trigger alerts for delayed orders automatically based on user policy:
// 1. Level 1: Delayed (>= delayThresholdMinutes) -> automatically alerts Courier
// 2. Level 2: Critical Delay (>= 45 minutes) -> automatically alerts Admin to inspect Courier
function triggerAlertsForOrder(order: Order) {
  const courier = findCourierForOrder(order.locatAccount, order.courierName, order.courierId, order.courierPhone);
  const courierName = courier ? courier.name : (order.courierName || 'المندوب');
  const courierPhone = (courier?.isCustomPhone && courier?.phone) || courier?.phone || order.courierPhone || '';
  const activeCount = order.activeOrdersHeldByCourier || (courier ? courier.activeOrdersCount : 1);

  if (courierPhone && !order.courierPhone) {
    order.courierPhone = courierPhone;
  }
  if (courier) {
    order.courierId = courier.id;
    order.courierName = courier.name;
  }

  // 1. Alert courier if delayed and not sent yet
  if (
    order.elapsedMinutes >= settings.delayThresholdMinutes &&
    !order.alertSentToCourier &&
    settings.autoAlertCourier &&
    courierPhone
  ) {
    const message = buildCourierMessage(order, courierName);
    enqueueAlert('courier', courierName, courierPhone, order.id, message, order.elapsedMinutes, activeCount);
    order.alertSentToCourier = true;
    order.courierAlertTime = getRiyadhTimeString();
    console.log(`[Auto-Alert Engine] 🛵 تم إرسال تنبيه تأخير تلقائي للمندوب: ${courierName} (${courierPhone}) للطلب ${order.id} (${order.elapsedMinutes} دقيقة)`);
  }

  // 2. Alert admin 1 if delay reaches 45 minutes (criticalDelayMinutes) so admin can check on courier
  const criticalMinutes = Number(settings.criticalDelayMinutes) || 45;
  if (
    order.elapsedMinutes >= criticalMinutes &&
    !order.alertSentToAdmin &&
    settings.autoAlertAdmin &&
    settings.adminPhone
  ) {
    const adminMsg = buildAdminCriticalDelayMessage(order, courierName, courierPhone, activeCount);
    enqueueAlert('admin', settings.adminName || 'مشرف العمليات', settings.adminPhone, order.id, adminMsg, order.elapsedMinutes, activeCount);
    order.alertSentToAdmin = true;
    order.adminAlertTime = getRiyadhTimeString();
    console.log(`[Auto-Alert Engine] 🚨 تم إرسال تنبيه تأخير حرج (45+ دقيقة) للمشرف: ${settings.adminPhone} لمتابعة المندوب ${courierName} للطلب ${order.id}`);
  }

  // 3. Alert Admin 2 upon continued delay (Escalation logic)
  if (
    order.elapsedMinutes >= criticalMinutes &&
    !order.alertSentToAdmin2 &&
    settings.autoAlertAdmin2 &&
    settings.adminPhone2
  ) {
    const admin2Msg = buildAdminCriticalDelayMessage(order, courierName, courierPhone, activeCount);
    enqueueAlert('admin2', settings.adminName2 || 'إدارة العمليات 2', settings.adminPhone2, order.id, admin2Msg, order.elapsedMinutes, activeCount);
    order.alertSentToAdmin2 = true;
    order.admin2AlertTime = getRiyadhTimeString();
  }
}

// 24/7 Dedicated Real-Time Order Watcher & Automated Dispatch Engine
let autoAlertsWatcherInterval: NodeJS.Timeout | null = null;

function setupAutomatedAlertsWatcher() {
  if (autoAlertsWatcherInterval) {
    clearInterval(autoAlertsWatcherInterval);
    autoAlertsWatcherInterval = null;
  }

  console.log('[Auto-Alert Engine] 🟢 تفعيل محرك الفحص والإرسال التلقائي للتنبيهات 24/7 كل 25 ثانية بدون أي تدخل بشري');

  // Immediate check after 2 seconds
  setTimeout(() => {
    checkAndTriggerAutomatedAlerts();
  }, 2000);

  autoAlertsWatcherInterval = setInterval(() => {
    checkAndTriggerAutomatedAlerts();
  }, 25 * 1000);
}

function checkAndTriggerAutomatedAlerts() {
  const now = Date.now();
  let stateChanged = false;

  orders.forEach((order) => {
    if (order.isDelivered || order.isCanceled || order.status === 'delivered' || order.status === 'cancelled') {
      return;
    }

    // Recalculate live elapsed time in minutes
    const startIso = order.assignedAt || order.createdAt;
    if (startIso) {
      const startTime = new Date(startIso).getTime();
      if (!isNaN(startTime) && startTime > 0) {
        order.elapsedMinutes = Math.max(0, Math.floor((now - startTime) / 60000));
      }
    }

    const isDelayed = order.elapsedMinutes >= settings.delayThresholdMinutes;
    order.isDelayed = isDelayed;
    if (isDelayed && order.status !== 'delayed') {
      order.status = 'delayed';
      stateChanged = true;
    }

    const courier = findCourierForOrder(order.locatAccount, order.courierName, order.courierId, order.courierPhone);
    const courierName = courier ? courier.name : (order.courierName || 'المندوب');
    const courierPhone = (courier?.isCustomPhone && courier?.phone) || courier?.phone || order.courierPhone || '';
    const activeCount = order.activeOrdersHeldByCourier || (courier ? courier.activeOrdersCount : 1);

    if (courierPhone && order.courierPhone !== courierPhone) {
      order.courierPhone = courierPhone;
      stateChanged = true;
    }
    if (courier && (!order.courierId || order.courierName !== courier.name)) {
      order.courierId = courier.id;
      order.courierName = courier.name;
      stateChanged = true;
    }

    // Rule 1: إذا تأخر الطلب: يرسل للمندوب فوراً
    if (
      isDelayed &&
      !order.alertSentToCourier &&
      settings.autoAlertCourier &&
      courierPhone
    ) {
      const courierMsg = buildCourierMessage(order, courierName);
      enqueueAlert('courier', courierName, courierPhone, order.id, courierMsg, order.elapsedMinutes, activeCount);
      order.alertSentToCourier = true;
      order.courierAlertTime = getRiyadhTimeString();
      stateChanged = true;
      console.log(`[Auto-Alert Watcher] 🛵 إرسال تلقائي لتنبيه المندوب: ${courierName} (${courierPhone}) - الطلب ${order.id} (${order.elapsedMinutes} دقيقة)`);
    }

    // Rule 2: إذا تأخر عن 45 دقيقة: يرسل للمشرف/الإدارة عشان يشوف المندوب
    const criticalMinutes = Number(settings.criticalDelayMinutes) || 45;
    if (
      order.elapsedMinutes >= criticalMinutes &&
      !order.alertSentToAdmin &&
      settings.autoAlertAdmin &&
      settings.adminPhone
    ) {
      const adminCriticalMsg = buildAdminCriticalDelayMessage(order, courierName, courierPhone, activeCount);
      enqueueAlert('admin', settings.adminName || 'مشرف العمليات', settings.adminPhone, order.id, adminCriticalMsg, order.elapsedMinutes, activeCount);
      order.alertSentToAdmin = true;
      order.adminAlertTime = getRiyadhTimeString();
      stateChanged = true;
      console.log(`[Auto-Alert Watcher] 🚨 إرسال تلقائي لتنبيه المشرف (تجاوز 45 دقيقة): ${settings.adminPhone} لمتابعة المندوب ${courierName} - الطلب ${order.id}`);
    }

    // Rule 3: تصعيد الإدارة 2 (إذا كان مسجلاً)
    if (
      order.elapsedMinutes >= criticalMinutes &&
      !order.alertSentToAdmin2 &&
      settings.autoAlertAdmin2 &&
      settings.adminPhone2
    ) {
      const admin2Msg = buildAdminCriticalDelayMessage(order, courierName, courierPhone, activeCount);
      enqueueAlert('admin2', settings.adminName2 || 'إدارة العمليات 2', settings.adminPhone2, order.id, admin2Msg, order.elapsedMinutes, activeCount);
      order.alertSentToAdmin2 = true;
      order.admin2AlertTime = getRiyadhTimeString();
      stateChanged = true;
    }
  });

  if (stateChanged) {
    saveStoreToDisk();
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
  waText += `⏰ *وقت التوليد:* ${getRiyadhTimeString()}\n`;
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
    locateUsername: (body.locateUsername !== undefined ? body.locateUsername : (body.locateEmail !== undefined ? body.locateEmail : settings.locateUsername))?.trim(),
    locatePassword: body.locatePassword !== undefined ? body.locatePassword.trim() : settings.locatePassword,
    locateEmail: (body.locateEmail !== undefined ? body.locateEmail : (body.locateUsername !== undefined ? body.locateUsername : settings.locateEmail))?.trim(),
    locateCompanyId: body.locateCompanyId !== undefined ? String(body.locateCompanyId).trim() : settings.locateCompanyId,
    locateAccessToken: body.locateAccessToken !== undefined ? body.locateAccessToken.trim() : settings.locateAccessToken,
    enableCloudAutoSync: body.enableCloudAutoSync !== undefined ? Boolean(body.enableCloudAutoSync) : settings.enableCloudAutoSync,
    locatSyncIntervalSeconds: Number(body.locatSyncIntervalSeconds) || settings.locatSyncIntervalSeconds,
  };

  if (settings.locateEmail || settings.locatePassword || settings.locateAccessToken) {
    saveLocatCredentialsToDisk();
  }

  puppeteerStatus.enabled = settings.enablePuppeteerHeadless;

  // Reconfigure 24/7 automated Cloud Auto-Sync and Puppeteer runners
  setupCloudAutoSyncRunner();
  setupPuppeteer247Runner();
  setupAutomatedAlertsWatcher();

  // Re-evaluate current orders delay state based on new threshold
  orders.forEach((o) => {
    o.isDelayed = o.elapsedMinutes >= settings.delayThresholdMinutes;
    if (o.isDelayed && o.status !== 'delayed' && o.status !== 'delivered') {
      o.status = 'delayed';
    }
  });

  // Evaluate any pending alerts immediately
  checkAndTriggerAutomatedAlerts();

  saveStoreToDisk();
  res.json({ success: true, settings, message: 'تم تحديث الإعدادات بنجاح' });
});

// Dedicated Instant WhatsApp Contact & Webhook Link persistence
app.post('/api/settings/whatsapp-contact', (req: Request, res: Response) => {
  const body = req.body;
  if (body.adminPhone !== undefined) settings.adminPhone = String(body.adminPhone).trim();
  if (body.adminName !== undefined) settings.adminName = String(body.adminName).trim();
  if (body.adminPhone2 !== undefined) settings.adminPhone2 = String(body.adminPhone2).trim();
  if (body.adminName2 !== undefined) settings.adminName2 = String(body.adminName2).trim();
  if (body.webhookUrl !== undefined) settings.webhookUrl = String(body.webhookUrl).trim();
  if (body.webhookApiKey !== undefined) settings.webhookApiKey = String(body.webhookApiKey).trim();
  if (body.whatsAppProvider) settings.whatsAppProvider = body.whatsAppProvider;

  // Re-run watcher to catch any pending alerts for the newly configured admin phone
  checkAndTriggerAutomatedAlerts();

  saveStoreToDisk();
  console.log(`[Settings Engine] 💾 تم حفظ وتثبيت بيانات الواتساب ورقم التواصل بنجاح: الإدارة: ${settings.adminPhone || 'غير محدد'}, الرابط: ${settings.webhookUrl || 'غير محدد'}`);
  res.json({
    success: true,
    settings,
    message: 'تم حفظ وتثبيت رقم التواصل ورابط الواتساب بنجاح في قاعدة البيانات',
  });
});

// Endpoint to manually or programmatically trigger an automated alert cycle on demand
app.post('/api/alerts/trigger-check', (req: Request, res: Response) => {
  checkAndTriggerAutomatedAlerts();
  res.json({
    success: true,
    message: 'تم تشغيل فحص وإرسال التنبيهات التلقائية بنجاح',
    delayedCount: orders.filter((o) => o.isDelayed).length,
    criticalDelayedCount: orders.filter((o) => o.elapsedMinutes >= (Number(settings.criticalDelayMinutes) || 45)).length,
  });
});

// 2. Couriers Management
app.get('/api/couriers', (req: Request, res: Response) => {
  // Update activeOrdersCount based on current orders using flexible smart matching
  const enrichedCouriers = couriers.map((c) => {
    const activeCount = orders.filter((o) => {
      const match = findCourierForOrder(o.locatAccount, o.courierName, o.courierId, o.courierPhone);
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

  const formattedPhone = formatPhoneWithPlus(phone);

  if (id) {
    // Update existing courier
    const index = couriers.findIndex((c) => c.id === id);
    if (index !== -1) {
      couriers[index] = {
        ...couriers[index],
        name,
        locatAccounts: accountsArray.length > 0 ? accountsArray : couriers[index].locatAccounts,
        phone: formattedPhone,
        customPhone: formattedPhone,
        isCustomPhone: true,
        notes: notes !== undefined ? notes : couriers[index].notes,
        status: status || couriers[index].status,
        updatedAt: new Date().toISOString(),
      };

      applyCustomPhoneToCourier(couriers[index], formattedPhone, name);

      res.json({ success: true, courier: couriers[index], message: 'تم تحديث بيانات المندوب وتثبيت الرقم بنجاح' });
      return;
    }
  }

  // Create new courier
  const newCourier: Courier = {
    id: `c-${Date.now()}`,
    name,
    locatAccounts: accountsArray.length > 0 ? accountsArray : [name],
    phone: formattedPhone,
    customPhone: formattedPhone,
    isCustomPhone: true,
    status: status || 'active',
    activeOrdersCount: 0,
    totalDeliveredToday: 0,
    avgDeliveryTimeMinutes: 25,
    delayedOrdersCount: 0,
    notes: notes || '',
    updatedAt: new Date().toISOString(),
  };

  couriers.push(newCourier);
  applyCustomPhoneToCourier(newCourier, formattedPhone, name);

  res.json({ success: true, courier: newCourier, message: 'تمت إضافة المندوب وتثبيت الرقم بنجاح' });
});

// Dedicated quick inline phone update & lock
app.post('/api/couriers/update-phone', (req: Request, res: Response) => {
  const { courierId, orderId, courierName, phone } = req.body;
  if (!phone) {
    res.status(400).json({ success: false, message: 'رقم الهاتف مطلوب' });
    return;
  }

  const formattedPhone = formatPhoneWithPlus(phone);
  let courier: Courier | undefined;

  if (courierId) {
    courier = couriers.find((c) => c.id === courierId);
  }
  if (!courier && orderId) {
    const order = orders.find((o) => o.id === orderId);
    if (order) {
      courier = findCourierForOrder(order.locatAccount, order.courierName, order.courierId, order.courierPhone);
    }
  }
  if (!courier && courierName) {
    courier = couriers.find((c) => matchDriverName(c.name, courierName));
  }

  if (courier) {
    applyCustomPhoneToCourier(courier, formattedPhone, courier.name);
  } else {
    // Create new courier with this custom phone
    const newCourier: Courier = {
      id: courierId || `c-${Date.now()}`,
      name: courierName || 'مندوب لوكيت',
      locatAccounts: [courierName].filter(Boolean) as string[],
      phone: formattedPhone,
      isCustomPhone: true,
      customPhone: formattedPhone,
      status: 'active',
      activeOrdersCount: 0,
      totalDeliveredToday: 0,
      avgDeliveryTimeMinutes: 25,
      delayedOrdersCount: 0,
      updatedAt: new Date().toISOString(),
    };
    couriers.push(newCourier);
    applyCustomPhoneToCourier(newCourier, formattedPhone, newCourier.name);
    courier = newCourier;
  }

  // Update order directly if orderId provided
  if (orderId) {
    const o = orders.find((ord) => ord.id === orderId);
    if (o) {
      o.courierPhone = formattedPhone;
      if (courier) {
        o.courierId = courier.id;
        o.courierName = courier.name;
      }
    }
  }

  saveStoreToDisk();
  console.log(`[Couriers] 🔒 تم تثبيت رقم المندوب (${courier.name}): ${formattedPhone} وحمايته من التغيير.`);

  res.json({
    success: true,
    message: `تم تثبيت وتأمين رقم المندوب (${courier.name}) بنجاح: ${formattedPhone}`,
    courier,
    phone: formattedPhone,
  });
});

// Restore custom phones from browser localStorage backup
app.post('/api/couriers/restore-custom', (req: Request, res: Response) => {
  const { customPhones } = req.body;
  if (!customPhones || typeof customPhones !== 'object') {
    res.json({ success: true, count: 0 });
    return;
  }

  let restoredCount = 0;
  for (const [key, data] of Object.entries(customPhones)) {
    const phone = typeof data === 'string' ? data : (data as any)?.phone;
    const name = typeof data === 'string' ? '' : (data as any)?.name;
    if (!phone) continue;

    const formatted = formatPhoneWithPlus(phone);
    const courier = couriers.find((c) => c.id === key || matchDriverName(c.name, key) || (name && matchDriverName(c.name, name)));
    if (courier) {
      applyCustomPhoneToCourier(courier, formatted, courier.name);
      restoredCount++;
    } else {
      customCourierPhones[key] = { phone: formatted, name: name || key, updatedAt: new Date().toISOString() };
    }
  }

  saveStoreToDisk();
  console.log(`[Couriers] 🔄 تم استعادة وتثبيت ${restoredCount} أرقام مناديب مخصصة من النسخة الاحتياطية.`);
  res.json({ success: true, restoredCount });
});

app.delete('/api/couriers/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  couriers = couriers.filter((c) => c.id !== id);
  saveStoreToDisk();
  res.json({ success: true, message: 'تم حذف المندوب بنجاح' });
});

// 3. Orders & Live Locat Fetching / Sync
app.get('/api/orders', (req: Request, res: Response) => {
  // Update dynamic elapsed times and delay status for live ongoing orders
  orders.forEach((order) => {
    if (!order.isDelivered && !order.isCanceled && (order.assignedAt || order.createdAt)) {
      const startTime = new Date(order.assignedAt || order.createdAt).getTime();
      order.elapsedMinutes = Math.max(0, Math.floor((Date.now() - startTime) / 60000));
      order.isDelayed = order.elapsedMinutes >= settings.delayThresholdMinutes;
      if (order.isDelayed) {
        order.status = 'delayed';
      } else {
        order.status = 'in_transit';
      }
    }
  });
  res.json({ success: true, orders, delayThreshold: settings.delayThresholdMinutes });
});

// Helper: Common ingestion and alert evaluation function for orders from any source
function ingestLiveOrders(liveOrders: any[], sourceName: string = 'Locat'): { count: number; alertsGenerated: number; newlyDelayedCount: number } {
  let newlyDelayedCount = 0;
  let alertsGenerated = 0;

  liveOrders.forEach((incoming: any) => {
    const orderId = incoming.id || incoming.orderId || `#LOC-${Math.floor(1000 + Math.random() * 9000)}`;
    const locatAccount = incoming.locatAccount || incoming.courierAccount || incoming.driverId || '';
    const elapsedMinutes = Number(incoming.elapsedMinutes) || 0;
    const isDelayed = elapsedMinutes >= settings.delayThresholdMinutes;

    const matchedCourier = findCourierForOrder(locatAccount, incoming.courierName, incoming.courierId, incoming.courierPhone);

    const existingIndex = orders.findIndex((o) => o.id === orderId);

    if (existingIndex !== -1) {
      const existing = orders[existingIndex];
      existing.elapsedMinutes = elapsedMinutes;
      existing.isDelayed = isDelayed;
      existing.status = incoming.status || (isDelayed ? 'delayed' : existing.status);
      existing.restaurant = incoming.restaurant || existing.restaurant;
      existing.customerAddress = incoming.customerAddress || existing.customerAddress;
      if (matchedCourier) {
        existing.courierId = matchedCourier.id;
        existing.courierName = matchedCourier.name;
        existing.courierPhone = matchedCourier.phone;
      }
      existing.activeOrdersHeldByCourier = incoming.activeOrdersHeldByCourier || (matchedCourier ? matchedCourier.activeOrdersCount : existing.activeOrdersHeldByCourier);
      existing.lastUpdated = new Date().toISOString();

      const shouldTrigger = !existing.isDelivered && !existing.isCanceled && (
        (isDelayed && !existing.alertSentToCourier) ||
        (existing.elapsedMinutes >= (Number(settings.criticalDelayMinutes) || 45) && (!existing.alertSentToAdmin || !existing.alertSentToAdmin2))
      );

      if (shouldTrigger) {
        triggerAlertsForOrder(existing);
        alertsGenerated++;
      }
    } else {
      // New incoming order
      const newOrder: Order = {
        id: orderId,
        locatAccount: locatAccount || (matchedCourier ? matchedCourier.locatAccounts[0] : ''),
        courierId: matchedCourier?.id,
        courierName: matchedCourier?.name || incoming.courierName || 'مندوب غير مسجل',
        courierPhone: matchedCourier?.phone || incoming.courierPhone || '',
        restaurant: incoming.restaurant || 'مطعم شريك',
        customerAddress: incoming.customerAddress || 'الوجهة المحددة',
        pickupTime: incoming.pickupTime || getRiyadhTimeString(),
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

  // Re-calculate active orders count for all couriers
  couriers.forEach((c) => {
    c.activeOrdersCount = orders.filter((o) => {
      const match = findCourierForOrder(o.locatAccount, o.courierName, o.courierId, o.courierPhone);
      return match ? match.id === c.id : false;
    }).length;
  });

  saveStoreToDisk();
  return { count: liveOrders.length, alertsGenerated, newlyDelayedCount };
}

// POST /api/locat/sync: The ingestion endpoint called by the Locat Automation Script
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

  const result = ingestLiveOrders(liveOrders, 'Tampermonkey Script');

  res.json({
    success: true,
    message: `تمت المزامنة بنجاح من لوكيت: تم استلام ${result.count} طلب، وتوليد ${result.alertsGenerated} تنبيه`,
    totalActiveOrders: orders.length,
    alertsGenerated: result.alertsGenerated,
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

  saveStoreToDisk();
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
    order.courierAlertTime = getRiyadhTimeString();
  }

  if (target === 'admin' || target === 'both') {
    const adminMsg = buildAdminMessage(order, courierName, activeCount);
    const cleanAdmin = formatPhoneForWhatsApp(settings.adminPhone);
    adminLink = `https://wa.me/${cleanAdmin}?text=${encodeURIComponent(adminMsg)}`;

    enqueueAlert('admin', settings.adminName || 'الإدارة الأولى', settings.adminPhone, order.id, adminMsg, order.elapsedMinutes, activeCount);
    order.alertSentToAdmin = true;
    order.adminAlertTime = getRiyadhTimeString();
  }

  if (target === 'admin2') {
    const admin2Msg = buildAdmin2Message(order, courierName, courierPhone, activeCount);
    const cleanAdmin2 = formatPhoneForWhatsApp(settings.adminPhone2);
    admin2Link = `https://wa.me/${cleanAdmin2}?text=${encodeURIComponent(admin2Msg)}`;

    enqueueAlert('admin2', settings.adminName2 || 'الإدارة الثانية', settings.adminPhone2, order.id, admin2Msg, order.elapsedMinutes, activeCount);
    order.alertSentToAdmin2 = true;
    order.admin2AlertTime = getRiyadhTimeString();
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

// Health check endpoint for Render keep-alive and cloud load balancers
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    riyadhTime: getRiyadhTimeString(),
    whatsappStatus: whatsappState.status,
    whatsappLoggedIn: whatsappState.isLoggedIn,
    ordersCount: orders.length,
    couriersCount: couriers.length,
    persistentDir: PERSISTENT_DIR,
    hasSavedSession: fs.existsSync(path.join(AUTH_DIR, 'creds.json')),
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
    persistentDir: PERSISTENT_DIR,
    hasSavedSession,
    hasBackupInDb: Boolean(whatsappSessionBackup && whatsappSessionBackup['creds.json']),
    sessionBackup: whatsappSessionBackup,
    isRender: Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL),
    renderExternalUrl: process.env.RENDER_EXTERNAL_URL || null,
    cooldownMinutes: settings.alertCooldownMinutes,
    antiBanMinDelay: settings.antiBanMinDelaySeconds,
    antiBanMaxDelay: settings.antiBanMaxDelaySeconds,
  });
});

// Export Session Payload (can be downloaded or copied to another server/localStorage)
app.get('/api/whatsapp/export-session', (req: Request, res: Response) => {
  const hasSession = Boolean(whatsappSessionBackup && whatsappSessionBackup['creds.json']);
  res.json({
    success: true,
    hasSession,
    filesCount: Object.keys(whatsappSessionBackup || {}).length,
    sessionBackup: whatsappSessionBackup || {},
    userPhone: whatsappState.userPhone,
    userName: whatsappState.userName,
    exportedAt: new Date().toISOString(),
  });
});

// Restore Session from Payload (called from UI, localStorage, or migration)
app.post('/api/whatsapp/restore-session', async (req: Request, res: Response) => {
  const { sessionBackup } = req.body;
  if (!sessionBackup || typeof sessionBackup !== 'object' || !sessionBackup['creds.json']) {
    res.status(400).json({
      success: false,
      message: 'بيانات الجلسة المرسلة غير صالحة أو لا تحتوي على مفتاح creds.json الأساسي',
    });
    return;
  }

  const restored = restoreBaileysSessionFromBackup(sessionBackup);
  if (restored) {
    console.log('[Baileys Engine] 📥 تم استلام واستعادة مفاتيح الجلسة من الواجهة الخارجية بنجاح. جاري الاتصال المباشر...');
    connectToWhatsApp(false);
    res.json({
      success: true,
      message: 'تم استيراد وحفظ جلسة الواتساب بنجاح، جاري التحقق والاتصال التلقائي بدون QR!',
      whatsappState,
    });
  } else {
    res.status(500).json({
      success: false,
      message: 'تعذر حفظ ملفات الجلسة في مسار السيرفر',
    });
  }
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
  const textToSend = message || `مرحباً ${recipientName}،\nرسالة فحص مباشر من نظام أتمتة ومتابعة لوكيت.\nالتوقيت: ${getRiyadhTimeString()}\n✅ الربط يعمل ومستقر على السيرفر.`;
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
    // Puppeteer is stripped in the container cloud environment per migration guidelines.
    // Real-time synchronization is handled directly via the Tampermonkey Userscript (supplier.locate.sa/orders).
    console.warn('[Puppeteer 24/7] محرك Puppeteer غير متاح في بيئة الحاويات السحابية. يرجى استخدام إضافة المتصفح (Tampermonkey) للربط المباشر.');
    puppeteerStatus.lastError = 'محرك Puppeteer غير مدعوم في بيئة الحاويات السحابية - يرجى استخدام سكربت المتصفح التلقائي Tampermonkey للمزامنة الحية';
    puppeteerStatus.status = 'idle';
  } catch (err: any) {
    console.warn('[Puppeteer 24/7] خطأ Puppeteer:', err.message);
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

// ============================================================================
// 5.3 DIRECT CLOUD AUTO-SYNC ENGINE (سحب البيانات السحابي التلقائي 24/7 بدون أي تدخل)
// ============================================================================

async function autoLoginToLocatCloud(email: string, password: string, companyId?: string): Promise<{ token?: string; companyId?: string; error?: string }> {
  try {
    let resolvedCompanyId = companyId?.trim();

    // If companyId is not provided, fetch companies via pre-login endpoint
    if (!resolvedCompanyId) {
      try {
        const preRes = await fetch('https://api.supplier.locate.sa/api/v1/partners/pre-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim() }),
        });
        if (preRes.ok) {
          const preData: any = await preRes.json();
          if (Array.isArray(preData.companies) && preData.companies.length > 0) {
            resolvedCompanyId = String(preData.companies[0].id);
          }
        }
      } catch (preErr) {
        console.warn('[Cloud Auto-Sync] pre-login error:', preErr);
      }
    }

    if (!resolvedCompanyId) {
      resolvedCompanyId = '1'; // Default fallback company ID
    }

    const loginRes = await fetch('https://api.supplier.locate.sa/api/v1/partners/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        password: password.trim(),
        company_id: String(resolvedCompanyId),
      }),
    });

    const loginData: any = await loginRes.json();

    if (!loginRes.ok) {
      const errMsg = loginData.message || loginData.error || 'فشل تسجيل الدخول إلى لوكيت';
      return { error: Array.isArray(errMsg) ? errMsg.join(', ') : String(errMsg) };
    }

    const token = loginData.accessToken || loginData.token || loginData.access_token || loginData.data?.accessToken;
    if (!token) {
      return { error: 'لم يُرجع خادم لوكيت رمز التفويض (Access Token)' };
    }

    return { token, companyId: resolvedCompanyId };
  } catch (err: any) {
    return { error: err.message || 'تعذر الاتصال بخادم تسجيل الدخول إلى لوكيت' };
  }
}

async function executeLocatCloudSync(): Promise<{ success: boolean; count: number; activeCount: number; couriersCount: number; message: string; orders?: any[] }> {
  if (cloudSyncState.status === 'syncing') {
    return { success: false, count: 0, activeCount: 0, couriersCount: 0, message: 'عملية السحب جارية حالياً...' };
  }

  if (settings.enableCloudAutoSync === false) {
    cloudSyncState.status = 'idle';
    return { success: false, count: 0, activeCount: 0, couriersCount: 0, message: 'السحب التلقائي السحابي معطل في الإعدادات' };
  }

  const email = settings.locateEmail?.trim() || settings.locateUsername?.trim();
  const password = settings.locatePassword?.trim();
  let token = settings.locateAccessToken?.trim();
  const companyId = settings.locateCompanyId?.trim() || '';

  // If we have credentials but no token, perform auto-login
  if (!token && email && password) {
    console.log(`[Cloud Auto-Sync] 🔐 تسجيل دخول تلقائي إلى لوكيت للحساب (${email})...`);
    cloudSyncState.status = 'syncing';
    const loginResult = await autoLoginToLocatCloud(email, password, companyId);
    if (loginResult.token) {
      token = loginResult.token;
      settings.locateAccessToken = token;
      if (loginResult.companyId && !settings.locateCompanyId) {
        settings.locateCompanyId = loginResult.companyId;
      }
      saveStoreToDisk();
      console.log(`[Cloud Auto-Sync] ✅ تم تسجيل الدخول واستخراج الرمز بنجاح!`);
    } else {
      cloudSyncState.status = 'error';
      cloudSyncState.lastError = loginResult.error || 'فشل تسجيل الدخول التلقائي';
      return { success: false, count: 0, activeCount: 0, couriersCount: 0, message: cloudSyncState.lastError };
    }
  }

  if (!token) {
    cloudSyncState.status = 'unauthenticated';
    cloudSyncState.hasCredentials = Boolean(email && password);
    cloudSyncState.hasToken = false;
    cloudSyncState.isConfigured = false;
    cloudSyncState.lastError = 'يرجى حفظ بيانات حساب لوكيت (البريد وكلمة المرور) أو رمز الدخول (Token) للبدء في السحب التلقائي المستمر';
    return { success: false, count: 0, activeCount: 0, couriersCount: 0, message: cloudSyncState.lastError };
  }

  cloudSyncState.status = 'syncing';
  console.log('[Cloud Auto-Sync] 📡 جاري سحب أحدث بيانات المناديب والطلبات من سيرفر لوكيت المباشر...');

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
  };
  if (companyId) {
    headers['company-id'] = companyId;
  }

  try {
    // 1. Fetch Couriers / Drivers from Locate
    let allLocatDrivers: any[] = [];
    let driverPage = 1;
    let driversTotal = 0;

    try {
      while (driverPage <= 5) {
        const driversRes = await fetch(`https://api.supplier.locate.sa/api/v1/suppliers/drivers?page=${driverPage}&limit=100`, {
          method: 'GET',
          headers,
        });

        if (driversRes.status === 401 && email && password) {
          console.log('[Cloud Auto-Sync] ⚠️ انتهت صلاحية الرمز أثناء جلب المناديب، جاري التجديد...');
          const relogin = await autoLoginToLocatCloud(email, password, companyId);
          if (relogin.token) {
            token = relogin.token;
            settings.locateAccessToken = token;
            headers['Authorization'] = `Bearer ${token}`;
            saveStoreToDisk();
            continue;
          }
        }

        if (!driversRes.ok) break;

        const driversJson: any = await driversRes.json();
        const pageDrivers = driversJson.data?.results || [];
        if (!Array.isArray(pageDrivers) || pageDrivers.length === 0) break;

        allLocatDrivers.push(...pageDrivers);
        driversTotal = driversJson.data?.total || pageDrivers.length;
        if (allLocatDrivers.length >= driversTotal) break;
        driverPage++;
      }
    } catch (driverErr: any) {
      console.warn('[Cloud Auto-Sync] تعذر جلب قائمة المناديب:', driverErr.message);
    }

    // Merge fetched drivers into internal couriers list
    allLocatDrivers.forEach((driver: any) => {
      const driverId = String(driver._id || driver.id || '');
      const driverName = String(driver.name || `${driver.firstName || ''} ${driver.lastName || ''}`).trim();
      const rawPhone = normalizeSaudiPhone(String(driver.phone || driver.mobile || ''));
      const formattedPhone = rawPhone ? `+${rawPhone}` : '';

      const existingIdx = couriers.findIndex(
        (c) => c.id === driverId || 
               c.locatAccounts.includes(driverId) || 
               matchDriverName(c.name, driverName) ||
               c.locatAccounts.some((acc) => matchDriverName(acc, driverName))
      );

      // Check if this driver has a custom locked phone
      const customEntry = (existingIdx !== -1 && customCourierPhones[couriers[existingIdx].id]) ||
                          (driverId && customCourierPhones[driverId]) ||
                          (driverName && customCourierPhones[normalizeArabic(driverName)]) ||
                          (driverName && customCourierPhones[normalizeArabic(stripDriverPrefix(driverName))]);

      if (existingIdx !== -1) {
        const existing = couriers[existingIdx];

        // STRICT PROTECTION: If user manually edited phone, DO NOT overwrite it with Locat's phone!
        if (existing.isCustomPhone || customEntry) {
          if (customEntry && customEntry.phone) {
            existing.phone = customEntry.phone;
            existing.customPhone = customEntry.phone;
          }
          existing.isCustomPhone = true;
        } else if (formattedPhone && (!existing.phone || existing.phone.length < 10)) {
          existing.phone = formattedPhone;
        }

        if (driverId && !existing.locatAccounts.includes(driverId)) {
          existing.locatAccounts.push(driverId);
        }
        if (driverName && !existing.locatAccounts.includes(driverName)) {
          existing.locatAccounts.push(driverName);
        }
        existing.status = driver.isActive === false ? 'idle' : 'active';
        existing.firstName = driver.firstName || existing.firstName;
        existing.lastName = driver.lastName || existing.lastName;
        existing.idNumber = driver.id_number || existing.idNumber;
        existing.cityId = driver.city_id || existing.cityId;
        existing.gift = typeof driver.gift === 'number' ? driver.gift : existing.gift;
        existing.balance = typeof driver.balance === 'number' ? driver.balance : existing.balance;
        existing.updatedAt = new Date().toISOString();
      } else {
        const finalPhone = customEntry?.phone || formattedPhone || '';
        couriers.push({
          id: driverId || `c-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: driverName || 'مندوب لوكيت',
          firstName: driver.firstName || '',
          lastName: driver.lastName || '',
          idNumber: driver.id_number || '',
          cityId: driver.city_id || '',
          gift: typeof driver.gift === 'number' ? driver.gift : 0,
          balance: typeof driver.balance === 'number' ? driver.balance : 0,
          locatAccounts: [driverName, driverId].filter(Boolean),
          phone: finalPhone,
          customPhone: customEntry?.phone,
          isCustomPhone: Boolean(customEntry),
          status: driver.isActive === false ? 'idle' : 'active',
          activeOrdersCount: 0,
          totalDeliveredToday: 0,
          avgDeliveryTimeMinutes: 25,
          delayedOrdersCount: 0,
          updatedAt: new Date().toISOString(),
        });
      }
    });

    // 2. Fetch Orders from Locate (Support multi-page up to recent orders)
    let rawList: any[] = [];
    let orderPage = 1;
    const maxOrderPages = 3; // 300 most recent orders

    while (orderPage <= maxOrderPages) {
      const ordersUrl = `https://api.supplier.locate.sa/api/v2/orders?page=${orderPage}&limit=100`;
      let fetchRes = await fetch(ordersUrl, {
        method: 'GET',
        headers,
      });

      // If 401 Unauthorized, attempt auto re-login
      if (fetchRes.status === 401 && email && password) {
        console.log('[Cloud Auto-Sync] ⚠️ انتهت صلاحية الرمز أثناء جلب الطلبات، جاري التجديد...');
        const reloginRes = await autoLoginToLocatCloud(email, password, companyId);
        if (reloginRes.token) {
          token = reloginRes.token;
          settings.locateAccessToken = token;
          headers['Authorization'] = `Bearer ${token}`;
          saveStoreToDisk();
          fetchRes = await fetch(ordersUrl, {
            method: 'GET',
            headers,
          });
        }
      }

      if (!fetchRes.ok) {
        if (orderPage === 1) {
          const errText = await fetchRes.text();
          throw new Error(`استجابة خادم لوكيت (${fetchRes.status}): ${errText.slice(0, 100)}`);
        }
        break;
      }

      const json: any = await fetchRes.json();
      const pageOrders: any[] = Array.isArray(json)
        ? json
        : (Array.isArray(json.results)
          ? json.results
          : (Array.isArray(json.data?.results)
            ? json.data.results
            : (Array.isArray(json.data)
              ? json.data
              : (Array.isArray(json.orders) ? json.orders : []))));

      if (!Array.isArray(pageOrders) || pageOrders.length === 0) break;
      rawList.push(...pageOrders);
      if (pageOrders.length < 100) break;
      orderPage++;
    }

    console.log(`[Cloud Auto-Sync] 📦 تم استلام ${rawList.length} طلب مباشر من لوكيت عبر ${orderPage - 1} صفحات، و ${couriers.length} مندوب`);

    let activeCount = 0;
    let alertsGenerated = 0;
    let newlyDelayedCount = 0;

    const syncedOrders: Order[] = [];
    const seenOrderIds = new Set<string>();

    rawList.forEach((item: any) => {
      const isDelivered = Boolean(item.isDelivered);
      const isCanceled = Boolean(item.isCanceled);
      const rawNum = item.order_number || item.orderNumber || item._id || item.id || '';
      // Retain exact Locate order format (e.g. L22295770)
      const orderId = rawNum ? String(rawNum).trim() : `LOC-${Math.floor(1000 + Math.random() * 9000)}`;

      if (seenOrderIds.has(orderId)) return;
      seenOrderIds.add(orderId);

      const driverId = String(item.driver_id || item.driverId || '').trim();
      const driverName = String(item.driver_name || item.driverName || item.delegate || item.driver?.name || '').trim();

      // Match courier with smart prefix stripping and custom phone registry
      let matchedCourier = findCourierForOrder(driverId, driverName, driverId, item.driver_phone);

      const customEntry = (matchedCourier && customCourierPhones[matchedCourier.id]) ||
                          (driverId && customCourierPhones[driverId]) ||
                          (driverName && (customCourierPhones[normalizeArabic(driverName)] || customCourierPhones[normalizeArabic(stripDriverPrefix(driverName))]));

      if (!matchedCourier && (driverId || driverName)) {
        const initialPhone = customEntry?.phone || (item.driver_phone ? formatPhoneWithPlus(item.driver_phone) : '');
        matchedCourier = {
          id: driverId || `c-${Date.now()}`,
          name: driverName || 'مندوب لوكيت',
          locatAccounts: [driverName, driverId].filter(Boolean),
          phone: initialPhone,
          customPhone: customEntry?.phone,
          isCustomPhone: Boolean(customEntry),
          status: 'active',
          activeOrdersCount: 0,
          totalDeliveredToday: 0,
          avgDeliveryTimeMinutes: 25,
          delayedOrdersCount: 0,
          updatedAt: new Date().toISOString(),
        };
        couriers.push(matchedCourier);
      }

      // STRICT PROTECTION: Always use customPhone if set
      const courierPhone = (matchedCourier?.isCustomPhone && matchedCourier?.phone)
        ? matchedCourier.phone
        : (customEntry?.phone || matchedCourier?.phone || (item.driver_phone ? formatPhoneWithPlus(item.driver_phone) : ''));

      const courierDisplayName = matchedCourier?.name || driverName || 'مندوب لوكيت';

      // Timing calculations
      const timeStart = item.assigned_at || item.acceptance_time || item.order_time || item.ordered_at || item.created_at;
      let elapsedMinutes = 0;
      if (timeStart) {
        const timeEnd = (isDelivered && item.delivery_time) ? new Date(item.delivery_time).getTime() : Date.now();
        elapsedMinutes = Math.max(0, Math.floor((timeEnd - new Date(timeStart).getTime()) / (1000 * 60)));
      } else if (typeof item.elapsed_minutes === 'number') {
        elapsedMinutes = item.elapsed_minutes;
      }

      const isDelayed = !isDelivered && !isCanceled && elapsedMinutes >= settings.delayThresholdMinutes;

      let orderStatus: OrderStatus = 'in_transit';
      if (isCanceled) {
        orderStatus = 'cancelled';
      } else if (isDelivered) {
        orderStatus = 'delivered';
      } else if (isDelayed) {
        orderStatus = 'delayed';
        activeCount++;
      } else {
        orderStatus = 'in_transit';
        activeCount++;
      }

      const restaurant = item.store_name || item.storeName || item.merchant_name || item.restaurant_name || 'متجر لوكيت';
      const address = item.customer_address || item.customerAddress || item.customer_city || item.address || item.city || '';

      // Find previously tracked state to preserve alerts already sent
      const existing = orders.find((o) => o.id === orderId || o.id === `#${orderId}` || (item._id && o.locateMongoId === item._id));

      const orderRecord: Order = {
        id: orderId,
        locateMongoId: item._id || existing?.locateMongoId,
        locatAccount: driverId || driverName,
        courierId: matchedCourier?.id || existing?.courierId,
        courierName: courierDisplayName,
        courierPhone: courierPhone || existing?.courierPhone || '',
        restaurant,
        customerAddress: address,
        customerCoordinates: item.customer_coordinates || existing?.customerCoordinates || '',
        deliveryCost: String(item.delivery_cost || existing?.deliveryCost || ''),
        paymentMethod: item.payment_method || existing?.paymentMethod || 'Card',
        pickupTime: timeStart ? new Date(timeStart).toLocaleTimeString('ar-SA', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' }) : (existing?.pickupTime || ''),
        assignedAt: item.assigned_at || existing?.assignedAt,
        deliveryTime: item.delivery_time || existing?.deliveryTime,
        createdAt: item.created_at || existing?.createdAt,
        isDelivered,
        isCanceled,
        elapsedMinutes,
        status: orderStatus,
        isDelayed,
        alertSentToCourier: existing ? existing.alertSentToCourier : false,
        alertSentToAdmin: existing ? existing.alertSentToAdmin : false,
        alertSentToAdmin2: existing ? existing.alertSentToAdmin2 : false,
        courierAlertTime: existing?.courierAlertTime,
        adminAlertTime: existing?.adminAlertTime,
        admin2AlertTime: existing?.admin2AlertTime,
        activeOrdersHeldByCourier: 1,
        lastUpdated: new Date().toISOString(),
      };

      const shouldTriggerAlert = !isDelivered && !isCanceled && (
        (isDelayed && !orderRecord.alertSentToCourier) ||
        (orderRecord.elapsedMinutes >= (Number(settings.criticalDelayMinutes) || 45) && (!orderRecord.alertSentToAdmin || !orderRecord.alertSentToAdmin2))
      );

      if (shouldTriggerAlert) {
        triggerAlertsForOrder(orderRecord);
        alertsGenerated++;
        newlyDelayedCount++;
      }

      syncedOrders.push(orderRecord);
    });

    // Replace orders with strictly synchronized Locate dataset
    orders = syncedOrders;

    // Ensure orders are strictly sorted by creation time descending (newest on top, exactly like Locate)
    orders.sort((a, b) => {
      const timeA = a.createdAt || a.assignedAt || a.pickupTime || '';
      const timeB = b.createdAt || b.assignedAt || b.pickupTime || '';
      return new Date(timeB).getTime() - new Date(timeA).getTime();
    });

    // Update activeOrdersCount and delivered count for all couriers
    couriers.forEach((c) => {
      const courierOrders = orders.filter((o) => {
        return o.courierId === c.id ||
               c.locatAccounts.some((acc) => normalizeArabic(acc) === normalizeArabic(o.locatAccount || '')) ||
               normalizeArabic(c.name) === normalizeArabic(o.courierName || '');
      });

      c.activeOrdersCount = courierOrders.filter((o) => o.status === 'in_transit' || o.status === 'delayed').length;
      c.totalDeliveredToday = courierOrders.filter((o) => o.status === 'delivered').length;
      c.delayedOrdersCount = courierOrders.filter((o) => o.isDelayed).length;

      const completedWithTimes = courierOrders.filter((o) => o.status === 'delivered' && o.elapsedMinutes > 0);
      if (completedWithTimes.length > 0) {
        c.avgDeliveryTimeMinutes = Math.round(
          completedWithTimes.reduce((sum, o) => sum + o.elapsedMinutes, 0) / completedWithTimes.length
        );
      }
    });

    cloudSyncState.status = 'connected';
    cloudSyncState.isConfigured = true;
    cloudSyncState.lastSyncTime = new Date().toISOString();
    cloudSyncState.lastCount = rawList.length;
    cloudSyncState.lastOrdersCount = rawList.length;
    cloudSyncState.lastCouriersCount = couriers.length;
    cloudSyncState.activeOrdersCount = activeCount;
    cloudSyncState.lastError = undefined;
    cloudSyncState.hasCredentials = Boolean(email && password);
    cloudSyncState.hasToken = Boolean(token);
    cloudSyncState.email = email;
    cloudSyncState.companyId = settings.locateCompanyId;

    settings.lastCloudSyncTimestamp = cloudSyncState.lastSyncTime;
    settings.lastCloudSyncCount = cloudSyncState.lastCount;
    saveStoreToDisk();

    console.log(`[Cloud Auto-Sync] ✅ تم بنجاح سحب وتحديث ${couriers.length} مندوب، ${rawList.length} طلب (${activeCount} نشط)، وتوليد ${alertsGenerated} تنبيه.`);

    return {
      success: true,
      count: rawList.length,
      activeCount,
      couriersCount: couriers.length,
      message: `تم سحب وتحديث ${couriers.length} مندوب و ${rawList.length} طلب بنجاح (${activeCount} نشط حالياً)`,
      orders,
    };
  } catch (err: any) {
    console.error('[Cloud Auto-Sync Error]', err.message);
    cloudSyncState.status = 'error';
    cloudSyncState.lastError = err.message || 'فشل الاتصال بسيرفر لوكيت';
    return {
      success: false,
      count: 0,
      activeCount: 0,
      couriersCount: 0,
      message: cloudSyncState.lastError || 'خطأ في عملية السحب التلقائي',
    };
  }
}

// Background Cron Runner for Cloud Auto-Sync
let cloudAutoSyncInterval: NodeJS.Timeout | null = null;

function setupCloudAutoSyncRunner() {
  if (cloudAutoSyncInterval) {
    clearInterval(cloudAutoSyncInterval);
    cloudAutoSyncInterval = null;
  }

  if (settings.enableCloudAutoSync !== false) {
    const intervalSec = Math.max(10, Number(settings.locatSyncIntervalSeconds) || 20);
    console.log(`[Cloud Auto-Sync] 🟢 تشغيل محرك السحب التلقائي السحابي المستمر 24/7 كل ${intervalSec} ثانية بدون أي تدخل`);

    // Initial sync after 3 seconds from startup
    setTimeout(() => {
      executeLocatCloudSync().catch((err) => console.error('[Initial Cloud Sync Error]', err));
    }, 3000);

    cloudAutoSyncInterval = setInterval(() => {
      if (cloudSyncState.status !== 'syncing' && settings.enableCloudAutoSync !== false) {
        executeLocatCloudSync().catch((err) => console.error('[Interval Cloud Sync Error]', err));
      }
    }, intervalSec * 1000);
  } else {
    console.log('[Cloud Auto-Sync] ⚪ المحرك التلقائي في وضع التوقف (معطل في الإعدادات)');
  }
}

// Cloud Auto-Sync Endpoints
app.get('/api/locat/cloud-status', (req: Request, res: Response) => {
  const email = settings.locateEmail || settings.locateUsername || '';
  const password = settings.locatePassword || '';
  const hasCredentials = Boolean(email && password);
  const hasToken = Boolean(settings.locateAccessToken);
  const hasSavedCredentialsOnDisk = fs.existsSync(LOCAT_CREDENTIALS_FILE);

  res.json({
    success: true,
    cloudSyncState: {
      ...cloudSyncState,
      isActive: settings.enableCloudAutoSync !== false,
      hasCredentials,
      hasToken,
      email,
      companyId: settings.locateCompanyId,
      hasSavedCredentialsOnDisk,
      credentialsFile: LOCAT_CREDENTIALS_FILE,
      persistentDir: PERSISTENT_DIR,
      instanceName: INSTANCE_NAME,
      envConfigured: Boolean(process.env.LOCAT_EMAIL || process.env.LOCAT_USERNAME),
    },
    instanceName: INSTANCE_NAME,
    email,
    hasPassword: Boolean(password),
    companyId: settings.locateCompanyId || '',
    hasSavedCredentialsOnDisk,
    credentialsFile: LOCAT_CREDENTIALS_FILE,
    persistentDir: PERSISTENT_DIR,
    envConfigured: Boolean(process.env.LOCAT_EMAIL || process.env.LOCAT_USERNAME),
    ordersCount: orders.length,
    delayedCount: orders.filter((o) => o.isDelayed).length,
    intervalSeconds: settings.locatSyncIntervalSeconds || 20,
  });
});

app.post('/api/locat/save-credentials', async (req: Request, res: Response) => {
  const { email, username, password, company_id, auto_login, enable_sync } = req.body || {};
  const targetEmail = (email || username || '').trim();
  const targetPassword = password !== undefined ? String(password).trim() : (settings.locatePassword || '');
  const targetCompanyId = company_id !== undefined ? String(company_id).trim() : (settings.locateCompanyId || '');

  if (!targetEmail) {
    res.status(400).json({ success: false, message: 'اسم المستخدم أو البريد الإلكتروني لحساب لوكيت مطلوب' });
    return;
  }

  settings.locateEmail = targetEmail;
  settings.locateUsername = targetEmail;
  if (targetPassword) {
    settings.locatePassword = targetPassword;
  }
  if (targetCompanyId) {
    settings.locateCompanyId = targetCompanyId;
  }
  if (enable_sync !== undefined) {
    settings.enableCloudAutoSync = Boolean(enable_sync);
  } else {
    settings.enableCloudAutoSync = true;
  }

  saveLocatCredentialsToDisk({
    email: targetEmail,
    username: targetEmail,
    password: settings.locatePassword,
    companyId: settings.locateCompanyId,
    accessToken: settings.locateAccessToken,
  });
  saveStoreToDisk();

  let loginResult: any = null;
  let syncResult: any = null;

  if (auto_login !== false && settings.locatePassword) {
    loginResult = await autoLoginToLocatCloud(targetEmail, settings.locatePassword, settings.locateCompanyId);
    if (loginResult.token) {
      settings.locateAccessToken = loginResult.token;
      if (loginResult.companyId) {
        settings.locateCompanyId = loginResult.companyId;
      }
      saveLocatCredentialsToDisk({
        email: targetEmail,
        username: targetEmail,
        password: settings.locatePassword,
        companyId: settings.locateCompanyId,
        accessToken: settings.locateAccessToken,
      });
      saveStoreToDisk();

      syncResult = await executeLocatCloudSync();
    }
  }

  res.json({
    success: true,
    message: loginResult?.token
      ? `✅ تم ربط حساب (${targetEmail}) وتسجيل الدخول بنجاح وسحب الطلبات تلقائياً!`
      : `✅ تم حفظ وتثبيت بيانات حساب (${targetEmail}) في ملف التخزين الدائم بنجاح`,
    loginResult,
    syncResult,
    cloudSyncState: {
      ...cloudSyncState,
      email: settings.locateEmail,
      companyId: settings.locateCompanyId,
      hasSavedCredentialsOnDisk: true,
    },
    settings: {
      locateEmail: settings.locateEmail,
      locateUsername: settings.locateUsername,
      locateCompanyId: settings.locateCompanyId,
      hasPassword: Boolean(settings.locatePassword),
      enableCloudAutoSync: settings.enableCloudAutoSync,
    },
  });
});

app.post('/api/locat/cloud-logout', (req: Request, res: Response) => {
  const { clearCredentials } = req.body || {};
  settings.locateAccessToken = '';
  if (clearCredentials) {
    settings.locateEmail = '';
    settings.locateUsername = '';
    settings.locatePassword = '';
    settings.locateCompanyId = '';
    if (fs.existsSync(LOCAT_CREDENTIALS_FILE)) {
      try {
        fs.unlinkSync(LOCAT_CREDENTIALS_FILE);
      } catch (e) {}
    }
  }
  cloudSyncState.status = 'unauthenticated';
  cloudSyncState.hasToken = false;
  saveStoreToDisk();
  res.json({ success: true, message: 'تم تسجيل الخروج من حساب لوكيت بنجاح' });
});

app.post('/api/locat/cloud-pre-login', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email || !email.trim()) {
    res.status(400).json({ success: false, message: 'البريد الإلكتروني مطلوب' });
    return;
  }
  try {
    const preRes = await fetch('https://api.supplier.locate.sa/api/v1/partners/pre-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    });
    const data: any = await preRes.json();
    if (!preRes.ok) {
      res.status(400).json({ success: false, message: data.message || 'تعذر العثور على الحساب في لوكيت' });
      return;
    }
    res.json({ success: true, companies: data.companies || [], data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'فشل الاتصال بخادم لوكيت' });
  }
});

app.post('/api/locat/cloud-login', async (req: Request, res: Response) => {
  const { email, password, company_id } = req.body;
  if (!email || !password) {
    res.status(400).json({ success: false, message: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
    return;
  }

  const result = await autoLoginToLocatCloud(email.trim(), password.trim(), company_id);
  if (result.token) {
    settings.locateEmail = email.trim();
    settings.locateUsername = email.trim();
    settings.locatePassword = password.trim();
    settings.locateAccessToken = result.token;
    if (result.companyId) {
      settings.locateCompanyId = result.companyId;
    }
    settings.enableCloudAutoSync = true;
    saveLocatCredentialsToDisk({
      email: settings.locateEmail,
      username: settings.locateUsername,
      password: settings.locatePassword,
      companyId: settings.locateCompanyId,
      accessToken: settings.locateAccessToken,
    });
    saveStoreToDisk();

    // Trigger immediate first pull
    const syncRes = await executeLocatCloudSync();
    res.json({
      success: true,
      message: 'تم تسجيل الدخول وتفعيل السحب التلقائي السحابي بنجاح!',
      syncResult: syncRes,
      cloudSyncState,
    });
  } else {
    res.status(400).json({ success: false, message: result.error || 'فشل تسجيل الدخول إلى لوكيت' });
  }
});

app.post('/api/locat/cloud-sync-now', async (req: Request, res: Response) => {
  const syncRes = await executeLocatCloudSync();
  res.json({
    success: syncRes.success,
    message: syncRes.message,
    count: syncRes.count,
    activeCount: syncRes.activeCount,
    couriersCount: syncRes.couriersCount,
    cloudSyncState,
    orders,
    couriers,
    ordersCount: orders.length,
    delayedCount: orders.filter((o) => o.isDelayed).length,
  });
});

app.post('/api/locat/set-token', async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token || !token.trim()) {
    res.status(400).json({ success: false, message: 'رمز التفويض (Token) مطلوب' });
    return;
  }

  settings.locateAccessToken = token.trim();
  settings.enableCloudAutoSync = true;
  saveStoreToDisk();

  const syncRes = await executeLocatCloudSync();
  res.json({
    success: true,
    message: 'تم حفظ الرمز السحابي وتحديث بيانات الطلبات بنجاح',
    syncResult: syncRes,
    cloudSyncState,
  });
});

// 5.4 24/7 Automated Background Runner Engine for Puppeteer
let puppeteerScraperInterval: NodeJS.Timeout | null = null;

function setupPuppeteer247Runner() {
  if (puppeteerScraperInterval) {
    clearInterval(puppeteerScraperInterval);
    puppeteerScraperInterval = null;
  }

  if (settings.enablePuppeteerHeadless) {
    console.log(`[Puppeteer 24/7 Engine] 🟢 تفعيل محرك السحب التلقائي المستمر 24/7 كل ${settings.locatSyncIntervalSeconds} ثانية`);
    runPuppeteerScrapeLocat().catch((err) => console.error('[Puppeteer 24/7 Startup Error]', err));

    const intervalMs = Math.max(15, settings.locatSyncIntervalSeconds || 30) * 1000;
    puppeteerScraperInterval = setInterval(() => {
      if (settings.enablePuppeteerHeadless && !puppeteerStatus.isRunning) {
        runPuppeteerScrapeLocat().catch((err) => console.error('[Puppeteer 24/7 Interval Error]', err));
      }
    }, intervalMs);
  } else {
    console.log('[Puppeteer 24/7 Engine] ⚪ المحرك التلقائي في وضع الاستعداد');
  }
}

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

  // Start 24/7 Baileys connection watchdog (checks socket health every 30s)
  setupBaileysHeartbeat();

  // Start 24/7 Render Anti-Sleep Keep-Alive runner
  setupRenderKeepAliveRunner();

  // Start 24/7 direct cloud auto-sync engine (automatic orders pull without user intervention)
  setupCloudAutoSyncRunner();

  // Start 24/7 dedicated automated order watcher & alert dispatcher
  setupAutomatedAlertsWatcher();

  // Start 24/7 automated Puppeteer background scraper if enabled
  setupPuppeteer247Runner();

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
