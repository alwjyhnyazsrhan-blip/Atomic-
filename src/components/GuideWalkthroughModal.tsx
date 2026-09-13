import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  Pause,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Smartphone,
  Users,
  Clock,
  Code,
  FileText,
  Send,
  Zap,
  ShieldCheck,
  Server,
  QrCode,
  RotateCw,
  ExternalLink,
  Copy,
  Check
} from 'lucide-react';

interface GuideWalkthroughModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenWhatsApp?: () => void;
  onOpenSettings?: () => void;
  onOpenCouriers?: () => void;
}

export const GuideWalkthroughModal: React.FC<GuideWalkthroughModalProps> = ({
  isOpen,
  onClose,
  onOpenWhatsApp,
  onOpenSettings,
  onOpenCouriers,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [copiedScript, setCopiedScript] = useState(false);

  const steps = [
    {
      id: 'step-1',
      title: 'الخطوة 1: ربط الواتساب بالسيرفر عبر الـ QR Code',
      subtitle: 'ربط مباشر ومجاني بالكامل بدون أي اشتراكات أو APIs مدفوعة',
      duration: '45 ثانية',
      icon: <QrCode className="w-5 h-5 text-emerald-600" />,
      tag: 'إعداد أساسي لمرة واحدة',
      details: [
        'اضغط على زر "واتساب: امسح الـ QR" في الشريط العلوي للوحة التحكم.',
        'سيظهر لك رمز الاستجابة السريعة (QR Code) الحي والمولد من محرك Baileys.',
        'افتح تطبيق واتساب على هاتفك > الأجهزة المرتبطة (Linked Devices) > ربط جهاز جديد.',
        'وجّه كاميرا الهاتف نحو الشاشة لمسح الرمز لمرة واحدة فقط.',
        'سيتحول مؤشر الحالة في النظام فوراً إلى "متصل بـ WhatsApp" وتُحفظ الجلسة تلقائياً في السيرفر.'
      ],
      tip: 'الجلسة تُحفظ في مجلد السيرفر دائمًا، ولن تحتاج لإعادة مسح الرمز حتى لو تم إعادة تشغيل السيرفر.',
      samplePreview: (
        <div className="bg-slate-900 text-slate-100 p-4 rounded-xl font-mono text-xs space-y-2 border border-slate-700">
          <div className="text-emerald-400 font-bold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            [Baileys VPS Engine] تم الاتصال برقم المشرف بنجاح (+96650xxxxxxx)
          </div>
          <div className="text-slate-400">حالة الجلسة: مصادقة نشطة | جاهز لبث تنبيهات التأخير والتقارير</div>
        </div>
      ),
    },
    {
      id: 'step-2',
      title: 'الخطوة 2: إضافة المناديب وربط حسابات لوكيت بجوالاتهم',
      subtitle: 'مطابقة اسم وحسابات المندوب برقم الواتساب الفعلي حتى لو تنقل بين عدة حسابات',
      duration: '40 ثانية',
      icon: <Users className="w-5 h-5 text-blue-600" />,
      tag: 'إدارة المناديب',
      details: [
        'انتقل إلى تبويب "المناديب المسجلين" من القائمة واضغط على "إضافة مندوب جديد".',
        'اكتب اسم المندوب (مثال: أحمد محمد).',
        'أدخل رقم الواتساب الفعلي للمندوب بصيغة دولية كاملة (مثال: 966501234567+).',
        'أدخل معرّفات وحسابات لوكيت الخاصة به (يمكنك إدخال أكثر من حساب مفصولة بفاصلة).',
        'احفظ البيانات؛ والآن كلما ظهر أي طلب مسند لهذا الحساب في شاشة لوكيت، سيعرف النظام فوراً رقم الواتساب الحقيقي للمندوب.'
      ],
      tip: 'إذا استخدم المندوب حساباً جديداً في لوكيت، يمكنك بكل بساطة إضافة الحساب الجديد لنفس المندوب دون الحاجة لتكرار رقمه.',
      samplePreview: (
        <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-xs space-y-1.5 text-blue-900">
          <div className="font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-blue-600" />
            مثال لمطابقة المندوب:
          </div>
          <div>• الاسم: <strong>أحمد المنصور</strong></div>
          <div>• جوال الواتساب: <strong>+966501234567</strong></div>
          <div>• حسابات لوكيت المرتبطة: <code className="bg-blue-100 px-1 py-0.5 rounded">ahmed_locat, 58492, drv_ahmed</code></div>
        </div>
      ),
    },
    {
      id: 'step-3',
      title: 'الخطوة 3: ضبط أزمنة التأخير وتصعيد الإدارة 2 (رقمك الثاني)',
      subtitle: 'تنبيه المندوب عند 30 أو 45 دقيقة + إشعار رقمك الثاني برقم المندوب عند استمرار التأخير',
      duration: '40 ثانية',
      icon: <Clock className="w-5 h-5 text-amber-600" />,
      tag: 'التنبيه والتصعيد',
      details: [
        'اضغط على أيقونة "الإعدادات" في أعلى يسار الشاشة.',
        'اضبط "حد التنبيه الأولي" (مثلاً 30 أو 45 دقيقة): عند وصول الطلب لهذا الوقت يتم إرسال رسالة تذكير للمندوب فوراً.',
        'اضبط "حد التصعيد الحرج" (مثلاً 45 أو 60 دقيقة) لتنبيه الإدارة الثانية عند التأخير الزائد.',
        'أدخل رقم الواتساب للإدارة الأولى (لتلقي التنبيهات والتقرير اليومي).',
        'أدخل رقم الواتساب للإدارة الثانية (رقمك الثاني): هذا الرقم سيستلم فوراً إشعاراً يحتوي على رقم جوال المندوب للتواصل المباشر معه.',
        'فعّل مفاتيح التنبيه التلقائي للمندوب، الإدارة 1، والإدارة 2 ثم اضغط حفظ.'
      ],
      tip: 'النظام مزود بآلية منع التكرار (Cooldown) لتجنب إرسال أكثر من رسالة لنفس الطلب في وقت قصير.',
      samplePreview: (
        <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs space-y-2 text-amber-950">
          <div className="font-bold text-amber-800">شكل رسالة التصعيد التي ستصل على رقمك الثاني:</div>
          <div className="bg-white p-2.5 rounded-lg border border-amber-200 leading-relaxed font-sans">
            🚨 <strong>[تصعيد تأخير حرج - إشعار الإدارة الثانية]</strong><br />
            • اسم المندوب: أحمد المنصور<br />
            • <strong>جوال المندوب للتواصل المباشر: +966501234567</strong><br />
            • رقم الطلب: #10842 (وقت الاستلام: 02:15 م)<br />
            • الوقت المنقضي: 62 دقيقة (تجاوز حد الـ 45 دقيقة)<br />
            • الطلبات الحالية بحوزته: 2 طلبات<br />
            ⚠️ يرجى الاتصال به فوراً عبر رقمه أعلاه لمعرفة سبب التأخير.
          </div>
        </div>
      ),
    },
    {
      id: 'step-4',
      title: 'الخطوة 4: سحب بيانات شاشة لوكيت الحية (supplier.locate.sa)',
      subtitle: 'طريقتان سهلتان: سكربت الأتمتة المباشر أو متصفح السيرفر الخفي 24/7',
      duration: '45 ثانية',
      icon: <Code className="w-5 h-5 text-purple-600" />,
      tag: 'المزامنة الحية',
      details: [
        'الخيار الأول (الموصى به فوراً): توجه لتبويب "سكربت الأتمتة"، انسخ سكربت التامبرمونكي (Userscript) وثبته على متصفحك.',
        'افتح صفحة لوكيت: supplier.locate.sa/orders في المتصفح، سيعمل السكربت تلقائياً ويقوم بقراءة أرقام الطلبات وأسماء المناديب والوقت المنقضي وإرسالها للوحة التحكم كل 30 ثانية.',
        'الخيار الثاني (محرك Puppeteer بالسيرفر 24/7): يعمل تلقائياً في خلفية السيرفر على Render/VPS عبر متصفح كروم المثبت دون الحاجة لأي متصفح مفتوح.'
      ],
      tip: 'السكربت يقرأ الأرقام العربية والإنجليزية وصيغ الساعات والدقائق بدقة متناهية وبدون أي استهلاك لموارد جهازك.',
      samplePreview: (
        <div className="bg-purple-50 border border-purple-200 p-3 rounded-xl text-xs text-purple-950 space-y-1.5">
          <div className="font-bold flex items-center gap-1.5 text-purple-800">
            <Zap className="w-4 h-4 text-purple-600" />
            ما يقوم به السكربت في شاشة لوكيت:
          </div>
          <div>1. يقرأ: رقم الطلب (#10842) - المندوب - وقت الاستلام - الوقت المنقضي.</div>
          <div>2. يحسب: عدد الطلبات النشطة المسندة لنفس المندوب في نفس اللحظة.</div>
          <div>3. يرسل البيانات مشفرة إلى سيرفر لوحة التحكم: <code className="bg-purple-100 px-1 py-0.5 rounded font-mono">/api/locat/sync</code></div>
        </div>
      ),
    },
    {
      id: 'step-5',
      title: 'الخطوة 5: رسائل التنبيهات المباشرة للمندوب والتقرير اليومي',
      subtitle: 'تنبيه آلي مباشر وسريع في الواتساب + تقييم شامل لأداء المناديب نهاية اليوم',
      duration: '35 ثانية',
      icon: <Send className="w-5 h-5 text-emerald-600" />,
      tag: 'الأتمتة الشاملة',
      details: [
        'بمجرد أن يتأخر أي مندوب، يقوم النظام بإرسال رسالة واتساب مباشرة لرقم جواله تذكره بالطلب وتطلب منه توضيح سبب التأخير وتسليمه فوراً.',
        'تظهر التنبيهات في تبويب "سجل التنبيهات" مع إمكانية إعادة إرسالها يدوياً أو فتح محادثة مباشرة بنقرة زر.',
        'في نهاية كل يوم (في التوقيت المحدد مثل 23:00) أو بالضغط على زر "إرسال تقرير اليوم للإدارة"، يرسل النظام تقريراً كاملاً للإدارة.',
        'يتضمن التقرير: إجمالي طلبات اليوم، المناديب الأكثر إنجازاً وسرعة، والمناديب ضعاف الأداء المتكرر تأخرهم لاتخاذ الإجراءات معهم.'
      ],
      tip: 'يمكنك تجربة إرسال رسالة اختبارية بأي وقت من نافذة الواتساب للتأكد من وصول الرسائل بنجاح.',
      samplePreview: (
        <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-xs text-emerald-950 space-y-2">
          <div className="font-bold text-emerald-800">ملخص تقرير نهاية اليوم على واتساب الإدارة:</div>
          <div className="bg-white p-2.5 rounded-lg border border-emerald-200 leading-relaxed font-sans">
            📊 <strong>*تقرير أداء مناديب لوكيت اليومي*</strong><br />
            • إجمالي الطلبات المنجزة: <strong>142 طلب</strong><br />
            • نسبة التسليم في الوقت المحدد: <strong>94%</strong><br />
            🌟 <strong>المناديب الأكثر إنتاجية:</strong><br />
            1. أحمد المنصور: 24 طلب | متوسط 21 دقيقة | 0 تأخير<br />
            2. خالد العتيبي: 21 طلب | متوسط 23 دقيقة<br />
            ⚠️ <strong>المناديب ضعاف الإنجاز (بحاجة لمتابعة):</strong><br />
            1. فهد الشمري: 6 طلبات فقط | 3 تأخيرات (متوسط 48 دقيقة)
          </div>
        </div>
      ),
    },
  ];

  // Auto progression timer when "playing"
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isOpen && isPlaying) {
      timer = setInterval(() => {
        setCurrentStep((prev) => (prev + 1) % steps.length);
      }, 9000);
    }
    return () => clearInterval(timer);
  }, [isOpen, isPlaying, steps.length]);

  if (!isOpen) return null;

  const current = steps[currentStep];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950">
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base flex items-center gap-2">
                دليل الشرح المرئي الكامل للنظام
                <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  فيديو وشرح خطوة بخطوة
                </span>
              </h2>
              <p className="text-2xs text-slate-400">
                تعرف على آلية الربط من البداية وحتى إرسال التنبيهات والتقارير التلقائية
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Simulation Progress Bar / Timeline */}
        <div className="bg-slate-800 p-2.5 flex items-center justify-between gap-2 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-white transition text-xs flex items-center gap-1"
              title={isPlaying ? 'إيقاف مؤقت' : 'تشغيل تلقائي'}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span className="text-2xs hidden sm:inline">{isPlaying ? 'إيقاف' : 'تشغيل'}</span>
            </button>
            <span className="text-2xs text-slate-300 font-mono">
              المشهد {currentStep + 1} من {steps.length}
            </span>
          </div>

          {/* Stepper Dots / Bars */}
          <div className="flex items-center gap-1.5 flex-1 max-w-md mx-2">
            {steps.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => {
                  setCurrentStep(idx);
                  setIsPlaying(false);
                }}
                className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                  idx === currentStep
                    ? 'bg-emerald-400 ring-2 ring-emerald-400/30'
                    : idx < currentStep
                    ? 'bg-emerald-600/70'
                    : 'bg-slate-700 hover:bg-slate-600'
                }`}
                title={s.title}
              />
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setCurrentStep((prev) => (prev > 0 ? prev - 1 : steps.length - 1));
                setIsPlaying(false);
              }}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition"
              title="المشهد السابق"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setCurrentStep((prev) => (prev + 1) % steps.length);
                setIsPlaying(false);
              }}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition"
              title="المشهد التالي"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4 text-slate-800">
          {/* Active Step Badge & Title */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-slate-100 border border-slate-200">
                {current.icon}
              </div>
              <div>
                <span className="text-2xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  {current.tag}
                </span>
                <h3 className="font-bold text-base text-slate-900 mt-1">{current.title}</h3>
                <p className="text-xs text-slate-500">{current.subtitle}</p>
              </div>
            </div>
            <span className="text-2xs text-slate-400 font-mono bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              الوقت المتوقع: {current.duration}
            </span>
          </div>

          {/* Step Steps & Actions */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Left: Detailed Steps */}
            <div className="md:col-span-7 space-y-2.5 text-xs leading-relaxed">
              <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                خطوات التطبيق العملية:
              </h4>
              <ul className="space-y-2 text-slate-700 pr-1">
                {current.details.map((detail, idx) => (
                  <li key={idx} className="flex items-start gap-2 bg-slate-50/80 p-2 rounded-lg border border-slate-100">
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-2xs font-bold shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>

              {/* Pro Tip */}
              <div className="bg-amber-50/80 border border-amber-200/80 p-2.5 rounded-lg text-2xs text-amber-900 flex items-start gap-2">
                <Zap className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>نصيحة ذكية:</strong> {current.tip}
                </span>
              </div>
            </div>

            {/* Right: Interactive Screen Mockup / Output Preview */}
            <div className="md:col-span-5 space-y-2">
              <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-slate-600" />
                معاينة الشاشة ومخرجات النظام:
              </h4>
              {current.samplePreview}

              {/* Direct Quick Action Button corresponding to step */}
              {currentStep === 0 && onOpenWhatsApp && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenWhatsApp();
                  }}
                  className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition"
                >
                  <QrCode className="w-4 h-4" />
                  <span>فتح نافذة مسح الـ QR الآن</span>
                </button>
              )}
              {currentStep === 1 && onOpenCouriers && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenCouriers();
                  }}
                  className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition"
                >
                  <Users className="w-4 h-4" />
                  <span>الانتقال لإضافة المناديب</span>
                </button>
              )}
              {currentStep === 2 && onOpenSettings && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenSettings();
                  }}
                  className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition"
                >
                  <Clock className="w-4 h-4" />
                  <span>فتح شاشة ضبط أزمنة التأخير</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <button
            onClick={() => {
              setCurrentStep((prev) => (prev > 0 ? prev - 1 : 0));
              setIsPlaying(false);
            }}
            disabled={currentStep === 0}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
          >
            <ChevronRight className="w-4 h-4" />
            <span>السابق</span>
          </button>

          <div className="flex items-center gap-1 text-slate-500 font-medium text-2xs">
            <span>انقر على مؤشرات المشاهد بالأعلى للتنقل الحر</span>
          </div>

          {currentStep < steps.length - 1 ? (
            <button
              onClick={() => {
                setCurrentStep((prev) => prev + 1);
                setIsPlaying(false);
              }}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition flex items-center gap-1 shadow-2xs"
            >
              <span>المشهد التالي</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold transition flex items-center gap-1 shadow-2xs"
            >
              <Check className="w-4 h-4" />
              <span>فهمت آلية العمل، ابدأ الآن!</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
