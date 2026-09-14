import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { PdfDocument, TextItemLike } from '@/lib/pdf';
import { loadPdfjs, needsRepair, normalizeArabic, repairLines } from '@/lib/pdf';

interface Props {
  doc: PdfDocument | null;
  pageNumber: number;
  /** عرض الحاوية بالبكسل — تُحسب منه درجة التكبير */
  width: number;
  rotation?: number;
  /** طبقة نص قابلة للتحديد والبحث فوق الصفحة */
  textLayer?: boolean;
  /** كلمة البحث الحالية لتمييزها داخل الصفحة */
  highlight?: string;
  className?: string;
  /** يُستدعى بعد اكتمال التصيير */
  onRendered?: (pageNumber: number) => void;
  priority?: boolean;
}

/**
 * تصيير صفحة PDF واحدة على canvas عالي الدقة، مع طبقة نص اختيارية.
 *
 * الطبقة النصية تُبنى بواجهة TextLayer الرسمية في PDF.js — وهي التي
 * تضع كل قطعة نص في موضعها الصحيح بمصفوفة التحويل الخاصة بها. بناؤها
 * يدوياً هو ما كان يُنتج نصاً عربياً متناثراً ومقلوب الترتيب.
 */
export function PdfCanvas({
  doc, pageNumber, width, rotation = 0, textLayer = false,
  highlight, className, onRendered, priority,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef   = useRef<HTMLDivElement>(null);
  const taskRef   = useRef<{ cancel?: () => void } | null>(null);
  const [ready, setReady] = useState(false);
  const [size, setSize]   = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!doc || !width || pageNumber < 1) return;
    let cancelled = false;
    setReady(false);

    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        const base = page.getViewport({ scale: 1, rotation });
        const scale = width / base.width;
        const viewport = page.getViewport({ scale, rotation });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        canvas.width  = Math.floor(viewport.width  * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width  = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        setSize({ w: Math.floor(viewport.width), h: Math.floor(viewport.height) });

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, viewport.width, viewport.height);

        taskRef.current?.cancel?.();
        const task = page.render({ canvasContext: ctx, viewport });
        taskRef.current = task;
        await task.promise;
        if (cancelled) return;

        // ── طبقة النص ──
        const host = textRef.current;
        if (textLayer && host) {
          host.replaceChildren();
          host.style.width  = `${Math.floor(viewport.width)}px`;
          host.style.height = `${Math.floor(viewport.height)}px`;
          host.style.setProperty('--scale-factor', String(scale));

          const content = await page.getTextContent();
          const items = content.items.filter((i) => 'str' in i) as unknown as TextItemLike[];

          if (needsRepair(items)) {
            // الملف لا يحمل جدول ToUnicode صحيحاً: نبني طبقة نص مُصلَحة
            // سطراً سطراً بترتيب منطقي — فيصبح التحديد والنسخ والبحث سليماً
            // بدل النص المتفرّق المقلوب الذي يعيده المحرّك في هذه الحالة.
            for (const line of repairLines(items)) {
              const [vx, vy] = pdfjs.Util.applyTransform([line.x, line.y], viewport.transform);
              const w = Math.max(2, line.width * scale);
              const h = Math.max(6, line.height * scale);
              const el = document.createElement('span');
              el.textContent = line.text;
              el.dir = 'rtl';
              el.className = 'ln';
              el.style.left = `${vx}px`;
              el.style.top = `${vy - h}px`;
              el.style.width = `${w}px`;
              el.style.height = `${h}px`;
              el.style.fontSize = `${h * 0.92}px`;
              host.appendChild(el);
            }
          } else {
            const layer = new pdfjs.TextLayer({
              textContentSource: content,
              container: host,
              viewport,
            });
            await layer.render();
          }
          if (cancelled) return;
          if (highlight) markMatches(host, highlight);
        } else if (host) {
          host.replaceChildren();
        }

        page.cleanup();
        setReady(true);
        onRendered?.(pageNumber);
      } catch (e) {
        // إلغاء التصيير عند التنقّل السريع ليس خطأً
        const name = (e as { name?: string })?.name;
        if (name !== 'RenderingCancelledException' && !cancelled) setReady(true);
      }
    })();

    return () => { cancelled = true; taskRef.current?.cancel?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, pageNumber, width, rotation, textLayer, highlight]);

  return (
    <div className={clsx('relative select-none', className)}
      style={size ? { width: size.w, height: size.h } : undefined}>
      <canvas ref={canvasRef} className="block h-full w-full rounded-[inherit] bg-white" aria-label={`صفحة ${pageNumber}`} />
      {textLayer && <div ref={textRef} className="textLayer" aria-hidden={false} />}
      {!ready && (
        <div className="absolute inset-0 animate-pulse rounded-[inherit] bg-steel-200/40" aria-hidden />
      )}
      {!priority && null}
    </div>
  );
}

/** تمييز مواضع كلمة البحث داخل الطبقة النصية */
function markMatches(host: HTMLElement, term: string) {
  const needle = normalizeArabic(term);
  if (!needle) return;
  const spans = Array.from(host.querySelectorAll<HTMLElement>('span'));
  for (const s of spans) {
    if (normalizeArabic(s.textContent ?? '').includes(needle)) s.classList.add('hl');
  }
}
