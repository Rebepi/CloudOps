import { useState, useEffect, useCallback, useRef } from 'react';
import { medirLatenciaRegion } from '../services/latencyService';

export type EstadoPing = 'idle' | 'midiendo' | 'listo' | 'error';

interface UseLatenciaResult {
  latenciaMs: number | null;
  estadoPing: EstadoPing;
  esDatoReal: boolean;
  medir: () => void;
}

export function useLatencia(
  regionId: string,
  latenciaEstatica: number
): UseLatenciaResult {
  const [latenciaMs, setLatenciaMs] = useState<number | null>(latenciaEstatica);
  const [estadoPing, setEstadoPing] = useState<EstadoPing>('idle');
  const [esDatoReal, setEsDatoReal] = useState(false);

  const regionActualRef = useRef(regionId);
  const estaMidiendoRef = useRef(false);
  const ultimaRegionMedidaRef = useRef<string | null>(null);

  regionActualRef.current = regionId;

  const medir = useCallback(async () => {
    if (estaMidiendoRef.current) return;
    estaMidiendoRef.current = true;
    setEstadoPing('midiendo');
    setEsDatoReal(false);

    try {
      const ms = await medirLatenciaRegion(regionId);
      if (regionActualRef.current === regionId) {
        if (ms !== null) {
          setLatenciaMs(ms);
          setEsDatoReal(true);
          setEstadoPing('listo');
        } else {
          setLatenciaMs(latenciaEstatica);
          setEstadoPing('idle');
        }
      }
    } catch {
      if (regionActualRef.current === regionId) {
        setLatenciaMs(latenciaEstatica);
        setEstadoPing('error');
      }
    } finally {
      estaMidiendoRef.current = false;
    }
  }, [regionId, latenciaEstatica]);

  useEffect(() => {
    setLatenciaMs(latenciaEstatica);
    setEsDatoReal(false);

    if (ultimaRegionMedidaRef.current !== regionId) {
      ultimaRegionMedidaRef.current = regionId;
      medir();
    }
  }, [regionId, latenciaEstatica, medir]);

  return { latenciaMs, estadoPing, esDatoReal, medir };
}
