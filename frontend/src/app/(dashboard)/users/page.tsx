'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { ui } from '@/lib/ui';
import toast from 'react-hot-toast';
import RoleGuard from '@/components/role-guard';
import { fetchCurrentUser, type CurrentUser } from '@/lib/current-user';
import type { UserRole } from '@/lib/access';

type User = {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
};

type CreateUserRole = 'admin' | 'user';

function getErrorMessage(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error
  ) {
    const message = (error as { message?: unknown }).message;

    if (Array.isArray(message)) return message[0] ?? 'Request failed';
    if (typeof message === 'string') return message;
  }

  if (error instanceof Error) return error.message;

  return 'Request failed';
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<CreateUserRole>('user');

  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isCompanyAdmin = currentUser?.role === 'admin';

  async function loadUsers() {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    try {
      setError('');

      const usersData = await apiFetch<User[]>('/users', undefined, token);
      setUsers(usersData);
    } catch (error) {
      console.error('Failed to load users page', error);
      setError(getErrorMessage(error));
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    async function loadPage() {
      const user = await fetchCurrentUser();
      setCurrentUser(user);
      await loadUsers();
    }

    loadPage();
  }, []);

  async function handleCreateUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      setSuccess('');
      return;
    }

    if (password.trim().length < 8) {
      setError('Temporary password must be at least 8 characters');
      setSuccess('');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await apiFetch(
        '/users',
        {
          method: 'POST',
          body: JSON.stringify({
            email: email.trim(),
            password: password.trim(),
            role,
          }),
        },
        token,
      );

      setEmail('');
      setPassword('');
      setRole('user');
      setSuccess('User created successfully');
      toast.success('User created successfully');
      await loadUsers();
    } catch (error) {
      console.error('Failed to create user', error);
      setError(getErrorMessage(error));
      setSuccess('');
    } finally {
      setLoading(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: CreateUserRole) {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    setActionLoadingId(userId);
    setError('');
    setSuccess('');

    try {
      await apiFetch(
        `/users/${userId}/role`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role: newRole }),
        },
        token,
      );

      setSuccess('User role updated');
      toast.success('User role updated');
      await loadUsers();
    } catch (error) {
      console.error('Failed to update role', error);
      setError(getErrorMessage(error));
      setSuccess('');
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleStatusToggle(userId: string, isActive: boolean) {
    const token = getToken();

    if (!token) {
      window.location.href = '/login';
      return;
    }

    setActionLoadingId(userId);
    setError('');
    setSuccess('');

    try {
      await apiFetch(
        `/users/${userId}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ isActive: !isActive }),
        },
        token,
      );

      toast.success(
        `User ${isActive ? 'deactivated' : 'activated'} successfully`,
      );

      await loadUsers();
    } catch (error) {
      console.error('Failed to update status', error);
      setError(getErrorMessage(error));
      setSuccess('');
    } finally {
      setActionLoadingId(null);
    }
  }

  function getRoleBadgeClass(userRole: UserRole) {
    switch (userRole) {
      case 'super_admin':
        return 'bg-purple-100 text-purple-700';
      case 'admin':
        return 'bg-blue-100 text-blue-700';
      case 'user':
      default:
        return 'bg-gray-100 text-gray-700';
    }
  }

  function formatRole(userRole: UserRole) {
    return userRole
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  return (
    <RoleGuard
      currentUserRole={currentUser?.role}
      allowedRoles={['super_admin', 'admin']}
    >
      <div className={ui.page}>
        {error ? <div className={ui.alertError}>{error}</div> : null}
        {success ? <div className={ui.alertSuccess}>{success}</div> : null}

        {isCompanyAdmin ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 to-slate-800 px-4 py-5 text-white sm:px-6">
              <h2 className="text-2xl font-bold">User Management</h2>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                Create company admins and users inside your own company.
              </p>
            </div>

            <div className="p-4 sm:p-6">
              <form
                onSubmit={handleCreateUser}
                className="grid grid-cols-1 gap-4 lg:grid-cols-3"
              >
                <div className="space-y-1.5">
                  <label className={ui.label}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`${ui.input} transition focus:ring-4 focus:ring-blue-100`}
                    placeholder="user@company.com"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={ui.label}>Temporary Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${ui.input} transition focus:ring-4 focus:ring-blue-100`}
                    placeholder="At least 8 characters"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={ui.label}>Role</label>
                  <select
                    value={role}
                    onChange={(e) =>
                      setRole(e.target.value as CreateUserRole)
                    }
                    className={`${ui.select} transition focus:ring-4 focus:ring-blue-100`}
                  >
                    <option value="user">User</option>
                    <option value="admin">Company Admin</option>
                  </select>
                </div>

                <div className="lg:col-span-3">
                  <button
                    type="submit"
                    disabled={loading || pageLoading}
                    className={`${ui.primaryButton} w-full justify-center sm:w-auto`}
                  >
                    {loading ? 'Creating...' : 'Create User'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {isSuperAdmin ? (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-blue-800">
            <p className="font-black">Platform user overview</p>
            <p className="mt-1 text-sm leading-6">
              Super admins can review platform users here. Company creation and
              first company admin setup should be handled from the Companies
              page.
            </p>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-5 sm:px-6">
            <h2 className={ui.sectionTitle}>Users</h2>
            <p className={ui.sectionSubtitle}>
              {isSuperAdmin
                ? 'Review users across companies.'
                : 'Manage admins and users inside your company.'}
            </p>
          </div>

          <div className="p-4 sm:p-6">
            {pageLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-500">
                Loading users...
              </div>
            ) : users.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-500">
                No user found.
              </div>
            ) : (
              <div className="space-y-3">
                {users.map((user) => {
                  const targetIsSuperAdmin = user.role === 'super_admin';
                  const isSelf = user.id === currentUser?.id;

                  const canEditRole =
                    !targetIsSuperAdmin &&
                    !isSelf &&
                    (isCompanyAdmin || isSuperAdmin);

                  const canToggleStatus =
                    !isSelf && (isCompanyAdmin || isSuperAdmin);

                  return (
                    <div
                      key={user.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="min-w-0">
                          <p className="break-words font-semibold text-gray-900">
                            {user.email}
                          </p>

                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex h-7 min-w-24 items-center justify-center rounded-full px-2.5 text-xs font-bold ${getRoleBadgeClass(
                                user.role,
                              )}`}
                            >
                              {formatRole(user.role)}
                            </span>

                            <span
                              className={`inline-flex h-7 min-w-20 items-center justify-center rounded-full px-2.5 text-xs font-bold ${
                                user.isActive
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {user.isActive ? 'Active' : 'Inactive'}
                            </span>

                            {isSelf ? (
                              <span className="inline-flex h-7 items-center justify-center rounded-full bg-blue-50 px-2.5 text-xs font-bold text-blue-700">
                                You
                              </span>
                            ) : null}

                            {isSuperAdmin ? (
                              <span className="inline-flex h-7 items-center justify-center rounded-full bg-slate-100 px-2.5 text-xs font-bold text-slate-600">
                                {user.tenantId}
                              </span>
                            ) : null}
                          </div>

                          <p className="mt-3 text-xs leading-5 text-gray-400">
                            Created:{' '}
                            {new Date(user.createdAt).toLocaleString()}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,220px)_auto] sm:items-center">
                          <select
                            value={
                              user.role === 'admin' || user.role === 'user'
                                ? user.role
                                : 'admin'
                            }
                            onChange={(e) =>
                              handleRoleChange(
                                user.id,
                                e.target.value as CreateUserRole,
                              )
                            }
                            disabled={
                              !canEditRole || actionLoadingId === user.id
                            }
                            className={`${ui.select} w-full disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
                          >
                            <option value="user">User</option>
                            <option value="admin">Company Admin</option>
                          </select>

                          <button
                            type="button"
                            onClick={() =>
                              handleStatusToggle(user.id, user.isActive)
                            }
                            disabled={
                              !canToggleStatus || actionLoadingId === user.id
                            }
                            className={`inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 sm:w-32 ${
                              user.isActive
                                ? 'bg-red-600 text-white hover:bg-red-700'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                          >
                            {actionLoadingId === user.id
                              ? 'Saving...'
                              : user.isActive
                                ? 'Deactivate'
                                : 'Activate'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}