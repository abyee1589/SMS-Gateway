'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { ui } from '@/lib/ui';

type Message = {
  id: string;
  recipient: string;
  content: string;
  status: string;
  providerMessageId?: string | null;
  providerName?: string | null;
  providerStatus?: string | null;
  providerErrorCode?: string | null;
  errorMessage?: string | null;
  failureType?: string | null;
  retryCount: number;
  createdAt: string;
  sentAt?: string | null;
  deliveredAt?: string | null;
  deadLetteredAt?: string | null;
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

type StatusFilter = 'failed' | 'dead_letter';

export default function DeadLetterPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>('dead_letter');
  const [pageLoading, setPageLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmRetryId, setConfirmRetryId] = useState<string | null>(null);

  async function loadMessages(filter: StatusFilter) {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    try {
      setError('');
      setPageLoading(true);

      const response = await apiFetch<MessagesResponse>(
        `/messages?status=${filter}`,
        undefined,
        token,
      );

      setMessages(response.data);
    } catch (error) {
      console.error('Failed to load failed/dead-letter messages', error);
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to load failed/dead-letter messages',
      );
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    loadMessages(statusFilter);
  }, [statusFilter]);

  async function handleRetry(messageId: string) {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    try {
      setRetryingId(messageId);
      setError('');
      setSuccess('');

      await apiFetch(
        `/messages/${messageId}/retry`,
        {
          method: 'PATCH',
        },
        token,
      );

      setSuccess('Message requeued successfully');
      setConfirmRetryId(null);
      await loadMessages(statusFilter);
    } catch (error) {
      console.error('Failed to retry message', error);
      setError(error instanceof Error ? error.message : 'Failed to retry message');
      setSuccess('');
    } finally {
      setRetryingId(null);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'dead_letter':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'failed':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  }

  function getFailureBadge(failureType?: string | null) {
    switch (failureType) {
      case 'temporary':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'permanent':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'auth':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'rate_limit':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'unknown':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  }

  function formatLabel(value?: string | null) {
    if (!value) return 'N/A';

    return value
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  return (
    <div className={ui.page}>
      {error ? <div className={ui.alertError}>{error}</div> : null}
      {success ? <div className={ui.alertSuccess}>{success}</div> : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 to-slate-800 px-4 py-5 text-white sm:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold">
                Failed & Dead-letter Messages
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                Monitor operational delivery failures and exhausted retry cases.
              </p>
            </div>

            <div className="w-full space-y-1 md:w-56">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-300">
                Status Filter
              </label>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as StatusFilter)
                }
                className="w-full rounded-xl border border-white/10 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:ring-4 focus:ring-blue-200"
              >
                <option value="dead_letter">Dead Letter</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {pageLoading ? (
            <div className="space-y-3">
              <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
            </div>
          ) : messages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-500">
              No {statusFilter === 'dead_letter' ? 'dead-letter' : 'failed'}{' '}
              messages found.
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words font-semibold text-gray-900">
                          {message.recipient}
                        </p>

                        <span
                          className={`inline-flex h-7 items-center justify-center rounded-full border px-2.5 text-xs font-bold ${getStatusBadge(
                            message.status,
                          )}`}
                        >
                          {formatLabel(message.status)}
                        </span>

                        <span
                          className={`inline-flex h-7 items-center justify-center rounded-full border px-2.5 text-xs font-bold ${getFailureBadge(
                            message.failureType,
                          )}`}
                        >
                          {formatLabel(message.failureType)}
                        </span>
                      </div>

                      <p className="mt-2 whitespace-normal break-words text-sm leading-6 text-gray-600">
                        {message.content}
                      </p>

                      <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                        <InfoItem
                          label="Provider"
                          value={message.providerName || 'N/A'}
                        />
                        <InfoItem
                          label="Provider Status"
                          value={message.providerStatus || 'N/A'}
                        />
                        <InfoItem
                          label="Provider Error Code"
                          value={message.providerErrorCode || 'N/A'}
                        />
                        <InfoItem
                          label="Retry Count"
                          value={String(message.retryCount)}
                        />
                      </div>

                      {message.errorMessage ? (
                        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                            Error Message
                          </p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-red-700">
                            {message.errorMessage}
                          </p>
                        </div>
                      ) : null}

                      <div className="mt-4 flex justify-end">
                        {confirmRetryId === message.id ? (
                          <div className="flex w-full flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:w-auto sm:flex-row sm:items-center">
                            <span className="text-xs text-gray-500">
                              Resend this SMS?
                            </span>

                            <button
                              type="button"
                              onClick={() => setConfirmRetryId(null)}
                              disabled={retryingId === message.id}
                              className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 sm:w-auto"
                            >
                              Cancel
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRetry(message.id)}
                              disabled={retryingId === message.id}
                              className={`${ui.primaryButton} w-full justify-center sm:w-auto`}
                            >
                              {retryingId === message.id
                                ? 'Retrying...'
                                : 'Confirm Retry'}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmRetryId(message.id)}
                            disabled={retryingId === message.id}
                            className={`${ui.primaryButton} w-full justify-center sm:w-auto`}
                          >
                            Retry Delivery
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 space-y-2 text-xs text-gray-400 xl:max-w-[280px] xl:text-right">
                      <p>Created: {new Date(message.createdAt).toLocaleString()}</p>

                      {message.sentAt ? (
                        <p>Sent: {new Date(message.sentAt).toLocaleString()}</p>
                      ) : null}

                      {message.deadLetteredAt ? (
                        <p>
                          Dead-lettered:{' '}
                          {new Date(message.deadLetteredAt).toLocaleString()}
                        </p>
                      ) : null}

                      {message.providerMessageId ? (
                        <p className="break-all">
                          Provider ID: {message.providerMessageId}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className="mt-1 break-words font-medium text-gray-900">{value}</p>
    </div>
  );
}