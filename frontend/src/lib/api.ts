export interface AwsResponse<T> {
  data: T;
  source: 'aws';
  observedAt: string;
  cached?: boolean;
  errors?: Record<string, string>;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('cloudops_token') : null;
  const method = (init?.method ?? 'GET').toUpperCase();
  const needsContentType = ['POST', 'PUT', 'PATCH'].includes(method);
  const headers: Record<string, string> = {
    ...(needsContentType ? { 'Content-Type': 'application/json' } : {}),
    ...(init?.headers as Record<string, string>),
  };

  if (token && !headers['Authorization'] && !headers['authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const body = init?.body ?? (needsContentType ? '{}' : undefined);

  const response = await fetch(`/api/v1${path}`, {
    ...init,
    body,
    headers,
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const err = await response.json();
      message = err.message ?? err.error ?? message;
    } catch {
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
