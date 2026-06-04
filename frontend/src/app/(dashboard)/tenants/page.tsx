'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { ui } from '@/lib/ui';
import toast from 'react-hot-toast';

type TenantStatus = 'trial' | 'active' | 'suspended' | 'expired';
type CommercialTier = 'standard' | 'vip' | 'enterprise';
type MessagePriority = 'normal' | 'high' | 'critical';

type Tenant = {
  id: string;
  name: string;
  legalName?: string | null;
  tinNumber?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  status: TenantStatus;
  commercialTier: CommercialTier;
  discountPercent: number;
  messagePriority: MessagePriority;
  subscriptionPlanId?: string | null;
  smsQuota: number;
  smsUsed: number;
  subscriptionStartDate?: string | null;
  subscriptionEndDate?: string | null;
  subscriptionStatus: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

type SubscriptionPlan = {
  id: string;
  name: string;
  smsQuota: number;
  durationDays: number;
  price: number;
  status: 'active' | 'inactive';
  description?: string | null;
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

export default function TenantsPage() {
  const searchParams = useSearchParams();
  const highlightedCompanyId = searchParams.get('companyId');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [tinNumber, setTinNumber] = useState('');
  const [commercialTier, setCommercialTier] =
    useState<CommercialTier>('standard');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [messagePriority, setMessagePriority] =
    useState<MessagePriority>('normal');
  const [smsQuota, setSmsQuota] = useState(1000);
  const [notes, setNotes] = useState('');

  const [adminModalTenant, setAdminModalTenant] = useState<Tenant | null>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  const totalCompanies = tenants.length;

  const activeCompanies = tenants.filter(
    (tenant) => tenant.status === 'active',
  ).length;

  const vipCompanies = tenants.filter(
    (tenant) =>
      tenant.commercialTier === 'vip' ||
      tenant.commercialTier === 'enterprise',
  ).length;

  const totalQuota = useMemo(
    () => tenants.reduce((sum, tenant) => sum + tenant.smsQuota, 0),
    [tenants],
  );

  const totalUsed = useMemo(
    () => tenants.reduce((sum, tenant) => sum + tenant.smsUsed, 0),
    [tenants],
  );

  async function loadTenants() {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    try {
      setError('');

      const [tenantData, planData] = await Promise.all([
        apiFetch<Tenant[]>('/tenants', undefined, token),
        apiFetch<SubscriptionPlan[]>(
          '/subscription-plans/active',
          undefined,
          token,
        ),
      ]);

      setTenants(tenantData);
      setPlans(planData);
    } catch (error) {
      console.error('Failed to load companies', error);
      setError(getErrorMessage(error));
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    loadTenants();
  }, []);

  useEffect(() => {
    if (pageLoading || !highlightedCompanyId) return;

    const timeout = window.setTimeout(() => {
      const element = document.getElementById(`company-${highlightedCompanyId}`);

      if (element) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    }, 100);

    return () => window.clearTimeout(timeout);
  }, [pageLoading, highlightedCompanyId]);

  function resetForm() {
    setName('');
    setLegalName('');
    setContactEmail('');
    setContactPhone('');
    setTinNumber('');
    setCommercialTier('standard');
    setDiscountPercent(0);
    setMessagePriority('normal');
    setSmsQuota(1000);
    setNotes('');
  }

  async function handleCreateTenant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    if (!name.trim()) {
      toast.error('Company name is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await apiFetch(
        '/tenants',
        {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            legalName: legalName.trim() || undefined,
            contactEmail: contactEmail.trim() || undefined,
            contactPhone: contactPhone.trim() || undefined,
            tinNumber: tinNumber.trim() || undefined,
            commercialTier,
            discountPercent: Number(discountPercent),
            messagePriority,
            smsQuota: Number(smsQuota),
            notes: notes.trim() || undefined,
          }),
        },
        token,
      );

      resetForm();
      toast.success('Company created successfully');
      await loadTenants();
    } catch (error) {
      console.error('Failed to create company', error);
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function updateTenant(
    tenantId: string,
    payload: Partial<
      Pick<
        Tenant,
        | 'status'
        | 'commercialTier'
        | 'discountPercent'
        | 'messagePriority'
        | 'notes'
      >
    >,
  ) {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    setActionLoadingId(tenantId);

    try {
      await apiFetch(
        `/tenants/${tenantId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
        token,
      );

      toast.success('Company updated');
      await loadTenants();
    } catch (error) {
      console.error('Failed to update company', error);
      toast.error(getErrorMessage(error));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function addQuota(tenantId: string, amount: number) {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    if (!amount || amount <= 0) {
      toast.error('Quota amount must be greater than zero');
      return;
    }

    setActionLoadingId(tenantId);

    try {
      await apiFetch(
        `/tenants/${tenantId}/quota/add`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            amount,
            reason: 'Manual quota allocation',
          }),
        },
        token,
      );

      toast.success(`Added ${amount} SMS quota`);
      await loadTenants();
    } catch (error) {
      console.error('Failed to add quota', error);
      toast.error(getErrorMessage(error));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function assignPlan(tenantId: string, planId: string) {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    if (!planId) {
      toast.error('Please select a subscription plan');
      return;
    }

    setActionLoadingId(tenantId);

    try {
      await apiFetch(
        `/tenants/${tenantId}/subscribe`,
        {
          method: 'PATCH',
          body: JSON.stringify({ planId }),
        },
        token,
      );

      toast.success('Subscription plan assigned');
      await loadTenants();
    } catch (error) {
      console.error('Failed to assign subscription plan', error);
      toast.error(getErrorMessage(error));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function createCompanyAdmin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    if (!adminModalTenant) {
      toast.error('Company is required');
      return;
    }

    if (!adminEmail.trim() || !adminPassword.trim()) {
      toast.error('Email and password are required');
      return;
    }

    if (adminPassword.trim().length < 8) {
      toast.error('Temporary password must be at least 8 characters');
      return;
    }

    setCreatingAdmin(true);

    try {
      await apiFetch(
        '/users',
        {
          method: 'POST',
          body: JSON.stringify({
            tenantId: adminModalTenant.id,
            email: adminEmail.trim(),
            password: adminPassword.trim(),
            role: 'admin',
          }),
        },
        token,
      );

      toast.success('Company admin created');

      setAdminModalTenant(null);
      setAdminEmail('');
      setAdminPassword('');
    } catch (error) {
      console.error('Failed to create company admin', error);
      toast.error(getErrorMessage(error));
    } finally {
      setCreatingAdmin(false);
    }
  }

  return (
    <div className={ui.page}>
      {error ? <div className={ui.alertError}>{error}</div> : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Companies" value={totalCompanies} />
        <StatCard label="Active" value={activeCompanies} />
        <StatCard label="VIP / Enterprise" value={vipCompanies} />
        <StatCard label="Quota Used" value={`${totalUsed}/${totalQuota}`} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 to-slate-800 px-4 py-5 text-white sm:px-6">
          <h2 className="text-2xl font-bold">Create Company</h2>
          <p className="mt-1 text-sm leading-6 text-slate-300">
            Add a company tenant with subscription quota, commercial tier, and
            message priority.
          </p>
        </div>

        <div className="p-4 sm:p-6">
          <form onSubmit={handleCreateTenant} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Company Name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={ui.input}
                  placeholder="Company name"
                />
              </Field>

              <Field label="Legal Name">
                <input
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  className={ui.input}
                  placeholder="Legal company name"
                />
              </Field>

              <Field label="Contact Email">
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className={ui.input}
                  placeholder="company@example.com"
                />
              </Field>

              <Field label="Contact Phone">
                <input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className={ui.input}
                  placeholder="2519XXXXXXXX"
                />
              </Field>

              <Field label="TIN Number">
                <input
                  value={tinNumber}
                  onChange={(e) => setTinNumber(e.target.value)}
                  className={ui.input}
                  placeholder="Optional"
                />
              </Field>

              <Field label="Initial SMS Quota">
                <input
                  type="number"
                  min={0}
                  value={smsQuota}
                  onChange={(e) => setSmsQuota(Number(e.target.value))}
                  className={ui.input}
                />
              </Field>

              <Field label="Commercial Tier">
                <select
                  value={commercialTier}
                  onChange={(e) =>
                    setCommercialTier(e.target.value as CommercialTier)
                  }
                  className={ui.select}
                >
                  <option value="standard">Standard</option>
                  <option value="vip">VIP</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </Field>

              <Field label="Discount Percent">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(Number(e.target.value))}
                  className={ui.input}
                />
              </Field>

              <Field label="Message Priority">
                <select
                  value={messagePriority}
                  onChange={(e) =>
                    setMessagePriority(e.target.value as MessagePriority)
                  }
                  className={ui.select}
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </Field>
            </div>

            <Field label="Notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={ui.textarea}
                placeholder="Internal notes about pricing, VIP handling, or account setup"
              />
            </Field>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={saving}
                className={`${ui.primaryButton} w-full justify-center sm:w-auto`}
              >
                {saving ? 'Creating...' : 'Create Company'}
              </button>

              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className={`${ui.secondaryButton} w-full justify-center sm:w-auto`}
              >
                Clear
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-5 sm:px-6">
          <h2 className={ui.sectionTitle}>Companies</h2>
          <p className={ui.sectionSubtitle}>
            Manage tenant status, VIP tier, quota, discount, subscription plan,
            admins, and queue priority.
          </p>
        </div>

        <div className="p-4 sm:p-6">
          {pageLoading ? (
            <div className="space-y-3">
              <div className="h-36 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-36 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-36 animate-pulse rounded-2xl bg-slate-100" />
            </div>
          ) : tenants.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-500">
              No companies found.
            </div>
          ) : (
            <div className="space-y-4">
              {tenants.map((tenant) => (
                <TenantCard
                  key={tenant.id}
                  tenant={tenant}
                  plans={plans}
                  loading={actionLoadingId === tenant.id}
                  highlighted={tenant.id === highlightedCompanyId}
                  onUpdate={updateTenant}
                  onAddQuota={addQuota}
                  onAssignPlan={assignPlan}
                  onCreateAdmin={(selectedTenant) => {
                    setAdminModalTenant(selectedTenant);
                    setAdminEmail('');
                    setAdminPassword('');
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {adminModalTenant ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900">
              Create Company Admin
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Create an admin account for{' '}
              <span className="font-bold text-slate-900">
                {adminModalTenant.name}
              </span>
              .
            </p>

            <form onSubmit={createCompanyAdmin} className="mt-6 space-y-4">
              <Field label="Admin Email">
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className={ui.input}
                  placeholder="admin@company.com"
                />
              </Field>

              <Field label="Temporary Password">
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className={ui.input}
                  placeholder="At least 8 characters"
                />
              </Field>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setAdminModalTenant(null);
                    setAdminEmail('');
                    setAdminPassword('');
                  }}
                  disabled={creatingAdmin}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={creatingAdmin}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {creatingAdmin ? 'Creating...' : 'Create Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
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
    <div className="space-y-1.5">
      <label className={ui.label}>{label}</label>
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string | number; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 break-words text-2xl font-black text-slate-950">
        {value}
      </p>
    </div>
  );
}

function TenantCard({
  tenant,
  plans,
  loading,
  highlighted,
  onUpdate,
  onAddQuota,
  onAssignPlan,
  onCreateAdmin,
}: {
  tenant: Tenant;
  plans: SubscriptionPlan[];
  loading: boolean;
  highlighted: boolean,
  onUpdate: (
    tenantId: string,
    payload: Partial<
      Pick<
        Tenant,
        | 'status'
        | 'commercialTier'
        | 'discountPercent'
        | 'messagePriority'
        | 'notes'
      >
    >,
  ) => Promise<void>;
  onAddQuota: (tenantId: string, amount: number) => Promise<void>;
  onAssignPlan: (tenantId: string, planId: string) => Promise<void>;
  onCreateAdmin: (tenant: Tenant) => void;
}) {
  const [status, setStatus] = useState<TenantStatus>(tenant.status);
  const [commercialTier, setCommercialTier] = useState<CommercialTier>(
    tenant.commercialTier,
  );
  const [discountPercent, setDiscountPercent] = useState(
    tenant.discountPercent,
  );
  const [messagePriority, setMessagePriority] = useState<MessagePriority>(
    tenant.messagePriority,
  );
  const [quotaAmount, setQuotaAmount] = useState(1000);
  const [selectedPlanId, setSelectedPlanId] = useState(
    tenant.subscriptionPlanId ?? '',
  );

  const currentPlan = plans.find(
    (plan) => plan.id === tenant.subscriptionPlanId,
  );

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);

  const remainingSms = Math.max(0, tenant.smsQuota - tenant.smsUsed);

  const usagePercent =
    tenant.smsQuota > 0
      ? Number(((tenant.smsUsed / tenant.smsQuota) * 100).toFixed(1))
      : 0;

  return (
    <div
      id={`company-${tenant.id}`}
      className={`scroll-mt-24 rounded-2xl border bg-white p-4 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 ${
        highlighted
          ? 'border-blue-300 ring-4 ring-blue-100'
          : 'border-slate-200'
      }`}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-lg font-black text-slate-900">
              {tenant.name}
            </h3>

            <Badge label={tenant.status} tone={tenant.status} />
            <Badge label={tenant.commercialTier} tone={tenant.commercialTier} />
            <Badge
              label={tenant.messagePriority}
              tone={tenant.messagePriority}
            />
          </div>

          <p className="mt-1 break-words text-sm text-slate-500">
            {tenant.legalName || 'No legal name set'}
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
            <Info label="Quota" value={`${tenant.smsUsed}/${tenant.smsQuota}`} />
            <Info label="Remaining" value={remainingSms} />
            <Info label="Usage" value={`${usagePercent}%`} />
            <Info label="Discount" value={`${tenant.discountPercent}%`} />
            <Info label="Plan" value={currentPlan?.name || 'No plan assigned'} />
            <Info
              label="Subscription"
              value={
                tenant.subscriptionEndDate
                  ? `Ends ${new Date(
                      tenant.subscriptionEndDate,
                    ).toLocaleDateString()}`
                  : 'No end date'
              }
            />
            <Info label="Contact Email" value={tenant.contactEmail || 'N/A'} />
            <Info label="Contact Phone" value={tenant.contactPhone || 'N/A'} />
          </div>

          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>

          {tenant.notes ? (
            <p className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-600">
              {tenant.notes}
            </p>
          ) : null}
        </div>

        <div className="w-full shrink-0 space-y-3 xl:w-[380px]">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TenantStatus)}
                className={ui.select}
              >
                <option value="trial">Trial</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="expired">Expired</option>
              </select>
            </Field>

            <Field label="Tier">
              <select
                value={commercialTier}
                onChange={(e) =>
                  setCommercialTier(e.target.value as CommercialTier)
                }
                className={ui.select}
              >
                <option value="standard">Standard</option>
                <option value="vip">VIP</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </Field>

            <Field label="Discount %">
              <input
                type="number"
                min={0}
                max={100}
                value={discountPercent}
                onChange={(e) => setDiscountPercent(Number(e.target.value))}
                className={ui.input}
              />
            </Field>

            <Field label="Priority">
              <select
                value={messagePriority}
                onChange={(e) =>
                  setMessagePriority(e.target.value as MessagePriority)
                }
                className={ui.select}
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </Field>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() =>
              onUpdate(tenant.id, {
                status,
                commercialTier,
                discountPercent: Number(discountPercent),
                messagePriority,
              })
            }
            className={`${ui.primaryButton} w-full justify-center`}
          >
            {loading ? 'Saving...' : 'Save Company Settings'}
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => onCreateAdmin(tenant)}
            className={`${ui.secondaryButton} w-full justify-center`}
          >
            Create Admin
          </button>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
            <Field label="Assign Subscription Plan">
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  className={ui.select}
                >
                  <option value="">Select plan</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} - {plan.smsQuota} SMS / {plan.durationDays}{' '}
                      days
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={loading || !selectedPlanId}
                  onClick={() => onAssignPlan(tenant.id, selectedPlanId)}
                  className={`${ui.primaryButton} shrink-0 justify-center`}
                >
                  Assign
                </button>
              </div>
            </Field>

            {selectedPlan ? (
              <p className="mt-2 text-xs leading-5 text-slate-600">
                Selected: {selectedPlan.name}, {selectedPlan.smsQuota} SMS for{' '}
                {selectedPlan.durationDays} days. Assigning a plan resets usage
                for the new billing cycle and creates a quota allocation ledger
                row.
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <Field label="Add SMS Quota">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="number"
                  min={1}
                  value={quotaAmount}
                  onChange={(e) => setQuotaAmount(Number(e.target.value))}
                  className={ui.input}
                />
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => onAddQuota(tenant.id, Number(quotaAmount))}
                  className={`${ui.secondaryButton} shrink-0 justify-center`}
                >
                  Add
                </button>
              </div>
            </Field>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 break-words font-bold text-slate-900">{value}</p>
    </div>
  );
}

function Badge({ label, tone }: { label: string; tone: string }) {
  const classes =
    tone === 'active'
      ? 'bg-green-50 text-green-700 border-green-100'
      : tone === 'suspended' || tone === 'expired'
        ? 'bg-red-50 text-red-700 border-red-100'
        : tone === 'vip'
          ? 'bg-purple-50 text-purple-700 border-purple-100'
          : tone === 'enterprise'
            ? 'bg-slate-900 text-white border-slate-900'
            : tone === 'critical'
              ? 'bg-red-50 text-red-700 border-red-100'
              : tone === 'high'
                ? 'bg-yellow-50 text-yellow-700 border-yellow-100'
                : 'bg-slate-50 text-slate-700 border-slate-100';

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${classes}`}
    >
      {label.replace('_', ' ')}
    </span>
  );
}