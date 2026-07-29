'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { ui } from '@/lib/ui';

type MessageStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'scheduled'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'dead_letter'
  | 'cancelled';

type Message = {
  id: string;
  tenantId?: string;
  campaignId?: string | null;
  createdByUserId?: string | null;
  recipient: string;
  content: string;
  status: MessageStatus;
  providerMessageId?: string | null;
  providerName?: string | null;
  providerStatus?: string | null;
  providerErrorCode?: string | null;
  failureType?: string | null;
  errorMessage?: string | null;
  retryCount?: number;
  idempotencyKey?: string | null;
  scheduledJobId?: string | null;
  createdAt: string;
  scheduledAt?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  deadLetteredAt?: string | null;
  updatedAt?: string;
};

type MessagesResponse = {
  data: Message[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type MessagesTab =
  | 'outbound'
  | 'delivered'
  | 'failed'
  | 'dead_letter'
  | 'scheduled'
  | 'cancelled';

type TabItem = {
  key: MessagesTab;
  label: string;
  description: string;
  href: string;
};

type MessagesPageMode = 'company' | 'operations';

const companyOutboxTabs: TabItem[] = [
  {
    key: 'outbound',
    label: 'Outbox',
    description: 'Messages waiting, processing, or submitted to the provider',
    href: '/messages/outbox',
  },
  {
    key: 'delivered',
    label: 'Delivered',
    description: 'Confirmed delivered messages',
    href: '/messages/delivered',
  },
  {
    key: 'failed',
    label: 'Failed',
    description: 'Temporary failures that can be retried',
    href: '/messages/failed',
  },
  {
    key: 'dead_letter',
    label: 'Dead Letter',
    description: 'Final or retry-exhausted delivery failures',
    href: '/messages/dead-letter',
  },
];

const companyScheduledTabs: TabItem[] = [
  {
    key: 'scheduled',
    label: 'Pending',
    description: 'Scheduled messages waiting to send',
    href: '/messages/scheduled',
  },
  {
    key: 'cancelled',
    label: 'Cancelled',
    description: 'Cancelled scheduled messages',
    href: '/messages/scheduled/cancelled',
  },
];

const operationsTabs: TabItem[] = [
  {
    key: 'outbound',
    label: 'Outbound Flow',
    description: 'Messages waiting, processing, or submitted to the provider',
    href: '/delivery-operations/outbound',
  },
  {
    key: 'delivered',
    label: 'Delivered',
    description: 'Confirmed provider delivery events',
    href: '/delivery-operations/delivered',
  },
  {
    key: 'failed',
    label: 'Failed Deliveries',
    description: 'Temporary provider or gateway failures',
    href: '/delivery-operations/failed',
  },
  {
    key: 'dead_letter',
    label: 'Dead Letter',
    description: 'Final or retry-exhausted delivery failures',
    href: '/delivery-operations/dead-letter',
  },
];

const actionButtonBase =
  'inline-flex h-8 w-24 items-center justify-center whitespace-nowrap rounded-lg border px-2 text-[11px] font-bold transition disabled:opacity-60';

const mobileActionButtonBase =
  'inline-flex h-9 flex-1 items-center justify-center whitespace-nowrap rounded-xl border px-3 text-xs font-bold transition disabled:opacity-60';

function getStatusColor(status: MessageStatus) {
  switch (status) {
    case 'delivered':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'sent':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'scheduled':
      return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    case 'cancelled':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    case 'failed':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'dead_letter':
      return 'bg-rose-100 text-rose-700 border-rose-200';
    case 'queued':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'processing':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case 'pending':
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

function formatStatus(status: string) {
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function getCurrentUserRole() {
  const token = getToken();

  if (!token) return null;

  try {
    const payload = token.split('.')[1];

    if (!payload) return null;

    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(
      normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
      '=',
    );

    const decoded = JSON.parse(window.atob(paddedPayload)) as {
      role?: string;
      user?: { role?: string };
    };

    return (decoded.role ?? decoded.user?.role ?? '').toLowerCase() || null;
  } catch {
    return null;
  }
}

function maskRecipient(recipient?: string | null) {
  if (!recipient) return 'Restricted';

  const value = String(recipient).trim();

  if (value.length <= 4) return '****';
  if (value.length <= 7) return `${value.slice(0, 2)}****${value.slice(-2)}`;

  return `${value.slice(0, 3)}****${value.slice(-3)}`;
}

function getDisplayRecipient(message: Message, restricted: boolean) {
  return restricted ? maskRecipient(message.recipient) : message.recipient;
}

function getDisplayContent(message: Message, restricted: boolean) {
  return restricted ? 'Restricted for privacy' : message.content;
}

function humanizeValue(value?: string | null) {
  if (!value) return 'Not provided';

  return value
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getFailureSummary(message: Message) {
  const failureType = (message.failureType || '').toLowerCase();
  const errorMessage = (message.errorMessage || '').toLowerCase();
  const providerStatus = (message.providerStatus || '').toLowerCase();

  if (message.status === 'dead_letter') {
    if (failureType.includes('retry')) return 'Retry limit reached';
    if (failureType.includes('permanent')) return 'Permanent delivery failure';
    return 'Moved to dead letter';
  }

  if (failureType.includes('quota')) return 'Quota or subscription blocked';
  if (failureType.includes('recipient') || errorMessage.includes('recipient')) {
    return 'Recipient issue';
  }
  if (failureType.includes('provider') || providerStatus) {
    return 'Provider delivery failure';
  }
  if (message.providerErrorCode) return 'Provider returned an error';
  if (message.errorMessage) return 'Delivery failed';

  return 'Delivery issue';
}

function getFailureReason(message: Message) {
  if (message.errorMessage) return message.errorMessage;
  if (message.providerStatus) return message.providerStatus;
  if (message.failureType) return humanizeValue(message.failureType);
  if (message.status === 'dead_letter') {
    return 'The message reached a final failure state and needs manual review.';
  }

  return 'No detailed failure reason was provided by the gateway.';
}

function getFailureTone(status: MessageStatus) {
  return status === 'dead_letter'
    ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
    : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100';
}

function getLastActivityAt(message: Message) {
  return (
    message.deadLetteredAt ||
    message.deliveredAt ||
    message.sentAt ||
    message.updatedAt ||
    message.scheduledAt ||
    message.createdAt
  );
}

function getProviderLabel(message: Message) {
  if (message.providerName && message.providerMessageId) {
    return `${message.providerName} • ${message.providerMessageId}`;
  }

  return message.providerName || message.providerMessageId || '—';
}

function buildQueryPath(path: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function getApiPathForTab(tab: MessagesTab, search?: string) {
  const params = new URLSearchParams();

  if (search?.trim()) {
    params.set('search', search.trim());
  }

  if (tab === 'outbound') {
    params.set('statuses', 'pending,queued,processing,sent');
    return buildQueryPath('/messages', params);
  }

  if (tab === 'delivered') {
    params.set('status', 'delivered');
    return buildQueryPath('/messages', params);
  }

  if (tab === 'failed') {
    params.set('status', 'failed');
    return buildQueryPath('/messages/failed', params);
  }

  if (tab === 'dead_letter') {
    return buildQueryPath('/messages/dead-letter', params);
  }

  if (tab === 'scheduled') {
    params.set('status', 'scheduled');
    return buildQueryPath('/messages', params);
  }

  if (tab === 'cancelled') {
    params.set('status', 'cancelled');
    return buildQueryPath('/messages', params);
  }

  return buildQueryPath('/messages', params);
}

export default function MessagesListPage({
  initialTab,
  mode = 'company',
}: {
  initialTab: MessagesTab;
  mode?: MessagesPageMode;
}) {
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [retryConfirmId, setRetryConfirmId] = useState<string | null>(null);
  const [errorDetailMessage, setErrorDetailMessage] = useState<Message | null>(
    null,
  );
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const currentUserRole = useMemo(() => getCurrentUserRole(), []);
  const isSuperAdmin = currentUserRole === 'super_admin';
  const isOperationsMode = mode === 'operations';
  const restrictedView = isOperationsMode || isSuperAdmin;

  const isScheduledSection =
    initialTab === 'scheduled' || initialTab === 'cancelled';

  const visibleTabs = isOperationsMode
    ? operationsTabs
    : isScheduledSection
      ? companyScheduledTabs
      : companyOutboxTabs;

  const showFailureDetails =
    initialTab === 'failed' || initialTab === 'dead_letter';

  const visibleMessages = useMemo(() => {
    if (initialTab === 'outbound') {
      return messages.filter((message) =>
        ['pending', 'queued', 'processing', 'sent'].includes(
          message.status,
        ),
      );
    }

    if (initialTab === 'delivered') {
      return messages.filter((message) => message.status === 'delivered');
    }

    if (initialTab === 'failed') {
      return messages.filter((message) => message.status === 'failed');
    }

    if (initialTab === 'dead_letter') {
      return messages.filter((message) => message.status === 'dead_letter');
    }

    if (initialTab === 'scheduled') {
      return messages.filter((message) => message.status === 'scheduled');
    }

    if (initialTab === 'cancelled') {
      return messages.filter((message) => message.status === 'cancelled');
    }

    return messages;
  }, [initialTab, messages]);

  const pageTitle = isOperationsMode
    ? initialTab === 'failed'
      ? 'Failed Delivery Operations'
      : initialTab === 'dead_letter'
        ? 'Dead-Letter Operations'
        : initialTab === 'delivered'
          ? 'Delivered Operations'
          : 'Outbound Delivery Flow'
    : isScheduledSection
      ? 'Scheduled Messages'
      : initialTab === 'failed'
        ? 'Failed Messages'
        : initialTab === 'dead_letter'
          ? 'Dead Letter Messages'
          : initialTab === 'delivered'
            ? 'Delivered Messages'
            : 'Outbox';

  const pageDescription = isOperationsMode
    ? 'Monitor platform SMS delivery status, provider errors, and dead-letter operations without exposing company message content.'
    : isScheduledSection
      ? 'Manage pending and cancelled scheduled SMS messages.'
      : initialTab === 'failed'
        ? 'Review temporary delivery failures and retry messages when appropriate.'
        : initialTab === 'dead_letter'
          ? 'Review final or retry-exhausted delivery failures that need attention.'
          : initialTab === 'delivered'
            ? 'Review messages confirmed as delivered to recipients.'
            : 'Monitor messages waiting, processing, or submitted to the provider.';

  const loadMessages = useCallback(async () => {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    try {
      setError('');
      setPageLoading(true);

      const response = await apiFetch<MessagesResponse>(
        getApiPathForTab(initialTab, debouncedSearch),
        undefined,
        token,
      );

      setMessages(response.data);
    } catch (error) {
      console.error('Failed to load messages', error);
      setError('Failed to load messages');
    } finally {
      setPageLoading(false);
    }
  }, [initialTab, debouncedSearch]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  async function cancelScheduledMessage(id: string) {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    setActionLoadingId(id);

    try {
      await apiFetch(
        `/messages/${id}/cancel`,
        {
          method: 'PATCH',
        },
        token,
      );

      toast.success('Scheduled message cancelled');
      await loadMessages();
    } catch (error) {
      console.error('Failed to cancel scheduled message', error);
      toast.error('Failed to cancel scheduled message');
    } finally {
      setActionLoadingId(null);
    }
  }

  async function retryMessage(id: string) {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    setActionLoadingId(id);

    try {
      await apiFetch(
        `/messages/${id}/retry`,
        {
          method: 'PATCH',
        },
        token,
      );

      toast.success('Message queued for retry');
      setRetryConfirmId(null);
      await loadMessages();
    } catch (error) {
      console.error('Failed to retry message', error);
      toast.error('Failed to retry message');
    } finally {
      setActionLoadingId(null);
    }
  }

  function openMessage(id: string) {
    if (isOperationsMode) return;

    router.push(`/messages/${id}`);
  }

  function scheduleAgain(message: Message) {
    if (isOperationsMode) return;

    const params = new URLSearchParams({
      recipient: message.recipient,
      content: message.content,
      mode: 'schedule',
    });

    router.push(`/messages/new?${params.toString()}`);
  }

  function renderActions(message: Message, mobile = false) {
    const retryable =
      !restrictedView && ['failed', 'dead_letter'].includes(message.status);
    const cancellable = !isOperationsMode && message.status === 'scheduled';
    const reschedulable = !isOperationsMode && message.status === 'cancelled';

    const base = mobile ? mobileActionButtonBase : actionButtonBase;

    return (
      <>
        {retryable ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRetryConfirmId(message.id);
            }}
            disabled={actionLoadingId === message.id}
            className={`${base} border-red-200 bg-red-50 text-red-700 hover:bg-red-100`}
          >
            Retry
          </button>
        ) : null}

        {cancellable ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              cancelScheduledMessage(message.id);
            }}
            disabled={actionLoadingId === message.id}
            className={`${base} border-red-200 bg-red-50 text-red-700 hover:bg-red-100`}
          >
            {actionLoadingId === message.id ? 'Cancelling' : 'Cancel'}
          </button>
        ) : null}

        {reschedulable ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              scheduleAgain(message);
            }}
            className={`${base} border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100`}
          >
            Reschedule
          </button>
        ) : null}

        {!retryable && !cancellable && !reschedulable ? (
          <span
            className={
              mobile
                ? 'inline-flex h-9 flex-1 items-center justify-center text-xs text-slate-400'
                : 'inline-flex h-8 w-24 items-center justify-center text-xs text-slate-400'
            }
          >
            —
          </span>
        ) : null}
      </>
    );
  }

  function renderFailureAction(message: Message) {
    if (!showFailureDetails && !message.errorMessage) return null;

    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setErrorDetailMessage(message);
        }}
        className={`mt-3 flex w-full max-w-[520px] items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${
          showFailureDetails
            ? getFailureTone(message.status)
            : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
        }`}
        title={getFailureReason(message)}
      >
        <span className="min-w-0">
          <span className="block text-[11px] font-black uppercase tracking-wide opacity-80">
            Delivery issue
          </span>
          <span className="block truncate text-xs font-bold">
            {showFailureDetails
              ? getFailureSummary(message)
              : message.errorMessage}
          </span>
        </span>

        <span className="shrink-0 rounded-lg bg-white/70 px-2 py-1 text-[11px] font-black shadow-sm">
          View details
        </span>
      </button>
    );
  }

  return (
    <div className={ui.page}>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 to-slate-800 px-4 py-5 text-white sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold">{pageTitle}</h2>

              <p className="mt-1 text-sm leading-6 text-slate-300">
                {pageDescription}
              </p>
            </div>

            {!isOperationsMode ? (
              <button
                type="button"
                onClick={() => router.push('/messages/new')}
                className="inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-slate-100 sm:w-auto"
              >
                + New Message
              </button>
            ) : null}
          </div>
        </div>

        <div className="border-b border-slate-100 bg-slate-50 p-3 sm:p-4">
          <div
            className={`grid gap-2 ${
              isScheduledSection
                ? 'grid-cols-2'
                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
            }`}
          >
            {visibleTabs.map((tab) => {
              const active = initialTab === tab.key;

              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  className={`rounded-xl border px-3 py-3 text-left transition sm:px-4 ${
                    active
                      ? 'border-blue-200 bg-white shadow-sm ring-2 ring-blue-100'
                      : 'border-transparent bg-transparent hover:border-slate-200 hover:bg-white'
                  }`}
                >
                  <p
                    className={`text-sm font-bold ${
                      active ? 'text-blue-700' : 'text-slate-800'
                    }`}
                  >
                    {tab.label}
                  </p>

                  <p className="mt-1 hidden text-xs text-slate-500 lg:block">
                    {tab.description}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="border-b border-slate-100 bg-white p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <label className="sr-only">Search messages</label>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${ui.input} transition focus:ring-4 focus:ring-blue-100`}
                placeholder={
                  isOperationsMode
                    ? 'Search by masked phone, error, provider, or status...'
                    : 'Search by phone, content, error, or provider status...'
                }
              />
            </div>

            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className={`${ui.secondaryButton} w-full justify-center sm:w-auto`}
              >
                Clear
              </button>
            ) : null}
          </div>

          {debouncedSearch ? (
            <p className="mt-2 text-xs font-medium text-slate-500">
              Searching for “{debouncedSearch}”
            </p>
          ) : null}
        </div>

        {isOperationsMode ? (
          <div className="border-b border-slate-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 sm:px-6">
            Message bodies are hidden for platform administrators. Use this page for delivery operations, provider failures, and gateway troubleshooting only.
          </div>
        ) : null}

        <div className="p-4 sm:p-6">
          {error ? <div className={ui.alertError}>{error}</div> : null}

          {pageLoading ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-14 text-center text-slate-500">
              Loading messages...
            </div>
          ) : visibleMessages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-14 text-center">
              <p className="font-semibold text-slate-700">
                {debouncedSearch
                  ? 'No message matched your search.'
                  : 'No message found.'}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Messages matching this view will appear here.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {visibleMessages.map((message) => (
                  <MessageMobileCard
                    key={message.id}
                    message={message}
                    initialTab={initialTab}
                    restricted={restrictedView}
                    onOpen={() => openMessage(message.id)}
                    renderActions={renderActions}
                    renderFailureAction={renderFailureAction}
                  />
                ))}
              </div>

              <div className="hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
                <div className="overflow-x-auto">
                  <StatusAwareTable
                    messages={visibleMessages}
                    initialTab={initialTab}
                    restricted={restrictedView}
                    onOpen={openMessage}
                    renderActions={renderActions}
                    renderFailureAction={renderFailureAction}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {retryConfirmId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <h3 className="text-lg font-black text-slate-900">
              Retry failed message?
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              This will queue the SMS again and may consume SMS quota if the
              provider accepts it.
            </p>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setRetryConfirmId(null)}
                disabled={actionLoadingId === retryConfirmId}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={actionLoadingId === retryConfirmId}
                onClick={() => retryMessage(retryConfirmId)}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoadingId === retryConfirmId
                  ? 'Retrying...'
                  : 'Confirm Retry'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {errorDetailMessage ? (
        <ErrorDetailsModal
          message={errorDetailMessage}
          restricted={restrictedView}
          onClose={() => setErrorDetailMessage(null)}
        />
      ) : null}
    </div>
  );
}

function StatusAwareTable({
  messages,
  initialTab,
  restricted,
  onOpen,
  renderActions,
  renderFailureAction,
}: {
  messages: Message[];
  initialTab: MessagesTab;
  restricted: boolean;
  onOpen: (id: string) => void;
  renderActions: (message: Message) => ReactNode;
  renderFailureAction: (message: Message) => ReactNode;
}) {
  if (initialTab === 'delivered') {
    return (
      <table className="w-full table-fixed text-sm">
        <TableHead
          columns={[
            ['w-32', 'Recipient'],
            ['', 'Content'],
            ['w-36', 'Sent At'],
            ['w-36', 'Delivered At'],
            ['w-44', 'Provider Ref'],
            ['w-32 text-right', 'Action'],
          ]}
        />

        <tbody className="divide-y divide-slate-100 bg-white">
          {messages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              restricted={restricted}
              onOpen={onOpen}
            >
              <td className="w-32 truncate px-3 py-4 align-top font-semibold text-slate-900">
                {getDisplayRecipient(message, restricted)}
              </td>
              <MessageContentCell
                message={message}
                restricted={restricted}
                renderFailureAction={renderFailureAction}
              />
              <DateCell value={message.sentAt} />
              <DateCell value={message.deliveredAt} />
              <ProviderCell message={message} />
              <ActionCell>{renderActions(message)}</ActionCell>
            </MessageRow>
          ))}
        </tbody>
      </table>
    );
  }

  if (initialTab === 'failed') {
    return (
      <table className="w-full table-fixed text-sm">
        <TableHead
          columns={[
            ['w-32', 'Recipient'],
            ['', 'Content'],
            ['w-32', 'Status'],
            ['w-24', 'Retries'],
            ['w-36', 'Last Attempt'],
            ['w-32 text-right', 'Action'],
          ]}
        />

        <tbody className="divide-y divide-slate-100 bg-white">
          {messages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              restricted={restricted}
              onOpen={onOpen}
            >
              <td className="w-32 truncate px-3 py-4 align-top font-semibold text-slate-900">
                {getDisplayRecipient(message, restricted)}
              </td>
              <MessageContentCell
                message={message}
                restricted={restricted}
                renderFailureAction={renderFailureAction}
              />
              <StatusCell status={message.status} />
              <td className="w-24 px-3 py-4 align-top text-xs font-bold text-slate-700">
                {message.retryCount ?? 0}
              </td>
              <DateCell value={getLastActivityAt(message)} />
              <ActionCell>{renderActions(message)}</ActionCell>
            </MessageRow>
          ))}
        </tbody>
      </table>
    );
  }

  if (initialTab === 'dead_letter') {
    return (
      <table className="w-full table-fixed text-sm">
        <TableHead
          columns={[
            ['w-32', 'Recipient'],
            ['', 'Content'],
            ['w-24', 'Retries'],
            ['w-36', 'Dead Lettered'],
            ['w-32 text-right', 'Action'],
          ]}
        />

        <tbody className="divide-y divide-slate-100 bg-white">
          {messages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              restricted={restricted}
              onOpen={onOpen}
            >
              <td className="w-32 truncate px-3 py-4 align-top font-semibold text-slate-900">
                {getDisplayRecipient(message, restricted)}
              </td>
              <MessageContentCell
                message={message}
                restricted={restricted}
                renderFailureAction={renderFailureAction}
              />
              <td className="w-24 px-3 py-4 align-top text-xs font-bold text-slate-700">
                {message.retryCount ?? 0}
              </td>
              <DateCell
                value={
                  message.deadLetteredAt || message.updatedAt || message.createdAt
                }
              />
              <ActionCell>{renderActions(message)}</ActionCell>
            </MessageRow>
          ))}
        </tbody>
      </table>
    );
  }

  if (initialTab === 'scheduled') {
    return (
      <table className="w-full table-fixed text-sm">
        <TableHead
          columns={[
            ['w-32', 'Recipient'],
            ['', 'Content'],
            ['w-36', 'Scheduled For'],
            ['w-36', 'Created'],
            ['w-32 text-right', 'Action'],
          ]}
        />

        <tbody className="divide-y divide-slate-100 bg-white">
          {messages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              restricted={restricted}
              onOpen={onOpen}
            >
              <td className="w-32 truncate px-3 py-4 align-top font-semibold text-slate-900">
                {getDisplayRecipient(message, restricted)}
              </td>
              <MessageContentCell
                message={message}
                restricted={restricted}
                renderFailureAction={renderFailureAction}
              />
              <DateCell value={message.scheduledAt} strong />
              <DateCell value={message.createdAt} />
              <ActionCell>{renderActions(message)}</ActionCell>
            </MessageRow>
          ))}
        </tbody>
      </table>
    );
  }

  if (initialTab === 'cancelled') {
    return (
      <table className="w-full table-fixed text-sm">
        <TableHead
          columns={[
            ['w-32', 'Recipient'],
            ['', 'Content'],
            ['w-36', 'Scheduled For'],
            ['w-36', 'Cancelled At'],
            ['w-32 text-right', 'Action'],
          ]}
        />

        <tbody className="divide-y divide-slate-100 bg-white">
          {messages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              restricted={restricted}
              onOpen={onOpen}
            >
              <td className="w-32 truncate px-3 py-4 align-top font-semibold text-slate-900">
                {getDisplayRecipient(message, restricted)}
              </td>
              <MessageContentCell
                message={message}
                restricted={restricted}
                renderFailureAction={renderFailureAction}
              />
              <DateCell value={message.scheduledAt} />
              <DateCell value={message.updatedAt || message.createdAt} />
              <ActionCell>{renderActions(message)}</ActionCell>
            </MessageRow>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <table className="w-full table-fixed text-sm">
      <TableHead
        columns={[
          ['w-32', 'Recipient'],
          ['', 'Content'],
          ['w-32', 'Status'],
          ['w-36', 'Created'],
          ['w-36', 'Last Updated'],
          ['w-32 text-right', 'Action'],
        ]}
      />

      <tbody className="divide-y divide-slate-100 bg-white">
        {messages.map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            restricted={restricted}
            onOpen={onOpen}
          >
            <td className="w-32 truncate px-3 py-4 align-top font-semibold text-slate-900">
              {getDisplayRecipient(message, restricted)}
            </td>
            <MessageContentCell
              message={message}
              restricted={restricted}
              renderFailureAction={renderFailureAction}
            />
            <StatusCell status={message.status} />
            <DateCell value={message.createdAt} />
            <DateCell value={message.updatedAt || getLastActivityAt(message)} />
            <ActionCell>{renderActions(message)}</ActionCell>
          </MessageRow>
        ))}
      </tbody>
    </table>
  );
}

function TableHead({
  columns,
}: {
  columns: Array<[className: string, label: string]>;
}) {
  return (
    <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
      <tr>
        {columns.map(([className, label]) => (
          <th key={label} className={`${className} px-3 py-3`}>
            {label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function MessageRow({
  message,
  restricted,
  onOpen,
  children,
}: {
  message: Message;
  restricted: boolean;
  onOpen: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <tr
      onClick={() => onOpen(message.id)}
      className={`transition hover:bg-slate-50 ${
        restricted ? '' : 'cursor-pointer'
      }`}
    >
      {children}
    </tr>
  );
}

function MessageContentCell({
  message,
  restricted,
  renderFailureAction,
}: {
  message: Message;
  restricted: boolean;
  renderFailureAction: (message: Message) => ReactNode;
}) {
  const content = getDisplayContent(message, restricted);

  return (
    <td className="min-w-0 px-3 py-4 align-top text-slate-600">
      <div className="max-w-[520px] truncate leading-5" title={content}>
        {content}
      </div>

      {renderFailureAction(message)}
    </td>
  );
}

function StatusCell({ status }: { status: MessageStatus }) {
  return (
    <td className="w-32 px-3 py-4 align-top">
      <span
        className={`inline-flex h-7 w-24 items-center justify-center rounded-full border px-2 text-[11px] font-bold ${getStatusColor(
          status,
        )}`}
        title={formatStatus(status)}
      >
        <span className="truncate">{formatStatus(status)}</span>
      </span>
    </td>
  );
}

function DateCell({
  value,
  strong = false,
}: {
  value?: string | null;
  strong?: boolean;
}) {
  return (
    <td
      className={`w-36 truncate px-3 py-4 align-top text-xs ${
        strong ? 'font-bold text-slate-800' : 'text-slate-500'
      }`}
      title={value ? formatDate(value) : undefined}
    >
      {formatDate(value)}
    </td>
  );
}

function ProviderCell({ message }: { message: Message }) {
  const value = getProviderLabel(message);

  return (
    <td
      className="w-44 truncate px-3 py-4 align-top text-xs text-slate-500"
      title={value}
    >
      {value}
    </td>
  );
}

function ActionCell({ children }: { children: ReactNode }) {
  return (
    <td className="w-32 px-3 py-4 text-right align-top">
      <div className="flex justify-end">{children}</div>
    </td>
  );
}

function MessageMobileCard({
  message,
  initialTab,
  restricted,
  onOpen,
  renderActions,
  renderFailureAction,
}: {
  message: Message;
  initialTab: MessagesTab;
  restricted: boolean;
  onOpen: () => void;
  renderActions: (message: Message, mobile?: boolean) => ReactNode;
  renderFailureAction: (message: Message) => ReactNode;
}) {
  return (
    <div
      onClick={onOpen}
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 ${
        restricted ? '' : 'cursor-pointer'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-bold text-slate-900">
            {getDisplayRecipient(message, restricted)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Created: {formatDate(message.createdAt)}
          </p>
        </div>

        <span
          className={`inline-flex h-7 w-24 shrink-0 items-center justify-center rounded-full border px-2 text-[11px] font-bold ${getStatusColor(
            message.status,
          )}`}
          title={formatStatus(message.status)}
        >
          <span className="truncate">{formatStatus(message.status)}</span>
        </span>
      </div>

      <p className="mt-3 whitespace-normal break-words text-sm leading-6 text-slate-600">
        {getDisplayContent(message, restricted)}
      </p>

      {renderFailureAction(message)}

      <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-slate-500">
        {initialTab === 'scheduled' || initialTab === 'cancelled' ? (
          <MobileDateRow label="Scheduled" value={message.scheduledAt} />
        ) : null}

        {initialTab === 'cancelled' ? (
          <MobileDateRow
            label="Cancelled"
            value={message.updatedAt || message.createdAt}
          />
        ) : null}

        {initialTab === 'delivered' ? (
          <>
            <MobileDateRow label="Sent" value={message.sentAt} />
            <MobileDateRow label="Delivered" value={message.deliveredAt} />
            <MobileDateRow label="Provider Ref" value={getProviderLabel(message)} />
          </>
        ) : null}

        {initialTab === 'failed' ? (
          <>
            <MobileDateRow label="Retries" value={message.retryCount ?? 0} />
            <MobileDateRow label="Last Attempt" value={getLastActivityAt(message)} />
          </>
        ) : null}

        {initialTab === 'dead_letter' ? (
          <>
            <MobileDateRow label="Retries" value={message.retryCount ?? 0} />
            <MobileDateRow
              label="Dead Lettered"
              value={message.deadLetteredAt || message.updatedAt || message.createdAt}
            />
          </>
        ) : null}

        {initialTab === 'outbound' ? (
          <>
            <MobileDateRow label="Updated" value={message.updatedAt || getLastActivityAt(message)} />
            {message.sentAt ? <MobileDateRow label="Sent" value={message.sentAt} /> : null}
          </>
        ) : null}
      </div>

      <div className="mt-4 flex gap-2">{renderActions(message, true)}</div>
    </div>
  );
}

function MobileDateRow({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  const displayValue =
    typeof value === 'number'
      ? value
      : label === 'Provider Ref'
        ? value || '—'
        : formatDate(value);

  return (
    <div className="flex justify-between gap-3">
      <span className="font-semibold text-slate-400">{label}</span>
      <span className="text-right">{displayValue}</span>
    </div>
  );
}

function ErrorDetailsModal({
  message,
  restricted,
  onClose,
}: {
  message: Message;
  restricted: boolean;
  onClose: () => void;
}) {
  const summary = getFailureSummary(message);
  const reason = getFailureReason(message);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="border-b border-slate-100 bg-slate-950 px-5 py-5 text-white sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                Error details
              </p>
              <h3 className="mt-1 text-xl font-black">{summary}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                Review the delivery failure without crowding the message list.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg font-black text-white transition hover:bg-white/20"
              aria-label="Close error details"
            >
              ×
            </button>
          </div>
        </div>

        <div className="max-h-[calc(90vh-120px)] overflow-y-auto p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <DetailBox label="Status" value={formatStatus(message.status)} />
            <DetailBox label="Retry attempts" value={message.retryCount ?? 0} />
            <DetailBox
              label="Recipient"
              value={getDisplayRecipient(message, restricted)}
            />
          </div>

          <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-amber-700">
              Failure reason
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-amber-900">
              {reason}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DetailBox
              label="Failure category"
              value={humanizeValue(message.failureType)}
            />
            <DetailBox label="Provider" value={message.providerName || 'Not provided'} />
            <DetailBox
              label="Provider code"
              value={message.providerErrorCode || 'Not provided'}
            />
            <DetailBox
              label="Provider message ID"
              value={message.providerMessageId || 'Not provided'}
            />
            <DetailBox label="Created" value={formatDate(message.createdAt)} />
            <DetailBox label="Updated" value={formatDate(message.updatedAt)} />
            <DetailBox label="Sent" value={formatDate(message.sentAt)} />
            <DetailBox label="Delivered" value={formatDate(message.deliveredAt)} />
            <DetailBox
              label="Dead lettered"
              value={formatDate(message.deadLetteredAt)}
            />
            <DetailBox
              label="Scheduled"
              value={formatDate(message.scheduledAt)}
            />
          </div>

          {message.providerStatus ? (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                Provider status
              </p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                {message.providerStatus}
              </p>
            </div>
          ) : null}

          {message.errorMessage ? (
            <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-red-600">
                Technical message
              </p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-red-800">
                {message.errorMessage}
              </p>
            </div>
          ) : null}

          {restricted ? (
            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
              Message body and full recipient are hidden for platform administrators.
              This view is only for delivery operations and gateway troubleshooting.
            </div>
          ) : null}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailBox({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-bold text-slate-900">
        {value}
      </p>
    </div>
  );
}
