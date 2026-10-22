export type Estado = 'activo' | 'revision' | 'inactivo';
export type NivelSeguridad = 'correcto' | 'revision' | 'problema';
export type Disponibilidad = 'basica' | 'alta' | 'critica';

export interface RepositoryEntry {
  path: string;
  kind: 'file' | 'directory';
  sizeBytes: number;
  analysisStatus: 'analyzed' | 'unsupported' | 'text-limit' | 'binary' | 'directory';
}

export interface Proyecto {
  id: string;
  name: string;
  clientName?: string | null;
  description: string;
  applicationType: 'Web' | 'Móvil' | 'API' | 'Analítica' | 'Interna';
  environment: 'Producción' | 'Staging' | 'Sandbox';
  region: string;
  status: 'active' | 'paused' | 'archived';
  technologyStack: string[];
  sourceMode: 'none' | 'zip' | 'repository' | 'aws' | 'full';
  repoProvider?: 'github' | 'gitlab' | null;
  repoOwner?: string | null;
  repoName?: string | null;
  repoDefaultBranch?: string | null;
  createdAt: string;
  updatedAt: string;
  proposalCount?: number;
  costItemCount?: number;
  assessmentCount?: number;
  latestAssessmentId?: string | null;
  latestScore?: number | null;
  latestCoverage?: number | null;
  latestAssessmentStatus?: 'pending' | 'running' | 'completed' | 'failed' | null;
  latestAssessmentAt?: string | null;
  criticalHighFindings?: number;
}

export interface HallazgoSeguridad {
  id: string;
  assessmentId: string;
  externalId?: string | null;
  source: 'cloudops' | 'security-hub' | 'aws-config' | 'amazon-inspector' | 'osv';
  category: string;
  dimension?: string | null;
  title: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
  status: string;
  resource?: string | null;
  recommendation: string;
  evidence: Record<string, unknown>;
  fingerprint?: string | null;
  framework?: string | null;
  owner?: string | null;
  dueDate?: string | null;
  justification?: string | null;
  approvedBy?: string | null;
  updatedAt?: string | null;
  createdAt: string;
}

export type EstadoHallazgo = 'open' | 'in_progress' | 'resolved' | 'false_positive' | 'risk_accepted';

export interface EventoHallazgo {
  id: string;
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actor?: string | null;
  comment?: string | null;
  justification?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface HallazgoComparado extends HallazgoSeguridad {
  previousSeverity?: string;
  currentSeverity?: string;
}

export interface ComparacionEvaluacion {
  assessmentType: string;
  current: { id: string; score: number | null; coverage: number };
  previous: { id: string; score: number | null; coverage: number; startedAt: string; methodologyVersion: string } | null;
  summary: {
    newCount: number;
    resolvedCount: number;
    recurringCount: number;
    severityChangedCount: number;
    scoreDelta: number | null;
    coverageDelta: number | null;
    comparable: boolean;
  };
  newFindings: HallazgoSeguridad[];
  resolvedFindings: HallazgoSeguridad[];
  recurring: HallazgoSeguridad[];
  severityChanged: HallazgoComparado[];
}

export interface ProgramacionEvaluacion {
  id: string;
  projectId: string;
  assessmentType: string;
  cadence: 'daily' | 'weekly' | 'monthly';
  timezone: string;
  nextRunAt: string;
  lastRunAt?: string | null;
  enabled: boolean;
  notifyOn: string[];
  notifyEmail?: string | null;
  createdAt?: string;
  updatedAt?: string;
  runs?: EjecucionProgramada[] | null;
}

export interface EjecucionProgramada {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  attempt: number;
  assessmentId?: string | null;
  errorMessage?: string | null;
  startedAt: string;
  completedAt?: string | null;
}


export type DimensionSeguridadId = 'identity' | 'data' | 'application' | 'dependencies' | 'configuration' | 'detection';
export type EstadoControlSeguridad = 'pass' | 'fail' | 'partial' | 'not_applicable' | 'not_supported' | 'failed' | 'skipped';

export interface ControlDimensionSeguridad {
  id: string;
  dimension: DimensionSeguridadId;
  label: string;
  state: EstadoControlSeguridad;
  detail: string;
}

export interface DimensionSeguridad {
  id: DimensionSeguridadId;
  label: string;
  description: string;
  score: number | null;
  coverage: number;
  state: 'measured' | 'partial' | 'not_measured';
  controls: ControlDimensionSeguridad[];
  counts: Record<string, number>;
  scoreExcludedFindings: number;
}

export interface AnalizadorEvaluacion {
  analyzerId: string;
  dimension: DimensionSeguridadId;
  state: 'completed' | 'partial' | 'failed' | 'skipped' | 'not_supported';
  itemsAnalyzed: number;
  findingsCount: number;
  error?: string | null;
  detail?: Record<string, unknown>;
  createdAt?: string;
}

export interface EvaluacionSeguridad {
  id: string;
  projectId: string;
  assessmentType: 'aws-account' | 'code' | 'full';
  status: 'pending' | 'running' | 'completed' | 'failed';
  region: string;
  score: number | null;
  coverage: number;
  confidence: 'low' | 'medium' | 'high';
  summary: {
    counts?: Record<string, number>;
    observedControls?: number;
    totalControls?: number;
    users?: number;
    roles?: number;
    trails?: number;
    securityHubAvailable?: boolean;
    securityHubError?: string | null;
    configAvailable?: boolean;
    configError?: string | null;
    configRecorders?: number;
    configRules?: number;
    inspectorAvailable?: boolean;
    inspectorStatus?: string | null;
    inspectorError?: string | null;
    inspectorCoveredResources?: number;
    inspectorFindings?: number;
    s3Available?: boolean;
    s3Error?: string | null;
    s3Buckets?: number;
    networkAvailable?: boolean;
    networkError?: string | null;
    securityGroups?: number;
    rdsAvailable?: boolean;
    rdsError?: string | null;
    rdsInstances?: number;
    entryCount?: number;
    uncompressedBytes?: number;
    filesAnalyzed?: number;
    dependencyCount?: number;
    vulnerabilitiesChecked?: number;
    osvAvailable?: boolean;
    osvError?: string | null;
    detectedArchitecture?: {
      source?: string;
      componentCount?: number;
      components?: Array<{
        id: string;
        name: string;
        category: 'client' | 'api' | 'data' | 'runtime' | 'delivery' | 'security' | 'observability' | 'integration';
        confidence: 'high' | 'medium';
        evidence: string[];
      }>;
    };
    layerBreakdown?: Array<{
      id: 'backend' | 'frontend' | 'infrastructure' | 'dependencies' | 'shared';
      label: string;
      candidateFiles: number;
      analyzedFiles: number;
      readCoverage: number;
      findings: number;
      counts: Record<string, number>;
    }>;
    repositoryInventory?: { entries: RepositoryEntry[]; complete: boolean };
    coverageMatrix?: Array<{
      id: string;
      label: string;
      status: 'measured' | 'partial' | 'not-detected';
      files: number;
      detail: string;
    }>;
    rulesExecuted?: number;
    scoreableCounts?: Record<string, number>;
    excludedFromScore?: number;
    scoreScope?: string;
    scoreCapsApplied?: string[];
    limitations?: string[];
    methodology?: string;
  };
  errorMessage?: string | null;
  startedAt: string;
  completedAt?: string | null;
  dimensionScores?: DimensionSeguridad[];
  controlResults?: ControlDimensionSeguridad[];
  engineVersion?: string;
  analyzers?: AnalizadorEvaluacion[];
  findingCount?: number;
  findings?: HallazgoSeguridad[];
  artifactId?: string | null;
  artifactName?: string | null;
  artifactSha256?: string | null;
  artifactSizeBytes?: number | string | null;
  artifactMetadata?: Record<string, unknown> | null;
}

export interface AwsConnectionStatus {
  account?: string;
  arn?: string;
  userId?: string;
  profile: string;
  roleArn?: string | null;
  principalType: 'root' | 'assumed-role' | 'iam-role' | 'iam-user' | 'unknown';
  roleConfigured: boolean;
  roleActive: boolean;
  externalIdConfigured: boolean;
  rootOverrideEnabled: boolean;
  readyForAssessment: boolean;
  checks: {
    id: string;
    label: string;
    status: 'passed' | 'warning' | 'failed';
    detail: string;
  }[];
  recommendation: string;
}

export type CategoriaServicio =
  | 'Cómputo'
  | 'Almacenamiento'
  | 'Base de datos'
  | 'Redes'
  | 'Seguridad e identidad'
  | 'Entrega de contenido';

export type TipoCobroServicio =
  | 'hora'
  | 'mensual_fijo'
  | 'almacenamiento_gb'
  | 'transferencia_gb'
  | 'solicitudes';

export interface DesgloseServicioPropuesta {
  servicioId: string;
  nombre: string;
  categoria: CategoriaServicio;
  cantidadEstimada: number;
  unidadMedida: string;
  costoUnitario: number;
  subtotalMensual: number;
  explicacionCalculo: string;
}

export interface ServicioAWS {
  id: string;
  nombre: string;
  categoria: CategoriaServicio;
  descripcion: string;
  funcionPrincipal: string;
  enUso?: boolean;
  unidad: string;
  tipoCobro?: TipoCobroServicio;
  responsabilidad: 'AWS' | 'Cliente' | 'Compartida';
  sla?: string;
  gratisTier?: boolean;
  comandoCli?: string;
  casoUso?: string;
}

export interface Region {
  id: string;
  nombre: string;
  ubicacion: string;
  continente: 'América' | 'Europa' | 'Asia-Pacífico' | 'África' | 'Oriente Medio';
  zonasDisponibilidad: number;
  serviciosDesplegados: string[];
  estado: Estado;
  latenciaMs: number;
  principal: boolean;
  energiaVerde?: boolean;
  datosConsultados?: boolean;
  coordenadas: { x: number; y: number };
  gps: [number, number];
}

export interface PropuestaCloud {
  id: string;
  projectId?: string;
  nombre: string;
  tipoAplicacion: 'Web' | 'Móvil' | 'API' | 'Analítica' | 'Interna';
  descripcion: string;
  regionId: string;
  usuariosEstimados: number;
  disponibilidad: Disponibilidad;
  serviciosSeleccionados: string[];
  objetivoMigracion: string;
  presupuestoMaximo?: number;
  rtoHoras?: number;
  rpoMinutos?: number;
  cumplimiento?: string[];
  creadaEn: string;
  costoEstimadoMensual?: number;
  costoEstimadoAnual?: number;
  scoreWellArchitected?: number;
  desgloseServicios?: DesgloseServicioPropuesta[];
}

export interface ItemCosto {
  id: string;
  servicioId: string;
  cantidad: number;
  horasMes: number;
  configuracion?: string;
  precioUnitario?: number | null;
  unidadPrecio?: string;
  skuPrecio?: string;
  codigoServicioPrecio?: string;
  regionPrecio?: string | null;
  fechaPrecio?: string;
}

export interface ControlSeguridad {
  id: string;
  dominio:
    | 'Responsabilidad compartida'
    | 'Gestión de identidades (IAM)'
    | 'Protección de la cuenta'
    | 'Protección de datos'
    | 'Cumplimiento';
  titulo: string;
  descripcion: string;
  nivel: NivelSeguridad;
  recomendacion: string;
  framework?: string;
}

export interface UsuarioIAM {
  id: string;
  nombre: string;
  tipo: 'Usuario' | 'Grupo' | 'Rol';
  politicas: string[];
  mfa: boolean;
  ultimoAcceso: string;
  arn?: string;
  politicaJson?: string;
}

export interface CloudWatchEvento {
  id: string;
  tiempo: string;
  servicio: string;
  evento: string;
  actor: string;
  estado: 'Éxito' | 'Advertencia' | 'Crítico';
  region: string;
}
