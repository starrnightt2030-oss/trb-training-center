import { Suspense, useEffect, useState } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Header } from './Header';
import { Footer } from './Footer';
import { FloatingActions } from './FloatingActions';
import { TabBar } from './TabBar';
import { MoreSheet } from './MoreSheet';
import { PwaBanners } from './PwaBanners';
import { LoadingBlock } from '@/components/ui/States';

const EASE = [0.22, 1, 0.36, 1] as const;

export function PublicLayout() {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  const [more, setMore] = useState(false);

  useEffect(() => { setMore(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = more ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [more]);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <a href="#main" className="skip-link">تخطَّ إلى المحتوى الرئيسي</a>
      <Header />

      <main id="main" className="flex-1">
        <Suspense fallback={<LoadingBlock className="py-32" />}>
          {reduce ? <Outlet /> : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35, ease: EASE }}>
                <Outlet />
              </motion.div>
            </AnimatePresence>
          )}
        </Suspense>
      </main>

      <Footer />

      <FloatingActions />
      <TabBar onMenu={() => setMore(true)} />
      <MoreSheet open={more} onClose={() => setMore(false)} />
      <PwaBanners />

      <ScrollRestoration />
    </div>
  );
}
