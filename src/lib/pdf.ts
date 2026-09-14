/**
 * محمّل PDF.js موحّد لكل الموقع.
 *
 * ── لماذا هذا الملف؟ ───────────────────────────────────────────────
 * كانت الكتب العربية تُفتح بنصوص متفرّقة أو مربّعات فارغة لأن المستند
 * كان يُفتح بلا تعريف مسار cMaps ولا الخطوط القياسية. الخطوط العربية
 * داخل ملفات PDF تُرمَّز غالباً بترميز CID، ولا يستطيع PDF.js تحويل
 * هذه الرموز إلى محارف يونيكود صحيحة إلا بملفات cMaps. وحين لا يكون
 * الخط مدمجاً في الملف يحتاج المحرّك إلى الخطوط القياسية ليستبدلها.
 * الإعدادات أدناه تعالج الحالتين، وتُحمَّل الموارد محلياً من مجلد
 * public/pdfjs (يُنسخ آلياً بـ scripts/copy-pdfjs-assets.mjs).
 * ──────────────────────────────────────────────────────────────────
 */

export type PdfModule = typeof import('pdfjs-dist');
export type PdfDocument = Awaited<ReturnType<PdfModule['getDocument']>['promise']>;
export type PdfPage = Awaited<ReturnType<PdfDocument['getPage']>>;

let modulePromise: Promise<PdfModule> | null = null;

/** المسار الأساسي للموقع — يعمل على نطاق مستقل أو داخل مجلد فرعي (GitHub Pages) */
function assetBase(): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

/** تحميل المكتبة مرة واحدة فقط، مع تهيئة عامل الخلفية */
export async function loadPdfjs(): Promise<PdfModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return modulePromise;
}

export interface OpenOptions {
  /** إشارة إلغاء عند مغادرة الصفحة قبل اكتمال التحميل */
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
}

/** فتح مستند PDF بإعدادات تدعم العربية دعماً كاملاً */
export async function openPdf(url: string, opts: OpenOptions = {}) {
  const pdfjs = await loadPdfjs();
  const base = assetBase();

  const task = pdfjs.getDocument({
    url,
    // ① جداول تحويل ترميز CID → يونيكود (ضرورية للعربية)
    cMapUrl: `${base}pdfjs/cmaps/`,
    cMapPacked: true,
    // ② الخطوط القياسية البديلة حين لا يكون الخط مدمجاً في الملف
    standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
    // ③ ★ السبب الجذري لتلف النصوص العربية ★
    //    حين يُترك هذا الخيار على false يسلّم PDF.js الخط المدمج إلى محمّل
    //    الخطوط في المتصفح عبر @font-face. ومحمّل الخطوط يرفض كثيراً من
    //    الخطوط العربية المدمجة (خطوط جزئية Subset بترميز Identity-H)،
    //    فيسقط PDF.js إلى خطّ بديل ويرسم كل محرف على حدة من قيمة اليونيكود
    //    بدل رسم الأشكال المخزّنة في الملف — فتظهر الحروف منفصلة ومبعثرة
    //    ومقلوبة الترتيب، وهي المشكلة التي كانت تظهر عند فتح الكتب.
    //    بتعطيله يرسم PDF.js مسارات الحروف (Glyph Outlines) مباشرةً من
    //    الخط المدمج، فيُحفظ اتصال الحروف وترتيبها تماماً كما في الملف.
    disableFontFace: true,
    // ④ مع تعطيل @font-face لا معنى لخطوط النظام
    useSystemFonts: false,
    // ⑤ يتيح عرض الصفحات فور وصول أجزائها بدل انتظار الملف كاملاً
    disableAutoFetch: false,
    disableStream: false,
    isEvalSupported: false,
  });

  if (opts.onProgress) {
    task.onProgress = ({ loaded, total }: { loaded: number; total: number }) =>
      opts.onProgress?.(loaded, total);
  }

  opts.signal?.addEventListener('abort', () => { void task.destroy(); }, { once: true });

  return task.promise;
}

/**
 * تطبيع نص عربي للبحث: إزالة التشكيل والتطويل، وتوحيد صور الألف
 * والياء والتاء المربوطة — حتى يجد الطالب الكلمة مهما كُتبت.
 */
export function normalizeArabic(input: string): string {
  return input
    .replace(/[ً-ْٰـ]/g, '')  // تشكيل + تطويل
    .replace(/[آأإٱ]/g, 'ا') // آ أ إ ٱ → ا
    .replace(/[ى]/g, 'ي')                // ى → ي
    .replace(/[ة]/g, 'ه')                // ة → ه
    .replace(/[ؤ]/g, 'و')                // ؤ → و
    .replace(/[ئ]/g, 'ي')                // ئ → ي
    .replace(/‏|‎|‍|‌/g, '')   // محارف اتجاه غير مرئية
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}


/* ═══════════════════════════════════════════════════════════════════════
   إصلاح النص المستخرج من ملفات PDF العربية
   ═══════════════════════════════════════════════════════════════════════
   كثير من ملفات PDF العربية (خصوصاً المُصدَّرة من وورد أو من المتصفح) لا
   تحمل جدول ToUnicode صحيحاً، فيعيد PDF.js النص:
     ① بأشكال الحروف المتصلة (Arabic Presentation Forms) بدل الحروف الأصلية
     ② حرفاً حرفاً، كل حرف عنصر مستقل
     ③ بترتيب بصري مقلوب (من اليسار إلى اليمين)
   والنتيجة نص «متفرّق وغير صحيح» عند النسخ أو البحث — وهي المشكلة التي
   كانت تظهر عند فتح الكتب المرفوعة.

   العلاج: نجمع العناصر في أسطر حسب إحداثي Y، ونعكس ترتيب العناصر داخل كل
   سطر، ثم نطبّق تطبيع NFKC الذي يعيد أشكال الحروف إلى حروفها الأساسية.
   ═══════════════════════════════════════════════════════════════════════ */

/** نطاقات أشكال الحروف العربية — وجودها دليل على أن النص يحتاج إصلاحاً */
const PRESENTATION_FORMS = /[\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** علامات التشكيل تُلحق بالسطر السابق بدل أن تُفرد في سطر */
const MARKS_ONLY = /^[\u064B-\u0652\u0670\s]*$/;

export interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

export interface RepairedLine {
  text: string;
  /** حدود السطر بإحداثيات المستند (قبل تطبيق مقياس العرض) */
  x: number; y: number; width: number; height: number;
}

/** هل يحتاج نص هذه الصفحة إلى إصلاح؟ */
export function needsRepair(items: TextItemLike[]): boolean {
  return PRESENTATION_FORMS.test(items.map((i) => i.str).join(''));
}

/** تجميع عناصر النص في أسطر مرتّبة ترتيباً منطقياً صحيحاً */
export function repairLines(items: TextItemLike[]): RepairedLine[] {
  const groups: TextItemLike[][] = [];
  let cur: TextItemLike[] = [];
  let lastY: number | null = null;

  for (const it of items) {
    if (!it.str) continue;
    const y = it.transform[5];
    const tol = Math.max(1.5, (it.height || 10) * 0.35);
    if (lastY !== null && Math.abs(y - lastY) > tol) {
      if (cur.length) groups.push(cur);
      cur = [];
    }
    lastY = y;
    cur.push(it);
    if (it.hasEOL) { groups.push(cur); cur = []; lastY = null; }
  }
  if (cur.length) groups.push(cur);

  const lines: RepairedLine[] = [];
  for (const g of groups) {
    const text = g.slice().reverse().map((i) => i.str).join('')
      .normalize('NFKC')
      // محارف تحكّم يخلّفها غياب جدول ToUnicode لبعض الرموز
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .replace(/\s+/g, ' ').trim();
    if (!text) continue;

    const xs = g.map((i) => i.transform[4]);
    const xe = g.map((i, k) => i.transform[4] + (i.width || g[k].width || 0));
    const x = Math.min(...xs);
    const w = Math.max(...xe) - x;
    const h = Math.max(...g.map((i) => i.height || 10));
    const y = Math.min(...g.map((i) => i.transform[5]));

    // سطر لا يحوي إلا تشكيلاً: ألحقه بالسطر السابق
    if (MARKS_ONLY.test(text) && lines.length) {
      lines[lines.length - 1].text += text;
      continue;
    }
    lines.push({ text, x, y, width: w, height: h });
  }
  return lines;
}

/** نص الصفحة كاملاً بترتيب منطقي صحيح */
export function repairedPageText(items: TextItemLike[]): string {
  if (!needsRepair(items)) {
    return items.map((i) => i.str + (i.hasEOL ? '\n' : '')).join('');
  }
  return repairLines(items).map((l) => l.text).join('\n');
}

/** استخراج نص صفحة كاملاً بترتيب منطقي صحيح (يُستخدم في البحث داخل الكتاب) */
export async function pageText(doc: PdfDocument, pageNumber: number): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const items = content.items.filter((i): i is typeof i & TextItemLike => 'str' in i) as unknown as TextItemLike[];
  const text = repairedPageText(items);
  page.cleanup();
  return text;
}

/** أبعاد الصفحة بمقياس 1 — تُستخدم لحساب نسبة العرض إلى الارتفاع */
export async function pageAspect(doc: PdfDocument, pageNumber = 1): Promise<number> {
  const page = await doc.getPage(pageNumber);
  const vp = page.getViewport({ scale: 1 });
  page.cleanup();
  return vp.width / vp.height;
}
