import { useState } from 'react';
import {
  Globe,
  Zap,
  Box,
  Server,
  Database,
  Shield,
  Play,
  Lock,
  ArrowDown,
  Layers,
  Info,
  AlertOctagon,
  Terminal,
} from 'lucide-react';
import { NetworkNode } from '../components/network/NetworkNode';
import { Card } from '../components/ui/Card';
import { InfoTooltip } from '../components/ui/InfoTooltip';
import { useCloud } from '../context/CloudContext';
import type { LucideIcon } from 'lucide-react';

interface NodoInfo {
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
  latencia: number;
}

const nodos: NodoInfo[] = [
  {
    id: 'internet',
    icono: Globe,
    titulo: 'Internet Global',
    subtitulo: '0.0.0.0/0 · Clientes',
    puerto: 'TCP/IP',
    tono: 'sidebar',
    que: 'Usuarios finales accediendo desde cualquier dispositivo y proveedor de telecomunicaciones en el mundo.',
    protocolo: 'IPv4 / IPv6, TCP/IP, HTTPS',
    responsabilidad: 'Sin responsabilidad del cliente. Gestionado por ISPs y operadores de telecomunicaciones globales.',
    siFalla: 'Pérdida de conectividad externa. Mitigado mediante Anycast DNS y CloudFront CDN global.',
    latencia: 15,
  },
  {
    id: 'route53',
    icono: Globe,
    titulo: 'Amazon Route 53',
    subtitulo: 'DNS Global · Latency Routing',
    puerto: '53/UDP',
    tono: 'brand',
    que: 'Servicio DNS autoritativo con SLA del 100%. Resuelve el dominio y enruta al Edge Location más próximo.',
    protocolo: 'DNS (UDP/TCP puerto 53)',
    responsabilidad: 'Cliente: Configuración de hosted zones, registros Alias A/AAAA y comprobaciones de salud.',
    siFalla: 'Fallo catastrófico en resolución de dominios. Respaldado por el 100% de SLA oficial de AWS.',
    latencia: 12,
  },
  {
    id: 'waf',
    icono: Shield,
    titulo: 'AWS WAF & Shield',
    subtitulo: 'Capa 7 · OWASP Top 10',
    puerto: '443/TCP',
    tono: 'purple',
    que: 'Inspección de peticiones HTTP en tiempo real para neutralizar ataques DDoS, bots maliciosos y SQL Injection.',
    protocolo: 'HTTPS / TLS 1.3',
    responsabilidad: 'Cliente: Administrar reglas de ACL Web y umbrales de rate-limiting.',
    siFalla: 'Tráfico potencialmente malicioso llega directamente al backend de cómputo.',
    latencia: 3,
  },
  {
    id: 'cloudfront',
    icono: Zap,
    titulo: 'Amazon CloudFront',
    subtitulo: '450+ Edge Locations',
    puerto: '443/TCP',
    tono: 'brand',
    que: 'Red de entrega de contenido (CDN) que cachea respuestas estáticas y acelera las conexiones dinámicas mediante la red troncal de AWS.',
    protocolo: 'HTTPS (TLS 1.3 / HTTP/3)',
    responsabilidad: 'Cliente: Comportamientos de caché (TTL), certificados ACM y políticas de encabezados.',
    siFalla: 'Toda petición viaja hasta el origen (ALB/EC2), aumentando drásticamente la latencia y la carga.',
    latencia: 8,
  },
  {
    id: 'igw',
    icono: Box,
    titulo: 'Internet Gateway (IGW)',
    subtitulo: 'Enlace VPC a Internet',
    puerto: 'VPC Router',
    tono: 'safe',
    que: 'Componente VPC redundante y horizontalmente escalable que permite la comunicación bidireccional entre la subred pública e Internet.',
    protocolo: 'NAT 1:1 automático de IP pública a privada',
    responsabilidad: 'AWS: Disponibilidad y ancho de banda. Cliente: Tabla de rutas 0.0.0.0/0 -> igw.',
    siFalla: 'Imposibilidad de acceder a las subredes públicas desde Internet. Totalmente gestionado por AWS sin cuellos de botella.',
    latencia: 2,
  },
  {
    id: 'alb',
    icono: Layers,
    titulo: 'Application Load Balancer',
    subtitulo: 'Subred Pública (Multi-AZ)',
    puerto: '80, 443',
    tono: 'brand',
    que: 'Distribuye equitativamente las peticiones entrantes entre las instancias EC2 en distintas zonas de disponibilidad.',
    protocolo: 'HTTP/2, HTTPS, WebSockets',
    responsabilidad: 'Cliente: Target Groups, Health Checks y reglas de reenvío por host o URL path.',
    siFalla: 'Pérdida de balanceo. Se mitiga mediante redundancia Multi-AZ automática gestionada por AWS.',
    latencia: 5,
  },
  {
    id: 'ec2',
    icono: Server,
    titulo: 'Amazon EC2 Auto Scaling',
    subtitulo: 'Subred Privada (10.0.10.0/24)',
    puerto: '8080/TCP',
    tono: 'safe',
    que: 'Servidores de cómputo que ejecutan los microservicios sin IP pública, aislados de acceso directo de Internet.',
    protocolo: 'TCP / HTTP Interno',
    responsabilidad: 'Cliente: Parchado de sistema operativo, código de aplicación y configuración de Auto Scaling.',
    siFalla: 'Auto Scaling reemplaza instancias enfermas automáticamente basándose en los health checks del ALB.',
    latencia: 18,
  },
  {
    id: 'rds',
    icono: Database,
    titulo: 'Amazon RDS Multi-AZ',
    subtitulo: 'Subred Aislada (10.0.30.0/24)',
    puerto: '5432/TCP',
    tono: 'cost',
    que: 'Base de datos relacional PostgreSQL con réplica síncrona en otra zona de disponibilidad y respaldos automáticos.',
    protocolo: 'PostgreSQL Wire Protocol',
    responsabilidad: 'Compartida: AWS administra SO y hardware; cliente administra esquemas, índices y credenciales.',
    siFalla: 'Conmutación por error (failover) transparente a la réplica Standby en menos de 60 segundos.',
    latencia: 3,
  },
];

const reglasFirewall = [
  { componente: 'ALB (Security Group)', puerto: '80 / 443', origen: '0.0.0.0/0 (Cualquiera)', accion: 'Permitir HTTPS de Internet' },
  { componente: 'EC2 App (Security Group)', puerto: '8080', origen: 'sg-alb (Solo ALB)', accion: 'Aislar cómputo de Internet' },
  { componente: 'RDS DB (Security Group)', puerto: '5432', origen: 'sg-ec2 (Solo Instancias App)', accion: 'Bloqueo estricto de base de datos' },
  { componente: 'NACL Pública', puerto: '1024-65535', origen: '0.0.0.0/0', accion: 'Puertos efímeros de respuesta' },
];

export default function Network() {
  const { ambiente, regionPrincipal } = useCloud();
  const [nodoActivo, setNodoActivo] = useState<NodoInfo>(nodos[0]);
  const [pasoSimulacion, setPasoSimulacion] = useState<number>(-1);
  const [modoSimulacion, setModoSimulacion] = useState<'normal' | 'ataque'>('normal');
  const [simulando, setSimulando] = useState(false);
  const [latenciaAcumulada, setLatenciaAcumulada] = useState<number>(0);
  const [registroPaquete, setRegistroPaquete] = useState<string[]>([]);

  const iniciarSimulacion = (modo: 'normal' | 'ataque') => {
    setModoSimulacion(modo);
    setSimulando(true);
    setPasoSimulacion(0);
    setLatenciaAcumulada(0);
    setRegistroPaquete([]);

    const secuencia = modo === 'normal' ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1, 2];
    let idx = 0;

    const interval = setInterval(() => {
      idx++;
      if (idx < secuencia.length) {
        const nodoIndex = secuencia[idx];
        setPasoSimulacion(nodoIndex);
        setNodoActivo(nodos[nodoIndex]);
        setLatenciaAcumulada((prev) => prev + nodos[nodoIndex].latencia);
        setRegistroPaquete((prev) => [
          ...prev,
          `[${new Date().toISOString().slice(11, 19)}] Hop ${idx}: ${nodos[nodoIndex].titulo} (+${nodos[nodoIndex].latencia}ms)`,
        ]);
      } else {
        clearInterval(interval);
        setSimulando(false);
        if (modo === 'ataque') {
          setRegistroPaquete((prev) => [
            ...prev,
            `[${new Date().toISOString().slice(11, 19)}] ALERTA: Paquete con payload SQLi detectado en AWS WAF. HTTP 403 Forbidden emitido. Origen mitigado.`,
          ]);
        } else {
          setRegistroPaquete((prev) => [
            ...prev,
            `[${new Date().toISOString().slice(11, 19)}] SUCCESS: Transacción completada en RDS Multi-AZ. HTTP 200 OK retornado al cliente.`,
          ]);
        }
      }
    }, 650);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <Card className="p-6 overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-line pb-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" style={{ animationDuration: '4s' }} />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
              </span>
              <h2 className="text-lg font-bold text-ink">
                Topología Interactiva de Arquitectura VPC de 3 Capas
              </h2>
              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">
                {ambiente}
              </span>
              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-600 dark:text-slate-300 border border-slate-500/20">
                {regionPrincipal}
              </span>
              <InfoTooltip
                titulo="Arquitectura VPC de 3 Capas"
                descripcion="Modelo estándar de referencia AWS que aísla los recursos en capas DMZ Pública (ALBs), Cómputo Privado (EC2/ECS) y Persistencia Aislada (RDS/DynamoDB) para máxima seguridad y cumplimiento."
              />
            </div>
            <p className="text-xs text-muted mt-0.5">
              Simulador visual de paquetes: Capa Perimetral → DMZ Pública → Cómputo Privado → Persistencia Aislada.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => iniciarSimulacion('normal')}
              disabled={simulando}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:from-blue-500 hover:to-indigo-500 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Play size={14} /> {simulando && modoSimulacion === 'normal' ? 'Enrutando Paquete...' : 'Simular Petición Normal'}
            </button>
            <InfoTooltip
              titulo="Simulación de Petición Legítima"
              descripcion="Rastrea un paquete HTTPS desde Internet a través de Route 53, WAF, CloudFront, ALB, instancias privadas EC2 y base de datos RDS Multi-AZ calculando latencias acumuladas en tiempo real."
            />

            <button
              onClick={() => iniciarSimulacion('ataque')}
              disabled={simulando}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:from-rose-500 hover:to-red-500 transition-all disabled:opacity-50 cursor-pointer"
            >
              <AlertOctagon size={14} /> Simular Bloqueo WAF (SQLi)
            </button>
            <InfoTooltip
              titulo="Simulación Bloqueo WAF"
              descripcion="Demuestra cómo las reglas administradas de AWS WAF inspeccionan el tráfico en el Edge y descartan de inmediato cargas maliciosas tipo SQLi con un código HTTP 403 Forbidden antes de que toquen tus servidores."
            />
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <p className="text-xs font-bold text-muted uppercase tracking-wider">
                Capa Perimetral & Red de Borde Global
              </p>
              <InfoTooltip
                titulo="Red de Borde AWS"
                descripcion="Infraestructura perimetral distribuida en más de 450 puntos de presencia (PoPs) que absorbe ataques de denegación de servicio (DDoS) y entrega contenido dinámico y estático con baja latencia."
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {nodos.slice(0, 4).map((nodo, idx) => (
                <NetworkNode
                  key={nodo.id}
                  icono={nodo.icono}
                  titulo={nodo.titulo}
                  subtitulo={nodo.subtitulo}
                  puerto={nodo.puerto}
                  tono={nodo.tono}
                  activo={nodoActivo.id === nodo.id}
                  pulsante={pasoSimulacion === idx}
                  onClick={() => setNodoActivo(nodo)}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center">
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-canvas border border-line text-xs font-mono text-muted shadow-xs">
              <ArrowDown size={14} className="text-blue-600 animate-bounce" />
              Internet Gateway (IGW) & NAT Gateways de Alta Velocidad
            </div>
          </div>

          <div className="rounded-3xl border-2 border-dashed border-emerald-500/40 bg-gradient-to-br from-emerald-500/5 to-slate-900/5 p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Box size={20} className="text-emerald-600 shrink-0" />
                <span className="text-base font-black text-ink">Amazon Virtual Private Cloud (VPC)</span>
                <span className="font-mono text-xs text-muted bg-card px-2 py-0.5 rounded-lg border border-line font-bold">
                  {regionPrincipal} · {ambiente === 'Sandbox' ? 'CIDR 10.2.0.0/16 (Dev Single-AZ)' : ambiente === 'Staging' ? 'CIDR 10.1.0.0/16 (Staging QA)' : 'CIDR 10.0.0.0/16 (Producción Multi-AZ)'}
                </span>
                <InfoTooltip
                  titulo="Amazon Virtual Private Cloud"
                  descripcion="Red virtual dedicada a tu cuenta de AWS. Proporciona aislamiento de red completo, rangos de direcciones IP privados asignables y control granular sobre el enrutamiento y puertas de enlace."
                />
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs font-bold text-emerald-600 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 whitespace-nowrap">
                  {ambiente === 'Sandbox' ? 'Dev Aislado' : 'Segmentación Zero-Trust'}
                </span>
                <InfoTooltip
                  titulo="Segmentación Zero-Trust"
                  descripcion="Ningún componente de la red confía ciegamente en otro. Cada capa está protegida por listas de control de acceso y grupos de seguridad con reglas unidireccionales de mínimo privilegio."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-blue-500/30 bg-card p-4 space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-blue-600">Subred Pública (DMZ)</span>
                    <InfoTooltip
                      titulo="Subred Pública"
                      descripcion="Subred conectada a Internet mediante Internet Gateway (IGW). Alberga exclusivamente balanceadores de carga ALB que reciben peticiones públicas."
                    />
                  </div>
                  <span className="font-mono text-[10px] text-muted font-bold">{regionPrincipal}a · 10.0.1.0/24</span>
                </div>
                <p className="text-[11px] text-muted">Acceso directo a Internet Gateway. Aloja balanceadores ALB.</p>
                <NetworkNode
                  icono={nodos[5].icono}
                  titulo={nodos[5].titulo}
                  subtitulo={nodos[5].subtitulo}
                  puerto={nodos[5].puerto}
                  tono="brand"
                  activo={nodoActivo.id === nodos[5].id}
                  pulsante={pasoSimulacion === 5}
                  onClick={() => setNodoActivo(nodos[5])}
                />
              </div>

              <div className="rounded-2xl border border-emerald-500/30 bg-card p-4 space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-emerald-600">Subred Privada (Cómputo)</span>
                    <InfoTooltip
                      titulo="Subred Privada"
                      descripcion="Subred sin acceso entrante desde Internet. Aloja las instancias EC2 en Auto Scaling. El tráfico saliente (ej. parches de seguridad) se canaliza de forma segura por un NAT Gateway."
                    />
                  </div>
                  <span className="font-mono text-[10px] text-muted font-bold">{ambiente === 'Sandbox' ? `${regionPrincipal}a` : `${regionPrincipal}a / ${regionPrincipal}b`} · 10.0.10.0/24</span>
                </div>
                <p className="text-[11px] text-muted">Sin IP pública. Salida a Internet para parches vía NAT.</p>
                <NetworkNode
                  icono={nodos[6].icono}
                  titulo={nodos[6].titulo}
                  subtitulo={nodos[6].subtitulo}
                  puerto={nodos[6].puerto}
                  tono="safe"
                  activo={nodoActivo.id === nodos[6].id}
                  pulsante={pasoSimulacion === 6}
                  onClick={() => setNodoActivo(nodos[6])}
                />
              </div>

              <div className="rounded-2xl border border-amber-500/30 bg-card p-4 space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-amber-600">Subred Aislada (Datos)</span>
                    <InfoTooltip
                      titulo="Subred Aislada"
                      descripcion="Subred sin rutas a Internet ni a NAT Gateways. Aloja las bases de datos RDS Multi-AZ accesibles únicamente desde las instancias de cómputo en puertos específicos."
                    />
                  </div>
                  <span className="font-mono text-[10px] text-muted font-bold">{ambiente === 'Sandbox' ? 'Single-AZ Dev' : `${regionPrincipal} Multi-AZ`} · 10.0.30.0/24</span>
                </div>
                <p className="text-[11px] text-muted">Sin acceso a Internet. Comunicación restringida solo a la App.</p>
                <NetworkNode
                  icono={nodos[7].icono}
                  titulo={nodos[7].titulo}
                  subtitulo={nodos[7].subtitulo}
                  puerto={nodos[7].puerto}
                  tono="cost"
                  activo={nodoActivo.id === nodos[7].id}
                  pulsante={pasoSimulacion === 7}
                  onClick={() => setNodoActivo(nodos[7])}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {nodoActivo && (
            <div className="rounded-3xl bg-canvas p-5 border border-line animate-fade-up flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-4 border-b border-line pb-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-500/10 text-blue-600 font-bold shadow-xs">
                      <nodoActivo.icono size={22} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-ink">{nodoActivo.titulo}</h3>
                      <p className="text-xs text-muted font-mono">{nodoActivo.subtitulo}</p>
                    </div>
                  </div>
                  <span className="font-mono text-xs bg-card px-2.5 py-1 rounded-xl border border-line font-bold text-ink">
                    {nodoActivo.puerto}
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <p className="font-bold text-ink flex items-center gap-1.5">
                        <Info size={14} className="text-blue-600" /> Rol en la Topología de Red
                      </p>
                      <InfoTooltip
                        titulo="Rol Arquitectónico"
                        descripcion="Función específica que desempeña este componente dentro del flujo global de datos en la topología."
                      />
                    </div>
                    <p className="text-muted leading-relaxed">{nodoActivo.que}</p>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <p className="font-bold text-ink flex items-center gap-1.5">
                        <Lock size={14} className="text-emerald-600" /> Límites y Protocolos
                      </p>
                      <InfoTooltip
                        titulo="Protocolos de Red"
                        descripcion="Protocolos de comunicación admitidos, puertos autorizados y niveles de cifrado TLS negociados."
                      />
                    </div>
                    <p className="text-muted leading-relaxed font-mono text-[11px] bg-card p-2 rounded-xl border border-line">
                      {nodoActivo.protocolo}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <p className="font-bold text-ink flex items-center gap-1.5">
                        <Shield size={14} className="text-rose-500" /> Comportamiento ante Fallos
                      </p>
                      <InfoTooltip
                        titulo="Tolerancia a Fallos"
                        descripcion="Mecanismos de autorrecuperación, balanceo o conmutación por error ante cualquier indisponibilidad del servicio."
                      />
                    </div>
                    <p className="text-muted leading-relaxed">{nodoActivo.siFalla}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-line flex items-center justify-between text-xs text-muted font-medium">
                <span>Latencia estimada de salto:</span>
                <span className="font-mono font-bold text-blue-600">{nodoActivo.latencia} ms</span>
              </div>
            </div>
          )}

          <div className="rounded-3xl bg-slate-950 p-5 border border-slate-800 text-xs font-mono text-slate-300 flex flex-col justify-between shadow-xl">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                <span className="flex items-center gap-2 font-bold text-white">
                  <Terminal size={14} className="text-blue-400" /> Consola de Paquetes en Vivo
                </span>
                <span className="text-[10px] text-slate-500">
                  {simulando ? 'Captura en tiempo real...' : 'Listo'}
                </span>
              </div>

              <div className="space-y-1.5 min-h-[160px] max-h-[220px] overflow-y-auto pr-1">
                {registroPaquete.length === 0 ? (
                  <p className="text-slate-600 italic py-8 text-center">
                    Haz clic en "Simular Petición Normal" o "Simular Bloqueo WAF" para observar la telemetría en tiempo real.
                  </p>
                ) : (
                  registroPaquete.map((linea, idx) => (
                    <p
                      key={idx}
                      className={`leading-relaxed ${
                        linea.includes('ALERTA')
                          ? 'text-rose-400 font-bold'
                          : linea.includes('SUCCESS')
                          ? 'text-emerald-400 font-bold'
                          : 'text-slate-300'
                      }`}
                    >
                      {linea}
                    </p>
                  ))
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
              <span>Latencia Round-Trip Acumulada:</span>
              <span className="font-bold text-blue-400 text-sm">
                {latenciaAcumulada} ms
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="border-b border-line pb-3 mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-ink">Matriz de Cortafuegos: Security Groups & NACLs</h3>
            <InfoTooltip
              titulo="Seguridad de Red AWS"
              descripcion="Los Security Groups operan con estado a nivel de interfaz de red de cada recurso, mientras que las NACLs actúan como filtro perimetral sin estado a nivel de subred completa."
            />
          </div>
          <p className="text-xs text-muted mt-0.5">
            Reglas de tráfico entrante que hacen cumplir el aislamiento estricto entre capas
          </p>
        </div>

        <div className="hidden md:block overflow-x-auto text-xs">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="pb-2.5 font-semibold">Capa / Grupo de Seguridad</th>
                <th className="pb-2.5 font-semibold">Puerto / Protocolo</th>
                <th className="pb-2.5 font-semibold">Origen Permitido</th>
                <th className="pb-2.5 font-semibold text-right">Efecto de Protección</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {reglasFirewall.map((regla, idx) => (
                <tr key={idx} className="hover:bg-canvas/40">
                  <td className="py-3 font-bold text-ink">{regla.componente}</td>
                  <td className="py-3 font-mono text-blue-600 font-semibold">{regla.puerto}</td>
                  <td className="py-3 font-mono text-muted">{regla.origen}</td>
                  <td className="py-3 text-right font-medium text-emerald-600">{regla.accion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="md:hidden space-y-3 text-xs">
          {reglasFirewall.map((regla, idx) => (
            <div key={idx} className="rounded-xl bg-canvas border border-line p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-ink">{regla.componente}</span>
                <span className="font-mono text-blue-600 font-bold bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">
                  {regla.puerto}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <div>
                  <p className="text-muted font-semibold uppercase tracking-wide text-[10px]">Origen Permitido</p>
                  <p className="font-mono text-ink mt-0.5">{regla.origen}</p>
                </div>
                <div>
                  <p className="text-muted font-semibold uppercase tracking-wide text-[10px]">Efecto de Protección</p>
                  <p className="font-medium text-emerald-600 mt-0.5">{regla.accion}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
