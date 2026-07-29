'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Inbox,
  MessageSquareText,
  RefreshCw,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';

type InboundStatus = 'received' | 'read' | 'archived';

type InboundMessage = {
  id: string;
  tenantId: string;
  from: string;
  to?: string | null;
  content: string;
  status: InboundStatus;
  providerName?: string | null;
  providerMessageId?: string | null;
  receivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApiResponse = {
  data: InboundMessage[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('token') || '';
}

function formatDate(value?: string | null) {
  if (!value) return '—';

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusBadgeClass(status: InboundStatus) {
  if (status === 'received') {
    return 'border-blue-200 bg-blue-50 text-blue-700';
  }

  if (status === 'read') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  return 'border-slate-200 bg-slate-100 text-slate-600';
}

export default function InboundMessagesPage() {
  const [messages, setMessages] = useState<InboundMessage[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | InboundStatus>('all');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<ApiResponse['meta'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const unreadCount = useMemo(
    () => messages.filter((message) => message.status === 'received').length,
    [messages],
  );

  async function fetchMessages(nextPage = page) {
    const token = getToken();

    if (!token) {
      toast.error('Please login again');
      return;
    }

    setLoading(true);

    try {
      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('limit', '20');

      if (search.trim()) {
        params.set('search', search.trim());
      }

      if (status !== 'all') {
        params.set('status', status);
      }

      const response = await fetch(
        `${API_BASE_URL}/inbound-messages?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error('Failed to load inbound messages');
      }

      const data = (await response.json()) as ApiResponse;

      setMessages(data.data);
      setMeta(data.meta);
      setPage(data.meta.page);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to load inbound messages',
      );
    } finally {
      setLoading(false);
    }
  }

  async function updateMessageStatus(id: string, action: 'read' | 'archive') {
    const token = getToken();

    if (!token) {
      toast.error('Please login again');
      return;
    }

    setActionLoadingId(id);

    try {
      const response = await fetch(`${API_BASE_URL}/inbound-messages/${id}/${action}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          action === 'read'
            ? 'Failed to mark message as read'
            : 'Failed to archive message',
        );
      }

      const updatedMessage = (await response.json()) as InboundMessage;

      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === id ? updatedMessage : message,
        ),
      );

      toast.success(action === 'read' ? 'Marked as read' : 'Archived');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update message',
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  useEffect(() => {
    fetchMessages(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    fetchMessages(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
              <Inbox className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900">
                Inbound messages
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                View customer replies and incoming SMS messages.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fetchMessages(page)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Total</p>
          <p className="mt-2 text-3xl font-black text-slate-900">
            {meta?.total ?? messages.length}
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Unread on page</p>
          <p className="mt-2 text-3xl font-black text-blue-600">
            {unreadCount}
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Page</p>
          <p className="mt-2 text-3xl font-black text-slate-900">
            {meta ? `${meta.page}/${meta.totalPages || 1}` : '1/1'}
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={handleSearchSubmit} className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search sender, recipient, content, or provider ID..."
              className="w-full rounded-2xl border border-slate-200 py-3 pl-11 pr-4 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
            />
          </form>

          <div className="flex flex-wrap gap-2">
            {(['all', 'received', 'read', 'archived'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStatus(item)}
                className={`rounded-2xl px-4 py-2 text-sm font-bold capitalize ${
                  status === item
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm font-bold text-slate-500">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading inbound messages...
            </div>
          ) : messages.length === 0 ? (
            <div className="p-10 text-center">
              <MessageSquareText className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-700">
                No inbound messages found
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Incoming SMS replies will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className="grid gap-4 p-4 hover:bg-slate-50 lg:grid-cols-[1fr_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-slate-900">
                        {message.from}
                      </p>

                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-black uppercase ${statusBadgeClass(
                          message.status,
                        )}`}
                      >
                        {message.status}
                      </span>

                      {message.to ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
                          To {message.to}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                      {message.content}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-400">
                      <span>Received {formatDate(message.receivedAt)}</span>
                      {message.providerName ? (
                        <span>Provider {message.providerName}</span>
                      ) : null}
                      {message.providerMessageId ? (
                        <span>ID {message.providerMessageId}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    {message.status === 'received' ? (
                      <button
                        type="button"
                        onClick={() => updateMessageStatus(message.id, 'read')}
                        disabled={actionLoadingId === message.id}
                        className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Read
                      </button>
                    ) : null}

                    {message.status !== 'archived' ? (
                      <button
                        type="button"
                        onClick={() =>
                          updateMessageStatus(message.id, 'archive')
                        }
                        disabled={actionLoadingId === message.id}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-100 disabled:opacity-60"
                      >
                        <Archive className="h-4 w-4" />
                        Archive
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => fetchMessages(Math.max(1, page - 1))}
            disabled={loading || page <= 1}
            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Previous
          </button>

          <p className="text-sm font-semibold text-slate-500">
            Page {meta?.page ?? page} of {meta?.totalPages || 1}
          </p>

          <button
            type="button"
            onClick={() => fetchMessages(page + 1)}
            disabled={loading || !!meta?.totalPages && page >= meta.totalPages}
            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}