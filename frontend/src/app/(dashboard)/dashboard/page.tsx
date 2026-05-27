'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Radio,
  Send,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

type DashboardMessage = {
  id: string;
  recipient: string;
  content: string;
  status: string;
  createdAt: string;
};

type DashboardStats = {
  currentUser: {
    role: string;
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
  recentMessages: DashboardMessage[];
};

const STATUS_COLORS: Record<string, string> = {
  Sent: '#099a6a',
  Delivered: '#22c55e',
  Queued: '#3b82f6',
  Failed: '#ef4444',
  'Dead Letter': '#e11d48',
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'year'>(
    'year',
  );

  async function loadDashboard() {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    try {
      setError('');

      const data = await apiFetch<DashboardStats>(
        `/dashboard/stats?period=${period}`,
        undefined,
        token,
      );

      setStats(data);
    } catch (err) {
      console.error(err);
      setError('Failed to load dashboard analytics');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, [period]);

  const subscription = stats?.subscription;
  const traffic = stats?.traffic;
  const usagePercent = subscription?.usagePercent ?? 0;
  const role = stats?.currentUser?.role;
  const isUser = role === 'user';
  const chartKey = `chart-${period}`;

  const messageBreakdown = useMemo(() => {
    if (!stats) return [];

    return [
      { name: 'Sent', value: stats.traffic.sentMessages },
      { name: 'Delivered', value: stats.traffic.deliveredMessages },
      { name: 'Queued', value: stats.traffic.queuedMessages },
      { name: 'Failed', value: stats.traffic.failedMessages },
      { name: 'Dead Letter', value: stats.traffic.deadLetterMessages },
    ].filter((item) => item.value > 0);
  }, [stats]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div />

        <button className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-lg active:scale-95 sm:w-auto">
          <Send className="h-4 w-4" />
          New Broadcast
        </button>
      </header>

      <section className="overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-xl">
        <div className="relative p-5 sm:p-7 lg:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/2 h-60 w-60 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
                <Zap className="h-3.5 w-3.5 text-blue-300" />
                {isUser ? 'Company SMS balance' : 'Active subscription'}
              </div>

              <h3 className="mt-5 break-words text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                {subscription?.remainingSms ?? 0}
                <span className="ml-2 text-lg font-bold text-slate-300 sm:text-xl">
                  SMS left
                </span>
              </h3>

              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
                {subscription?.smsUsed ?? 0} used from{' '}
                {subscription?.smsQuota ?? 0} available company SMS quota.
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
                    {subscription?.subscriptionStatus ?? 'N/A'}
                  </span>

                  <span>
                    {subscription?.subscriptionEndDate
                      ? `Expires ${new Date(
                          subscription.subscriptionEndDate,
                        ).toLocaleDateString()}`
                      : 'No expiry set'}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {usagePercent >= 70 ? (
        <AlertCard
          tone={usagePercent >= 90 ? 'danger' : 'warning'}
          icon={AlertTriangle}
          title={
            usagePercent >= 90
              ? 'Quota is almost exhausted'
              : 'Quota usage is getting high'
          }
          description={
            isUser
              ? `Your company has used ${usagePercent}% of its SMS quota. Contact an admin if sending becomes limited.`
              : `You have used ${usagePercent}% of your SMS quota. Consider upgrading the subscription plan.`
          }
        />
      ) : null}

      {(traffic?.deadLetterMessages ?? 0) > 0 ? (
        <AlertCard
          tone="danger"
          icon={AlertOctagon}
          title="Dead-letter messages need attention"
          description={`${traffic?.deadLetterMessages} message${
            (traffic?.deadLetterMessages ?? 0) > 1 ? 's are' : ' is'
          } in dead-letter status. Review and retry failed deliveries.`}
        />
      ) : null}

      <section>
        <div className="overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-md sm:p-6">
          <div className="mb-5">
            <h3 className="text-lg font-black text-slate-900">SMC Traffic</h3>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['today', 'week', 'month', 'year'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPeriod(item)}
                className={`rounded-full px-4 py-2 text-xs font-bold capitalize transition ${
                  period === item
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="mx-auto mt-6 grid w-full max-w-[760px] grid-cols-1 gap-6 xl:grid-cols-[220px_minmax(0,1fr)] xl:items-center">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap gap-2 xl:max-w-[220px] xl:flex-col">
                {[
                  {
                    label: 'Sent',
                    val: traffic?.sentMessages,
                    t: 'sent',
                    path: 'sent',
                  },
                  {
                    label: 'Delivered',
                    val: traffic?.deliveredMessages,
                    t: 'delivered',
                    path: 'sent',
                  },
                  {
                    label: 'Queued',
                    val: traffic?.queuedMessages,
                    t: 'queued',
                    path: 'sent',
                  },
                  {
                    label: 'Failed',
                    val: traffic?.failedMessages,
                    t: 'failed',
                    path: 'failed',
                  },
                  {
                    label: 'Dead Letter',
                    val: traffic?.deadLetterMessages,
                    t: 'dead',
                    path: 'failed',
                  },
                ].map((link) => (
                  <TrafficLink
                    key={link.label}
                    href={`/messages/${link.path}`}
                    title={link.label}
                    value={link.val ?? 0}
                    tone={
                      link.t as
                        | 'sent'
                        | 'delivered'
                        | 'queued'
                        | 'failed'
                        | 'dead'
                    }
                  />
                ))}
              </div>
            </div>

            <div className="min-w-0">
              <div className="mx-auto flex h-[260px] w-full max-w-[280px] items-center justify-center sm:h-[320px] sm:max-w-[360px] xl:h-[360px] xl:max-w-[450px]">
                {messageBreakdown.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer key={chartKey} width="100%" height="100%">
                    <PieChart
                      margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
                    >
                      <Pie
                        data={messageBreakdown}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius="72%"
                        label={({ percent }) =>
                          `${(percent * 100).toFixed(0)}%`
                        }
                        isAnimationActive
                        animationBegin={0}
                        animationDuration={650}
                        animationEasing="ease-out"
                      >
                        {messageBreakdown.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={STATUS_COLORS[entry.name] ?? '#64748b'}
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

      <section className="overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-md sm:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-lg font-black text-slate-900">
              Recent Messages
            </h3>
            <p className="text-sm text-slate-500">
              Latest SMS activity from this tenant.
            </p>
          </div>

          <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
            {stats?.recentMessages?.length ?? 0} latest
          </span>
        </div>

        {!stats?.recentMessages?.length ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-100 py-12 text-center text-sm text-slate-400">
            No recent messages.
          </div>
        ) : (
          <div className="space-y-3">
            {stats.recentMessages.map((message) => (
              <div
                key={message.id}
                className="group rounded-2xl border border-slate-100 bg-white px-4 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-100 hover:bg-slate-50 hover:shadow-sm"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <p className="break-words font-bold text-slate-900 transition group-hover:text-blue-700">
                      {message.recipient}
                    </p>
                    <p className="mt-1 line-clamp-2 break-words text-sm text-slate-600">
                      {message.content}
                    </p>
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
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon,
  helper,
  tone = 'default',
}: {
  title: string;
  value: string | number;
  icon: LucideIcon;
  helper: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  const toneClasses = {
    default: {
      card: 'border-slate-100 hover:border-blue-100',
      icon: 'bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600',
      value: 'text-slate-950',
    },
    warning: {
      card: 'border-yellow-200 hover:border-yellow-300',
      icon: 'bg-yellow-50 text-yellow-700',
      value: 'text-yellow-800',
    },
    danger: {
      card: 'border-rose-200 hover:border-rose-300',
      icon: 'bg-rose-50 text-rose-700',
      value: 'text-rose-800',
    },
  }[tone];

  return (
    <div
      className={`group rounded-2xl border bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${toneClasses.card}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
            {title}
          </p>
          <p
            className={`mt-3 text-4xl font-black tracking-tight ${toneClasses.value}`}
          >
            {value}
          </p>
        </div>

        <div
          className={`rounded-2xl p-3 transition-all duration-300 group-hover:scale-110 ${toneClasses.icon}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-500">{helper}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-md sm:p-6 ${className}`}
    >
      <div className="mb-4">
        <h3 className="text-lg font-black text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>

      <div className="h-[320px] min-w-0">{children}</div>
    </div>
  );
}

function AlertCard({
  tone,
  icon: Icon,
  title,
  description,
}: {
  tone: 'warning' | 'danger';
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  const classes =
    tone === 'danger'
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : 'border-yellow-200 bg-yellow-50 text-yellow-800';

  return (
    <div className={`rounded-2xl border px-5 py-4 ${classes}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <p className="font-black">{title}</p>
          <p className="mt-1 text-sm">{description}</p>
        </div>
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
  if (usagePercent >= 90) return 'bg-red-400';
  if (usagePercent >= 70) return 'bg-yellow-400';
  return 'bg-blue-400';
}

function getStatusClass(status: string) {
  switch (status) {
    case 'delivered':
      return 'border-green-100 bg-green-50 text-green-700';
    case 'sent':
      return 'border-emerald-100 bg-emerald-50 text-emerald-700';
    case 'failed':
      return 'border-red-100 bg-red-50 text-red-700';
    case 'dead_letter':
      return 'border-rose-200 bg-rose-50 text-rose-800';
    case 'queued':
      return 'border-blue-100 bg-blue-50 text-blue-700';
    case 'processing':
      return 'border-yellow-100 bg-yellow-50 text-yellow-700';
    default:
      return 'border-slate-100 bg-slate-50 text-slate-600';
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'delivered':
      return <CheckCircle2 className="h-3.5 w-3.5" />;
    case 'sent':
      return <Send className="h-3.5 w-3.5" />;
    case 'failed':
      return <AlertTriangle className="h-3.5 w-3.5" />;
    case 'dead_letter':
      return <AlertOctagon className="h-3.5 w-3.5" />;
    case 'queued':
      return <Clock className="h-3.5 w-3.5" />;
    case 'processing':
      return <Activity className="h-3.5 w-3.5" />;
    default:
      return <Radio className="h-3.5 w-3.5" />;
  }
}

function formatStatus(status: string) {
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-10 w-full max-w-72 animate-pulse rounded-xl bg-slate-100" />
      <div className="h-56 animate-pulse rounded-[2rem] bg-slate-100" />
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
}: {
  href: string;
  title: string;
  value: number;
  tone: 'sent' | 'delivered' | 'queued' | 'failed' | 'dead';
}) {
  const classes = {
    sent: 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100',
    delivered: 'bg-green-50 text-green-700 border-green-100 hover:bg-green-100',
    queued: 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100',
    failed: 'bg-red-50 text-red-700 border-red-100 hover:bg-red-100',
    dead: 'bg-rose-50 text-rose-700 border-rose-100 hover:bg-rose-100',
  }[tone];

  return (
    <Link
      href={href}
      className={`inline-flex max-w-full items-center justify-between gap-3 rounded-full border px-4 py-2 text-sm font-bold transition ${classes}`}
    >
      <span className="truncate">{title}</span>
      <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-xs">
        {value}
      </span>
    </Link>
  );
}