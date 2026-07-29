"use client";

import { type ElementType, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { ui } from "@/lib/ui";
import {
  AlertTriangle,
  CreditCard,
  Crown,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

type CurrentUser = {
  id: string;
  tenantId: string;
  role: string;
};

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
  type: "allocation" | "purchase" | "usage";
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason?: string | null;
  referenceId?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
};

function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (Array.isArray(message)) return message[0] ?? "Request failed";
    if (typeof message === "string") return message;
  }

  if (error instanceof Error) return error.message;

  return "Request failed";
}

function normalizeTenantsResponse(
  response: Tenant[] | { data?: Tenant[]; tenants?: Tenant[] },
) {
  if (Array.isArray(response)) return response;
  return response.data ?? response.tenants ?? [];
}

export default function BillingPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [transactions, setTransactions] = useState<QuotaTransaction[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [selectedTransactions, setSelectedTransactions] = useState<
    QuotaTransaction[]
  >([]);
  const [selectedTransactionsLoading, setSelectedTransactionsLoading] =
    useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isSuperAdmin = currentUser?.role === "super_admin";

  async function loadBilling() {
    const token = getToken();

    if (!token) {
      window.location.href = "/login";
      return;
    }

    try {
      setLoading(true);
      setError("");

      const userData = await apiFetch<CurrentUser>(
        "/auth/me",
        undefined,
        token,
      );
      setCurrentUser(userData);

      if (userData.role === "super_admin") {
        const tenantsResponse = await apiFetch<
          Tenant[] | { data?: Tenant[]; tenants?: Tenant[] }
        >("/tenants", undefined, token);

        const tenantsList = normalizeTenantsResponse(tenantsResponse);

        setTenants(tenantsList);
        setTenant(null);
        setTransactions([]);
        setSelectedTenantId(
          (currentSelectedTenantId) =>
            currentSelectedTenantId || tenantsList[0]?.id || "",
        );
        return;
      }

      const [tenantData, transactionsData] = await Promise.all([
        apiFetch<Tenant>("/tenants/me", undefined, token),
        apiFetch<QuotaTransaction[]>(
          "/tenants/me/quota-transactions",
          undefined,
          token,
        ),
      ]);

      setTenant(tenantData);
      setTransactions(transactionsData);
      setTenants([]);
      setSelectedTenantId("");
      setSelectedTransactions([]);
    } catch (error) {
      console.error("Failed to load billing", error);
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadSelectedTenantTransactions(tenantId: string) {
    const token = getToken();

    if (!token || !tenantId) {
      setSelectedTransactions([]);
      return;
    }

    try {
      setSelectedTransactionsLoading(true);

      const data = await apiFetch<QuotaTransaction[]>(
        `/tenants/${tenantId}/quota-transactions`,
        undefined,
        token,
      );

      setSelectedTransactions(data);
    } catch (error) {
      console.error("Failed to load selected company credit history", error);
      setSelectedTransactions([]);
    } finally {
      setSelectedTransactionsLoading(false);
    }
  }

  useEffect(() => {
    loadBilling();
  }, []);

  useEffect(() => {
    if (isSuperAdmin && selectedTenantId) {
      loadSelectedTenantTransactions(selectedTenantId);
    }
  }, [isSuperAdmin, selectedTenantId]);

  const selectedTenant = useMemo(
    () => tenants.find((item) => item.id === selectedTenantId) ?? null,
    [tenants, selectedTenantId],
  );

  const platformBilling = useMemo(() => {
    const totalCompanies = tenants.length;
    const activeCompanies = tenants.filter(
      (item) => item.status === "active",
    ).length;
    const totalSmsQuota = tenants.reduce((sum, item) => sum + item.smsQuota, 0);
    const totalSmsUsed = tenants.reduce((sum, item) => sum + item.smsUsed, 0);
    const remainingSms = Math.max(0, totalSmsQuota - totalSmsUsed);
    const usagePercent =
      totalSmsQuota > 0
        ? Number(((totalSmsUsed / totalSmsQuota) * 100).toFixed(1))
        : 0;

    return {
      totalCompanies,
      activeCompanies,
      totalSmsQuota,
      totalSmsUsed,
      remainingSms,
      usagePercent,
    };
  }, [tenants]);

  const remainingSms = tenant
    ? Math.max(0, tenant.smsQuota - tenant.smsUsed)
    : 0;

  const usagePercent =
    tenant && tenant.smsQuota > 0
      ? Number(((tenant.smsUsed / tenant.smsQuota) * 100).toFixed(1))
      : 0;

  const creditsAdded = useMemo(
    () =>
      transactions
        .filter((transaction) => transaction.amount > 0)
        .reduce((sum, transaction) => sum + transaction.amount, 0),
    [transactions],
  );

  const creditsUsed = useMemo(
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

  if (error) {
    return <div className={ui.alertError}>{error}</div>;
  }

  if (isSuperAdmin) {
    return (
      <SuperAdminBillingView
        tenants={tenants}
        selectedTenant={selectedTenant}
        selectedTenantId={selectedTenantId}
        setSelectedTenantId={setSelectedTenantId}
        selectedTransactions={selectedTransactions}
        selectedTransactionsLoading={selectedTransactionsLoading}
        platformBilling={platformBilling}
      />
    );
  }

  if (!tenant) {
    return (
      <div className={ui.alertError}>Failed to load billing information</div>
    );
  }

  return (
    <TenantBillingView
      tenant={tenant}
      transactions={transactions}
      remainingSms={remainingSms}
      usagePercent={usagePercent}
      creditsAdded={creditsAdded}
      creditsUsed={creditsUsed}
    />
  );
}

function SuperAdminBillingView({
  tenants,
  selectedTenant,
  selectedTenantId,
  setSelectedTenantId,
  selectedTransactions,
  selectedTransactionsLoading,
  platformBilling,
}: {
  tenants: Tenant[];
  selectedTenant: Tenant | null;
  selectedTenantId: string;
  setSelectedTenantId: (tenantId: string) => void;
  selectedTransactions: QuotaTransaction[];
  selectedTransactionsLoading: boolean;
  platformBilling: {
    totalCompanies: number;
    activeCompanies: number;
    totalSmsQuota: number;
    totalSmsUsed: number;
    remainingSms: number;
    usagePercent: number;
  };
}) {
  const sortedTenants = useMemo(
    () =>
      [...tenants].sort((a, b) => {
        const aUsage = getTenantUsagePercent(a);
        const bUsage = getTenantUsagePercent(b);
        return bUsage - aUsage;
      }),
    [tenants],
  );

  const selectedRemainingSms = selectedTenant
    ? Math.max(0, selectedTenant.smsQuota - selectedTenant.smsUsed)
    : 0;

  const selectedUsagePercent = selectedTenant
    ? getTenantUsagePercent(selectedTenant)
    : 0;

  const selectedCreditsAdded = selectedTransactions
    .filter((transaction) => transaction.amount > 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const selectedCreditsUsed = Math.abs(
    selectedTransactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((sum, transaction) => sum + transaction.amount, 0),
  );

  return (
    <div className={ui.page}>
      <section className="overflow-hidden rounded-[1.5rem] bg-slate-950 text-white shadow-xl sm:rounded-[2rem]">
        <div className="relative p-4 sm:p-7 lg:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/2 h-60 w-60 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
                <ShieldCheck className="h-3.5 w-3.5 text-blue-300" />
                Platform Billing Administration
              </div>

              <h1 className="mt-5 break-words text-2xl font-black tracking-tight sm:text-4xl">
                SMS Credit Control Center
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Manage company SMS credit allocation, remaining balances, and
                transaction history from one administration view.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <Badge
                  label={`${formatNumber(platformBilling.totalCompanies)} companies`}
                />
                <Badge
                  label={`${formatNumber(platformBilling.activeCompanies)} active`}
                />
                <Badge label="Super admin" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={ui.card}>
        <div className={ui.cardBody}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className={ui.sectionTitle}>Platform Credit Overview</h2>
              <p className={ui.sectionSubtitle}>
                Billing-level SMS credit totals across all companies. This is
                for credit control, not traffic monitoring.
              </p>
            </div>

            <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
              {formatNumber(platformBilling.totalCompanies)} companies •{" "}
              {formatNumber(platformBilling.activeCompanies)} active
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniSummaryCard
              label="Total Quota"
              value={formatNumber(platformBilling.totalSmsQuota)}
            />
            <MiniSummaryCard
              label="Used Credits"
              value={formatNumber(platformBilling.totalSmsUsed)}
            />
            <MiniSummaryCard
              label="Remaining Credits"
              value={formatNumber(platformBilling.remainingSms)}
            />
            <MiniSummaryCard
              label="Usage Rate"
              value={`${platformBilling.usagePercent}%`}
            />
          </div>
        </div>
      </section>

      <section className={ui.card}>
        <div className={ui.cardBody}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className={ui.sectionTitle}>Company SMS Credit Overview</h2>
              <p className={ui.sectionSubtitle}>
                Companies sorted by credit usage percentage for administration
                and credit management.
              </p>
            </div>

            <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
              {formatNumber(tenants.length)} companies
            </span>
          </div>

          <div className="mt-5 max-h-[520px] space-y-3 overflow-y-auto pr-0 sm:pr-1">
            {sortedTenants.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-100 px-4 py-12 text-center text-sm text-slate-400">
                No companies found.
              </div>
            ) : (
              sortedTenants.map((tenant) => (
                <button
                  key={tenant.id}
                  type="button"
                  onClick={() => setSelectedTenantId(tenant.id)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition hover:border-blue-200 hover:bg-blue-50/40 ${
                    selectedTenantId === tenant.id
                      ? "border-blue-300 bg-blue-50 shadow-sm"
                      : "border-slate-100 bg-white"
                  }`}
                >
                  <CompanyCreditRow tenant={tenant} />
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-stretch">
        <div className={`${ui.card} h-full`}>
          <div className={`${ui.cardBody} flex h-full flex-col`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className={ui.sectionTitle}>Selected Company Billing</h2>
                <p className={ui.sectionSubtitle}>
                  View quota, subscription, and billing profile for one company.
                </p>
              </div>

              <select
                value={selectedTenantId}
                onChange={(event) => setSelectedTenantId(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:w-64"
              >
                <option value="">Select company</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedTenant ? (
              <div className="mt-5 flex flex-1 flex-col justify-between gap-5">
                <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-600">
                      SMS usage
                    </span>
                    <span className="text-sm font-black text-slate-900">
                      {selectedUsagePercent}%
                    </span>
                  </div>

                  <div className="mt-3 h-4 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${getUsageBarColor(
                        selectedUsagePercent,
                      )}`}
                      style={{
                        width: `${Math.min(selectedUsagePercent, 100)}%`,
                      }}
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-center sm:gap-3">
                    <UsageMiniStatLight
                      label="Quota"
                      value={formatNumber(selectedTenant.smsQuota)}
                    />
                    <UsageMiniStatLight
                      label="Used"
                      value={formatNumber(selectedTenant.smsUsed)}
                    />
                    <UsageMiniStatLight
                      label="Left"
                      value={formatNumber(selectedRemainingSms)}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <InfoRow label="Company" value={selectedTenant.name} />
                  <InfoRow
                    label="Legal Name"
                    value={selectedTenant.legalName || "Not set"}
                  />
                  <InfoRow
                    label="TIN Number"
                    value={selectedTenant.tinNumber || "Not set"}
                  />
                  <InfoRow
                    label="Status"
                    value={formatLabel(selectedTenant.status)}
                  />
                  <InfoRow
                    label="Commercial Tier"
                    value={formatLabel(selectedTenant.commercialTier)}
                  />
                  <InfoRow
                    label="Subscription"
                    value={formatLabel(selectedTenant.subscriptionStatus)}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-5 flex min-h-[420px] flex-1 items-center justify-center rounded-2xl border-2 border-dashed border-slate-100 px-4 py-12 text-center text-sm text-slate-400">
                Select a company to view its billing profile.
              </div>
            )}
          </div>
        </div>

        <div className={`${ui.card} h-full`}>
          <div className={`${ui.cardBody} flex h-full flex-col`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className={ui.sectionTitle}>SMS Credit History</h2>
                <p className={ui.sectionSubtitle}>
                  Balance changes for the selected company.
                </p>
              </div>

              <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
                {formatNumber(selectedTransactions.length)} records
              </span>
            </div>

            {selectedTenant ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <MiniSummaryCard
                  label="Credits Added"
                  value={formatNumber(selectedCreditsAdded)}
                />
                <MiniSummaryCard
                  label="Credits Used"
                  value={formatNumber(selectedCreditsUsed)}
                />
              </div>
            ) : null}

            <div className="mt-5 min-h-[420px] flex-1 space-y-3 overflow-y-auto pr-0 sm:pr-1 xl:max-h-[620px]">
              {!selectedTenant ? (
                <div className="flex h-full min-h-[420px] items-center justify-center rounded-2xl border-2 border-dashed border-slate-100 px-4 py-12 text-center text-sm text-slate-400">
                  Select a company to view credit activity.
                </div>
              ) : selectedTransactionsLoading ? (
                <div className="flex h-full min-h-[420px] items-center justify-center rounded-2xl border-2 border-dashed border-slate-100 px-4 py-12 text-center text-sm text-slate-400">
                  Loading SMS credit history...
                </div>
              ) : selectedTransactions.length === 0 ? (
                <div className="flex h-full min-h-[420px] items-center justify-center rounded-2xl border-2 border-dashed border-slate-100 px-4 py-12 text-center text-sm text-slate-400">
                  No SMS credit activity yet.
                </div>
              ) : (
                selectedTransactions.map((transaction) => (
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

function TenantBillingView({
  tenant,
  transactions,
  remainingSms,
  usagePercent,
  creditsAdded,
  creditsUsed,
}: {
  tenant: Tenant;
  transactions: QuotaTransaction[];
  remainingSms: number;
  usagePercent: number;
  creditsAdded: number;
  creditsUsed: number;
}) {
  return (
    <div className={ui.page}>
      <section className="overflow-hidden rounded-[1.5rem] bg-slate-950 text-white shadow-xl sm:rounded-[2rem]">
        <div className="relative p-4 sm:p-7 lg:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/2 h-60 w-60 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
                <CreditCard className="h-3.5 w-3.5 text-blue-300" />
                Billing & Subscription
              </div>

              <h1 className="mt-5 break-words text-2xl font-black tracking-tight sm:text-4xl">
                {tenant.name}
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Monitor your SMS credits, subscription status, usage history,
                and company billing profile.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <Badge label={tenant.status} />
                <Badge label={tenant.commercialTier} />
                <Badge label={`${tenant.discountPercent}% discount`} />
                <Badge label={`${tenant.messagePriority} priority`} />
              </div>
            </div>

            <div className="min-w-0 rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur sm:p-5">
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

              <div className="mt-4 grid grid-cols-3 gap-2 text-center sm:gap-3">
                <UsageMiniStat
                  label="Quota"
                  value={formatNumber(tenant.smsQuota)}
                />
                <UsageMiniStat
                  label="Used"
                  value={formatNumber(tenant.smsUsed)}
                />
                <UsageMiniStat
                  label="Left"
                  value={formatNumber(remainingSms)}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {usagePercent >= 75 ? (
        <div
          className={`rounded-2xl border px-4 py-4 sm:px-5 ${
            usagePercent >= 95
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-yellow-200 bg-yellow-50 text-yellow-800"
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0">
              <p className="font-black">
                {usagePercent >= 100
                  ? "SMS credits are exhausted"
                  : usagePercent >= 95
                    ? "SMS credits are critically low"
                    : "SMS credits are running low"}
              </p>

              <p className="mt-1 text-sm leading-6">
                {usagePercent >= 100
                  ? "Your company has used all available SMS credits. Purchase more credits before sending additional messages."
                  : `Your company has used ${usagePercent}% of its SMS credits. Purchase more credits before sending is interrupted.`}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Subscription"
          value={formatLabel(tenant.subscriptionStatus)}
          helper={
            tenant.subscriptionEndDate
              ? `Expires ${new Date(
                  tenant.subscriptionEndDate,
                ).toLocaleDateString()}`
              : "No expiry date set"
          }
          icon={ShieldCheck}
        />

        <StatCard
          label="Commercial Tier"
          value={formatLabel(tenant.commercialTier)}
          helper={`${tenant.discountPercent}% account discount`}
          icon={Crown}
        />

        <StatCard
          label="Credits Added"
          value={formatNumber(creditsAdded)}
          helper="SMS credits added through subscriptions or manual top-ups"
          icon={ReceiptText}
        />

        <StatCard
          label="Credits Used"
          value={formatNumber(creditsUsed)}
          helper="SMS credits consumed by sent messages"
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
              <InfoRow
                label="Legal Name"
                value={tenant.legalName || "Not set"}
              />
              <InfoRow
                label="TIN Number"
                value={tenant.tinNumber || "Not set"}
              />
              <InfoRow
                label="Contact Email"
                value={tenant.contactEmail || "Not set"}
              />
              <InfoRow
                label="Contact Phone"
                value={tenant.contactPhone || "Not set"}
              />
              <InfoRow
                label="Subscription Start"
                value={
                  tenant.subscriptionStartDate
                    ? new Date(tenant.subscriptionStartDate).toLocaleString()
                    : "Not set"
                }
              />
              <InfoRow
                label="Subscription End"
                value={
                  tenant.subscriptionEndDate
                    ? new Date(tenant.subscriptionEndDate).toLocaleString()
                    : "Not set"
                }
              />
            </div>
          </div>
        </div>

        <div className={ui.card}>
          <div className={ui.cardBody}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className={ui.sectionTitle}>SMS Credit History</h2>
                <p className={ui.sectionSubtitle}>
                  Balance changes from subscriptions, manual top-ups, and SMS
                  usage.
                </p>
              </div>

              <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
                {formatNumber(transactions.length)} records
              </span>
            </div>

            <div className="mt-5 max-h-[520px] space-y-3 overflow-y-auto pr-0 sm:pr-1">
              {transactions.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-100 px-4 py-12 text-center text-sm text-slate-400">
                  No SMS credit activity yet.
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

function CompanyCreditRow({ tenant }: { tenant: Tenant }) {
  const remainingSms = Math.max(0, tenant.smsQuota - tenant.smsUsed);
  const usagePercent = getTenantUsagePercent(tenant);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="break-words text-sm font-black text-slate-950">
            {tenant.name}
          </p>
          <Badge label={tenant.status} />
          <Badge label={tenant.commercialTier} />
        </div>

        <p className="mt-2 text-xs leading-5 text-slate-500">
          {tenant.contactEmail || tenant.contactPhone || "No contact set"}
        </p>
      </div>

      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
          <span>{usagePercent}% used</span>
          <span>{formatNumber(remainingSms)} left</span>
        </div>

        <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${getUsageBarColor(usagePercent)}`}
            style={{ width: `${Math.min(usagePercent, 100)}%` }}
          />
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500">
          <span>Quota: {formatNumber(tenant.smsQuota)}</span>
          <span>Used: {formatNumber(tenant.smsUsed)}</span>
          <span>Left: {formatNumber(remainingSms)}</span>
        </div>
      </div>
    </div>
  );
}

function UsageMiniStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/5 px-2 py-3">
      <p className="text-[11px] font-semibold text-slate-400 sm:text-xs">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-black sm:text-base">
        {value}
      </p>
    </div>
  );
}

function UsageMiniStatLight({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-white px-2 py-3 shadow-sm">
      <p className="text-[11px] font-semibold text-slate-400 sm:text-xs">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-black text-slate-950 sm:text-base">
        {value}
      </p>
    </div>
  );
}

function MiniSummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-xl font-black text-slate-950">{value}</p>
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
  icon: ElementType;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400 sm:text-xs sm:tracking-[0.18em]">
            {label}
          </p>
          <p className="mt-3 break-words text-xl font-black text-slate-950 sm:text-2xl">
            {value}
          </p>
        </div>

        <div className="shrink-0 rounded-2xl bg-blue-50 p-3 text-blue-700">
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-500">{helper}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center">
      <span className="text-sm font-semibold text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-sm font-black text-slate-900 sm:text-right">
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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-black ${
                transaction.type === "usage"
                  ? "bg-red-50 text-red-700"
                  : "bg-green-50 text-green-700"
              }`}
            >
              {formatTransactionType(transaction.type)}
            </span>

            <span
              className={`text-base font-black ${
                isPositive ? "text-green-700" : "text-red-700"
              }`}
            >
              {isPositive ? "+" : ""}
              {formatNumber(transaction.amount)}
            </span>
          </div>

          <p className="mt-2 break-words text-sm leading-6 text-slate-600">
            {transaction.reason || "No reason provided"}
          </p>

          {transaction.referenceId ? (
            <p className="mt-1 break-all text-xs leading-5 text-slate-400">
              Ref: {transaction.referenceId}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 text-left lg:text-right">
          <p className="text-sm font-black text-slate-900">
            Balance: {formatNumber(transaction.balanceBefore)} →{" "}
            {formatNumber(transaction.balanceAfter)}
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

  const classes = value.includes("enterprise")
    ? "bg-slate-900 text-white"
    : value.includes("vip") || value.includes("critical")
      ? "bg-purple-50 text-purple-700"
      : value.includes("active")
        ? "bg-green-50 text-green-700"
        : value.includes("discount")
          ? "bg-blue-50 text-blue-700"
          : "bg-slate-100 text-slate-700";

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-black capitalize ${classes}`}
    >
      {label.replace("_", " ")}
    </span>
  );
}

function formatLabel(value?: string | null) {
  if (!value) return "N/A";

  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "0";

  const numberValue = typeof value === "number" ? value : Number(value);

  if (Number.isNaN(numberValue)) return String(value);

  return new Intl.NumberFormat("en-US").format(numberValue);
}

function formatTransactionType(type: QuotaTransaction["type"]) {
  switch (type) {
    case "allocation":
      return "Credits Added";
    case "purchase":
      return "Purchase";
    case "usage":
      return "SMS Used";
    default:
      return formatLabel(type);
  }
}

function getTenantUsagePercent(tenant: Tenant) {
  return tenant.smsQuota > 0
    ? Number(((tenant.smsUsed / tenant.smsQuota) * 100).toFixed(1))
    : 0;
}

function getUsageBarColor(usagePercent: number) {
  if (usagePercent >= 95) return "bg-red-400";
  if (usagePercent >= 75) return "bg-yellow-400";
  return "bg-blue-400";
}

function BillingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-60 animate-pulse rounded-[1.5rem] bg-slate-100 sm:rounded-[2rem]" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    </div>
  );
}
