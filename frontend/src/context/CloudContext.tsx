import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { calcularSubtotalItemCosto } from '../lib/cloudSimulator';
import type { PropuestaCloud, ItemCosto } from '../types/cloud';

export type Ambiente = 'Producción' | 'Staging' | 'Sandbox';

interface CloudState {
  propuestas: PropuestaCloud[];
  agregarPropuesta: (p: Omit<PropuestaCloud, 'id' | 'creadaEn'>) => void;
  eliminarPropuesta: (id: string) => void;

  itemsCosto: ItemCosto[];
  agregarItemCosto: (i: Omit<ItemCosto, 'id'>) => void;
  eliminarItemCosto: (id: string) => void;
  limpiarCostos: () => void;
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
}

const Ctx = createContext<CloudState | null>(null);

const presetCostosIniciales: ItemCosto[] = [
  { id: '1', servicioId: 'ec2', cantidad: 2, horasMes: 730, configuracion: 't3.medium · 2 vCPU · 4GB RAM' },
  { id: '2', servicioId: 's3', cantidad: 120, horasMes: 1, configuracion: 'S3 Standard · Multi-Region' },
  { id: '3', servicioId: 'rds', cantidad: 1, horasMes: 730, configuracion: 'db.t3.medium · Multi-AZ PostgreSQL' },
  { id: '4', servicioId: 'cloudfront', cantidad: 350, horasMes: 1, configuracion: 'CDN Edge Transfer' },
  { id: '5', servicioId: 'elb', cantidad: 1, horasMes: 730, configuracion: 'Application Load Balancer' },
];

export function CloudProvider({ children }: { children: ReactNode }) {
  const [propuestas, setPropuestas] = useLocalStorage<PropuestaCloud[]>('cops.propuestas', [
    {
      id: 'demo-1',
      nombre: 'Plataforma E-Commerce Multi-AZ',
      tipoAplicacion: 'Web',
      descripcion: 'Arquitectura de alta disponibilidad con balanceo de carga, réplica de base de datos y distribución de activos estáticos en CDN.',
      regionId: 'us-east-1',
      usuariosEstimados: 25000,
      disponibilidad: 'alta',
      serviciosSeleccionados: ['ec2', 's3', 'rds', 'elb', 'cloudfront', 'route53', 'waf'],
      objetivoMigracion: 'Aumentar disponibilidad',
      presupuestoMaximo: 250,
      rtoHoras: 1,
      rpoMinutos: 15,
      cumplimiento: ['PCI-DSS', 'SOC 2'],
      creadaEn: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
  ]);

  const [itemsCosto, setItemsCosto] = useLocalStorage<ItemCosto[]>('cops.costos', presetCostosIniciales);
  const [regionPrincipal, setRegionPrincipal] = useState<string>('us-east-1');
  const [ambiente, setAmbiente] = useState<Ambiente>('Producción');
  const [presupuestoLimite, setPresupuestoLimite] = useState<number>(250);

  const agregarPropuesta: CloudState['agregarPropuesta'] = (p) =>
    setPropuestas((prev) => [
      { ...p, id: crypto.randomUUID(), creadaEn: new Date().toISOString() },
      ...prev,
    ]);

  const eliminarPropuesta = (id: string) =>
    setPropuestas((prev) => prev.filter((p) => p.id !== id));

  const agregarItemCosto: CloudState['agregarItemCosto'] = (i) =>
    setItemsCosto((prev) => [...prev, { ...i, id: crypto.randomUUID() }]);

  const eliminarItemCosto = (id: string) =>
    setItemsCosto((prev) => prev.filter((i) => i.id !== id));

  const limpiarCostos = () => setItemsCosto([]);

  const cargarPresetCostos = () => setItemsCosto(presetCostosIniciales);

  const multiplicadorAmbiente = useMemo(() => {
    switch (ambiente) {
      case 'Staging': return 0.45;
      case 'Sandbox': return 0.18;
      default: return 1.0;
    }
  }, [ambiente]);

  const costoMensual = useMemo(
    () =>
      itemsCosto.reduce((total, item) => {
        return total + calcularSubtotalItemCosto(item.servicioId, item.cantidad, item.horasMes, multiplicadorAmbiente);
      }, 0),
    [itemsCosto, multiplicadorAmbiente],
  );

  const exportarEstadoJson = () => {
    const data = {
      sistema: 'CloudOps Dashboard AWS',
      version: '2.4.0',
      fechaExportacion: new Date().toISOString(),
      ambiente,
      regionPrincipal,
      presupuestoLimite,
      costoMensualEstimado: costoMensual,
      costoAnualEstimado: costoMensual * 12,
      propuestasRegistradas: propuestas,
      elementosCosto: itemsCosto,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cloudops-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Ctx.Provider
      value={{
        propuestas,
        agregarPropuesta,
        eliminarPropuesta,
        itemsCosto,
        agregarItemCosto,
        eliminarItemCosto,
        limpiarCostos,
        cargarPresetCostos,
        costoMensual,
        costoAnual: costoMensual * 12,
        regionPrincipal,
        setRegionPrincipal,
        ambiente,
        setAmbiente,
        multiplicadorAmbiente,
        presupuestoLimite,
        setPresupuestoLimite,
        exportarEstadoJson,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useCloud() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCloud debe usarse dentro de CloudProvider');
  return ctx;
}
