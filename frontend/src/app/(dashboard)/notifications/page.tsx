'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  CheckCircle2,
  RefreshCw,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { getToken } from '@/lib/auth';

type NotificationStatus = 'unread' | 'read';

type NotificationItem = {
  id: string;
  tenantId: string;
  userId?: string | null;
  type: string;
  title: string;
  message: string;
  status: NotificationStatus;
  actionUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  readAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApiResponse = {
  data: NotificationItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

function formatDate(value?: string | null) {
  if (!value) return '—';

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatType(type: string) {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function statusBadgeClass(status: NotificationStatus) {
  if (status === 'unread') {
    return 'border-blue-200 bg-blue-50 text-blue-700';
  }

  return 'border-slate-200 bg-slate-100 text-slate-600';
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [status, setStatus] = useState<'all' | NotificationStatus>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<ApiResponse['meta'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const unreadOnPage = useMemo(
    () =>
      notifications.filter(
        (notification) => notification.status === 'unread',
      ).length,
    [notifications],
  );

  async function fetchNotifications(nextPage = page) {
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

      if (status !== 'all') {
        params.set('status', status);
      }

      const response = await fetch(
        `${API_BASE_URL}/notifications?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error('Failed to load notifications');
      }

      const data = (await response.json()) as ApiResponse;

      setNotifications(data.data);
      setMeta(data.meta);
      setPage(data.meta.page);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to load notifications',
      );
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(id: string) {
    const token = getToken();

    if (!token) {
      toast.error('Please login again');
      return;
    }

    setActionLoadingId(id);

    try {
      const response = await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to mark notification as read');
      }

      const updatedNotification =
        (await response.json()) as NotificationItem;

      setNotifications((current) =>
        current.map((notification) =>
          notification.id === id ? updatedNotification : notification,
        ),
      );

      toast.success('Notification marked as read');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to update notification',
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  async function markAllAsRead() {
    const token = getToken();

    if (!token) {
      toast.error('Please login again');
      return;
    }

    setActionLoadingId('all');

    try {
      const response = await fetch(`${API_BASE_URL}/notifications/read-all`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to mark all notifications as read');
      }

      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          status: 'read',
          readAt: notification.readAt ?? new Date().toISOString(),
        })),
      );

      toast.success('All notifications marked as read');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to update notifications',
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  async function openNotification(notification: NotificationItem) {
    if (notification.status === 'unread') {
        await markAsRead(notification.id);
    }

    if (notification.actionUrl) {
        window.location.href = notification.actionUrl;
    }
    }

  const filteredNotifications = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return notifications;

    return notifications.filter((notification) => {
      return (
        notification.title.toLowerCase().includes(query) ||
        notification.message.toLowerCase().includes(query) ||
        notification.type.toLowerCase().includes(query)
      );
    });
  }, [notifications, search]);

  useEffect(() => {
    fetchNotifications(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
            <Bell className="h-6 w-6" />
          </div>

          <div>
            <h1 className="text-2xl font-black text-slate-900">
              Notifications
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Review system alerts, inbound SMS updates, and account notices.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => fetchNotifications(page)}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            type="button"
            onClick={markAllAsRead}
            disabled={actionLoadingId === 'all'}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <CheckCircle2 className="h-4 w-4" />
            Mark all read
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Total</p>
          <p className="mt-2 text-3xl font-black text-slate-900">
            {meta?.total ?? notifications.length}
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Unread on page</p>
          <p className="mt-2 text-3xl font-black text-blue-600">
            {unreadOnPage}
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
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, message, or type..."
              className="w-full rounded-2xl border border-slate-200 py-3 pl-11 pr-4 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(['all', 'unread', 'read'] as const).map((item) => (
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
              Loading notifications...
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="p-10 text-center">
              <Bell className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-700">
                No notifications found
              </p>
              <p className="mt-1 text-sm text-slate-500">
                New system alerts will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`grid gap-4 p-4 hover:bg-slate-50 lg:grid-cols-[1fr_auto] ${
                    notification.status === 'unread' ? 'bg-blue-50/40' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-slate-900">
                        {notification.title}
                      </p>

                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-black uppercase ${statusBadgeClass(
                          notification.status,
                        )}`}
                      >
                        {notification.status}
                      </span>

                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
                        {formatType(notification.type)}
                      </span>
                    </div>

                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                      {notification.message}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-400">
                      <span>Created {formatDate(notification.createdAt)}</span>
                      {notification.readAt ? (
                        <span>Read {formatDate(notification.readAt)}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    {notification.actionUrl ? (
                        <button
                            type="button"
                            onClick={() => openNotification(notification)}
                            className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100"
                        >
                            Open
                        </button>
                        ) : null
                    }

                    {notification.status === 'unread' ? (
                      <button
                        type="button"
                        onClick={() => markAsRead(notification.id)}
                        disabled={actionLoadingId === notification.id}
                        className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Read
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
            onClick={() => fetchNotifications(Math.max(1, page - 1))}
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
            onClick={() => fetchNotifications(page + 1)}
            disabled={loading || (!!meta?.totalPages && page >= meta.totalPages)}
            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}