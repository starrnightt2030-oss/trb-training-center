/**
 * تسجيل عامل الخدمة وإدارة التحديثات.
 *
 * قاعدة مهمة: الموقع يُحدَّث من لوحة الإدارة باستمرار، فلا يصحّ أن يعلق
 * المستخدم على نسخة قديمة مخزَّنة. لذلك نراقب ظهور نسخة جديدة ونُعلم
 * الواجهة لتعرض للمستخدم زر «تحديث».
 */

type UpdateHandler = (activate: () => void) => void;

let onUpdate: UpdateHandler | null = null;

export function setUpdateHandler(fn: UpdateHandler) { onUpdate = fn; }

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  // أثناء التطوير لا نسجّل شيئًا حتى لا يخزّن نسخًا من ملفات قيد التعديل
  if (import.meta.env.DEV) return;

  const base = import.meta.env.BASE_URL || '/';

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${base}sw.js`, { scope: base })
      .then((reg) => {
        // نسخة جديدة تنتظر التفعيل
        const notify = (worker: ServiceWorker) => {
          onUpdate?.(() => {
            worker.postMessage('skip-waiting');
            worker.addEventListener('statechange', () => {
              if (worker.state === 'activated') window.location.reload();
            });
          });
        };

        if (reg.waiting) notify(reg.waiting);

        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            // «installed» مع وجود عامل مسيطر = تحديث لا تثبيت أول
            if (sw.state === 'installed' && navigator.serviceWorker.controller) notify(sw);
          });
        });

        // فحص دوري للتحديثات عند عودة التطبيق إلى الواجهة
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update();
        });
      })
      .catch(() => { /* تعذّر التسجيل — الموقع يعمل طبيعيًا بدونه */ });
  });
}

/* ── التثبيت على الشاشة الرئيسية ── */

export interface InstallPrompt {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPrompt | null = null;
const listeners = new Set<(available: boolean) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferred = e as unknown as InstallPrompt;
    listeners.forEach((l) => l(true));
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l(false));
  });
}

export function onInstallAvailability(fn: (available: boolean) => void): () => void {
  listeners.add(fn);
  fn(!!deferred);
  return () => { listeners.delete(fn); };
}

/** يعرض نافذة التثبيت — يرجع true إن قبل المستخدم */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  if (outcome === 'accepted') deferred = null;
  return outcome === 'accepted';
}

/** هل التطبيق مفتوح الآن كتطبيق مثبَّت لا كصفحة في المتصفح؟ */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

/** آيفون لا يدعم beforeinstallprompt — يحتاج إرشادًا يدويًا */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
