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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('dead_letter');
  const [pageLoading, setPageLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmRetryId, setConfirmRetryId] = useState<string | null>(null);


  async function loadMessages(filter: StatusFilter) {
    const token = getToken();
    if (!token) return;

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
      setError('Failed to load failed/dead-letter messages');
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    loadMessages(statusFilter);
  }, [statusFilter]);

  async function handleRetry(messageId: string) {
    const token = getToken();
    if (!token) return;

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
      await loadMessages(statusFilter);
    } catch (error) {
      console.error('Failed to retry message', error);
      setError('Failed to retry message');
      setSuccess('');
    } finally {
      setRetryingId(null);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'dead_letter':
        return 'bg-red-100 text-red-700';
      case 'failed':
        return 'bg-orange-100 text-orange-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  }

  function getFailureBadge(failureType?: string | null) {
    switch (failureType) {
      case 'temporary':
        return 'bg-yellow-100 text-yellow-700';
      case 'permanent':
        return 'bg-red-100 text-red-700';
      case 'auth':
        return 'bg-purple-100 text-purple-700';
      case 'rate_limit':
        return 'bg-blue-100 text-blue-700';
      case 'unknown':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-600';
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

      <div className={ui.card}>
        <div className={ui.cardBody}>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h2 className={ui.sectionTitle}>Failed & Dead-letter Messages</h2>
              <p className={ui.sectionSubtitle}>
                Monitor operational delivery failures and exhausted retry cases.
              </p>
            </div>

            <div className="w-full md:w-56 space-y-1">
              <label className={ui.label}>Status Filter</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className={ui.select}
              >
                <option value="dead_letter">Dead Letter</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          <div className="mt-6 min-h-[320px]">
            {pageLoading ? (
              <div className="space-y-3">
                <div className="h-28 rounded-xl bg-gray-100 animate-pulse" />
                <div className="h-28 rounded-xl bg-gray-100 animate-pulse" />
                <div className="h-28 rounded-xl bg-gray-100 animate-pulse" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-gray-500">
                No {statusFilter === 'dead_letter' ? 'dead-letter' : 'failed'} messages found.
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div key={message.id} className={ui.listItem}>
                    <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-gray-900">
                            {message.recipient}
                          </p>

                          <span
                            className={`text-xs px-2.5 py-1 rounded-full font-medium ${getStatusBadge(
                              message.status,
                            )}`}
                          >
                            {formatLabel(message.status)}
                          </span>

                          <span
                            className={`text-xs px-2.5 py-1 rounded-full font-medium ${getFailureBadge(
                              message.failureType,
                            )}`}
                          >
                            {formatLabel(message.failureType)}
                          </span>
                        </div>

                        <p className="text-sm text-gray-600 mt-2">
                          {message.content}
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 text-sm">
                          <div>
                            <p className="text-gray-500">Provider</p>
                            <p className="font-medium text-gray-900">
                              {message.providerName || 'N/A'}
                            </p>
                          </div>

                          <div>
                            <p className="text-gray-500">Provider Status</p>
                            <p className="font-medium text-gray-900">
                              {message.providerStatus || 'N/A'}
                            </p>
                          </div>

                          <div>
                            <p className="text-gray-500">Provider Error Code</p>
                            <p className="font-medium text-gray-900">
                              {message.providerErrorCode || 'N/A'}
                            </p>
                          </div>

                          <div>
                            <p className="text-gray-500">Retry Count</p>
                            <p className="font-medium text-gray-900">
                              {message.retryCount}
                            </p>
                          </div>
                        </div>

                        {message.errorMessage ? (
                          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                            <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">
                              Error Message
                            </p>
                            <p className="text-sm text-red-700 mt-1">
                              {message.errorMessage}
                            </p>
                          </div>
                        ) : null}
                          <div className="mt-4 flex justify-end">
                          {confirmRetryId === message.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 mr-2">
                                Resend this SMS?
                              </span>

                              <button
                                type="button"
                                onClick={() => setConfirmRetryId(null)}
                                disabled={retryingId === message.id}
                                className={ui.secondaryButton ?? 'px-4 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 transition'}
                              >
                                Cancel
                              </button>

                              <button
                                type="button"
                                onClick={() => handleRetry(message.id)}
                                disabled={retryingId === message.id}
                                className={ui.primaryButton}
                              >
                                {retryingId === message.id ? 'Retrying...' : 'Confirm Retry'}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmRetryId(message.id)}
                              disabled={retryingId === message.id}
                              className={ui.primaryButton}
                            >
                              Retry Delivery
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="text-right text-xs text-gray-400 space-y-2 shrink-0">
                        <p>
                          Created: {new Date(message.createdAt).toLocaleString()}
                        </p>

                        {message.sentAt ? (
                          <p>
                            Sent: {new Date(message.sentAt).toLocaleString()}
                          </p>
                        ) : null}

                        {message.deadLetteredAt ? (
                          <p>
                            Dead-lettered:{' '}
                            {new Date(message.deadLetteredAt).toLocaleString()}
                          </p>
                        ) : null}

                        {message.providerMessageId ? (
                          <p className="break-all max-w-[260px]">
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
    </div>
  );
}