export type Estado = 'activo' | 'revision' | 'inactivo';
export type NivelSeguridad = 'correcto' | 'revision' | 'problema';
export type Disponibilidad = 'basica' | 'alta' | 'critica';

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
  enUso: boolean;
  precioUnitario: number;
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
  continente: 'América' | 'Europa' | 'Asia-Pacífico';
  zonasDisponibilidad: number;
  serviciosDesplegados: string[];
  estado: Estado;
  latenciaMs: number;
  principal: boolean;
  energiaVerde?: boolean;
  coordenadas: { x: number; y: number };
  gps: [number, number];
}

export interface PropuestaCloud {
  id: string;
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
