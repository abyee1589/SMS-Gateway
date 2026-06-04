'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { ui } from '@/lib/ui';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  Edit3,
  Package,
  Plus,
  Power,
  PowerOff,
  Save,
  X,
  Zap,
} from 'lucide-react';

type PlanStatus = 'active' | 'inactive';

type SubscriptionPlan = {
  id: string;
  name: string;
  smsQuota: number;
  durationDays: number;
  price: number;
  status: PlanStatus;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
};

type PlanForm = {
  name: string;
  smsQuota: number;
  durationDays: number;
  price: number;
  description: string;
};

const emptyForm: PlanForm = {
  name: '',
  smsQuota: 1000,
  durationDays: 30,
  price: 0,
  description: '',
};

function getErrorMessage(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error
  ) {
    const message = (error as { message?: unknown }).message;

    if (Array.isArray(message)) return message[0] ?? 'Request failed';
    if (typeof message === 'string') return message;
  }

  if (error instanceof Error) return error.message;

  return 'Request failed';
}

export default function SubscriptionPlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PlanForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadPlans() {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    try {
      const data = await apiFetch<SubscriptionPlan[]>(
        '/subscription-plans',
        undefined,
        token,
      );

      setPlans(data);
    } catch (error) {
      console.error('Failed to load plans', error);
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlans();
  }, []);

  const activePlans = useMemo(
    () => plans.filter((plan) => plan.status === 'active').length,
    [plans],
  );

  const totalQuota = useMemo(
    () => plans.reduce((sum, plan) => sum + plan.smsQuota, 0),
    [plans],
  );

  async function createPlan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    if (!form.name.trim()) {
      toast.error('Plan name is required');
      return;
    }

    setSaving(true);

    try {
      await apiFetch(
        '/subscription-plans',
        {
          method: 'POST',
          body: JSON.stringify({
            name: form.name.trim(),
            smsQuota: Number(form.smsQuota),
            durationDays: Number(form.durationDays),
            price: Number(form.price),
            description: form.description.trim() || undefined,
          }),
        },
        token,
      );

      toast.success('Plan created');
      setForm(emptyForm);
      await loadPlans();
    } catch (error) {
      console.error('Failed to create plan', error);
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(plan: SubscriptionPlan) {
    setEditingId(plan.id);
    setEditForm({
      name: plan.name,
      smsQuota: plan.smsQuota,
      durationDays: plan.durationDays,
      price: plan.price,
      description: plan.description ?? '',
    });
  }

  async function saveEdit(planId: string) {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    if (!editForm.name.trim()) {
      toast.error('Plan name is required');
      return;
    }

    setSaving(true);

    try {
      await apiFetch(
        `/subscription-plans/${planId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: editForm.name.trim(),
            smsQuota: Number(editForm.smsQuota),
            durationDays: Number(editForm.durationDays),
            price: Number(editForm.price),
            description: editForm.description.trim() || undefined,
          }),
        },
        token,
      );

      toast.success('Plan updated');
      setEditingId(null);
      await loadPlans();
    } catch (error) {
      console.error('Failed to update plan', error);
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(plan: SubscriptionPlan) {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    const nextAction = plan.status === 'active' ? 'deactivate' : 'activate';

    setSaving(true);

    try {
      await apiFetch(
        `/subscription-plans/${plan.id}/${nextAction}`,
        {
          method: 'PATCH',
        },
        token,
      );

      toast.success(
        plan.status === 'active' ? 'Plan deactivated' : 'Plan activated',
      );

      await loadPlans();
    } catch (error) {
      console.error('Failed to update plan status', error);
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <PlansSkeleton />;
  }

  return (
    <div className={ui.page}>
      <section className="overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-xl">
        <div className="relative p-5 sm:p-7 lg:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/2 h-60 w-60 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
                <Package className="h-3.5 w-3.5 text-blue-300" />
                Zergaw Subscription Plans
              </div>

              <h1 className="mt-5 break-words text-3xl font-black tracking-tight sm:text-4xl">
                SMS packages and pricing
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Create and manage the packages companies can subscribe to.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:min-w-[320px]">
              <HeroMetric label="Plans" value={plans.length} />
              <HeroMetric label="Active" value={activePlans} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard
          label="Total Plans"
          value={plans.length}
          helper="All configured packages"
          icon={Package}
        />
        <SummaryCard
          label="Active Plans"
          value={activePlans}
          helper="Visible subscription offers"
          icon={CheckCircle2}
        />
        <SummaryCard
          label="Total Plan Quota"
          value={totalQuota}
          helper="Combined quota across packages"
          icon={Zap}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className={ui.card}>
          <div className={ui.cardBody}>
            <h2 className={ui.sectionTitle}>Create Plan</h2>
            <p className={ui.sectionSubtitle}>
              Add a new SMS package for company subscriptions.
            </p>

            <form onSubmit={createPlan} className="mt-6 space-y-4">
              <Field label="Plan Name">
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className={ui.input}
                  placeholder="Business 10000"
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="SMS Quota">
                  <input
                    type="number"
                    min={1}
                    value={form.smsQuota}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        smsQuota: Number(e.target.value),
                      }))
                    }
                    className={ui.input}
                  />
                </Field>

                <Field label="Duration Days">
                  <input
                    type="number"
                    min={1}
                    value={form.durationDays}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        durationDays: Number(e.target.value),
                      }))
                    }
                    className={ui.input}
                  />
                </Field>

                <Field label="Price">
                  <input
                    type="number"
                    min={0}
                    value={form.price}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        price: Number(e.target.value),
                      }))
                    }
                    className={ui.input}
                  />
                </Field>
              </div>

              <Field label="Description">
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  className={ui.textarea}
                  placeholder="Monthly business package..."
                />
              </Field>

              <button
                type="submit"
                disabled={saving}
                className={`${ui.primaryButton} w-full gap-2`}
              >
                <Plus className="h-4 w-4" />
                {saving ? 'Creating...' : 'Create Plan'}
              </button>
            </form>
          </div>
        </div>

        <div className={ui.card}>
          <div className={ui.cardBody}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className={ui.sectionTitle}>Plans</h2>
                <p className={ui.sectionSubtitle}>
                  Manage active and inactive subscription packages.
                </p>
              </div>

              <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
                {plans.length} total
              </span>
            </div>

            <div className="mt-6 space-y-3">
              {plans.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-100 py-12 text-center text-sm text-slate-400">
                  No subscription plans yet.
                </div>
              ) : (
                plans.map((plan) =>
                  editingId === plan.id ? (
                    <EditablePlanCard
                      key={plan.id}
                      form={editForm}
                      setForm={setEditForm}
                      saving={saving}
                      onSave={() => saveEdit(plan.id)}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      saving={saving}
                      onEdit={() => startEdit(plan)}
                      onToggleStatus={() => toggleStatus(plan)}
                    />
                  ),
                )
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className={ui.label}>{label}</span>
      {children}
    </label>
  );
}

function PlanCard({
  plan,
  saving,
  onEdit,
  onToggleStatus,
}: {
  plan: SubscriptionPlan;
  saving: boolean;
  onEdit: () => void;
  onToggleStatus: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-md">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-words text-lg font-black text-slate-900">
              {plan.name}
            </p>
            <StatusBadge status={plan.status} />
          </div>

          <p className="mt-2 text-sm text-slate-500">
            {plan.description || 'No description'}
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <PlanMini label="Quota" value={plan.smsQuota} />
            <PlanMini label="Duration" value={`${plan.durationDays} days`} />
            <PlanMini label="Price" value={plan.price} />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={onEdit}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            <Edit3 className="h-4 w-4" />
            Edit
          </button>

          <button
            type="button"
            onClick={onToggleStatus}
            disabled={saving}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition disabled:opacity-60 ${
              plan.status === 'active'
                ? 'bg-red-50 text-red-700 hover:bg-red-100'
                : 'bg-green-50 text-green-700 hover:bg-green-100'
            }`}
          >
            {plan.status === 'active' ? (
              <>
                <PowerOff className="h-4 w-4" />
                Deactivate
              </>
            ) : (
              <>
                <Power className="h-4 w-4" />
                Activate
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditablePlanCard({
  form,
  setForm,
  saving,
  onSave,
  onCancel,
}: {
  form: PlanForm;
  setForm: React.Dispatch<React.SetStateAction<PlanForm>>;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/30 p-4">
      <div className="space-y-4">
        <Field label="Plan Name">
          <input
            value={form.name}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, name: e.target.value }))
            }
            className={ui.input}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="SMS Quota">
            <input
              type="number"
              min={1}
              value={form.smsQuota}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  smsQuota: Number(e.target.value),
                }))
              }
              className={ui.input}
            />
          </Field>

          <Field label="Duration Days">
            <input
              type="number"
              min={1}
              value={form.durationDays}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  durationDays: Number(e.target.value),
                }))
              }
              className={ui.input}
            />
          </Field>

          <Field label="Price">
            <input
              type="number"
              min={0}
              value={form.price}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  price: Number(e.target.value),
                }))
              }
              className={ui.input}
            />
          </Field>
        </div>

        <Field label="Description">
          <textarea
            value={form.description}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                description: e.target.value,
              }))
            }
            className={ui.textarea}
          />
        </Field>

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>

          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanMini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3">
      <p className="text-xs font-black uppercase tracking-[0.15em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-black text-slate-900">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: PlanStatus }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-black capitalize ${
        status === 'active'
          ? 'bg-green-50 text-green-700'
          : 'bg-slate-100 text-slate-600'
      }`}
    >
      {status}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
            {label}
          </p>
          <p className="mt-3 break-words text-3xl font-black text-slate-950">
            {value}
          </p>
        </div>

        <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-500">{helper}</p>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function PlansSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-60 animate-pulse rounded-[2rem] bg-slate-100" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    </div>
  );
}
