import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import type { Variants } from 'framer-motion';

const EASE = [0.22, 1, 0.36, 1] as const;

/** ظهور تدريجي عند دخول العنصر إلى الشاشة */
export function Reveal({
  children, delay = 0, y = 18, once = true, className, as = 'div',
}: {
  children: ReactNode; delay?: number; y?: number; once?: boolean;
  className?: string; as?: 'div' | 'section' | 'li' | 'article' | 'header';
}) {
  const reduce = useReducedMotion();
  const C = motion[as] as typeof motion.div;

  if (reduce) return <C className={className}>{children}</C>;

  return (
    <C
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-60px' }}
      transition={{ duration: 0.65, ease: EASE, delay }}
    >
      {children}
    </C>
  );
}

/** حاوية تتابُعية — أبناؤها يظهرون واحداً تلو الآخر */
export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

export function Stagger({ children, className, once = true }: { children: ReactNode; className?: string; once?: boolean }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={staggerParent}
      initial="hidden"
      whileInView="show"
      viewport={{ once, margin: '-60px' }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return <motion.div className={className} variants={staggerChild}>{children}</motion.div>;
}

/** انتقال ناعم بين الصفحات */
export function PageTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** شريط تقدّم القراءة أعلى الصفحة */
export { EASE };
