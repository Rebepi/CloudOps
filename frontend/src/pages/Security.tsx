import { useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  User,
  Users,
  Key,
  Lock,
  Play,
  CheckCircle2,
  Server,
  Cloud,
  Terminal,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { SecurityCard } from '../components/SecurityCard';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Card } from '../components/ui/Card';
import { InfoTooltip } from '../components/ui/InfoTooltip';
import { Select } from '../components/ui/Select';
import type { ControlSeguridad, UsuarioIAM } from '../types/cloud';
import { useCloud } from '../context/CloudContext';
import { useAws } from '../hooks/useAws';
import { api, type AwsResponse } from '../lib/api';

type SecurityData = {
  accountSummary: Record<string, number>;
  identities: { name: string; arn: string; mfa: boolean; createdAt?: string; policies: string[] }[];
  roles: { name: string; arn: string; createdAt?: string; policies: string[] }[];
  trails: { name?: string; multiRegion?: boolean; logFileValidation?: boolean; isLogging?: boolean | null }[];
  findings: { id?: string; title?: string; severity?: string; status?: string }[];
  findingsError: string | null;
  truncated: boolean;
};

const dominios: ControlSeguridad['dominio'][] = [
  'Responsabilidad compartida',
  'Gestión de identidades (IAM)',
  'Protección de la cuenta',
  'Protección de datos',
  'Cumplimiento',
];

const iconoTipo = { Usuario: User, Grupo: Users, Rol: Key } as const;

const accionesPrueba = ['s3:GetObject', 's3:DeleteBucket', 'ec2:RunInstances', 'ec2:TerminateInstances', 'rds:CreateDBSnapshot', 'iam:CreateUser'];

export default function Security() {
  const { ambiente, regionPrincipal } = useCloud();
  const security = useAws<SecurityData>(`/aws/security?region=${regionPrincipal}`);
  const [dominioActivo, setDominioActivo] = useState<string>('Todos');
  const [filtroNivel, setFiltroNivel] = useState<string>('Todos');
  const [auditando, setAuditando] = useState(false);
  const [auditoriaCompletada, setAuditoriaCompletada] = useState(false);
  const [simUsuarioId, setSimUsuarioId] = useState<string>('');
  const [simAccionId, setSimAccionId] = useState<string>('ec2:TerminateInstances');
  const [recursoArn, setRecursoArn] = useState('*');
  const [resultadoSimulacion, setResultadoSimulacion] = useState<{ permitido: boolean; motivo: string } | null>(null);
  const [errorSimulacion, setErrorSimulacion] = useState<string | null>(null);

  const usuariosIAM: UsuarioIAM[] = security.data ? [
    ...security.data.identities.map((u) => ({ id: u.arn, nombre: u.name, tipo: 'Usuario' as const, politicas: u.policies, mfa: u.mfa, ultimoAcceso: u.createdAt ? `Creado: ${new Date(u.createdAt).toLocaleDateString('es-PE')}` : 'Sin fecha', arn: u.arn })),
    ...security.data.roles.map((r) => ({ id: r.arn, nombre: r.name, tipo: 'Rol' as const, politicas: r.policies, mfa: false, ultimoAcceso: r.createdAt ? `Creado: ${new Date(r.createdAt).toLocaleDateString('es-PE')}` : 'Sin fecha', arn: r.arn })),
  ] : [];
  const controlesAmbiente: ControlSeguridad[] = security.data ? [
    { id: 'root-mfa', dominio: 'Protección de la cuenta', titulo: 'MFA de la cuenta root', descripcion: `IAM AccountMFAEnabled: ${security.data.accountSummary.AccountMFAEnabled ?? 'sin dato'}`, nivel: security.data.accountSummary.AccountMFAEnabled === 1 ? 'correcto' : 'problema', recomendacion: 'Habilitar MFA si el indicador es 0.' },
    { id: 'iam-mfa', dominio: 'Gestión de identidades (IAM)', titulo: 'MFA de usuarios IAM', descripcion: `${security.data.identities.filter((u) => u.mfa).length} de ${security.data.identities.length} usuarios con MFA`, nivel: security.data.identities.every((u) => u.mfa) ? 'correcto' : 'revision', recomendacion: security.data.identities.length ? 'Revisar los usuarios sin MFA.' : 'No hay usuarios IAM en esta cuenta.' },
    { id: 'cloudtrail', dominio: 'Cumplimiento', titulo: 'Registro de CloudTrail', descripcion: `${security.data.trails.filter((t) => t.isLogging).length} de ${security.data.trails.length} trails registrando en ${regionPrincipal}`, nivel: security.data.trails.some((t) => t.isLogging) ? 'correcto' : 'problema', recomendacion: 'Verificar el registro de eventos de CloudTrail en la cuenta.' },
    ...(security.data.findingsError ? [] : security.data.findings.map((f) => ({ id: f.id ?? f.title ?? 'finding', dominio: 'Cumplimiento' as const, titulo: f.title ?? 'Hallazgo Security Hub', descripcion: `${f.severity ?? 'Sin severidad'} · ${f.status ?? 'Sin estado'}`, nivel: (f.severity === 'CRITICAL' || f.severity === 'HIGH' ? 'problema' : 'revision') as ControlSeguridad['nivel'], recomendacion: 'Revisar el hallazgo en Security Hub.' }))),
  ] : [];

  const correctos = controlesAmbiente.filter((c) => c.nivel === 'correcto').length;
  const revisiones = controlesAmbiente.filter((c) => c.nivel === 'revision').length;
  const problemas = controlesAmbiente.filter((c) => c.nivel === 'problema').length;
  const total = controlesAmbiente.length;
  const pct = total ? Math.round((correctos / total) * 100) : 0;

  const ejecutarAuditoria = async () => {
    setAuditando(true);
    setAuditoriaCompletada(false);
    const ok = await security.refresh();
    setAuditando(false);
    setAuditoriaCompletada(ok);
  };

  const evaluarPolitica = async () => {
    if (!simUsuarioId || !simAccionId || !recursoArn) return;
    setResultadoSimulacion(null);
    try {
      const result = await api<AwsResponse<{ decision: string; missingContext: string[] }[]>>('/aws/iam/simulate', { method: 'POST', body: JSON.stringify({ principalArn: simUsuarioId, action: simAccionId, resourceArn: recursoArn }) });
      const item = result.data[0];
      setResultadoSimulacion({ permitido: item?.decision === 'allowed', motivo: `${item?.decision ?? 'Sin resultado'}${item?.missingContext?.length ? ` · Contexto faltante: ${item.missingContext.join(', ')}` : ''}` });
      setErrorSimulacion(null);
    } catch (error) { setErrorSimulacion(error instanceof Error ? error.message : String(error)); }
  };

  const controlesFiltrados = controlesAmbiente.filter((c) => {
    const coincideDominio = dominioActivo === 'Todos' || c.dominio === dominioActivo;
    const coincideNivel = filtroNivel === 'Todos' || c.nivel === filtroNivel;
    return coincideDominio && coincideNivel;
  });

  const badgeAmbiente = ambiente === 'Producción'
    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
    : ambiente === 'Staging'
    ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
    : 'bg-slate-500/10 text-slate-600 border-slate-500/20';

  return (
    <div className="space-y-8 animate-fade-in">
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4 mb-5">
          <div>
            <h2 className="text-lg font-bold text-ink flex items-center gap-2">
              <ShieldCheck size={20} className="text-blue-600" /> Postura de Seguridad & Auditoría Continua
              <InfoTooltip
                titulo="CIS AWS Foundations Benchmark"
                descripcion="Estándar de seguridad desarrollado por el Center for Internet Security. Define controles mínimos para asegurar cuentas AWS: MFA obligatorio, cifrado de volúmenes, rotación de credenciales y habilitación de CloudTrail en todas las regiones."
                size="md"
              />
            </h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <p className="text-xs text-muted">
                Controles puntuales consultados en IAM, CloudTrail y Security Hub
              </p>
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badgeAmbiente}`}>
                {ambiente}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-blue-500/10 text-blue-600 border-blue-500/20">
                {regionPrincipal}
              </span>
            </div>
          </div>

          <button
            onClick={ejecutarAuditoria}
            disabled={auditando}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:from-blue-500 hover:to-indigo-500 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Play size={14} /> {auditando ? 'Consultando AWS...' : 'Ejecutar Auditoría en Vivo'}
          </button>
        </div>

        {(auditando || security.loading) && <p className="mb-6 text-xs text-muted">Consultando IAM, CloudTrail y Security Hub...</p>}
        {security.error && <p className="mb-6 text-xs text-rose-600">{security.error}</p>}
        {security.data?.findingsError && <p className="mb-6 text-xs text-amber-600">Security Hub: {security.data.findingsError}</p>}

        {auditoriaCompletada && (
          <div className="mb-6 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-600 flex items-center gap-2">
            <CheckCircle2 size={16} /> Consulta completada para {regionPrincipal}. Se evaluaron {total} controles con datos disponibles.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-3">
            <ShieldCheck size={24} className="text-emerald-500 shrink-0" />
            <div>
              <p className="text-2xl font-extrabold text-ink">{correctos}</p>
              <p className="text-xs text-muted font-medium flex items-center gap-1">
                Controles Correctos
                <InfoTooltip titulo="Estado Correcto" descripcion="El control cumple completamente con el estándar CIS AWS. No requiere acción inmediata. Se monitorea periódicamente para detectar regresiones." />
              </p>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-center gap-3">
            <AlertTriangle size={24} className="text-amber-500 shrink-0" />
            <div>
              <p className="text-2xl font-extrabold text-ink">{revisiones}</p>
              <p className="text-xs text-muted font-medium flex items-center gap-1">
                Requieren Revisión
                <InfoTooltip titulo="Estado: Requiere Revisión" descripcion="El control presenta una desviación parcial del estándar. No es un fallo crítico pero debe resolverse antes de una auditoría formal o antes de pasar a producción." />
              </p>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 flex items-center gap-3">
            <XCircle size={24} className="text-rose-500 shrink-0" />
            <div>
              <p className="text-2xl font-extrabold text-ink">{problemas}</p>
              <p className="text-xs text-muted font-medium flex items-center gap-1">
                Problemas Detectados
                <InfoTooltip titulo="Estado: Problema Crítico" descripcion="El control incumple el estándar y representa un riesgo de seguridad activo. Requiere remediación inmediata. Puede impedir certificaciones SOC 2 o PCI-DSS." />
              </p>
            </div>
          </div>
        </div>

        <div className="w-full h-3 rounded-full bg-canvas overflow-hidden flex border border-line">
          <div className="bg-emerald-500 transition-all duration-700" style={{ width: `${total ? (correctos / total) * 100 : 0}%` }} />
          <div className="bg-amber-500 transition-all duration-700" style={{ width: `${total ? (revisiones / total) * 100 : 0}%` }} />
          <div className="bg-rose-500 transition-all duration-700" style={{ width: `${total ? (problemas / total) * 100 : 0}%` }} />
        </div>

        <div className="flex items-center justify-between text-xs text-muted mt-2">
          <span>{pct}% de controles observados correctos</span>
          <span>Total observado: {total} controles</span>
        </div>
      </Card>

      <Card className="p-6 border-blue-500/20 bg-gradient-to-br from-card to-blue-500/5">
        <div className="border-b border-line pb-4 mb-5">
          <div className="flex items-center gap-2">
            <Terminal size={20} className="text-blue-600" />
            <h3 className="text-base font-bold text-ink">Simulador de Políticas IAM</h3>
            <InfoTooltip
              titulo="IAM Policy Evaluation Engine"
              descripcion="AWS evalúa los permisos en este orden: 1) Denegar explícito (sobrescribe todo). 2) Permitir explícito (en la política del usuario/grupo/rol). 3) Denegar implícito (todo lo que no se permita explícitamente está denegado por defecto). Este es el Principio de Privilegio Mínimo (PoLP)."
              size="md"
            />
          </div>
          <p className="text-xs text-muted mt-0.5">
            Comprueba en vivo cómo el motor de autorización de AWS resuelve si una acción está permitida o denegada según el principio de privilegio mínimo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-bold text-ink mb-1.5">Principal (Identidad IAM)</label>
            <Select
              value={simUsuarioId}
              onChange={setSimUsuarioId}
              opciones={usuariosIAM.map((u) => ({
                value: u.id,
                label: u.nombre,
                sublabel: u.tipo,
                badge: u.tipo === 'Usuario' && u.mfa ? 'MFA' : undefined,
                badgeColor: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
              }))}
              className="w-full"
              ariaLabel="Seleccionar identidad IAM"
            />
          </div>

          <div>
            <label className="block font-bold text-ink mb-1.5">Acción de AWS a Evaluar</label>
            <Select
              value={simAccionId}
              onChange={setSimAccionId}
              opciones={accionesPrueba.map((a) => ({
                value: a,
                label: a,
              }))}
              className="w-full"
              buscable={true}
              ariaLabel="Seleccionar acción IAM a evaluar"
            />
          </div>

          <div>
            <label className="block font-bold text-ink mb-1.5">ARN del recurso</label>
            <input value={recursoArn} onChange={(e) => setRecursoArn(e.target.value)} className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-xs text-ink" aria-label="ARN del recurso" />
          </div>
          <div className="flex items-end">
            <button
              onClick={evaluarPolitica}
              disabled={!simUsuarioId}
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-2.5 text-xs font-bold text-white shadow-md hover:from-blue-500 hover:to-indigo-500 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowRight size={15} /> Evaluar Autorización
            </button>
          </div>
        </div>
        {errorSimulacion && <p className="mt-3 text-xs text-rose-600">{errorSimulacion}</p>}

        {resultadoSimulacion && (
          <div
            className={`mt-4 p-4 rounded-2xl border text-xs flex items-start gap-3 animate-fade-up ${
              resultadoSimulacion.permitido
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-800'
            }`}
          >
            {resultadoSimulacion.permitido ? (
              <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert size={20} className="text-rose-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold text-sm">
                Resultado de Evaluación: {resultadoSimulacion.permitido ? 'ALLOW (Permitido)' : 'EXPLICIT / IMPLICIT DENY (Denegado)'}
              </p>
              <p className="mt-1 leading-relaxed">{resultadoSimulacion.motivo}</p>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="border-b border-line pb-4 mb-6">
          <div className="flex items-center gap-2">
            <Lock size={20} className="text-blue-600" />
            <h3 className="text-base font-bold text-ink">Modelo de Responsabilidad Compartida de AWS</h3>
            <InfoTooltip
              titulo="Responsabilidad Compartida"
              descripcion="AWS es responsable de la infraestructura física (hardware, centros de datos, red troncal, hipervisor). El cliente es responsable de lo que despliega en esa infraestructura: OS, aplicaciones, datos, configuración IAM y cifrado. Ambas partes deben cumplir sus obligaciones para lograr seguridad end-to-end."
              size="md"
            />
          </div>
          <p className="text-xs text-muted mt-0.5">
            Comprende con precisión los límites de custodia entre el proveedor Cloud y tu organización.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <Cloud size={20} />
              <h4 className="text-sm font-bold uppercase tracking-wider">
                Seguridad DE la Nube (AWS)
              </h4>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              AWS es responsable de proteger la infraestructura global física y lógica que ejecuta todos los servicios de la nube.
            </p>

            <div className="space-y-2 text-xs">
              {[
                'Seguridad física y perimetral de Centros de Datos (guardias, biometría)',
                'Hardware de servidores bare-metal y unidades de almacenamiento',
                'Hipervisor de virtualización (AWS Nitro System)',
                'Red troncal submarina global y puntos de conexión regionales',
                'Servicios administrados (RDS OS, S3 redundancia, DynamoDB)',
              ].map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 bg-card p-2.5 rounded-xl border border-line">
                  <CheckCircle2 size={15} className="text-emerald-500 shrink-0 mt-0.5" />
                  <span className="text-ink font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-5 space-y-4">
            <div className="flex items-center gap-2 text-blue-600">
              <Server size={20} />
              <h4 className="text-sm font-bold uppercase tracking-wider">
                Seguridad EN la Nube (Cliente)
              </h4>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              El cliente conserva el control y responsabilidad sobre los datos, la configuración del sistema operativo y las políticas de acceso.
            </p>

            <div className="space-y-2 text-xs">
              {[
                'Cifrado de datos del cliente (en reposo con KMS y en tránsito con TLS)',
                'Gestión de identidades, credenciales y autenticación multifactor (IAM)',
                'Reglas de cortafuegos en Security Groups y Network ACLs',
                'Actualización y parchado del Sistema Operativo en instancias EC2',
                'Configuración de endpoints de VPC y permisos de buckets S3',
              ].map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 bg-card p-2.5 rounded-xl border border-line">
                  <ShieldCheck size={15} className="text-blue-600 shrink-0 mt-0.5" />
                  <span className="text-ink font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-ink">
              Matriz de Controles de Seguridad ({controlesFiltrados.length})
            </h3>
            <p className="text-xs text-muted">Indicadores derivados de respuestas AWS disponibles</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={dominioActivo}
              onChange={setDominioActivo}
              opciones={[
                { value: 'Todos', label: 'Todos los dominios' },
                ...dominios.map((d) => ({ value: d, label: d })),
              ]}
              anchoMinimo="200px"
              ariaLabel="Filtrar por dominio de seguridad"
            />

            <Select
              value={filtroNivel}
              onChange={setFiltroNivel}
              opciones={[
                { value: 'Todos', label: 'Todos los estados' },
                { value: 'correcto', label: 'Correcto', badge: '✓', badgeColor: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
                { value: 'revision', label: 'En revisión', badge: '⚠', badgeColor: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
                { value: 'problema', label: 'Problema', badge: '✗', badgeColor: 'bg-rose-500/10 text-rose-600 border-rose-500/20' },
              ]}
              anchoMinimo="160px"
              ariaLabel="Filtrar por nivel de severidad"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
          {controlesFiltrados.map((control) => (
            <SecurityCard key={control.id} control={control} />
          ))}
        </div>
      </div>

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line pb-4 mb-5">
          <div>
            <h3 className="text-base font-bold text-ink flex items-center gap-2">
              <Users size={18} className="text-blue-600" /> Identidades y Control de Acceso (AWS IAM)
            </h3>
            <p className="text-xs text-muted">
              Usuarios, grupos y roles que implementan el Principio de Mínimo Privilegio (PoLP)
            </p>
          </div>
          <span className="text-xs font-mono font-semibold text-emerald-600 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
            {security.data ? `${security.data.identities.length} usuarios · ${security.data.roles.length} roles` : 'Consultando IAM'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
          {usuariosIAM.map((u) => {
            const Icono = iconoTipo[u.tipo];
            return (
              <div
                key={u.id}
                className="rounded-2xl border border-line bg-canvas p-4 shadow-xs hover:border-blue-500/40 hover:shadow-md transition-all flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/10 text-blue-600">
                        <Icono size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-ink">{u.nombre}</p>
                        <p className="text-[11px] font-mono text-muted">{u.tipo}</p>
                      </div>
                    </div>

                    {u.tipo === 'Usuario' && <StatusBadge nivel={u.mfa ? 'correcto' : 'revision'} texto={u.mfa ? 'MFA Sí' : 'MFA No'} />}
                  </div>

                  <div className="mt-3 space-y-1">
                    <p className="text-[10px] text-muted uppercase tracking-wider font-semibold">
                      Políticas asignadas:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {u.politicas.map((p) => (
                        <span
                          key={p}
                          className="font-mono text-[10px] bg-card text-ink border border-line px-1.5 py-0.5 rounded"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-line/60 flex items-center justify-between text-xs text-muted">
                  <span>{u.ultimoAcceso}</span>
                  <span className="font-mono text-[10px] break-all">{u.arn}</span>
                </div>
              </div>
            );
          })}
        </div>
        {!usuariosIAM.length && !security.loading && <p className="text-xs text-muted">No hay identidades IAM en la respuesta.</p>}
      </Card>
    </div>
  );
}
