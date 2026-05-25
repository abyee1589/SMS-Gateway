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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@nexus.com');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
  e.preventDefault();
  setLoading(true);
  setError('');

  try {
    const data = await apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.accessToken);
    router.push('/');
  } catch (err: any) {
    console.error('Login error:', err);
    
    // NestJS sends errors as { message: "...", statusCode: 401 }
    // If our apiFetch throws the JSON, we access err.message
    const errorMessage = err.message || 'Login failed';
    
    setError(Array.isArray(errorMessage) ? errorMessage[0] : errorMessage);
  } finally {
    setLoading(false);
  }
}


  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Login</h1>
        <p className="text-sm text-gray-500 mb-6">Sign in to NexusMsg Admin</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              // className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 "
              className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white text-gray-600 placeholder-gray-400"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              // className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white text-gray-600 placeholder-gray-400"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 transition disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}