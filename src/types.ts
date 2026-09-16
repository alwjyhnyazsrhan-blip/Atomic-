

export interface Courier {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  locatAccounts: string[]; // List of Locat IDs/usernames (allows moving between accounts)
  phone: string; // Real WhatsApp phone number (with country code, e.g. +966...)
  isCustomPhone?: boolean; // Protected flag: manually set or edited phone that must NEVER be overwritten by sync
  customPhone?: string;
  idNumber?: string; // National ID / Iqama number from Locate
  cityId?: string;
  gift?: number; // Rewards/points balance in Locate
  balance?: number;
  status: 'active' | 'idle' | 'off_duty';
  activeOrdersCount: number;
  totalDeliveredToday: number;
  avgDeliveryTimeMinutes: number;
  delayedOrdersCount: number;
  notes?: string;
  updatedAt: string;
}

export type OrderStatus = 'pickup_pending' | 'in_transit' | 'delayed' | 'delivered' | 'cancelled';

export interface Order {
  id: string; // Order number (e.g. #L22291255)
  locateMongoId?: string; // Original _id from Locate MongoDB
  locatAccount: string; // Account identifier in Locat (driver ID)
  courierId?: string; // Mapped internal courier id
  courierName: string; // Courier name from Locat or registered
  courierPhone: string; // Real WhatsApp phone
  restaurant: string; // Restaurant or store name
  customerAddress?: string; // Customer location or district
  customerCoordinates?: string; // Coordinates from Locate (e.g. "26.42, 50.08")
  deliveryCost?: string; // Delivery cost (e.g. "14")
  paymentMethod?: string; // e.g. "Card", "Cash"
  pickupTime: string; // Timestamp string or human time
  assignedAt?: string; // ISO date when assigned to driver
  deliveryTime?: string; // ISO date when delivered
  createdAt?: string; // ISO date when order created
  isDelivered?: boolean; // Raw boolean from Locate
  isCanceled?: boolean; // Raw boolean from Locate
  elapsedMinutes: number; // Elapsed minutes since assignment/pickup
  status: OrderStatus;
  isDelayed: boolean; // True if elapsedMinutes >= delayThresholdMinutes
  alertSentToCourier: boolean;
  alertSentToAdmin: boolean;
  courierAlertTime?: string;
  adminAlertTime?: string;
  alertSentToAdmin2?: boolean;
  admin2AlertTime?: string;
  lastAlertSentTimestamp?: number; // Epoch ms for cooldown check
  activeOrdersHeldByCourier: number; // Current active count for this courier
  lastUpdated: string;
}

export interface SystemSettings {
  delayThresholdMinutes: number; // Default alert threshold for courier (e.g. 45 mins)
  criticalDelayMinutes: number; // Escalation threshold for Admin 2 (e.g. 60 mins)
  adminPhone: string; // Management primary WhatsApp number
  adminName: string; // Management primary contact name
  adminPhone2: string; // Management secondary WhatsApp number (Escalation)
  adminName2: string; // Management secondary contact name (Escalation)
  autoAlertCourier: boolean; // Automatically trigger courier WhatsApp
  autoAlertAdmin: boolean; // Automatically trigger primary admin WhatsApp
  autoAlertAdmin2: boolean; // Automatically trigger secondary admin WhatsApp upon continued delay
  alertCooldownMinutes: number; // Cooldown before repeating alert for same order (e.g. 20 mins)
  antiBanMinDelaySeconds: number; // Anti-ban min pause between messages (e.g. 5s)
  antiBanMaxDelaySeconds: number; // Anti-ban max pause between messages (e.g. 10s)
  autoDailyReport: boolean; // Automatic end of day report
  dailyReportTime: string; // E.g. "23:00"
  whatsAppProvider: 'baileys_vps' | 'direct_chat' | 'webhook' | 'simulation';
  webhookUrl?: string;
  webhookApiKey?: string;
  locatSyncIntervalSeconds: number; // Sync polling interval
  locatApiKey: string; // Secret key for the Locat automation script
  enablePuppeteerHeadless: boolean; // Run headless puppeteer 24/7 on VPS
  locateUsername?: string; // Credentials for headless Locate login
  locatePassword?: string;
  locateEmail?: string; // Direct Locate Supplier Email
  locateCompanyId?: string; // Company / Branch ID in Locate
  locateAccessToken?: string; // Bearer token for direct cloud API sync
  enableCloudAutoSync?: boolean; // 24/7 background automatic fetcher
  lastCloudSyncTimestamp?: string;
  lastCloudSyncCount?: number;
  baileysStatus?: 'connected' | 'connecting' | 'disconnected' | 'qr_ready';
  baileysPhone?: string;
}

export interface CloudSyncState {
  isActive: boolean;
  isConfigured?: boolean;
  status: 'idle' | 'syncing' | 'connected' | 'error' | 'unauthenticated';
  lastSyncTime?: string;
  lastCount: number;
  lastOrdersCount?: number;
  lastCouriersCount?: number;
  activeOrdersCount?: number;
  lastError?: string;
  hasCredentials: boolean;
  hasToken: boolean;
  email?: string;
  companyId?: string;
  nextSyncSecondsRemaining?: number;
  hasSavedCredentialsOnDisk?: boolean;
  credentialsFile?: string;
  persistentDir?: string;
  envConfigured?: boolean;
}

export interface QueuedWhatsAppMessage {
  id: string;
  timestamp: string;
  recipientType: 'courier' | 'admin' | 'admin2';
  recipientName: string;
  recipientPhone: string;
  orderId: string;
  message: string;
  status: 'waiting' | 'sending' | 'sent' | 'skipped_cooldown' | 'failed';
  delayAppliedSeconds: number;
  scheduledAt: string;
  sentAt?: string;
  error?: string;
  waLink?: string;
}

export interface WhatsAppConnectionState {
  status: 'connected' | 'connecting_qr' | 'disconnected' | 'reconnecting' | 'logged_out';
  isLoggedIn: boolean;
  userPhone?: string;
  userName?: string;
  qrDataUrl?: string | null;
  qrRaw?: string | null;
  lastConnectedAt?: string | null;
  lastError?: string | null;
}

export interface PuppeteerScraperStatus {
  enabled: boolean;
  isRunning: boolean;
  status: 'idle' | 'scraping' | 'authenticated' | 'error' | 'stopped';
  lastScrapeTime?: string;
  lastScrapedCount: number;
  lastError?: string;
}

export interface AlertLog {
  id: string;
  timestamp: string;
  recipientType: 'courier' | 'admin' | 'admin2';
  recipientName: string;
  recipientPhone: string;
  orderId: string;
  elapsedMinutes: number;
  activeOrdersCount: number;
  message: string;
  status: 'sent' | 'pending' | 'failed' | 'queued' | 'skipped_cooldown';
  waLink: string;
  delayAppliedSeconds?: number;
}

export interface CourierPerformanceItem {
  courierId: string;
  courierName: string;
  locatAccounts: string[];
  phone: string;
  deliveredCount: number;
  activeCount: number;
  delayedCount: number;
  avgTime: number;
  efficiencyScore: number; // 0-100%
  performanceTier: 'top' | 'good' | 'low';
  assessmentNote: string;
}

export interface DailyReportSummary {
  date: string;
  generatedAt: string;
  totalOrdersToday: number;
  deliveredOrdersToday: number;
  delayedOrdersToday: number;
  activeOrdersRightNow: number;
  overallAvgTimeMinutes: number;
  onTimeRate: number; // percentage
  topPerformers: CourierPerformanceItem[];
  underPerformers: CourierPerformanceItem[];
  allCouriers: CourierPerformanceItem[];
  whatsappFormattedText: string;
}
