import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { PropuestaCloud, ItemCosto } from '../types/cloud';

export type Ambiente = 'Producción' | 'Staging' | 'Sandbox';

interface CloudState {
  propuestas: PropuestaCloud[];
  agregarPropuesta: (p: Omit<PropuestaCloud, 'id' | 'creadaEn'>) => Promise<void>;
  eliminarPropuesta: (id: string) => Promise<void>;
  itemsCosto: ItemCosto[];
  agregarItemCosto: (i: Omit<ItemCosto, 'id'>) => Promise<void>;
  eliminarItemCosto: (id: string) => Promise<void>;
  limpiarCostos: () => Promise<void>;
  cargarPresetCostos: () => void;
  costoMensual: number;
  costoAnual: number;
  regionPrincipal: string;
  setRegionPrincipal: (r: string) => void;
  ambiente: Ambiente;
  setAmbiente: (a: Ambiente) => void;
  multiplicadorAmbiente: number;
  presupuestoLimite: number;
  setPresupuestoLimite: (limite: number) => void;
  exportarEstadoJson: () => void;
  cargando: boolean;
  error: string | null;
  refrescar: () => Promise<void>;
}

const Ctx = createContext<CloudState | null>(null);

function readLegacyArray(key: string): unknown[] {
  try { const value = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}

export function CloudProvider({ children }: { children: ReactNode }) {
  const [propuestas, setPropuestas] = useState<PropuestaCloud[]>([]);
  const [itemsCosto, setItemsCosto] = useState<ItemCosto[]>([]);
  const [regionPrincipal, setRegion] = useState('us-east-1');
  const [ambiente, setEnvironment] = useState<Ambiente>('Producción');
  const [presupuestoLimite, setBudget] = useState(250);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refrescar = async () => {
    const [p, c, s] = await Promise.all([
      api<{ data: PropuestaCloud[] }>('/proposals'),
      api<{ data: ItemCosto[] }>('/cost-items'),
      api<{ data: Record<string, unknown> }>('/settings'),
    ]);
    setPropuestas(p.data);
    setItemsCosto(c.data);
    if (typeof s.data.regionPrincipal === 'string') setRegion(s.data.regionPrincipal);
    if (s.data.ambiente === 'Producción' || s.data.ambiente === 'Staging' || s.data.ambiente === 'Sandbox') setEnvironment(s.data.ambiente);
    if (typeof s.data.presupuestoLimite === 'number') setBudget(s.data.presupuestoLimite);
  };

  useEffect(() => {
    const cargar = async () => {
      try {
        const proposals = readLegacyArray('cops.propuestas');
        const costItems = readLegacyArray('cops.costos');
        if (proposals.length || costItems.length) await api('/import/browser', { method: 'POST', body: JSON.stringify({ proposals, costItems }) });
        await refrescar();
        setError(null);
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
      finally { setCargando(false); }
    };
    void cargar();
  }, []);

  const run = async (operation: Promise<unknown>) => {
    try { await operation; await refrescar(); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); throw e; }
  };
  const agregarPropuesta: CloudState['agregarPropuesta'] = (p) => run(api('/proposals', { method: 'POST', body: JSON.stringify(p) }));
  const eliminarPropuesta = (id: string) => run(api(`/proposals/${encodeURIComponent(id)}`, { method: 'DELETE' }));
  const agregarItemCosto: CloudState['agregarItemCosto'] = (i) => run(api('/cost-items', { method: 'POST', body: JSON.stringify(i) }));
  const eliminarItemCosto = (id: string) => run(api(`/cost-items/${encodeURIComponent(id)}`, { method: 'DELETE' }));
  const limpiarCostos = () => run(api('/cost-items', { method: 'DELETE' }));
  const cargarPresetCostos = () => window.location.assign('/services');
  const saveSetting = (key: string, value: unknown) => { void run(api(`/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) })).catch(() => undefined); };
  const setRegionPrincipal = (value: string) => { setRegion(value); saveSetting('regionPrincipal', value); };
  const setAmbiente = (value: Ambiente) => { setEnvironment(value); saveSetting('ambiente', value); };
  const setPresupuestoLimite = (value: number) => { setBudget(value); saveSetting('presupuestoLimite', value); };

  // La estimación local es distinta del gasto real que devuelve Cost Explorer.
  const multiplicadorAmbiente = 1;
  const costoMensual = itemsCosto.reduce((sum, item) => sum +
    (item.precioUnitario == null ? 0 : item.precioUnitario * item.cantidad * (item.unidadPrecio === 'Hrs' ? item.horasMes : 1)), 0);
  const exportarEstadoJson = () => {
    const blob = new Blob([JSON.stringify({ propuestas, itemsCosto, regionPrincipal, ambiente, presupuestoLimite, tipo: 'estimacion_local' }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cloudops-local-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <Ctx.Provider value={{ propuestas, agregarPropuesta, eliminarPropuesta, itemsCosto, agregarItemCosto, eliminarItemCosto, limpiarCostos, cargarPresetCostos, costoMensual, costoAnual: costoMensual * 12, regionPrincipal, setRegionPrincipal, ambiente, setAmbiente, multiplicadorAmbiente, presupuestoLimite, setPresupuestoLimite, exportarEstadoJson, cargando, error, refrescar }}>{children}</Ctx.Provider>;
}

export function useCloud() {
  const context = useContext(Ctx);
  if (!context) throw new Error('useCloud debe usarse dentro de CloudProvider');
  return context;
}
