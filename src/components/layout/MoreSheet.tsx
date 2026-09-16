import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Images, Info, Mail, MessageSquareWarning, Newspaper, PlayCircle,
  ScrollText, Search, X,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useSetting } from '@/hooks/useSettings';

const EASE = [0.22, 1, 0.36, 1] as const;

const LINKS = [
  { to: '/about',         label: 'عن المركز',        icon: Info },
  { to: '/videos',        label: 'الفيديوهات',       icon: PlayCircle },
  { to: '/news',          label: 'الأخبار',          icon: Newspaper },
  { to: '/announcements', label: 'الإعلانات',        icon: Newspaper },
  { to: '/instructions',  label: 'التعليمات',        icon: ScrollText },
  { to: '/gallery',       label: 'معرض الصور',       icon: Images },
  { to: '/complaints',    label: 'شكوى أو مقترح',    icon: MessageSquareWarning },
  { to: '/complaints/track', label: 'تتبّع طلب',     icon: Search },
  { to: '/contact',       label: 'اتصل بنا',         icon: Mail },
];

/** ورقة سفلية تحوي بقيّة أقسام الموقع — تُفتح من زرّ «المزيد» */
export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const name = useSetting('center.name', 'مركز تدريب شركة ترسانة الإسكندرية');

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[65] bg-navy-950/60 backdrop-blur-sm lg:hidden" aria-hidden />

          <motion.div
            role="dialog" aria-modal="true" aria-label="قائمة الأقسام"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ duration: 0.38, ease: EASE }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => { if (info.offset.y > 90 || info.velocity.y > 600) onClose(); }}
            className="sheet lg:hidden">
            <div className="sheet-grip" aria-hidden />

            <div className="flex items-center justify-between px-5 pb-3 pt-1">
              <p className="clamp-1 text-[14px] font-bold text-ink">{name}</p>
              <div className="flex items-center gap-2">
                <ThemeToggle className="h-10 w-10" />
                <button onClick={onClose} aria-label="إغلاق"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-line-2 text-ink-2">
                  <X className="h-[18px] w-[18px]" aria-hidden />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 px-4 pb-2">
              {LINKS.map((l, i) => (
                <motion.div key={l.to + l.label}
                  initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: EASE, delay: 0.04 + i * 0.025 }}>
                  <Link to={l.to} onClick={onClose}
                    className="flex h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border border-line
                               bg-surface-2 px-2 text-center transition active:scale-[0.97]">
                    <l.icon className="h-[22px] w-[22px] text-accent" strokeWidth={1.9} aria-hidden />
                    <span className="text-[12px] font-semibold leading-tight text-ink-2">{l.label}</span>
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
