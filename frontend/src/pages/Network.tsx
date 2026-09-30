import { useState } from 'react';
import { Box, Globe, Layers, Server, Database, Shield, Lock, Info, Terminal, ArrowDown, Play, AlertOctagon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NetworkNode } from '../components/network/NetworkNode';
import { Card } from '../components/ui/Card';
import { InfoTooltip } from '../components/ui/InfoTooltip';
import { useCloud } from '../context/CloudContext';
import { useAws } from '../hooks/useAws';

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
interface ServiceInventory { resources: Record<string, { items: { id?: string; name?: string; state?: string; vpcId?: string; scheme?: string }[]; truncated: boolean }>; errors: Record<string, string> }
interface Node { id: string; icono: LucideIcon; titulo: string; subtitulo: string; puerto?: string; tono: 'brand' | 'safe' | 'cost' | 'sidebar' | 'purple'; que: string; protocolo: string; responsabilidad: string; siFalla: string }

export default function Network() {
  const { ambiente, regionPrincipal } = useCloud();
  const network = useAws<NetworkData>(`/aws/network?region=${regionPrincipal}`);
  const inventory = useAws<Inventory>(`/aws/inventory?region=${regionPrincipal}`);
  const services = useAws<ServiceInventory>(`/aws/services?region=${regionPrincipal}`);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedVpcId, setSelectedVpcId] = useState<string | null>(null);
  const data = network.data;
  const vpc = data?.vpcs.find((item) => item.id === selectedVpcId) ?? data?.vpcs[0];
  const vpcSubnets = data?.subnets.filter((item) => item.vpcId === vpc?.id) ?? [];
  const publicSubnets = vpcSubnets.filter((item) => item.publicIp);
  const privateSubnets = vpcSubnets.filter((item) => !item.publicIp);
  const loadBalancers = services.data?.resources.elb?.items.filter((item) => item.vpcId === vpc?.id) ?? [];
  const instances = inventory.data?.instances.filter((item) => item.vpcId === vpc?.id) ?? [];
  const databases = inventory.data?.databases.filter((item) => item.vpcId === vpc?.id) ?? [];
  const nodes: Node[] = [
    ...(services.data?.resources.route53?.items ?? []).map((item) => ({ id: item.id ?? '', icono: Globe, titulo: item.name ?? 'Amazon Route 53', subtitulo: item.id ?? 'Hosted zone', tono: 'brand' as const, que: 'Zona DNS encontrada en esta cuenta.', protocolo: 'DNS', responsabilidad: 'Configuración de la cuenta', siFalla: 'Consulta el estado y los registros en AWS.' })),
    ...(services.data?.resources.cloudfront?.items ?? []).map((item) => ({ id: item.id ?? '', icono: Globe, titulo: 'Amazon CloudFront', subtitulo: item.name ?? item.id ?? '', tono: 'brand' as const, que: 'Distribución CloudFront encontrada en esta cuenta.', protocolo: 'HTTP/HTTPS según su configuración', responsabilidad: 'Configuración de la cuenta', siFalla: 'Consulta el estado de la distribución en AWS.' })),
    ...(services.data?.resources.waf?.items ?? []).map((item) => ({ id: item.id ?? '', icono: Shield, titulo: 'AWS WAF', subtitulo: item.name ?? item.id ?? '', tono: 'purple' as const, que: 'Web ACL encontrada en esta cuenta.', protocolo: 'Reglas de Web ACL', responsabilidad: 'Configuración de la cuenta', siFalla: 'Consulta los registros y reglas en AWS.' })),
    ...(data?.internetGateways.filter((item) => item.vpcIds.includes(vpc?.id ?? '')) ?? []).map((item) => ({ id: item.id, icono: Box, titulo: 'Internet Gateway', subtitulo: item.id, tono: 'safe' as const, que: `Asociado a ${vpc?.id}.`, protocolo: 'Enrutamiento VPC', responsabilidad: 'Configuración de rutas de la cuenta', siFalla: 'Verifica tablas de rutas y estado del gateway.' })),
    ...(data?.natGateways.filter((item) => item.vpcId === vpc?.id) ?? []).map((item) => ({ id: item.id, icono: Box, titulo: 'NAT Gateway', subtitulo: `${item.id} · ${item.state}`, tono: 'safe' as const, que: `Gateway NAT en ${vpc?.id}.`, protocolo: 'Tráfico saliente según rutas', responsabilidad: 'Configuración de rutas de la cuenta', siFalla: 'Verifica la tabla de rutas y el estado del NAT Gateway.' })),
    ...loadBalancers.map((item) => ({ id: item.id ?? '', icono: Layers, titulo: 'Load Balancer', subtitulo: `${item.name ?? item.id ?? ''} · ${item.scheme ?? 'sin esquema'}`, tono: 'brand' as const, que: `Balanceador ${item.scheme ?? ''} encontrado en ${vpc?.id}.`, protocolo: 'Listeners según configuración', responsabilidad: 'Configuración de la cuenta', siFalla: 'Consulta target groups y health checks en AWS.' })),
    ...instances.map((item) => ({ id: item.id, icono: Server, titulo: 'Amazon EC2', subtitulo: `${item.id} · ${item.zone}`, tono: 'safe' as const, que: `Instancia con estado ${item.state}.`, protocolo: 'Puertos según grupos de seguridad', responsabilidad: 'Sistema operativo y aplicación de la cuenta', siFalla: 'Consulta CloudWatch y el estado de EC2.' })),
    ...databases.map((item) => ({ id: item.id, icono: Database, titulo: 'Amazon RDS', subtitulo: `${item.id} · ${item.zone}`, tono: 'cost' as const, que: `Base de datos ${item.status}; Multi-AZ: ${item.multiAz ? 'sí' : 'no'}.`, protocolo: 'Según motor y configuración', responsabilidad: 'Datos y acceso de la cuenta', siFalla: 'Consulta eventos y estado de RDS.' })),
  ];
  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0];
  const groups = data?.securityGroups.filter((item) => item.vpcId === vpc?.id) ?? [];
  const selectNode = (node: Node) => setSelectedId(node.id);
  const nodeCard = (node: Node) => <NetworkNode key={node.id} icono={node.icono} titulo={node.titulo} subtitulo={node.subtitulo} puerto={node.puerto} tono={node.tono} activo={selected?.id === node.id} onClick={() => selectNode(node)} />;

  return <div className="space-y-8 animate-fade-in">
    <Card className="p-6 overflow-hidden">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-line pb-4 mb-6">
        <div><div className="flex items-center gap-2 flex-wrap"><h2 className="text-lg font-bold text-ink">Topología Interactiva de Arquitectura VPC de 3 Capas</h2><span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">{ambiente}</span><span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-500/10 text-muted border border-line">{regionPrincipal}</span><InfoTooltip titulo="Topología AWS" descripcion="Recursos de VPC e inventario consultados en AWS para la región elegida." /></div><p className="text-xs text-muted mt-1">Selecciona una VPC, subred o recurso para ver su información observada.</p></div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button disabled title="No hay trazas de paquetes reales para ejecutar esta prueba" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white opacity-50"><Play size={14} /> Simular Petición Normal</button>
          <button disabled title="No se ejecutan pruebas de ataque contra AWS" className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white opacity-50"><AlertOctagon size={14} /> Simular Bloqueo WAF (SQLi)</button>
          <button onClick={() => { void network.refresh(); void inventory.refresh(); void services.refresh(); }} className="rounded-xl border border-line bg-card px-4 py-2.5 text-xs font-bold text-blue-600">Actualizar AWS</button>
        </div>
      </div>
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
        <div className="rounded-3xl bg-canvas p-5 border border-line animate-fade-up"><div className="flex items-center gap-3 border-b border-line pb-3 mb-4">{selected ? <><selected.icono size={22} className="text-blue-600" /><div><h3 className="text-base font-bold text-ink">{selected.titulo}</h3><p className="text-xs text-muted font-mono">{selected.subtitulo}</p></div></> : <h3 className="text-base font-bold text-ink">Selecciona un recurso</h3>}</div>{selected && <div className="space-y-3 text-xs"><p><Info size={14} className="inline mr-1 text-blue-600" />{selected.que}</p><p><Lock size={14} className="inline mr-1 text-emerald-600" />{selected.protocolo}</p><p><Shield size={14} className="inline mr-1 text-rose-500" />{selected.siFalla}</p><p className="text-muted">{selected.responsabilidad}</p></div>}</div>
        <div className="rounded-3xl bg-slate-950 p-5 border border-slate-800 text-xs font-mono text-slate-300 shadow-xl"><div className="flex items-center gap-2 font-bold text-white border-b border-slate-800 pb-3 mb-3"><Terminal size={14} className="text-blue-400" /> Rutas y Flow Logs de la VPC</div><div className="space-y-2 max-h-56 overflow-auto">{data?.routes.filter((route) => route.vpcId === vpc?.id).flatMap((route) => route.routes.map((entry, index) => <p key={`${route.id}:${index}`}>{route.id}: {entry.destination ?? 'destino'} → {entry.gateway ?? 'local'} ({entry.state ?? 'sin estado'})</p>))}{data?.flowLogs.filter((log) => log.resourceId === vpc?.id).map((log) => <p key={log.id}>Flow Log {log.id}: {log.status} · {log.destination}</p>)}{!data?.routes.some((route) => route.vpcId === vpc?.id) && <p className="text-slate-500">No hay rutas en la respuesta.</p>}</div></div>
      </div>
    </Card>
    <Card className="p-6"><div className="border-b border-line pb-3 mb-4"><h3 className="text-base font-bold text-ink">Matriz de Cortafuegos: Security Groups</h3><p className="text-xs text-muted mt-0.5">Reglas entrantes de {vpc?.id ?? 'la VPC seleccionada'} devueltas por AWS.</p></div><div className="overflow-x-auto text-xs"><table className="w-full text-left"><thead><tr className="border-b border-line text-muted"><th className="pb-2.5">Grupo</th><th className="pb-2.5">Puerto / Protocolo</th><th className="pb-2.5">Origen</th><th className="pb-2.5">Ingreso público</th></tr></thead><tbody className="divide-y divide-line/60">{groups.flatMap((group) => group.ingress.map((rule, index) => <tr key={`${group.id}:${index}`}><td className="py-3 font-bold text-ink">{group.name} · {group.id}</td><td className="py-3 font-mono">{rule.protocol} {rule.fromPort == null ? 'todos' : rule.fromPort === rule.toPort ? rule.fromPort : `${rule.fromPort}–${rule.toPort}`}</td><td className="py-3 font-mono">{rule.source}</td><td className="py-3">{rule.source === '0.0.0.0/0' || rule.source === '::/0' ? 'Sí' : 'No'}</td></tr>))}</tbody></table>{!groups.length ? <p className="py-4 text-muted">No hay grupos de seguridad en la VPC seleccionada.</p> : groups.every((group) => !group.ingress.length) && <p className="py-4 text-muted">Los grupos consultados no tienen reglas entrantes.</p>}</div></Card>
  </div>;
}
