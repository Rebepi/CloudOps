import { useState, useEffect } from 'react';
import { obtenerPrecios, invalidarCache, SERVICIOS_ESTATICOS } from '../services/pricingService';
import type { PrecioLive } from '../services/pricingService';

interface UsePreciosResult {
  precios: Record<string, PrecioLive>;
  cargando: boolean;
  error: string | null;
  refrescar: () => void;
}

export function usePrecios(): UsePreciosResult {
  const [precios, setPrecios] = useState<Record<string, PrecioLive>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);

    obtenerPrecios()
      .then((resultado) => {
        if (!cancelado) {
          setPrecios(resultado);
          setCargando(false);
        }
      })
      .catch(() => {
        if (!cancelado) {
          setError('No se pudo conectar a la AWS Pricing API');
          setCargando(false);
        }
      });

    return () => { cancelado = true; };
  }, [tick]);

  const refrescar = () => {
    invalidarCache();
    setTick((t) => t + 1);
  };

  return { precios, cargando, error, refrescar };
}

export { SERVICIOS_ESTATICOS };
