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
    if (!token) return;

    try {
      setError('');
      const data = await apiFetch<AuditLog[]>('/audit-logs', undefined, token);
      setLogs(data);
    } catch (error) {
      console.error('Failed to load audit logs', error);
      setError('Failed to load audit logs');
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

      <div className={ui.card}>
        <div className={ui.cardBody}>
          <h2 className={ui.sectionTitle}>Audit Logs</h2>
          <p className={ui.sectionSubtitle}>
            Track administrative and operational actions across the platform.
          </p>

          <div className="mt-6 min-h-[320px]">
            {pageLoading ? (
              <div className="space-y-3">
                <div className="h-24 rounded-xl bg-gray-100 animate-pulse" />
                <div className="h-24 rounded-xl bg-gray-100 animate-pulse" />
                <div className="h-24 rounded-xl bg-gray-100 animate-pulse" />
              </div>
            ) : logs.length === 0 ? (
              <div className="text-gray-500">No audit logs found.</div>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div key={log.id} className={ui.listItem}>
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-gray-900">
                            {formatAction(log.action)}
                          </span>

                          <span
                            className={`text-xs px-2.5 py-1 rounded-full font-medium ${getEntityBadgeClass(
                              log.entityType,
                            )}`}
                          >
                            {formatEntityType(log.entityType)}
                          </span>
                        </div>

                        <p className="text-sm text-gray-600 mt-2">
                          Performed by{' '}
                          <span className="font-medium text-gray-900">
                            {log.actorEmail}
                          </span>
                        </p>

                        {log.entityId ? (
                          <p className="text-xs text-gray-500 mt-2 break-all">
                            Entity ID: {log.entityId}
                          </p>
                        ) : null}

                        {log.metadata ? (
                          <details className="mt-3 rounded-xl bg-gray-50 border border-gray-200 p-3">
                            <summary className="text-xs font-semibold text-gray-700 cursor-pointer">
                              View Metadata
                            </summary>
                            <pre className="text-xs text-gray-600 whitespace-pre-wrap break-words mt-3">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </details>
                        ) : null}
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-400">
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
    </div>
  );
}