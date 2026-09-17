-- ═══════════════════════════════════════════════════════════════════════════
--  0007_admin_management.sql — دوال إدارة مستخدمي لوحة التحكم من داخل المنصة
--  تتيح لمدير النظام إضافة مستخدمين جدد، وتغيير كلمات المرور، وحذف الحسابات
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ① دالة إنشاء مستخدم جديد وتفعيله في Auth و admin_users مباشرةً
create or replace function public.admin_create_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_role text default 'editor'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid;
  v_role public.admin_role;
  v_clean_email text;
begin
  -- التحقق من صلاحية مدير النظام
  if not public.is_super_admin() then
    raise exception 'غير مصرح لك بتنفيذ هذه العملية — مقتصرة على مدير النظام فقط';
  end if;

  v_clean_email := lower(btrim(p_email));

  if v_clean_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception 'صيغة البريد الإلكتروني غير صحيحة';
  end if;

  if length(p_password) < 6 then
    raise exception 'كلمة المرور يجب أن لا تقل عن 6 أحرف أو أرقام';
  end if;

  if length(btrim(p_full_name)) < 2 then
    raise exception 'الاسم الكامل مطلوب';
  end if;

  -- التحقق من عدم وجود البريد مسبقاً
  if exists (select 1 from auth.users where email = v_clean_email) then
    raise exception 'البريد الإلكتروني مسجَّل بالفعل لمستخدم آخر';
  end if;

  -- تحويل وتدقيق الصلاحية
  begin
    v_role := p_role::public.admin_role;
  exception when others then
    v_role := 'editor'::public.admin_role;
  end;

  v_user_id := gen_random_uuid();

  -- إنشاء المستخدم في auth.users مفعل ومؤكد فوراً
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    is_super_admin
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_clean_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', btrim(p_full_name)),
    now(),
    now(),
    false
  );

  -- إنشاء الهوية في auth.identities
  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    v_user_id,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_clean_email),
    'email',
    v_clean_email,
    now(),
    now(),
    now()
  );

  -- ربط المستخدم بجدول مستخدمي لوحة الإدارة
  insert into public.admin_users (
    user_id,
    full_name,
    email,
    role,
    is_active,
    created_at,
    updated_at
  ) values (
    v_user_id,
    btrim(p_full_name),
    v_clean_email,
    v_role,
    true,
    now(),
    now()
  );

  return jsonb_build_object(
    'user_id', v_user_id,
    'email', v_clean_email,
    'full_name', btrim(p_full_name),
    'role', v_role,
    'is_active', true
  );
end $$;

revoke all on function public.admin_create_user(text, text, text, text) from public, anon;
grant execute on function public.admin_create_user(text, text, text, text) to authenticated;


-- ② دالة حذف مستخدم نهائياً
create or replace function public.admin_delete_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_super_admin() then
    raise exception 'غير مصرح لك بتنفيذ هذه العملية';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'لا يمكنك حذف حسابك الشخصي الحالي';
  end if;

  delete from public.admin_users where user_id = p_user_id;
  delete from auth.users where id = p_user_id;

  return true;
end $$;

revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;


-- ③ دالة إعادة تعيين كلمة مرور مستخدم
create or replace function public.admin_reset_user_password(
  p_user_id uuid,
  p_new_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if not public.is_super_admin() then
    raise exception 'غير مصرح لك بتنفيذ هذه العملية';
  end if;

  if length(p_new_password) < 6 then
    raise exception 'كلمة المرور يجب أن لا تقل عن 6 أحرف أو أرقام';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = p_user_id;

  return true;
end $$;

revoke all on function public.admin_reset_user_password(uuid, text) from public, anon;
grant execute on function public.admin_reset_user_password(uuid, text) to authenticated;
