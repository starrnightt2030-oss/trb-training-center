import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useScroll, useSpring } from 'framer-motion';
import clsx from 'clsx';
import {
  BookOpen, ChevronDown, Phone, PlayCircle,
  Images, Newspaper, GraduationCap, Info, Mail, Users, Search,
} from 'lucide-react';
import { useSetting } from '@/hooks/useSettings';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

type Item = { to: string; label: string; icon?: typeof BookOpen; desc?: string };

const NAV: Array<Item & { children?: Item[] }> = [
  { to: '/', label: 'الرئيسية' },
  { to: '/about', label: 'عن المركز', icon: Info },
  { to: '/specializations', label: 'التخصصات', icon: GraduationCap },
  {
    to: '/library', label: 'التعلّم', icon: BookOpen,
    children: [
      { to: '/library', label: 'المكتبة الإلكترونية', icon: BookOpen, desc: 'الكتب والمقررات والمذكّرات بصيغة PDF' },
      { to: '/videos', label: 'الفيديوهات التعليمية', icon: PlayCircle, desc: 'شروح وتجارب عملية مسجّلة' },
    ],
  },
  {
    to: '/news', label: 'المستجدات', icon: Newspaper,
    children: [
      { to: '/news', label: 'الأخبار', icon: Newspaper, desc: 'آخر أخبار المركز وأنشطته' },
      { to: '/announcements', label: 'الإعلانات', icon: Newspaper, desc: 'إعلانات القبول والمواعيد' },
      { to: '/instructions', label: 'التعليمات', icon: Newspaper, desc: 'لوائح وتعليمات للطلاب وأولياء الأمور' },
      { to: '/gallery', label: 'معرض الصور', icon: Images, desc: 'صور الورش والفعاليات' },
    ],
  },
  { to: '/contact', label: 'اتصل بنا', icon: Mail },
];


const EASE = [0.22, 1, 0.36, 1] as const;

export function Header() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const { pathname } = useLocation();

  const name    = useSetting('center.name', 'مركز تدريب شركة ترسانة الإسكندرية');
  const logo    = useSetting('center.logo_url', '/logo.png');
  const company = useSetting('center.company', 'شركة ترسانة الإسكندرية');
  const phone   = useSetting('contact.phone', '');

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 26, restDelta: 0.001 });

  useEffect(() => { setOpenMenu(null); }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenu(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hoverOpen = (k: string) => { window.clearTimeout(closeTimer.current); setOpenMenu(k); };
  const hoverClose = () => { closeTimer.current = window.setTimeout(() => setOpenMenu(null), 140); };

  const cleanPhone = phone && !phone.startsWith('[') ? phone : '';

  return (
    <header className="sticky top-0 z-50">
      <div className="brand-rule h-[3px]" aria-hidden />

      {/* شريط معلومات علوي */}
      <div className="hidden bg-navy-950 text-white/70 lg:block">
        <div className="container-page flex h-9 items-center justify-between text-[12.5px]">
          <p className="font-medium tracking-wide">{company} — الإدارة العامة لمركز التدريب</p>
          <div className="flex items-center gap-6">
            {cleanPhone && (
              <a href={`tel:${cleanPhone}`} className="flex items-center gap-1.5 transition hover:text-white">
                <Phone className="h-3.5 w-3.5" aria-hidden />
                <span className="nums-latn">{cleanPhone}</span>
              </a>
            )}
            <Link to="/complaints/track" className="transition hover:text-white">تتبُّع طلب</Link>
            <Link to="/complaints" className="transition hover:text-white">تقديم شكوى أو مقترح</Link>
          </div>
        </div>
      </div>

      {/* الشريط الرئيسي */}
      <div className={clsx(
        'border-b transition-all duration-300',
        scrolled
          ? 'border-line bg-surface/85 shadow-[0_10px_30px_-22px_rgb(var(--navy-900)/.55)] backdrop-blur-xl'
          : 'border-transparent bg-surface',
      )}>
        <div className="container-page flex h-[var(--header-h)] items-center justify-between gap-4">
          {/* الشعار */}
          <Link to="/" className="group flex min-w-0 items-center gap-3">
            <span className="relative shrink-0">
              <img src={logo} alt="" className="h-11 w-11 rounded-full object-contain transition duration-500 group-hover:scale-105" />
              <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-brass-400/40" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-[15px] font-bold leading-tight text-ink sm:text-[16.5px]">
                {name}
              </span>
              <span className="hidden text-[11.5px] tracking-wide text-muted sm:block">
                Alexandria Shipyard Training Centre
              </span>
            </span>
          </Link>

          {/* التنقل — سطح المكتب */}
          <nav className="hidden items-center gap-0.5 xl:flex" aria-label="التنقل الرئيسي">
            {NAV.map((n) => {
              const hasKids = !!n.children?.length;
              const isOpen = openMenu === n.to;
              return (
                <div key={n.to} className="relative"
                  onMouseEnter={() => hasKids && hoverOpen(n.to)}
                  onMouseLeave={() => hasKids && hoverClose()}>
                  {hasKids ? (
                    <button
                      type="button"
                      onClick={() => setOpenMenu(isOpen ? null : n.to)}
                      aria-expanded={isOpen}
                      className={clsx(
                        'flex items-center gap-1 rounded-xl px-3.5 py-2 text-[14.5px] font-semibold transition',
                        isOpen || n.children!.some((c) => pathname.startsWith(c.to))
                          ? 'bg-accent-soft text-accent'
                          : 'text-ink-2 hover:bg-surface-3 hover:text-ink',
                      )}>
                      {n.label}
                      <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform duration-300', isOpen && 'rotate-180')} aria-hidden />
                    </button>
                  ) : (
                    <NavLink to={n.to} end={n.to === '/'}
                      className={({ isActive }) => clsx(
                        'relative block rounded-xl px-3.5 py-2 text-[14.5px] font-semibold transition',
                        isActive ? 'text-accent' : 'text-ink-2 hover:bg-surface-3 hover:text-ink',
                      )}>
                      {({ isActive }) => (
                        <>
                          {n.label}
                          {isActive && (
                            <motion.span layoutId="nav-underline"
                              className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-accent"
                              transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                          )}
                        </>
                      )}
                    </NavLink>
                  )}

                  <AnimatePresence>
                    {hasKids && isOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.98 }}
                        transition={{ duration: 0.22, ease: EASE }}
                        className="absolute right-0 top-[calc(100%+10px)] w-[330px] overflow-hidden rounded-2xl border border-line bg-surface p-2 shadow-float">
                        {n.children!.map((c) => (
                          <Link key={c.to + c.label} to={c.to}
                            className="flex items-start gap-3 rounded-xl p-3 transition hover:bg-surface-3">
                            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                              {c.icon ? <c.icon className="h-[18px] w-[18px]" aria-hidden /> : null}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[14px] font-bold text-ink">{c.label}</span>
                              {c.desc && <span className="mt-0.5 block text-[12.5px] leading-6 text-muted">{c.desc}</span>}
                            </span>
                          </Link>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </nav>

          {/* إجراءات */}
          <div className="flex items-center gap-2">
            <Link to="/library" aria-label="المكتبة الإلكترونية"
              className="hidden h-11 w-11 items-center justify-center rounded-xl border border-line-2 text-ink-2 transition hover:border-accent/45 hover:text-accent sm:flex xl:hidden">
              <Search className="h-[18px] w-[18px]" aria-hidden />
            </Link>
            <ThemeToggle />
            <Link to="/parent"
              className="btn btn-md btn-primary hidden sm:inline-flex">
              <Users className="h-4 w-4" aria-hidden /> بوابة ولي الأمر
            </Link>
          </div>
        </div>

        {/* شريط تقدّم القراءة */}
        <motion.div style={{ scaleX: progress }}
          className="h-[2px] origin-right bg-gradient-to-l from-brass-400 via-accent to-ember-500"
          aria-hidden />
      </div>

    </header>
  );
}
