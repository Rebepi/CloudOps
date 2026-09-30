import type { PropuestaCloud } from '../types/cloud';

// API por defecto. La simulación debe elegirse explícitamente; nunca fallback ante errores.
export const dataMode = import.meta.env.VITE_DATA_MODE === 'demo' ? 'demo' : 'api';
const baseUrl = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1`;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export async function request<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-ID': crypto.randomUUID(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(response.status,
      typeof payload.detail === 'string' ? payload.detail : `Error de API (${response.status})`);
  }
  return response.status === 204 ? undefined as T : response.json();
}

export async function requestAll<T>(path: string, token: string | null): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await request<T[]>(`${path}?limit=200&offset=${offset}`, token);
    all.push(...page);
    if (page.length < 200) return all;
  }
}

export interface Project { id: string; name: string; workspace_id: string; }
export interface Identity {
  id: string; email: string; roles: string[]; permissions: string[];
  project_roles: Record<string, string>; project_permissions: Record<string, string[]>;
}
export interface Connection {
  id: string; name: string; mode: 'floci' | 'aws'; account_id: string;
  region_code: string; last_checked_at: string | null;
}
export interface Resource {
  id: string; connection_id: string; service_code: string; region_code: string; resource_type: string;
  external_id: string; status: string; observed_at: string;
}
export interface SyncRun {
  id: string; status: string; records_processed: number; error_code: string | null; correlation_id: string;
}
export interface AuditEvent { id: string; action: string; result: string; created_at: string; correlation_id: string; }

export interface ObservedRun extends SyncRun {
  created_at: string; finished_at: string | null;
}
export interface InventoryStatus extends Connection {
  last_attempt: ObservedRun | null; last_success: ObservedRun | null;
}
export interface NetworkResource extends Resource {
  mode: 'aws' | 'floci'; account_id: string; snapshot_id: string; sync_run_id: string;
  correlation_id: string; name: string | null;
  cidr_blocks: { cidr: string; association_state: string | null }[];
  is_default: boolean | null; tenancy: string | null;
  vpc_resource_id: string | null; vpc_external_id: string | null; parent_observed: boolean;
  availability_zone: string | null; available_ip_address_count: number | null;
  map_public_ip_on_launch: boolean | null;
}

export interface ProposalDto {
  id: string; name: string; application_type: PropuestaCloud['tipoAplicacion']; description: string;
  region_code: string; estimated_users: number; availability: PropuestaCloud['disponibilidad'];
  migration_goal: string; budget_limit: number | string | null; rto_hours: number | string | null;
  rpo_minutes: number | null; services: string[]; frameworks: string[]; created_at: string;
}

export function fromProposalDto(p: ProposalDto): PropuestaCloud {
  return {
    id: p.id, nombre: p.name, tipoAplicacion: p.application_type, descripcion: p.description,
    regionId: p.region_code, usuariosEstimados: p.estimated_users, disponibilidad: p.availability,
    objetivoMigracion: p.migration_goal, serviciosSeleccionados: p.services, cumplimiento: p.frameworks,
    presupuestoMaximo: p.budget_limit === null ? undefined : Number(p.budget_limit),
    rtoHoras: p.rto_hours === null ? undefined : Number(p.rto_hours),
    rpoMinutos: p.rpo_minutes ?? undefined, creadaEn: p.created_at,
  };
}

export function toProposalDto(p: Omit<PropuestaCloud, 'id' | 'creadaEn'>) {
  return {
    name: p.nombre, application_type: p.tipoAplicacion, description: p.descripcion,
    region_code: p.regionId, estimated_users: p.usuariosEstimados, availability: p.disponibilidad,
    migration_goal: p.objetivoMigracion, services: p.serviciosSeleccionados,
    frameworks: p.cumplimiento ?? [], budget_limit: p.presupuestoMaximo ?? null,
    rto_hours: p.rtoHoras ?? null, rpo_minutes: p.rpoMinutos ?? null,
  };
}
