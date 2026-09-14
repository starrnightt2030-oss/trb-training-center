import { motion, AnimatePresence } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import clsx from 'clsx';
import { useTheme } from '@/hooks/useTheme';

/** زر تبديل الوضع النهاري/الليلي — يحفظ الاختيار ويتبع النظام افتراضياً */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const dark = resolved === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي'}
      title={dark ? 'الوضع النهاري' : 'الوضع الليلي'}
      className={clsx(
        'relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl',
        'border border-line-2 bg-surface text-ink-2 transition-colors',
        'hover:border-accent/45 hover:text-accent',
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={dark ? 'moon' : 'sun'}
          initial={{ y: 14, opacity: 0, rotate: -35 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -14, opacity: 0, rotate: 35 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {dark ? <Moon className="h-[18px] w-[18px]" aria-hidden /> : <Sun className="h-[18px] w-[18px]" aria-hidden />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
