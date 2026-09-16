import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import clsx from 'clsx';
import { PdfCanvas } from './PdfCanvas';
import type { PdfDocument } from '@/lib/pdf';

/**
 * كتاب بتقليب صفحات واقعي — مضبوط على اتجاه القراءة العربية.
 *
 * النموذج الورقي: الورقة رقم i تحمل الصفحة (2i+1) على وجهها و(2i+2) على ظهرها.
 * في الكتاب العربي يقع وجه الورقة على اليسار وظهرها على اليمين، والتقدّم يتم
 * بقلب الورقة اليسرى نحو اليمين حول الكعب في المنتصف.
 *
 * ── التفاعل ──────────────────────────────────────────────────────────────
 * السحب يتتبّع الإصبع لحظةً بلحظة (Pointer Events تغطي اللمس والفأرة معًا):
 * تدور الورقة بمقدار ما سحبت، فإن تجاوز السحب الثلث أو انطلق بسرعة كافية
 * أكملت الدورة، وإلا عادت إلى مكانها. هذا هو الفارق بين «تقليب يعمل» و
 * «تقليب يستجيب»، وهو ما كان ناقصًا على الجوال: وضع الصفحة الواحدة — وهو
 * الوضع الافتراضي على الشاشات الضيقة — لم يكن فيه تقليب أصلًا.
 * ────────────────────────────────────────────────────────────────────────
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

const DURATION = 0.72;
const EASE = [0.36, 0.05, 0.22, 1] as const;
/** نسبة السحب التي تُعدّ التزامًا بالتقليب */
const COMMIT = 0.32;
/** سرعة السحب (بكسل/ثانية) التي تُكمل التقليب مهما كانت المسافة */
const FLING = 480;

type Dir = 'next' | 'prev';

export function FlipBook({
  doc, numPages, page, onPageChange, pageWidth, pageHeight,
  single = false, textLayer = false, highlight, className,
}: Props) {
  const reduce = useReducedMotion();
  const [flipping, setFlipping] = useState<Dir | null>(null);
  const angle = useMotionValue(0);
  const busy = useRef(false);

  /* حالة السحب */
  const drag = useRef<{ id: number; x: number; t: number; dir: Dir | null; moved: boolean } | null>(null);

  /** عدد الأوراق، وموضع الورقة الحالية */
  const leaf = Math.floor(Math.max(0, page - 1) / 2);
  const leftPage  = leaf * 2 + 1;
  const rightPage = leaf * 2;

  const at = (n: number) => (n >= 1 && n <= numPages ? n : 0);

  const canNext = single ? page < numPages : leftPage + 1 <= numPages;
  const canPrev = single ? page > 1 : leaf > 0;

  /* ظلّ الطيّة: يبلغ ذروته عند ٩٠ درجة */
  const foldShade = useTransform(angle, (a) => {
    const t = Math.min(1, Math.abs(a) / 180);
    return 0.5 * Math.sin(t * Math.PI);
  });
  const spineShade = useTransform(angle, (a) => {
    const t = Math.min(1, Math.abs(a) / 180);
    return 0.32 * Math.sin(t * Math.PI);
  });

  const commit = useCallback((dir: Dir) => {
    if (single) {
      onPageChange(dir === 'next' ? Math.min(numPages, page + 1) : Math.max(1, page - 1));
    } else {
      onPageChange(dir === 'next'
        ? Math.min(numPages, leftPage + 2)
        : Math.max(1, leftPage - 2));
    }
  }, [single, page, numPages, leftPage, onPageChange]);

  /** تقليب كامل بضغطة زر أو مفتاح */
  const go = useCallback(async (dir: Dir) => {
    if (busy.current || !doc) return;
    if (dir === 'next' && !canNext) return;
    if (dir === 'prev' && !canPrev) return;

    if (reduce) { commit(dir); return; }

    busy.current = true;
    setFlipping(dir);
    angle.set(0);
    await animate(angle, dir === 'next' ? 180 : -180, { duration: DURATION, ease: EASE });
    commit(dir);
    setFlipping(null);
    angle.set(0);
    busy.current = false;
  }, [angle, canNext, canPrev, commit, doc, reduce]);

  /* ── السحب المتتبِّع للإصبع ── */
  const width = single ? pageWidth : pageWidth * 2;

  const onPointerDown = (e: React.PointerEvent) => {
    if (busy.current || reduce || !doc) return;
    // تجاهل السحب الذي يبدأ من عنصر تفاعلي (زر أو رابط)
    if ((e.target as HTMLElement).closest('button, a')) return;
    drag.current = { id: e.pointerId, x: e.clientX, t: performance.now(), dir: null, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;

    if (!d.dir) {
      if (Math.abs(dx) < 10) return;
      const dir: Dir = dx < 0 ? 'next' : 'prev';
      if ((dir === 'next' && !canNext) || (dir === 'prev' && !canPrev)) { drag.current = null; return; }
      d.dir = dir;
      d.moved = true;
      setFlipping(dir);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }

    const p = Math.min(1, Math.max(0, Math.abs(dx) / (width * 0.8)));
    angle.set(d.dir === 'next' ? p * 180 : -p * 180);
  };

  const endDrag = async (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.dir) return;

    const dx = e.clientX - d.x;
    const dt = Math.max(1, performance.now() - d.t);
    const velocity = Math.abs(dx) / (dt / 1000);
    const p = Math.min(1, Math.abs(dx) / (width * 0.8));
    const dir = d.dir;

    busy.current = true;
    if (p >= COMMIT || velocity >= FLING) {
      await animate(angle, dir === 'next' ? 180 : -180, {
        duration: DURATION * (1 - p) + 0.16, ease: EASE,
      });
      commit(dir);
    } else {
      await animate(angle, 0, { duration: 0.32, ease: [0.22, 1, 0.36, 1] });
    }
    setFlipping(null);
    angle.set(0);
    busy.current = false;
  };

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
    nextFront: at(leftPage),
    nextBack:  at(leftPage + 1),
    prevFront: at(rightPage),
    prevBack:  at(rightPage - 1),
    underLeftNext:  at(leftPage + 2),
    underRightPrev: at(rightPage - 2),
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

  const dragProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    style: { touchAction: 'pan-y' as const },
  };

  /* ══════════ وضع الصفحة الواحدة (الجوال) ══════════ */
  if (single) {
    const under = flipping === 'next' ? at(page + 1) : flipping === 'prev' ? at(page - 1) : 0;

    return (
      <div {...dragProps}
        className={clsx('relative mx-auto select-none', className)}
        style={{ width: W, height: H, perspective: 1900, touchAction: 'pan-y' }}>

        {/* الصفحة التي ستظهر تحت الورقة المتحرّكة */}
        {flipping && (
          <div className="absolute inset-0 reader-page overflow-hidden">
            <Sheet n={under} />
          </div>
        )}

        {/* الصفحة الحالية — تدور مع الإصبع */}
        <motion.div
          className="absolute inset-0 reader-page overflow-hidden"
          style={{
            transformStyle: 'preserve-3d',
            transformOrigin: flipping === 'prev' ? 'left center' : 'right center',
            rotateY: flipping ? angle : 0,
            zIndex: 10,
          }}>
          <div className="absolute inset-0 overflow-hidden" style={{ backfaceVisibility: 'hidden' }}>
            <Sheet n={page} />
            <motion.div className="pointer-events-none absolute inset-0 bg-black"
              style={{ opacity: flipping ? foldShade : 0 }} aria-hidden />
          </div>
          {/* ظهر الورقة أثناء الدوران */}
          <div className="absolute inset-0 overflow-hidden bg-white"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
            <div className="h-full w-full bg-gradient-to-l from-steel-100 to-white" />
          </div>
        </motion.div>

        {/* مناطق النقر على الحافّتين */}
        <button type="button" onClick={() => void go('next')} disabled={!canNext}
          aria-label="الصفحة التالية"
          className="absolute inset-y-0 left-0 z-20 w-[20%] disabled:pointer-events-none" />
        <button type="button" onClick={() => void go('prev')} disabled={!canPrev}
          aria-label="الصفحة السابقة"
          className="absolute inset-y-0 right-0 z-20 w-[20%] disabled:pointer-events-none" />
      </div>
    );
  }

  /* ══════════ وضع الكتاب المفتوح (صفحتان) ══════════ */
  return (
    <div {...dragProps}
      className={clsx('relative mx-auto select-none', className)}
      style={{ width: W * 2, height: H, perspective: 2600, touchAction: 'pan-y' }}>

      {/* الصفحة اليمنى (تُقرأ أولاً في العربية) */}
      <div className="absolute inset-y-0 right-0 reader-page overflow-hidden"
        style={{ width: W, borderStartStartRadius: 0, borderEndStartRadius: 0 }}>
        {flipping === 'prev' ? <Sheet n={sheet.underRightPrev} /> : <Sheet n={sheet.staticRight} />}
      </div>

      {/* الصفحة اليسرى */}
      <div className="absolute inset-y-0 left-0 reader-page overflow-hidden"
        style={{ width: W, borderStartEndRadius: 0, borderEndEndRadius: 0 }}>
        {flipping === 'next' ? <Sheet n={sheet.underLeftNext} /> : <Sheet n={sheet.staticLeft} />}
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
          }}>
          <div className="absolute inset-0 overflow-hidden reader-page" style={{ backfaceVisibility: 'hidden' }}>
            <Sheet n={flipping === 'next' ? sheet.nextFront : sheet.prevFront} />
            <motion.div className="pointer-events-none absolute inset-0 bg-black"
              style={{ opacity: foldShade }} aria-hidden />
          </div>
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
        className="absolute inset-y-0 left-0 z-30 w-[18%] cursor-w-resize disabled:pointer-events-none" />
      <button type="button" onClick={() => void go('prev')} disabled={!canPrev}
        aria-label="الصفحة السابقة"
        className="absolute inset-y-0 right-0 z-30 w-[18%] cursor-e-resize disabled:pointer-events-none" />
    </div>
  );
}
