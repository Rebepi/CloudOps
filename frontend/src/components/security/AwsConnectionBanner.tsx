import { useState } from 'react';
import { Check, CheckCircle2, ChevronDown, ChevronUp, Copy, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { AwsConnectionStatus } from '../../types/cloud';

export function AwsConnectionBanner({ data, error }: { data: AwsConnectionStatus | null; error: string | null }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-400 backdrop-blur-sm animate-fade-in">
        <div className="flex items-start gap-3">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-rose-500" />
          <div className="flex-1">
            <strong className="block text-sm font-semibold text-rose-300">Error en conexión AWS</strong>
            <p className="mt-0.5 text-xs text-rose-400/90">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const copyArn = async () => {
    if (!data.arn) return;
    try {
      await navigator.clipboard.writeText(data.arn);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard fallback */
    }
  };

  const isHealthy = data.roleActive;
  const isWarning = !data.roleActive && data.readyForAssessment;

  // Extract account and role if ARN matches STS format
  const arnMatch = data.arn?.match(/^arn:aws:sts::(\d+):assumed-role\/([^/]+)\/(.+)$/);
  const accountId = arnMatch ? arnMatch[1] : null;
  const roleName = arnMatch ? arnMatch[2] : null;
  const sessionName = arnMatch ? arnMatch[3] : null;

  return (
    <div
      className={`rounded-2xl border p-4 transition-all duration-200 ${
        isHealthy
          ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-300 shadow-sm'
          : isWarning
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-300 shadow-sm'
          : 'border-rose-500/30 bg-rose-500/10 text-rose-300 shadow-sm'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
              isHealthy
                ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
                : 'border-amber-500/30 bg-amber-500/15 text-amber-400'
            }`}
          >
            {isHealthy ? <ShieldCheck size={18} /> : <CheckCircle2 size={18} />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-sm text-ink tracking-tight">
                {isHealthy ? 'Rol de auditoría AWS conectado' : 'Conexión AWS: rol pendiente'}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                  isHealthy
                    ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
                    : 'border-amber-500/30 bg-amber-500/15 text-amber-400'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                {isHealthy ? 'IAM Role Activo' : 'Pendiente'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted truncate">
              {data.recommendation || 'Credenciales temporales en uso listas para evaluar la postura de seguridad.'}
            </p>
          </div>
        </div>

        {/* Action Pills & ARN info */}
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          {data.arn && (
            <div className="flex items-center gap-1 rounded-xl border border-line bg-canvas/80 px-2.5 py-1.5 text-xs">
              <span className="text-[11px] font-mono text-muted max-w-[180px] md:max-w-[260px] truncate">
                {roleName ? `${roleName}/${sessionName}` : data.arn}
              </span>
              <button
                type="button"
                onClick={copyArn}
                title="Copiar ARN completo"
                className="ml-1 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-500 hover:text-blue-400 cursor-pointer p-0.5 transition-colors"
              >
                {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                <span className="text-[10px]">{copied ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
          )}

          {data.arn && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? 'Ocultar detalles' : 'Ver detalles'}
              className="rounded-xl border border-line bg-canvas/80 p-1.5 text-muted hover:text-ink transition-colors cursor-pointer"
            >
              {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Technical Details for End Users */}
      {expanded && data.arn && (
        <div className="mt-3 pt-3 border-t border-line/60 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs animate-fade-in">
          <div className="rounded-xl bg-canvas/60 p-2.5 border border-line/40">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted">ID de Cuenta AWS</span>
            <code className="text-xs font-mono font-semibold text-ink">{accountId || 'Detectada en ARN'}</code>
          </div>
          <div className="rounded-xl bg-canvas/60 p-2.5 border border-line/40">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted">Rol Asumido</span>
            <code className="text-xs font-mono font-semibold text-ink">{roleName || 'CloudOpsAuditRole'}</code>
          </div>
          <div className="rounded-xl bg-canvas/60 p-2.5 border border-line/40">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted">Sesión STS</span>
            <code className="text-xs font-mono font-semibold text-ink">{sessionName || 'cloudops-audit'}</code>
          </div>
          <div className="sm:col-span-3 rounded-xl bg-canvas/40 p-2 border border-line/30 flex items-center justify-between">
            <code className="text-[10.5px] font-mono text-muted break-all">{data.arn}</code>
          </div>
        </div>
      )}
    </div>
  );
}
