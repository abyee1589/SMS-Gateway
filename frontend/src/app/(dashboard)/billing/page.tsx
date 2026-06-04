'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { ui } from '@/lib/ui';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Crown,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  Zap,
} from 'lucide-react';

type Tenant = {
  id: string;
  name: string;
  legalName?: string | null;
  tinNumber?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  status: string;
  commercialTier: string;
  discountPercent: number;
  messagePriority: string;
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

type QuotaTransaction = {
  id: string;
  tenantId: string;
  type: 'allocation' | 'purchase' | 'usage' | 'refund' | 'adjustment';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason?: string | null;
  referenceId?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
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

export default function BillingPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [transactions, setTransactions] = useState<QuotaTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadBilling() {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    try {
      setError('');

      const [tenantData, transactionsData] = await Promise.all([
        apiFetch<Tenant>('/tenants/me', undefined, token),
        apiFetch<QuotaTransaction[]>('/tenants/me/quota-transactions', undefined, token),
      ]);

      setTenant(tenantData);
      setTransactions(transactionsData);
    } catch (error) {
      console.error('Failed to load billing', error);
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBilling();
  }, []);

  const remainingSms = tenant ? Math.max(0, tenant.smsQuota - tenant.smsUsed) : 0;

  const usagePercent = tenant && tenant.smsQuota > 0
    ? Number(((tenant.smsUsed / tenant.smsQuota) * 100).toFixed(1))
    : 0;

  const allocatedSms = useMemo(
    () =>
      transactions
        .filter((transaction) => transaction.amount > 0)
        .reduce((sum, transaction) => sum + transaction.amount, 0),
    [transactions],
  );

  const usedSms = useMemo(
    () =>
      Math.abs(
        transactions
          .filter((transaction) => transaction.amount < 0)
          .reduce((sum, transaction) => sum + transaction.amount, 0),
      ),
    [transactions],
  );

  if (loading) {
    return <BillingSkeleton />;
  }

  if (error || !tenant) {
    return (
      <div className={ui.alertError}>
        {error || 'Failed to load billing information'}
      </div>
    );
  }

  return (
    <div className={ui.page}>
      <section className="overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-xl">
        <div className="relative p-5 sm:p-7 lg:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/2 h-60 w-60 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
                <CreditCard className="h-3.5 w-3.5 text-blue-300" />
                Billing & Subscription
              </div>

              <h1 className="mt-5 break-words text-3xl font-black tracking-tight sm:text-4xl">
                {tenant.name}
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Monitor your SMS quota, subscription status, usage history, and
                commercial billing profile.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <Badge label={tenant.status} />
                <Badge label={tenant.commercialTier} />
                <Badge label={`${tenant.discountPercent}% discount`} />
                <Badge label={`${tenant.messagePriority} priority`} />
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-200">
                  SMS usage
                </span>
                <span className="text-sm font-black">{usagePercent}%</span>
              </div>

              <div className="mt-3 h-4 overflow-hidden rounded-full bg-white/15">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${getUsageBarColor(
                    usagePercent,
                  )}`}
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-slate-400">Quota</p>
                  <p className="mt-1 font-black">{tenant.smsQuota}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Used</p>
                  <p className="mt-1 font-black">{tenant.smsUsed}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Left</p>
                  <p className="mt-1 font-black">{remainingSms}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {usagePercent >= 70 ? (
        <div
          className={`rounded-2xl border px-5 py-4 ${
            usagePercent >= 90
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-yellow-200 bg-yellow-50 text-yellow-800'
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-black">
                {usagePercent >= 90
                  ? 'SMS quota is almost exhausted'
                  : 'SMS quota usage is getting high'}
              </p>
              <p className="mt-1 text-sm">
                Your company has used {usagePercent}% of its SMS quota. Contact
                Zergaw support or your account manager to purchase more quota.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Subscription"
          value={formatLabel(tenant.subscriptionStatus)}
          helper={tenant.subscriptionEndDate ? `Expires ${new Date(tenant.subscriptionEndDate).toLocaleDateString()}` : 'No expiry date set'}
          icon={ShieldCheck}
        />
        <StatCard
          label="Commercial Tier"
          value={formatLabel(tenant.commercialTier)}
          helper={`${tenant.discountPercent}% account discount`}
          icon={Crown}
        />
        <StatCard
          label="Allocated Ledger"
          value={allocatedSms}
          helper="Quota added through billing ledger"
          icon={ReceiptText}
        />
        <StatCard
          label="Used Ledger"
          value={usedSms}
          helper="SMS usage tracked in ledger"
          icon={TrendingUp}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className={ui.card}>
          <div className={ui.cardBody}>
            <h2 className={ui.sectionTitle}>Company Billing Profile</h2>
            <p className={ui.sectionSubtitle}>
              Account and commercial details used for subscription management.
            </p>

            <div className="mt-5 space-y-3">
              <InfoRow label="Company" value={tenant.name} />
              <InfoRow label="Legal Name" value={tenant.legalName || 'Not set'} />
              <InfoRow label="TIN Number" value={tenant.tinNumber || 'Not set'} />
              <InfoRow label="Contact Email" value={tenant.contactEmail || 'Not set'} />
              <InfoRow label="Contact Phone" value={tenant.contactPhone || 'Not set'} />
              <InfoRow label="Subscription Start" value={tenant.subscriptionStartDate ? new Date(tenant.subscriptionStartDate).toLocaleString() : 'Not set'} />
              <InfoRow label="Subscription End" value={tenant.subscriptionEndDate ? new Date(tenant.subscriptionEndDate).toLocaleString() : 'Not set'} />
            </div>
          </div>
        </div>

        <div className={ui.card}>
          <div className={ui.cardBody}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className={ui.sectionTitle}>Quota History</h2>
                <p className={ui.sectionSubtitle}>
                  Allocation and usage transactions for your company.
                </p>
              </div>

              <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
                {transactions.length} records
              </span>
            </div>

            <div className="mt-5 max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {transactions.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-100 py-12 text-center text-sm text-slate-400">
                  No quota transactions yet.
                </div>
              ) : (
                transactions.map((transaction) => (
                  <QuotaTransactionItem
                    key={transaction.id}
                    transaction={transaction}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({
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
          <p className="mt-3 break-words text-2xl font-black text-slate-950">
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-semibold text-slate-500">{label}</span>
      <span className="break-words text-sm font-black text-slate-900 sm:text-right">
        {value}
      </span>
    </div>
  );
}

function QuotaTransactionItem({
  transaction,
}: {
  transaction: QuotaTransaction;
}) {
  const isPositive = transaction.amount > 0;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-black capitalize ${
                transaction.type === 'usage'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-green-50 text-green-700'
              }`}
            >
              {transaction.type}
            </span>

            <span
              className={`text-base font-black ${
                isPositive ? 'text-green-700' : 'text-red-700'
              }`}
            >
              {isPositive ? '+' : ''}
              {transaction.amount}
            </span>
          </div>

          <p className="mt-2 break-words text-sm text-slate-600">
            {transaction.reason || 'No reason provided'}
          </p>

          {transaction.referenceId ? (
            <p className="mt-1 break-all text-xs text-slate-400">
              Ref: {transaction.referenceId}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 text-left sm:text-right">
          <p className="text-sm font-black text-slate-900">
            {transaction.balanceBefore} → {transaction.balanceAfter}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {new Date(transaction.createdAt).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

function Badge({ label }: { label: string }) {
  const value = label.toLowerCase();

  const classes =
    value.includes('enterprise')
      ? 'bg-slate-900 text-white'
      : value.includes('vip') || value.includes('critical')
        ? 'bg-purple-50 text-purple-700'
        : value.includes('active')
          ? 'bg-green-50 text-green-700'
          : value.includes('discount')
            ? 'bg-blue-50 text-blue-700'
            : 'bg-slate-100 text-slate-700';

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-black capitalize ${classes}`}>
      {label.replace('_', ' ')}
    </span>
  );
}

function formatLabel(value?: string | null) {
  if (!value) return 'N/A';

  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getUsageBarColor(usagePercent: number) {
  if (usagePercent >= 90) return 'bg-red-400';
  if (usagePercent >= 70) return 'bg-yellow-400';
  return 'bg-blue-400';
}

function BillingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-60 animate-pulse rounded-[2rem] bg-slate-100" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    </div>
  );
}
