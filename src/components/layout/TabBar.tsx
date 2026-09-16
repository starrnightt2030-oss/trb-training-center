import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { BookOpen, GraduationCap, Home, Menu, Users } from 'lucide-react';

const TABS = [
  { to: '/',                label: 'الرئيسية',  icon: Home,          end: true },
  { to: '/specializations', label: 'التخصصات',  icon: GraduationCap },
  { to: '/library',         label: 'المكتبة',   icon: BookOpen },
  { to: '/parent',          label: 'ولي الأمر', icon: Users },
];

/**
 * شريط تنقّل سفلي — النمط المعتاد في تطبيقات الجوال.
 * يظهر على الشاشات الصغيرة فقط، ويحترم منطقة الأمان في الأجهزة ذات
 * الحافة المنحنية. ارتفاعه منشور في المتغيّر ‎--tabbar-h‎ ليبني عليه
 * باقي العناصر العائمة مسافاتها.
 */
export function TabBar({ onMenu }: { onMenu: () => void }) {
  const { pathname } = useLocation();

  return (
    <nav aria-label="التنقّل السريع"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/92 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <ul className="mx-auto flex h-[var(--tabbar-h)] max-w-lg items-stretch">
        {TABS.map((t) => {
          const active = t.end ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <li key={t.to} className="flex-1">
              <NavLink to={t.to} end={t.end}
                className={clsx(
                  'relative flex h-full flex-col items-center justify-center gap-1 transition-colors',
                  active ? 'text-accent' : 'text-muted',
                )}>
                {active && (
                  <motion.span layoutId="tab-indicator"
                    className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-accent"
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }} />
                )}
                <t.icon className={clsx('h-[22px] w-[22px] transition-transform', active && 'scale-110')}
                  strokeWidth={active ? 2.4 : 1.9} aria-hidden />
                <span className="text-[11px] font-bold leading-none">{t.label}</span>
              </NavLink>
            </li>
          );
        })}
        <li className="flex-1">
          <button type="button" onClick={onMenu} aria-label="فتح القائمة"
            className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted transition-colors hover:text-ink">
            <Menu className="h-[22px] w-[22px]" strokeWidth={1.9} aria-hidden />
            <span className="text-[11px] font-bold leading-none">المزيد</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
