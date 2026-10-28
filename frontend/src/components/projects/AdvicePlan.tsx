import { useState } from 'react';
import {
  ArrowRight,
  CheckCheck,
  UsersRound,
  Cloud,
  ListChecks,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Copy,
  Check,
  Zap,
  FileCode2,
} from 'lucide-react';
import type { AssessmentAdvice } from '../../types/cloud';
import { TechIcon } from '../ui/TechIcon';

const services: Record<string, string> = {
  postgres: 'Amazon RDS for PostgreSQL',
  containers: 'Amazon ECR + ECS Fargate',
  cache: 'Amazon ElastiCache',
  workers: 'Amazon SQS + ECS workers',
  frontend: 'Amazon S3 + CloudFront',
  email: 'Amazon SES',
  identity: 'Amazon Cognito / IdP OIDC',
  telemetry: 'Amazon CloudWatch',
};

const dimensions: Record<string, string> = {
  identity: 'Accesos e IAM',
  data: 'Datos y Secretos',
  application: 'Código y SAST',
  dependencies: 'Dependencias e Imágenes',
  configuration: 'Infraestructura y Red',
  detection: 'Detección y Auditoría',
};

// Ready-to-use remediation snippets tailored to common security actions
function getSampleSnippet(action: string): { lang: string; title: string; code: string } | null {
  const text = action.toLowerCase();
  if (text.includes('root') || text.includes('docker') || text.includes('usuario')) {
    return {
      lang: 'dockerfile',
      title: 'Dockerfile: Usuario sin privilegios',
      code: `# Crear usuario seguro no-root\nRUN addgroup --system --gid 1001 appgroup && \\\n    adduser --system --uid 1001 --ingroup appgroup appuser\n\n# Establecer permisos y cambiar usuario\nUSER appuser\nWORKDIR /app`,
    };
  }
  if (text.includes('cifrado') || text.includes('s3') || text.includes('storage') || text.includes('almacenamiento')) {
    return {
      lang: 'hcl',
      title: 'Terraform: Cifrado S3 con clave KMS',
      code: `resource "aws_s3_bucket_server_side_encryption_configuration" "secure_s3" {\n  bucket = aws_s3_bucket.main.id\n\n  rule {\n    apply_server_side_encryption_by_default {\n      sse_algorithm     = "aws:kms"\n      kms_master_key_id = aws_kms_key.app_key.arn\n    }\n    bucket_key_enabled = true\n  }\n}`,
    };
  }
  if (text.includes('iam') || text.includes('permiso') || text.includes('wildcard') || text.includes('politica')) {
    return {
      lang: 'json',
      title: 'IAM Policy: Menor privilegio sin comodines (*)',
      code: `{\n  "Version": "2012-10-17",\n  "Statement": [\n    {\n      "Sid": "RestrictedAppAccess",\n      "Effect": "Allow",\n      "Action": ["s3:GetObject", "s3:PutObject"],\n      "Resource": "arn:aws:s3:::mi-bucket-app/data/*"\n    }\n  ]\n}`,
    };
  }
  if (text.includes('dependencia') || text.includes('cve') || text.includes('actualizar') || text.includes('biblioteca')) {
    return {
      lang: 'bash',
      title: 'CLI: Auditoría y actualización segura',
      code: `# Para proyectos Node.js / NPM\nnpm audit fix\n\n# Para proyectos Python / UV o Poetry\nuv lock --upgrade`,
    };
  }
  return null;
}

export function AdvicePlan({ advice, onFinding }: { advice: AssessmentAdvice; onFinding?: (id: string) => void }) {
  const [section, setSection] = useState<'priorities' | 'architecture' | 'verification' | 'simulator'>('priorities');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [selectedPlanItems, setSelectedPlanItems] = useState<Set<number>>(() => {
    return new Set(advice.content.priorities.map((_, i) => i));
  });

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (advice.stale) {
    return (
      <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 text-sm text-muted">
        <strong className="text-amber-500 font-bold block mb-1">Plan guardado desactualizado</strong>
        El plan corresponde a una versión anterior de la evidencia o del contexto de análisis. Genera un plan
        actualizado antes de revisarlo; esta versión no se publica en informes.
      </div>
    );
  }

  // Calculate simulated score gain
  const totalPriorities = advice.content.priorities.length;
  const selectedCount = selectedPlanItems.size;
  const projectedGain = selectedCount * 4; // Each implemented priority grants ~4 pts

  const toggleItem = (idx: number) => {
    setSelectedPlanItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="mt-4 space-y-6">
      {/* 1. Header Banner of AI Advice */}
      <div className="relative overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 via-card to-card p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 text-violet-500">
              <Sparkles size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-xs font-black uppercase tracking-wider text-violet-500">
                  {advice.model} · Copiloto de Seguridad
                </span>
                <span className="text-[11px] font-bold text-muted">
                  {advice.state === 'approved'
                    ? '✓ Aprobado para informes'
                    : advice.state === 'draft'
                    ? 'Borrador editable'
                    : 'Rechazado'}
                </span>
              </div>
              <h3 className="mt-1 text-base font-black text-ink">Diagnóstico y Plan de Remediación Inteligente</h3>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-card/60 px-3 py-2 text-right shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Impacto Proyectado</span>
            <div className="flex items-center justify-end gap-1 text-emerald-500 font-black text-base">
              <TrendingUp size={16} />
              <span>+{totalPriorities * 4} pts en Seguridad</span>
            </div>
          </div>
        </div>

        <p className="mt-3.5 whitespace-pre-wrap text-xs sm:text-sm leading-relaxed text-ink/90">
          {advice.content.summary}
        </p>
      </div>

      {/* 2. Interactive Simulator Banner */}
      <div className="rounded-2xl border border-line bg-canvas/40 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
              <Zap size={18} />
            </div>
            <div>
              <strong className="block text-xs font-bold text-ink">
                Simulador de Postura ("What-If"): {selectedCount} de {totalPriorities} correcciones seleccionadas
              </strong>
              <p className="text-[11px] text-muted">
                Marca o desmarca acciones para proyectar el incremento de tu índice de seguridad.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Mejora Estimada</span>
              <div className="text-sm font-black text-emerald-500 tabular-nums">+{projectedGain} puntos</div>
            </div>
            <div className="h-8 w-px bg-line" />
            <button
              onClick={() => {
                if (selectedPlanItems.size === totalPriorities) setSelectedPlanItems(new Set());
                else setSelectedPlanItems(new Set(advice.content.priorities.map((_, i) => i)));
              }}
              className="rounded-lg border border-line bg-card px-2.5 py-1 text-xs font-bold text-ink hover:text-blue-500 cursor-pointer"
            >
              {selectedPlanItems.size === totalPriorities ? 'Desmarcar todo' : 'Seleccionar todo'}
            </button>
          </div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Secciones del plan IA">
        {[
          { id: 'priorities', label: `Plan de Corrección (${advice.content.priorities.length})`, icon: ListChecks },
          { id: 'architecture', label: `Modernización AWS (${advice.content.architecture?.length ?? 0})`, icon: Cloud },
          { id: 'verification', label: `Verificaciones Faltantes (${advice.content.nextChecks?.length ?? 0})`, icon: ShieldCheck },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={section === id}
            onClick={() => setSection(id as typeof section)}
            className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-bold transition-all cursor-pointer ${
              section === id
                ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'border-line bg-card text-muted hover:text-ink hover:border-line-2'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* 4. Tab 1: Priorities / Phased Remediation Plan */}
      {section === 'priorities' && (
        <div className="space-y-4">
          {advice.content.priorities.map((priority, index) => {
            const isSelected = selectedPlanItems.has(index);
            const snippet = getSampleSnippet(priority.action);

            const urgencyBadge =
              priority.urgency === 'immediate'
                ? { label: 'Fase 1: Inmediata (24-48h)', color: 'bg-rose-500/15 text-rose-500 border-rose-500/30' }
                : priority.urgency === 'planned'
                ? { label: 'Fase 2: Planificada (1-2 sem)', color: 'bg-amber-500/15 text-amber-500 border-amber-500/30' }
                : { label: 'Fase 3: Verificación', color: 'bg-blue-500/15 text-blue-500 border-blue-500/30' };

            return (
              <div
                key={index}
                className={`rounded-2xl border p-5 transition-all ${
                  isSelected ? 'border-line bg-card shadow-xs' : 'border-line/60 bg-canvas/30 opacity-60'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label="Incluir en simulación"
                      checked={isSelected}
                      onChange={() => toggleItem(index)}
                      className="mt-1 h-4 w-4 rounded-md border-line text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[11px] font-black text-white">
                          {index + 1}
                        </span>
                        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${urgencyBadge.color}`}>
                          {urgencyBadge.label}
                        </span>
                        {priority.owner && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                            <UsersRound size={12} />
                            <span>Responsable: <strong className="text-ink">{priority.owner}</strong></span>
                          </span>
                        )}
                      </div>

                      <h4 className="mt-2 text-sm font-bold text-ink">{priority.action}</h4>
                    </div>
                  </div>

                  <span className="shrink-0 text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-lg">
                    +4 pts proyectados
                  </span>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-muted pl-7">
                  {priority.explanation}
                </p>

                {/* Verification Guidance */}
                {priority.verification && (
                  <div className="mt-3.5 flex items-start gap-2.5 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs ml-7">
                    <CheckCheck size={16} className="mt-0.5 text-blue-500 shrink-0" />
                    <div>
                      <strong className="font-bold text-ink">Criterio de Validación:</strong>
                      <p className="mt-0.5 text-muted leading-relaxed">{priority.verification}</p>
                    </div>
                  </div>
                )}

                {/* Code / Configuration Snippet if applicable */}
                {snippet && (
                  <div className="mt-3.5 ml-7 rounded-xl border border-line bg-canvas/70 overflow-hidden">
                    <div className="flex items-center justify-between px-3.5 py-2 border-b border-line bg-card/60">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted">
                        <FileCode2 size={13} className="text-blue-500" />
                        {snippet.title}
                      </span>
                      <button
                        onClick={() => handleCopy(snippet.code, index)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-500 hover:text-blue-600 cursor-pointer"
                      >
                        {copiedIndex === index ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedIndex === index ? '¡Copiado!' : 'Copiar código'}</span>
                      </button>
                    </div>
                    <pre className="p-3 text-[11px] font-mono overflow-x-auto text-ink leading-relaxed">
                      <code>{snippet.code}</code>
                    </pre>
                  </div>
                )}

                {/* Evidence links */}
                {priority.findingRefs.length > 0 && (
                  <div className="mt-3.5 flex flex-wrap items-center gap-2 ml-7 pt-3 border-t border-line/60">
                    <span className="text-[11px] font-semibold text-muted">Evidencias vinculadas:</span>
                    {priority.findingRefs.map((ref) => {
                      const findingId = advice.content.references[ref];
                      return (
                        <button
                          key={ref}
                          disabled={!onFinding || !findingId}
                          onClick={() => onFinding?.(findingId)}
                          className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:border-blue-500/40 disabled:opacity-40 cursor-pointer"
                        >
                          <span>Hallazgo #{ref}</span>
                          <ArrowRight size={11} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Tab 2: Architecture Modernization with AWS */}
      {section === 'architecture' && (
        <div className="space-y-4">
          {advice.content.architecture?.length ? (
            advice.content.architecture.map((option, index) => {
              const serviceTitle = services[option.serviceKey] ?? option.serviceKey;

              return (
                <div key={index} className="rounded-2xl border border-line bg-card p-5 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <TechIcon name={option.serviceKey} size={28} showBadge />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-bold text-blue-500">
                            Modernización Cloud
                          </span>
                          <span className="text-xs text-muted">
                            Basado en {option.componentRefs.join(', ')}
                          </span>
                        </div>
                        <h4 className="mt-1.5 text-base font-bold text-ink">{serviceTitle}</h4>
                      </div>
                    </div>
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-muted">{option.rationale}</p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-line bg-canvas/40 p-3 text-xs">
                      <strong className="font-bold text-ink">Contrapartida y Costo:</strong>
                      <p className="mt-1 text-muted leading-relaxed">{option.tradeoff}</p>
                    </div>

                    <div className="rounded-xl border border-line bg-canvas/40 p-3 text-xs">
                      <strong className="font-bold text-ink">Antes de Decidir:</strong>
                      <p className="mt-1 text-muted leading-relaxed">{option.verification}</p>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="py-8 text-center text-sm text-muted">
              No hay propuestas de arquitectura adicionales guardadas en este plan.
            </p>
          )}
        </div>
      )}

      {/* 6. Tab 3: Verification Checks */}
      {section === 'verification' && (
        <div className="space-y-4">
          {advice.content.nextChecks?.length ? (
            advice.content.nextChecks.map((check, index) => (
              <div key={index} className="rounded-2xl border border-line bg-card p-5 shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-purple-500/15 px-2 py-0.5 text-xs font-bold text-purple-500">
                    Dimensión: {dimensions[check.dimension] ?? check.dimension}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted leading-relaxed">{check.reason}</p>
                <div className="mt-3 rounded-xl border border-line bg-canvas/50 p-3 text-xs font-semibold text-ink">
                  {check.action}
                </div>
              </div>
            ))
          ) : (
            <p className="py-8 text-center text-sm text-muted">
              No se guardaron verificaciones adicionales en este plan.
            </p>
          )}
        </div>
      )}

      {/* Limitations note */}
      <details className="border-t border-line pt-3 text-xs text-muted">
        <summary className="cursor-pointer font-semibold text-ink hover:text-blue-500">
          Límites del modelo y trazabilidad técnica
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-4 leading-relaxed">
          {advice.content.limitations.map((limit, index) => (
            <li key={index}>{limit}</li>
          ))}
        </ul>
        <p className="mt-2 text-[11px]">
          Proveedor {advice.provider} · Modelo {advice.model} · Contexto {advice.promptVersion}.
        </p>
      </details>
    </div>
  );
}
