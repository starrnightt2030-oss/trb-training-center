import { Link } from 'react-router-dom';
import { BookOpen, Download, Eye, Star } from 'lucide-react';
import clsx from 'clsx';
import type { Book, Grade, SubjectKind } from '@/types/db';
import { SUBJECT_KINDS } from '@/lib/constants';
import { formatFileSize } from '@/lib/format';

/** بطاقة كتاب بغلاف ثلاثي الأبعاد وكعب ورقي */
export function BookCard({ book, grade, specName, compact }: {
  book: Book; grade?: Grade; specName?: string; compact?: boolean;
}) {
  const kind = SUBJECT_KINDS[(book.kind ?? 'specialized') as SubjectKind];

  return (
    <Link to={`/library/book/${book.id}`}
      className="group flex flex-col rounded-2xl p-2 transition duration-500 hover:bg-surface">
      <div className="book-3d relative mb-3.5">
        <div className="book-3d-inner relative overflow-hidden rounded-xl shadow-lift">
          <div className="relative aspect-[3/4] w-full overflow-hidden bg-steel-100">
            {book.cover_image_url ? (
              <img src={book.cover_image_url} alt="" loading="lazy" decoding="async"
                className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.06]" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-blueprint px-4 text-center">
                <BookOpen className="h-9 w-9 text-brass-400/80" aria-hidden />
                <span className="clamp-3 font-display text-[13.5px] font-bold leading-6 text-white/85">{book.title}</span>
              </div>
            )}
            {/* كعب الكتاب */}
            <span className="book-spine" aria-hidden />
            {/* لمعة زجاجية عند المرور */}
            <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-l from-transparent via-white/25 to-transparent transition-transform duration-[1100ms] group-hover:translate-x-full" aria-hidden />
          </div>

          {book.is_featured && (
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-brass-500 px-2.5 py-1 text-[11px] font-bold text-navy-950 shadow-lift">
              <Star className="h-3 w-3 fill-current" aria-hidden /> مختار
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col px-1">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className={clsx('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold', kind.tone)}>
            {kind.short}
          </span>
          {grade && <span className="text-[11.5px] font-semibold text-muted">{grade.name}</span>}
        </div>

        <h3 className="clamp-2 text-[15px] font-bold leading-snug text-ink transition group-hover:text-accent">
          {book.title}
        </h3>

        {!compact && (book.author || specName) && (
          <p className="clamp-1 mt-1 text-[12.5px] text-muted">{book.author || specName}</p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-[11.5px] text-muted">
          <span className="nums-latn flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" aria-hidden /> {book.views_count ?? 0}
          </span>
          {book.allow_download && book.file_size_kb ? (
            <span className="nums-latn flex items-center gap-1">
              <Download className="h-3.5 w-3.5" aria-hidden /> {formatFileSize(book.file_size_kb)}
            </span>
          ) : book.pages ? (
            <span className="nums-latn">{book.pages} صفحة</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
