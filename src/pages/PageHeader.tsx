import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, Home } from 'lucide-react';

const EASE = [0.22, 1, 0.36, 1] as const;

export function PageHeader({ title, description, breadcrumb, action }: {
  title: string; description?: ReactNode;
  breadcrumb?: Array<{ label: string; to?: string }>; action?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const anim = (d: number) => (reduce ? {} : {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: EASE, delay: d },
  });

  return (
    <div className="relative overflow-hidden border-b border-line bg-surface">
      <div className="bg-mesh pointer-events-none absolute inset-0" aria-hidden />
      <div className="container-page relative py-11 sm:py-14">
        <motion.nav {...anim(0)} aria-label="مسار التنقل"
          className="mb-4 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
          <Link to="/" className="flex items-center gap-1 transition hover:text-accent">
            <Home className="h-3.5 w-3.5" aria-hidden /> الرئيسية
          </Link>
          {breadcrumb?.map((b) => (
            <span key={b.label} className="flex items-center gap-1.5">
              <ChevronLeft className="h-3.5 w-3.5 opacity-60" aria-hidden />
              {b.to ? <Link to={b.to} className="transition hover:text-accent">{b.label}</Link>
                    : <span className="clamp-1 max-w-[46ch] font-semibold text-ink">{b.label}</span>}
            </span>
          ))}
        </motion.nav>

        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-3xl">
            <motion.h1 {...anim(0.06)} className="font-display text-[27px] leading-tight sm:text-[35px]">
              {title}
            </motion.h1>
            <motion.span {...anim(0.1)} className="mt-4 block h-1 w-20 rounded-full bg-gradient-to-l from-ember-600 via-brass-400 to-transparent" aria-hidden />
            {description && (
              <motion.p {...anim(0.14)} className="mt-4 text-[15px] leading-8 text-ink-2">{description}</motion.p>
            )}
          </div>
          {action && <motion.div {...anim(0.18)}>{action}</motion.div>}
        </div>
      </div>
    </div>
  );
}
