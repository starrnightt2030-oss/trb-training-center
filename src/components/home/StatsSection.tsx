import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { animate, useInView, useReducedMotion } from 'framer-motion';
import { BookOpen, GraduationCap, PlayCircle, Users } from 'lucide-react';
import { fetchPublicStats } from '@/data/api';
import { formatNumber } from '@/lib/format';

/** رقم يتصاعد عند ظهوره في الشاشة */
function CountUp({ value }: { value?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduce = useReducedMotion();
  const [n, setN] = useState(0);

  useEffect(() => {
    if (value === undefined || !inView) return;
    if (reduce) { setN(value); return; }
    const controls = animate(0, value, {
      duration: Math.min(1.8, 0.5 + value / 120),
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setN(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, inView, reduce]);

  return <span ref={ref}>{value === undefined ? '—' : formatNumber(n)}</span>;
}

export function StatsSection() {
  const { data } = useQuery({ queryKey: ['public-stats'], queryFn: fetchPublicStats, staleTime: 10 * 60_000 });

  const items = [
    { icon: GraduationCap, label: 'تخصص فني',        value: data?.specializations },
    { icon: BookOpen,      label: 'كتاب ومقرر رقمي', value: data?.books },
    { icon: PlayCircle,    label: 'فيديو تعليمي',    value: data?.videos },
    { icon: Users,         label: 'متعلم مقيَّد',      value: data?.students },
  ];

  return (
    <section className="relative overflow-hidden bg-navy-950 py-16 text-white">
      <div className="bg-mesh pointer-events-none absolute inset-0 opacity-70" aria-hidden />
      <div className="container-page relative grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-4">
        {items.map((s) => (
          <div key={s.label} className="group text-center">
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-white/[.06] transition duration-500 group-hover:border-brass-400/40 group-hover:bg-white/10">
              <s.icon className="h-[22px] w-[22px] text-brass-400" aria-hidden />
            </span>
            <p className="nums-latn font-display text-[34px] font-bold leading-none text-white">
              <CountUp value={s.value} />
            </p>
            <p className="mt-2.5 text-[13.5px] text-white/60">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
