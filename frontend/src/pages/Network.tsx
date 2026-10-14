import { useState } from 'react';
import { Box, Globe, Layers, Server, Database, Shield, Lock, Info, Terminal, ArrowDown, Play, AlertOctagon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NetworkNode } from '../components/network/NetworkNode';
import { Card } from '../components/ui/Card';
import { InfoTooltip } from '../components/ui/InfoTooltip';
import { useCloud } from '../context/CloudContext';
import { useAws } from '../hooks/useAws';
import { api, type AwsResponse } from '../lib/api';

interface NetworkData {
  region: string;
  vpcs: { id: string; cidr: string; default: boolean; state: string }[];
  subnets: { id: string; vpcId: string; cidr: string; zone: string; publicIp: boolean }[];
  routes: { id: string; vpcId: string; routes: { destination?: string; gateway?: string; state?: string }[] }[];
  securityGroups: { id: string; name: string; vpcId: string; inboundRules: number; outboundRules: number; publicIngress: boolean; ingress: { protocol: string; fromPort?: number; toPort?: number; source: string }[] }[];
  internetGateways: { id: string; vpcIds: string[] }[];
  natGateways: { id: string; vpcId: string; state: string }[];
  flowLogs: { id: string; resourceId: string; status: string; destination: string }[];
}
interface Inventory { instances: { id: string; zone: string; state: string; vpcId?: string; subnetId?: string; publicIp?: string }[]; databases: { id: string; zone: string; status: string; multiAz: boolean; vpcId?: string }[] }
interface ServiceInventory { resources: Record<string, { items: { id?: string; name?: string; state?: string; vpcId?: string; scheme?: string; dnsName?: string }[]; truncated: boolean }>; errors: Record<string, string> }
interface Node {
  id: string;
  icono: LucideIcon;
  titulo: string;
  subtitulo: string;
  puerto?: string;
  tono: 'brand' | 'safe' | 'cost' | 'sidebar' | 'purple';
  que: string;
  protocolo: string;
  responsabilidad: string;
  siFalla: string;
  zona?: string;
  alojamiento?: string;
  failover?: string;
  tipoSubred?: 'pública' | 'privada';
  ip?: string;
  multiAz?: boolean;
}

export default function Network() {
  const { ambiente, regionPrincipal } = useCloud();
  const network = useAws<NetworkData>(`/aws/network?region=${regionPrincipal}`);
  const inventory = useAws<Inventory>(`/aws/inventory?region=${regionPrincipal}`);
  const services = useAws<ServiceInventory>(`/aws/services?region=${regionPrincipal}`);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedVpcId, setSelectedVpcId] = useState<string | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<{ status: number; statusText: string; milliseconds: number; url: string } | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const data = network.data;
  const vpc = data?.vpcs.find((item) => item.id === selectedVpcId) ?? data?.vpcs[0];
  const vpcSubnets = data?.subnets.filter((item) => item.vpcId === vpc?.id) ?? [];
  const publicSubnets = vpcSubnets.filter((item) => item.publicIp);
  const privateSubnets = vpcSubnets.filter((item) => !item.publicIp);
  const loadBalancers = services.data?.resources.elb?.items.filter((item) => item.vpcId === vpc?.id) ?? [];
  const instances = inventory.data?.instances.filter((item) => item.vpcId === vpc?.id) ?? [];
  const databases = inventory.data?.databases.filter((item) => item.vpcId === vpc?.id) ?? [];
  const nodes: Node[] = [
    ...(services.data?.resources.route53?.items ?? []).map((item) => ({
      id: item.id ?? '',
      icono: Globe,
      titulo: item.name ?? 'Amazon Route 53',
      subtitulo: item.id ?? 'Hosted zone',
      tono: 'brand' as const,
      que: 'Zona DNS global Anycast distribuida por AWS.',
      protocolo: 'DNS (Puerto 53 UDP/TCP)',
      responsabilidad: 'Enrutamiento de nombres y failover geográfico',
      siFalla: 'SLA del 100% de disponibilidad DNS con conmutación automática de tráfico.',
      alojamiento: 'Red Global Anycast de AWS (Multi-Región Edge)',
      failover: 'Redirecciona automáticamente las consultas hacia orígenes secundarios mediante DNS Health Checks.',
    })),
    ...(services.data?.resources.cloudfront?.items ?? []).map((item) => ({
      id: item.id ?? '',
      icono: Globe,
      titulo: 'Amazon CloudFront',
      subtitulo: item.name ?? item.id ?? '',
      tono: 'brand' as const,
      que: 'Distribución CloudFront con caché en borde perimetral.',
      protocolo: 'HTTP / HTTPS (TLS 1.3)',
      responsabilidad: 'Aceleración perimetral y entrega segura de contenido',
      siFalla: 'En caso de caída de un Edge Location, conmuta al PoP Anycast más cercano.',
      alojamiento: '400+ Puntos de Presencia (Edge Locations) globales',
      failover: 'Conmuta al origen secundario o sirve error personalizado desde S3.',
    })),
    ...(services.data?.resources.waf?.items ?? []).map((item) => ({
      id: item.id ?? '',
      icono: Shield,
      titulo: 'AWS WAF',
      subtitulo: item.name ?? item.id ?? '',
      tono: 'purple' as const,
      que: 'Cortafuegos de aplicaciones web (Web ACL).',
      protocolo: 'Inspección de peticiones capa 7',
      responsabilidad: 'Mitigación de ataques SQLi, XSS y bots maliciosos',
      siFalla: 'En caso de degradación de WAF, el modo seguro es fail-open para no frenar tráfico legítimo.',
      alojamiento: `Región ${regionPrincipal} integrado en ALB`,
      failover: 'Fail-open seguro gestionado automáticamente por AWS.',
    })),
    ...(data?.internetGateways.filter((item) => item.vpcIds.includes(vpc?.id ?? '')) ?? []).map((item) => ({
      id: item.id,
      icono: Box,
      titulo: 'Internet Gateway',
      subtitulo: item.id,
      tono: 'safe' as const,
      que: `Puerta de enlace a internet para ${vpc?.id}.`,
      protocolo: 'Enrutamiento IPv4/IPv6 hacia Internet',
      responsabilidad: 'Traducción de direcciones y conectividad pública',
      siFalla: 'Servicio altamente redundante horizontalmente administrado por AWS.',
      alojamiento: `VPC ${vpc?.id} (Redundante a nivel de toda la región)`,
      failover: 'Sin punto único de fallo; integrado en el backbone de AWS.',
    })),
    ...(data?.natGateways.filter((item) => item.vpcId === vpc?.id) ?? []).map((item) => ({
      id: item.id,
      icono: Box,
      titulo: 'NAT Gateway',
      subtitulo: `${item.id} · ${item.state}`,
      tono: 'safe' as const,
      que: `Gateway NAT gestionado en ${vpc?.id}.`,
      protocolo: 'Salida segura a Internet para subredes privadas (SNAT)',
      responsabilidad: 'Permite descargas y parches sin exponer IPs privadas',
      siFalla: 'Instancias privadas pierden acceso saliente hasta recuperación.',
      alojamiento: `Subred pública en ${vpc?.id}`,
      failover: 'Requiere desplegar un NAT secundario en otra AZ para alta disponibilidad zonal.',
    })),
    ...loadBalancers.map((item) => ({
      id: item.id ?? '',
      icono: Layers,
      titulo: 'Application Load Balancer',
      subtitulo: `${item.name ?? item.id ?? ''} · ${item.scheme ?? 'sin esquema'}`,
      tono: 'brand' as const,
      que: `Balanceador L7 ${item.scheme ?? ''} en ${vpc?.id}.`,
      protocolo: 'HTTP (80) / HTTPS (443)',
      responsabilidad: 'Distribución de carga y comprobaciones de salud a servidores',
      siFalla: 'AWS gestiona la redundancia Multi-AZ de forma automática.',
      alojamiento: `Multi-AZ en VPC ${vpc?.id} (Distribuido en múltiples zonas)`,
      failover: 'Si una instancia o AZ falla, el ALB retira el target en 5s y envía todo el tráfico a los servidores sanos restantes.',
    })),
    ...instances.map((item) => {
      const subnet = vpcSubnets.find((s) => s.id === item.subnetId);
      const esPublica = Boolean(item.publicIp || subnet?.publicIp);
      const otras = instances.filter((i) => i.id !== item.id);
      return {
        id: item.id,
        icono: Server,
        titulo: 'Amazon EC2 (Servidor)',
        subtitulo: `${item.id} · ${item.zone}`,
        tono: 'safe' as const,
        zona: item.zone,
        tipoSubred: esPublica ? 'pública' as const : 'privada' as const,
        ip: item.publicIp,
        que: `Servidor en estado ${item.state} alojado en ${item.zone}.`,
        protocolo: esPublica && item.publicIp ? `IP Pública: ${item.publicIp}` : 'IP Privada en VPC',
        responsabilidad: 'Servidor anfitrión de la aplicación y lógica de negocio',
        siFalla: 'El balanceador aísla el nodo y Auto Scaling aprovisiona un reemplazo.',
        alojamiento: `Zona de Disponibilidad física: ${item.zone} en ${vpc?.id} · Subred: ${item.subnetId ?? 'privada'}.`,
        failover: otras.length > 0
          ? `Si este servidor se malogra, el Application Load Balancer detecta el fallo mediante health check y redirige el tráfico hacia el servidor en ${otras.map((i) => i.zone).join(', ')}. Auto Scaling creará una nueva instancia para reemplazarla.`
          : `Alerta de Instancia Única en ${item.zone}: Si este servidor físico falla, habrá interrupción de tráfico hasta que Auto Scaling levante un nuevo nodo o se conmute a la región secundaria.`,
      };
    }),
    ...databases.map((item) => ({
      id: item.id,
      icono: Database,
      titulo: 'Amazon RDS (Base de Datos)',
      subtitulo: `${item.id} · ${item.zone}`,
      tono: 'cost' as const,
      zona: item.zone,
      multiAz: item.multiAz,
      que: `Base de datos relacional ${item.status}. Multi-AZ: ${item.multiAz ? 'Habilitado (Alta Disponibilidad)' : 'Inactivo (Single-AZ)'}.`,
      protocolo: 'Puerto SQL (PostgreSQL/MySQL)',
      responsabilidad: 'Persistencia transaccional de datos del sistema',
      siFalla: item.multiAz
        ? 'Failover automático sin intervención manual en <60s hacia la réplica standby.'
        : 'Indisponibilidad hasta recuperación manual o restauración desde snapshot.',
      alojamiento: `Alojada en la Zona de Disponibilidad ${item.zone} dentro de ${vpc?.id}.`,
      failover: item.multiAz
        ? `Failover Automático Multi-AZ Activo: Si este servidor de base de datos en ${item.zone} se malogra, Amazon RDS conmuta el endpoint DNS de inmediato a la réplica standby en la zona secundaria en menos de 60-120 segundos sin pérdida de datos (RPO=0).`
        : `Alerta de Riesgo Single-AZ: Esta base de datos NO tiene réplica standby configurada en otra zona. Si el hardware falla, el servicio quedará inaccesible hasta que AWS lo recupere físicamente o se restaure un backup.`,
    })),
  ];
  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0];
  const groups = data?.securityGroups.filter((item) => item.vpcId === vpc?.id) ?? [];
  const selectNode = (node: Node) => setSelectedId(node.id);

  const albPublico = (services.data?.resources.elb?.items ?? []).find(
    (item) => item.scheme === 'internet-facing' && item.dnsName
  );
  const simularPeticion = async () => {
    const url = albPublico?.dnsName ? `http://${albPublico.dnsName}` : null;
    if (!url) return;
    setSimLoading(true); setSimResult(null); setSimError(null);
    try {
      const result = await api<AwsResponse<{ status: number; statusText: string; milliseconds: number; url: string }>>(
        '/aws/simulate-request', { method: 'POST', body: JSON.stringify({ url }) }
      );
      setSimResult(result.data);
    } catch (e) { setSimError(e instanceof Error ? e.message : String(e)); }
    finally { setSimLoading(false); }
  };

  const nodeCard = (node: Node) => <NetworkNode key={node.id} icono={node.icono} titulo={node.titulo} subtitulo={node.subtitulo} puerto={node.puerto} tono={node.tono} activo={selected?.id === node.id} onClick={() => selectNode(node)} />;

  return <div className="space-y-8 animate-fade-in">
    <Card className="p-6 overflow-hidden">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-line pb-4 mb-6">
        <div><div className="flex items-center gap-2 flex-wrap"><h2 className="text-lg font-bold text-ink">Topología Interactiva de Arquitectura VPC de 3 Capas</h2><span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">{ambiente}</span><span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-500/10 text-muted border border-line">{regionPrincipal}</span><InfoTooltip titulo="Topología AWS" descripcion="Recursos de VPC e inventario consultados en AWS para la región elegida." /></div><p className="text-xs text-muted mt-1">Selecciona una VPC, subred o recurso para ver su información observada.</p></div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => void simularPeticion()}
            disabled={!albPublico?.dnsName || simLoading}
            title={!albPublico?.dnsName ? 'No hay un ALB internet-facing en esta región' : `Enviar GET a ${albPublico.dnsName} y medir latencia`}
            className={`inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white transition-colors ${!albPublico?.dnsName || simLoading ? 'opacity-50' : 'hover:bg-blue-500 cursor-pointer'}`}
          >
            <Play size={14} /> {simLoading ? 'Enviando...' : 'Simular Petición Normal'}
          </button>
          <button disabled title="No se ejecutan pruebas de ataque contra AWS" className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white opacity-50"><AlertOctagon size={14} /> Simular Bloqueo WAF (SQLi)</button>
          <button onClick={() => { void network.refresh(); void inventory.refresh(); void services.refresh(); }} className="rounded-xl border border-line bg-card px-4 py-2.5 text-xs font-bold text-blue-600 hover:bg-canvas transition-colors cursor-pointer">Actualizar AWS</button>
        </div>
      </div>
      {(simResult || simError) && (
        <div className={`text-xs px-4 py-2.5 rounded-xl mb-4 font-mono ${simError ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'}`}>
          {simError
            ? `Error: ${simError}`
            : simResult ? `✓ HTTP ${simResult.status} ${simResult.statusText} · ${simResult.milliseconds}ms · ${simResult.url}`
            : ''}
        </div>
      )}
      {(network.loading || inventory.loading || services.loading) && <p className="text-xs text-muted mb-4">Consultando red e inventario AWS...</p>}
      {[network.error, inventory.error, services.error].filter(Boolean).map((error) => <p key={error} className="text-xs text-rose-600 mb-2">{error}</p>)}
      <div className="space-y-6">
        <div><p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Capa Perimetral & Red de Borde Global</p><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{nodes.filter((node) => ['Amazon Route 53', 'Amazon CloudFront', 'AWS WAF', 'Internet Gateway', 'NAT Gateway'].includes(node.titulo)).map(nodeCard)}</div>{!nodes.some((node) => ['Amazon Route 53', 'Amazon CloudFront', 'AWS WAF', 'Internet Gateway', 'NAT Gateway'].includes(node.titulo)) && <p className="text-xs text-muted">No se detectaron recursos perimetrales en la consulta.</p>}</div>
        <div className="flex items-center justify-center"><div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-canvas border border-line text-xs font-mono text-muted"><ArrowDown size={14} className="text-blue-600" /> VPC, gateways y rutas detectados</div></div>
        <div className="rounded-3xl border-2 border-dashed border-emerald-500/40 bg-gradient-to-br from-emerald-500/5 to-slate-900/5 p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2"><Box size={20} className="text-emerald-600" /><span className="text-base font-black text-ink">Amazon Virtual Private Cloud (VPC)</span>{data?.vpcs.map((item) => <button key={item.id} onClick={() => { setSelectedVpcId(item.id); setSelectedId(null); }} className={`font-mono text-xs px-2 py-1 rounded-lg border ${vpc?.id === item.id ? 'border-emerald-500 text-emerald-600' : 'border-line text-muted'}`}>{item.id} · {item.cidr}</button>)}</div>
          {!data?.vpcs.length && !network.loading && <p className="text-xs text-muted">No se detectaron VPC en esta región.</p>}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-blue-500/30 bg-card p-4 space-y-2 shadow-xs"><p className="text-xs font-bold text-blue-600">Subredes con IP pública automática</p><div className="space-y-1 text-xs text-muted">{publicSubnets.map((item) => <p key={item.id} className="rounded-lg border border-line p-2">{item.id} · {item.cidr} · {item.zone}</p>)}{!publicSubnets.length && 'Ninguna detectada'}</div>{nodes.filter((node) => (node.titulo === 'Amazon EC2' && instances.some((item) => item.id === node.id && item.publicIp)) || (node.titulo === 'Load Balancer' && loadBalancers.some((item) => item.id === node.id && item.scheme === 'internet-facing'))).map(nodeCard)}</div>
            <div className="rounded-2xl border border-emerald-500/30 bg-card p-4 space-y-2 shadow-xs"><p className="text-xs font-bold text-emerald-600">Otras subredes y cómputo</p><div className="space-y-1 text-xs text-muted">{privateSubnets.map((item) => <p key={item.id} className="rounded-lg border border-line p-2">{item.id} · {item.cidr} · {item.zone}</p>)}{!privateSubnets.length && 'Ninguna detectada'}</div>{nodes.filter((node) => (node.titulo === 'Amazon EC2' && instances.some((item) => item.id === node.id && !item.publicIp)) || (node.titulo === 'Load Balancer' && loadBalancers.some((item) => item.id === node.id && item.scheme !== 'internet-facing'))).map(nodeCard)}</div>
            <div className="rounded-2xl border border-amber-500/30 bg-card p-4 space-y-2 shadow-xs"><p className="text-xs font-bold text-amber-600">Bases de datos</p><div className="space-y-2">{nodes.filter((node) => node.titulo === 'Amazon RDS').map(nodeCard)}{!databases.length && <p className="text-xs text-muted">No hay instancias RDS en esta región.</p>}</div></div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="rounded-3xl bg-canvas p-5 border border-line animate-fade-up">
          <div className="flex items-center gap-3 border-b border-line pb-3 mb-4">
            {selected ? (
              <>
                <selected.icono size={22} className="text-blue-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-ink">{selected.titulo}</h3>
                    {selected.zona && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">
                        AZ: {selected.zona}
                      </span>
                    )}
                    {selected.tipoSubred && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${selected.tipoSubred === 'pública' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'}`}>
                        Subred {selected.tipoSubred}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted font-mono truncate">{selected.subtitulo}</p>
                </div>
              </>
            ) : <h3 className="text-base font-bold text-ink">Selecciona un recurso</h3>}
          </div>
          {selected && (
            <div className="space-y-3 text-xs">
              {selected.alojamiento && (
                <div className="p-3 rounded-2xl bg-blue-500/5 border border-blue-500/20">
                  <p className="font-bold text-blue-600 text-xs mb-1">¿Dónde se está alojando?:</p>
                  <p className="text-ink leading-relaxed">{selected.alojamiento}</p>
                </div>
              )}
              {selected.failover && (
                <div className="p-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
                  <p className="font-bold text-emerald-600 text-xs mb-1">¿A dónde se conectará si se malogra? (Failover):</p>
                  <p className="text-ink leading-relaxed">{selected.failover}</p>
                </div>
              )}
              <p><Info size={14} className="inline mr-1 text-blue-600" />{selected.que}</p>
              <p><Lock size={14} className="inline mr-1 text-emerald-600" />{selected.protocolo}</p>
              <p><Shield size={14} className="inline mr-1 text-rose-500" />{selected.siFalla}</p>
              <p className="text-muted">{selected.responsabilidad}</p>
            </div>
          )}
        </div>
        <div className="rounded-3xl bg-slate-950 p-5 border border-slate-800 text-xs font-mono text-slate-300 shadow-xl"><div className="flex items-center gap-2 font-bold text-white border-b border-slate-800 pb-3 mb-3"><Terminal size={14} className="text-blue-400" /> Rutas y Flow Logs de la VPC</div><div className="space-y-2 max-h-56 overflow-auto">{data?.routes.filter((route) => route.vpcId === vpc?.id).flatMap((route) => route.routes.map((entry, index) => <p key={`${route.id}:${index}`}>{route.id}: {entry.destination ?? 'destino'} → {entry.gateway ?? 'local'} ({entry.state ?? 'sin estado'})</p>))}{data?.flowLogs.filter((log) => log.resourceId === vpc?.id).map((log) => <p key={log.id}>Flow Log {log.id}: {log.status} · {log.destination}</p>)}{!data?.routes.some((route) => route.vpcId === vpc?.id) && <p className="text-slate-500">No hay rutas en la respuesta.</p>}</div></div>
      </div>
    </Card>
    <Card className="p-6"><div className="border-b border-line pb-3 mb-4"><h3 className="text-base font-bold text-ink">Matriz de Cortafuegos: Security Groups</h3><p className="text-xs text-muted mt-0.5">Reglas entrantes de {vpc?.id ?? 'la VPC seleccionada'} devueltas por AWS.</p></div><div className="overflow-x-auto text-xs"><table className="w-full text-left"><thead><tr className="border-b border-line text-muted"><th className="pb-2.5">Grupo</th><th className="pb-2.5">Puerto / Protocolo</th><th className="pb-2.5">Origen</th><th className="pb-2.5">Ingreso público</th></tr></thead><tbody className="divide-y divide-line/60">{groups.flatMap((group) => group.ingress.map((rule, index) => <tr key={`${group.id}:${index}`}><td className="py-3 font-bold text-ink">{group.name} · {group.id}</td><td className="py-3 font-mono">{rule.protocol} {rule.fromPort == null ? 'todos' : rule.fromPort === rule.toPort ? rule.fromPort : `${rule.fromPort}–${rule.toPort}`}</td><td className="py-3 font-mono">{rule.source}</td><td className="py-3">{rule.source === '0.0.0.0/0' || rule.source === '::/0' ? 'Sí' : 'No'}</td></tr>))}</tbody></table>{!groups.length ? <p className="py-4 text-muted">No hay grupos de seguridad en la VPC seleccionada.</p> : groups.every((group) => !group.ingress.length) && <p className="py-4 text-muted">Los grupos consultados no tienen reglas entrantes.</p>}</div></Card>
  </div>;
}
