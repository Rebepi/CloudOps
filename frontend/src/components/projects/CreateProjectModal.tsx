import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Cloud,
  FileArchive,
  GitBranch,
  LoaderCircle,
  RefreshCw,
  Upload,
  UploadCloud,
  X,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { FileDropZone } from '../ui/FileDropZone';
import { api } from '../../lib/api';
import type { Proyecto } from '../../types/cloud';

function GithubIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

interface CreateProjectModalProps {
  abierto: boolean;
  onCerrar: () => void;
  onCreated: () => void;
}

type SourceMode = 'zip' | 'repository' | 'aws';

interface RepoVerificationResult {
  fullName: string;
  description: string | null;
  defaultBranch: string;
  isPrivate: boolean;
  visibility: string;
  language?: string;
  updatedAt?: string;
}

export function CreateProjectModal({ abierto, onCerrar, onCreated }: CreateProjectModalProps) {
  const navigate = useNavigate();

  // Basic project info
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [applicationType, setApplicationType] = useState<'Web' | 'Móvil' | 'API' | 'Analítica' | 'Interna'>('Web');
  const [environment, setEnvironment] = useState<'Producción' | 'Staging' | 'Sandbox'>('Sandbox');
  const [region, setRegion] = useState('us-east-1');
  const [technologyStack, setTechnologyStack] = useState('');

  // Source mode
  const [sourceMode, setSourceMode] = useState<SourceMode>('zip');

  // ZIP file state
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [autoScanZip, setAutoScanZip] = useState(true);

  // Repository state
  const [repoProvider, setRepoProvider] = useState<'github' | 'gitlab'>('github');
  const [repoUrlInput, setRepoUrlInput] = useState('');
  const [repoOwner, setRepoOwner] = useState('');
  const [repoName, setRepoName] = useState('');
  const [repoBranch, setRepoBranch] = useState('main');
  const [repoVerifying, setRepoVerifying] = useState(false);
  const [repoVerifiedData, setRepoVerifiedData] = useState<RepoVerificationResult | null>(null);
  const [repoVerifyError, setRepoVerifyError] = useState<string | null>(null);

  // Submission & creation flow states
  const [saving, setSaving] = useState(false);
  const [creationStep, setCreationStep] = useState<string | null>(null);
  const [creationProgress, setCreationProgress] = useState(0);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [createdProject, setCreatedProject] = useState<Proyecto | null>(null);
  const closeModal = () => {
    if (saving) return;
    if (createdProject) onCreated();
    setCreatedProject(null);
    setCreationError(null);
    onCerrar();
  };

  // Auto-parse repository URL or owner/repo shorthand
  const handleRepoInput = (input: string) => {
    setRepoUrlInput(input);
    setRepoVerifiedData(null);
    setRepoVerifyError(null);

    const trimmed = input.trim();
    // Check if it's a full URL
    const matchUrl = trimmed.match(/(?:github\.com|gitlab\.com)\/([^/]+)\/([^/.]+)/);
    if (matchUrl) {
      setRepoOwner(matchUrl[1]);
      setRepoName(matchUrl[2]);
      if (trimmed.includes('gitlab.com')) setRepoProvider('gitlab');
      else setRepoProvider('github');
      return;
    }

    // Check if it's "owner/repo" shorthand
    const matchShort = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
    if (matchShort) {
      setRepoOwner(matchShort[1]);
      setRepoName(matchShort[2]);
    }
  };

  // Test connection to GitHub/GitLab
  const verifyRepoConnection = async () => {
    const owner = repoOwner.trim();
    const nameToTest = repoName.trim();
    if (!owner || !nameToTest) {
      setRepoVerifyError('Indica el propietario y el nombre del repositorio.');
      return;
    }

    setRepoVerifying(true);
    setRepoVerifyError(null);
    setRepoVerifiedData(null);

    try {
      const result = await api<{ data: RepoVerificationResult }>('/repositories/verify', {
        method: 'POST',
        body: JSON.stringify({
          provider: repoProvider,
          owner,
          name: nameToTest,
        }),
      });

      setRepoVerifiedData(result.data);
      if (result.data.defaultBranch) {
        setRepoBranch(result.data.defaultBranch);
      }
      if (!name.trim()) {
        setName(result.data.fullName);
      }
      if (result.data.language && !technologyStack.includes(result.data.language)) {
        setTechnologyStack(
          technologyStack ? `${technologyStack}, ${result.data.language}` : result.data.language
        );
      }
    } catch (err) {
      setRepoVerifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setRepoVerifying(false);
    }
  };

  // Handle ZIP file selection
  const handleFileChange = (file: File | null) => {
    if (!file) {
      setArchiveFile(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setCreationError('Solo se admiten archivos comprimidos con extensión .zip');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setCreationError('El archivo supera el límite de 100 MB.');
      return;
    }
    setArchiveFile(file);
    setCreationError(null);

    // Auto-fill project name if empty
    if (!name.trim()) {
      const cleanName = file.name.replace(/\.zip$/i, '').replace(/[-_]/g, ' ');
      setName(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
    }
  };

  // Format file size in KB/MB
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Form submission & lifecycle flow
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (sourceMode === 'zip' && !archiveFile) {
      setCreationError('Selecciona un archivo .zip para continuar con este modo.');
      return;
    }

    if (sourceMode === 'repository' && (!repoOwner.trim() || !repoName.trim())) {
      setCreationError('Indica el propietario y repositorio Git para continuar.');
      return;
    }

    setSaving(true);
    setCreationError(null);
    setCreationProgress(10);
    setCreationStep('Creando espacio del proyecto en CloudOps…');

    try {
      // Step 1: Create Project
      const techArray = technologyStack
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const createRes = createdProject ? { data: createdProject } : await api<{ data: Proyecto }>('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          clientName: clientName.trim() || undefined,
          description: description.trim() || undefined,
          applicationType,
          environment,
          region,
          technologyStack: techArray,
          sourceMode,
          ...(sourceMode === 'repository'
            ? {
                repoProvider,
                repoOwner: repoOwner.trim(),
                repoName: repoName.trim(),
                repoDefaultBranch: repoBranch.trim() || 'main',
              }
            : {}),
        }),
      });

      const newProject = createRes.data;
      setCreatedProject(newProject);
      const projectId = newProject.id;
      setCreationProgress(40);

      // Step 2: Handle Source Mode upload / connection
      if (sourceMode === 'zip' && archiveFile) {
        setCreationStep(`Subiendo y registrando archivo ZIP (${archiveFile.name})…`);
        setCreationProgress(65);

        const formData = new FormData();
        formData.append('archive', archiveFile);

        await api(`/projects/${projectId}/security/assessments/code`, {
          method: 'POST',
          body: formData,
        });

        setCreationStep('Archivo recibido y análisis de seguridad estático iniciado.');
        setCreationProgress(90);
      } else if (sourceMode === 'repository') {
        setCreationStep(`Conectando repositorio ${repoOwner}/${repoName} (${repoBranch})…`);
        setCreationProgress(65);

        await api(`/projects/${projectId}/repository`, {
          method: 'POST',
          body: JSON.stringify({
            provider: repoProvider,
            owner: repoOwner.trim(),
            name: repoName.trim(),
            defaultBranch: repoBranch.trim() || 'main',
          }),
        });

        // Trigger initial repository assessment
        setCreationStep('Repositorio vinculado. Despachando análisis inicial…');
        setCreationProgress(85);
        try {
          await api(`/projects/${projectId}/security/assessments/repository`, {
            method: 'POST',
            body: JSON.stringify({ ref: repoBranch.trim() || 'main' }),
          });
        } catch {
          /* assessment can continue or be executed manually */
        }
      } else if (sourceMode === 'aws') {
        setCreationStep('Configurando entorno AWS y línea base…');
        setCreationProgress(85);
      }

      setCreationProgress(100);
      setCreationStep('¡Proyecto creado y conectado con éxito!');

      setTimeout(() => {
        setCreatedProject(null);
        setSaving(false);
        onCreated();
        onCerrar();
        navigate(`/projects/${projectId}`);
      }, 700);
    } catch (err) {
      setCreationError(err instanceof TypeError && err.message === 'Failed to fetch'
        ? 'La conexión se interrumpió durante la carga. El proyecto creado se conservará para reintentar sin duplicarlo.'
        : err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={closeModal}
      titulo="Crear nuevo proyecto"
      subtitulo="Configura el espacio de trabajo, fuente de código o conexión AWS para auditoría integral."
      tamano="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Source Mode Interactive Cards */}
        <div>
          <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-2.5">
            Selecciona el origen y modo de análisis:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Card 1: ZIP */}
            <button
              type="button"
              onClick={() => {
                setSourceMode('zip');
                setCreationError(null);
              }}
              className={`flex flex-col text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                sourceMode === 'zip'
                  ? 'border-violet-500 bg-violet-500/10 shadow-md ring-2 ring-violet-500/30'
                  : 'border-line bg-canvas hover:border-line-2 hover:bg-card'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/20 text-violet-400 border border-violet-500/30">
                  <FileArchive size={18} />
                </div>
                {sourceMode === 'zip' && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-white text-[10px]">
                    <Check size={12} />
                  </span>
                )}
              </div>
              <strong className="text-sm font-bold text-ink">Subir archivo ZIP</strong>
              <p className="mt-1 text-[11px] text-muted leading-tight">
                Análisis estático de código, secretos y vulnerabilidades OSV (hasta 100 MB).
              </p>
            </button>

            {/* Card 2: Git Repository */}
            <button
              type="button"
              onClick={() => {
                setSourceMode('repository');
                setCreationError(null);
              }}
              className={`flex flex-col text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                sourceMode === 'repository'
                  ? 'border-blue-500 bg-blue-500/10 shadow-md ring-2 ring-blue-500/30'
                  : 'border-line bg-canvas hover:border-line-2 hover:bg-card'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  <GitBranch size={18} />
                </div>
                {sourceMode === 'repository' && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[10px]">
                    <Check size={12} />
                  </span>
                )}
              </div>
              <strong className="text-sm font-bold text-ink">Repositorio GitHub</strong>
              <p className="mt-1 text-[11px] text-muted leading-tight">
                Conexión y verificación directa con GitHub o GitLab para análisis de ramas.
              </p>
            </button>

            {/* Card 3: Solo AWS */}
            <button
              type="button"
              onClick={() => {
                setSourceMode('aws');
                setCreationError(null);
              }}
              className={`flex flex-col text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                sourceMode === 'aws'
                  ? 'border-emerald-500 bg-emerald-500/10 shadow-md ring-2 ring-emerald-500/30'
                  : 'border-line bg-canvas hover:border-line-2 hover:bg-card'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Cloud size={18} />
                </div>
                {sourceMode === 'aws' && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[10px]">
                    <Check size={12} />
                  </span>
                )}
              </div>
              <strong className="text-sm font-bold text-ink">Solo Cuenta AWS</strong>
              <p className="mt-1 text-[11px] text-muted leading-tight">
                Auditoría de IAM, S3, VPC, CloudTrail, Config, Security Hub e Inspector.
              </p>
            </button>
          </div>
        </div>

        {/* Dynamic Section: ZIP Upload Details */}
        {sourceMode === 'zip' && (
          <FileDropZone onFile={handleFileChange} onError={setCreationError} disabled={saving}>
          <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 sm:p-5 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-violet-500/20 pb-3">
              <div className="flex items-center gap-2 text-violet-400 font-bold text-xs uppercase tracking-wider">
                <FileArchive size={16} />
                Carga y detalles del archivo ZIP
              </div>
              <span className="text-[10px] text-muted">Límite: 100 MB (.zip)</span>
            </div>

            {!archiveFile ? (
              <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-violet-500/40 bg-card/60 p-6 sm:p-8 text-center cursor-pointer hover:border-violet-500/80 hover:bg-violet-500/10 transition-all">
                <UploadCloud size={32} className="text-violet-400 mb-2 animate-bounce" />
                <span className="text-sm font-bold text-ink">Haz clic para seleccionar o arrastra un archivo .zip</span>
                <span className="mt-1 text-xs text-muted">
                  Contendrá el código fuente, dependencias (`package.json`, `requirements.txt`) o IaC.
                </span>
                <input
                  type="file"
                  accept=".zip,application/zip"
                  className="hidden"
                  onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                />
              </label>
            ) : (
              <div className="rounded-xl border border-violet-500/30 bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 text-violet-400 border border-violet-500/30">
                      <FileArchive size={20} />
                    </div>
                    <div className="min-w-0">
                      <strong className="block text-sm font-bold text-ink truncate">{archiveFile.name}</strong>
                      <div className="flex items-center gap-2 text-[11px] text-muted mt-0.5">
                        <span className="font-semibold text-violet-400">{formatFileSize(archiveFile.size)}</span>
                        <span>·</span>
                        <span className="text-emerald-500 flex items-center gap-1 font-medium">
                          <CheckCircle2 size={12} /> ZIP válido
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setArchiveFile(null)}
                    className="rounded-lg border border-line p-1 text-muted hover:text-ink cursor-pointer"
                    title="Eliminar archivo"
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Size Progress Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-muted">
                    <span>Tamaño del archivo</span>
                    <span>{formatFileSize(archiveFile.size)} / 100 MB máx.</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-line overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (archiveFile.size / (100 * 1024 * 1024)) * 100)}%` }}
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 pt-1 text-xs text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoScanZip}
                    onChange={(e) => setAutoScanZip(e.target.checked)}
                    className="rounded border-line text-violet-600 focus:ring-violet-500"
                  />
                  <span>Iniciar análisis estático de vulnerabilidades y secretos de inmediato al crear</span>
                </label>
              </div>
            )}
          </div>
          </FileDropZone>
        )}

        {/* Dynamic Section: GitHub Repository Connection */}
        {sourceMode === 'repository' && (
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 sm:p-5 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-blue-500/20 pb-3">
              <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
                <GithubIcon size={16} />
                Conectar y comprobar repositorio Git
              </div>
              <span className="text-[10px] text-muted">GitHub / GitLab</span>
            </div>

            <div className="space-y-3">
              {/* Quick URL or Owner/Repo Input with Verification Button */}
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  URL del repositorio o formato <code>propietario/repositorio</code>:
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={repoUrlInput}
                      onChange={(e) => handleRepoInput(e.target.value)}
                      placeholder="ej. https://github.com/facebook/react o facebook/react"
                      className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={verifyRepoConnection}
                    disabled={repoVerifying || !repoOwner.trim() || !repoName.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-500 disabled:opacity-50 cursor-pointer transition-all"
                  >
                    {repoVerifying ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {repoVerifying ? 'Verificando…' : 'Comprobar conexión'}
                  </button>
                </div>
              </div>

              {/* Advanced detailed fields (auto-filled or editable) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">Proveedor</label>
                  <select
                    value={repoProvider}
                    onChange={(e) => {
                      setRepoProvider(e.target.value as 'github' | 'gitlab');
                      setRepoVerifiedData(null);
                    }}
                    className="w-full rounded-xl border border-line bg-card px-2.5 py-2 text-xs text-ink"
                  >
                    <option value="github">GitHub</option>
                    <option value="gitlab">GitLab</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">Organización / Dueño</label>
                  <input
                    type="text"
                    value={repoOwner}
                    onChange={(e) => {
                      setRepoOwner(e.target.value);
                      setRepoVerifiedData(null);
                    }}
                    placeholder="propietario"
                    className="w-full rounded-xl border border-line bg-card px-2.5 py-2 text-xs text-ink"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">Nombre Repositorio</label>
                  <input
                    type="text"
                    value={repoName}
                    onChange={(e) => {
                      setRepoName(e.target.value);
                      setRepoVerifiedData(null);
                    }}
                    placeholder="repositorio"
                    className="w-full rounded-xl border border-line bg-card px-2.5 py-2 text-xs text-ink"
                  />
                </div>
              </div>

              {/* Verified Result Card */}
              {repoVerifiedData && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 space-y-2 animate-fade-in">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                      <strong className="text-xs font-bold text-emerald-400">
                        Repositorio verificado en {repoProvider === 'github' ? 'GitHub' : 'GitLab'}
                      </strong>
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-bold text-emerald-300 uppercase">
                        {repoVerifiedData.visibility}
                      </span>
                    </div>
                    {repoVerifiedData.language && (
                      <span className="text-[10px] text-muted font-medium bg-canvas px-2 py-0.5 rounded border border-line">
                        {repoVerifiedData.language}
                      </span>
                    )}
                  </div>

                  <p className="text-xs font-mono font-semibold text-ink">{repoVerifiedData.fullName}</p>
                  {repoVerifiedData.description && (
                    <p className="text-[11px] text-muted line-clamp-2">{repoVerifiedData.description}</p>
                  )}

                  <div className="flex items-center gap-2 pt-1 text-[11px] text-muted">
                    <span>Rama principal detectada:</span>
                    <span className="font-mono font-semibold text-blue-400 bg-canvas px-2 py-0.5 rounded border border-line">
                      {repoVerifiedData.defaultBranch}
                    </span>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {repoVerifyError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400 flex items-start gap-2">
                  <AlertCircle size={15} className="text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-rose-300">Fallo de verificación</strong>
                    <span>{repoVerifyError}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dynamic Section: AWS Initial Context */}
        {sourceMode === 'aws' && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5 space-y-2 animate-fade-in">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
              <Cloud size={16} />
              Evaluación de Seguridad AWS Nativa
            </div>
            <p className="text-xs text-muted leading-relaxed">
              El proyecto se creará configurado para auditar la cuenta AWS conectada mediante el rol STS de auditoría.
              Podrás ejecutar auditorías bajo demanda o configurar programaciones automáticas de CIS Benchmark y FSBP.
            </p>
          </div>
        )}

        {/* General Project Fields */}
        <div className="border-t border-line pt-4 space-y-4 text-xs">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Datos generales del proyecto</h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-ink mb-1">Nombre del proyecto *</label>
              <input
                required
                minLength={3}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej. Sistema Empresarial V-A"
                className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-xs text-ink focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1">Cliente u Organización (opcional)</label>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="ej. InnovaTech SAC"
                className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-xs text-ink focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-ink mb-1">Descripción del proyecto</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Describe la arquitectura, propósito o contexto de este sistema…"
                className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-xs text-ink focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1">Tipo de aplicación</label>
              <select
                value={applicationType}
                onChange={(e) => setApplicationType(e.target.value as typeof applicationType)}
                className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-xs text-ink"
              >
                {['Web', 'Móvil', 'API', 'Analítica', 'Interna'].map((val) => (
                  <option key={val} value={val}>
                    {val}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1">Ambiente de despliegue</label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as typeof environment)}
                className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-xs text-ink"
              >
                {['Sandbox', 'Staging', 'Producción'].map((val) => (
                  <option key={val} value={val}>
                    {val}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1">Región AWS</label>
              <input
                required
                pattern="[a-z]{2}(-gov)?-[a-z]+-[0-9]"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-xs text-ink font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1">Tecnologías (separadas por coma)</label>
              <input
                value={technologyStack}
                onChange={(e) => setTechnologyStack(e.target.value)}
                placeholder="PHP, PostgreSQL, React, Node.js"
                className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-xs text-ink"
              />
            </div>
          </div>
        </div>

        {/* Creation Error Box */}
        {creationError && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400 flex items-center gap-2">
            <AlertTriangle size={15} className="text-rose-500 shrink-0" />
            <span>{creationError}</span>
          </div>
        )}

        {/* Animated Progress Flow during creation */}
        {saving && (
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 space-y-2.5 animate-fade-in">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-blue-300 flex items-center gap-2">
                <LoaderCircle size={14} className="animate-spin text-blue-400" />
                {creationStep || 'Procesando creación…'}
              </span>
              <span className="font-bold text-blue-400">{creationProgress}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-line overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${creationProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="flex items-center justify-end gap-2.5 border-t border-line pt-4">
          <button
            type="button"
            disabled={saving}
            onClick={closeModal}
            className="rounded-xl border border-line px-4 py-2.5 text-xs font-semibold text-muted hover:text-ink disabled:opacity-50 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || (sourceMode === 'zip' && !archiveFile)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
          >
            {saving ? (
              <>
                <LoaderCircle size={14} className="animate-spin" />
                {sourceMode === 'zip' ? 'Subiendo y creando…' : 'Conectando…'}
              </>
            ) : (
              <>
                {sourceMode === 'zip' ? <Upload size={14} /> : sourceMode === 'repository' ? <GitBranch size={14} /> : <Cloud size={14} />}
                {createdProject ? 'Reintentar carga / conexión' : sourceMode === 'zip' ? 'Crear proyecto y subir ZIP' : sourceMode === 'repository' ? 'Crear proyecto y conectar repo' : 'Crear proyecto'}
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
