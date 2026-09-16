import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { SpecIcon } from '@/components/shared/SpecIcon';
import type { Specialization } from '@/types/db';

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * بطاقة تخصص.
 *
 * على الجوال: صفّ أفقي مضغوط — أيقونة ملوّنة ثم الاسم والنبذة. لا صورة
 * خلف النص ولا مربّع طويل يبتلع الشاشة.
 * على الشاشات الأكبر: بطاقة رأسية بشريط صورة مستقلّ فوق المحتوى، والأيقونة
 * داخل المحتوى لا فوق الصورة — فلا يختفي أي نص خلف صورة.
 */
export function SpecializationCard({ spec }: { spec: Specialization; compact?: boolean }) {
  const accent = spec.accent_color ?? '#17386a';

  return (
    <Link to={`/specializations/${spec.slug}`}
      className="card card-hover group block overflow-hidden focus-visible:ring-4 focus-visible:ring-accent/20
                 active:scale-[0.99] sm:active:scale-100">

      {/* شريط الصورة — من الشاشات المتوسطة فأعلى فقط */}
      {spec.cover_image_url && (
        <div className="relative hidden h-28 overflow-hidden bg-navy-900 sm:block">
          <img src={spec.cover_image_url} alt="" loading="lazy" decoding="async"
            className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
          <span className="absolute inset-0 bg-gradient-to-t from-navy-950/45 to-transparent" aria-hidden />
        </div>
      )}

      <div className="flex items-center gap-4 p-4 sm:items-start sm:gap-3.5 sm:p-5">
        <span
          className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-2xl text-white shadow-card
                     transition duration-500 group-hover:scale-105 sm:h-12 sm:w-12"
          style={{ backgroundColor: accent }}>
          <SpecIcon name={spec.icon} className="h-7 w-7 sm:h-6 sm:w-6" />
        </span>

        <span className="min-w-0 flex-1">
          <h3 className="clamp-2 text-[15.5px] font-bold leading-snug text-ink sm:text-[17px]">
            {spec.name}
          </h3>
          {spec.summary && (
            <p className="clamp-2 mt-1.5 text-[13px] leading-6 text-muted sm:clamp-3 sm:mt-2 sm:text-[14px] sm:leading-7">
              {spec.summary}
            </p>
          )}
          <span className="mt-3.5 hidden items-center gap-1.5 text-[13.5px] font-bold text-accent transition group-hover:gap-2.5 sm:flex">
            تفاصيل التخصص <ArrowLeft className="h-4 w-4" aria-hidden />
          </span>
        </span>

        {/* سهم الصفّ على الجوال */}
        <ChevronLeft className="h-5 w-5 shrink-0 text-muted transition group-hover:text-accent sm:hidden" aria-hidden />
      </div>
    </Link>
  );
}

export function SpecializationsGrid({ items }: { items: Specialization[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
      {items.map((s, i) => (
        <motion.div key={s.id}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.45, ease: EASE, delay: Math.min(i * 0.05, 0.3) }}>
          <SpecializationCard spec={s} />
        </motion.div>
      ))}
    </div>
  );
}
