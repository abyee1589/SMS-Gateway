'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { ui } from '@/lib/ui';
import toast from 'react-hot-toast';
import RoleGuard from '@/components/role-guard';
import { fetchCurrentUser, type CurrentUser } from '@/lib/current-user';
import { canAccess, navItems, type UserRole } from '@/lib/access';


type User = {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('user');
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  async function loadUsers() {
    const token = getToken();
    if (!token) return;

    try {
      setError('');
      const data = await apiFetch<User[]>('/users', undefined, token);
      setUsers(data);
    } catch (error) {
      console.error('Failed to load users', error);
      setError('Failed to load users');
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

  const handleCreateUser = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const token = getToken();
    if (!token) return;

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
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
      await loadUsers();
    } catch (error) {
      console.error('Failed to create user', error);
      setError('Failed to create user');
      setSuccess('');
    } finally {
      setLoading(false);
    }
  };

  async function handleRoleChange(userId: string, newRole: UserRole) {
    const token = getToken();
    if (!token) return;

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
      await loadUsers();
    } catch (error) {
      console.error('Failed to update role', error);
      setError('Failed to update user role');
      setSuccess('');
    }
  }

  async function handleStatusToggle(userId: string, isActive: boolean) {
    const token = getToken();
    if (!token) return;

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

      toast.success(`User ${isActive ? 'deactivated' : 'activated'} successfully`);
      await loadUsers();
    } catch (error) {
      console.error('Failed to update status', error);
      setError('Failed to update user status');
      setSuccess('');
    }
  }

  function getRoleBadgeClass(userRole: UserRole) {
    switch (userRole) {
      case 'manager':
        return 'bg-purple-100 text-purple-700';
      case 'admin':
        return 'bg-blue-100 text-blue-700';
      case 'user':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  }

  return (
    <RoleGuard currentUserRole={currentUser?.role} allowedRoles={['manager']}>
      <div className={ui.page}>
        {error ? <div className={ui.alertError}>{error}</div> : null}
        {success ? <div className={ui.alertSuccess}>{success}</div> : null}

        <div className={ui.card}>
          <div className={ui.cardBody}>
            <h2 className={ui.sectionTitle}>User Management</h2>
            <p className={ui.sectionSubtitle}>
              Create users, assign roles, and manage account access.
            </p>

            <form
              onSubmit={handleCreateUser}
              className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6"
            >
              <div className="space-y-1">
                <label className={ui.label}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={ui.input}
                />
              </div>

              <div className="space-y-1">
                <label className={ui.label}>Temporary Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={ui.input}
                />
              </div>

              <div className="space-y-1">
                <label className={ui.label}>Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className={ui.select}
                >
                  <option value="user">USER</option>
                  <option value="admin">ADMIN</option>
                  <option value="manager">MANAGER</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <button
                  type="submit"
                  disabled={loading}
                  className={ui.primaryButton}
                >
                  {loading ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className={ui.card}>
          <div className={ui.cardBody}>
            <h2 className={ui.sectionTitle}>Users</h2>
            <p className={ui.sectionSubtitle}>
              Manage roles and account status for your tenant.
            </p>

            {pageLoading ? (
              <div className="text-gray-500 mt-6">Loading users...</div>
            ) : users.length === 0 ? (
              <div className="text-gray-500 mt-6">No users found.</div>
            ) : (
              <div className="space-y-3 mt-6">
                {users.map((user) => (
                  <div key={user.id} className={ui.listItem}>
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      <div>
                        <p className="font-semibold text-gray-900">{user.email}</p>

                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span
                            className={`text-xs px-2.5 py-1 rounded-full font-medium ${getRoleBadgeClass(
                              user.role,
                            )}`}
                          >
                            {user.role}
                          </span>

                          <span
                            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                              user.isActive
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {user.isActive ? 'active' : 'inactive'}
                          </span>
                        </div>

                        <p className="text-xs text-gray-400 mt-3">
                          Created: {new Date(user.createdAt).toLocaleString()}
                        </p>
                      </div>

                      <div className="flex flex-col md:flex-row gap-3 md:items-center">
                        <select
                          value={user.role}
                          onChange={(e) =>
                            handleRoleChange(user.id, e.target.value as UserRole)
                          }
                          className={ui.select}
                        >
                          <option value="user">USER</option>
                          <option value="admin">ADMIN</option>
                          <option value="manager">MANAGER</option>
                        </select>

                        <button
                          onClick={() => handleStatusToggle(user.id, user.isActive)}
                          className={
                            user.isActive ? ui.dangerButton : ui.primaryButton
                          }
                        >
                          {user.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}