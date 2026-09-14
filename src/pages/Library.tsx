import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Filter, LayoutGrid, Library as LibraryIcon, List, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { PageHeader } from './PageHeader';
import { EmptyState, ErrorState, SkeletonGrid } from '@/components/ui/States';
import { Pagination } from '@/components/ui/Table';
import { BookCard } from '@/components/shared/BookCard';
import { Reveal } from '@/components/ui/Motion';
import { fetchBooks, fetchGrades, fetchSpecializations, fetchSubjects } from '@/data/api';
import { SUBJECT_KINDS, SUBJECT_KIND_ORDER } from '@/lib/constants';
import { formatFileSize } from '@/lib/format';
import { useSetting } from '@/hooks/useSettings';
import { useSeo } from '@/hooks/useSeo';
import type { SubjectKind } from '@/types/db';

const PAGE_SIZE = 16;
const EASE = [0.22, 1, 0.36, 1] as const;

type Sort = 'order' | 'newest' | 'title' | 'popular';
const SORTS: Array<{ id: Sort; label: string }> = [
  { id: 'order',   label: 'الترتيب المعتمد' },
  { id: 'newest',  label: 'الأحدث إضافة' },
  { id: 'popular', label: 'الأكثر قراءة' },
  { id: 'title',   label: 'أبجدياً' },
];

export default function Library() {
  const intro = useSetting('library.intro', '');
  useSeo({
    title: 'المكتبة الإلكترونية',
    description: intro || 'الكتب والمقررات الرقمية لمركز تدريب شركة ترسانة الإسكندرية — مصنّفة بالصف والتخصص ونوع المادة.',
  });

  const [grade, setGrade]     = useState<number | null>(null);
  const [kind, setKind]       = useState<SubjectKind | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [spec, setSpec]       = useState<string | null>(null);
  const [search, setSearch]   = useState('');
  const [sort, setSort]       = useState<Sort>('order');
  const [view, setView]       = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage]       = useState(1);

  const grades = useQuery({ queryKey: ['grades'], queryFn: fetchGrades });
  const specs  = useQuery({ queryKey: ['specializations'], queryFn: () => fetchSpecializations() });
  const subs   = useQuery({
    queryKey: ['subjects', 'library', grade, kind],
    queryFn: () => fetchSubjects({ ...(grade ? { gradeId: grade } : {}), ...(kind ? { kind } : {}) }),
  });

  const featured = useQuery({
    queryKey: ['books', 'featured'],
    queryFn: () => fetchBooks({ featuredOnly: true, pageSize: 8 }),
    staleTime: 5 * 60_000,
  });

  const books = useQuery({
    queryKey: ['books', { grade, subject, spec, kind, search, sort, page }],
    queryFn: () => fetchBooks({
      gradeId: grade, subjectId: subject, specializationId: spec, kind,
      search, sort, page, pageSize: PAGE_SIZE,
    }),
  });

  const reset = () => { setGrade(null); setKind(null); setSubject(null); setSpec(null); setSearch(''); setPage(1); };
  const activeCount = [grade, kind, subject, spec, search || null].filter(Boolean).length;

  const subjectOptions = useMemo(
    () => (subs.data ?? []).filter((s) => (spec ? s.specialization_id === spec || s.is_common : true)),
    [subs.data, spec],
  );

  const gradeName = (id: number | null) => grades.data?.find((g) => g.id === id)?.name;
  const specName  = (id: string | null) => specs.data?.find((s) => s.id === id)?.name;

  const change = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1); };

  return (
    <>
      <PageHeader
        title="المكتبة الإلكترونية"
        description={intro || 'كل المقررات والمذكّرات والمراجع بصيغة PDF — تُقرأ داخل الموقع بعارض كتاب كامل، بلا تحميل إن أردت.'}
        breadcrumb={[{ label: 'المكتبة الإلكترونية' }]} />

      <div className="container-page py-10">

        {/* ═══ رفّ الكتب المختارة ═══ */}
        {!activeCount && (featured.data?.rows.length ?? 0) > 0 && (
          <Reveal className="mb-12">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <span className="eyebrow mb-3"><Sparkles className="h-3.5 w-3.5" aria-hidden /> رفّ مختار</span>
                <h2 className="text-[22px] sm:text-[25px]">كتب يبدأ بها الطالب</h2>
              </div>
            </div>
            <div className="relative -mx-2 overflow-x-auto px-2 pb-4 no-scrollbar">
              <div className="flex gap-4">
                {featured.data!.rows.map((b) => (
                  <div key={b.id} className="w-[168px] shrink-0 sm:w-[190px]">
                    <BookCard book={b} grade={grades.data?.find((g) => g.id === b.grade_id)} compact />
                  </div>
                ))}
              </div>
            </div>
            <div className="hairline-gold my-2" aria-hidden />
          </Reveal>
        )}

        {/* ═══ تصنيف بنوع المادة ═══ */}
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {SUBJECT_KIND_ORDER.map((k, i) => {
            const meta = SUBJECT_KINDS[k];
            const on = kind === k;
            return (
              <motion.button key={k} type="button"
                onClick={() => change(setKind)(on ? null : k)}
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE, delay: i * 0.06 }}
                className={clsx(
                  'group relative overflow-hidden rounded-2xl border p-4 text-right transition-all duration-400',
                  on ? 'border-accent bg-accent-soft shadow-lift'
                     : 'border-line bg-surface hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-card',
                )}>
                <span className="flex items-center justify-between">
                  <span className="text-[15px] font-bold text-ink">{meta.label}</span>
                  <LibraryIcon className={clsx('h-[18px] w-[18px] transition', on ? 'text-accent' : 'text-muted')} aria-hidden />
                </span>
                <span className="mt-1.5 block text-[12.5px] leading-6 text-muted">{meta.hint}</span>
                {on && <motion.span layoutId="kind-bar" className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />}
              </motion.button>
            );
          })}
        </div>

        {/* ═══ شريط البحث والتصفية ═══ */}
        <div className="card mb-8 overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 p-4">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input value={search} onChange={(e) => change(setSearch)(e.target.value)}
                placeholder="ابحث باسم الكتاب أو المؤلف أو الطبعة…" aria-label="بحث في المكتبة"
                className="input input-lg pr-11" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setShowFilters((v) => !v)}
                aria-expanded={showFilters}
                className={clsx('btn btn-md', showFilters || activeCount ? 'btn-primary' : 'btn-ghost')}>
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                تصفية
                {activeCount > 0 && (
                  <span className="nums-latn flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-[11px]">
                    {activeCount}
                  </span>
                )}
              </button>

              <div className="flex items-center rounded-xl border border-line-2 bg-surface-3 p-1">
                {([['grid', LayoutGrid, 'عرض شبكي'], ['list', List, 'عرض قائمة']] as const).map(([v, Icon, label]) => (
                  <button key={v} onClick={() => setView(v)} aria-label={label} title={label} aria-pressed={view === v}
                    className={clsx('flex h-9 w-9 items-center justify-center rounded-lg transition',
                      view === v ? 'bg-surface text-accent shadow-card' : 'text-muted hover:text-ink')}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.32, ease: EASE }}
                className="overflow-hidden border-t border-line bg-surface-2">
                <div className="space-y-4 p-4">
                  <div>
                    <p className="mb-2.5 flex items-center gap-1.5 text-[12.5px] font-bold text-ink-2">
                      <Filter className="h-3.5 w-3.5" aria-hidden /> الصف الدراسي
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => { change(setGrade)(null); setSubject(null); }}
                        className={clsx('chip', !grade && 'chip-active')}>كل الصفوف</button>
                      {grades.data?.map((g) => (
                        <button key={g.id} onClick={() => { change(setGrade)(g.id); setSubject(null); }}
                          className={clsx('chip', grade === g.id && 'chip-active')}>{g.name}</button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="mb-1.5 block text-[12.5px] font-bold text-ink-2">التخصص</span>
                      <select value={spec ?? ''} onChange={(e) => { change(setSpec)(e.target.value || null); setSubject(null); }}
                        className="input">
                        <option value="">كل التخصصات</option>
                        {specs.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12.5px] font-bold text-ink-2">المادة</span>
                      <select value={subject ?? ''} onChange={(e) => change(setSubject)(e.target.value || null)} className="input">
                        <option value="">كل المواد</option>
                        {subjectOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12.5px] font-bold text-ink-2">الترتيب</span>
                      <select value={sort} onChange={(e) => change(setSort)(e.target.value as Sort)} className="input">
                        {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ═══ شرائح التصفية النشطة ═══ */}
        {activeCount > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-bold text-muted">التصفية الحالية:</span>
            {kind && <FilterPill label={SUBJECT_KINDS[kind].label} onClear={() => change(setKind)(null)} />}
            {grade && <FilterPill label={gradeName(grade) ?? ''} onClear={() => change(setGrade)(null)} />}
            {spec && <FilterPill label={specName(spec) ?? ''} onClear={() => change(setSpec)(null)} />}
            {subject && <FilterPill label={subjectOptions.find((s) => s.id === subject)?.name ?? ''} onClear={() => change(setSubject)(null)} />}
            {search && <FilterPill label={`بحث: ${search}`} onClear={() => change(setSearch)('')} />}
            <button onClick={reset} className="text-[12.5px] font-bold text-ember-600 hover:text-ember-700">مسح الكل</button>
          </div>
        )}

        {/* ═══ النتائج ═══ */}
        {books.isLoading ? <SkeletonGrid count={8} />
          : books.error ? <ErrorState error={books.error} onRetry={() => void books.refetch()} />
          : books.data?.rows.length ? (
            <>
              <p className="nums-latn mb-5 text-[13px] text-muted">
                {books.data.count} كتاب{activeCount ? ' مطابق للتصفية' : ' في المكتبة'}
              </p>

              {view === 'grid' ? (
                <motion.div layout
                  className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  <AnimatePresence mode="popLayout">
                    {books.data.rows.map((b, i) => (
                      <motion.div key={b.id} layout
                        initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.45, ease: EASE, delay: Math.min(i * 0.035, 0.3) }}>
                        <BookCard book={b}
                          grade={grades.data?.find((g) => g.id === b.grade_id)}
                          specName={specName(b.specialization_id)} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              ) : (
                <div className="space-y-2.5">
                  {books.data.rows.map((b, i) => (
                    <motion.div key={b.id}
                      initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, ease: EASE, delay: Math.min(i * 0.03, 0.25) }}>
                      <Link to={`/library/book/${b.id}`}
                        className="card card-hover flex items-center gap-4 p-3.5">
                        <span className="h-20 w-[58px] shrink-0 overflow-hidden rounded-lg bg-steel-100">
                          {b.cover_image_url
                            ? <img src={b.cover_image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                            : <span className="flex h-full w-full items-center justify-center bg-blueprint">
                                <BookOpen className="h-5 w-5 text-white/45" aria-hidden />
                              </span>}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className={clsx('rounded-full border px-2 py-0.5 text-[11px] font-bold', SUBJECT_KINDS[b.kind ?? 'specialized'].tone)}>
                              {SUBJECT_KINDS[b.kind ?? 'specialized'].short}
                            </span>
                            {gradeName(b.grade_id) && <span className="text-[11.5px] text-muted">{gradeName(b.grade_id)}</span>}
                          </span>
                          <span className="clamp-1 mt-1 block text-[15px] font-bold text-ink">{b.title}</span>
                          {b.description && <span className="clamp-1 mt-0.5 block text-[12.5px] text-muted">{b.description}</span>}
                        </span>
                        <span className="nums-latn hidden shrink-0 text-[12px] text-muted sm:block">
                          {b.pages ? `${b.pages} صفحة` : b.file_size_kb ? formatFileSize(b.file_size_kb) : ''}
                        </span>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              )}

              <Pagination page={page} pageSize={PAGE_SIZE} total={books.data.count} onChange={setPage} />
            </>
          ) : (
            <EmptyState icon={<BookOpen className="h-7 w-7" />}
              title={activeCount ? 'لا توجد كتب مطابقة' : 'المكتبة فارغة حالياً'}
              description={activeCount
                ? 'جرّب توسيع نطاق البحث أو إلغاء بعض شروط التصفية.'
                : 'تُضاف الكتب وملفات PDF من لوحة الإدارة ▸ المكتبة الإلكترونية.'}
              action={activeCount
                ? <button onClick={reset} className="btn btn-md btn-ghost">إلغاء التصفية</button>
                : undefined} />
          )}
      </div>
    </>
  );
}

function FilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent-soft px-3 py-1 text-[12.5px] font-semibold text-accent">
      {label}
      <button onClick={onClear} aria-label={`إزالة ${label}`} className="rounded-full p-0.5 hover:bg-accent/15">
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}
