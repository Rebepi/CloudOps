import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type AwsResponse } from '../lib/api';

export function useAws<T>(path: string | null) {
  const [result, setResult] = useState<AwsResponse<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++requestId.current;
    if (!path) { setResult(null); setError(null); setLoading(false); return false; }
    setLoading(true);
    setResult(null);
    try { const next = await api<AwsResponse<T>>(path); if (current === requestId.current) { setResult(next); setError(null); } return true; }
    catch (e) { if (current === requestId.current) setError(e instanceof Error ? e.message : String(e)); return false; }
    finally { if (current === requestId.current) setLoading(false); }
  }, [path]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { data: result?.data ?? null, observedAt: result?.observedAt, cached: result?.cached, errors: result?.errors, loading, error, refresh };
}
