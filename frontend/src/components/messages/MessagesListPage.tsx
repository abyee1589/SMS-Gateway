'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { ui } from '@/lib/ui';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

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
  recipient: string;
  content: string;
  status: MessageStatus;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  scheduledAt?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
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

export type MessagesTab = 'all' | 'sent' | 'failed' | 'scheduled' | 'cancelled';

const tabs: {
  key: MessagesTab;
  label: string;
  description: string;
  href: string;
}[] = [
  {
    key: 'all',
    label: 'All',
    description: 'All SMS activity',
    href: '/messages',
  },
  {
    key: 'sent',
    label: 'Sent',
    description: 'Accepted or delivered',
    href: '/messages/sent',
  },
  {
    key: 'failed',
    label: 'Failed',
    description: 'Failed and dead-letter',
    href: '/messages/failed',
  },
  {
    key: 'scheduled',
    label: 'Scheduled',
    description: 'Waiting to send',
    href: '/messages/scheduled',
  },
  {
    key: 'cancelled',
    label: 'Cancelled',
    description: 'Cancelled schedules',
    href: '/messages/cancelled',
  },
];

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
      return 'bg-red-100 text-red-700 border-red-200';
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

function getApiPathForTab(tab: MessagesTab) {
  if (tab === 'scheduled') return '/messages?status=scheduled';
  if (tab === 'cancelled') return '/messages?status=cancelled';

  return '/messages';
}

const actionButtonBase =
  'inline-flex h-8 w-24 items-center justify-center whitespace-nowrap rounded-lg border px-2 text-[11px] font-bold transition disabled:opacity-60';

export default function MessagesListPage({
  initialTab,
}: {
  initialTab: MessagesTab;
}) {
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [retryConfirmId, setRetryConfirmId] = useState<string | null>(null);

  const visibleMessages = useMemo(() => {
    if (initialTab === 'sent') {
      return messages.filter((message) =>
        ['sent', 'delivered'].includes(message.status),
      );
    }

    if (initialTab === 'failed') {
      return messages.filter((message) =>
        ['failed', 'dead_letter'].includes(message.status),
      );
    }

    return messages;
  }, [initialTab, messages]);

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
        getApiPathForTab(initialTab),
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
  }, [initialTab]);

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
    router.push(`/messages/${id}`);
  }

  function scheduleAgain(message: Message) {
    const params = new URLSearchParams({
      recipient: message.recipient,
      content: message.content,
      mode: 'schedule',
    });

    router.push(`/messages/new?${params.toString()}`);
  }

  return (
    <div className={ui.page}>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 to-slate-800 px-6 py-5 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Messages</h2>
              <p className="mt-1 text-sm text-slate-300">
                Monitor scheduled, sent, delivered, failed, and cancelled SMS
                messages.
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push('/messages/new')}
              className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-slate-100"
            >
              + New Message
            </button>
          </div>
        </div>

        <div className="border-b border-slate-100 bg-slate-50 p-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {tabs.map((tab) => {
              const active = initialTab === tab.key;

              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
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

        <div className="p-6">
          {error ? <div className={ui.alertError}>{error}</div> : null}

          {pageLoading ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-14 text-center text-slate-500">
              Loading messages...
            </div>
          ) : visibleMessages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-14 text-center">
              <p className="font-semibold text-slate-700">No messages found</p>
              <p className="mt-1 text-sm text-slate-500">
                Messages matching this view will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full table-fixed text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-32 px-3 py-3">Recipient</th>
                      <th className="px-3 py-3">Content</th>
                      <th className="w-32 px-3 py-3">Status</th>
                      <th className="w-36 px-3 py-3">Scheduled At</th>
                      <th className="w-36 px-3 py-3">Created</th>
                      <th className="w-36 px-3 py-3">Sent At</th>
                      <th className="w-32 px-3 py-3 text-right">Action</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {visibleMessages.map((message) => {
                      const retryable = ['failed', 'dead_letter'].includes(
                        message.status,
                      );
                      const cancellable = message.status === 'scheduled';
                      const reschedulable = message.status === 'cancelled';

                      return (
                        <tr
                          key={message.id}
                          onClick={() => openMessage(message.id)}
                          className="cursor-pointer transition hover:bg-slate-50"
                        >
                          <td className="w-32 truncate px-3 py-4 align-top font-semibold text-slate-900">
                            {message.recipient}
                          </td>

                          <td className="min-w-0 px-3 py-4 align-top text-slate-600">
                            <div className="max-w-full whitespace-normal break-words leading-5">
                              {message.content}
                            </div>

                            {message.errorMessage ? (
                              <p className="mt-2 max-w-full whitespace-normal break-words text-xs font-medium leading-5 text-red-600">
                                Error: {message.errorMessage}
                              </p>
                            ) : null}
                          </td>

                          <td className="w-32 px-3 py-4 align-top">
                            <span
                              className={`inline-flex h-7 w-24 items-center justify-center rounded-full border px-2 text-[11px] font-bold ${getStatusColor(
                                message.status,
                              )}`}
                              title={formatStatus(message.status)}
                            >
                              <span className="truncate">
                                {formatStatus(message.status)}
                              </span>
                            </span>
                          </td>

                          <td className="w-36 truncate px-3 py-4 align-top text-xs text-slate-500">
                            {formatDate(message.scheduledAt)}
                          </td>

                          <td className="w-36 truncate px-3 py-4 align-top text-xs text-slate-500">
                            {formatDate(message.createdAt)}
                          </td>

                          <td className="w-36 truncate px-3 py-4 align-top text-xs text-slate-500">
                            {formatDate(message.sentAt)}
                          </td>

                          <td className="w-32 px-3 py-4 text-right align-top">
                            <div className="flex justify-end">
                              {retryable ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRetryConfirmId(message.id);
                                  }}
                                  disabled={actionLoadingId === message.id}
                                  className={`${actionButtonBase} border-red-200 bg-red-50 text-red-700 hover:bg-red-100`}
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
                                  className={`${actionButtonBase} border-red-200 bg-red-50 text-red-700 hover:bg-red-100`}
                                >
                                  {actionLoadingId === message.id
                                    ? 'Cancelling'
                                    : 'Cancel'}
                                </button>
                              ) : null}

                              {reschedulable ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    scheduleAgain(message);
                                  }}
                                  className={`${actionButtonBase} border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100`}
                                >
                                  Reschedule
                                </button>
                              ) : null}

                              {!retryable && !cancellable && !reschedulable ? (
                                <span className="inline-flex h-8 w-24 items-center justify-center text-xs text-slate-400">
                                  —
                                </span>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {retryConfirmId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900">
              Retry failed message?
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              This will queue the failed SMS again and may consume SMS quota if
              the provider accepts it.
            </p>

            <div className="mt-6 flex justify-end gap-3">
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
    </div>
  );
}