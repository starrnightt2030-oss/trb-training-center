import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import clsx from 'clsx';
import { PdfCanvas } from './PdfCanvas';
import type { PdfDocument } from '@/lib/pdf';

/**
 * كتاب بتقليب صفحات واقعي — مضبوط على اتجاه القراءة العربية.
 *
 * النموذج الورقي: الورقة رقم i تحمل الصفحة (2i+1) على وجهها و(2i+2) على ظهرها.
 * في الكتاب العربي يقع وجه الورقة على اليسار وظهرها على اليمين، والتقدّم
 * يتم بقلب الورقة اليسرى نحو اليمين حول الكعب في المنتصف — وهو ما يحاكيه
 * الدوران ثلاثي الأبعاد أدناه، مع ظلّ يشتدّ عند منتصف الطيّة كما في الورق.
 */

interface Props {
  doc: PdfDocument | null;
  numPages: number;
  /** رقم الصفحة الحالي (1-based) */
  page: number;
  onPageChange: (page: number) => void;
  /** عرض الصفحة الواحدة بالبكسل */
  pageWidth: number;
  pageHeight: number;
  /** صفحة واحدة بدل صفحتين (الجوال أو اختيار المستخدم) */
  single?: boolean;
  textLayer?: boolean;
  highlight?: string;
  className?: string;
}

const DURATION = 0.78;
const EASE = [0.36, 0.05, 0.22, 1] as const;

export function FlipBook({
  doc, numPages, page, onPageChange, pageWidth, pageHeight,
  single = false, textLayer = false, highlight, className,
}: Props) {
  const reduce = useReducedMotion();
  const [flipping, setFlipping] = useState<'next' | 'prev' | null>(null);
  const angle = useMotionValue(0);
  const busy = useRef(false);
  const touchX = useRef<number | null>(null);

  /** عدد الأوراق، وموضع الورقة الحالية */
  const leaf = Math.floor(Math.max(0, page - 1) / 2);      // الورقة المفتوحة حالياً
  const leftPage  = leaf * 2 + 1;                           // وجه الورقة (يسار)
  const rightPage = leaf * 2;                               // ظهر الورقة السابقة (يمين)

  const at = (n: number) => (n >= 1 && n <= numPages ? n : 0);

  const canNext = single ? page < numPages : leftPage + 1 <= numPages;
  const canPrev = single ? page > 1 : leaf > 0;

  /* ظلّ الطيّة: يبلغ ذروته عند ٩٠ درجة */
  const foldShade = useTransform(angle, (a) => {
    const t = Math.min(1, Math.abs(a) / 180);
    return 0.55 * Math.sin(t * Math.PI);
  });
  const spineShade = useTransform(angle, (a) => {
    const t = Math.min(1, Math.abs(a) / 180);
    return 0.35 * Math.sin(t * Math.PI);
  });

  const go = useCallback(async (dir: 'next' | 'prev') => {
    if (busy.current || !doc) return;
    if (dir === 'next' && !canNext) return;
    if (dir === 'prev' && !canPrev) return;

    if (single) {
      onPageChange(dir === 'next' ? page + 1 : page - 1);
      return;
    }

    if (reduce) {
      onPageChange(dir === 'next' ? Math.min(numPages, leftPage + 2) : Math.max(1, leftPage - 2));
      return;
    }

    busy.current = true;
    setFlipping(dir);
    angle.set(0);
    const to = dir === 'next' ? 180 : -180;
    await animate(angle, to, { duration: DURATION, ease: EASE });
    onPageChange(dir === 'next'
      ? Math.min(numPages, leftPage + 2)
      : Math.max(1, leftPage - 2));
    setFlipping(null);
    angle.set(0);
    busy.current = false;
  }, [angle, canNext, canPrev, doc, leftPage, numPages, onPageChange, page, reduce, single]);

  /* لوحة المفاتيح: السهم الأيسر يتقدّم في الاتجاه العربي */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /input|textarea|select/i.test(t.tagName)) return;
      if (e.key === 'ArrowLeft'  || e.key === 'PageDown') { e.preventDefault(); void go('next'); }
      if (e.key === 'ArrowRight' || e.key === 'PageUp')   { e.preventDefault(); void go('prev'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const sheet = useMemo(() => ({
    // الورقة المتحرّكة عند التقدّم: وجهها الصفحة اليسرى الحالية، وظهرها التالية
    nextFront: at(leftPage),
    nextBack:  at(leftPage + 1),
    // الورقة المتحرّكة عند الرجوع: وجهها الصفحة اليمنى الحالية، وظهرها السابقة
    prevFront: at(rightPage),
    prevBack:  at(rightPage - 1),
    // ما يظهر تحت الورقة المتحرّكة
    underLeftNext:  at(leftPage + 2),
    underRightPrev: at(rightPage - 2),
    // الثابت أثناء الحركة
    staticRight: at(rightPage),
    staticLeft:  at(leftPage),
  }), [leftPage, rightPage, numPages]);

  const W = pageWidth, H = pageHeight;

  /** وجه ورقة — أو «باطن الغلاف» حين لا توجد صفحة بهذا الموضع */
  const Sheet = ({ n, className: cn }: { n: number; className?: string }) => (
    <div className={clsx('relative overflow-hidden bg-white', cn)} style={{ width: W, height: H }}>
      {n > 0 ? (
        <PdfCanvas doc={doc} pageNumber={n} width={W} textLayer={textLayer} highlight={highlight} />
      ) : (
        <div className="flex h-full w-full items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, #14202f 0%, #0c1522 55%, #101a28 100%)',
            boxShadow: 'inset 0 0 90px rgba(0,0,0,.65)',
          }}>
          <span className="select-none text-[12.5px] tracking-widest text-white/20">باطن الغلاف</span>
        </div>
      )}
    </div>
  );

  /* ── وضع الصفحة الواحدة ── */
  if (single) {
    return (
      <div className={clsx('relative mx-auto', className)} style={{ width: W, height: H }}>
        <motion.div key={page}
          initial={reduce ? false : { opacity: 0, x: 24, rotateY: -8 }}
          animate={{ opacity: 1, x: 0, rotateY: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="reader-page overflow-hidden"
          style={{ width: W, height: H, transformStyle: 'preserve-3d' }}>
          <Sheet n={page} />
        </motion.div>
      </div>
    );
  }

  /* ── وضع الكتاب المفتوح (صفحتان) ── */
  return (
    <div className={clsx('relative mx-auto', className)}
      style={{ width: W * 2, height: H, perspective: 2600 }}
      onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        if (start == null) return;
        const dx = (e.changedTouches[0]?.clientX ?? start) - start;
        if (dx < -55) void go('next');
        else if (dx > 55) void go('prev');
      }}>

      {/* الصفحة اليمنى (تُقرأ أولاً في العربية) */}
      <div className="absolute inset-y-0 right-0 reader-page overflow-hidden"
        style={{ width: W, borderStartStartRadius: 0, borderEndStartRadius: 0 }}>
        {flipping === 'prev'
          ? <Sheet n={sheet.underRightPrev} />
          : <Sheet n={sheet.staticRight} />}
      </div>

      {/* الصفحة اليسرى */}
      <div className="absolute inset-y-0 left-0 reader-page overflow-hidden"
        style={{ width: W, borderStartEndRadius: 0, borderEndEndRadius: 0 }}>
        {flipping === 'next'
          ? <Sheet n={sheet.underLeftNext} />
          : <Sheet n={sheet.staticLeft} />}
      </div>

      {/* ظلّ الكعب في المنتصف */}
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-16 -translate-x-1/2"
        style={{ background: 'linear-gradient(90deg, rgba(0,0,0,.16), rgba(0,0,0,.02) 45%, rgba(0,0,0,.02) 55%, rgba(0,0,0,.16))' }}
        aria-hidden />

      {/* الورقة المتحرّكة */}
      {flipping && (
        <motion.div
          className="absolute inset-y-0 z-20"
          style={{
            width: W,
            [flipping === 'next' ? 'left' : 'right']: 0,
            transformStyle: 'preserve-3d',
            transformOrigin: flipping === 'next' ? 'right center' : 'left center',
            rotateY: angle,
          }}
        >
          {/* الوجه */}
          <div className="absolute inset-0 overflow-hidden reader-page"
            style={{ backfaceVisibility: 'hidden' }}>
            <Sheet n={flipping === 'next' ? sheet.nextFront : sheet.prevFront} />
            <motion.div className="pointer-events-none absolute inset-0 bg-black"
              style={{ opacity: foldShade }} aria-hidden />
          </div>
          {/* الظهر */}
          <div className="absolute inset-0 overflow-hidden reader-page"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
            <Sheet n={flipping === 'next' ? sheet.nextBack : sheet.prevBack} />
            <motion.div className="pointer-events-none absolute inset-0 bg-black"
              style={{ opacity: spineShade }} aria-hidden />
          </div>
        </motion.div>
      )}

      {/* مناطق النقر للتقليب */}
      <button type="button" onClick={() => void go('next')} disabled={!canNext}
        aria-label="الصفحة التالية"
        className="absolute inset-y-0 left-0 z-30 w-[22%] cursor-w-resize disabled:cursor-default"
        style={{ background: 'transparent' }} />
      <button type="button" onClick={() => void go('prev')} disabled={!canPrev}
        aria-label="الصفحة السابقة"
        className="absolute inset-y-0 right-0 z-30 w-[22%] cursor-e-resize disabled:cursor-default"
        style={{ background: 'transparent' }} />
    </div>
  );
}
