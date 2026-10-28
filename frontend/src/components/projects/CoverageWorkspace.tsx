import { useState } from 'react';
import { Card } from '../ui/Card';
import type { EvaluacionSeguridad } from '../../types/cloud';
import { MeasurementReceipt } from './MeasurementReceipt';
import { AssessmentStatistics } from './AssessmentStatistics';
import { SecurityDimensions } from './SecurityDimensions';
import { SupplyChainPanel } from './SupplyChainPanel';
import { SastCoveragePanel } from './SastCoveragePanel';
import { RepositorySecretsPanel } from './RepositorySecretsPanel';
import { IacCoveragePanel } from './IacCoveragePanel';

const labels: Record<string, string> = { completed: 'Completado', measured: 'Medido', partial: 'Parcial', failed: 'Fallido', skipped: 'Omitido', not_supported: 'No soportado', not_measured: 'No medido', 'not-detected': 'No detectado' };

export function CoverageWorkspace({ assessment }: { assessment: EvaluacionSeguridad }) {
  const [view, setView] = useState('overview');
  const code = assessment.assessmentType !== 'aws-account';
  const services = assessment.summary.awsServiceCoverage;
  const choices = [{ id: 'overview', label: 'Qué se comprobó' }, { id: 'distribution', label: 'Riesgos por capa' }, { id: 'dimensions', label: 'Dimensiones y controles' },
    ...(code ? [{ id: 'supply', label: 'Dependencias e imágenes / SBOM' }, { id: 'sast', label: 'Código / Semgrep' }, { id: 'secrets', label: 'Secretos / Gitleaks' }, { id: 'iac', label: 'Infraestructura declarada' }, { id: 'domains', label: 'Reglas internas por dominio' }] : []),
    ...(services?.length || assessment.assessmentType !== 'code' ? [{ id: 'aws', label: 'Servicios AWS por región' }] : [])];
  return <Card>
    <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-bold text-ink">Qué se midió y hasta dónde</h2><p className="mt-1 text-xs text-muted">Conoce las pruebas realizadas, lo que quedó pendiente y por qué limita la conclusión.</p></div><label className="text-xs font-semibold text-ink">Detalle de medición<select aria-label="Detalle de medición" value={view} onChange={(event) => setView(event.target.value)} className="mt-1 block w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-ink sm:w-64">{choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label></div>
    <div className="pt-4" key={view}>
      {view === 'overview' && <MeasurementReceipt assessment={assessment} onDetail={setView} />}
      {view === 'distribution' && <AssessmentStatistics assessment={assessment} />}
      {view === 'dimensions' && <SecurityDimensions dimensions={assessment.dimensionScores} analyzers={assessment.analyzers} />}
      {view === 'supply' && <SupplyChainPanel assessment={assessment} />}
      {view === 'sast' && <SastCoveragePanel assessment={assessment} />}
      {view === 'secrets' && <RepositorySecretsPanel assessment={assessment} />}
      {view === 'iac' && <IacCoveragePanel assessment={assessment} />}
      {view === 'domains' && <section><h3 className="text-sm font-semibold text-ink">Comprobaciones internas</h3><p className="mt-1 text-xs text-muted">No detectado significa sin medir; no certifica que el dominio no aplique.</p><div className="mt-3 divide-y divide-line">{assessment.summary.coverageMatrix?.map((domain) => <div key={domain.id} className="py-3"><div className="flex flex-wrap justify-between gap-2 text-xs"><strong className="text-ink">{domain.label}</strong><span className="text-blue-600 dark:text-blue-400">{labels[domain.status]} · {domain.files} archivos</span></div><p className="mt-1 text-xs leading-relaxed text-muted">{domain.detail}</p></div>)}</div></section>}
      {view === 'aws' && <section><h3 className="text-sm font-semibold text-ink">Medición AWS observada</h3><p className="mt-1 text-xs text-muted">Cero recursos observados no demuestra seguridad. El alcance regional corresponde a la región indicada.</p>{services?.length ? <div className="mt-3 divide-y divide-line">{services.map((service) => <div key={service.service} className="grid gap-2 py-3 text-xs sm:grid-cols-[120px_100px_1fr]"><strong className="text-ink">{service.service.toUpperCase()}</strong><span className={service.state === 'measured' ? 'text-blue-600 dark:text-blue-400' : 'text-amber-700 dark:text-amber-400'}>{labels[service.state]}</span><div className="text-muted">{service.observed ?? '—'} {service.unit} · {service.scope === 'global' ? 'Global' : service.region ?? assessment.region}{service.reason && <p className="mt-1 break-words">{service.reason}</p>}</div></div>)}</div> : <p className="mt-3 text-xs text-muted">Esta evaluación histórica no conserva el inventario medido por servicio. Ejecuta una nueva evaluación.</p>}</section>}
    </div>
  </Card>;
}
