import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownToLine, RefreshCw, Share, SquarePlus, X } from 'lucide-react';
import {
  isIos, isStandalone, onInstallAvailability, promptInstall, setUpdateHandler,
} from '@/lib/pwa';

const EASE = [0.22, 1, 0.36, 1] as const;
const DISMISS_KEY = 'trb.install.dismissed';

/** هل رفض المستخدم دعوة التثبيت مؤخراً؟ (نعيد السؤال بعد أسبوعين) */
function recentlyDismissed(): boolean {
  try {
    const v = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return v > 0 && Date.now() - v < 14 * 24 * 60 * 60 * 1000;
  } catch { return false; }
}

/**
 * شريطان سفليان: دعوة تثبيت التطبيق، وإشعار توفّر نسخة محدَّثة.
 * كلاهما فوق شريط التنقّل السفلي ويحترم منطقة الأمان في الجوال.
 */
export function PwaBanners() {
  const [canInstall, setCanInstall] = useState(false);
  const [showIos, setShowIos]       = useState(false);
  const [activate, setActivate]     = useState<(() => void) | null>(null);

  useEffect(() => onInstallAvailability(setCanInstall), []);

  useEffect(() => {
    setUpdateHandler((run) => setActivate(() => run));
  }, []);

  // آيفون لا يطلق beforeinstallprompt — نعرض إرشاداً بعد تصفّح قليل
  useEffect(() => {
    if (!isIos() || isStandalone() || recentlyDismissed()) return;
    const t = window.setTimeout(() => setShowIos(true), 12000);
    return () => window.clearTimeout(t);
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* تجاهُل */ }
    setCanInstall(false);
    setShowIos(false);
  };

  const install = async () => {
    const accepted = await promptInstall();
    if (!accepted) dismiss();
  };

  const showInstall = (canInstall && !recentlyDismissed() && !isStandalone()) || showIos;

  return (
    <>
      {/* ── نسخة محدَّثة جاهزة ── */}
      <AnimatePresence>
        {activate && (
          <motion.div
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            role="status"
            className="fixed inset-x-3 z-[60] mx-auto max-w-md rounded-2xl border border-line bg-surface p-3 shadow-float
                       bottom-[calc(var(--tabbar-h,0px)+12px+env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <RefreshCw className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <p className="flex-1 text-[13.5px] font-semibold leading-6 text-ink">
                يتوفّر تحديث جديد للتطبيق
              </p>
              <button onClick={activate} className="btn btn-sm btn-primary shrink-0">تحديث</button>
              <button onClick={() => setActivate(null)} aria-label="لاحقاً"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-3">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── دعوة التثبيت ── */}
      <AnimatePresence>
        {showInstall && !activate && (
          <motion.div
            initial={{ y: 90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 90, opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="fixed inset-x-3 z-[55] mx-auto max-w-md overflow-hidden rounded-2xl border border-line bg-surface shadow-float
                       bottom-[calc(var(--tabbar-h,0px)+12px+env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-6">
            <div className="brand-rule h-1" aria-hidden />
            <div className="flex items-start gap-3 p-3.5">
              <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt=""
                className="h-11 w-11 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-ink">ثبّت التطبيق على جوالك</p>
                {showIos ? (
                  <p className="mt-1 flex flex-wrap items-center gap-1 text-[12.5px] leading-6 text-muted">
                    اضغط
                    <Share className="inline h-4 w-4 text-accent" aria-hidden />
                    <span className="font-semibold text-ink-2">مشاركة</span>
                    ثم
                    <SquarePlus className="inline h-4 w-4 text-accent" aria-hidden />
                    <span className="font-semibold text-ink-2">إضافة إلى الشاشة الرئيسية</span>
                  </p>
                ) : (
                  <p className="mt-1 text-[12.5px] leading-6 text-muted">
                    يفتح مباشرةً كتطبيق، ويعمل حتى مع ضعف الشبكة.
                  </p>
                )}
                {!showIos && (
                  <button onClick={() => void install()} className="btn btn-sm btn-primary mt-2.5">
                    <ArrowDownToLine className="h-4 w-4" aria-hidden /> تثبيت الآن
                  </button>
                )}
              </div>
              <button onClick={dismiss} aria-label="إغلاق"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-3">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
