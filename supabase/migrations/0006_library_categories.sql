-- ═══════════════════════════════════════════════════════════════════════════
--  0006_library_categories.sql
--  تصنيف المكتبة الإلكترونية: نوع المادة (تخصصية · عامة · ثقافية) على مستوى
--  المادة الدراسية والكتاب، مع فهارس البحث ومعدّل المشاهدات.
--  آمن للتنفيذ أكثر من مرة.
-- ═══════════════════════════════════════════════════════════════════════════

-- ① نوع المادة/الكتاب
do $$ begin
  create type subject_kind as enum ('specialized','general','cultural');
exception when duplicate_object then null; end $$;

comment on type subject_kind is
  'specialized = مادة تخصصية · general = مادة عامة (لغات ورياضيات وحاسب) · cultural = مادة ثقافية (دين وتاريخ وتربية وطنية)';

-- ② على المواد الدراسية
alter table public.subjects
  add column if not exists kind subject_kind not null default 'specialized';

-- المواد المشتركة القديمة كانت تُميَّز بـ is_common — تُرحَّل إلى «عامة»
update public.subjects
   set kind = 'general'
 where is_common = true and kind = 'specialized';

create index if not exists subjects_kind_idx on public.subjects(kind, grade_id, sort_order);

-- ③ على الكتب — كتاب قد لا يرتبط بمادة (مرجع عام أو ثقافي)
alter table public.books
  add column if not exists kind subject_kind not null default 'specialized',
  add column if not exists edition text,            -- الطبعة / العام الدراسي
  add column if not exists keywords text[] not null default '{}',
  add column if not exists is_featured boolean not null default false,
  add column if not exists downloads_count int not null default 0;

comment on column public.books.kind      is 'نوع الكتاب: تخصصي أو عام أو ثقافي — يُستخدم في تصفية المكتبة';
comment on column public.books.edition   is 'الطبعة أو العام الدراسي كما يظهر على الغلاف';
comment on column public.books.keywords  is 'كلمات مفتاحية إضافية للبحث';
comment on column public.books.is_featured is 'يظهر في رفّ «كتب مختارة» أعلى المكتبة';

-- كتاب مرتبط بمادة يرث نوعها ما دام لم يُحدَّد له نوع صراحةً
update public.books b
   set kind = s.kind
  from public.subjects s
 where b.subject_id = s.id and b.kind = 'specialized' and s.kind <> 'specialized';

create index if not exists books_kind_idx     on public.books(kind, is_published, sort_order);
create index if not exists books_featured_idx on public.books(is_featured, is_published, sort_order)
  where is_featured;

-- ④ بحث نصي يشمل الكلمات المفتاحية
drop index if exists public.books_search_idx;
create index if not exists books_search_idx on public.books
  using gin (to_tsvector('simple',
    coalesce(title,'') || ' ' || coalesce(description,'') || ' ' ||
    coalesce(author,'') || ' ' || coalesce(array_to_string(keywords,' '),'')));

-- ⑤ عدّاد فتح الكتاب — دالة محكومة يستدعيها الزائر بلا صلاحية كتابة على الجدول
create or replace function public.bump_book_views(p_book uuid)
returns void
language sql security definer set search_path = public as $$
  update public.books set views_count = views_count + 1
   where id = p_book and is_published;
$$;
revoke all on function public.bump_book_views(uuid) from public;
grant execute on function public.bump_book_views(uuid) to anon, authenticated;

-- ⑥ إحصاءات المكتبة للصفحة العامة (أعداد مجمّعة فقط)
create or replace function public.library_facets()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'by_kind', (
      select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb)
        from (select kind::text as kind, count(*) as n
                from public.books where is_published group by kind) t
    ),
    'by_grade', (
      select coalesce(jsonb_object_agg(coalesce(grade_id::text,'0'), n), '{}'::jsonb)
        from (select grade_id, count(*) as n
                from public.books where is_published group by grade_id) t
    ),
    'by_spec', (
      select coalesce(jsonb_object_agg(coalesce(specialization_id::text,'none'), n), '{}'::jsonb)
        from (select specialization_id, count(*) as n
                from public.books where is_published group by specialization_id) t
    ),
    'total', (select count(*) from public.books where is_published)
  );
$$;
revoke all on function public.library_facets() from public;
grant execute on function public.library_facets() to anon, authenticated;
