import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import clsx from 'clsx';
import { AdminPage } from './AdminPage';
import { Alert, EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { Table, Td, Th } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input, Select, Switch } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import {
  createAdminUser, deleteAdminUser, fetchAdminUsers, resetAdminUserPassword, updateAdminUser,
} from '@/data/api';
import { useAuth } from '@/hooks/useAuth';
import { useSeo } from '@/hooks/useSeo';
import type { AdminRole, AdminUser } from '@/types/db';

export const ROLES_CONFIG: Record<AdminRole, { label: string; desc: string; badgeClass: string }> = {
  super_admin: {
    label: 'مدير النظام',
    desc: 'كامل الصلاحيات (إدارة المستخدمين، إعدادات الموقع، وكافة أقسام المنصة والطلاب)',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  editor: {
    label: 'محرّر محتوى',
    desc: 'إدارة المكتبة والكتب، المواد الدراسية، التخصصات، الأخبار، الإعلانات، الفيديوهات والمعرض',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  student_affairs: {
    label: 'شئون الطلاب',
    desc: 'إدارة بيانات الطلاب وسجلات ونسب الحضور والغياب واستيراد وتصدير ملفات Excel',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  complaints_officer: {
    label: 'مسؤول الشكاوى',
    desc: 'متابعة الشكاوى والمقترحات والطلبات والرد عليها ومتابعة سجل الإجراءات',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
};

export default function AdminUsers() {
  useSeo({ title: 'مستخدمو الإدارة', noIndex: true });

  const toast = useToast();
  const qc = useQueryClient();
  const { admin } = useAuth();
  const isSuper = admin?.role === 'super_admin';

  // حالة النوافذ المنبثقة
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<{ full_name: string; email: string; password: string; role: AdminRole }>({
    full_name: '',
    email: '',
    password: '',
    role: 'editor',
  });

  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const [toDelete, setToDelete] = useState<AdminUser | null>(null);

  const list = useQuery({ queryKey: ['admin-users'], queryFn: fetchAdminUsers });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin-users'] });

  // تحديث الصلاحية أو الحالة
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<AdminUser> }) => updateAdminUser(id, patch),
    onSuccess: () => { invalidate(); toast.push({ tone: 'success', title: 'تم تحديث بيانات المستخدم' }); },
    onError: (e) => toast.push({ tone: 'error', title: 'تعذّر التحديث', description: e instanceof Error ? e.message : undefined }),
  });

  // إضافة مستخدم جديد
  const create = useMutation({
    mutationFn: (params: typeof form) => createAdminUser(params),
    onSuccess: (res) => {
      invalidate();
      setAddOpen(false);
      setForm({ full_name: '', email: '', password: '', role: 'editor' });
      toast.push({
        tone: 'success',
        title: 'تم إنشاء المستخدم بنجاح',
        description: `تم إنشاء حساب «${res.full_name}» وتفعيله، ويمكنه تسجيل الدخول فوراً.`,
      });
    },
    onError: (e) => toast.push({
      tone: 'error',
      title: 'تعذّر إنشاء المستخدم',
      description: e instanceof Error ? e.message : undefined,
    }),
  });

  // إعادة تعيين كلمة المرور
  const resetPass = useMutation({
    mutationFn: ({ userId, pass }: { userId: string; pass: string }) => resetAdminUserPassword(userId, pass),
    onSuccess: () => {
      setResetTarget(null);
      setNewPassword('');
      toast.push({ tone: 'success', title: 'تم تعيين كلمة المرور الجديدة بنجاح' });
    },
    onError: (e) => toast.push({
      tone: 'error',
      title: 'تعذّر إعادة تعيين كلمة المرور',
      description: e instanceof Error ? e.message : undefined,
    }),
  });

  // حذف مستخدم
  const remove = useMutation({
    mutationFn: (userId: string) => deleteAdminUser(userId),
    onSuccess: () => {
      invalidate();
      setToDelete(null);
      toast.push({ tone: 'success', title: 'تم حذف المستخدم نهائياً' });
    },
    onError: (e) => toast.push({
      tone: 'error',
      title: 'تعذّر حذف المستخدم',
      description: e instanceof Error ? e.message : undefined,
    }),
  });

  return (
    <AdminPage
      title="مستخدمو لوحة الإدارة"
      description="إدارة الحسابات المصرَّح لها بالدخول وتحديد الصلاحيات وتفعيل أو إيقاف الحسابات."
      action={
        isSuper ? (
          <Button onClick={() => setAddOpen(true)} icon={<UserPlus className="h-4 w-4" />}>
            إضافة مستخدم جديد
          </Button>
        ) : undefined
      }>

      {!isSuper && (
        <Alert tone="warning">
          إدارة المستخدمين وإضافة وتعديل الصلاحيات مقصورة على «مدير النظام». يمكنك الاطلاع فقط.
        </Alert>
      )}

      {/* شرح الصلاحيات والأدوار */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.entries(ROLES_CONFIG) as Array<[AdminRole, (typeof ROLES_CONFIG)[AdminRole]]>).map(([k, r]) => (
          <div key={k} className="card p-4 space-y-1.5 border border-steel-200">
            <span className={clsx('inline-block rounded-md border px-2 py-0.5 text-[12px] font-bold', r.badgeClass)}>
              {r.label}
            </span>
            <p className="text-[12.5px] leading-6 text-steel-600">{r.desc}</p>
          </div>
        ))}
      </div>

      {list.isLoading ? (
        <SkeletonRows rows={4} />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data?.length ? (
        <Table>
          <thead>
            <tr>
              <Th>الاسم الكامل</Th>
              <Th>البريد الإلكتروني</Th>
              <Th>الصلاحية</Th>
              <Th>الحالة</Th>
              {isSuper && <Th className="w-32 text-center">إجراءات</Th>}
            </tr>
          </thead>
          <tbody>
            {list.data.map((u) => {
              const isCurrentUser = u.user_id === admin?.user_id;
              const roleInfo = ROLES_CONFIG[u.role] ?? ROLES_CONFIG.editor;

              return (
                <tr key={u.user_id}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">{u.full_name}</span>
                      {isCurrentUser && (
                        <span className="rounded bg-steel-200 px-1.5 py-0.5 text-[11px] font-bold text-steel-700">
                          أنت
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td className="text-steel-600 font-mono text-[13.5px]" dir="ltr">
                    {u.email ?? '—'}
                  </Td>
                  <Td>
                    {isSuper ? (
                      <select
                        value={u.role}
                        disabled={isCurrentUser}
                        aria-label={`صلاحية ${u.full_name}`}
                        onChange={(e) => update.mutate({ id: u.user_id, patch: { role: e.target.value as AdminRole } })}
                        className="h-10 rounded-xl border border-steel-300 bg-surface px-3 text-[14px] font-medium transition focus:border-accent disabled:opacity-60">
                        {(Object.keys(ROLES_CONFIG) as AdminRole[]).map((r) => (
                          <option key={r} value={r}>
                            {ROLES_CONFIG[r].label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={clsx('inline-block rounded-md border px-2 py-0.5 text-[12px] font-bold', roleInfo.badgeClass)}>
                        {roleInfo.label}
                      </span>
                    )}
                  </Td>
                  <Td>
                    {isSuper ? (
                      <Switch
                        label={u.is_active ? 'مفعَّل' : 'موقوف'}
                        checked={u.is_active}
                        disabled={isCurrentUser}
                        onChange={(v) => update.mutate({ id: u.user_id, patch: { is_active: v } })}
                      />
                    ) : (
                      <span className={clsx('text-[13.5px] font-semibold', u.is_active ? 'text-emerald-700' : 'text-ember-600')}>
                        {u.is_active ? 'مفعَّل' : 'موقوف'}
                      </span>
                    )}
                  </Td>
                  {isSuper && (
                    <Td>
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => { setResetTarget(u); setNewPassword(''); }}
                          title="تغيير كلمة المرور"
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-steel-300 text-steel-700 transition hover:bg-steel-50 hover:text-accent">
                          <KeyRound className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          disabled={isCurrentUser}
                          onClick={() => setToDelete(u)}
                          title={isCurrentUser ? 'لا يمكنك حذف حسابك الحالي' : 'حذف المستخدم'}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-steel-300 text-steel-500 transition hover:border-ember-200 hover:bg-ember-50 hover:text-ember-600 disabled:cursor-not-allowed disabled:opacity-30">
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState icon={<Users className="h-7 w-7" />} title="لا يوجد مستخدمون" />
      )}

      {/* نافذة إضافة مستخدم جديد */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        size="md"
        title="إضافة مستخدم جديد إلى لوحة الإدارة"
        description="أنشئ حساب مستخدم جديد وحدد صلاحياته. يُفعَّل الحساب فوراً ليتمكن من تسجيل الدخول."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              إلغاء
            </Button>
            <Button
              loading={create.isPending}
              onClick={() => {
                if (!form.full_name.trim()) {
                  toast.push({ tone: 'warning', title: 'يرجى إدخال الاسم الكامل' });
                  return;
                }
                if (!form.email.trim()) {
                  toast.push({ tone: 'warning', title: 'يرجى إدخال البريد الإلكتروني' });
                  return;
                }
                if (form.password.length < 6) {
                  toast.push({ tone: 'warning', title: 'كلمة المرور يجب أن لا تقل عن 6 أحرف' });
                  return;
                }
                create.mutate(form);
              }}
              icon={<UserPlus className="h-4 w-4" />}>
              إنشاء الحساب وتفعيله
            </Button>
          </>
        }>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(form);
          }}
          className="space-y-4">
          <Input
            label="الاسم الكامل"
            required
            placeholder="مثال: أحمد محمد علي"
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
          />

          <Input
            label="البريد الإلكتروني"
            type="email"
            dir="ltr"
            required
            placeholder="name@example.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />

          <Input
            label="كلمة المرور"
            type="password"
            dir="ltr"
            required
            hint="٦ أحرف أو أرقام على الأقل"
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />

          <Select
            label="الصلاحية"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AdminRole }))}>
            {(Object.keys(ROLES_CONFIG) as AdminRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLES_CONFIG[r].label} — {ROLES_CONFIG[r].desc}
              </option>
            ))}
          </Select>

          <Alert tone="info">
            الحساب يُنشأ مباشرةً في نظام المصادقة ويتم تفعيله تلقائياً بحيث يستطيع المستخدم تسجيل الدخول من الرابط المخصص للإدارة فور إتمام الإضافة.
          </Alert>
        </form>
      </Modal>

      {/* نافذة إعادة تعيين كلمة المرور */}
      <Modal
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        size="sm"
        title="تغيير كلمة المرور"
        description={`تعيين كلمة مرور جديدة للمستخدم «${resetTarget?.full_name}» (${resetTarget?.email}).`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetTarget(null)}>
              إلغاء
            </Button>
            <Button
              loading={resetPass.isPending}
              onClick={() => {
                if (newPassword.length < 6) {
                  toast.push({ tone: 'warning', title: 'كلمة المرور يجب أن لا تقل عن 6 أحرف' });
                  return;
                }
                if (resetTarget) resetPass.mutate({ userId: resetTarget.user_id, pass: newPassword });
              }}
              icon={<KeyRound className="h-4 w-4" />}>
              حفظ كلمة المرور
            </Button>
          </>
        }>
        <div className="space-y-4">
          <Input
            label="كلمة المرور الجديدة"
            type="password"
            dir="ltr"
            required
            hint="٦ أحرف أو أرقام على الأقل"
            placeholder="••••••••"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
      </Modal>

      {/* تأكيد الحذف */}
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        loading={remove.isPending}
        title="حذف حساب مستخدم"
        message={`هل أنت متأكد من حذف حساب «${toDelete?.full_name}» (${toDelete?.email}) نهائياً؟ سيتم إلغاء وصوله بالكامل إلى لوحة الإدارة.`}
        onConfirm={() => toDelete && remove.mutate(toDelete.user_id)}
      />
    </AdminPage>
  );
}
