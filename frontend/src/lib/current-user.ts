import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';

export type CurrentUser = {
  id: string;
  email: string;
  role: 'super_admin' | 'admin' | 'user';
};

export async function fetchCurrentUser() {
  const token = getToken();
  if (!token) return null;

  try {
    return await apiFetch<CurrentUser>('/auth/me', undefined, token);
  } catch {
    return null;
  }
}