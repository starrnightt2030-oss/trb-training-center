import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import {
  BookOpen, Bookmark, ChevronLeft, ChevronRight, Columns2, Download, FileText,
  Loader2, Maximize2, Minimize2, Minus, Plus, RotateCw, Search, Rows3, X, PanelRightOpen,
} from 'lucide-react';
import { normalizeArabic, openPdf, pageAspect, pageText } from '@/lib/pdf';
import type { PdfDocument } from '@/lib/pdf';
import { PdfCanvas } from './pdf/PdfCanvas';
import { FlipBook } from './pdf/FlipBook';

type Mode = 'book' | 'page' | 'scroll';

interface Props {
  url: string;
  title: string;
  allowDownload?: boolean;
  /** معرّف الكتاب — يُحفظ به آخر موضع قراءة */
  storageKey?: string;
}

const EASE = [0.22, 1, 0.36, 1] as const;
const MODES: Array<{ id: Mode; label: string; icon: typeof BookOpen }> = [
  { id: 'book',   label: 'كتاب',        icon: Columns2 },
  { id: 'page',   label: 'صفحة واحدة',  icon: FileText },
  { id: 'scroll', label: 'تمرير متصل',  icon: Rows3 },
];

export function PdfViewer({ url, title, allowDownload, storageKey }: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [doc, setDoc]       = useState<PdfDocument | null>(null);
  const [numPages, setNum]  = useState(0);
  const [aspect, setAspect] = useState(0.707);       // العرض ÷ الارتفاع
  const [page, setPage]     = useState(1);
  const [zoom, setZoom]     = useState(1);
  const [rotation, setRot]  = useState(0);
  const [mode, setMode]     = useState<Mode>('book');
  const [loading, setLoad]  = useState(true);
  const [pct, setPct]       = useState(0);
  const [error, setError]   = useState<string | null>(null);
  const [full, setFull]     = useState(false);
  const [panel, setPanel]   = useState<'none' | 'thumbs' | 'search'>('none');
  const [stage, setStage]   = useState({ w: 900, h: 600 });

  const [query, setQuery]   = useState('');
  const [results, setResults] = useState<Array<{ page: number; snippet: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [searchAt, setSearchAt] = useState(0);
  const [marks, setMarks] = useState<number[]>([]);

  const lsKey = storageKey ? `trb.reader.${storageKey}` : null;

  /* ── فتح المستند ── */
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    setLoad(true); setError(null); setDoc(null); setNum(0); setPct(0);

    (async () => {
      try {
        const d = await openPdf(url, {
          signal: ac.signal,
          onProgress: (loaded, total) => { if (total) setPct(Math.min(100, Math.round((loaded / total) * 100))); },
        });
        if (cancelled) return;
        setDoc(d);
        setNum(d.numPages);
        setAspect(await pageAspect(d, 1));
      } catch {
        if (!cancelled) setError('تعذّر فتح ملف الكتاب. تأكد من صحة الرابط أو جرّب فتحه في نافذة جديدة.');
      } finally {
        if (!cancelled) setLoad(false);
      }
    })();

    return () => { cancelled = true; ac.abort(); };
  }, [url]);

  /* ── استعادة آخر موضع قراءة وحفظه ── */
  useEffect(() => {
    if (!lsKey || !numPages) return;
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const s = JSON.parse(raw) as { page?: number; marks?: number[]; mode?: Mode };
        if (s.page && s.page >= 1 && s.page <= numPages) setPage(s.page);
        if (Array.isArray(s.marks)) setMarks(s.marks.filter((n) => n >= 1 && n <= numPages));
        if (s.mode && MODES.some((m) => m.id === s.mode)) setMode(s.mode);
      }
    } catch { /* التخزين المحلي قد يكون محجوباً */ }
  }, [lsKey, numPages]);

  useEffect(() => {
    if (!lsKey || !numPages) return;
    const t = window.setTimeout(() => {
      try { localStorage.setItem(lsKey, JSON.stringify({ page, marks, mode })); } catch { /* تجاهُل */ }
    }, 400);
    return () => window.clearTimeout(t);
  }, [lsKey, page, marks, mode, numPages]);

  /* ── قياس المسرح ── */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setStage({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setStage({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  /* ── ملء الشاشة ── */
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const toggleFull = () => {
    if (!document.fullscreenElement) void shellRef.current?.requestFullscreen?.();
    else void document.exitFullscreen();
  };

  /* ── حساب مقاس الصفحة ── */
  const narrow = stage.w < 760;
  const effectiveMode: Mode = narrow && mode === 'book' ? 'page' : mode;

  const { pw, ph } = useMemo(() => {
    const padding = 32;
    const availW = Math.max(240, stage.w - padding);
    const availH = Math.max(320, stage.h - padding);
    const perPage = effectiveMode === 'book' ? availW / 2 : availW;
    // ملاءمة الارتفاع أولاً ثم العرض، ثم تطبيق التكبير
    let w = Math.min(perPage, availH * aspect);
    if (effectiveMode === 'scroll') w = Math.min(perPage, 980);
    w = Math.max(160, w * zoom);
    return { pw: Math.floor(w), ph: Math.floor(w / aspect) };
  }, [stage, aspect, zoom, effectiveMode]);

  /* ── البحث داخل الكتاب ── */
  const runSearch = useCallback(async (q: string) => {
    if (!doc || !q.trim()) { setResults([]); return; }
    setSearching(true);
    setResults([]);
    const needle = normalizeArabic(q);
    const found: Array<{ page: number; snippet: string }> = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      setSearchAt(i);
      // eslint-disable-next-line no-await-in-loop
      const text = await pageText(doc, i);
      // السطر الذي وقعت فيه المطابقة هو أوضح مقتطف يُعرض للطالب
      const line = text.split('\n').find((l) => normalizeArabic(l).includes(needle));
      if (line) {
        const clean = line.trim();
        found.push({ page: i, snippet: clean.length > 150 ? `${clean.slice(0, 150)}…` : clean });
        if (found.length >= 80) break;
      }
    }
    setResults(found);
    setSearching(false);
    setSearchAt(0);
  }, [doc]);

  const goTo = (n: number) => setPage(Math.min(Math.max(1, n), Math.max(1, numPages)));

  const toggleMark = () => setMarks((m) => (m.includes(page) ? m.filter((x) => x !== page) : [...m, page].sort((a, b) => a - b)));

  /* ── التمرير المتصل: تتبّع الصفحة الظاهرة ── */
  const onScrollList = () => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / (ph + 20)) + 1;
    if (idx !== page) setPage(Math.min(Math.max(1, idx), numPages));
  };

  if (error) {
    return (
      <div className="card border-ember-200 bg-ember-50 p-10 text-center">
        <p className="text-[15px] font-semibold text-ember-800">{error}</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-md btn-primary mt-5">
          <Download className="h-4 w-4" aria-hidden /> فتح الملف في نافذة جديدة
        </a>
      </div>
    );
  }

  const IconBtn = ({ onClick, label, active, disabled, children }: {
    onClick?: () => void; label: string; active?: boolean; disabled?: boolean; children: React.ReactNode;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={clsx(
        'flex h-9 w-9 items-center justify-center rounded-lg border text-[13px] transition',
        active ? 'border-transparent bg-navy-700 text-white'
               : 'border-line-2 bg-surface text-ink-2 hover:border-accent/45 hover:text-accent',
        'disabled:opacity-35 disabled:hover:border-line-2 disabled:hover:text-ink-2',
      )}>
      {children}
    </button>
  );

  return (
    <div ref={shellRef} className={clsx('overflow-hidden rounded-2xl border border-line bg-surface', full && 'rounded-none')}>
      {/* ═══ شريط الأدوات ═══ */}
      <div className="reader-toolbar justify-between border-b px-2.5 py-2">
        {/* التنقل */}
        <div className="flex items-center gap-1">
          <IconBtn label="الصفحة السابقة" onClick={() => goTo(page - (effectiveMode === 'book' ? 2 : 1))} disabled={page <= 1}>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </IconBtn>
          <div className="flex items-center gap-1 px-1">
            <input
              value={page}
              onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); if (n) goTo(n); }}
              inputMode="numeric" aria-label="رقم الصفحة"
              className="nums-latn h-9 w-14 rounded-lg border border-line-2 bg-surface text-center text-[13.5px] font-bold text-ink" />
            <span className="nums-latn text-[13px] text-muted">/ {numPages || '—'}</span>
          </div>
          <IconBtn label="الصفحة التالية" onClick={() => goTo(page + (effectiveMode === 'book' ? 2 : 1))} disabled={page >= numPages}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </IconBtn>
        </div>

        {/* أوضاع العرض */}
        <div className="flex items-center gap-1 rounded-xl border border-line bg-surface-3 p-1">
          {MODES.map((m) => (
            <button key={m.id} type="button" onClick={() => setMode(m.id)}
              disabled={m.id === 'book' && narrow}
              aria-pressed={mode === m.id}
              className={clsx(
                'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold transition disabled:opacity-35',
                mode === m.id ? 'bg-surface text-accent shadow-card' : 'text-muted hover:text-ink',
              )}>
              <m.icon className="h-[15px] w-[15px]" aria-hidden />
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
        </div>

        {/* أدوات */}
        <div className="flex items-center gap-1">
          <IconBtn label="بحث داخل الكتاب" active={panel === 'search'}
            onClick={() => setPanel((p) => (p === 'search' ? 'none' : 'search'))}>
            <Search className="h-4 w-4" aria-hidden />
          </IconBtn>
          <IconBtn label="مصغّرات الصفحات" active={panel === 'thumbs'}
            onClick={() => setPanel((p) => (p === 'thumbs' ? 'none' : 'thumbs'))}>
            <PanelRightOpen className="h-4 w-4" aria-hidden />
          </IconBtn>
          <IconBtn label={marks.includes(page) ? 'إزالة العلامة' : 'وضع علامة مرجعية'} active={marks.includes(page)} onClick={toggleMark}>
            <Bookmark className="h-4 w-4" aria-hidden />
          </IconBtn>
          <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />
          <IconBtn label="تصغير" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))}>
            <Minus className="h-4 w-4" aria-hidden />
          </IconBtn>
          <button type="button" onClick={() => setZoom(1)} title="إعادة ضبط التكبير"
            className="nums-latn h-9 w-14 rounded-lg text-center text-[12.5px] font-bold text-ink-2 hover:bg-surface-3">
            {Math.round(zoom * 100)}%
          </button>
          <IconBtn label="تكبير" onClick={() => setZoom((z) => Math.min(3, +(z + 0.15).toFixed(2)))}>
            <Plus className="h-4 w-4" aria-hidden />
          </IconBtn>
          <IconBtn label="تدوير الصفحة" onClick={() => setRot((r) => (r + 90) % 360)}>
            <RotateCw className="h-4 w-4" aria-hidden />
          </IconBtn>
          <IconBtn label={full ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'} onClick={toggleFull}>
            {full ? <Minimize2 className="h-4 w-4" aria-hidden /> : <Maximize2 className="h-4 w-4" aria-hidden />}
          </IconBtn>
          {allowDownload && (
            <a href={url} download target="_blank" rel="noopener noreferrer"
              className="btn btn-sm btn-primary mr-1">
              <Download className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">تحميل</span>
            </a>
          )}
        </div>
      </div>

      {/* ═══ المسرح ═══ */}
      <div className="relative flex" style={{ height: full ? 'calc(100vh - 58px)' : 'min(78vh, 900px)' }}>
        {/* اللوحة الجانبية */}
        <AnimatePresence initial={false}>
          {panel !== 'none' && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 268, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="shrink-0 overflow-hidden border-l border-line bg-surface-2">
              <div className="flex h-full w-[268px] flex-col">
                <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
                  <p className="text-[13px] font-bold text-ink">
                    {panel === 'thumbs' ? 'صفحات الكتاب' : 'بحث داخل الكتاب'}
                  </p>
                  <button onClick={() => setPanel('none')} aria-label="إغلاق اللوحة"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface-3 hover:text-ink">
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>

                {panel === 'search' ? (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <form className="p-3" onSubmit={(e) => { e.preventDefault(); void runSearch(query); }}>
                      <div className="relative">
                        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                        <input value={query} onChange={(e) => setQuery(e.target.value)}
                          placeholder="اكتب كلمة ثم اضغط Enter…" aria-label="كلمة البحث"
                          className="input pr-9 text-[13.5px]" />
                      </div>
                      <p className="mt-2 text-[11.5px] leading-5 text-muted">
                        البحث يتجاهل التشكيل ويوحّد صور الألف والياء والتاء المربوطة.
                      </p>
                    </form>
                    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                      {searching && (
                        <p className="flex items-center gap-2 px-2 py-3 text-[13px] text-muted">
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          <span className="nums-latn">جارٍ البحث… صفحة {searchAt} من {numPages}</span>
                        </p>
                      )}
                      {!searching && query && results.length === 0 && (
                        <p className="px-2 py-3 text-[13px] text-muted">لا توجد نتائج مطابقة.</p>
                      )}
                      {results.map((r) => (
                        <button key={r.page} onClick={() => goTo(r.page)}
                          className="mb-1.5 block w-full rounded-xl border border-line bg-surface p-3 text-right transition hover:border-accent/45">
                          <span className="nums-latn mb-1 block text-[11.5px] font-bold text-accent">صفحة {r.page}</span>
                          <span className="block text-[12.5px] leading-6 text-ink-2">{r.snippet}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    {marks.length > 0 && (
                      <div className="mb-3">
                        <p className="mb-2 text-[11.5px] font-bold text-muted">العلامات المرجعية</p>
                        <div className="flex flex-wrap gap-1.5">
                          {marks.map((m) => (
                            <button key={m} onClick={() => goTo(m)}
                              className="nums-latn chip h-7 px-2.5 text-[11.5px]">
                              <Bookmark className="h-3 w-3" aria-hidden /> {m}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
                        <button key={n} onClick={() => goTo(n)}
                          className={clsx(
                            'overflow-hidden rounded-lg border transition',
                            n === page ? 'border-accent ring-2 ring-accent/25' : 'border-line hover:border-accent/45',
                          )}>
                          <span className="block bg-white">
                            <PdfCanvas doc={doc} pageNumber={n} width={110} />
                          </span>
                          <span className="nums-latn block bg-surface py-1 text-center text-[11px] font-semibold text-ink-2">{n}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* منطقة العرض */}
        <div ref={stageRef} className="reader-shell relative min-w-0 flex-1">
          {loading && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-navy-950/85" role="status">
              <BookOpen className="h-9 w-9 animate-pulse text-brass-400" aria-hidden />
              <p className="text-[14px] font-semibold text-white/80">جارٍ فتح الكتاب…</p>
              <div className="h-1.5 w-52 overflow-hidden rounded-full bg-white/15">
                <motion.div className="h-full rounded-full bg-brass-400"
                  animate={{ width: `${pct || 8}%` }} transition={{ ease: 'easeOut', duration: 0.3 }} />
              </div>
            </div>
          )}

          {effectiveMode === 'scroll' ? (
            <div ref={scrollRef} onScroll={onScrollList}
              className="h-full overflow-auto px-4 py-5">
              <div className="mx-auto flex flex-col items-center gap-5" style={{ width: pw }}>
                {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
                  <div key={n} className="reader-page overflow-hidden" id={`pdf-page-${n}`}>
                    <PdfCanvas doc={doc} pageNumber={n} width={pw} rotation={rotation}
                      textLayer highlight={query || undefined} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center overflow-auto p-4">
              {doc && numPages > 0 && (
                <FlipBook
                  doc={doc}
                  numPages={numPages}
                  page={page}
                  onPageChange={setPage}
                  pageWidth={pw}
                  pageHeight={ph}
                  single={effectiveMode === 'page'}
                  textLayer
                  highlight={query || undefined}
                />
              )}
            </div>
          )}

          {/* تلميح التنقّل */}
          {!loading && effectiveMode === 'book' && (
            <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[11.5px] text-white/45">
              اسحب أو انقر على حافة الصفحة للتقليب — أو استخدم أسهم لوحة المفاتيح
            </p>
          )}
        </div>
      </div>

      {/* شريط تقدّم القراءة */}
      <div className="h-1 w-full bg-surface-3" aria-hidden>
        <div className="h-full bg-gradient-to-l from-brass-400 to-accent transition-all duration-500"
          style={{ width: numPages ? `${(page / numPages) * 100}%` : '0%' }} />
      </div>
      <span className="sr-only" aria-live="polite">{`صفحة ${page} من ${numPages} — ${title}`}</span>
    </div>
  );
}
