import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, MessageCircle, Plus, MessageSquareWarning, Users, X } from 'lucide-react';
import { useSetting, useSettingBool } from '@/hooks/useSettings';
import { buildWhatsAppLink } from '@/lib/whatsapp';

const EASE = [0.22, 1, 0.36, 1] as const;

/** أزرار عائمة: عودة لأعلى · واتساب · اختصارات الخدمات */
export function FloatingActions() {
  const { pathname } = useLocation();
  const [showTop, setShowTop] = useState(false);
  const [open, setOpen] = useState(false);
  const waEnabled = useSettingBool('whatsapp.enabled', true);
  const wa = useSetting('whatsapp.number', '') || useSetting('contact.whatsapp', '');
  const waUrl = waEnabled && wa && !wa.startsWith('[')
    ? buildWhatsAppLink(wa, 'السلام عليكم، أود الاستفسار عن مركز التدريب.')
    : null;

  useEffect(() => {
    const on = () => setShowTop(window.scrollY > 600);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  // صفحة قراءة الكتاب تحتاج كل المساحة — الأزرار العائمة تزاحم القارئ
  const hidden = /^\/library\/book\//.test(pathname);

  const items = [
    { to: '/complaints', label: 'شكوى أو مقترح', icon: MessageSquareWarning },
    { to: '/parent', label: 'بوابة ولي الأمر', icon: Users },
  ];

  if (hidden) return null;

  return (
    <div
      className="pointer-events-none fixed left-4 z-40 flex flex-col items-start gap-3 sm:left-6"
      style={{ bottom: 'calc(var(--tabbar-h) + 14px + env(safe-area-inset-bottom))' }}>
      <AnimatePresence>
        {showTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.7, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.7, y: 12 }}
            transition={{ duration: 0.28, ease: EASE }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="العودة إلى أعلى الصفحة"
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-lift transition hover:text-accent">
            <ArrowUp className="h-[18px] w-[18px]" aria-hidden />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="pointer-events-auto flex flex-col gap-2">
            {items.map((i) => (
              <Link key={i.to} to={i.to} onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-full border border-line bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-ink shadow-lift transition hover:border-accent/45 hover:text-accent">
                <i.icon className="h-4 w-4" aria-hidden /> {i.label}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-auto flex items-center gap-2.5">
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
          aria-label={open ? 'إغلاق الاختصارات' : 'فتح الاختصارات السريعة'}
          className="relative flex h-[52px] w-[52px] items-center justify-center rounded-full bg-navy-700 text-white shadow-[0_14px_34px_-12px_rgb(var(--navy-700)/1)] transition hover:bg-navy-800">
          <motion.span animate={{ rotate: open ? 135 : 0 }} transition={{ duration: 0.3, ease: EASE }}>
            {open ? <X className="h-5 w-5" aria-hidden /> : <Plus className="h-5 w-5" aria-hidden />}
          </motion.span>
        </button>

        {waUrl && (
          <a href={waUrl} target="_blank" rel="noopener noreferrer" aria-label="تواصل عبر واتساب"
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-emerald-600 text-white shadow-[0_14px_34px_-12px_rgb(var(--emerald-600)/1)] transition hover:brightness-110">
            <MessageCircle className="h-5 w-5" aria-hidden />
          </a>
        )}
      </div>
    </div>
  );
}
