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
  Copy,
  Check,
  Eye,
  Server,
  Cloud,
  Terminal,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { controlesSeguridad, usuariosIAM } from '../data/securityChecks';
import { SecurityCard } from '../components/SecurityCard';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { InfoTooltip } from '../components/ui/InfoTooltip';
import { Select } from '../components/ui/Select';
import type { ControlSeguridad, UsuarioIAM } from '../types/cloud';
import { useCloud } from '../context/CloudContext';

const dominios: ControlSeguridad['dominio'][] = [
  'Responsabilidad compartida',
  'Gestión de identidades (IAM)',
  'Protección de la cuenta',
  'Protección de datos',
  'Cumplimiento',
];

const iconoTipo = { Usuario: User, Grupo: Users, Rol: Key } as const;

const accionesPrueba = [
  { id: 's3:GetObject', label: 's3:GetObject (Leer objetos)', permitidos: ['usr-1', 'usr-2', 'rol-1'] },
  { id: 's3:DeleteBucket', label: 's3:DeleteBucket (Eliminar bucket)', permitidos: ['usr-1'] },
  { id: 'ec2:RunInstances', label: 'ec2:RunInstances (Lanzar instancias)', permitidos: ['usr-1', 'grp-1'] },
  { id: 'ec2:TerminateInstances', label: 'ec2:TerminateInstances (Apagar flota)', permitidos: ['usr-1'] },
  { id: 'rds:CreateDBSnapshot', label: 'rds:CreateDBSnapshot (Backup BD)', permitidos: ['usr-1', 'usr-2'] },
  { id: 'iam:CreateUser', label: 'iam:CreateUser (Crear credenciales)', permitidos: ['usr-1'] },
];

export default function Security() {
  const { ambiente, regionPrincipal } = useCloud();
  const [dominioActivo, setDominioActivo] = useState<string>('Todos');
  const [filtroNivel, setFiltroNivel] = useState<string>('Todos');
  const [auditando, setAuditando] = useState(false);
  const [progresoAuditoria, setProgresoAuditoria] = useState(0);
  const [auditoriaCompletada, setAuditoriaCompletada] = useState(false);
  const [politicaSeleccionada, setPoliticaSeleccionada] = useState<UsuarioIAM | null>(null);
  const [copiado, setCopiado] = useState(false);

  const [simUsuarioId, setSimUsuarioId] = useState<string>('usr-2');
  const [simAccionId, setSimAccionId] = useState<string>('ec2:TerminateInstances');
  const [resultadoSimulacion, setResultadoSimulacion] = useState<{ permitido: boolean; motivo: string } | null>(null);

  const controlesAmbiente = controlesSeguridad.map((c) => {
    if (ambiente === 'Sandbox') {
      if (c.nivel === 'correcto' && (
        c.dominio === 'Protección de la cuenta' || c.dominio === 'Cumplimiento'
      )) return { ...c, nivel: 'revision' as const };
    } else if (ambiente === 'Staging') {
      if (c.nivel === 'correcto' && c.dominio === 'Cumplimiento') {
        return { ...c, nivel: 'revision' as const };
      }
    }
    return c;
  });

  const correctos = controlesAmbiente.filter((c) => c.nivel === 'correcto').length;
  const revisiones = controlesAmbiente.filter((c) => c.nivel === 'revision').length;
  const problemas = controlesAmbiente.filter((c) => c.nivel === 'problema').length;
  const total = controlesAmbiente.length;
  const pct = Math.round((correctos / total) * 100);

  const ejecutarAuditoria = () => {
    setAuditando(true);
    setProgresoAuditoria(0);
    setAuditoriaCompletada(false);

    const intervalo = setInterval(() => {
      setProgresoAuditoria((prev) => {
        if (prev >= 100) {
          clearInterval(intervalo);
          setAuditando(false);
          setAuditoriaCompletada(true);
          return 100;
        }
        return prev + 25;
      });
    }, 300);
  };

  const copiarAlPortapapeles = (texto: string) => {
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const evaluarPolitica = () => {
    const accion = accionesPrueba.find((a) => a.id === simAccionId);
    const usuario = usuariosIAM.find((u) => u.id === simUsuarioId);
    if (!accion || !usuario) return;

    const permitido = accion.permitidos.includes(usuario.id);
    setResultadoSimulacion({
      permitido,
      motivo: permitido
        ? `Permitido por directiva explícita en las políticas asignadas a ${usuario.nombre}.`
        : `DENEGADO (Implicit Deny): ${usuario.nombre} no cuenta con permisos para ejecutar ${simAccionId}. Principio de Privilegio Mínimo aplicado.`,
    });
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
                Evaluación automatizada alineada a CIS AWS Foundations Benchmark y AWS Well-Architected Pillar
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
            <Play size={14} /> {auditando ? `Escaneando (${progresoAuditoria}%)...` : 'Ejecutar Auditoría en Vivo'}
          </button>
        </div>

        {auditando && (
          <div className="mb-6 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Inspeccionando políticas IAM, cifrado KMS y Security Groups...</span>
              <span className="font-mono font-bold text-blue-600">{progresoAuditoria}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-canvas overflow-hidden border border-line">
              <div
                className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                style={{ width: `${progresoAuditoria}%` }}
              />
            </div>
          </div>
        )}

        {auditoriaCompletada && (
          <div className="mb-6 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-600 flex items-center gap-2">
            <CheckCircle2 size={16} /> ¡Auditoría completada exitosamente! Se verificaron los 12 controles de seguridad en todas las regiones.
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
          <div className="bg-emerald-500 transition-all duration-700" style={{ width: `${(correctos / total) * 100}%` }} />
          <div className="bg-amber-500 transition-all duration-700" style={{ width: `${(revisiones / total) * 100}%` }} />
          <div className="bg-rose-500 transition-all duration-700" style={{ width: `${(problemas / total) * 100}%` }} />
        </div>

        <div className="flex items-center justify-between text-xs text-muted mt-2">
          <span>{pct}% de cumplimiento global</span>
          <span>Total evaluado: {total} directivas</span>
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
                badge: u.mfa ? 'MFA' : undefined,
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
                value: a.id,
                label: a.id,
                sublabel: a.label.split('(')[1]?.replace(')', '') ?? '',
              }))}
              className="w-full"
              buscable={true}
              ariaLabel="Seleccionar acción IAM a evaluar"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={evaluarPolitica}
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-2.5 text-xs font-bold text-white shadow-md hover:from-blue-500 hover:to-indigo-500 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowRight size={15} /> Evaluar Autorización
            </button>
          </div>
        </div>

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
            <p className="text-xs text-muted">Directivas auditadas en tiempo de ejecución</p>
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
            MFA Activo en Cuentas Clave
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

                    <StatusBadge
                      nivel={u.mfa ? 'correcto' : 'revision'}
                      texto={u.mfa ? 'MFA Sí' : 'MFA No'}
                    />
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
                  {u.politicaJson && (
                    <button
                      onClick={() => setPoliticaSeleccionada(u)}
                      className="text-blue-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Eye size={13} /> Ver JSON
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Modal
        abierto={!!politicaSeleccionada}
        onCerrar={() => setPoliticaSeleccionada(null)}
        titulo={`Política IAM JSON · ${politicaSeleccionada?.nombre}`}
        subtitulo={politicaSeleccionada?.arn}
        tamano="lg"
      >
        {politicaSeleccionada?.politicaJson && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted font-medium">Documento de Política de Permisos IAM</span>
              <button
                onClick={() => copiarAlPortapapeles(politicaSeleccionada.politicaJson!)}
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
              >
                {copiado ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                {copiado ? '¡Copiado!' : 'Copiar JSON'}
              </button>
            </div>

            <pre className="p-4 rounded-xl bg-slate-950 text-emerald-400 font-mono text-xs overflow-x-auto border border-slate-800 shadow-inner">
              {politicaSeleccionada.politicaJson}
            </pre>
          </div>
        )}
      </Modal>
    </div>
  );
}
