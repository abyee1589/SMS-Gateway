'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { ui } from '@/lib/ui';

type AuditLog = {
  id: string;
  tenantId: string;
  actorUserId: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadLogs() {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    try {
      setError('');
      const data = await apiFetch<AuditLog[]>('/audit-logs', undefined, token);
      setLogs(data);
    } catch (error) {
      console.error('Failed to load audit logs', error);
      setError(
        error instanceof Error ? error.message : 'Failed to load audit logs',
      );
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, []);

  function formatAction(action: string) {
    return action
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  function formatEntityType(entityType: string) {
    return entityType
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  function getEntityBadgeClass(entityType: string) {
    switch (entityType) {
      case 'user':
        return 'bg-blue-100 text-blue-700';
      case 'contact':
        return 'bg-green-100 text-green-700';
      case 'contact_group':
        return 'bg-purple-100 text-purple-700';
      case 'campaign':
        return 'bg-orange-100 text-orange-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  }

  return (
    <div className={ui.page}>
      {error ? <div className={ui.alertError}>{error}</div> : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 to-slate-800 px-4 py-5 text-white sm:px-6">
          <h2 className="text-2xl font-bold">Audit Logs</h2>
          <p className="mt-1 text-sm leading-6 text-slate-300">
            Track administrative and operational actions across the platform.
          </p>
        </div>

        <div className="p-4 sm:p-6">
          {pageLoading ? (
            <div className="space-y-3">
              <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
            </div>
          ) : logs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-500">
              No audit logs found.
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="break-words font-semibold text-gray-900">
                          {formatAction(log.action)}
                        </span>

                        <span
                          className={`inline-flex h-7 items-center justify-center rounded-full px-2.5 text-xs font-bold ${getEntityBadgeClass(
                            log.entityType,
                          )}`}
                        >
                          {formatEntityType(log.entityType)}
                        </span>
                      </div>

                      <p className="mt-2 break-words text-sm leading-6 text-gray-600">
                        Performed by{' '}
                        <span className="font-medium text-gray-900">
                          {log.actorEmail}
                        </span>
                      </p>

                      {log.entityId ? (
                        <p className="mt-2 break-all text-xs leading-5 text-gray-500">
                          Entity ID: {log.entityId}
                        </p>
                      ) : null}

                      {log.metadata ? (
                        <details className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 p-3">
                          <summary className="cursor-pointer text-xs font-semibold text-gray-700">
                            View Metadata
                          </summary>

                          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-xs leading-5 text-gray-600">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </div>

                    <div className="shrink-0 lg:text-right">
                      <p className="text-xs leading-5 text-gray-400">
                        {new Date(log.createdAt).toLocaleString()}
                      </p>
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