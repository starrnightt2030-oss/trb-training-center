/* ═══════════════════════════════════════════════════════════════════════
   عامل الخدمة (Service Worker) — منصة مركز تدريب ترسانة الإسكندرية
   ───────────────────────────────────────────────────────────────────────
   الهدف: أن يُثبَّت الموقع على الجوال كتطبيق، وأن يفتح فورًا عند ضعف
   الشبكة أو انقطاعها، مع ضمان ألا يعلق المستخدم على نسخة قديمة.

   الاستراتيجيات:
   ① التنقّل بين الصفحات → الشبكة أولًا ثم الذاكرة (فلا تُعرض نسخة قديمة
      من الصفحة ما دامت الشبكة تعمل)، مع مهلة قصيرة تمنع الانتظار الطويل.
   ② أصول البناء (js/css ذات البصمة في اسمها) → الذاكرة أولًا، فهي لا
      تتغيّر أبدًا لنفس الاسم.
   ③ الصور وملفات الكتب وموارد PDF.js → الذاكرة ثم تحديث في الخلفية.
   ④ طلبات Supabase وكل ما ليس GET → لا تُخزَّن إطلاقًا؛ البيانات يجب أن
      تكون حيّة دائمًا (الغياب والأخبار والكتب تتغيّر).
   ═══════════════════════════════════════════════════════════════════════ */

const VERSION    = '__BUILD_STAMP__';
const SHELL      = `trb-shell-${VERSION}`;
const ASSETS     = `trb-assets-${VERSION}`;
const MEDIA      = `trb-media-${VERSION}`;
const KEEP       = new Set([SHELL, ASSETS, MEDIA]);

/** جذر التطبيق — يُشتقّ من نطاق عامل الخدمة فيعمل على النطاق الفرعي وعلى الجذر */
const BASE = new URL(self.registration.scope).pathname;
const OFFLINE_URL = BASE;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // الهيكل الأساسي فقط — بقيّة الملفات تُخزَّن عند أول استعمال
    await cache.addAll([BASE, `${BASE}manifest.webmanifest`].map((u) => new Request(u, { cache: 'reload' })))
      .catch(() => { /* تعذّر التخزين المبدئي ليس سببًا لفشل التثبيت */ });
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // كل نشرة تحمل بصمة جديدة، وأسماء ملفات البناء تتغيّر معها. الإبقاء على
    // مخزن قديم يعني أن صفحة محفوظة قد تطلب حزمة لم تعد موجودة على الخادم،
    // فينكسر التطبيق برسالة «Failed to fetch dynamically imported module».
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('trb-') && !KEEP.has(n)).map((n) => caches.delete(n)));
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable().catch(() => {});
    }
    await self.clients.claim();
  })());
});

/** يسمح للصفحة بطلب تفعيل النسخة الجديدة فورًا */
self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

const isBuildAsset = (url) => /\/assets\/[^/]+\.(js|css)$/.test(url.pathname);
const isMedia = (url) =>
  /\.(png|jpe?g|webp|svg|gif|ico|woff2?|ttf|otf|pdf|bcmap|pfb)$/i.test(url.pathname) ||
  url.pathname.includes('/pdfjs/');

async function networkFirst(request, preload) {
  const cache = await caches.open(SHELL);
  try {
    // no-store يمنع طبقة التخزين في المتصفح من إعادة صفحة قديمة تشير إلى
    // حزم حُذفت في النشرة الأخيرة
    const fresh = (await preload) || await fetch(request, { cache: 'no-store' });
    cache.put(request, fresh.clone()).catch(() => {});
    return fresh;
  } catch {
    return (await cache.match(request)) || (await cache.match(OFFLINE_URL)) || Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const fresh = await fetch(request);
  if (fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
  return fresh;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const net = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  }).catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // بيانات حيّة: لا تُخزَّن أبدًا
  if (url.hostname.endsWith('.supabase.co')) return;
  // نطاقات أخرى (يوتيوب مثلًا) تُترك للمتصفح
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, event.preloadResponse));
    return;
  }
  if (isBuildAsset(url)) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }
  if (isMedia(url)) {
    event.respondWith(staleWhileRevalidate(request, MEDIA));
  }
});
