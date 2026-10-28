import React, { useState } from 'react';
import {
  KeyRound,
  Database,
  Code2,
  Network,
  Radar,
  CheckCircle2,
  AlertTriangle,
  CircleHelp,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Info,
  TrendingUp,
} from 'lucide-react';
import type { EvaluacionSeguridad } from '../../types/cloud';
import { securityAreas, controlNames } from '../../lib/securityPresentation';

export interface FivePillarsWorkspaceProps {
  assessment: EvaluacionSeguridad;
  initialArea?: string;
  onFinding: (id: string) => void;
  onCoverage: () => void;
  compact?: boolean;
}

const pillarMetadata: Record<
  string,
  {
    pillarNum: number;
    title: string;
    subTitle: string;
    description: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    accentColor: string;
    gradientBg: string;
    badgeColor: string;
    sampleServices: string[];
    bestPractices: string[];
  }
> = {
  identity: {
    pillarNum: 1,
    title: 'Identidad y Accesos (IAM)',
    subTitle: 'Control de accesos y credenciales',
    description:
      'Garantiza que solo identidades autorizadas y autenticadas accedan a los recursos mediante el principio de menor privilegio, autenticación multifactor (MFA) y rotación de claves.',
    icon: KeyRound,
    accentColor: '#6366F1',
    gradientBg: 'from-indigo-500/10 via-indigo-500/5 to-transparent',
    badgeColor: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
    sampleServices: ['iam', 'cognito', 'token-auth'],
    bestPractices: [
      'Habilitar MFA en cuentas administrativas y de acceso raíz.',
      'Eliminar credenciales fijas y usar roles temporales (IAM Roles / STS).',
      'Restringir políticas comodín (*) a recursos y acciones específicas.',
    ],
  },
  data: {
    pillarNum: 2,
    title: 'Protección de Datos & Secretos',
    subTitle: 'Cifrado y prevención de fugas',
    description:
      'Clasifica y protege los datos en reposo y en tránsito. Evita que claves de API, certificados o contraseñas queden expuestos en el código fuente o repositorios.',
    icon: Database,
    accentColor: '#10B981',
    gradientBg: 'from-emerald-500/10 via-emerald-500/5 to-transparent',
    badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    sampleServices: ['s3', 'rds', 'encryption'],
    bestPractices: [
      'Cifrar buckets S3 y volúmenes de base de datos con claves administradas (KMS).',
      'Nunca versionar archivos .env, tokens o certificados en el repositorio.',
      'Utilizar AWS Secrets Manager o Parameter Store para variables de producción.',
    ],
  },
  software: {
    pillarNum: 3,
    title: 'Aplicación & Dependencias (AppSec)',
    subTitle: 'Seguridad en código y bibliotecas',
    description:
      'Analiza la superficie del código fuente (SAST) y su cadena de suministro (SCA) para prevenir inyecciones SQL, deserialización insegura y CVEs en paquetes de terceros.',
    icon: Code2,
    accentColor: '#8B5CF6',
    gradientBg: 'from-purple-500/10 via-purple-500/5 to-transparent',
    badgeColor: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    sampleServices: ['code', 'images', 'sast'],
    bestPractices: [
      'Mantener dependencias actualizadas y libres de vulnerabilidades críticas conocidas.',
      'Parametrizar todas las consultas a bases de datos para impedir SQL Injection.',
      'Escaneo continuo de imágenes base de contenedor para evitar CVEs heredados.',
    ],
  },
  configuration: {
    pillarNum: 4,
    title: 'Infraestructura & Redes',
    subTitle: 'Infraestructura declarada e IaC segura',
    description:
      'Asegura que las declaraciones de Terraform, Dockerfiles y configuraciones de red bloqueen accesos públicos indiscriminados (0.0.0.0/0) y eviten contenedores en modo root.',
    icon: Network,
    accentColor: '#F59E0B',
    gradientBg: 'from-amber-500/10 via-amber-500/5 to-transparent',
    badgeColor: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    sampleServices: ['vpc', 'terraform', 'docker'],
    bestPractices: [
      'No exponer puertos de administración (SSH 22, RDP 3389) hacia Internet.',
      'Configurar los contenedores Docker para correr bajo un usuario sin privilegios.',
      'Validar plantillas de Terraform o CloudFormation con herramientas de escaneo antes de desplegar.',
    ],
  },
  detection: {
    pillarNum: 5,
    title: 'Detección & Auditoría',
    subTitle: 'Trazabilidad y respuesta ante incidentes',
    description:
      'Captura registros de auditoría y eventos del sistema (CloudTrail, VPC Flow Logs, CloudWatch) para alertar de forma temprana ante anomalías o accesos no autorizados.',
    icon: Radar,
    accentColor: '#06B6D4',
    gradientBg: 'from-cyan-500/10 via-cyan-500/5 to-transparent',
    badgeColor: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    sampleServices: ['cloudtrail', 'cloudwatch', 'security-hub'],
    bestPractices: [
      'Activar AWS CloudTrail en todas las regiones con validación de integridad.',
      'Centralizar registros en un bucket S3 protegido contra eliminación accidental.',
      'Configurar alertas automáticas ante cambios en grupos de seguridad o accesos root.',
    ],
  },
};

export function computePillarScore(area: ReturnType<typeof securityAreas>[number]) {
  // Check if original dimension has a valid score
  const measuredDimension = area.dimensions.find((dim) => typeof dim.score === 'number' && dim.score !== null);
  if (measuredDimension && typeof measuredDimension.score === 'number') {
    return Math.max(0, Math.min(100, Math.round(measuredDimension.score)));
  }

  // If no dimension score, compute intuitive posture score from controls & findings
  const totalControls = area.controls.length;
  if (totalControls === 0 && area.findings.length === 0) {
    return null; // Not enough data
  }

  let base = 100;
  base -= area.critical * 25;
  base -= area.high * 15;
  base -= area.failed * 10;
  base -= area.unverified * 3;

  if (totalControls > 0) {
    const passRatio = area.passed / totalControls;
    base = Math.round(base * 0.5 + passRatio * 100 * 0.5);
  }

  return Math.max(0, Math.min(100, base));
}

export function FivePillarsWorkspace({
  assessment,
  initialArea = 'identity',
  onFinding,
  onCoverage,
  compact = false,
}: FivePillarsWorkspaceProps) {
  const [activeAreaId, setActiveAreaId] = useState(initialArea);
  const areas = securityAreas(assessment);

  const activeArea = areas.find((item) => item.id === activeAreaId) ?? areas[0];
  const meta = pillarMetadata[activeArea.id] || pillarMetadata.identity;

  return (
    <section aria-label="Los 5 Pilares de Seguridad Cloud" className="space-y-6">
      {/* Header Explaining the 5 Pillars Concept */}
      {!compact && (
        <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-r from-card via-card to-canvas p-6 sm:p-7 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-500">
                <Sparkles size={13} />
                <span>Marco de Excelencia en Seguridad CloudOps</span>
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-ink sm:text-3xl">
                Los 5 Pilares Fundamentales de Seguridad
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                La seguridad no es un número aislado: se sostiene sobre 5 pilares independientes (inspirados en el{' '}
                <strong className="text-ink">AWS Well-Architected Security Pillar</strong> y{' '}
                <strong className="text-ink">CIS Benchmarks</strong>). Un fallo grave en un solo pilar compromete la
                postura de todo el sistema.
              </p>
            </div>

            {/* Target benchmark pill */}
            <div className="shrink-0 rounded-xl border border-line bg-canvas/60 p-4 text-center lg:text-right">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Meta de Cumplimiento
              </span>
              <div className="mt-1 flex items-center justify-center lg:justify-end gap-2 text-xl font-black text-emerald-500">
                <ShieldCheck size={22} />
                <span>90% + en los 5 pilares</span>
              </div>
              <p className="mt-1 text-[11px] text-muted">Nivel recomendado para entornos productivos</p>
            </div>
          </div>
        </div>
      )}

      {/* 5 Pillars Selector Grid */}
      <div
        className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5"
        role="tablist"
        aria-label="Seleccionar pilar de seguridad"
      >
        {areas.map((area) => {
          const areaMeta = pillarMetadata[area.id] || pillarMetadata.identity;
          const Icon = areaMeta.icon;
          const score = computePillarScore(area);
          const isSelected = activeAreaId === area.id;

          const statusColor =
            area.critical > 0
              ? 'text-rose-500 bg-rose-500/10 border-rose-500/20'
              : area.high > 0 || area.failed > 0
              ? 'text-amber-500 bg-amber-500/10 border-amber-500/20'
              : area.passed > 0
              ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
              : 'text-muted bg-slate-500/10 border-slate-500/20';

          return (
            <button
              key={area.id}
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveAreaId(area.id)}
              className={`group relative flex flex-col justify-between rounded-2xl border p-4 text-left transition-all duration-200 cursor-pointer ${
                isSelected
                  ? 'border-blue-500 bg-card shadow-md ring-2 ring-blue-500/20'
                  : 'border-line bg-card/60 hover:bg-card hover:border-line-2 hover:shadow-xs'
              }`}
            >
              {/* Pillar Number Badge */}
              <div className="flex items-center justify-between gap-2">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl shadow-xs"
                  style={{ backgroundColor: `${areaMeta.accentColor}18`, color: areaMeta.accentColor }}
                >
                  <Icon size={19} />
                </div>
                <span className="text-[11px] font-bold text-muted">Pilar {areaMeta.pillarNum}</span>
              </div>

              {/* Title & Status */}
              <div className="mt-3">
                <strong className="block text-sm font-black text-ink group-hover:text-blue-500 transition-colors">
                  {area.label}
                </strong>
                <p className="mt-0.5 text-[11px] text-muted line-clamp-1">{areaMeta.subTitle}</p>
              </div>

              {/* Score Gauge / Percentage */}
              <div className="mt-4 pt-3 border-t border-line/60">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-[11px] font-semibold text-muted">Nivel de Salud</span>
                  <span className="text-sm font-black tabular-nums text-ink">
                    {score !== null ? `${score}%` : '—'}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${score ?? 0}%`,
                      backgroundColor:
                        score === null
                          ? '#94a3b8'
                          : score >= 85
                          ? '#10b981'
                          : score >= 60
                          ? '#f59e0b'
                          : '#f43f5e',
                    }}
                  />
                </div>

                {/* Status chip */}
                <div className="mt-2.5 flex items-center justify-between gap-1">
                  <span
                    className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${statusColor}`}
                  >
                    {area.critical > 0 ? (
                      <AlertTriangle size={10} />
                    ) : area.passed > 0 && area.failed === 0 ? (
                      <CheckCircle2 size={10} />
                    ) : (
                      <CircleHelp size={10} />
                    )}
                    {area.status}
                  </span>
                  <span className="text-[10px] text-muted tabular-nums">
                    {area.passed}/{area.controls.length || 0} ok
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Pillar Detailed Workspace */}
      <div className="rounded-2xl border border-line bg-card p-5 sm:p-7 shadow-xs">
        {/* Banner of active pillar */}
        <div
          className={`rounded-2xl border border-line bg-gradient-to-br ${meta.gradientBg} p-5 sm:p-6 mb-6`}
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm"
                style={{ backgroundColor: `${meta.accentColor}25`, color: meta.accentColor }}
              >
                {React.createElement(meta.icon, { size: 26 })}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-md px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-white"
                    style={{ backgroundColor: meta.accentColor }}
                  >
                    Pilar #{meta.pillarNum}
                  </span>
                  <h3 className="text-xl font-black text-ink">{meta.title}</h3>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted max-w-2xl">
                  {meta.description}
                </p>
              </div>
            </div>

            <button
              onClick={onCoverage}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line bg-card/80 px-3.5 py-2 text-xs font-bold text-ink hover:text-blue-500 hover:border-blue-500/40 transition-colors shadow-xs"
            >
              <Info size={14} className="text-blue-500" />
              <span>Ver cobertura técnica de pruebas</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {/* Quick Metrics Bar for this Pillar */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-line/60 pt-4">
            <div className="rounded-xl border border-line/60 bg-card/60 p-3">
              <span className="text-[11px] font-semibold text-muted">Controles Sin Fallo</span>
              <div className="mt-1 flex items-center gap-1.5 text-lg font-black text-emerald-500">
                <CheckCircle2 size={17} />
                <span>{activeArea.passed}</span>
              </div>
            </div>
            <div className="rounded-xl border border-line/60 bg-card/60 p-3">
              <span className="text-[11px] font-semibold text-muted">Fallos Detectados</span>
              <div className="mt-1 flex items-center gap-1.5 text-lg font-black text-rose-500">
                <AlertTriangle size={17} />
                <span>{activeArea.failed}</span>
              </div>
            </div>
            <div className="rounded-xl border border-line/60 bg-card/60 p-3">
              <span className="text-[11px] font-semibold text-muted">Alertas Críticas / Altas</span>
              <div className="mt-1 flex items-center gap-1.5 text-lg font-black text-amber-500">
                <ShieldAlert size={17} />
                <span>
                  {activeArea.critical} críticas · {activeArea.high} altas
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-line/60 bg-card/60 p-3">
              <span className="text-[11px] font-semibold text-muted">Por Verificar / Parcial</span>
              <div className="mt-1 flex items-center gap-1.5 text-lg font-black text-muted">
                <CircleHelp size={17} />
                <span>{activeArea.unverified}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Two-Column Layout: Controls Evaluated vs Active Findings */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left Column: Controles Evaluados */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h4 className="text-sm font-bold text-ink">Comprobaciones de Seguridad en este Pilar</h4>
                <p className="text-xs text-muted">Controles ejecutados por los motores de escaneo</p>
              </div>
              <span className="rounded-lg bg-canvas px-2.5 py-1 text-xs font-bold text-muted tabular-nums">
                {activeArea.controls.length} comprobaciones
              </span>
            </div>

            {activeArea.controls.length ? (
              <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                {activeArea.controls.map((control) => {
                  const isPass = control.state === 'pass';
                  const isFail = control.state === 'fail';

                  return (
                    <div
                      key={control.id}
                      className={`rounded-xl border p-3.5 transition-colors ${
                        isFail
                          ? 'border-rose-500/30 bg-rose-500/5'
                          : isPass
                          ? 'border-emerald-500/20 bg-emerald-500/5'
                          : 'border-line bg-canvas/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          {isPass ? (
                            <CheckCircle2 size={16} className="mt-0.5 text-emerald-500 shrink-0" />
                          ) : isFail ? (
                            <AlertTriangle size={16} className="mt-0.5 text-rose-500 shrink-0" />
                          ) : (
                            <CircleHelp size={16} className="mt-0.5 text-amber-500 shrink-0" />
                          )}
                          <div>
                            <strong className="text-xs font-bold text-ink leading-snug">
                              {control.label}
                            </strong>
                            <p className="mt-1 text-xs leading-relaxed text-muted">{control.detail}</p>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                            isPass
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : isFail
                              ? 'bg-rose-500/15 text-rose-400'
                              : 'bg-amber-500/15 text-amber-400'
                          }`}
                        >
                          {controlNames[control.state] ?? control.state}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-canvas/30 p-8 text-center">
                <CircleHelp size={28} className="mx-auto text-muted mb-2" />
                <p className="text-sm font-semibold text-ink">Sin comprobaciones directas</p>
                <p className="mt-1 text-xs text-muted max-w-sm mx-auto">
                  Esta evaluación no incluyó reglas específicas para esta área. Ejecuta un análisis completo
                  para abarcar todos los controles.
                </p>
              </div>
            )}
          </div>

          {/* Right Column: Hallazgos que Debes Corregir */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h4 className="text-sm font-bold text-ink">Vulnerabilidades y Riesgos a Subsanar</h4>
                <p className="text-xs text-muted">Alertas que restan puntuación en este pilar</p>
              </div>
              <span
                className={`rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums ${
                  activeArea.findings.length
                    ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                    : 'bg-canvas text-muted'
                }`}
              >
                {activeArea.findings.length} hallazgos
              </span>
            </div>

            {activeArea.findings.length ? (
              <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                {activeArea.findings.map((finding) => (
                  <button
                    key={finding.id}
                    onClick={() => onFinding(finding.id)}
                    className="w-full text-left rounded-xl border border-line bg-card p-3.5 hover:border-blue-500/50 hover:bg-canvas/60 transition-all cursor-pointer group shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${
                              finding.severity === 'CRITICAL'
                                ? 'bg-rose-500/20 text-rose-500'
                                : finding.severity === 'HIGH'
                                ? 'bg-orange-500/20 text-orange-500'
                                : 'bg-amber-500/20 text-amber-500'
                            }`}
                          >
                            {finding.severity}
                          </span>
                          <span className="text-[11px] font-mono text-muted truncate max-w-[200px]">
                            {finding.resource || 'Configuración general'}
                          </span>
                        </div>
                        <strong className="mt-1.5 block text-xs font-bold text-ink group-hover:text-blue-500 transition-colors">
                          {finding.title}
                        </strong>
                        <p className="mt-1 text-xs text-muted line-clamp-2">{finding.recommendation}</p>
                      </div>

                      <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-500 shrink-0 group-hover:translate-x-0.5 transition-transform">
                        <span>Solucionar</span>
                        <ArrowRight size={13} />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center">
                <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                <h5 className="text-sm font-bold text-ink">Sin alertas puntuables registradas</h5>
                <p className="mt-1 text-xs leading-relaxed text-muted max-w-sm mx-auto">
                  {activeArea.unverified || !activeArea.controls.length
                    ? 'No se observaron fallos en lo comprobado, pero aún existen verificaciones pendientes.'
                    : 'Todos los controles comprobados pasaron satisfactoriamente en este pilar.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Pillar Best Practices & Target Guidance */}
        <div className="mt-6 rounded-xl border border-line bg-canvas/40 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted mb-3">
            <TrendingUp size={15} className="text-blue-500" />
            <span>Cómo alcanzar el 100% de cumplimiento en este pilar</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {meta.bestPractices.map((practice, index) => (
              <div key={index} className="rounded-lg border border-line bg-card p-3 text-xs leading-relaxed">
                <div className="flex items-center gap-1.5 font-bold text-ink mb-1">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500/20 text-[10px] text-blue-500">
                    {index + 1}
                  </span>
                  <span>Acción recomendada</span>
                </div>
                <p className="text-muted">{practice}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
