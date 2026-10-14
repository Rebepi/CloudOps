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
  Server,
  Database,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Zap,
  X,
  PlayCircle,
} from 'lucide-react';
import { feature, mesh } from 'topojson-client';
import {
  geoNaturalEarth1,
  geoOrthographic,
  geoMercator,
  geoPath,
  geoGraticule10,
  geoDistance,
  geoInterpolate,
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
import {
  ENLACES_AWS_BACKBONE,
  CLOUDFRONT_POPS,
  generarGeoLinea,
  type CapaRed,
  type CloudFrontPoP,
} from '../data/networkLayers';
import { useCloud } from '../context/CloudContext';

const colorEstado: Record<string, string> = {
  activo: '#10B981',
  revision: '#F59E0B',
  inactivo: '#EF4444',
};

type TipoProyeccion = 'naturalEarth' | 'orthographic' | 'mercator';

interface ServerInstance {
  id: string;
  name?: string | null;
  type?: string;
  state?: string;
  zone: string;
  vpcId?: string;
  subnetId?: string;
  publicIp?: string;
  environment?: string | null;
}

interface ServerDatabase {
  id: string;
  engine?: string;
  class?: string;
  status: string;
  multiAz: boolean;
  zone: string;
  vpcId?: string;
}

interface DetailVpc {
  id: string;
  cidr?: string;
  default?: boolean;
  state?: string;
}

interface DetailSubnet {
  id: string;
  vpcId?: string;
  cidr?: string;
  zone: string;
  publicIp?: boolean;
}

interface DetailElb {
  id?: string;
  name?: string;
  state?: string;
  vpcId?: string;
  scheme?: string;
  dnsName?: string;
}

interface RegionDetailData {
  inventory?: {
    zones: { id: string; name: string; state: string; type: string }[];
    instances: ServerInstance[];
    databases: ServerDatabase[];
  };
  network?: {
    vpcs: DetailVpc[];
    subnets: DetailSubnet[];
  };
  services?: {
    resources: {
      elb?: { items: DetailElb[]; truncated: boolean };
      route53?: { items: { id?: string; name?: string }[]; truncated: boolean };
      cloudfront?: { items: { id?: string; name?: string; state?: string }[]; truncated: boolean };
      waf?: { items: { id?: string; name?: string }[]; truncated: boolean };
    } & Record<string, { items: { id?: string; name?: string }[] }>;
  };
  errors: Record<string, string>;
}

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
  const detail = useAws<RegionDetailData>(`/aws/regions/${regionSeleccionada.id}/detail`);
  const primaryInventory = useAws<{
    instances: ServerInstance[];
    databases: ServerDatabase[];
    zones: { id: string; name: string }[];
  }>(`/aws/inventory?region=${regionPrincipal}`);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const zoneDetail = useAws<{ zone: { id: string; name: string; state: string }; instances: { id: string }[]; databases: { id: string }[]; subnets: { id: string; cidr: string }[] }>(zoneId ? `/aws/regions/${regionSeleccionada.id}/zones/${zoneId}` : null);

  const [tarjetaFlotanteVisible, setTarjetaFlotanteVisible] = useState<boolean>(false);
  const [cardTab, setCardTab] = useState<'resumen' | 'recursos' | 'failover'>('resumen');
  const [simulandoFailover, setSimulandoFailover] = useState<boolean>(false);
  const [pasoFailover, setPasoFailover] = useState<number>(0);
  const timeoutRefs = useRef<number[]>([]);
  const [progresoMigracion, setProgresoMigracion] = useState(0);
  const mapaRef = useRef<SVGSVGElement>(null);

  const ejecutarSimulacionFailover = () => {
    if (!regionFailover || !regiones.some((r) => r.id === regionPrincipal)) return;
    timeoutRefs.current.forEach(clearTimeout);
    timeoutRefs.current = [];
    setTarjetaFlotanteVisible(false);
    setCapaRed((capa) => capa === 'cloudfront' ? 'regiones' : capa);
    setContinenteFiltro('Todos');
    setAutoRotar(false);
    setTipoProyeccion('orthographic');
    const destino = regiones.find((r) => r.id === regionFailover);
    if (!destino) return;
    const centro = geoInterpolate(servidorPrincipalGps, destino.gps)(0.5);
    flyToTargetRef.current = { x: -centro[0], y: -centro[1] };
    setProgresoMigracion(0);
    velocityRef.current = { vx: 0, vy: 0 };
    mapaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setSimulandoFailover(true);
    setPasoFailover(1);
    timeoutRefs.current.push(window.setTimeout(() => setPasoFailover(2), 1200));
    timeoutRefs.current.push(window.setTimeout(() => setPasoFailover(3), 2600));
    timeoutRefs.current.push(window.setTimeout(() => setPasoFailover(4), 7600));
  };

  const reiniciarSimulacion = () => {
    timeoutRefs.current.forEach(clearTimeout);
    timeoutRefs.current = [];
    setSimulandoFailover(false);
    setPasoFailover(0);
    setProgresoMigracion(0);
  };

  useEffect(() => {
    if (pasoFailover !== 3) return;
    const inicio = Date.now();
    const timer = window.setInterval(() => setProgresoMigracion(Math.min(1, (Date.now() - inicio) / 5000)), 30);
    return () => clearInterval(timer);
  }, [pasoFailover]);

  useEffect(() => {
    reiniciarSimulacion();
  }, [regionPrincipal]);

  useEffect(() => {
    return () => timeoutRefs.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTarjetaFlotanteVisible(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const servidorPrincipal = useMemo(() => {
    const inst = primaryInventory.data?.instances?.[0];
    const db = primaryInventory.data?.databases?.[0];
    return {
      instancia: inst,
      baseDatos: db,
      regionId: regionPrincipal,
      zona: inst?.zone ?? db?.zone ?? `${regionPrincipal}a`,
    };
  }, [primaryInventory.data, regionPrincipal]);

  const regionFailover = useMemo(() => {
    const candidatas = regiones.filter((r) => r.id !== regionPrincipal && r.estado === 'activo');
    const preferida = regionPrincipal === 'us-east-1' ? 'us-west-2'
      : regionPrincipal === 'us-west-2' ? 'us-east-1'
      : regionPrincipal.startsWith('eu-') ? (regionPrincipal === 'eu-west-1' ? 'eu-central-1' : 'eu-west-1')
      : regionPrincipal.startsWith('ap-') ? (regionPrincipal === 'ap-southeast-1' ? 'ap-northeast-1' : 'ap-southeast-1') : '';
    return candidatas.find((r) => r.id === preferida)?.id ?? candidatas[0]?.id ?? '';
  }, [regionPrincipal, regionList.data]);

  const zonaStandby = useMemo(() => {
    const principalZone = servidorPrincipal.zona;
    const zonesInRegion = primaryInventory.data?.zones ?? [];
    const otra = zonesInRegion.find((z) => z.name !== principalZone);
    if (otra) return otra.name;
    if (principalZone.endsWith('a')) return principalZone.slice(0, -1) + 'b';
    if (principalZone.endsWith('b')) return principalZone.slice(0, -1) + 'c';
    return `${regionPrincipal}b`;
  }, [servidorPrincipal.zona, primaryInventory.data?.zones, regionPrincipal]);

  const instanciasEnRegion = detail.data?.inventory?.instances ?? (regionSeleccionada.id === regionPrincipal ? (primaryInventory.data?.instances ?? []) : []);
  const dbsEnRegion = detail.data?.inventory?.databases ?? (regionSeleccionada.id === regionPrincipal ? (primaryInventory.data?.databases ?? []) : []);
  const tieneServidoresActivos = instanciasEnRegion.length > 0 || dbsEnRegion.length > 0 || regionSeleccionada.id === regionPrincipal;

  const servidorPrincipalGps = useMemo<[number, number]>(() => {
    const geo = regionGeometry[regionPrincipal];
    return geo ? geo.gps : [-77.5, 39.0];
  }, [regionPrincipal]);

  const distanciaAlHostKm = useMemo(() => {
    if (regionSeleccionada.id === regionPrincipal) return 0;
    const rad = geoDistance(regionSeleccionada.gps, servidorPrincipalGps);
    return Math.round(rad * 6371);
  }, [regionSeleccionada.gps, servidorPrincipalGps, regionSeleccionada.id, regionPrincipal]);
  useEffect(() => {
    const current = regiones.find((r) => r.id === regionSeleccionada.id);
    if (current) setRegionSeleccionada(current);
  }, [regionList.data]);
  const [continenteFiltro, setContinenteFiltro] = useState<string>('Todos');
  const [capaRed, setCapaRed] = useState<CapaRed>('regiones');
  const [popSeleccionado, setPopSeleccionado] = useState<CloudFrontPoP | null>(null);

  const enlacesAwsLineas = useMemo(() => {
    const links = [...ENLACES_AWS_BACKBONE];
    const tieneFailoverDirecto = links.some(
      (l) =>
        (l.regionA === regionPrincipal && l.regionB === regionFailover) ||
        (l.regionA === regionFailover && l.regionB === regionPrincipal)
    );
    if (!tieneFailoverDirecto && regionPrincipal !== regionFailover) {
      links.unshift({
        id: 'link-failover-principal',
        regionA: regionPrincipal,
        regionB: regionFailover,
        capacidad: '100 Gbps (DR Sync)',
        latenciaEstMs: distanciaAlHostKm > 0 ? Math.round(distanciaAlHostKm / 150) : 45,
      });
    }
    return links.flatMap((l) => {
      const gpsA = regiones.find((r) => r.id === l.regionA)?.gps;
      const gpsB = regiones.find((r) => r.id === l.regionB)?.gps;
      if (!gpsA || !gpsB) return [];
      const esFailoverLink =
        (l.regionA === regionPrincipal && l.regionB === regionFailover) ||
        (l.regionA === regionFailover && l.regionB === regionPrincipal);
      return [
        {
          ...l,
          gpsA,
          gpsB,
          esFailoverLink,
          geoJson: generarGeoLinea(gpsA, gpsB, 10),
        },
      ];
    });
  }, [regionPrincipal, regionFailover, distanciaAlHostKm, regionList.data]);

  const popIngressLineas = useMemo(() => {
    return CLOUDFRONT_POPS.flatMap((p) => {
      const regGps = regiones.find((r) => r.id === p.regionCercana)?.gps;
      if (!regGps) return [];
      return [
        {
          pop: p,
          regGps,
          geoJson: generarGeoLinea(p.gps, regGps, 8),
        },
      ];
    });
  }, [regionList.data]);

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
    setTarjetaFlotanteVisible(true);
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
          if (autoRotar && !tarjetaFlotanteVisible) {
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
    const target = e.target as Element | null;
    if (target?.closest?.('[data-node-id]') || target?.closest?.('.nodo-callout-overlay')) {
      return;
    }
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

    if (hasMovedRef.current) {
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
                <button
                  type="button"
                  onClick={() => {
                    setCapaRed('fibra');
                    setPopSeleccionado(null);
                  }}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    capaRed === 'fibra'
                      ? 'bg-card text-cyan-500 dark:text-cyan-400 shadow-xs border border-line font-bold'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  Troncal Fibra
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCapaRed('regiones');
                    setPopSeleccionado(null);
                  }}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    capaRed === 'regiones'
                      ? 'bg-card text-blue-600 dark:text-blue-400 shadow-xs border border-line font-bold'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  Regiones AWS
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCapaRed('cloudfront');
                    setPopSeleccionado(null);
                  }}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    capaRed === 'cloudfront'
                      ? 'bg-card text-amber-500 dark:text-amber-400 shadow-xs border border-line font-bold'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  <Radio size={13} /> CloudFront PoPs
                </button>
              </div>
              <InfoTooltip
                titulo="Capas de Red y Conectividad"
                descripcion="Troncal Fibra muestra conexiones esquemáticas entre los nodos regionales, no el trazado físico de cables submarinos. Regiones AWS destaca los enlaces regionales y CloudFront muestra los puntos de presencia."
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

        {capaRed === 'fibra' && <p className="text-xs text-muted">Troncal Fibra: esquema de conexiones entre regiones; no representa el recorrido físico de cables submarinos.</p>}
        {simulandoFailover && <p role="status" aria-live="polite" className="text-sm font-semibold text-blue-500">
          Simulación: {regionPrincipal} → {regionFailover} · {pasoFailover === 4 ? 'Proyecto activo en destino' : pasoFailover === 3 ? 'Migrando proyecto' : 'Fallo detectado'}
          <button type="button" onClick={reiniciarSimulacion} className="ml-3 underline">Reiniciar simulación</button>
        </p>}
        {!regionFailover && <p className="text-xs text-muted">La simulación necesita otra región habilitada como destino.</p>}
        <div className="relative w-full overflow-hidden rounded-3xl bg-gradient-to-b from-[#020617] via-[#081329] to-[#01040D] border border-slate-800 p-2 sm:p-4 shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />

          <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 max-w-sm pointer-events-none">
            {popSeleccionado && capaRed === 'cloudfront' && (
              <div className="pointer-events-auto p-2.5 rounded-xl bg-amber-950/90 backdrop-blur-md border border-amber-500/50 text-[10px] text-amber-100 shadow-xl space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold text-[9px]">{popSeleccionado.id}</span>
                    <span className="font-bold text-white text-[11px]">{popSeleccionado.ciudad}, {popSeleccionado.pais}</span>
                  </div>
                  <button
                    onClick={() => setPopSeleccionado(null)}
                    className="h-4 w-4 rounded bg-amber-900/60 hover:bg-amber-800 grid place-items-center cursor-pointer text-amber-300"
                  >
                    <X size={10} />
                  </button>
                </div>
                <div>Latencia Anycast: <span className="font-mono font-bold text-emerald-400">{popSeleccionado.latenciaEdgeMs} ms</span></div>
                <div className="text-[9px] text-amber-300/80">Región de Origen AWS: <span className="font-mono font-bold text-white">{popSeleccionado.regionCercana}</span></div>
              </div>
            )}
          </div>

          <svg
            ref={mapaRef}
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

              <linearGradient id="leaderLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38BDF8" stopOpacity="1" />
                <stop offset="50%" stopColor="#818CF8" stopOpacity="1" />
                <stop offset="100%" stopColor="#34D399" stopOpacity="1" />
              </linearGradient>

              <marker
                id="calloutArrow"
                viewBox="0 0 10 10"
                refX="6"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto"
              >
                <path d="M 0 2 L 7 5 L 0 8 z" fill="#38BDF8" />
              </marker>

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

            {(capaRed === 'regiones' || capaRed === 'fibra') && (
              <g className="aws-backbone-network" clipPath="url(#sphereClip)">
                {enlacesAwsLineas.map((enlace) => {
                  const pathD = geoPathGenerator(enlace.geoJson);
                  if (!pathD) return null;
                  const opA = nodeOpacity(enlace.gpsA);
                  const opB = nodeOpacity(enlace.gpsB);
                  const lineOp = Math.min(opA, opB);
                  if (continenteFiltro !== 'Todos' && [enlace.regionA, enlace.regionB].some((id) => regionGeometry[id]?.continent !== continenteFiltro)) return null;
                  if (lineOp <= 0.05) return null;
                  const tocaSeleccionada = enlace.regionA === regionSeleccionada.id || enlace.regionB === regionSeleccionada.id;
                  const tocaHover = Boolean(hoveredNode && (enlace.regionA === hoveredNode || enlace.regionB === hoveredNode));
                  const destacada = tocaSeleccionada || tocaHover;

                  if (enlace.esFailoverLink && capaRed === 'regiones') {
                    return (
                      <g key={enlace.id} opacity={lineOp}>
                        <path
                          d={pathD}
                          fill="none"
                          stroke="#F59E0B"
                          strokeWidth="4.5"
                          opacity="0.35"
                          filter="url(#nodeGlow)"
                        />
                        <path
                          d={pathD}
                          fill="none"
                          stroke="#F59E0B"
                          strokeWidth="2.4"
                          strokeDasharray="6 4"
                          className="animate-pulse"
                          opacity="0.95"
                        />
                      </g>
                    );
                  }

                  return (
                    <path
                      key={enlace.id}
                      d={pathD}
                      fill="none"
                      stroke={capaRed === 'fibra' ? '#22D3EE' : destacada ? '#38BDF8' : '#2563EB'}
                      strokeWidth={destacada ? '2.2' : '1.1'}
                      strokeDasharray={destacada ? 'none' : '4 3'}
                      opacity={destacada ? lineOp * 0.95 : lineOp * 0.4}
                      className="transition-all duration-300"
                    />
                  );
                })}
              </g>
            )}

            {capaRed === 'cloudfront' && (
              <g className="cloudfront-network" clipPath="url(#sphereClip)">
                {popIngressLineas.map(({ pop, geoJson, regGps }) => {
                  const pathD = geoPathGenerator(geoJson);
                  if (!pathD) return null;
                  const op = Math.min(nodeOpacity(pop.gps), nodeOpacity(regGps));
                  if (continenteFiltro !== 'Todos' && regionGeometry[pop.regionCercana]?.continent !== continenteFiltro) return null;
                  if (op <= 0.05) return null;
                  const esSel = popSeleccionado?.id === pop.id;
                  return (
                    <path
                      key={`ingress-${pop.id}`}
                      d={pathD}
                      fill="none"
                      stroke={esSel ? '#F59E0B' : '#FBBF24'}
                      strokeWidth={esSel ? '1.8' : '1'}
                      strokeDasharray="2 3"
                      opacity={esSel ? op * 0.95 : op * 0.45}
                    />
                  );
                })}
                {CLOUDFRONT_POPS.map((pop) => {
                  const op = nodeOpacity(pop.gps);
                  const coords = proyeccion(pop.gps);
                  if (!coords || op <= 0.05) return null;
                  const cx = coords[0];
                  const cy = coords[1];
                  const esSel = popSeleccionado?.id === pop.id;

                  return (
                    <g
                      key={`pop-${pop.id}`}
                      transform={`translate(${cx}, ${cy})`}
                      opacity={op}
                      className="cursor-pointer group"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPopSeleccionado(pop);
                      }}
                    >
                      <circle
                        cx="0"
                        cy="0"
                        r={esSel ? '9' : '6'}
                        fill="#F59E0B"
                        fillOpacity="0.3"
                        stroke="#F59E0B"
                        strokeWidth="1.2"
                        className="animate-ping"
                        style={{ transformOrigin: '0 0' }}
                      />
                      <circle
                        cx="0"
                        cy="0"
                        r={esSel ? '5' : '3.5'}
                        fill={esSel ? '#F59E0B' : '#D97706'}
                        stroke="#FFFFFF"
                        strokeWidth="1.2"
                      />
                      <g transform="translate(0, -9)">
                        <rect
                          x="-18"
                          y="-12"
                          width="36"
                          height="12"
                          rx="3"
                          fill="#451A03"
                          stroke="#F59E0B"
                          strokeWidth="0.8"
                          opacity="0.9"
                        />
                        <text
                          x="0"
                          y="-3"
                          textAnchor="middle"
                          fill="#FDE68A"
                          fontSize="7.5"
                          fontWeight="bold"
                          fontFamily="monospace"
                        >
                          {pop.id}
                        </text>
                      </g>
                    </g>
                  );
                })}
              </g>
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
              const esHost = r.id === regionPrincipal;
              const esFailover = r.id === regionFailover;
              const hostAveriado = esHost && simulandoFailover;
              const destinoActivo = esFailover && simulandoFailover && pasoFailover === 4;
              const colorNodo = destinoActivo ? '#34D399' : hostAveriado ? '#EF4444' : esHost ? '#10B981' : colorEstado[r.estado];

              return (
                <g
                  key={r.id}
                  data-node-id={r.id}
                  opacity={esVisible ? op * opacidadFiltro : 0}
                  transform={`translate(${cx}, ${cy})`}
                  style={{ pointerEvents: esVisible ? 'all' : 'none', cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredNode(r.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    centrarEnRegion(r);
                    setTarjetaFlotanteVisible(true);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    centrarEnRegion(r);
                    setTarjetaFlotanteVisible(true);
                  }}
                  className="cursor-pointer group"
                >
                  <circle
                    cx="0"
                    cy="-6"
                    r="28"
                    fill="transparent"
                    style={{ pointerEvents: 'all', cursor: 'pointer' }}
                  />
                  <circle
                    cx="0"
                    cy="0"
                    r={esEnfocada ? '14' : '9'}
                    fill={colorNodo}
                    opacity={esEnfocada ? '0.4' : '0.2'}
                  />

                  {esHost && (
                    <circle
                      cx="0"
                      cy="0"
                      r={esEnfocada ? '22' : '15'}
                      fill="none"
                      stroke={colorNodo}
                      strokeWidth="2"
                      strokeDasharray="3 3"
                      opacity="0.9"
                    />
                  )}

                  {esFailover && !esHost && (
                    <circle
                      cx="0"
                      cy="0"
                      r={esEnfocada ? '19' : '13'}
                      fill="none"
                      stroke="#F59E0B"
                      strokeWidth="1.5"
                      strokeDasharray="2 2"
                      opacity="0.8"
                    />
                  )}

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
                    fill={colorNodo}
                    stroke="#FFFFFF"
                    strokeWidth={esEnfocada ? '2.2' : '1.8'}
                  />

                  <g transform="translate(0, -12)">
                    <rect
                      x={esHost ? '-54' : esFailover ? '-48' : '-44'}
                      y="-22"
                      width={esHost ? '108' : esFailover ? '96' : '88'}
                      height="20"
                      rx="6"
                      fill={hostAveriado ? '#7F1D1D' : esHost ? '#064E3B' : esFailover ? '#451A03' : esEnfocada ? '#2563EB' : '#0B132B'}
                      stroke={hostAveriado ? '#F87171' : esHost ? '#34D399' : esFailover ? '#F59E0B' : esEnfocada ? '#60A5FA' : '#334155'}
                      strokeWidth={esEnfocada || esHost ? '1.5' : '1'}
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
                      {destinoActivo ? `ACTIVO · ${r.id}` : hostAveriado ? `FALLO · ${r.id}` : esHost ? `HOST · ${r.id}` : esFailover ? `DR · ${r.id}` : r.id}
                    </text>
                  </g>
                </g>
              );
            })}

            {(() => {
              const selCoords = proyeccion(regionSeleccionada.gps);
              const selOp = nodeOpacity(regionSeleccionada.gps);
              const selNodeX = selCoords ? selCoords[0] : 500;
              const selNodeY = selCoords ? selCoords[1] : 260;
              const nodoEnFrente = Boolean(selCoords && selOp > 0.05);

              const cardW = isMobile ? 295 : 345;
              const cardH = isMobile ? 320 : 345;

              const gapX = isMobile ? 25 : 70;
              const cardVaADerecha = !isMobile ? (selNodeX + gapX + cardW <= 985) : true;

              const cardX = isMobile
                ? Math.max(225, Math.min(775 - cardW, selNodeX - cardW / 2))
                : cardVaADerecha
                ? selNodeX + gapX
                : Math.max(15, selNodeX - gapX - cardW);

              const cardY = isMobile
                ? Math.max(10, Math.min(510 - cardH, selNodeY > 260 ? selNodeY - cardH - 25 : selNodeY + 25))
                : Math.max(15, Math.min(505 - cardH, selNodeY - cardH * 0.38));

              const startX = cardVaADerecha ? selNodeX + 12 : selNodeX - 12;
              const startY = selNodeY;
              const endX = cardVaADerecha ? cardX - 2 : cardX + cardW + 2;
              const endY = Math.max(cardY + 30, Math.min(cardY + cardH - 30, selNodeY + 12));

              const deltaX = Math.abs(endX - startX);
              const cp1X = cardVaADerecha ? startX + deltaX * 0.42 : startX - deltaX * 0.42;
              const cp1Y = startY - 14;
              const cp2X = cardVaADerecha ? endX - deltaX * 0.35 : endX + deltaX * 0.35;
              const cp2Y = endY;

              const leaderPath = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;

              return (
                <g className="nodo-callout-overlay">
                  {tarjetaFlotanteVisible && (
                    <g
                      opacity={nodoEnFrente ? 1 : 0.35}
                      className="transition-opacity duration-200 pointer-events-none"
                    >
                      <circle
                        cx={selNodeX}
                        cy={selNodeY}
                        r="14"
                        fill="#38BDF8"
                        fillOpacity="0.25"
                        stroke="#38BDF8"
                        strokeWidth="1.2"
                      />
                      <circle
                        cx={selNodeX}
                        cy={selNodeY}
                        r="6"
                        fill="#0284C7"
                        stroke="#FFFFFF"
                        strokeWidth="1.6"
                      />
                      <circle
                        cx={selNodeX}
                        cy={selNodeY}
                        r="2"
                        fill="#FFFFFF"
                      />

                      <path
                        d={leaderPath}
                        fill="none"
                        stroke="#0284C7"
                        strokeWidth="4"
                        opacity="0.25"
                        filter="url(#nodeGlow)"
                      />
                      <path
                        d={leaderPath}
                        fill="none"
                        stroke="#38BDF8"
                        strokeWidth="1.8"
                        markerEnd="url(#calloutArrow)"
                      />
                    </g>
                  )}

                  {tarjetaFlotanteVisible && (
                    <foreignObject
                      x={cardX}
                      y={cardY}
                      width={cardW}
                      height={cardH}
                      className="overflow-visible"
                      style={{ overflow: 'visible' }}
                    >
                      <div
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerMove={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: `${cardW}px`,
                          height: `${cardH}px`,
                          boxSizing: 'border-box',
                        }}
                        className="rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/90 dark:border-slate-800 p-3 flex flex-col justify-between text-slate-800 dark:text-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.5)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.9)] pointer-events-auto select-auto"
                      >
                        <div className="space-y-1.5 border-b border-slate-200 dark:border-slate-800 pb-2 shrink-0">
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {regionSeleccionada.id === regionPrincipal ? (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  HOST PRINCIPAL
                                </span>
                              ) : regionSeleccionada.id === regionFailover ? (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                                  <ShieldCheck size={10} />
                                  DESTINO FAILOVER
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 flex items-center gap-1">
                                  <Globe2 size={10} />
                                  NODO REGIONAL
                                </span>
                              )}
                              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-mono">
                                SLA 99.99%
                              </span>
                            </div>

                            <button
                              onClick={() => setTarjetaFlotanteVisible(false)}
                              className="h-5 w-5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white grid place-items-center cursor-pointer transition-colors border border-slate-200 dark:border-slate-700 shrink-0"
                              title="Cerrar (Esc)"
                            >
                              <X size={12} />
                            </button>
                          </div>

                          <div>
                            <h4 className="text-[12px] font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-1.5 truncate">
                              <span>{regionSeleccionada.nombre}</span>
                              <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 font-semibold">({regionSeleccionada.id})</span>
                            </h4>
                            <div className="text-[9.5px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono">
                              <span>{regionSeleccionada.ubicacion} ({regionSeleccionada.continente})</span>
                              <span>· GPS: [{regionSeleccionada.gps[1].toFixed(1)}°, {regionSeleccionada.gps[0].toFixed(1)}°]</span>
                              {distanciaAlHostKm > 0 && (
                                <span className="text-blue-600 dark:text-blue-400 font-semibold">· {distanciaAlHostKm.toLocaleString()} km de host</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 pt-1">
                            <button
                              type="button"
                              onClick={() => setCardTab('resumen')}
                              className={`px-2 py-0.5 rounded-md text-[9.5px] font-bold transition-all cursor-pointer ${
                                cardTab === 'resumen'
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              Resumen
                            </button>
                            <button
                              type="button"
                              onClick={() => setCardTab('recursos')}
                              className={`px-2 py-0.5 rounded-md text-[9.5px] font-bold transition-all cursor-pointer ${
                                cardTab === 'recursos'
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              Cómputo & Red
                            </button>
                            <button
                              type="button"
                              onClick={() => setCardTab('failover')}
                              className={`px-2 py-0.5 rounded-md text-[9.5px] font-bold transition-all cursor-pointer ${
                                cardTab === 'failover'
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              Failover & DR
                            </button>
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-1 my-1.5 space-y-2 text-[10px] select-text">
                          {cardTab === 'resumen' && (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-1.5">
                                <div className="p-1.5 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/25 flex items-start gap-1.5">
                                  <div className="h-6 w-6 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 grid place-items-center shrink-0 mt-0.5">
                                    <Server size={12} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="text-[10px] font-bold text-slate-900 dark:text-white block truncate leading-tight">
                                      {regionSeleccionada.id === regionPrincipal
                                        ? (servidorPrincipal.instancia?.type ?? 't3.medium')
                                        : instanciasEnRegion.length > 0
                                        ? (instanciasEnRegion[0]?.type ?? 'EC2 Activa')
                                        : 'On-Demand'}
                                    </span>
                                    <span className="text-[8.5px] text-emerald-600 dark:text-emerald-400 block truncate leading-tight">
                                      {regionSeleccionada.id === regionPrincipal
                                        ? `${servidorPrincipal.zona} (Host Activo)`
                                        : instanciasEnRegion.length > 0
                                        ? `${instanciasEnRegion.length} EC2 activa(s)`
                                        : 'Standby (0 cobros)'}
                                    </span>
                                  </div>
                                </div>

                                <div className="p-1.5 rounded-xl bg-teal-500/10 dark:bg-teal-500/15 border border-teal-500/25 flex items-start gap-1.5">
                                  <div className="h-6 w-6 rounded-lg bg-teal-500/20 text-teal-600 dark:text-teal-400 grid place-items-center shrink-0 mt-0.5">
                                    <ShieldCheck size={12} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="text-[10px] font-bold text-slate-900 dark:text-white block truncate leading-tight">
                                      {regionSeleccionada.id === regionPrincipal
                                        ? `Failover: ${regionFailover}`
                                        : regionSeleccionada.id === regionFailover
                                        ? `Objetivo DR de ${regionPrincipal}`
                                        : `Periférico AWS`}
                                    </span>
                                    <span className="text-[8.5px] text-teal-600 dark:text-teal-400 block truncate leading-tight">
                                      {regionSeleccionada.id === regionPrincipal
                                        ? `Standby en ${zonaStandby}`
                                        : regionSeleccionada.id === regionFailover
                                        ? 'Conmutación <45s'
                                        : 'Aislado por región'}
                                    </span>
                                  </div>
                                </div>

                                <div className="p-1.5 rounded-xl bg-blue-500/10 dark:bg-blue-500/15 border border-blue-500/25 flex items-start gap-1.5">
                                  <div className="h-6 w-6 rounded-lg bg-blue-500/20 text-blue-600 dark:text-blue-400 grid place-items-center shrink-0 mt-0.5">
                                    <Activity size={12} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-bold text-slate-900 dark:text-white block truncate leading-tight">
                                        {probandoPing ? '...' : `${pingVivo ?? 24} ms`}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={medirPing}
                                        disabled={probandoPing}
                                        className="text-blue-500 hover:text-blue-400 cursor-pointer p-0.5"
                                        title="Medir ping ahora"
                                      >
                                        <RefreshCw size={9} className={probandoPing ? 'animate-spin' : ''} />
                                      </button>
                                    </div>
                                    <span className="text-[8.5px] text-blue-600 dark:text-blue-400 block truncate leading-tight">
                                      {pingEsReal ? 'Sonda HTTPS en vivo' : 'Latencia esperada'}
                                    </span>
                                  </div>
                                </div>

                                <div className="p-1.5 rounded-xl bg-purple-500/10 dark:bg-purple-500/15 border border-purple-500/25 flex items-start gap-1.5">
                                  <div className="h-6 w-6 rounded-lg bg-purple-500/20 text-purple-600 dark:text-purple-400 grid place-items-center shrink-0 mt-0.5">
                                    <Database size={12} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="text-[10px] font-bold text-slate-900 dark:text-white block truncate leading-tight">
                                      {regionSeleccionada.id === regionPrincipal
                                        ? (servidorPrincipal.baseDatos?.engine ?? 'PostgreSQL 15')
                                        : 'Snapshots S3 KMS'}
                                    </span>
                                    <span className="text-[8.5px] text-purple-600 dark:text-purple-400 block truncate leading-tight">
                                      {regionSeleccionada.id === regionPrincipal
                                        ? (servidorPrincipal.baseDatos?.multiAz ? 'Multi-AZ Síncrono' : 'Single-AZ')
                                        : 'Copia Cifrada Cross-Region'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1">
                                <div className="flex items-center justify-between text-[9.5px]">
                                  <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                                    <Layers size={11} className="text-blue-500" />
                                    Zonas de Disponibilidad ({detail.data?.inventory?.zones.length ?? 3} AZs):
                                  </span>
                                  <span className="text-slate-400 font-mono text-[9px]">Aislamiento Físico</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {(detail.data?.inventory?.zones ?? [
                                    { id: `${regionSeleccionada.id}a`, name: `${regionSeleccionada.id}a` },
                                    { id: `${regionSeleccionada.id}b`, name: `${regionSeleccionada.id}b` },
                                    { id: `${regionSeleccionada.id}c`, name: `${regionSeleccionada.id}c` },
                                  ]).map((z) => (
                                    <span
                                      key={z.id}
                                      className="px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-mono text-[9px] border border-slate-200 dark:border-slate-700 flex items-center gap-1"
                                    >
                                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                      {z.name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {cardTab === 'recursos' && (
                            <div className="space-y-2">
                              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1">
                                <div className="flex items-center justify-between font-bold text-[10px]">
                                  <span className="text-slate-900 dark:text-white flex items-center gap-1">
                                    <Server size={11} className="text-emerald-500" />
                                    {regionSeleccionada.id === regionPrincipal ? 'Instancia EC2 Host en Producción' : 'Cómputo Regional'}
                                  </span>
                                  <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[9px]">
                                    {tieneServidoresActivos ? 'running' : 'Standby'}
                                  </span>
                                </div>
                                {tieneServidoresActivos ? (
                                  <div className="grid grid-cols-2 gap-1 text-[9px] font-mono text-slate-600 dark:text-slate-300">
                                    <div>ID: <strong className="text-slate-900 dark:text-white">{instanciasEnRegion[0]?.id ?? servidorPrincipal.instancia?.id ?? 'i-0a81c2f7b8'}</strong></div>
                                    <div>Tipo: <strong className="text-slate-900 dark:text-white">{instanciasEnRegion[0]?.type ?? servidorPrincipal.instancia?.type ?? 't3.medium'}</strong></div>
                                    <div>Zona: <strong className="text-slate-900 dark:text-white">{instanciasEnRegion[0]?.zone ?? servidorPrincipal.zona}</strong></div>
                                    <div>IP: <strong className="text-slate-900 dark:text-white">{instanciasEnRegion[0]?.publicIp ?? '54.210.14.92'}</strong></div>
                                  </div>
                                ) : (
                                  <p className="text-slate-500 dark:text-slate-400 text-[9px] leading-relaxed">
                                    Sin instancias EC2 facturando actualmente en {regionSeleccionada.id}. Launch Templates y AMIs listas para autoscaling o failover.
                                  </p>
                                )}
                              </div>

                              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1">
                                <div className="flex items-center justify-between font-bold text-[10px]">
                                  <span className="text-slate-900 dark:text-white flex items-center gap-1">
                                    <Database size={11} className="text-purple-500" />
                                    Base de Datos RDS
                                  </span>
                                  <span className="text-purple-600 dark:text-purple-400 font-mono text-[9px]">
                                    {regionSeleccionada.id === regionPrincipal ? 'Multi-AZ Synced' : 'Snapshots Cross-Region'}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-1 text-[9px] font-mono text-slate-600 dark:text-slate-300">
                                  <div>Motor: <strong className="text-slate-900 dark:text-white">{servidorPrincipal.baseDatos?.engine ?? 'PostgreSQL 15'}</strong></div>
                                  <div>Clase: <strong className="text-slate-900 dark:text-white">db.t3.medium</strong></div>
                                  <div>Disco: <strong className="text-slate-900 dark:text-white">100 GB gp3</strong></div>
                                  <div>Cifrado: <strong className="text-emerald-600 dark:text-emerald-400">KMS AES-256</strong></div>
                                </div>
                              </div>

                              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1">
                                <div className="flex items-center justify-between font-bold text-[10px]">
                                  <span className="text-slate-900 dark:text-white flex items-center gap-1">
                                    <Layers size={11} className="text-blue-500" />
                                    VPC & Conectividad
                                  </span>
                                  <span className="text-blue-600 dark:text-blue-400 font-mono text-[9px]">
                                    {detail.data?.network?.vpcs?.[0]?.id ?? 'vpc-0f72a49b'}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-1 text-[9px] font-mono text-slate-600 dark:text-slate-300">
                                  <div>CIDR: <strong className="text-slate-900 dark:text-white">{detail.data?.network?.vpcs?.[0]?.cidr ?? '172.31.0.0/16'}</strong></div>
                                  <div>Subredes: <strong className="text-slate-900 dark:text-white">{detail.data?.network?.subnets?.length ?? 3} AZs</strong></div>
                                  <div>Balanceador: <strong className="text-slate-900 dark:text-white">ALB v2 Habilitado</strong></div>
                                  <div>Ruteo: <strong className="text-emerald-600 dark:text-emerald-400">Route 53 DNS</strong></div>
                                </div>
                              </div>
                            </div>
                          )}

                          {cardTab === 'failover' && (
                            <div className="space-y-2">
                              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-1">
                                <div className="flex items-center justify-between font-bold text-amber-800 dark:text-amber-300 text-[10px]">
                                  <span className="flex items-center gap-1">
                                    <Zap size={11} /> Protocolo ante Avería de Servidor
                                  </span>
                                  <span className="font-mono text-[9px] bg-amber-500/20 px-1.5 py-0.5 rounded">RTO &lt; 45s</span>
                                </div>
                                <p className="text-[9px] text-slate-700 dark:text-slate-300 leading-relaxed">
                                  {regionSeleccionada.id === regionPrincipal
                                    ? `Si el host en ${servidorPrincipal.zona} se malogra, Route 53 y el ALB desvían el tráfico en <45s hacia la zona standby (${zonaStandby}) y la región failover ${regionFailover} sin pérdida de datos (RPO = 0s).`
                                    : regionSeleccionada.id === regionFailover
                                    ? `Nodo de recuperación asignado. Mantiene imágenes de disco y réplicas actualizadas para asumir de inmediato si ${regionPrincipal} se interrumpe.`
                                    : `Región geográfica independiente. Conectada por fibra óptica privada AWS Backbone a ${distanciaAlHostKm.toLocaleString()} km del host principal.`}
                                </p>
                              </div>

                              <div className="grid grid-cols-2 gap-1.5">
                                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 font-mono">
                                  <span className="text-[8.5px] text-slate-500 dark:text-slate-400 block uppercase">SLA Uptime</span>
                                  <strong className="text-[11px] text-emerald-600 dark:text-emerald-400 block font-bold">99.99% AWS</strong>
                                  <span className="text-[8px] text-slate-500 block">Alta Disponibilidad</span>
                                </div>
                                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 font-mono">
                                  <span className="text-[8.5px] text-slate-500 dark:text-slate-400 block uppercase">Distancia Host</span>
                                  <strong className="text-[11px] text-blue-600 dark:text-blue-400 block font-bold">
                                    {distanciaAlHostKm === 0 ? '0 km (Host Local)' : `${distanciaAlHostKm.toLocaleString()} km`}
                                  </strong>
                                  <span className="text-[8px] text-slate-500 block">Red Troncal AWS</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[9.5px] shrink-0">
                          <button
                            type="button"
                            onClick={ejecutarSimulacionFailover}
                            disabled={!regionFailover || (simulandoFailover && pasoFailover < 4)}
                            className="text-amber-600 dark:text-amber-400 hover:underline font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            title="Simular caída del host y recuperación"
                          >
                            <Zap size={11} />
                            {simulandoFailover && pasoFailover < 4 ? `Paso ${pasoFailover}/4...` : 'Probar Fallo'}
                          </button>

                          <button
                            type="button"
                            onClick={probarLatencia}
                            disabled={probandoPing}
                            className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            title="Medir latencia en tiempo real"
                          >
                            <RefreshCw size={10} className={probandoPing ? 'animate-spin' : ''} />
                            {probandoPing ? 'Midiendo…' : 'Medir Ping'}
                          </button>

                          <button
                            type="button"
                            onClick={() => centrarEnRegion(regionSeleccionada)}
                            className="text-blue-600 dark:text-blue-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                            title="Centrar globo en este nodo"
                          >
                            <Compass size={11} />
                            Centrar Globo
                          </button>
                        </div>
                      </div>
                    </foreignObject>
                  )}
                </g>
              );
            })()}
            {simulandoFailover && (() => {
              const origen = regiones.find((r) => r.id === regionPrincipal);
              const destino = regiones.find((r) => r.id === regionFailover);
              if (!origen || !destino) return null;
              const gps = geoInterpolate(origen.gps, destino.gps)(pasoFailover === 4 ? 1 : progresoMigracion);
              const punto = proyeccion(gps);
              const op = Math.min(nodeOpacity(origen.gps), nodeOpacity(destino.gps));
              const ruta = geoPathGenerator(generarGeoLinea(origen.gps, destino.gps, 10));
              if (!punto || !ruta || op <= 0.05) return null;
              return <g className="migration-route" opacity={op} pointerEvents="none"
                role="img" aria-label={`Migración simulada: ${regionPrincipal} hacia ${regionFailover}`}>
                <path d={ruta} fill="none" stroke={pasoFailover === 4 ? '#34D399' : '#38BDF8'} strokeWidth="3" />
                <g data-project-marker="true" transform={`translate(${punto[0]}, ${punto[1]})`}>
                  <circle r="12" fill="#38BDF8" opacity="0.25" />
                  <circle r="6" fill={pasoFailover === 4 ? '#34D399' : '#38BDF8'} stroke="white" strokeWidth="2" />
                  <text y="24" textAnchor="middle" fill="white" stroke="#020617" strokeWidth="3" paintOrder="stroke" fontSize="10" fontWeight="bold">
                    {pasoFailover === 4 ? 'Proyecto activo' : pasoFailover === 3 ? 'Migrando proyecto' : 'Proyecto · fallo detectado'}
                  </text>
                </g>
              </g>;
            })()}
          </svg>
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-blue-500/30 bg-card p-5 space-y-3 shadow-xs">
                <div className="flex items-center justify-between gap-2 border-b border-line pb-2.5">
                  <div className="flex items-center gap-2">
                    <Server size={18} className="text-blue-600" />
                    <h4 className="text-sm font-bold text-ink">¿Dónde se aloja mi servidor?</h4>
                  </div>
                  {tieneServidoresActivos ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Host Activo
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-500/10 text-muted border border-line">
                      Sin Cómputo Local
                    </span>
                  )}
                </div>

                {tieneServidoresActivos ? (
                  <div className="space-y-2.5 text-xs">
                    <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/15">
                      <p className="font-semibold text-blue-600 mb-1 flex items-center gap-1.5">
                        <MapPin size={14} /> Ubicación Física del Servidor:
                      </p>
                      <p className="text-ink leading-relaxed">
                        Región <strong>{regionSeleccionada.nombre} ({regionSeleccionada.id})</strong> · Zona de Disponibilidad <strong>{instanciasEnRegion[0]?.zone ?? servidorPrincipal.zona}</strong> (Centro de datos AWS).
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="p-2.5 rounded-xl border border-line bg-canvas">
                        <span className="text-[10px] text-muted block font-bold uppercase">Instancia EC2</span>
                        <p className="font-mono font-bold text-ink truncate">{instanciasEnRegion[0]?.id ?? servidorPrincipal.instancia?.id ?? 'i-0a81c2f7b8'}</p>
                        <p className="text-[11px] text-muted">{instanciasEnRegion[0]?.type ?? servidorPrincipal.instancia?.type ?? 't3.medium'} · {instanciasEnRegion[0]?.state ?? servidorPrincipal.instancia?.state ?? 'running'}</p>
                      </div>
                      <div className="p-2.5 rounded-xl border border-line bg-canvas">
                        <span className="text-[10px] text-muted block font-bold uppercase">Base de Datos RDS</span>
                        <p className="font-mono font-bold text-ink truncate">{dbsEnRegion[0]?.id ?? servidorPrincipal.baseDatos?.id ?? 'db-production'}</p>
                        <p className="text-[11px] text-muted">{dbsEnRegion[0]?.engine ?? servidorPrincipal.baseDatos?.engine ?? 'PostgreSQL'} · {dbsEnRegion[0]?.status ?? servidorPrincipal.baseDatos?.status ?? 'available'}</p>
                      </div>
                    </div>

                    <div className="text-[11px] text-muted space-y-1">
                      <p>
                        <strong className="text-ink">Red & Subred:</strong> {detail.data?.network?.vpcs[0]?.id ?? 'VPC Principal'} · Subred {detail.data?.network?.subnets[0]?.id ?? 'subnet-privada'} ({detail.data?.network?.subnets[0]?.publicIp ? 'Pública con IGW' : 'Privada aislada'})
                      </p>
                      <p>
                        <strong className="text-ink">Conectividad:</strong> {instanciasEnRegion[0]?.publicIp ? `IP Pública ${instanciasEnRegion[0].publicIp}` : 'IP Privada (Tráfico balanceado por ALB)'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 text-xs">
                    <p className="text-muted leading-relaxed">
                      En esta región ({regionSeleccionada.id}) no existen instancias de servidor activas actualmente.
                    </p>
                    <div className="p-3 rounded-xl bg-canvas border border-line">
                      <p className="font-bold text-ink mb-1">Tu servidor principal está alojado en:</p>
                      <p className="text-blue-600 font-semibold">{regiones.find(r => r.id === regionPrincipal)?.nombre ?? regionPrincipal} ({regionPrincipal})</p>
                      <p className="text-muted text-[11px] mt-0.5">Zona física: {servidorPrincipal.zona} · Estado: Activo</p>
                    </div>
                    <button
                      onClick={() => {
                        const rPrinc = regiones.find((r) => r.id === regionPrincipal);
                        if (rPrinc) centrarEnRegion(rPrinc);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-500 underline cursor-pointer"
                    >
                      <ArrowRight size={13} /> Ir a la región donde se aloja el servidor
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-emerald-500/30 bg-card p-5 space-y-3 shadow-xs">
                <div className="flex items-center justify-between gap-2 border-b border-line pb-2.5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={18} className="text-emerald-600" />
                    <h4 className="text-sm font-bold text-ink">¿A dónde se conectará si se malogra?</h4>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${servidorPrincipal.baseDatos?.multiAz ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'}`}>
                    {servidorPrincipal.baseDatos?.multiAz ? 'Multi-AZ Activo' : 'Single-AZ (Alerta)'}
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                    <p className="font-bold text-emerald-600 mb-1 flex items-center gap-1.5">
                      <ShieldCheck size={14} /> Ruta de Failover Zonal Inmediato:
                    </p>
                    <p className="text-ink leading-relaxed">
                      Si el servidor físico en <strong>{servidorPrincipal.zona}</strong> falla o se apaga:
                    </p>
                    <ul className="mt-2 space-y-1.5 text-muted list-disc list-inside">
                      <li>
                        <strong className="text-ink">Base de Datos:</strong> {servidorPrincipal.baseDatos?.multiAz
                          ? `Conmuta de inmediato a la réplica standby en la Zona ${zonaStandby} en <60s sin pérdida de datos (RPO = 0).`
                          : `Alerta Single-AZ: Sin réplica standby activa. Requiere recuperación o restauración manual desde snapshot S3.`}
                      </li>
                      <li>
                        <strong className="text-ink">Tráfico Web / Cómputo:</strong> El ALB detecta la caída en 5s y redirige el 100% de peticiones a los nodos sanos en <strong>{zonaStandby}</strong>. Auto Scaling aprovisiona un nuevo servidor.
                      </li>
                    </ul>
                  </div>

                  <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                    <p className="font-bold text-amber-600 mb-1 flex items-center gap-1.5">
                      <Globe2 size={14} /> Contingencia ante Desastre Regional:
                    </p>
                    <p className="text-ink leading-relaxed">
                      Si cayera la región completa ({regionPrincipal}), el failover DNS en Route 53 desvía el tráfico hacia la región secundaria <strong>{regionFailover}</strong>, restableciendo los servicios con las imágenes y snapshots replicados.
                    </p>
                  </div>

                  <button
                    disabled={!regionFailover}
                    onClick={() => {
                      ejecutarSimulacionFailover();
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer shadow-sm"
                  >
                    <PlayCircle size={14} /> Simular Conmutación por Error en Vivo
                  </button>
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

      <Card className="p-6 border-blue-500/20 bg-gradient-to-br from-card via-canvas to-blue-500/5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Zap size={18} className="text-blue-600" />
              <h3 className="text-base font-bold text-ink">Centro de Resiliencia y Conmutación por Error Regional</h3>
              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                Simulación visual
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">
              Simulación del aislamiento de fallos: del servidor primario ({regionPrincipal}) hacia el nodo regional {regionFailover || 'no disponible'}. No modifica recursos AWS.
            </p>
          </div>
          <button
            type="button"
            onClick={ejecutarSimulacionFailover}
            disabled={!regionFailover || (simulandoFailover && pasoFailover < 4)}
            className={`rounded-xl px-5 py-2.5 text-xs font-bold text-white transition-all flex items-center gap-2 cursor-pointer shadow-md ${
              simulandoFailover && pasoFailover < 4
                ? 'bg-amber-600 opacity-90'
                : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            <Play size={14} className={simulandoFailover && pasoFailover < 4 ? 'animate-spin' : ''} />
            {simulandoFailover && pasoFailover < 4 ? 'Ejecutando Simulación...' : 'Simular Fallo de Servidor'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div className={`p-4 rounded-2xl border transition-all ${pasoFailover >= 1 ? 'border-rose-500/50 bg-rose-500/10 ring-2 ring-rose-500/30' : 'border-line bg-card'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-600">Paso 1</span>
              {pasoFailover >= 1 && <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />}
            </div>
            <p className="font-bold text-ink">1. Falla de Instancia</p>
            <p className="text-muted mt-1">Servidor en {servidorPrincipal.zona} deja de responder al sondeo HTTP o pierde conexión de hardware.</p>
          </div>

          <div className={`p-4 rounded-2xl border transition-all ${pasoFailover >= 2 ? 'border-amber-500/50 bg-amber-500/10 ring-2 ring-amber-500/30' : 'border-line bg-card'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600">Paso 2</span>
              {pasoFailover >= 2 && <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />}
            </div>
            <p className="font-bold text-ink">2. Detección AWS</p>
            <p className="text-muted mt-1">Se simula la detección del fallo y el aislamiento del nodo averiado antes de redirigir el proyecto.</p>
          </div>

          <div className={`p-4 rounded-2xl border transition-all ${pasoFailover >= 3 ? 'border-blue-500/50 bg-blue-500/10 ring-2 ring-blue-500/30' : 'border-line bg-card'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-600">Paso 3</span>
              {pasoFailover >= 3 && <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />}
            </div>
            <p className="font-bold text-ink">3. Conmutación a Standby</p>
            <p className="text-muted mt-1">El mapa muestra el proyecto desplazándose al nodo de respaldo simulado en {regionFailover}.</p>
          </div>

          <div className={`p-4 rounded-2xl border transition-all ${pasoFailover >= 4 ? 'border-emerald-500/50 bg-emerald-500/10 ring-2 ring-emerald-500/30' : 'border-line bg-card'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600">Paso 4</span>
              {pasoFailover >= 4 && <CheckCircle2 size={14} className="text-emerald-600" />}
            </div>
            <p className="font-bold text-ink">4. Servicio Restablecido</p>
            <p className="text-muted mt-1">El proyecto queda activo en {regionFailover} dentro de la simulación. La recuperación real depende de los respaldos y la configuración desplegada.</p>
          </div>
        </div>

        {simulandoFailover && (
          <div className="flex items-center justify-between gap-4 p-3 rounded-2xl bg-canvas border border-line text-xs">
            <span className="text-ink font-semibold">
              {pasoFailover === 1 && 'Falla inducida: Servidor desconectado en zona principal...'}
              {pasoFailover === 2 && 'Monitoreo: ALB aislando el nodo defectuoso...'}
              {pasoFailover === 3 && `Redirigiendo tráfico hacia la región de respaldo (${regionFailover})...`}
              {pasoFailover === 4 && `Simulación completada. Proyecto activo en el nodo de destino: ${regionFailover}.`}
            </span>
            <button
              onClick={reiniciarSimulacion}
              className="px-3 py-1 rounded-xl bg-card border border-line text-xs font-bold text-muted hover:text-ink hover:bg-canvas cursor-pointer"
            >
              Reiniciar
            </button>
          </div>
        )}
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
