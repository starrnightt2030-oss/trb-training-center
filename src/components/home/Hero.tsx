import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, BookOpen, GraduationCap, Play, ShieldCheck, Wrench } from 'lucide-react';
import { useSetting } from '@/hooks/useSettings';

const EASE = [0.22, 1, 0.36, 1] as const;

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 26 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.8, ease: EASE, delay },
});

export function Hero() {
  const reduce   = useReducedMotion();
  const title    = useSetting('home.hero_title', 'مركز تدريب شركة ترسانة الإسكندرية');
  const subtitle = useSetting('home.hero_subtitle', '');
  const image    = useSetting('home.hero_image', '');
  const ctaLabel = useSetting('home.hero_cta_label', 'تعرّف على التخصصات');
  const ctaUrl   = useSetting('home.hero_cta_url', '/specializations');
  const logo     = useSetting('center.logo_url', '/logo.png');

  const anim = (d = 0) => (reduce ? {} : fadeUp(d));

  return (
    <section className="relative overflow-hidden bg-blueprint text-white">
      {image && (
        <>
          <motion.img src={image} alt=""
            initial={reduce ? undefined : { scale: 1.12, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.28 }}
            transition={{ duration: 1.6, ease: EASE }}
            className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-l from-navy-950/95 via-navy-950/80 to-navy-950/55" aria-hidden />
        </>
      )}

      {/* هالات ضوئية متحرّكة */}
      {!reduce && (
        <>
          <motion.span aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-navy-500/25 blur-[90px]"
            animate={{ y: [0, 26, 0], opacity: [0.5, 0.75, 0.5] }}
            transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }} />
          <motion.span aria-hidden
            className="pointer-events-none absolute -bottom-32 -left-16 h-[380px] w-[380px] rounded-full bg-brass-500/20 blur-[100px]"
            animate={{ y: [0, -22, 0], opacity: [0.45, 0.7, 0.45] }}
            transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }} />
        </>
      )}

      <div className="container-page relative grid items-center gap-12 py-18 sm:py-22 lg:grid-cols-[1.15fr_.95fr] lg:py-28">
        <div>
          <motion.p {...anim(0)}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-brass-400/30 bg-white/[.06] px-4 py-2 text-[12.5px] font-bold text-brass-300 backdrop-blur">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            نظام إدارة المؤسسات التعليمية ISO 21001:2018
          </motion.p>

          <motion.h1 {...anim(0.08)}
            className="font-display text-[31px] leading-[1.22] text-white text-balance sm:text-[44px] lg:text-[52px]">
            {title}
          </motion.h1>

          <motion.span {...anim(0.14)} className="mt-6 block h-1 w-28 rounded-full bg-gradient-to-l from-ember-600 via-brass-400 to-transparent" aria-hidden />

          {subtitle && (
            <motion.p {...anim(0.2)} className="mt-6 max-w-2xl text-[15.5px] leading-9 text-white/75 sm:text-[17px]">
              {subtitle}
            </motion.p>
          )}

          <motion.div {...anim(0.3)} className="mt-10 flex flex-wrap gap-3">
            <Link to={ctaUrl || '/specializations'}
              className="group inline-flex h-[54px] items-center gap-2.5 rounded-xl bg-ember-600 px-7 text-[15px] font-bold text-white shadow-[0_16px_40px_-14px_rgb(var(--ember-600)/1)] transition hover:bg-ember-700">
              {ctaLabel}
              <ArrowLeft className="h-[18px] w-[18px] transition-transform duration-300 group-hover:-translate-x-1" aria-hidden />
            </Link>
            <Link to="/library"
              className="inline-flex h-[54px] items-center gap-2.5 rounded-xl border border-white/25 px-7 text-[15px] font-bold text-white backdrop-blur transition hover:border-white/50 hover:bg-white/10">
              <BookOpen className="h-[18px] w-[18px]" aria-hidden /> المكتبة الإلكترونية
            </Link>
          </motion.div>

          <motion.dl {...anim(0.4)} className="mt-12 grid max-w-lg grid-cols-3 gap-5 border-t border-white/10 pt-8">
            {[
              { k: '٣', v: 'سنوات دراسية' },
              { k: '٧', v: 'تخصصات فنية' },
              { k: 'دبلوم', v: 'فني معادَل' },
            ].map((s) => (
              <div key={s.v}>
                <dt className="font-display text-[27px] font-bold leading-none text-brass-400">{s.k}</dt>
                <dd className="mt-2 text-[13px] text-white/60">{s.v}</dd>
              </div>
            ))}
          </motion.dl>
        </div>

        {/* البطاقة البصرية */}
        <motion.div
          initial={reduce ? undefined : { opacity: 0, scale: 0.94, rotateY: -8 }}
          animate={{ opacity: 1, scale: 1, rotateY: 0 }}
          transition={{ duration: 0.95, ease: EASE, delay: 0.25 }}
          className="relative hidden lg:block" style={{ perspective: 1400 }}>
          <div className="absolute -inset-7 rounded-[2.75rem] bg-gradient-to-tr from-ember-600/25 via-transparent to-brass-500/25 blur-3xl" aria-hidden />
          <div className="card-glass relative rounded-3xl p-9 shadow-float">
            <motion.img src={logo} alt="شعار شركة ترسانة الإسكندرية"
              animate={reduce ? undefined : { y: [0, -9, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
              className="mx-auto h-36 w-36 object-contain drop-shadow-2xl" />
            <p className="mt-8 text-center font-display text-[19px] font-bold text-white">
              تعليم فني منضبط وتدريب عملي حقيقي
            </p>
            <p className="mt-2.5 text-center text-[13.5px] leading-7 text-white/60">
              داخل ورش المركز وورش الشركة الإنتاجية العاملة
            </p>
            <div className="mt-8 grid grid-cols-2 gap-3">
              {[
                { icon: GraduationCap, label: 'دبلوم معادَل بقرار وزاري' },
                { icon: ShieldCheck,   label: 'سلامة أولاً — صفر إصابة' },
                { icon: Wrench,        label: 'ورش مجهَّزة بمعدات عاملة' },
                { icon: Play,          label: 'شروح وفيديوهات تعليمية' },
              ].map((f, i) => (
                <motion.div key={f.label}
                  initial={reduce ? undefined : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE, delay: 0.55 + i * 0.08 }}
                  className="rounded-xl border border-white/10 bg-white/[.05] p-3.5 transition hover:border-brass-400/35 hover:bg-white/[.09]">
                  <f.icon className="mb-2.5 h-5 w-5 text-brass-400" aria-hidden />
                  <p className="text-[12.5px] leading-6 text-white/75">{f.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* حافة سفلية مموّجة */}
      <svg className="absolute inset-x-0 bottom-0 h-10 w-full text-canvas" viewBox="0 0 1440 40" preserveAspectRatio="none" aria-hidden>
        <path fill="currentColor" d="M0,40 L1440,40 L1440,16 C1120,34 960,4 720,12 C480,20 300,36 0,14 Z" />
      </svg>
    </section>
  );
}
