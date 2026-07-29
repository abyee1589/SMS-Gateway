"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Crown,
  Radio,
  Send,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

type DashboardMessage = {
  id: string;
  tenantId?: string;
  recipient: string;
  content: string;
  status: string;
  providerName?: string | null;
  providerMessageId?: string | null;
  createdAt: string;
};

type CompanyUsage = {
  id: string;
  name: string;
  status: string;
  commercialTier: string;
  messagePriority: string;
  smsQuota: number;
  smsUsed: number;
  remainingSms: number;
  usagePercent: number;
};

type CompanyOption = {
  id: string;
  name: string;
};

type DashboardStats = {
  currentUser: {
    id?: string;
    role: string;
    tenantId?: string;
  };
  scope?: "tenant" | "platform" | "selected_company";
  period?: "today" | "week" | "month" | "year";
  platform?: {
    totalCompanies: number;
    activeCompanies: number;
    vipCompanies: number;
    totalUsers: number;
    activeUsers: number;
    totalSmsQuota: number;
    totalSmsUsed: number;
    totalRemainingSms: number;
    usagePercent: number;
  };
  subscription: {
    smsQuota: number;
    smsUsed: number;
    remainingSms: number;
    usagePercent: number;
    subscriptionStatus: string | null;
    subscriptionEndDate: string | null;
  };
  overview: {
    totalUsers: number;
    activeUsers: number;
    totalCampaigns: number;
    totalMessages: number;
  };
  traffic: {
    sentMessages: number;
    deliveredMessages: number;
    queuedMessages: number;
    failedMessages: number;
    deadLetterMessages: number;
    sentToday: number;
    failedToday: number;
    deliveryRate: number;
  };
  companiesNearQuotaLimit?: CompanyUsage[];
  topCompaniesByUsage?: CompanyUsage[];
  recentMessages: DashboardMessage[];
};

const STATUS_COLORS: Record<string, string> = {
  Sent: "#099a6a",
  Delivered: "#22c55e",
  Queued: "#3b82f6",
  Failed: "#ef4444",
  "Dead Letter": "#e11d48",
};

type DashboardPeriod = "today" | "week" | "month" | "year";

function formatNumber(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US");
}

function formatMetricValue(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return formatNumber(value);
  }

  return value ?? "0";
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<DashboardPeriod>("year");
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedCompanyStats, setSelectedCompanyStats] =
    useState<DashboardStats | null>(null);
  const [selectedCompanyLoading, setSelectedCompanyLoading] = useState(false);

  async function loadDashboard() {
    const token = getToken();

    if (!token) {
      window.location.href = "/login";
      return;
    }

    try {
      setError("");

      if (!stats) {
        setLoading(true);
      }

      const data = await apiFetch<DashboardStats>(
        `/dashboard/stats?period=${period}`,
        undefined,
        token,
      );

      setStats(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load dashboard analytics");
    } finally {
      setLoading(false);
    }
  }

  function buildMessageBreakdown(stats: DashboardStats | null) {
    if (!stats) return [];

    return [
      { name: "Sent", value: stats.traffic.sentMessages },
      { name: "Delivered", value: stats.traffic.deliveredMessages },
      { name: "Queued", value: stats.traffic.queuedMessages },
      { name: "Failed", value: stats.traffic.failedMessages },
      { name: "Dead Letter", value: stats.traffic.deadLetterMessages },
    ].filter((item) => item.value > 0);
  }

  async function loadCompanies() {
    const token = getToken();

    if (!token) return;

    try {
      setCompaniesLoading(true);

      const response = await apiFetch<
        CompanyOption[] | { data?: CompanyOption[]; tenants?: CompanyOption[] }
      >("/tenants", undefined, token);

      const list = Array.isArray(response)
        ? response
        : (response.data ?? response.tenants ?? []);

      setCompanies(
        list
          .filter((company) => company.id && company.name)
          .map((company) => ({
            id: company.id,
            name: company.name,
          })),
      );
    } catch (error) {
      console.error("Failed to load companies", error);
    } finally {
      setCompaniesLoading(false);
    }
  }

  async function loadSelectedCompanyStats(companyId: string) {
    const token = getToken();

    if (!token || !companyId) {
      setSelectedCompanyStats(null);
      return;
    }

    try {
      setSelectedCompanyLoading(true);

      const data = await apiFetch<DashboardStats>(
        `/dashboard/stats?period=${period}&tenantId=${companyId}&companyId=${companyId}`,
        undefined,
        token,
      );

      setSelectedCompanyStats(data);
    } catch (error) {
      console.error("Failed to load selected company dashboard stats", error);
      setSelectedCompanyStats(null);
    } finally {
      setSelectedCompanyLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  useEffect(() => {
    if (stats?.scope === "platform") {
      loadCompanies();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats?.scope]);

  useEffect(() => {
    if (stats?.scope === "platform" && selectedCompanyId) {
      loadSelectedCompanyStats(selectedCompanyId);
    } else {
      setSelectedCompanyStats(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats?.scope, selectedCompanyId, period]);

  const messageBreakdown = useMemo(() => buildMessageBreakdown(stats), [stats]);

  const selectedCompanyMessageBreakdown = useMemo(
    () => buildMessageBreakdown(selectedCompanyStats),
    [selectedCompanyStats],
  );

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error || !stats) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-700">
        {error || "Failed to load dashboard analytics"}
      </div>
    );
  }

  if (stats.scope === "platform") {
    return (
      <PlatformDashboard
        stats={stats}
        period={period}
        setPeriod={setPeriod}
        messageBreakdown={messageBreakdown}
        companies={companies}
        companiesLoading={companiesLoading}
        selectedCompanyId={selectedCompanyId}
        setSelectedCompanyId={setSelectedCompanyId}
        selectedCompanyStats={selectedCompanyStats}
        selectedCompanyLoading={selectedCompanyLoading}
        selectedCompanyMessageBreakdown={selectedCompanyMessageBreakdown}
      />
    );
  }

  return (
    <TenantDashboard
      stats={stats}
      period={period}
      setPeriod={setPeriod}
      messageBreakdown={messageBreakdown}
    />
  );
}

function PlatformDashboard({
  stats,
  period,
  setPeriod,
  messageBreakdown,
  companies,
  companiesLoading,
  selectedCompanyId,
  setSelectedCompanyId,
  selectedCompanyStats,
  selectedCompanyLoading,
  selectedCompanyMessageBreakdown,
}: {
  stats: DashboardStats;
  period: DashboardPeriod;
  setPeriod: (period: DashboardPeriod) => void;
  messageBreakdown: { name: string; value: number }[];
  companies: CompanyOption[];
  companiesLoading: boolean;
  selectedCompanyId: string;
  setSelectedCompanyId: (companyId: string) => void;
  selectedCompanyStats: DashboardStats | null;
  selectedCompanyLoading: boolean;
  selectedCompanyMessageBreakdown: { name: string; value: number }[];
}) {
  const platform = stats.platform;
  const selectedCompany = companies.find(
    (company) => company.id === selectedCompanyId,
  );


  return (
    <div className="space-y-6 sm:space-y-8">
      <header className="overflow-hidden rounded-[1.5rem] bg-slate-950 text-white shadow-xl sm:rounded-[2rem]">
        <div className="relative p-5 sm:p-7 lg:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/2 h-60 w-60 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
                <ShieldCheck className="h-3.5 w-3.5 text-blue-300" />
                NexusMsg Platform Control Center
              </div>

              <h1 className="mt-5 break-words text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                {formatNumber(platform?.totalCompanies)}
                <span className="ml-2 text-lg font-bold text-slate-300 sm:text-xl">
                  companies managed
                </span>
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Monitor company health, quota allocation, priority handling, and
                SMS traffic across the full NexusMsg platform.
              </p>
            </div>

            <Link
              href="/tenants"
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-slate-100 sm:w-auto"
            >
              <Building2 className="h-4 w-4" />
              Manage Companies
            </Link>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PlatformStatCard
          title="Total Companies"
          value={platform?.totalCompanies ?? 0}
          helper={`${formatNumber(platform?.activeCompanies)} active companies`}
          icon={Building2}
        />

        <PlatformStatCard
          title="VIP / Enterprise"
          value={platform?.vipCompanies ?? 0}
          helper="Priority commercial accounts"
          icon={Crown}
          tone="premium"
        />

        <PlatformStatCard
          title="Quota Allocated"
          value={platform?.totalSmsQuota ?? 0}
          helper={`${formatNumber(platform?.totalRemainingSms)} SMS remaining`}
          icon={Zap}
        />

        <PlatformStatCard
          title="Platform Users"
          value={platform?.totalUsers ?? 0}
          helper={`${formatNumber(platform?.activeUsers)} active users`}
          icon={Users}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_0.9fr]">
        <ScopeSmsUsagePanel
          platformStats={stats}
          selectedCompany={selectedCompany}
          selectedCompanyStats={selectedCompanyStats}
          selectedCompanyLoading={selectedCompanyLoading}
        />

        <CompanyTrafficFilterPanel
          period={period}
          setPeriod={setPeriod}
          platformStats={stats}
          globalMessageBreakdown={messageBreakdown}
          companies={companies}
          companiesLoading={companiesLoading}
          selectedCompanyId={selectedCompanyId}
          setSelectedCompanyId={setSelectedCompanyId}
          selectedCompanyStats={selectedCompanyStats}
          selectedCompanyLoading={selectedCompanyLoading}
          messageBreakdown={selectedCompanyMessageBreakdown}
        />
      </section>


      <section>
        <CompanyListPanel
          title="Top Companies by Usage"
          subtitle="Highest SMS consumers across the platform. Low-quota warnings are handled by company/admin notifications."
          companies={stats.topCompaniesByUsage ?? []}
          emptyText="No company usage yet."
        />
      </section>
    </div>
  );
}

function TenantDashboard({
  stats,
  period,
  setPeriod,
  messageBreakdown,
}: {
  stats: DashboardStats;
  period: DashboardPeriod;
  setPeriod: (period: DashboardPeriod) => void;
  messageBreakdown: { name: string; value: number }[];
}) {
  const subscription = stats.subscription;
  const traffic = stats.traffic;
  const usagePercent = subscription?.usagePercent ?? 0;
  const role = stats.currentUser?.role;
  const isUser = role === "user";

  return (
    <div className="space-y-6 sm:space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-slate-950">
            Dashboard
          </h1>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Monitor your company SMS activity, quota usage, and recent delivery
            status.
          </p>
        </div>

        <Link
          href="/messages/new"
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-lg active:scale-95 sm:w-auto"
        >
          <Send className="h-4 w-4" />
          New Broadcast
        </Link>
      </header>

      <section className="overflow-hidden rounded-[1.5rem] bg-slate-950 text-white shadow-xl sm:rounded-[2rem]">
        <div className="relative p-5 sm:p-7 lg:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/2 h-60 w-60 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
                <Zap className="h-3.5 w-3.5 text-blue-300" />
                {isUser ? "Company SMS balance" : "Active subscription"}
              </div>

              <h3 className="mt-5 break-words text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                {formatNumber(subscription?.remainingSms)}
                <span className="ml-2 text-lg font-bold text-slate-300 sm:text-xl">
                  SMS left
                </span>
              </h3>

              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
                {formatNumber(subscription?.smsUsed)} used from {" "}
                {formatNumber(subscription?.smsQuota)} available company SMS quota.
              </p>
            </div>

            <div className="min-w-0 rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur">
              <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-slate-200">
                  Package usage
                </span>
                <span className="font-black">{usagePercent}%</span>
              </div>

              <div className="h-4 overflow-hidden rounded-full bg-white/15">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${getUsageBarColor(
                    usagePercent,
                  )}`}
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>

              {!isUser ? (
                <div className="mt-4 flex flex-col gap-2 text-xs text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                  <span className="capitalize">
                    {subscription?.subscriptionStatus ?? "N/A"}
                  </span>

                  <span>
                    {subscription?.subscriptionEndDate
                      ? `Expires ${new Date(
                          subscription.subscriptionEndDate,
                        ).toLocaleDateString()}`
                      : "No expiry set"}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {usagePercent >= 70 ? (
        <AlertCard
          tone={usagePercent >= 90 ? "danger" : "warning"}
          icon={AlertTriangle}
          title={
            usagePercent >= 100
              ? "SMS balance is exhausted"
              : usagePercent >= 90
                ? "SMS balance is almost exhausted"
                : "SMS balance is running low"
          }
          description={
            isUser
              ? usagePercent >= 100
                ? "Your company has used all available SMS credits. Please contact an admin to add more credits before sending more messages."
                : `Your company has used ${usagePercent}% of its SMS quota. Please contact an admin to request more SMS credits before sending is interrupted.`
              : usagePercent >= 100
                ? "This company has used all available SMS credits. Add more SMS credits or upgrade the plan before sending more messages."
                : `This company has used ${usagePercent}% of its SMS quota. Add more SMS credits or upgrade the plan to avoid service interruption.`
          }
        />
      ) : null}

      {(traffic?.deadLetterMessages ?? 0) > 0 ? (
        <AlertCard
          tone="danger"
          icon={AlertOctagon}
          title="Some messages are in dead letter"
          description={`${traffic?.deadLetterMessages} message${
            (traffic?.deadLetterMessages ?? 0) > 1 ? "s are" : " is"
          } in dead letter. Review the failed message details, fix the root cause, then retry or resend them.`}
          href="/messages/dead-letter"
          actionLabel="Review Dead Letter"
        />
      ) : null}

      <TrafficPanel
        title="Company SMS Traffic"
        period={period}
        setPeriod={setPeriod}
        traffic={traffic}
        messageBreakdown={messageBreakdown}
      />

      <RecentMessagesPanel
        title="Recent Messages"
        subtitle="Latest SMS activity for this company."
        messages={stats.recentMessages}
      />
    </div>
  );
}


function ScopeSmsUsagePanel({
  platformStats,
  selectedCompany,
  selectedCompanyStats,
  selectedCompanyLoading,
}: {
  platformStats: DashboardStats;
  selectedCompany?: CompanyOption;
  selectedCompanyStats: DashboardStats | null;
  selectedCompanyLoading: boolean;
}) {
  const activeStats = selectedCompany ? selectedCompanyStats : platformStats;
  const subscription = activeStats?.subscription;

  const smsQuota = subscription?.smsQuota ?? 0;
  const smsUsed = subscription?.smsUsed ?? 0;
  const remainingSms = subscription?.remainingSms ?? 0;
  const usagePercent = subscription?.usagePercent ?? 0;

  const title = selectedCompany
    ? `${selectedCompany.name} SMS Usage`
    : "All Companies SMS Usage";

  const description = selectedCompany
    ? `Current SMS quota usage for ${selectedCompany.name}.`
    : "Current SMS quota usage across all companies.";

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-black text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500">{description}</p>
        </div>

        <span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
          {selectedCompanyLoading && selectedCompany
            ? "Loading..."
            : `${usagePercent}% used`}
        </span>
      </div>

      <div className="rounded-3xl bg-slate-950 p-5 text-white">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              SMS used
            </p>

            <p className="mt-2 text-3xl font-black sm:text-4xl">
              {formatNumber(smsUsed)}
              <span className="text-lg text-slate-400">
                {" "}
                / {formatNumber(smsQuota)}
              </span>
            </p>
          </div>

          <p className="text-sm text-slate-300">
            Remaining: {formatNumber(remainingSms)}
          </p>
        </div>

        <div className="mt-5 h-4 overflow-hidden rounded-full bg-white/15">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${getUsageBarColor(
              usagePercent,
            )}`}
            style={{ width: `${Math.min(usagePercent, 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MiniMetric label="Allocated" value={smsQuota} />
        <MiniMetric label="Used" value={smsUsed} />
        <MiniMetric label="Remaining" value={remainingSms} />
      </div>

      {/* <p className="mt-4 text-xs leading-5 text-slate-400">
        SMS usage is quota based. The period filter controls traffic analytics,
        not the current quota balance.
      </p> */}
    </div>
  );
}

function CompanyTrafficFilterPanel({
  period,
  setPeriod,
  platformStats,
  globalMessageBreakdown,
  companies,
  companiesLoading,
  selectedCompanyId,
  setSelectedCompanyId,
  selectedCompanyStats,
  selectedCompanyLoading,
  messageBreakdown,
}: {
  period: DashboardPeriod;
  setPeriod: (period: DashboardPeriod) => void;
  platformStats: DashboardStats;
  globalMessageBreakdown: { name: string; value: number }[];
  companies: CompanyOption[];
  companiesLoading: boolean;
  selectedCompanyId: string;
  setSelectedCompanyId: (companyId: string) => void;
  selectedCompanyStats: DashboardStats | null;
  selectedCompanyLoading: boolean;
  messageBreakdown: { name: string; value: number }[];
}) {
  const selectedCompany = companies.find(
    (company) => company.id === selectedCompanyId,
  );

  const activeStats = selectedCompanyId ? selectedCompanyStats : platformStats;
  const activeBreakdown = selectedCompanyId
    ? messageBreakdown
    : globalMessageBreakdown;
  const traffic = activeStats?.traffic;

  const totalTraffic =
    (traffic?.sentMessages ?? 0) +
    (traffic?.deliveredMessages ?? 0) +
    (traffic?.queuedMessages ?? 0) +
    (traffic?.failedMessages ?? 0) +
    (traffic?.deadLetterMessages ?? 0);

  const isLoading = selectedCompanyId ? selectedCompanyLoading : false;
  const chartTitle = selectedCompany
    ? `${selectedCompany.name} traffic`
    : "All companies traffic";

  return (
    <section className="overflow-visible rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-md sm:p-6">
      <div className="mb-5">
        <h3 className="text-lg font-black text-slate-900">
          Company SMS Traffic
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          View traffic across all companies or filter by a specific company.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <label className="mb-1.5 block text-xs font-black uppercase tracking-[0.16em] text-slate-400">
            Company
          </label>

          <select
            value={selectedCompanyId}
            onChange={(event) => setSelectedCompanyId(event.target.value)}
            disabled={companiesLoading}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50"
          >
            <option value="">
              {companiesLoading ? "Loading companies..." : "All companies"}
            </option>

            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["today", "week", "month", "year"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setPeriod(item)}
              className={`rounded-full px-4 py-2 text-xs font-bold capitalize transition ${
                period === item
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MiniMetric label="Total" value={totalTraffic} />
        <MiniMetric label="Delivered" value={traffic?.deliveredMessages ?? 0} />
        <MiniMetric
          label="Delivery Rate"
          value={`${traffic?.deliveryRate ?? 0}%`}
        />
      </div>

      <div className="mt-6 rounded-3xl bg-slate-50 p-4">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-black text-slate-900">{chartTitle}</p>
            <p className="text-sm text-slate-500">
              Period: <span className="capitalize">{period}</span>
            </p>
          </div>
        </div>

        <div className="mx-auto flex h-[300px] w-full max-w-[420px] items-center justify-center overflow-visible">
          {isLoading ? (
            <div className="text-center text-sm font-medium text-slate-400">
              Loading company traffic...
            </div>
          ) : activeBreakdown.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart
                margin={{
                  top: 10,
                  right: 20,
                  bottom: 10,
                  left: 20,
                }}
              >
                <Pie
                  data={activeBreakdown}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius="72%"
                  label={({ name, percent }) =>
                    `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  isAnimationActive
                  animationBegin={0}
                  animationDuration={450}
                  animationEasing="ease-out"
                >
                  {activeBreakdown.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={STATUS_COLORS[entry.name] ?? "#64748b"}
                    />
                  ))}
                </Pie>

                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}

function TrafficPanel({
  title,
  period,
  setPeriod,
  traffic,
  messageBreakdown,
  compactLinks = false,
}: {
  title: string;
  period: DashboardPeriod;
  setPeriod: (period: DashboardPeriod) => void;
  traffic: DashboardStats["traffic"];
  messageBreakdown: { name: string; value: number }[];
  compactLinks?: boolean;
}) {
  const trafficLinks = [
    {
      label: "Sent",
      val: traffic?.sentMessages,
      t: "sent",
      href: "/messages/outbound",
    },
    {
      label: "Delivered",
      val: traffic?.deliveredMessages,
      t: "delivered",
      href: "/messages/outbound/delivered",
    },
    {
      label: "Queued",
      val: traffic?.queuedMessages,
      t: "queued",
      href: "/messages/outbound",
    },
    {
      label: "Failed",
      val: traffic?.failedMessages,
      t: "failed",
      href: "/messages/outbound/failed",
    },
    {
      label: "Dead Letter",
      val: traffic?.deadLetterMessages,
      t: "dead",
      href: "/messages/outbound/dead-letter",
    },
  ] as const;

  return (
    <section>
      <div className="overflow-visible rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-md sm:p-6">
        <div className="mb-5">
          <h3 className="text-lg font-black text-slate-900">{title}</h3>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["today", "week", "month", "year"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setPeriod(item)}
              className={`rounded-full px-4 py-2 text-xs font-bold capitalize transition ${
                period === item
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div
          className={`mx-auto mt-6 grid w-full grid-cols-1 overflow-visible xl:items-center ${
            compactLinks
              ? "max-w-[820px] gap-6 xl:grid-cols-[125px_minmax(0,1fr)]"
              : "max-w-[760px] gap-6 xl:grid-cols-[220px_minmax(0,1fr)]"
          }`}
        >
          <div className="min-w-0 space-y-3">
            <div
              className={`flex flex-wrap gap-2 xl:flex-col ${
                compactLinks ? "xl:max-w-[125px]" : "xl:max-w-[220px]"
              }`}
            >
              {trafficLinks.map((link) => (
                <TrafficLink
                  key={link.label}
                  href={link.href}
                  title={link.label}
                  value={link.val ?? 0}
                  tone={
                    link.t as
                      "sent" | "delivered" | "queued" | "failed" | "dead"
                  }
                  compact={compactLinks}
                />
              ))}
            </div>
          </div>

          <div className="min-w-0 overflow-visible">
            <div className="mx-auto flex h-[260px] w-full max-w-[280px] items-center justify-center overflow-visible sm:h-[320px] sm:max-w-[360px] xl:h-[360px] xl:max-w-[450px]">
              {messageBreakdown.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart
                    margin={{
                      top: compactLinks ? 16 : 10,
                      right: compactLinks ? 32 : 10,
                      bottom: compactLinks ? 16 : 10,
                      left: compactLinks ? 32 : 10,
                    }}
                  >
                    <Pie
                      data={messageBreakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius="72%"
                      label={({ percent }) =>
                        `${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                      isAnimationActive
                      animationBegin={0}
                      animationDuration={450}
                      animationEasing="ease-out"
                    >
                      {messageBreakdown.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={STATUS_COLORS[entry.name] ?? "#64748b"}
                        />
                      ))}
                    </Pie>

                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CompanyListPanel({
  title,
  subtitle,
  companies,
  emptyText,
  highlightRisk = false,
  scrollAfter = 5,
}: {
  title: string;
  subtitle: string;
  companies: CompanyUsage[];
  emptyText: string;
  highlightRisk?: boolean;
  scrollAfter?: number;
}) {
  const shouldScroll = companies.length > scrollAfter;

  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-black text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>

        {companies.length > 0 ? (
          <span className="w-fit shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
            {formatNumber(companies.length)} companies
          </span>
        ) : null}
      </div>

      {companies.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-100 py-10 text-center text-sm text-slate-400">
          {emptyText}
        </div>
      ) : (
        <div
          className={`space-y-3 ${
            shouldScroll
              ? "max-h-[520px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent"
              : ""
          }`}
        >
          {companies.map((company) => (
            <Link
              key={company.id}
              href={`/tenants?companyId=${company.id}`}
              className="block rounded-2xl border border-slate-100 bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue-100 hover:bg-slate-50 hover:shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words font-black text-slate-900">
                    {company.name}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge label={company.commercialTier} />
                    <Badge label={company.messagePriority} />
                    <Badge label={company.status} />
                  </div>
                </div>

                <div className="shrink-0 text-left sm:text-right">
                  <p
                    className={`text-lg font-black ${
                      highlightRisk && company.usagePercent >= 90
                        ? "text-red-700"
                        : highlightRisk
                          ? "text-yellow-700"
                          : "text-slate-900"
                    }`}
                  >
                    {company.usagePercent}%
                  </p>

                  <p className="text-xs text-slate-500">
                    {formatNumber(company.smsUsed)}/{formatNumber(company.smsQuota)} used
                  </p>
                </div>
              </div>

              <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${getUsageBarColor(
                    company.usagePercent,
                  )}`}
                  style={{ width: `${Math.min(company.usagePercent, 100)}%` }}
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function RecentMessagesPanel({
  title,
  subtitle,
  messages,
}: {
  title: string;
  subtitle: string;
  messages: DashboardMessage[];
}) {
  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-md sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-black text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>

        <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
          {formatNumber(messages?.length)} latest
        </span>
      </div>

      {!messages?.length ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-100 py-12 text-center text-sm text-slate-400">
          No recent messages.
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((message) => (
            <Link
              key={message.id}
              href={`/messages/${message.id}`}
              className="group block rounded-2xl border border-slate-100 bg-white px-4 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-100 hover:bg-slate-50 hover:shadow-sm"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="break-words font-bold text-slate-900 transition group-hover:text-blue-700">
                    {message.recipient}
                  </p>

                  <p className="mt-1 line-clamp-2 break-words text-sm text-slate-600">
                    {message.content}
                  </p>

                  {message.providerName ? (
                    <p className="mt-2 text-xs font-medium text-slate-400">
                      Provider: {message.providerName}
                    </p>
                  ) : null}
                </div>

                <span className="shrink-0 text-xs font-medium text-slate-400 md:whitespace-nowrap">
                  {new Date(message.createdAt).toLocaleString()}
                </span>
              </div>

              <span
                className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${getStatusClass(
                  message.status,
                )}`}
              >
                {getStatusIcon(message.status)}
                {formatStatus(message.status)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function PlatformStatCard({
  title,
  value,
  icon: Icon,
  helper,
  tone = "default",
}: {
  title: string;
  value: string | number;
  icon: LucideIcon;
  helper: string;
  tone?: "default" | "premium";
}) {
  const classes =
    tone === "premium"
      ? "border-purple-100 bg-purple-50 text-purple-900"
      : "border-slate-100 bg-white text-slate-900";

  return (
    <div
      className={`group rounded-2xl border p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${classes}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
            {title}
          </p>

          <p className="mt-3 break-words text-4xl font-black tracking-tight">
            {formatMetricValue(value)}
          </p>
        </div>

        <div className="rounded-2xl bg-white/70 p-3 transition-all duration-300 group-hover:scale-110">
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-500">{helper}</p>
    </div>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>

      <p className="mt-2 break-words text-2xl font-black text-slate-900">
        {formatMetricValue(value)}
      </p>
    </div>
  );
}

function Badge({ label }: { label: string }) {
  const tone = label.toLowerCase();

  const classes =
    tone === "enterprise"
      ? "bg-slate-900 text-white"
      : tone === "vip" || tone === "critical"
        ? "bg-purple-50 text-purple-700"
        : tone === "high"
          ? "bg-yellow-50 text-yellow-700"
          : tone === "active"
            ? "bg-green-50 text-green-700"
            : "bg-slate-100 text-slate-600";

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-black capitalize ${classes}`}
    >
      {label.replace("_", " ")}
    </span>
  );
}

function AlertCard({
  tone,
  icon: Icon,
  title,
  description,
  href,
  actionLabel,
}: {
  tone: "warning" | "danger";
  icon: LucideIcon;
  title: string;
  description: string;
  href?: string;
  actionLabel?: string;
}) {
  const classes =
    tone === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-yellow-200 bg-yellow-50 text-yellow-800";

  const actionClasses =
    tone === "danger"
      ? "border-rose-200 bg-white text-rose-700 hover:bg-rose-100"
      : "border-yellow-200 bg-white text-yellow-700 hover:bg-yellow-100";

  return (
    <div className={`rounded-2xl border px-5 py-4 ${classes}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0" />

          <div className="min-w-0">
            <p className="font-black">{title}</p>
            <p className="mt-1 text-sm">{description}</p>
          </div>
        </div>

        {href && actionLabel ? (
          <Link
            href={href}
            className={`inline-flex shrink-0 items-center justify-center rounded-xl border px-4 py-2 text-xs font-black transition ${actionClasses}`}
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-sm font-medium italic text-slate-400">
      No message data yet.
    </div>
  );
}

function getUsageBarColor(usagePercent: number) {
  if (usagePercent >= 90) return "bg-red-400";
  if (usagePercent >= 70) return "bg-yellow-400";
  return "bg-blue-400";
}

function getStatusClass(status: string) {
  switch (status) {
    case "delivered":
      return "border-green-100 bg-green-50 text-green-700";
    case "sent":
      return "border-emerald-100 bg-emerald-50 text-emerald-700";
    case "failed":
      return "border-red-100 bg-red-50 text-red-700";
    case "dead_letter":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "queued":
      return "border-blue-100 bg-blue-50 text-blue-700";
    case "processing":
      return "border-yellow-100 bg-yellow-50 text-yellow-700";
    default:
      return "border-slate-100 bg-slate-50 text-slate-600";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "delivered":
      return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "sent":
      return <Send className="h-3.5 w-3.5" />;
    case "failed":
      return <AlertTriangle className="h-3.5 w-3.5" />;
    case "dead_letter":
      return <AlertOctagon className="h-3.5 w-3.5" />;
    case "queued":
      return <Clock className="h-3.5 w-3.5" />;
    case "processing":
      return <Activity className="h-3.5 w-3.5" />;
    default:
      return <Radio className="h-3.5 w-3.5" />;
  }
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-10 w-full max-w-72 animate-pulse rounded-xl bg-slate-100" />
      <div className="h-56 animate-pulse rounded-[1.5rem] bg-slate-100 sm:rounded-[2rem]" />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="h-36 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-36 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-36 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    </div>
  );
}

function TrafficLink({
  href,
  title,
  value,
  tone,
  compact = false,
}: {
  href: string;
  title: string;
  value: number;
  tone: "sent" | "delivered" | "queued" | "failed" | "dead";
  compact?: boolean;
}) {
  const classes = {
    sent: "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100",
    delivered: "bg-green-50 text-green-700 border-green-100 hover:bg-green-100",
    queued: "bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100",
    failed: "bg-red-50 text-red-700 border-red-100 hover:bg-red-100",
    dead: "bg-rose-50 text-rose-700 border-rose-100 hover:bg-rose-100",
  }[tone];

  return (
    <Link
      href={href}
      className={`inline-flex max-w-full items-center justify-between rounded-full border font-bold transition ${classes} ${
        compact
          ? "gap-1.5 px-2.5 py-1.5 text-[11px]"
          : "gap-3 px-4 py-2 text-sm"
      }`}
    >
      <span className="truncate">{title}</span>
      <span
        className={`shrink-0 rounded-full bg-white/70 py-0.5 ${
          compact ? "px-1.5 text-[9px]" : "px-2 text-xs"
        }`}
      >
        {formatNumber(value)}
      </span>
    </Link>
  );
}
