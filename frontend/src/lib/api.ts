export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL 
  ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1` 
  : 'http://localhost:5000/api/v1';

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
  token?: string,
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    // 1. Try to parse the error as JSON
    let errorData;
    try {
      errorData = await res.json();
    } catch {
      // Fallback if the error isn't JSON
      errorData = { message: `API Error: ${res.status}` };
    }

    // 2. Handle 401 specifically (optional but recommended)
    if (res.status === 401) {
      console.warn("Session expired or unauthorized");
      // You could trigger a logout here: localStorage.removeItem('token');
    }

    // 3. Throw the whole object so your UI can read errorData.message
    throw errorData; 
  }

  return res.json();
}
