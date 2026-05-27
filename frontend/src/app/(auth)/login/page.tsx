'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { setToken } from '@/lib/auth';

type LoginResponse = {
  user: {
    id: string;
    email: string;
    role: string;
  };
  accessToken: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error
  ) {
    const message = (error as { message?: unknown }).message;

    if (Array.isArray(message)) return message[0] ?? 'Login failed';
    if (typeof message === 'string') return message;
  }

  return 'Login failed';
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const data = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      setToken(data.accessToken);
      router.push('/dashboard');
    } catch (error) {
      console.error('Login error:', error);
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 px-4 py-8 text-slate-950 sm:px-6">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl lg:grid-cols-[0.9fr_1.1fr]">
          <section className="hidden bg-gradient-to-br from-slate-950 to-slate-800 p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-lg font-black shadow-lg">
                Z
              </div>

              <h1 className="mt-8 text-4xl font-black tracking-tight">
                Zergaw SMS Gateway
              </h1>

              <p className="mt-4 max-w-sm text-sm leading-7 text-slate-300">
                Manage SMS campaigns, contacts, delivery activity, and tenant
                operations from one secure dashboard.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/10 p-5 backdrop-blur">
              <p className="text-sm font-semibold text-slate-200">
                Messaging Operations Platform
              </p>
              <p className="mt-2 text-xs leading-6 text-slate-400">
                Built for campaign delivery, scheduling, contact groups, and
                audit visibility.
              </p>
            </div>
          </section>

          <section className="p-5 sm:p-8 lg:p-10">
            <div className="mb-8 lg:hidden">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-lg font-black text-white shadow-lg">
                Z
              </div>
              <h1 className="mt-5 text-2xl font-black tracking-tight text-slate-950">
                Zergaw SMS Gateway
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Sign in to manage messaging operations.
              </p>
            </div>

            <div className="mx-auto w-full max-w-md">
              <div className="mb-6 hidden lg:block">
                <h2 className="text-3xl font-black tracking-tight text-slate-950">
                  Welcome back
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Sign in to continue to your dashboard.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-slate-700">
                    Email
                  </label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-slate-700">
                    Password
                  </label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                </div>

                {error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}