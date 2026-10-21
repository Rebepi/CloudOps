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
  const multipart = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const headers = new Headers(init?.headers);
  if (multipart) headers.delete('Content-Type');
  else if (needsContentType && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
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
