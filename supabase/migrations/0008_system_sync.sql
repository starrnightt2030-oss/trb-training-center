-- ═══════════════════════════════════════════════════════════════════════════
--  0008_system_sync.sql — المزامنة من «سيستم إدارة مركز التدريب» إلى المنصة
--
--  ① عمود «المجموعة» للطالب (اسم التخصص كما في السيستم، مثل «تركيبات كهربية1»)
--  ② جدول الموقف الانضباطي student_conduct
--  ③ الدالة system_sync — تستقبل كل بيانات السيستم في نداء واحد وتطبّقها
--     داخل معاملة واحدة: إما تنجح كلها أو لا يتغيّر شيء.
--  ④ الدالة system_sync_ping — اختبار الاتصال من زر «اختبار الاتصال»
--  ⑤ دالة بوابة ولي الأمر — تُرجع الموقف الانضباطي مع الحضور
--
--  آمن للتنفيذ أكثر من مرة.
--  ما يُعرض لولي الأمر من الانضباط (قرار معتمد):
--    يظهر   : التاريخ · المخالفة · الإجراء أو الجزاء · المدة · الحالة · حالة التظلم
--             · إنذارات الغياب وقرارات الفصل بسببه
--    لا يظهر: محاضر التحقيق · أسماء الشهود أو الطلاب الآخرين · الملاحظات النصية
--             · القضايا التي لم يُنفَّذ جزاؤها بعد
-- ═══════════════════════════════════════════════════════════════════════════

-- ① المجموعة
alter table public.students add column if not exists class_label text;
comment on column public.students.class_label is 'اسم التخصص/المجموعة كما في سيستم المركز (مثل تركيبات كهربية1)';

-- ② الموقف الانضباطي
create table if not exists public.student_conduct (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students(id) on delete cascade,
  academic_year text not null,
  source_key    text not null,            -- مرجع السجل في السيستم (P:12 · F:7 · W:3 · D:1)
  kind          text not null check (kind in ('first_degree','sanction','absence_warning','absence_dismissal')),
  event_date    date not null,
  title         text not null,            -- المخالفة أو سبب الإجراء
  action        text,                     -- الإجراء أو الجزاء الموقَّع
  degree        smallint,                 -- درجة المخالفة (1 · 2 · 3)
  period_from   date,
  period_to     date,
  state         text,                     -- نافذ · منتهٍ · مفصول · أُعيد قيده …
  appeal        text,                     -- حالة التظلم إن وُجد
  synced_at     timestamptz not null default now(),
  unique (student_id, source_key)
);
create index if not exists conduct_student_idx on public.student_conduct(student_id, event_date desc);

alter table public.student_conduct enable row level security;
drop policy if exists conduct_admin_only on public.student_conduct;
create policy conduct_admin_only on public.student_conduct for all
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.student_conduct from anon;

-- ③ المزامنة
create or replace function public.system_sync(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_year     text := nullif(trim(p->>'academic_year'), '');
  v_from     date := (p->>'range_from')::date;
  v_to       date := (p->>'range_to')::date;
  v_batch    uuid;
  v_map      jsonb := '{}'::jsonb;     -- مفتاح الطالب في السيستم ← uuid في المنصة
  v_ins      int := 0;
  v_upd      int := 0;
  v_skip     int := 0;
  v_stale    int := 0;
  v_att      int := 0;
  v_att_del  int := 0;
  v_sum      int := 0;
  v_con      int := 0;
  v_con_del  int := 0;
  v_ids      uuid[];
  v_warn     jsonb := '[]'::jsonb;
begin
  if v_year is null then raise exception 'academic_year مطلوب'; end if;

  insert into public.import_batches(file_name, kind, rows_total)
  values ('SchoolSystem', 'system_sync', jsonb_array_length(coalesce(p->'students','[]')))
  returning id into v_batch;

  /* ── الطلاب ──────────────────────────────────────────────────────────────
     السيستم هو المصدر: كل طالب فيه يأخذ على المنصة كوده كما هو تمامًا، حتى
     يدخل ولي أمره بنفس الكود المكتوب في السيستم.
       ① المطابقة بالرقم القومي أولاً (هوية الطالب الثابتة)
       ② ثم بالكود — بشرط ألا يكون الصف محجوزًا لطالب آخر أو يحمل رقمًا قوميًا مختلفًا
       ③ صفوف قديمة على المنصة تحمل كودًا صار لطالب آخر في السيستم
          (من استيراد سابق) يُنقل كودها جانبًا فلا تحجب صاحبه الحقيقي
     وتُنفَّذ كلها جملةً واحدة، فلا يتعارض طالبان على صف واحد. */
  drop table if exists t_stu;
  create temp table t_stu on commit drop as
  select x.v->>'key' as key,
         trim(x.v->>'student_code') as code,
         nullif(regexp_replace(coalesce(x.v->>'national_id',''), '\D', '', 'g'), '') as nid,
         x.v as j,
         null::uuid as pid,
         x.ord as ord
    from jsonb_array_elements(coalesce(p->'students','[]')) with ordinality as x(v, ord)
   where nullif(trim(x.v->>'student_code'), '') is not null;
  v_skip := jsonb_array_length(coalesce(p->'students','[]')) - (select count(*) from t_stu);

  -- كود أو رقم قومي مكرّر داخل الحزمة نفسها (لا يُفترض أن يقع) — يُرفع الأول وينبَّه على الباقي
  with d as (
    delete from t_stu a using t_stu b
     where a.ord > b.ord and (a.code = b.code or (a.nid is not null and a.nid = b.nid))
    returning a.j->>'full_name' as n
  )
  select v_warn || coalesce(jsonb_agg(jsonb_build_object('type','warning','message',
           'لم يُرفع «' || n || '»: كوده أو رقمه القومي مكرّر لطالب آخر في السيستم')), '[]'::jsonb),
         v_skip + count(*)
    into v_warn, v_skip from d;

  -- ① بالرقم القومي
  update t_stu t set pid = s.id
    from public.students s
   where t.nid is not null
     and regexp_replace(coalesce(s.national_id,''), '\D', '', 'g') = t.nid;

  -- ② بالكود: صف غير مأخوذ، ورقمه القومي فارغ أو مطابق
  update t_stu t set pid = s.id
    from public.students s
   where t.pid is null
     and s.student_code = t.code
     and not exists (select 1 from t_stu u where u.pid = s.id)
     and (t.nid is null
          or nullif(regexp_replace(coalesce(s.national_id,''), '\D', '', 'g'), '') is null
          or regexp_replace(s.national_id, '\D', '', 'g') = t.nid);

  -- ③ أكواد السيستم المحجوزة على المنصة بصفوف لا تخص أحدًا في هذه المزامنة
  update public.students s
     set student_code = s.student_code || '~' || left(s.id::text, 8)
   where s.student_code in (select code from t_stu)
     and not exists (select 1 from t_stu u where u.pid = s.id);
  get diagnostics v_stale = row_count;
  if v_stale > 0 then
    v_warn := v_warn || jsonb_build_object('type','warning','message',
      'سجلات قديمة على المنصة (' || v_stale || ') كانت تحمل أكواد طلاب في السيستم — نُقلت جانبًا وأُعطي كل كود لصاحبه');
  end if;

  -- الأكواد إلى قيمة مؤقتة فريدة ثم إلى قيمتها النهائية (يمنع تعارض التبديل)
  update public.students s set student_code = '~sync~' || s.id::text
    from t_stu t where t.pid = s.id and s.student_code <> t.code;

  update public.students s set
    student_code      = t.code,
    national_id       = coalesce(t.nid, s.national_id),
    full_name         = coalesce(nullif(trim(t.j->>'full_name'),''), s.full_name),
    grade_id          = nullif(t.j->>'grade_id','')::smallint,
    specialization_id = (select id from public.specializations where slug = t.j->>'spec_slug'),
    class_label       = nullif(t.j->>'class_label',''),
    guardian_name     = nullif(t.j->>'guardian_name',''),
    guardian_phone    = nullif(t.j->>'guardian_phone',''),
    academic_year     = v_year,
    status            = coalesce(nullif(t.j->>'status',''), 'active')
    from t_stu t where t.pid = s.id;
  get diagnostics v_upd = row_count;

  with ins as (
    insert into public.students(student_code, national_id, full_name, grade_id, specialization_id,
                                class_label, guardian_name, guardian_phone, academic_year, status)
    select t.code, t.nid, coalesce(nullif(trim(t.j->>'full_name'),''), '—'),
           nullif(t.j->>'grade_id','')::smallint,
           (select id from public.specializations where slug = t.j->>'spec_slug'),
           nullif(t.j->>'class_label',''), nullif(t.j->>'guardian_name',''),
           nullif(t.j->>'guardian_phone',''), v_year, coalesce(nullif(t.j->>'status',''), 'active')
      from t_stu t where t.pid is null
    returning id, student_code
  )
  update t_stu t set pid = ins.id from ins where ins.student_code = t.code and t.pid is null;
  select count(*) into v_ins from t_stu t
   where exists (select 1 from public.students s where s.id = t.pid and s.created_at >= now());

  select coalesce(jsonb_object_agg(key, pid), '{}'::jsonb) into v_map from t_stu where pid is not null;

  select coalesce(array_agg(value::text::uuid), '{}') into v_ids
    from jsonb_each_text(v_map);

  -- الغياب: يُستبدل سجل هؤلاء الطلاب في مدى العام بما في السيستم الآن
  -- (فاليوم الذي صُحِّح في السيستم من «غياب» إلى «حضور» يختفي من البوابة)
  delete from public.attendance_records
   where student_id = any(v_ids) and section is null and date between v_from and v_to;
  get diagnostics v_att_del = row_count;

  insert into public.attendance_records(student_id, date, status, section, reason, import_id)
  select (v_map->>(a->>'key'))::uuid, (a->>'date')::date, (a->>'status')::attendance_status,
         null, nullif(a->>'reason',''), v_batch
    from jsonb_array_elements(coalesce(p->'attendance','[]')) a
   where v_map ? (a->>'key') and (a->>'date')::date between v_from and v_to
  on conflict do nothing;
  get diagnostics v_att = row_count;

  -- ملخص الحضور
  insert into public.attendance_summaries(student_id, academic_year, total_school_days,
              attendance_days, absence_days, attendance_pct, absence_pct, last_updated)
  select (v_map->>(s->>'key'))::uuid, v_year,
         (s->>'total_school_days')::int, (s->>'attendance_days')::int, (s->>'absence_days')::int,
         nullif(s->>'attendance_pct','')::numeric, nullif(s->>'absence_pct','')::numeric, now()
    from jsonb_array_elements(coalesce(p->'summaries','[]')) s
   where v_map ? (s->>'key')
  on conflict (student_id) do update set
    academic_year = excluded.academic_year, total_school_days = excluded.total_school_days,
    attendance_days = excluded.attendance_days, absence_days = excluded.absence_days,
    attendance_pct = excluded.attendance_pct, absence_pct = excluded.absence_pct,
    last_updated = excluded.last_updated;
  get diagnostics v_sum = row_count;

  -- الموقف الانضباطي: يُستبدل بالكامل لهذا العام (فالجزاء الذي أُلغي في السيستم يختفي)
  delete from public.student_conduct where student_id = any(v_ids) and academic_year = v_year;
  get diagnostics v_con_del = row_count;

  insert into public.student_conduct(student_id, academic_year, source_key, kind, event_date,
              title, action, degree, period_from, period_to, state, appeal)
  select (v_map->>(c->>'key'))::uuid, v_year, c->>'source_key', c->>'kind', (c->>'event_date')::date,
         c->>'title', nullif(c->>'action',''), nullif(c->>'degree','')::smallint,
         nullif(c->>'period_from','')::date, nullif(c->>'period_to','')::date,
         nullif(c->>'state',''), nullif(c->>'appeal','')
    from jsonb_array_elements(coalesce(p->'conduct','[]')) c
   where v_map ? (c->>'key')
  on conflict (student_id, source_key) do nothing;
  get diagnostics v_con = row_count;

  update public.import_batches set
    rows_inserted = v_ins, rows_updated = v_upd, rows_failed = v_skip,
    errors = v_warn
  where id = v_batch;

  return jsonb_build_object(
    'ok', true, 'batch_id', v_batch,
    'students_inserted', v_ins, 'students_updated', v_upd, 'students_skipped', v_skip,
    'absences', v_att, 'absences_removed', v_att_del,
    'summaries', v_sum, 'conduct', v_con, 'conduct_removed', v_con_del,
    'warnings', v_warn);
end $$;

revoke all on function public.system_sync(jsonb) from public, anon, authenticated;
grant execute on function public.system_sync(jsonb) to service_role;

-- ④ اختبار الاتصال
create or replace function public.system_sync_ping()
returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'ok', true,
    'version', 1,
    'students', (select count(*) from public.students),
    'last_sync', (select max(created_at) from public.import_batches where kind = 'system_sync'),
    'specializations', (select coalesce(jsonb_agg(slug order by sort_order), '[]') from public.specializations));
$$;
revoke all on function public.system_sync_ping() from public, anon, authenticated;
grant execute on function public.system_sync_ping() to service_role;

-- ⑤ بوابة ولي الأمر — نفس الضوابط السابقة + الموقف الانضباطي والمجموعة
create or replace function public.parent_portal_login(
  p_student_code text default null,
  p_national_id  text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_enabled     boolean;
  v_require_both boolean;
  v_max_attempts int;
  v_ident       text;
  v_fails       int;
  v_global      int;
  v_student     public.students%rowtype;
  v_sum         public.attendance_summaries%rowtype;
  v_absences    jsonb;
  v_conduct     jsonb;
  v_code        text := nullif(trim(coalesce(p_student_code,'')), '');
  v_nid         text := nullif(regexp_replace(coalesce(p_national_id,''), '\D', '', 'g'), '');
begin
  select coalesce((value #>> '{}')::boolean, true) into v_enabled
    from public.site_settings where key = 'parent_portal.enabled';
  if v_enabled is false then
    return jsonb_build_object('ok', false, 'error', 'disabled');
  end if;

  select coalesce((value #>> '{}')::boolean, true) into v_require_both
    from public.site_settings where key = 'parent_portal.require_both';
  select coalesce((value #>> '{}')::int, 8) into v_max_attempts
    from public.site_settings where key = 'parent_portal.max_attempts';

  if v_code is null and v_nid is null then
    return jsonb_build_object('ok', false, 'error', 'missing_identifier');
  end if;
  if coalesce(v_require_both, true) and (v_code is null or v_nid is null) then
    return jsonb_build_object('ok', false, 'error', 'both_required');
  end if;

  v_ident := coalesce(
    nullif(current_setting('request.headers', true)::jsonb ->> 'cf-connecting-ip', ''),
    coalesce(v_code, '') || '|' || coalesce(v_nid, ''));

  select count(*) into v_fails from public.portal_login_attempts
   where identifier = v_ident and not succeeded and created_at > now() - interval '15 minutes';
  if v_fails >= coalesce(v_max_attempts, 8) then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;

  select count(*) into v_global from public.portal_login_attempts
   where not succeeded and created_at > now() - interval '15 minutes';
  if v_global >= coalesce(v_max_attempts, 8) * 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;

  select * into v_student from public.students s
   where (v_code is null or upper(trim(s.student_code)) = upper(v_code))
     and (v_nid  is null or regexp_replace(coalesce(s.national_id,''), '\D', '', 'g') = v_nid)
   limit 1;

  if v_student.id is null then
    insert into public.portal_login_attempts(identifier, succeeded) values (v_ident, false);
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  insert into public.portal_login_attempts(identifier, succeeded) values (v_ident, true);
  select * into v_sum from public.attendance_summaries where student_id = v_student.id;

  select coalesce(jsonb_agg(x order by x->>'date' desc), '[]'::jsonb) into v_absences
  from (
    select jsonb_build_object('date', a.date, 'status', a.status, 'section', a.section, 'reason', a.reason) as x
    from public.attendance_records a
    where a.student_id = v_student.id and a.status in ('absent','excused','late')
    order by a.date desc limit 200
  ) t;

  select coalesce(jsonb_agg(x order by x->>'event_date' desc, x->>'kind'), '[]'::jsonb) into v_conduct
  from (
    select jsonb_build_object('kind', c.kind, 'event_date', c.event_date, 'title', c.title,
             'action', c.action, 'degree', c.degree, 'period_from', c.period_from,
             'period_to', c.period_to, 'state', c.state, 'appeal', c.appeal) as x
    from public.student_conduct c
    where c.student_id = v_student.id
      and (v_student.academic_year is null or c.academic_year = v_student.academic_year)
    order by c.event_date desc limit 100
  ) t;

  return jsonb_build_object(
    'ok', true,
    'student', jsonb_build_object(
      'full_name',      v_student.full_name,
      'student_code',   v_student.student_code,
      'grade',          (select g.name from public.grades g where g.id = v_student.grade_id),
      'specialization', coalesce((select sp.name from public.specializations sp where sp.id = v_student.specialization_id),
                                 v_student.class_label),
      'class_label',    v_student.class_label,
      'academic_year',  v_student.academic_year,
      'status',         v_student.status,
      'guardian_name',  v_student.guardian_name
    ),
    'attendance', jsonb_build_object(
      'total_school_days', v_sum.total_school_days,
      'attendance_days',   coalesce(v_sum.attendance_days, 0),
      'absence_days',      coalesce(v_sum.absence_days, 0),
      'attendance_pct',    v_sum.attendance_pct,
      'absence_pct',       v_sum.absence_pct,
      'last_updated',      v_sum.last_updated
    ),
    'absences', v_absences,
    'conduct',  v_conduct
  );
end $$;
revoke all on function public.parent_portal_login(text,text) from public;
grant execute on function public.parent_portal_login(text,text) to anon, authenticated;
