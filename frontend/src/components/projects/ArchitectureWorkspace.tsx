import { useState } from 'react';
import {
  Boxes,
  FolderTree,
  Cpu,
  Cloud,
  Landmark,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import type { EvaluacionSeguridad } from '../../types/cloud';
import { platformCandidates, type ArchitectureComponent } from '../../lib/platformCandidates';
import { RepositoryTree } from './RepositoryTree';
import { TechIcon } from '../ui/TechIcon';

const categories: Record<string, string> = {
  client: 'Interfaz de usuario & Frontend',
  api: 'API y Lógica de Servidor',
  data: 'Almacenamiento y Bases de Datos',
  runtime: 'Ejecución y Contenedores',
  delivery: 'CI/CD e Infraestructura como Código',
  security: 'Identidad y Autenticación',
  observability: 'Observabilidad y Telemetría',
  integration: 'Servicios de Integración y Mensajería',
};

export function ArchitectureWorkspace({
  assessment,
  onFinding,
  initialView = 'system',
}: {
  assessment: EvaluacionSeguridad;
  onFinding: (id: string) => void;
  initialView?: string;
}) {
  const [view, setView] = useState(initialView);
  const [technology, setTechnology] = useState('');

  const raw = assessment.summary.detectedArchitecture as { components?: ArchitectureComponent[] } | undefined;
  const components = (raw?.components ?? []).filter(
    (item) => item && typeof item.id === 'string' && typeof item.name === 'string' && Array.isArray(item.evidence)
  );
  const candidates = platformCandidates(components);
  const selected = components.find((item) => item.id === technology) ?? components[0];

  const views = [
    { id: 'system', label: 'Componentes y Stack', icon: Boxes },
    { id: 'services', label: 'Modernización en AWS', icon: Cloud },
    { id: 'technology', label: 'Detalle Tecnológico', icon: Cpu },
    { id: 'files', label: 'Árbol de Archivos', icon: FolderTree },
    { id: 'framework', label: 'Pilares de AWS', icon: Landmark },
  ];

  return (
    <section className="rounded-3xl border border-line bg-card p-5 sm:p-7 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-line pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-bold text-blue-500">
              Arquitectura del Sistema
            </span>
            <h2 className="text-xl font-black text-ink sm:text-2xl">
              Descubrimiento Tecnológico y Mapeo Cloud
            </h2>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-muted">
            Tecnologías identificadas a partir de archivos del repositorio y recomendaciones de modernización en AWS.
          </p>
        </div>

        <span className="shrink-0 rounded-xl bg-canvas px-3 py-1.5 text-xs font-bold text-muted tabular-nums">
          {components.length} componentes · {candidates.length} opciones AWS
        </span>
      </div>

      {/* View Switcher Tabs */}
      <nav aria-label="Explorar arquitectura" className="my-5 flex flex-wrap gap-2">
        {views.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-pressed={view === id}
            onClick={() => setView(id)}
            className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
              view === id
                ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'border-line bg-canvas/40 text-muted hover:text-ink hover:bg-card hover:border-line-2'
            }`}
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* 1. System: Visual Component & Stack Grid */}
      {view === 'system' && (
        <div className="space-y-6">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Object.entries(categories)
              .filter(([category]) => components.some((item) => item.category === category))
              .map(([category, label]) => {
                const categoryComponents = components.filter((item) => item.category === category);

                return (
                  <div
                    key={category}
                    className="flex flex-col justify-between rounded-2xl border border-line bg-canvas/40 p-4 hover:border-line-2 transition-all shadow-xs"
                  >
                    <div>
                      <div className="flex items-center justify-between border-b border-line/60 pb-2.5 mb-3">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</span>
                        <span className="text-[11px] font-bold text-ink">{categoryComponents.length}</span>
                      </div>

                      <div className="space-y-2">
                        {categoryComponents.map((component) => (
                          <button
                            key={component.id}
                            onClick={() => {
                              setTechnology(component.id);
                              setView('technology');
                            }}
                            className="group flex w-full items-center justify-between gap-3 rounded-xl border border-line/60 bg-card p-3 text-left hover:border-blue-500/40 hover:shadow-xs transition-all cursor-pointer"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <TechIcon name={component.name} size={22} showBadge />
                              <div className="min-w-0">
                                <strong className="block text-xs font-bold text-ink group-hover:text-blue-500 transition-colors truncate">
                                  {component.name}
                                </strong>
                                <span className="text-[10px] text-muted">
                                  {component.confidence === 'high' ? 'Detección alta' : 'Detección media'} ·{' '}
                                  {component.evidence.length} archivos
                                </span>
                              </div>
                            </div>
                            <ArrowRight
                              size={14}
                              className="shrink-0 text-muted group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>

          {!components.length && (
            <p className="py-8 text-center text-sm text-muted">
              No hay componentes identificados en esta ejecución. Un análisis exclusivo de cuenta AWS no
              inspecciona los archivos del código fuente.
            </p>
          )}

          <p className="text-xs text-muted">
            Este mapa agrupa componentes detectados a partir de los archivos inspeccionados; no afirma conexiones
            de red ni describe un despliegue verificado.
          </p>
        </div>
      )}

      {/* 2. Services: Candidate AWS Modernization Options */}
      {view === 'services' && (
        <div className="space-y-4">
          <p className="text-xs sm:text-sm leading-relaxed text-muted max-w-3xl">
            Cada opción en AWS parte de un componente detectado en tu repositorio. Antes de adoptar un servicio
            gestionado, valida compatibilidad operativa, volumen de datos y estructura de costos.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            {candidates.map((candidate, idx) => (
              <div
                key={idx}
                className="flex flex-col justify-between rounded-2xl border border-line bg-card p-5 hover:border-blue-500/40 hover:shadow-xs transition-all"
              >
                <div>
                  <div className="flex items-start gap-3">
                    <TechIcon name={candidate.service} size={28} showBadge />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-500">
                          Servicio Recomendado
                        </span>
                        <span className="text-[11px] text-muted">Por {candidate.basedOn}</span>
                      </div>
                      <h4 className="mt-1 text-sm font-bold text-ink">{candidate.service}</h4>
                    </div>
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-muted">{candidate.purpose}</p>

                  <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5 text-[11px] text-amber-600 dark:text-amber-400">
                    <strong className="font-bold">Decisión sugerida:</strong> Validar requisitos de migración,
                    RPO/RTO y modelo de costos en calculadora AWS.
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-[11px] text-muted">
                  <span className="truncate max-w-[240px] font-mono">Evidencia: {candidate.evidence[0]}</span>
                  <span className="font-bold text-blue-500">AWS Managed</span>
                </div>
              </div>
            ))}
          </div>

          {!candidates.length && (
            <p className="py-8 text-center text-sm text-muted">
              No hay tecnologías compatibles con el catálogo de recomendaciones. No se proponen servicios sin
              evidencia previa.
            </p>
          )}
        </div>
      )}

      {/* 3. Technology: Deep Dive with File Evidence */}
      {view === 'technology' && (
        <div className="grid gap-6 md:grid-cols-[240px_1fr]">
          <div className="max-h-[500px] overflow-auto rounded-2xl border border-line bg-canvas/30 p-2 space-y-1">
            {components.map((component) => (
              <button
                key={component.id}
                aria-pressed={selected?.id === component.id}
                onClick={() => setTechnology(component.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-all cursor-pointer ${
                  selected?.id === component.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-muted hover:bg-card hover:text-ink'
                }`}
              >
                <TechIcon name={component.name} size={16} />
                <span className="truncate">{component.name}</span>
              </button>
            ))}
          </div>

          {selected ? (
            <div className="rounded-2xl border border-line bg-card p-5 sm:p-6 shadow-xs">
              <div className="flex items-center gap-3">
                <TechIcon name={selected.name} size={36} showBadge />
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                    {categories[selected.category] ?? selected.category}
                  </span>
                  <h3 className="text-xl font-black text-ink">{selected.name}</h3>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-line bg-canvas/40 p-3 text-xs text-muted">
                Confianza de detección: <strong className="text-ink">{selected.confidence === 'high' ? 'Alta' : 'Media'}</strong>.
                Indica presencia de la biblioteca o archivo de configuración en el repositorio, no una evaluación
                de vulnerabilidad de este componente en sí.
              </div>

              <h4 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted">
                Archivos que respaldan la detección ({selected.evidence.length})
              </h4>
              <ul className="mt-2.5 divide-y divide-line rounded-xl border border-line bg-canvas/20">
                {selected.evidence.map((file) => (
                  <li key={file} className="break-all p-3 font-mono text-xs text-ink flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    <span>{file}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted">Sin tecnologías identificadas.</p>
          )}
        </div>
      )}

      {/* 4. Files: Repository Tree */}
      {view === 'files' && (
        <div>
          {assessment.summary.repositoryInventory ? (
            <RepositoryTree
              entries={assessment.summary.repositoryInventory.entries}
              complete={assessment.summary.repositoryInventory.complete}
              findings={assessment.findings}
              onFinding={onFinding}
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted">
              No hay inventario de archivos guardado. Analiza un archivo ZIP o un repositorio Git para
              obtener el árbol de componentes.
            </p>
          )}
        </div>
      )}

      {/* 5. Framework: AWS Well-Architected 6 Pillars (Preserves test assertions exactly) */}
      {view === 'framework' && (
        <div className="space-y-4">
          <h3 className="text-lg font-black text-ink">AWS Well-Architected tiene seis pilares</h3>
          <p className="max-w-3xl text-xs sm:text-sm leading-relaxed text-muted">
            Esta ejecución aporta evidencia al pilar de Seguridad. No constituye una revisión completa de AWS
            Well-Architected. Los demás pilares necesitan sus propias mediciones del proyecto.
          </p>

          <div className="mt-5 divide-y divide-line rounded-2xl border border-line bg-card overflow-hidden">
            {[
              {
                title: 'Excelencia operativa',
                need: 'Procedimientos de operación, despliegues, recuperación y métricas de entrega.',
              },
              {
                title: 'Seguridad',
                need: 'Controles y hallazgos disponibles en las secciones Protección y Hallazgos.',
                security: true,
              },
              {
                title: 'Fiabilidad',
                need: 'Pruebas de recuperación, disponibilidad observada, RTO y RPO.',
              },
              {
                title: 'Eficiencia del rendimiento',
                need: 'Pruebas de carga, latencias y utilización de recursos.',
              },
              {
                title: 'Optimización de costos',
                need: 'Consumo y precios atribuibles al sistema; no basta con detectar su tecnología.',
              },
              {
                title: 'Sostenibilidad',
                need: 'Uso de recursos, eficiencia y medidas de impacto atribuibles al sistema.',
              },
            ].map((pillar) => (
              <div
                key={pillar.title}
                className="grid gap-2 p-4 sm:grid-cols-[200px_1fr] sm:items-center hover:bg-canvas/40 transition-colors"
              >
                <strong className="text-sm font-bold text-ink">{pillar.title}</strong>
                <div>
                  <span
                    className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${
                      pillar.security
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'bg-canvas text-muted'
                    }`}
                  >
                    {pillar.security ? 'Evidencia parcial según el alcance' : 'Sin medición en esta evaluación'}
                  </span>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{pillar.need}</p>
                </div>
              </div>
            ))}
          </div>

          <a
            href="https://docs.aws.amazon.com/wellarchitected/latest/framework/the-pillars-of-the-framework.html"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline pt-2"
          >
            <span>Consultar el marco oficial de AWS</span>
            <ExternalLink size={13} />
          </a>
        </div>
      )}
    </section>
  );
}
