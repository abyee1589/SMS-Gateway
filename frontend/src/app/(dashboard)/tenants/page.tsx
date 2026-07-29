'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

function getUsagePercent(tenant: Tenant) {
  return tenant.smsQuota > 0
    ? Number(((tenant.smsUsed / tenant.smsQuota) * 100).toFixed(1))
    : 0;
}

function getRemainingSms(tenant: Tenant) {
  return Math.max(0, tenant.smsQuota - tenant.smsUsed);
}

export default function CompaniesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightedCompanyId = searchParams.get('companyId');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TenantStatus>('all');
  const [tierFilter, setTierFilter] = useState<'all' | CommercialTier>('all');

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

  const totalCompanies = tenants.length;

  const activeCompanies = useMemo(
    () => tenants.filter((tenant) => tenant.status === 'active').length,
    [tenants],
  );

  const suspendedCompanies = useMemo(
    () => tenants.filter((tenant) => tenant.status === 'suspended').length,
    [tenants],
  );

  const totalQuota = useMemo(
    () => tenants.reduce((sum, tenant) => sum + tenant.smsQuota, 0),
    [tenants],
  );

  const totalUsed = useMemo(
    () => tenants.reduce((sum, tenant) => sum + tenant.smsUsed, 0),
    [tenants],
  );

  const totalRemaining = Math.max(0, totalQuota - totalUsed);

  const filteredTenants = useMemo(() => {
    const query = search.trim().toLowerCase();

    return tenants.filter((tenant) => {
      const matchesSearch = !query
        ? true
        : [
            tenant.name,
            tenant.legalName,
            tenant.contactEmail,
            tenant.contactPhone,
            tenant.tinNumber,
            tenant.status,
            tenant.commercialTier,
            tenant.messagePriority,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query));

      const matchesStatus =
        statusFilter === 'all' ? true : tenant.status === statusFilter;

      const matchesTier =
        tierFilter === 'all' ? true : tenant.commercialTier === tierFilter;

      return matchesSearch && matchesStatus && matchesTier;
    });
  }, [search, statusFilter, tierFilter, tenants]);

  async function loadTenants() {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    try {
      setError('');
      const tenantData = await apiFetch<Tenant[]>('/tenants', undefined, token);
      setTenants(tenantData);
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
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

    if (Number(smsQuota) < 0) {
      toast.error('Initial SMS quota cannot be negative');
      return;
    }

    if (Number(discountPercent) < 0 || Number(discountPercent) > 100) {
      toast.error('Discount percent must be between 0 and 100');
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
      setShowCreateForm(false);
      toast.success('Company created successfully');
      await loadTenants();
    } catch (error) {
      console.error('Failed to create company', error);
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function openCompany(tenantId: string) {
    router.push(`/tenants/${tenantId}`);
  }

  return (
    <div className={ui.page}>
      {error ? <div className={ui.alertError}>{error}</div> : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">
            Companies
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Browse companies, review quota status, and open a dedicated company
            page to manage subscription plans, credit, admins, and settings.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateForm((current) => !current)}
          className={`${ui.primaryButton} justify-center`}
        >
          {showCreateForm ? 'Close Create Form' : '+ Create Company'}
        </button>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Companies" value={formatNumber(totalCompanies)} />
        <StatCard label="Active" value={formatNumber(activeCompanies)} />
        <StatCard label="Suspended" value={formatNumber(suspendedCompanies)} />
        <StatCard label="Remaining SMS" value={formatNumber(totalRemaining)} />
      </section>

      {showCreateForm ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 to-slate-800 px-4 py-5 text-white sm:px-6">
            <h2 className="text-2xl font-bold">Create Company</h2>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              Add a company tenant with initial quota, commercial tier, and
              queue priority.
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
                    onChange={(e) =>
                      setDiscountPercent(Number(e.target.value))
                    }
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
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className={ui.sectionTitle}>Existing Companies</h2>
              <p className={ui.sectionSubtitle}>
                Search and open a company to manage detailed settings.
              </p>
            </div>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
              {formatNumber(filteredTenants.length)} shown
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={ui.input}
              placeholder="Search company, email, phone, TIN, status..."
            />

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as 'all' | TenantStatus)
              }
              className={ui.select}
            >
              <option value="all">All statuses</option>
              <option value="trial">Trial</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="expired">Expired</option>
            </select>

            <select
              value={tierFilter}
              onChange={(event) =>
                setTierFilter(event.target.value as 'all' | CommercialTier)
              }
              className={ui.select}
            >
              <option value="all">All tiers</option>
              <option value="standard">Standard</option>
              <option value="vip">VIP</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {pageLoading ? (
            <div className="space-y-3">
              <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
            </div>
          ) : tenants.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-500">
              No companies found.
            </div>
          ) : filteredTenants.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-500">
              No companies match your filters.
            </div>
          ) : (
            <div className="max-h-[900px] space-y-3 overflow-y-auto pr-1">
              {filteredTenants.map((tenant) => (
                <CompanyListRow
                  key={tenant.id}
                  tenant={tenant}
                  highlighted={tenant.id === highlightedCompanyId}
                  onManage={() => openCompany(tenant.id)}
                />
              ))}
            </div>
          )}
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
    <div className="space-y-1.5">
      <label className={ui.label}>{label}</label>
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
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

function CompanyListRow({
  tenant,
  highlighted,
  onManage,
}: {
  tenant: Tenant;
  highlighted: boolean;
  onManage: () => void;
}) {
  const remainingSms = getRemainingSms(tenant);
  const usagePercent = getUsagePercent(tenant);

  return (
    <button
      id={`company-${tenant.id}`}
      type="button"
      onClick={onManage}
      className={`group w-full scroll-mt-24 rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/30 hover:shadow-md ${
        highlighted ? 'border-blue-300 ring-4 ring-blue-100' : 'border-slate-200'
      }`}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-base font-black text-slate-900">
              {tenant.name}
            </h3>

            <Badge label={tenant.status} tone={tenant.status} />
            <Badge label={tenant.commercialTier} tone={tenant.commercialTier} />
            <Badge label={tenant.messagePriority} tone={tenant.messagePriority} />
          </div>

          <p className="mt-1 break-words text-sm text-slate-500">
            {tenant.legalName || tenant.contactEmail || 'No legal name set'}
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-4">
            <SummaryItem
              label="Used / Quota"
              value={`${formatNumber(tenant.smsUsed)} / ${formatNumber(
                tenant.smsQuota,
              )}`}
            />
            <SummaryItem label="Remaining" value={formatNumber(remainingSms)} />
            <SummaryItem label="Usage" value={`${usagePercent}%`} />
            <SummaryItem
              label="Subscription"
              value={tenant.subscriptionStatus || 'N/A'}
            />
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
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

        <div className="flex shrink-0 items-center justify-end text-sm font-bold text-blue-600 group-hover:text-blue-700">
          Open details →
        </div>
      </div>
    </button>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 truncate font-black text-slate-900" title={value}>
        {value}
      </p>
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
