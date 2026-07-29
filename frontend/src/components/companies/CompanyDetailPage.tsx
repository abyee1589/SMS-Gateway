'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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

type QuotaTransaction = {
  id: string;
  tenantId: string;
  amount: number;
  type?: string | null;
  reason?: string | null;
  createdAt: string;
  createdByUserId?: string | null;
};

type Tab = 'overview' | 'billing' | 'subscription' | 'admins' | 'settings' | 'history';

function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;

    if (Array.isArray(message)) return message[0] ?? 'Request failed';
    if (typeof message === 'string') return message;
  }

  if (error instanceof Error) return error.message;

  return 'Request failed';
}

function formatNumber(value: number | string | null | undefined) {
  const numberValue = Number(value ?? 0);

  if (Number.isNaN(numberValue)) return '0';

  return new Intl.NumberFormat('en-US').format(numberValue);
}

function formatDate(value?: string | null) {
  if (!value) return 'N/A';

  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getUsagePercent(tenant: Tenant) {
  return tenant.smsQuota > 0
    ? Number(((tenant.smsUsed / tenant.smsQuota) * 100).toFixed(1))
    : 0;
}

function getRemainingSms(tenant: Tenant) {
  return Math.max(0, tenant.smsQuota - tenant.smsUsed);
}

export default function CompanyDetailPage({ companyId }: { companyId: string }) {
  const router = useRouter();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [transactions, setTransactions] = useState<QuotaTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [tinNumber, setTinNumber] = useState('');
  const [status, setStatus] = useState<TenantStatus>('trial');
  const [commercialTier, setCommercialTier] =
    useState<CommercialTier>('standard');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [messagePriority, setMessagePriority] =
    useState<MessagePriority>('normal');
  const [notes, setNotes] = useState('');

  const [quotaAmount, setQuotaAmount] = useState(1000);
  const [quotaReason, setQuotaReason] = useState('Manual quota allocation');
  const [selectedPlanId, setSelectedPlanId] = useState('');

  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  const remainingSms = tenant ? getRemainingSms(tenant) : 0;
  const usagePercent = tenant ? getUsagePercent(tenant) : 0;

  const currentPlan = useMemo(
    () => plans.find((plan) => plan.id === tenant?.subscriptionPlanId),
    [plans, tenant?.subscriptionPlanId],
  );

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId),
    [plans, selectedPlanId],
  );

  async function loadCompany() {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    try {
      setError('');

      const [tenantList, planData] = await Promise.all([
        apiFetch<Tenant[]>('/tenants', undefined, token),
        apiFetch<SubscriptionPlan[]>('/subscription-plans/active', undefined, token),
      ]);

      const selectedTenant = tenantList.find((item) => item.id === companyId);

      if (!selectedTenant) {
        setError('Company not found');
        setTenant(null);
        return;
      }

      setTenant(selectedTenant);
      setPlans(planData);
      syncForm(selectedTenant);
    } catch (error) {
      console.error('Failed to load company', error);
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadTransactions() {
    const token = getToken();

    if (!token) return;

    try {
      setHistoryLoading(true);
      const data = await apiFetch<QuotaTransaction[]>(
        `/tenants/${companyId}/quota-transactions`,
        undefined,
        token,
      );
      setTransactions(data);
    } catch (error) {
      console.warn('Failed to load company quota transactions', error);
      setTransactions([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    loadCompany();
  }, [companyId]);

  useEffect(() => {
    loadTransactions();
  }, [companyId]);

  function syncForm(selectedTenant: Tenant) {
    setName(selectedTenant.name ?? '');
    setLegalName(selectedTenant.legalName ?? '');
    setContactEmail(selectedTenant.contactEmail ?? '');
    setContactPhone(selectedTenant.contactPhone ?? '');
    setTinNumber(selectedTenant.tinNumber ?? '');
    setStatus(selectedTenant.status);
    setCommercialTier(selectedTenant.commercialTier);
    setDiscountPercent(selectedTenant.discountPercent ?? 0);
    setMessagePriority(selectedTenant.messagePriority);
    setNotes(selectedTenant.notes ?? '');
    setSelectedPlanId(selectedTenant.subscriptionPlanId ?? '');
  }

  async function saveCompanySettings(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();

    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    if (!tenant) return;

    if (!name.trim()) {
      toast.error('Company name is required');
      return;
    }

    if (Number(discountPercent) < 0 || Number(discountPercent) > 100) {
      toast.error('Discount percent must be between 0 and 100');
      return;
    }

    setSaving(true);

    try {
      await apiFetch(
        `/tenants/${tenant.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: name.trim(),
            legalName: legalName.trim() || null,
            contactEmail: contactEmail.trim() || null,
            contactPhone: contactPhone.trim() || null,
            tinNumber: tinNumber.trim() || null,
            status,
            commercialTier,
            discountPercent: Number(discountPercent),
            messagePriority,
            notes: notes.trim() || null,
          }),
        },
        token,
      );

      toast.success('Company settings saved');
      await loadCompany();
    } catch (error) {
      console.error('Failed to save company settings', error);
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function addQuota(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    if (!tenant) return;

    if (!quotaAmount || quotaAmount <= 0) {
      toast.error('Quota amount must be greater than zero');
      return;
    }

    setActionLoading(true);

    try {
      await apiFetch(
        `/tenants/${tenant.id}/quota/add`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            amount: Number(quotaAmount),
            reason: quotaReason.trim() || 'Manual quota allocation',
          }),
        },
        token,
      );

      toast.success(`Added ${formatNumber(quotaAmount)} SMS quota`);
      await Promise.all([loadCompany(), loadTransactions()]);
    } catch (error) {
      console.error('Failed to add quota', error);
      toast.error(getErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  }

  async function assignPlan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    if (!tenant) return;

    if (!selectedPlanId) {
      toast.error('Please select a subscription plan');
      return;
    }

    setActionLoading(true);

    try {
      await apiFetch(
        `/tenants/${tenant.id}/subscribe`,
        {
          method: 'PATCH',
          body: JSON.stringify({ planId: selectedPlanId }),
        },
        token,
      );

      toast.success('Subscription plan assigned');
      await Promise.all([loadCompany(), loadTransactions()]);
    } catch (error) {
      console.error('Failed to assign subscription plan', error);
      toast.error(getErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  }

  async function createCompanyAdmin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    if (!tenant) return;

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
            tenantId: tenant.id,
            email: adminEmail.trim(),
            password: adminPassword.trim(),
            role: 'admin',
          }),
        },
        token,
      );

      toast.success('Company admin created');
      setAdminEmail('');
      setAdminPassword('');
    } catch (error) {
      console.error('Failed to create company admin', error);
      toast.error(getErrorMessage(error));
    } finally {
      setCreatingAdmin(false);
    }
  }

  if (loading) {
    return (
      <div className={ui.page}>
        <div className="h-32 animate-pulse rounded-3xl bg-slate-100" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
        </div>
        <div className="h-96 animate-pulse rounded-3xl bg-slate-100" />
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className={ui.page}>
        <button
          type="button"
          onClick={() => router.push('/tenants')}
          className={ui.secondaryButton}
        >
          Back to Companies
        </button>
        <div className={ui.alertError}>{error || 'Company not found'}</div>
      </div>
    );
  }

  return (
    <div className={ui.page}>
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-slate-950 to-slate-800 px-4 py-6 text-white sm:px-6">
          <button
            type="button"
            onClick={() => router.push(`/tenants?companyId=${tenant.id}`)}
            className="mb-5 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/20"
          >
            ← Back to Companies
          </button>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black sm:text-3xl">
                  {tenant.name}
                </h1>
                <Badge label={tenant.status} tone={tenant.status} />
                <Badge label={tenant.commercialTier} tone={tenant.commercialTier} />
                <Badge label={tenant.messagePriority} tone={tenant.messagePriority} />
              </div>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                Manage company profile, subscription plan, SMS quota, admins,
                and credit history from one dedicated company page.
              </p>
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={() => saveCompanySettings()}
              className="rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-slate-100 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 p-4 sm:p-6 md:grid-cols-4">
          <MetricCard
            label="SMS Used"
            value={formatNumber(tenant.smsUsed)}
            subValue={`${usagePercent}% of quota`}
          />
          <MetricCard label="SMS Quota" value={formatNumber(tenant.smsQuota)} />
          <MetricCard label="Remaining" value={formatNumber(remainingSms)} />
          <MetricCard
            label="Current Plan"
            value={currentPlan?.name || 'No plan'}
            subValue={tenant.subscriptionStatus || undefined}
          />
        </div>

        <div className="px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${
                usagePercent >= 95
                  ? 'bg-red-500'
                  : usagePercent >= 75
                    ? 'bg-yellow-500'
                    : 'bg-blue-600'
              }`}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex min-w-max gap-2">
          {([
            ['overview', 'Overview'],
            ['billing', 'Billing & Quota'],
            ['subscription', 'Subscription'],
            ['admins', 'Admins'],
            ['settings', 'Settings'],
            ['history', 'Credit History'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                activeTab === key
                  ? 'bg-slate-950 text-white'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' ? (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Company Profile" subtitle="Core identity and contact information.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Info label="Company Name" value={tenant.name} />
              <Info label="Legal Name" value={tenant.legalName || 'N/A'} />
              <Info label="Contact Email" value={tenant.contactEmail || 'N/A'} />
              <Info label="Contact Phone" value={tenant.contactPhone || 'N/A'} />
              <Info label="TIN Number" value={tenant.tinNumber || 'N/A'} />
              <Info label="Created" value={formatDate(tenant.createdAt)} />
            </div>
          </Card>

          <Card title="Account Status" subtitle="Commercial and operational account state.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Info label="Status" value={tenant.status} />
              <Info label="Tier" value={tenant.commercialTier} />
              <Info label="Message Priority" value={tenant.messagePriority} />
              <Info label="Discount" value={`${tenant.discountPercent}%`} />
              <Info
                label="Subscription Start"
                value={formatDate(tenant.subscriptionStartDate)}
              />
              <Info
                label="Subscription End"
                value={formatDate(tenant.subscriptionEndDate)}
              />
            </div>
          </Card>
        </section>
      ) : null}

      {activeTab === 'billing' ? (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Add SMS Credit" subtitle="Increase this company's available SMS quota.">
            <form onSubmit={addQuota} className="space-y-4">
              <Field label="Amount">
                <input
                  type="number"
                  min={1}
                  value={quotaAmount}
                  onChange={(e) => setQuotaAmount(Number(e.target.value))}
                  className={ui.input}
                />
              </Field>

              <Field label="Reason">
                <input
                  value={quotaReason}
                  onChange={(e) => setQuotaReason(e.target.value)}
                  className={ui.input}
                  placeholder="Manual quota allocation"
                />
              </Field>

              <button
                type="submit"
                disabled={actionLoading}
                className={`${ui.primaryButton} w-full justify-center`}
              >
                {actionLoading ? 'Adding...' : 'Add SMS Credit'}
              </button>
            </form>
          </Card>

          <Card title="Current Credit Position" subtitle="Current billing cycle quota balance.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Info label="Quota" value={formatNumber(tenant.smsQuota)} />
              <Info label="Used" value={formatNumber(tenant.smsUsed)} />
              <Info label="Remaining" value={formatNumber(remainingSms)} />
              <Info label="Usage" value={`${usagePercent}%`} />
            </div>
          </Card>
        </section>
      ) : null}

      {activeTab === 'subscription' ? (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Assign Subscription Plan" subtitle="Apply a new active plan to this company.">
            <form onSubmit={assignPlan} className="space-y-4">
              <Field label="Subscription Plan">
                <select
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  className={ui.select}
                >
                  <option value="">Select plan</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} - {formatNumber(plan.smsQuota)} SMS /{' '}
                      {plan.durationDays} days
                    </option>
                  ))}
                </select>
              </Field>

              {selectedPlan ? (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-slate-700">
                  <p className="font-black text-slate-900">
                    {selectedPlan.name}
                  </p>
                  <p className="mt-1">
                    {formatNumber(selectedPlan.smsQuota)} SMS for{' '}
                    {selectedPlan.durationDays} days.
                  </p>
                  <p className="mt-1">
                    Assigning a plan resets usage for the new billing cycle and
                    creates a quota allocation ledger row.
                  </p>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={actionLoading || !selectedPlanId}
                className={`${ui.primaryButton} w-full justify-center`}
              >
                {actionLoading ? 'Assigning...' : 'Assign Plan'}
              </button>
            </form>
          </Card>

          <Card title="Current Subscription" subtitle="Current plan and renewal dates.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Info label="Plan" value={currentPlan?.name || 'No plan assigned'} />
              <Info label="Status" value={tenant.subscriptionStatus || 'N/A'} />
              <Info label="Start Date" value={formatDate(tenant.subscriptionStartDate)} />
              <Info label="End Date" value={formatDate(tenant.subscriptionEndDate)} />
            </div>
          </Card>
        </section>
      ) : null}

      {activeTab === 'admins' ? (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Create Company Admin" subtitle="Create an admin user under this company.">
            <form onSubmit={createCompanyAdmin} className="space-y-4">
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

              <button
                type="submit"
                disabled={creatingAdmin}
                className={`${ui.primaryButton} w-full justify-center`}
              >
                {creatingAdmin ? 'Creating...' : 'Create Admin'}
              </button>
            </form>
          </Card>

          <Card title="Admin Management Note" subtitle="Recommended production workflow.">
            <p className="text-sm leading-6 text-slate-600">
              This creates an admin account immediately. Later, you can replace
              this with an invitation email or password reset flow for stronger
              production security.
            </p>
          </Card>
        </section>
      ) : null}

      {activeTab === 'settings' ? (
        <form onSubmit={saveCompanySettings} className="space-y-4">
          <Card title="Company Settings" subtitle="Edit account status, profile, tier, discount, priority, and notes.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Company Name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={ui.input}
                />
              </Field>

              <Field label="Legal Name">
                <input
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  className={ui.input}
                />
              </Field>

              <Field label="Contact Email">
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className={ui.input}
                />
              </Field>

              <Field label="Contact Phone">
                <input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className={ui.input}
                />
              </Field>

              <Field label="TIN Number">
                <input
                  value={tinNumber}
                  onChange={(e) => setTinNumber(e.target.value)}
                  className={ui.input}
                />
              </Field>

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

            <div className="mt-4">
              <Field label="Notes">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={ui.textarea}
                  placeholder="Internal notes about pricing, VIP handling, or account setup"
                />
              </Field>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className={`${ui.primaryButton} justify-center`}
              >
                {saving ? 'Saving...' : 'Save Company Settings'}
              </button>
            </div>
          </Card>
        </form>
      ) : null}

      {activeTab === 'history' ? (
        <Card title="SMS Credit History" subtitle="Quota allocations, deductions, and credit adjustments.">
          {historyLoading ? (
            <div className="space-y-3">
              <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-500">
              No SMS credit history found for this company.
            </div>
          ) : (
            <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
              {transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-black text-slate-900">
                        {transaction.reason || transaction.type || 'Credit update'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(transaction.createdAt)}
                      </p>
                    </div>

                    <p
                      className={`text-lg font-black ${
                        Number(transaction.amount) >= 0
                          ? 'text-green-700'
                          : 'text-red-700'
                      }`}
                    >
                      {Number(transaction.amount) >= 0 ? '+' : ''}
                      {formatNumber(transaction.amount)} SMS
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
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

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-5">
        <h2 className={ui.sectionTitle}>{title}</h2>
        {subtitle ? <p className={ui.sectionSubtitle}>{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  subValue,
}: {
  label: string;
  value: string;
  subValue?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 break-words text-2xl font-black text-slate-950">
        {value}
      </p>
      {subValue ? (
        <p className="mt-1 text-xs font-semibold text-slate-500">{subValue}</p>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 break-words font-bold text-slate-900">
        {value}
      </p>
    </div>
  );
}

function Badge({ label, tone }: { label: string; tone: string }) {
  const classes =
    tone === 'active'
      ? 'border-green-100 bg-green-50 text-green-700'
      : tone === 'suspended' || tone === 'expired'
        ? 'border-red-100 bg-red-50 text-red-700'
        : tone === 'vip'
          ? 'border-purple-100 bg-purple-50 text-purple-700'
          : tone === 'enterprise'
            ? 'border-white/20 bg-white text-slate-950'
            : tone === 'critical'
              ? 'border-red-100 bg-red-50 text-red-700'
              : tone === 'high'
                ? 'border-yellow-100 bg-yellow-50 text-yellow-700'
                : 'border-slate-100 bg-slate-50 text-slate-700';

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${classes}`}
    >
      {label.replace('_', ' ')}
    </span>
  );
}
