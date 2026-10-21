import { useMemo, useState } from 'react';
import {
  PieChart,
  Shield,
  TrendingUp,
} from 'lucide-react';
import type { HallazgoSeguridad } from '../../types/cloud';
import { detectAwsService } from './findingServiceHelper';
import { useMotionProgress } from '../../hooks/useMotionProgress';

interface SecurityAnalyticsProps {
  findings: HallazgoSeguridad[];
  onSelectServiceFilter?: (serviceId: string) => void;
  activeServiceFilter?: string;
}

export function SecurityAnalyticsWidget({
  findings,
  onSelectServiceFilter,
  activeServiceFilter,
}: SecurityAnalyticsProps) {
  const [hoveredSeverity, setHoveredSeverity] = useState<string | null>(null);
  const motion = useMotionProgress(findings.map((finding) => `${finding.id}:${finding.severity}:${finding.status}`).join('|'));
  const count = (value: number) => Math.round(value * motion);

  // 1. Severity Distribution
  const severityStats = useMemo(() => {
    const counts = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      INFORMATIONAL: 0,
    };
    for (const f of findings) {
      if (counts[f.severity] !== undefined) {
        counts[f.severity] += 1;
      }
    }
    const total = findings.length || 1;
    return {
      counts,
      percentages: {
        CRITICAL: Math.round((counts.CRITICAL / total) * 100),
        HIGH: Math.round((counts.HIGH / total) * 100),
        MEDIUM: Math.round((counts.MEDIUM / total) * 100),
        LOW_INFO: Math.round(((counts.LOW + counts.INFORMATIONAL) / total) * 100),
      },
      criticalHigh: counts.CRITICAL + counts.HIGH,
    };
  }, [findings]);

  // 2. The 4 Core Module Services Breakdown
  const coreServicesStats = useMemo(() => {
    let iam = 0;
    let securityHub = 0;
    let config = 0;
    let inspector = 0;
    let others = 0;

    for (const f of findings) {
      const s = detectAwsService(f);
      if (s.id === 'iam' || f.category === 'identity' || f.category === 'account') {
        iam += 1;
      } else if (f.source === 'security-hub' || f.category === 'cloud-posture') {
        securityHub += 1;
      } else if (f.source === 'aws-config' || s.id === 'config' || f.category === 'configuration' || f.category === 'compliance') {
        config += 1;
      } else if (f.source === 'amazon-inspector' || s.id === 'inspector' || f.category === 'vulnerability') {
        inspector += 1;
      } else {
        others += 1;
      }
    }

    const total = findings.length || 1;
    return [
      {
        id: 'iam',
        name: 'AWS IAM',
        count: iam,
        percent: Math.round((iam / total) * 100),
        color: '#6366f1',
        barClass: 'bg-indigo-500',
        badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
        desc: 'Identidad, credenciales y privilegios',
      },
      {
        id: 'security-hub',
        name: 'Security Hub',
        count: securityHub,
        percent: Math.round((securityHub / total) * 100),
        color: '#f43f5e',
        barClass: 'bg-rose-500',
        badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
        desc: 'Postura CIS Benchmark & FSBP',
      },
      {
        id: 'aws-config',
        name: 'AWS Config',
        count: config,
        percent: Math.round((config / total) * 100),
        color: '#0ea5e9',
        barClass: 'bg-sky-500',
        badgeClass: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
        desc: 'Conformidad continua de reglas',
      },
      {
        id: 'amazon-inspector',
        name: 'Amazon Inspector',
        count: inspector,
        percent: Math.round((inspector / total) * 100),
        color: '#10b981',
        barClass: 'bg-emerald-500',
        badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        desc: 'Vulnerabilidades y parches',
      },
    ];
  }, [findings]);

  // 3. Lifecycle Status Breakdown
  const lifecycleStats = useMemo(() => {
    let open = 0;
    let inProgress = 0;
    let resolved = 0;
    let riskAccepted = 0;
    for (const f of findings) {
      if (f.status === 'in_progress') inProgress += 1;
      else if (f.status === 'resolved') resolved += 1;
      else if (f.status === 'risk_accepted' || f.status === 'false_positive') riskAccepted += 1;
      else open += 1;
    }
    const total = findings.length || 1;
    return {
      open,
      inProgress,
      resolved,
      riskAccepted,
      resolutionRate: Math.round(((resolved + riskAccepted) / total) * 100),
    };
  }, [findings]);

  // SVG Donut calculation
  const totalFindings = findings.length;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;

  const segments = useMemo(() => {
    if (!totalFindings) return [];
    const items = [
      { key: 'CRITICAL', label: 'Crítico', count: severityStats.counts.CRITICAL, color: '#f43f5e' },
      { key: 'HIGH', label: 'Alto', count: severityStats.counts.HIGH, color: '#f97316' },
      { key: 'MEDIUM', label: 'Medio', count: severityStats.counts.MEDIUM, color: '#f59e0b' },
      { key: 'LOW_INFO', label: 'Bajo & Info', count: severityStats.counts.LOW + severityStats.counts.INFORMATIONAL, color: '#3b82f6' },
    ];
    let accumulatedOffset = 0;
    return items.map((item) => {
      const strokeLength = (item.count / totalFindings) * circumference;
      const strokeDasharray = `${strokeLength} ${circumference - strokeLength}`;
      const strokeDashoffset = -accumulatedOffset;
      accumulatedOffset += strokeLength;
      return {
        ...item,
        strokeDasharray,
        strokeDashoffset,
        percent: Math.round((item.count / totalFindings) * 100),
      };
    });
  }, [totalFindings, severityStats, circumference]);

  return (
    <div className="space-y-4 rounded-3xl border border-line bg-card p-5 shadow-lg backdrop-blur-xl">
      {/* Widget Header */}
      <div className="flex items-center justify-between border-b border-line pb-3.5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <PieChart size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink">Estadísticas en Tiempo Real</h3>
            <p className="text-[11px] text-muted">Vulnerabilidades por servicio y severidad</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          En vivo
        </span>
      </div>

      {/* Row 1: SVG Donut Chart & Severity Legend */}
      <div className="flex items-center gap-5 pt-1">
        {/* SVG Donut */}
        <div className="relative flex shrink-0 items-center justify-center">
          <svg className="h-28 w-28 -rotate-90 transform" viewBox="0 0 100 100">
            {/* Background ring */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              stroke="currentColor"
              strokeWidth="9"
              fill="transparent"
              className="text-line/40"
            />
            {/* Segments */}
            {segments.map((seg) => (
              <circle
                key={seg.key}
                cx="50"
                cy="50"
                r={radius}
                stroke={seg.color}
                strokeWidth={hoveredSeverity === seg.key ? '11' : '9'}
                strokeDasharray={`${(seg.count / (totalFindings || 1)) * circumference * motion} ${circumference - (seg.count / (totalFindings || 1)) * circumference * motion}`}
                strokeDashoffset={seg.strokeDashoffset * motion}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-300 cursor-pointer"
                onMouseEnter={() => setHoveredSeverity(seg.key)}
                onMouseLeave={() => setHoveredSeverity(null)}
              />
            ))}
          </svg>
          {/* Donut Center */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
            <span aria-label={String(totalFindings)} className="text-xl font-black text-ink leading-tight tabular-nums">{count(totalFindings)}</span>
            <span className="text-[9px] uppercase tracking-wider text-muted font-bold">Hallazgos</span>
          </div>
        </div>

        {/* Severity Legend */}
        <div className="flex-1 space-y-1.5 text-xs">
          {segments.map((seg) => (
            <div
              key={seg.key}
              onMouseEnter={() => setHoveredSeverity(seg.key)}
              onMouseLeave={() => setHoveredSeverity(null)}
              className={`flex items-center justify-between rounded-lg px-2 py-1 transition-colors cursor-pointer ${
                hoveredSeverity === seg.key ? 'bg-canvas shadow-sm ring-1 ring-line' : 'hover:bg-canvas/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: seg.color }} />
                <span className="font-semibold text-ink text-[11px]">{seg.label}</span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <strong className="text-ink tabular-nums">{count(seg.count)}</strong>
                <span className="text-muted text-[10px] tabular-nums">({count(seg.percent)}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Row 2: The 4 Core Module Services Bars */}
      <div className="space-y-2.5 pt-2 border-t border-line">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted flex items-center gap-1">
            <Shield size={12} className="text-blue-500" /> Cobertura por Servicio Core
          </span>
          <span className="text-[10px] text-muted">4 servicios del módulo</span>
        </div>

        <div className="space-y-2">
          {coreServicesStats.map((svc) => {
            const isSelected = activeServiceFilter === svc.id;
            return (
              <div
                key={svc.id}
                onClick={() => onSelectServiceFilter?.(isSelected ? 'all' : svc.id)}
                className={`group rounded-xl p-2.5 transition-all cursor-pointer border ${
                  isSelected
                    ? 'border-blue-500/50 bg-blue-500/10 shadow-sm'
                    : 'border-line/60 bg-canvas/60 hover:bg-canvas hover:border-line'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: svc.color }} />
                    <strong className="text-ink font-bold group-hover:text-blue-500 transition-colors">
                      {svc.name}
                    </strong>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-xs">
                    <span className="font-bold text-ink tabular-nums">{count(svc.count)}</span>
                    <span className="text-[10px] text-muted tabular-nums">({count(svc.percent)}%)</span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-line/60 h-2 rounded-full overflow-hidden">
                  <div
                    className={`${svc.barClass} h-full rounded-full transition-all duration-500`}
                    style={{ width: `${Math.min(100, svc.percent) * motion}%` }}
                  />
                </div>
                <span className="block mt-1 text-[10px] text-muted truncate">{svc.desc}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Row 3: Remediation / Lifecycle Status Bar */}
      <div className="rounded-2xl bg-canvas/80 p-3 border border-line text-xs space-y-2 pt-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-ink flex items-center gap-1.5">
            <TrendingUp size={13} className="text-emerald-500" /> Tasa de Tratamiento
          </span>
          <span className="text-xs font-black text-emerald-500 font-mono">
            {count(lifecycleStats.resolutionRate)}%
          </span>
        </div>
        <div className="flex h-2 w-full rounded-full overflow-hidden bg-line">
          <div
            className="bg-emerald-500 transition-all duration-500"
            style={{ width: `${(lifecycleStats.resolved / (totalFindings || 1)) * 100 * motion}%` }}
            title={`Corregidos: ${lifecycleStats.resolved}`}
          />
          <div
            className="bg-amber-500 transition-all duration-500"
            style={{ width: `${(lifecycleStats.inProgress / (totalFindings || 1)) * 100 * motion}%` }}
            title={`En tratamiento: ${lifecycleStats.inProgress}`}
          />
          <div
            className="bg-rose-500/80 transition-all duration-500"
            style={{ width: `${(lifecycleStats.open / (totalFindings || 1)) * 100 * motion}%` }}
            title={`Abiertos: ${lifecycleStats.open}`}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted pt-0.5 font-mono">
          <span>Abiertos: <strong className="text-rose-400">{count(lifecycleStats.open)}</strong></span>
          <span>En tratamiento: <strong className="text-amber-400">{count(lifecycleStats.inProgress)}</strong></span>
          <span>Corregidos: <strong className="text-emerald-400">{count(lifecycleStats.resolved)}</strong></span>
        </div>
      </div>
    </div>
  );
}
