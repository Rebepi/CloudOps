import { useCallback, useEffect, useState } from 'react';
import { api, type AwsResponse } from '../lib/api';

export type EstadoPing = 'idle' | 'midiendo' | 'listo' | 'error';

export function useLatencia(regionId: string, _latenciaEstatica?: number) {
  const [latenciaMs, setLatenciaMs] = useState<number | null>(null);
  const [estadoPing, setEstadoPing] = useState<EstadoPing>('idle');
  const [error, setError] = useState<string | null>(null);
  const medir = useCallback(async () => {
    setEstadoPing('midiendo');
    setError(null);
    try {
      const result = await api<AwsResponse<{ milliseconds: number }>>(`/aws/latency?region=${encodeURIComponent(regionId)}`);
      setLatenciaMs(result.data.milliseconds);
      setEstadoPing('listo');
    } catch (cause) {
      setLatenciaMs(null);
      setError(cause instanceof Error ? cause.message : String(cause));
      setEstadoPing('error');
    }
  }, [regionId]);
  useEffect(() => { setLatenciaMs(null); setEstadoPing('idle'); }, [regionId]);
  return { latenciaMs, estadoPing, esDatoReal: estadoPing === 'listo', medir, error };
}
