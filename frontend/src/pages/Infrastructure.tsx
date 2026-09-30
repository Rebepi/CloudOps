import { startTransition, useState, useEffect, useMemo, useRef } from 'react';
import { useLatencia } from '../hooks/useLatencia';
import {
  Globe2,
  Layers,
  Leaf,
  Activity,
  RefreshCw,
  Compass,
  MapPin,
  Radio,
  Play,
  Pause,
  Building2,
  Waves,
  RotateCw,
} from 'lucide-react';
import { feature, mesh } from 'topojson-client';
import {
  geoNaturalEarth1,
  geoOrthographic,
  geoMercator,
  geoPath,
  geoGraticule10,
  geoDistance,
  type GeoProjection,
} from 'd3-geo';
import landData from 'world-atlas/land-110m.json';
import countriesData from 'world-atlas/countries-110m.json';
import { regionGeometry } from '../data/regionGeometry';
import { useAws } from '../hooks/useAws';
import { RegionCard } from '../components/RegionCard';
import { Card } from '../components/ui/Card';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/ui/StatusBadge';
import { InfoTooltip } from '../components/ui/InfoTooltip';
import type { Region } from '../types/cloud';
import { useCloud } from '../context/CloudContext';

const colorEstado: Record<string, string> = {
  activo: '#10B981',
  revision: '#F59E0B',
  inactivo: '#EF4444',
};

type TipoProyeccion = 'naturalEarth' | 'orthographic' | 'mercator';

export default function Infrastructure() {
  const { regionPrincipal } = useCloud();
  const regionList = useAws<{ id: string; status: string }[]>('/aws/regions');
  const regiones: Region[] = (regionList.data ?? []).flatMap((entry) => {
    const geo = regionGeometry[entry.id];
    if (!geo) return [];
    return [{ id: entry.id, nombre: geo.name, ubicacion: geo.name, continente: geo.continent,
      zonasDisponibilidad: Number.NaN, serviciosDesplegados: [], estado: entry.status === 'not-opted-in' ? 'inactivo' as const : 'activo' as const,
      latenciaMs: Number.NaN, principal: entry.id === regionPrincipal, coordenadas: { x: 0, y: 0 }, gps: geo.gps }];
  });
  const [regionSeleccionada, setRegionSeleccionada] = useState<Region>(() => {
    const geo = regionGeometry[regionPrincipal] ?? regionGeometry['us-east-1'];
    return { id: regionPrincipal, nombre: geo.name, ubicacion: geo.name, continente: geo.continent,
      zonasDisponibilidad: Number.NaN, serviciosDesplegados: [], estado: 'revision', latenciaMs: Number.NaN,
      principal: true, coordenadas: { x: 0, y: 0 }, gps: geo.gps };
  });
  const detail = useAws<{ inventory?: { zones: { id: string; name: string; state: string; type: string }[]; instances: { id: string; zone: string }[]; databases: { id: string; zone: string }[] }; network?: { vpcs: { id: string }[]; subnets: { id: string; zone: string }[] }; services?: { resources: Record<string, { items: { id: string }[] }> }; errors: Record<string, string> }>(`/aws/regions/${regionSeleccionada.id}/detail`);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const zoneDetail = useAws<{ zone: { id: string; name: string; state: string }; instances: { id: string }[]; databases: { id: string }[]; subnets: { id: string; cidr: string }[] }>(zoneId ? `/aws/regions/${regionSeleccionada.id}/zones/${zoneId}` : null);
  useEffect(() => {
    const current = regiones.find((r) => r.id === regionSeleccionada.id);
    if (current) setRegionSeleccionada(current);
  }, [regionList.data]);
  const [continenteFiltro, setContinenteFiltro] = useState<string>('Todos');

  const [tipoProyeccion, setTipoProyeccion] = useState<TipoProyeccion>('orthographic');
  const [rotacion, setRotacion] = useState<{ x: number; y: number }>({ x: 20, y: -10 });
  const [arrastrando, setArrastrando] = useState<boolean>(false);
  const [cooldownRestante, setCooldownRestante] = useState<number>(0);
  const [autoRotar, setAutoRotar] = useState<boolean>(true);

  const { latenciaMs: pingVivo, estadoPing, esDatoReal: pingEsReal, medir: medirPing } =
    useLatencia(regionSeleccionada.id, regionSeleccionada.latenciaMs);
  const probandoPing = estadoPing === 'midiendo';

  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const r = regiones.find((r) => r.id === regionPrincipal);
    if (r) {
      centrarEnRegion(r);
    }
  }, [regionPrincipal]);

  const requestRef = useRef<number | null>(null);
  const rotacionRef = useRef<number>(20);
  const rotacionYRef = useRef<number>(-10);
  const dragStartRef = useRef<{ x: number; y: number; rotX: number; rotY: number }>({ x: 0, y: 0, rotX: 20, rotY: -10 });
  const lastPointerPosRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });
  const velocityRef = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 });
  const cooldownUntilRef = useRef<number>(0);
  const cooldownDurationRef = useRef<number>(3500);
  const cooldownFracRef = useRef<number>(0);
  const reentryStartRef = useRef<number>(0);
  const flyToTargetRef = useRef<{ x: number; y: number } | null>(null);
  const hasMovedRef = useRef<boolean>(false);
  const [cooldownArc, setCooldownArc] = useState<number>(0);

  const activas = regiones.filter((r) => r.estado === 'activo').length;
  const totalZonas = detail.data?.inventory?.zones.length ?? 0;

  const regionesConDetalle = regiones.map((r) => r.id === regionSeleccionada.id ? {
    ...r,
    datosConsultados: Boolean(detail.data),
    zonasDisponibilidad: detail.data?.inventory?.zones.length ?? Number.NaN,
    serviciosDesplegados: detail.data?.services ? Object.entries(detail.data.services.resources).filter(([, value]) => value.items.length > 0).map(([key]) => key) : [],
    latenciaMs: pingVivo ?? Number.NaN,
  } : r);
  const regionesFiltradas = regionesConDetalle.filter(
    (r) => continenteFiltro === 'Todos' || r.continente === continenteFiltro
  );

  const angleDiff = (target: number, current: number) => {
    let diff = (target - current) % 360;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    return diff;
  };

  const centrarEnRegion = (r: Region) => {
    setRegionSeleccionada(r);
    setZoneId(null);
    if (tipoProyeccion !== 'orthographic') return;
    flyToTargetRef.current = {
      x: (-r.gps[0] + 360) % 360,
      y: Math.max(-60, Math.min(60, -r.gps[1])),
    };
    cooldownUntilRef.current = Date.now() + 4500;
    setCooldownRestante(5);
  };

  const volarAPreset = (x: number, y: number) => {
    flyToTargetRef.current = { x, y };
    cooldownUntilRef.current = Date.now() + 4500;
    setCooldownRestante(5);
  };

  useEffect(() => {
    let lastArcUpdate = 0;
    let lastFrame = 0;
    let active = true;
    const detener = () => {
      active = false;
      if (requestRef.current !== null) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
    };
    const handleNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const enlace = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(enlace instanceof HTMLAnchorElement) || enlace.hasAttribute('download') || (enlace.target && enlace.target !== '_self')) return;
      const destino = new URL(enlace.href, window.location.href);
      if (destino.origin === window.location.origin && destino.pathname !== window.location.pathname) detener();
    };
    document.addEventListener('click', handleNavigation);
    window.addEventListener('popstate', detener);

    const animate = (timestamp: number) => {
      if (!active) return;
      requestRef.current = requestAnimationFrame(animate);
      if (document.hidden) {
        lastFrame = 0;
        return;
      }
      if (lastFrame && timestamp - lastFrame < 1000 / 30) return;
      const frameScale = lastFrame ? Math.min(timestamp - lastFrame, 64) / (1000 / 60) : 1;
      lastFrame = timestamp;
      let siguienteRotacion: { x: number; y: number } | null = null;
      let siguienteArc: number | null = null;
      let siguienteRestante: number | null = null;
      let cambio = false;

      if (tipoProyeccion === 'orthographic' && !arrastrando) {
        if (flyToTargetRef.current) {
          const diffX = angleDiff(flyToTargetRef.current.x, rotacionRef.current);
          const diffY = flyToTargetRef.current.y - rotacionYRef.current;

          if (Math.abs(diffX) < 0.25 && Math.abs(diffY) < 0.25) {
            rotacionRef.current = flyToTargetRef.current.x;
            rotacionYRef.current = flyToTargetRef.current.y;
            flyToTargetRef.current = null;
          } else {
            const suavizado = 1 - Math.pow(0.92, frameScale);
            rotacionRef.current = (rotacionRef.current + diffX * suavizado + 360) % 360;
            rotacionYRef.current = rotacionYRef.current + diffY * suavizado;
          }
          cambio = true;
        }

        const nowTime = Date.now();
        if (autoRotar && nowTime < cooldownUntilRef.current) {
          const elapsed = nowTime - (cooldownUntilRef.current - cooldownDurationRef.current);
          const frac = Math.min(1, elapsed / cooldownDurationRef.current);
          cooldownFracRef.current = frac;
          if (nowTime - lastArcUpdate > 50) {
            lastArcUpdate = nowTime;
            siguienteArc = frac;
            const sec = Math.max(1, Math.ceil((cooldownUntilRef.current - nowTime) / 1000));
            siguienteRestante = sec;
          }
        } else {
          if (cooldownFracRef.current > 0) {
            cooldownFracRef.current = 0;
            reentryStartRef.current = nowTime;
            siguienteArc = 0;
            siguienteRestante = 0;
          }
          if (autoRotar) {
            const reentryMs = nowTime - reentryStartRef.current;
            const t = Math.min(1, reentryMs / 2200);
            const ease = t * t * t;
            rotacionRef.current = (rotacionRef.current + 0.38 * ease * frameScale) % 360;
            cambio = true;
          }
        }

        if (cambio) {
          siguienteRotacion = { x: rotacionRef.current, y: rotacionYRef.current };
        }
      }

      startTransition(() => {
        if (siguienteRotacion) setRotacion(siguienteRotacion);
        if (siguienteArc !== null) setCooldownArc(siguienteArc);
        if (siguienteRestante !== null) setCooldownRestante(siguienteRestante);
      });
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      detener();
      document.removeEventListener('click', handleNavigation);
      window.removeEventListener('popstate', detener);
    };
  }, [autoRotar, arrastrando, tipoProyeccion]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (tipoProyeccion !== 'orthographic') return;
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    setArrastrando(true);
    hasMovedRef.current = false;
    flyToTargetRef.current = null;
    velocityRef.current = { vx: 0, vy: 0 };
    lastPointerPosRef.current = { x: e.clientX, y: e.clientY, time: performance.now() };
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      rotX: rotacionRef.current,
      rotY: rotacionYRef.current,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!arrastrando || tipoProyeccion !== 'orthographic') return;
    const now = performance.now();
    const dt = Math.max(1, now - lastPointerPosRef.current.time);
    const stepDx = e.clientX - lastPointerPosRef.current.x;
    const stepDy = e.clientY - lastPointerPosRef.current.y;

    velocityRef.current = {
      vx: (stepDx / dt) * 6,
      vy: -(stepDy / dt) * 6,
    };
    lastPointerPosRef.current = { x: e.clientX, y: e.clientY, time: now };

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMovedRef.current = true;
    }
    const nuevoX = (dragStartRef.current.rotX + dx * 0.45 + 360) % 360;
    const nuevoY = Math.max(-75, Math.min(75, dragStartRef.current.rotY - dy * 0.45));
    rotacionRef.current = nuevoX;
    rotacionYRef.current = nuevoY;
    setRotacion({ x: nuevoX, y: nuevoY });
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!arrastrando) return;
    try {
      (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
    } catch {}
    velocityRef.current = { vx: 0, vy: 0 };
    setArrastrando(false);
    const dur = 3500;
    cooldownDurationRef.current = dur;
    cooldownUntilRef.current = Date.now() + dur;
    cooldownFracRef.current = 0;
    setCooldownArc(0);
    setCooldownRestante(4);
    const curX = rotacionRef.current;
    const curY = rotacionYRef.current;
    let bestRegion: Region | null = null;
    let bestDist = Infinity;
    regiones.forEach((r) => {
      const centerPoint: [number, number] = [-curX, -curY];
      const d = geoDistance(r.gps, centerPoint);
      if (d < Math.PI / 2 && d < bestDist) {
        bestDist = d;
        bestRegion = r;
      }
    });
    if (bestRegion) {
      const br = bestRegion as Region;
      flyToTargetRef.current = {
        x: (-br.gps[0] + 360) % 360,
        y: Math.max(-60, Math.min(60, -br.gps[1])),
      };
    }
  };

  const proyeccion = useMemo<GeoProjection>(() => {
    if (tipoProyeccion === 'orthographic') {
      return geoOrthographic()
        .fitExtent([[40, 20], [960, 500]], { type: 'Sphere' })
        .rotate([rotacion.x, rotacion.y])
        .clipAngle(90);
    }
    if (tipoProyeccion === 'mercator') {
      return geoMercator()
        .fitExtent([[20, 20], [980, 500]], { type: 'Sphere' })
        .center([0, 20]);
    }
    return geoNaturalEarth1().fitExtent([[20, 20], [980, 480]], { type: 'Sphere' });
  }, [tipoProyeccion, rotacion]);

  const geoPathGenerator = useMemo(() => {
    return geoPath(proyeccion);
  }, [proyeccion]);

  const tierraGeoJson = useMemo(() => {
    return feature(landData as unknown as Parameters<typeof feature>[0], 'land');
  }, []);

  const paisesGeoJson = useMemo(() => {
    return mesh(
      countriesData as unknown as Parameters<typeof mesh>[0],
      (countriesData as any).objects.countries,
      (a, b) => a !== b
    );
  }, []);

  const graticuleLines = useMemo(() => {
    return geoGraticule10();
  }, []);

  const pathTierra = useMemo(() => {
    return geoPathGenerator(tierraGeoJson) || '';
  }, [geoPathGenerator, tierraGeoJson]);

  const pathPaises = useMemo(() => {
    return geoPathGenerator(paisesGeoJson) || '';
  }, [geoPathGenerator, paisesGeoJson]);

  const pathGraticule = useMemo(() => {
    return geoPathGenerator(graticuleLines) || '';
  }, [geoPathGenerator, graticuleLines]);

  const pathSphere = useMemo(() => {
    return geoPathGenerator({ type: 'Sphere' }) || '';
  }, [geoPathGenerator]);

  const probarLatencia = medirPing;

  const nodeOpacity = (gps: [number, number]): number => {
    if (tipoProyeccion !== 'orthographic') return 1;
    const centerPoint: [number, number] = [-rotacion.x, -rotacion.y];
    const dist = geoDistance(gps, centerPoint);
    const horizon = Math.PI / 2;
    if (dist >= horizon) return 0;
    const fadeZone = 0.28;
    if (dist >= horizon - fadeZone) {
      return Math.max(0, (horizon - dist) / fadeZone);
    }
    return 1;
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          titulo="Región seleccionada"
          valor={regionSeleccionada.id}
          detalle={detail.loading ? 'Consultando AWS…' : detail.error ? 'Consulta no disponible' : regionSeleccionada.nombre}
          icono={Activity}
          tono="brand"
          tendencia="Inventario AWS"
          info={{
            titulo: "Región seleccionada",
            descripcion: "Los detalles de esta región se consultan en AWS al seleccionarla."
          }}
        />
        <StatCard
          titulo="Regiones disponibles en AWS"
          valor={`${activas} de ${regiones.length}`}
          detalle="Según DescribeRegions para esta cuenta"
          icono={Globe2}
          tono="safe"
          tendencia="Estado de acceso regional"
          info={{
            titulo: "Regiones Geográficas AWS",
            descripcion: "Ubicaciones físicas separadas en el mundo compuestas por zonas de disponibilidad aisladas para aislamiento de fallos y soberanía de datos."
          }}
        />
        <StatCard
          titulo="Zonas de Disponibilidad (AZs)"
          valor={`${totalZonas} AZs`}
          detalle={`Región ${regionSeleccionada.id}`}
          icono={Layers}
          tono="purple"
          tendencia="DescribeAvailabilityZones"
          info={{
            titulo: "Zonas de Disponibilidad (AZ)",
            descripcion: "AWS devuelve las zonas de disponibilidad de la región seleccionada. Una AZ puede contener más de un centro de datos físico."
          }}
        />
        <StatCard
          titulo="VPC en la región"
          valor={String(detail.data?.network?.vpcs.length ?? '—')}
          detalle={`${detail.data?.network?.subnets.length ?? '—'} subredes detectadas`}
          icono={Leaf}
          tono="safe"
          info={{
            titulo: "Red regional",
            descripcion: "Conteo de VPC y subredes existentes en la región seleccionada."
          }}
        />
      </div>

      <Card className="p-6 overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-line pb-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-35" style={{ animationDuration: '4s' }} />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600 shadow-[0_0_6px_rgba(37,99,235,0.4)]" />
              </span>
              <h2 className="text-lg font-bold text-ink">
                Consola Cartográfica Global AWS
              </h2>
              <InfoTooltip
                titulo="Consola Cartográfica Global"
                descripcion="Las regiones proceden de DescribeRegions; el mapa usa coordenadas geográficas para ubicarlas."
              />
            </div>
            <p className="text-xs text-muted mt-0.5">
              Selecciona una región para consultar sus zonas y recursos AWS.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="flex rounded-xl bg-canvas p-1 border border-line text-xs font-semibold">
                <button
                  onClick={() => setTipoProyeccion('naturalEarth')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    tipoProyeccion === 'naturalEarth'
                      ? 'bg-card text-blue-600 shadow-xs border border-line'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  Planisferio
                </button>
                <button
                  onClick={() => setTipoProyeccion('orthographic')}
                  className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                    tipoProyeccion === 'orthographic'
                      ? 'bg-card text-blue-600 shadow-xs border border-line'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  <Globe2 size={13} />
                  Globo 3D
                </button>
                <button
                  onClick={() => setTipoProyeccion('mercator')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    tipoProyeccion === 'mercator'
                      ? 'bg-card text-blue-600 shadow-xs border border-line'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  Mercator
                </button>
              </div>
              <InfoTooltip
                titulo="Modo de Proyección"
                descripcion="Alterna entre proyección esférica 3D interactiva, proyección cilíndrica ecuirrectangular Natural Earth y proyección estándar de Mercator."
              />
            </div>

            <div className="flex items-center gap-1.5">
              <div className="flex rounded-xl bg-canvas p-1 border border-line text-xs font-semibold">
                <button disabled title="No hay trazas de cables físicos en la API consultada" className="px-3 py-1 rounded-lg text-muted opacity-50">Troncal Fibra</button>
                <button
                  className="px-3 py-1 rounded-lg bg-card text-blue-600 shadow-xs border border-line"
                >
                  Regiones AWS
                </button>
                <button disabled title="No hay inventario de ubicaciones Edge individuales en la API consultada" className="px-3 py-1 rounded-lg text-muted opacity-50 flex items-center gap-1.5"><Radio size={13} /> CloudFront PoPs</button>
              </div>
              <InfoTooltip
                titulo="Capas de Red"
                descripcion="Muestra las regiones devueltas por AWS DescribeRegions."
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-muted uppercase tracking-wider hidden xl:block">Región:</span>
              <div className="flex items-center gap-1 bg-canvas p-1 rounded-2xl border border-line">
                {([
                  { id: 'Todos', label: 'Todos', Icon: Globe2, color: 'blue', count: regiones.length },
                  { id: 'América', label: 'América', Icon: MapPin, color: 'emerald', count: regiones.filter(r => r.continente === 'América').length },
                  { id: 'Europa', label: 'Europa', Icon: Building2, color: 'violet', count: regiones.filter(r => r.continente === 'Europa').length },
                  { id: 'Asia-Pacífico', label: 'Asia-Pacífico', Icon: Waves, color: 'amber', count: regiones.filter(r => r.continente === 'Asia-Pacífico').length },
                  { id: 'África', label: 'África', Icon: MapPin, color: 'emerald', count: regiones.filter(r => r.continente === 'África').length },
                  { id: 'Oriente Medio', label: 'Oriente Medio', Icon: MapPin, color: 'amber', count: regiones.filter(r => r.continente === 'Oriente Medio').length },
                ] as const).map((cont) => {
                  const isActive = continenteFiltro === cont.id;
                  const colorMap: Record<string, string> = {
                    blue: isActive ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 border border-blue-500' : 'text-muted hover:text-ink hover:bg-card',
                    emerald: isActive ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30 border border-emerald-500' : 'text-muted hover:text-ink hover:bg-card',
                    violet: isActive ? 'bg-violet-600 text-white shadow-md shadow-violet-500/30 border border-violet-500' : 'text-muted hover:text-ink hover:bg-card',
                    amber: isActive ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30 border border-amber-400' : 'text-muted hover:text-ink hover:bg-card',
                  };
                  const iconColorMap: Record<string, string> = {
                    blue: isActive ? 'text-white' : 'text-blue-500',
                    emerald: isActive ? 'text-white' : 'text-emerald-500',
                    violet: isActive ? 'text-white' : 'text-violet-500',
                    amber: isActive ? 'text-white' : 'text-amber-500',
                  };
                  return (
                    <button
                      key={cont.id}
                      onClick={() => setContinenteFiltro(cont.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${colorMap[cont.color]}`}
                    >
                      <cont.Icon size={13} className={iconColorMap[cont.color]} />
                      <span className={`hidden sm:inline ${isActive ? 'font-bold' : ''}`}>{cont.label}</span>
                      <span className={`text-[10px] font-mono font-bold px-1 py-0.5 rounded-md ${isActive ? 'bg-white/25' : 'bg-canvas border border-line'}`}>
                        {cont.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {tipoProyeccion === 'orthographic' && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-blue-500/5 border border-blue-500/20 text-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setAutoRotar(!autoRotar);
                  flyToTargetRef.current = null;
                  cooldownUntilRef.current = 0;
                  cooldownFracRef.current = 0;
                  reentryStartRef.current = 0;
                  setCooldownArc(0);
                  setCooldownRestante(0);
                }}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  autoRotar
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-card border border-line text-ink hover:text-blue-600'
                }`}
              >
                {autoRotar ? <Pause size={13} /> : <Play size={13} />}
                {autoRotar ? 'Pausar Rotación' : 'Auto-Rotar Órbita'}
              </button>
              {cooldownRestante > 0 && autoRotar ? (
                <div className="flex items-center gap-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60 px-3 py-1.5 text-[11px] font-medium backdrop-blur-sm">
                  <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
                    <circle cx="9" cy="9" r="7" fill="none" stroke="#1e293b" strokeWidth="2.5" />
                    <circle
                      cx="9" cy="9" r="7"
                      fill="none"
                      stroke={cooldownArc > 0.65 ? '#34D399' : cooldownArc > 0.3 ? '#38BDF8' : '#F59E0B'}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={`${cooldownArc * 2 * Math.PI * 7} ${(1 - cooldownArc) * 2 * Math.PI * 7}`}
                      strokeDashoffset="0"
                      transform="rotate(-90 9 9)"
                      style={{ transition: 'stroke 0.4s ease' }}
                    />
                  </svg>
                  <span className="text-slate-300">
                    Analizando · <span className="text-white font-bold">{cooldownRestante}s</span>
                  </span>
                  <button
                    onClick={() => {
                      cooldownUntilRef.current = 0;
                      cooldownFracRef.current = 0;
                      setCooldownArc(0);
                      setCooldownRestante(0);
                      reentryStartRef.current = Date.now();
                    }}
                    className="text-blue-400 hover:text-blue-200 underline cursor-pointer transition-colors"
                  >
                    Orbitar
                  </button>
                </div>
              ) : arrastrando ? (
                <div className="flex items-center gap-2 text-[11px] text-blue-300 font-medium">
                  <Compass size={12} className="text-blue-400" />
                  <span>Explorando</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-muted text-[11px] font-mono">
                    {Math.round(rotacion.x)}° λ · {Math.round(rotacion.y)}° φ
                  </span>
                  <span className="hidden sm:inline-flex items-center gap-1 rounded-lg bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-400 border border-blue-500/20">
                    <Compass size={12} />
                    Arrastra libremente
                  </span>
                </div>
              )}

            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="hidden lg:flex items-center gap-1 bg-canvas p-1 rounded-xl border border-line text-xs font-semibold">
                {[
                  { label: 'América', x: 75, y: -15 },
                  { label: 'Europa', x: 350, y: -45 },
                  { label: 'Asia', x: 235, y: -30 },
                  { label: 'Pacífico', x: 170, y: 0 },
                ].map((v) => (
                  <button
                    key={v.label}
                    onClick={() => volarAPreset(v.x, v.y)}
                    className="px-2 py-0.5 rounded-lg text-muted hover:text-brand hover:bg-card transition-all cursor-pointer text-[11px]"
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <RotateCw size={12} className="text-blue-400 shrink-0" />
                <span className="text-[11px] text-muted">Rotar:</span>
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={Math.round(rotacion.x)}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setAutoRotar(false);
                    rotacionRef.current = val;
                    setRotacion((prev) => ({ ...prev, x: val }));
                  }}
                  style={{
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(Math.round(rotacion.x) / 360) * 100}%, #334155 ${(Math.round(rotacion.x) / 360) * 100}%, #334155 100%)`,
                  }}
                  className="w-28 h-2 rounded-lg cursor-pointer accent-blue-500 appearance-none"
                />
                <span className="text-[10px] font-mono text-blue-400 w-8 text-right">{Math.round(rotacion.x)}°</span>
              </div>
            </div>
          </div>
        )}

        <div className="relative w-full overflow-hidden rounded-3xl bg-gradient-to-b from-[#020617] via-[#081329] to-[#01040D] border border-slate-800 p-2 sm:p-4 shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />

          <svg
            viewBox={isMobile && tipoProyeccion === 'orthographic' ? "220 -20 560 560" : "0 0 1000 520"}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={`infrastructure-map w-full h-auto sm:max-h-[560px] select-none block touch-none ${
              tipoProyeccion === 'orthographic'
                ? arrastrando
                  ? 'cursor-grabbing'
                  : 'cursor-grab'
                : 'cursor-default'
            }`}
          >
            <defs>
              <radialGradient id="oceanDeep" cx="38%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#0D2A5E" stopOpacity="1" />
                <stop offset="40%" stopColor="#071B42" stopOpacity="1" />
                <stop offset="100%" stopColor="#020A20" stopOpacity="1" />
              </radialGradient>

              <radialGradient id="landGrad" cx="38%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#1E4D7A" stopOpacity="1" />
                <stop offset="55%" stopColor="#0F2D52" stopOpacity="1" />
                <stop offset="100%" stopColor="#061525" stopOpacity="1" />
              </radialGradient>

              <radialGradient id="specularLight" cx="35%" cy="28%" r="45%">
                <stop offset="0%" stopColor="#7DD3FC" stopOpacity="0.55" />
                <stop offset="45%" stopColor="#38BDF8" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0" />
              </radialGradient>

              <radialGradient id="atmosphereGrad" cx="50%" cy="50%" r="50%">
                <stop offset="78%" stopColor="#1E40AF" stopOpacity="0" />
                <stop offset="88%" stopColor="#38BDF8" stopOpacity="0.35" />
                <stop offset="96%" stopColor="#7DD3FC" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#BAE6FD" stopOpacity="0" />
              </radialGradient>

              <radialGradient id="shadowEdge" cx="62%" cy="65%" r="55%">
                <stop offset="0%" stopColor="#000000" stopOpacity="0" />
                <stop offset="60%" stopColor="#000510" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#000510" stopOpacity="0.85" />
              </radialGradient>

              <linearGradient id="fiberGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.9" />
                <stop offset="50%" stopColor="#60A5FA" stopOpacity="1" />
                <stop offset="100%" stopColor="#34D399" stopOpacity="0.9" />
              </linearGradient>

              <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <filter id="particleGlow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <linearGradient id="arcGradActive" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#22D3EE" stopOpacity="1" />
                <stop offset="35%" stopColor="#38BDF8" stopOpacity="1" />
                <stop offset="70%" stopColor="#818CF8" stopOpacity="1" />
                <stop offset="100%" stopColor="#C084FC" stopOpacity="1" />
              </linearGradient>

              <linearGradient id="arcGradCyanViolet" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.85" />
                <stop offset="45%" stopColor="#3B82F6" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.85" />
              </linearGradient>

              <linearGradient id="arcGradEmeraldCyan" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10B981" stopOpacity="0.85" />
                <stop offset="50%" stopColor="#06B6D4" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.85" />
              </linearGradient>

              <filter id="atmosphereBlur" x="-8%" y="-8%" width="116%" height="116%">
                <feGaussianBlur stdDeviation="6" result="blur" />
              </filter>

              <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <clipPath id="sphereClip">
                {pathSphere && <path d={pathSphere} />}
              </clipPath>

              <linearGradient id="cooldownArcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.95" />
                <stop offset="50%" stopColor="#38BDF8" stopOpacity="1" />
                <stop offset="100%" stopColor="#34D399" stopOpacity="0.9" />
              </linearGradient>

              <filter id="arcGlow" x="-15%" y="-15%" width="130%" height="130%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {pathSphere && (
              <>
                <path
                  d={pathSphere}
                  fill="url(#atmosphereGrad)"
                  filter="url(#atmosphereBlur)"
                  stroke="none"
                  transform={tipoProyeccion === 'orthographic' ? 'scale(1.055) translate(-27.5,-26)' : ''}
                />

                <path
                  d={pathSphere}
                  fill="url(#oceanDeep)"
                  stroke="#1D4ED8"
                  strokeWidth="0.8"
                  strokeOpacity="0.6"
                />

                {tipoProyeccion === 'orthographic' && autoRotar && cooldownArc > 0 && (() => {
                  const R = 234;
                  const cx = 500;
                  const cy = 260;
                  const circ = 2 * Math.PI * R;
                  const progress = cooldownArc;
                  const dash = progress * circ;
                  const gap = circ - dash;
                  const rotation = -90;
                  return (
                    <>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={R}
                        fill="none"
                        stroke="#0F172A"
                        strokeWidth="6"
                        opacity="0.6"
                      />
                      <circle
                        cx={cx}
                        cy={cy}
                        r={R}
                        fill="none"
                        stroke="url(#cooldownArcGrad)"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeDasharray={`${dash} ${gap}`}
                        strokeDashoffset="0"
                        transform={`rotate(${rotation} ${cx} ${cy})`}
                        filter="url(#arcGlow)"
                        opacity="0.92"
                      />
                    </>
                  );
                })()}
              </>
            )}

            {pathGraticule && (
              <path
                d={pathGraticule}
                fill="none"
                stroke="#60A5FA"
                strokeWidth="0.35"
                strokeDasharray="1.5 3"
                opacity="0.2"
                clipPath="url(#sphereClip)"
              />
            )}

            {pathTierra && (
              <>
                <path
                  d={pathTierra}
                  fill="url(#landGrad)"
                  stroke="#38BDF8"
                  strokeWidth="0.7"
                  strokeOpacity="0.55"
                />
                <path
                  d={pathTierra}
                  fill="url(#shadowEdge)"
                  stroke="none"
                  opacity="0.7"
                />
              </>
            )}

            {pathPaises && (
              <path
                d={pathPaises}
                fill="none"
                stroke="#1E3A5C"
                strokeWidth="0.5"
                strokeOpacity="0.45"
                clipPath="url(#sphereClip)"
              />
            )}

            {pathSphere && (
              <>
                <path
                  d={pathSphere}
                  fill="url(#specularLight)"
                  stroke="none"
                  opacity="1"
                />
                <path
                  d={pathSphere}
                  fill="url(#shadowEdge)"
                  stroke="none"
                  opacity="0.5"
                />
              </>
            )}

            {regiones.map((r) => {
              const esFiltrada = continenteFiltro === 'Todos' || r.continente === continenteFiltro;
              const op = nodeOpacity(r.gps);
              const coords = proyeccion(r.gps);
              const cx = coords ? coords[0] : 0;
              const cy = coords ? coords[1] : 0;
              const esVisible = Boolean(coords && op > 0);
              const esSeleccionada = regionSeleccionada.id === r.id;
              const esHovered = hoveredNode === r.id;
              const esEnfocada = esSeleccionada || esHovered;
              const opacidadFiltro = esFiltrada ? 1 : 0.15;

              return (
                <g
                  key={r.id}
                  opacity={esVisible ? op * opacidadFiltro : 0}
                  transform={`translate(${cx}, ${cy})`}
                  style={{ pointerEvents: esVisible ? 'auto' : 'none' }}
                  onMouseEnter={() => setHoveredNode(r.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => {
                    if (hasMovedRef.current) return;
                    centrarEnRegion(r);
                  }}
                  className="cursor-pointer group"
                >
                  <circle
                    cx="0"
                    cy="0"
                    r={esEnfocada ? '14' : '9'}
                    fill={colorEstado[r.estado]}
                    opacity={esEnfocada ? '0.35' : '0.2'}
                  />

                  {esEnfocada && (
                    <circle
                      cx="0"
                      cy="0"
                      r={esSeleccionada ? '18' : '15'}
                      fill="none"
                      stroke={esSeleccionada ? '#38BDF8' : '#67E8F9'}
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                      className="animate-spin"
                      style={{ transformOrigin: '0 0' }}
                    />
                  )}

                  <circle
                    cx="0"
                    cy="0"
                    r={esEnfocada ? '7.5' : '5'}
                    fill={colorEstado[r.estado]}
                    stroke="#FFFFFF"
                    strokeWidth={esEnfocada ? '2.2' : '1.8'}
                  />

                  <g transform="translate(0, -12)">
                    <rect
                      x="-44"
                      y="-22"
                      width="88"
                      height="20"
                      rx="6"
                      fill={esEnfocada ? '#2563EB' : '#0B132B'}
                      stroke={esEnfocada ? '#60A5FA' : '#334155'}
                      strokeWidth={esEnfocada ? '1.5' : '1'}
                    />
                    <text
                      x="0"
                      y="-8"
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize="9.5"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {r.id}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>

          <div className="hidden sm:block absolute top-3 left-3 sm:top-4 sm:left-4 rounded-2xl bg-slate-950/85 backdrop-blur-md px-4 py-3 border border-slate-800 text-xs text-slate-300 space-y-1 z-10 shadow-lg pointer-events-none">
            <div className="flex items-center gap-2 text-white font-bold">
              <Compass size={16} className="text-blue-400" />
              <span>Red Cartográfica AWS Global Infrastructure</span>
            </div>
            <p className="text-[11px] text-slate-400">
              {regiones.length} regiones consultadas · {detail.data?.inventory?.zones.length ?? '—'} AZ en {regionSeleccionada.id}
            </p>
          </div>

          <div className="hidden sm:flex absolute bottom-3 right-3 sm:bottom-4 sm:right-4 flex-wrap items-center gap-3 rounded-2xl bg-slate-950/85 backdrop-blur-md px-4 py-2.5 border border-slate-800 text-xs text-slate-300 z-10 shadow-lg pointer-events-none">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" style={{ animationDuration: '3.5s' }} />
              <span className="font-semibold text-white">Regiones AWS</span>
            </div>
            <span className="text-slate-600">|</span>
            <span>Estado consultado en DescribeRegions</span>
          </div>

          <div className="sm:hidden absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-slate-950/85 backdrop-blur-md px-2.5 py-1 border border-slate-800 text-[10px] text-slate-300 z-10 pointer-events-none">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-white">Regiones AWS</span>
          </div>
        </div>

        {regionSeleccionada && (
          <div className="mt-6 rounded-3xl bg-gradient-to-br from-card to-canvas p-6 border border-line shadow-sm space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-line pb-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                    Nodo de Infraestructura Seleccionado
                  </span>
                  <StatusBadge nivel={regionSeleccionada.estado} />
                  {regionSeleccionada.principal && (
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 whitespace-nowrap">
                      Región Primaria de Operaciones
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-black text-ink">
                  {regionSeleccionada.nombre} ({regionSeleccionada.id})
                </h3>
                <p className="text-xs text-muted flex items-center gap-1.5">
                  <MapPin size={14} className="text-blue-500" />
                  {regionSeleccionada.ubicacion} · Continente: {regionSeleccionada.continente} · GPS: [{regionSeleccionada.gps[0].toFixed(2)}°, {regionSeleccionada.gps[1].toFixed(2)}°]
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-card border border-line shadow-xs">
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1.5 mb-0.5">
                      <p className="text-[10px] text-muted font-bold uppercase">Latencia Round-Trip</p>
                      <InfoTooltip
                        titulo="Latencia RTT"
                        descripcion="Medición en vivo del tiempo de ida y vuelta mediante sondas HTTPS directas contra la infraestructura de esta región de AWS."
                      />
                      {probandoPing ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 border border-amber-500/30 animate-pulse">
                          midiendo…
                        </span>
                      ) : pingEsReal ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 flex items-center gap-0.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          REAL
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-500/10 text-muted border border-line">
                          sin medir
                        </span>
                      )}
                    </div>
                    <p className={`text-lg font-black font-mono transition-colors ${pingEsReal ? 'text-emerald-600' : 'text-ink'}`}>
                      {pingVivo ?? '—'} ms
                    </p>
                  </div>
                  <button
                    onClick={probarLatencia}
                    disabled={probandoPing}
                    className="grid h-8 w-8 place-items-center rounded-xl bg-blue-500/10 text-blue-600 hover:bg-blue-500 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                    title="Medir latencia real hacia esta región AWS"
                  >
                    <RefreshCw size={14} className={probandoPing ? 'animate-spin' : ''} />
                  </button>
                </div>

                <div className="px-4 py-2.5 rounded-2xl bg-card border border-line shadow-xs">
                  <p className="text-[10px] text-muted font-bold uppercase">Zonas Disponibles</p>
                  <p className="text-lg font-black text-ink">{detail.data?.inventory?.zones.length ?? '—'} AZs</p>
                </div>

                <div className="px-4 py-2.5 rounded-2xl bg-card border border-line shadow-xs">
                  <p className="text-[10px] text-muted font-bold uppercase">Servicios Activos</p>
                  <p className="text-lg font-black text-emerald-600">
                    {detail.data?.services ? Object.values(detail.data.services.resources).filter((r) => r.items.length > 0).length : '—'} desplegados
                  </p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-ink mb-2 uppercase tracking-wider">
                Zonas de disponibilidad de {regionSeleccionada.id}
              </p>
              {detail.loading && <p className="text-xs text-muted">Consultando AWS…</p>}
              {detail.error && <p className="text-xs text-rose-600">{detail.error}</p>}
              {detail.data && Object.entries(detail.data.errors).map(([key, value]) => <p key={key} className="text-xs text-amber-600">{key}: {value}</p>)}
              <p className="mb-2 text-xs text-muted">EC2: {detail.data?.inventory?.instances.length ?? '—'} · RDS: {detail.data?.inventory?.databases.length ?? '—'} · VPC: {detail.data?.network?.vpcs.length ?? '—'} · subredes: {detail.data?.network?.subnets.length ?? '—'}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
                {(detail.data?.inventory?.zones ?? []).map((zone) => <button type="button" key={zone.id} onClick={() => setZoneId(zone.id)} className={`p-3 rounded-2xl bg-card border text-left text-xs hover:border-blue-500/40 ${zoneId === zone.id ? 'border-blue-500' : 'border-line'}`}>
                  <p className="font-bold text-ink">{zone.name}</p><p className="font-mono text-muted">{zone.id}</p><p className="mt-2 text-muted">{zone.state}</p>
                </button>)}
              </div>
              {zoneId && <div className="mt-4 rounded-2xl border border-line bg-card p-4 text-xs text-ink">
                {zoneDetail.loading ? 'Consultando zona…' : zoneDetail.error ? zoneDetail.error : zoneDetail.data ? <>
                  <strong>{zoneDetail.data.zone.name} · {zoneDetail.data.zone.id}</strong>
                  <p className="mt-1">Estado: {zoneDetail.data.zone.state} · EC2: {zoneDetail.data.instances.length} · RDS: {zoneDetail.data.databases.length} · subredes: {zoneDetail.data.subnets.length}</p>
                  {zoneDetail.data.instances.map((item) => <p key={item.id}>EC2 {item.id}</p>)}
                  {zoneDetail.data.databases.map((item) => <p key={item.id}>RDS {item.id}</p>)}
                  {zoneDetail.data.subnets.map((item) => <p key={item.id}>Subred {item.id} · {item.cidr}</p>)}
                </> : null}
              </div>}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-6 border-blue-500/20 bg-gradient-to-br from-card to-blue-500/5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><h3 className="text-base font-bold text-ink">Conmutación por error Multi-AZ</h3><p className="mt-1 text-xs text-muted">No hay una prueba de fallo ejecutada en esta cuenta.</p></div>
          <button type="button" disabled className="rounded-xl bg-canvas px-5 py-2.5 text-xs font-bold text-muted opacity-60">Prueba no disponible</button>
        </div>
      </Card>
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-ink">Catálogo Completo de Regiones ({regionesFiltradas.length})</h3>
              <InfoTooltip
                titulo="Directorio de Regiones"
                descripcion="Listado completo de todas las regiones geográficas de AWS con detalles sobre zonas de disponibilidad, servicios desplegados y coordenadas de telemetría."
              />
            </div>
            <p className="text-xs text-muted">Regiones AWS; las AZ y los recursos se consultan al seleccionar una región</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {regionesFiltradas.map((region) => (
            <RegionCard
              key={region.id}
              region={region}
              onClick={() => centrarEnRegion(region)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
