import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { BookOpen, ChevronRight, Download, FileText, Layers, Tag, User } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from './PageHeader';
import { PdfViewer } from '@/components/shared/PdfViewer';
import { BookCard } from '@/components/shared/BookCard';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { Reveal } from '@/components/ui/Motion';
import { bumpBookViews, fetchBook, fetchGrades, fetchRelatedBooks, fetchSpecializations } from '@/data/api';
import { SUBJECT_KINDS } from '@/lib/constants';
import { formatFileSize } from '@/lib/format';
import { useSeo } from '@/hooks/useSeo';

export default function BookReader() {
  const { id = '' } = useParams();
  const book   = useQuery({ queryKey: ['book', id], queryFn: () => fetchBook(id), enabled: !!id });
  const grades = useQuery({ queryKey: ['grades'], queryFn: fetchGrades });
  const specs  = useQuery({ queryKey: ['specializations'], queryFn: () => fetchSpecializations() });

  const related = useQuery({
    queryKey: ['books', 'related', id],
    queryFn: () => fetchRelatedBooks(book.data!, 6),
    enabled: !!book.data,
    staleTime: 5 * 60_000,
  });

  useSeo({ title: book.data?.title, description: book.data?.description ?? undefined });

  // تسجيل فتح الكتاب مرة واحدة
  useEffect(() => { if (book.data?.id) void bumpBookViews(book.data.id); }, [book.data?.id]);

  if (book.isLoading) return <LoadingBlock className="py-32" />;
  if (book.error) {
    return <div className="container-page py-20"><ErrorState error={book.error} onRetry={() => void book.refetch()} /></div>;
  }
  if (!book.data) {
    return <div className="container-page py-20"><EmptyState title="الكتاب غير موجود" description="ربما حُذف من المكتبة أو تغيّر رابطه." /></div>;
  }

  const b = book.data;
  const grade = grades.data?.find((g) => g.id === b.grade_id);
  const spec  = specs.data?.find((s) => s.id === b.specialization_id);
  const kind  = SUBJECT_KINDS[b.kind ?? 'specialized'];

  const meta = [
    b.author && { icon: User, label: 'المؤلف / الجهة', value: b.author },
    grade && { icon: Layers, label: 'الصف', value: grade.name },
    spec && { icon: Tag, label: 'التخصص', value: spec.name },
    b.edition && { icon: FileText, label: 'الطبعة', value: b.edition },
    b.pages && { icon: FileText, label: 'عدد الصفحات', value: String(b.pages) },
    b.file_size_kb && { icon: Download, label: 'حجم الملف', value: formatFileSize(b.file_size_kb) },
  ].filter(Boolean) as Array<{ icon: typeof User; label: string; value: string }>;

  return (
    <>
      {/* ترويسة كاملة على الشاشات الواسعة فقط — على الجوال تُستبدل بسطر مضغوط
          حتى يبدأ الكتاب من أعلى الشاشة بدل أن يُدفن أسفلها */}
      <div className="hidden sm:block">
        <PageHeader title={b.title} description={b.description ?? undefined}
          breadcrumb={[{ label: 'المكتبة الإلكترونية', to: '/library' }, { label: b.title }]}
          action={b.pdf_url && b.allow_download ? (
            <a href={b.pdf_url} download target="_blank" rel="noopener noreferrer" className="btn btn-md btn-gold">
              <Download className="h-4 w-4" aria-hidden /> تحميل PDF
            </a>
          ) : undefined} />
      </div>

      <div className="sticky top-[var(--header-h)] z-30 border-b border-line bg-surface/92 backdrop-blur sm:hidden">
        <div className="container-page flex items-center gap-2.5 py-2.5">
          <Link to="/library" aria-label="رجوع إلى المكتبة"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line-2 text-ink-2">
            <ChevronRight className="h-[18px] w-[18px]" aria-hidden />
          </Link>
          <h1 className="clamp-1 flex-1 text-[14.5px] font-bold text-ink">{b.title}</h1>
          <span className={clsx('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold', kind.tone)}>
            {kind.short}
          </span>
        </div>
      </div>

      <div className="container-page py-4 sm:py-8">
        {/* شريط بيانات الكتاب — تحت القارئ على الجوال */}
        <div className="card order-2 mb-6 hidden flex-wrap items-center gap-x-8 gap-y-3 p-4 sm:flex">
          <span className={clsx('inline-flex items-center rounded-full border px-3 py-1 text-[12.5px] font-bold', kind.tone)}>
            {kind.label}
          </span>
          {meta.map((m) => (
            <span key={m.label} className="flex items-center gap-2 text-[13.5px]">
              <m.icon className="h-4 w-4 text-muted" aria-hidden />
              <span className="font-semibold text-ink-2">{m.label}:</span>
              <span className="nums-latn text-muted">{m.value}</span>
            </span>
          ))}
          {!b.allow_download && (
            <span className="rounded-full border border-line-2 bg-surface-3 px-3 py-1 text-[12px] font-semibold text-muted">
              قراءة داخل الموقع فقط
            </span>
          )}
        </div>

        {b.pdf_url ? (
          <>
            <PdfViewer url={b.pdf_url} title={b.title} allowDownload={b.allow_download} storageKey={b.id} />

            {/* بيانات الكتاب على الجوال — بعد القارئ لا قبله */}
            <dl className="card mt-4 grid grid-cols-2 gap-px overflow-hidden bg-line sm:hidden">
              {meta.slice(0, 4).map((m) => (
                <div key={m.label} className="bg-surface p-3">
                  <dt className="text-[11.5px] font-bold text-muted">{m.label}</dt>
                  <dd className="nums-latn mt-0.5 clamp-1 text-[13.5px] font-semibold text-ink">{m.value}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <EmptyState icon={<BookOpen className="h-7 w-7" />} title="لم يُرفع ملف الكتاب بعد"
            description="يُرفع ملف PDF لهذا الكتاب من لوحة الإدارة ▸ المكتبة الإلكترونية." />
        )}

        {b.keywords?.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-bold text-muted">كلمات مفتاحية:</span>
            {b.keywords.map((k) => (
              <span key={k} className="rounded-full border border-line-2 bg-surface-3 px-3 py-1 text-[12px] text-ink-2">{k}</span>
            ))}
          </div>
        )}

        {/* كتب ذات صلة */}
        {(related.data?.length ?? 0) > 0 && (
          <Reveal className="mt-16">
            <h2 className="mb-5 text-[21px]">كتب ذات صلة</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
              {related.data!.map((r) => (
                <BookCard key={r.id} book={r} grade={grades.data?.find((g) => g.id === r.grade_id)} compact />
              ))}
            </div>
          </Reveal>
        )}
      </div>
    </>
  );
}
