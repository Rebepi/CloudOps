# Modelo relacional implementado

PostgreSQL 16, OLTP normalizado; migraciones `0001_core` → `0002_network` en `backend/migrations/versions/` y modelos `backend/app/models.py`.
Son 26 tablas de dominio (más `alembic_version`). No se usa `create_all()` en runtime.

## Relaciones

```text
users ──< workspace_members >── workspaces ──< projects
  │                                             │
  ├──< auth_sessions                            ├──< project_members >── users
  │                                             ├──< architecture_proposals
  │                                             │       ├──< proposal_services >── cloud_services
  │                                             │       └──< proposal_frameworks >── compliance_frameworks
  └──< audit_events >────────────────────────────┤
                                                └──< cloud_connections ──< sync_runs
                                                        └──< cloud_resources
                                                                 └──< resource_snapshots >── sync_runs
                                                                         ├── resource_payloads (0..1)
                                                                         ├──< resource_tags
                                                                         ├── network_vpc_snapshots (0..1)
                                                                         ├── network_subnet_snapshots (0..1)
                                                                         │       └──> cloud_resources (VPC referenciada)
                                                                         └──< network_cidr_blocks
roles ──< role_permissions >── permissions
roles ──< workspace_members / project_members
cloud_providers ──< cloud_regions / cloud_services
```

`resource_payloads` y tags pertenecen al snapshot, no a la identidad estable del recurso.
Las conexiones referencian región; FLOCI/AWS es el modo de ejecución. No se repite nombre del proveedor en cada recurso.

## Diccionario resumido

Entidades con `id` usan UUID y `created_at` timezone-aware, salvo sesiones/tablas puente/catálogos.

| Tabla | Clave y relaciones | Atributos/responsabilidad |
|---|---|---|
| users | PK id; subject/email únicos | external_subject, email, display_name; identidad externa |
| roles | PK code | owner, admin, analyst, viewer |
| permissions | PK code | capacidades declaradas |
| role_permissions | PK (role_code, permission_code), dos FK | N:M roles/capacidades |
| workspaces | PK id; slug único | organización local |
| workspace_members | PK (workspace_id, user_id), FK role | N:M usuarios/organizaciones |
| projects | PK id; FK workspace/created_by; UNIQUE (workspace, slug) | nombre, descripción |
| project_members | PK (project_id, user_id), FK role | N:M usuarios/proyectos; autorización |
| auth_sessions | PK token_hash; FK user | hash SHA-256 y expires_at; nunca token original |
| cloud_providers | PK code | catálogo AWS |
| cloud_regions | PK code; FK provider | partition; catálogo inicial comercial AWS |
| cloud_services | PK code; FK provider | nombre del servicio; catálogo de planificación |
| cloud_connections | PK id; FK project/region | nombre, mode, account_id, last_checked_at |
| sync_runs | PK id; FK connection/requested_by | tipo, estado, correlación, inicio/fin, conteo, código de error |
| cloud_resources | PK id; FK connection/service/region | tipo, external_id, ARN opcional; identidad estable |
| resource_snapshots | PK id; FK resource/run; UNIQUE (resource, run) | estado observado e historial |
| resource_payloads | PK/FK snapshot_id | única columna JSONB de evidencia externa |
| resource_tags | PK (snapshot_id, key), FK snapshot | tags históricos, key/value atómicos |
| network_vpc_snapshots | PK/FK snapshot_id | IsDefault y tenancy observados; NULL si no informados |
| network_subnet_snapshots | PK/FK snapshot_id; FK vpc_resource_id | zona, IPs disponibles y asignación pública automática; CHECK de IPs no negativas |
| network_cidr_blocks | PK (snapshot_id, cidr), FK snapshot | un bloque IPv4/IPv6 por fila, tipo PostgreSQL CIDR y estado de asociación nullable |
| compliance_frameworks | PK code | catálogo de marcos; selección no equivale a certificación |
| architecture_proposals | PK id; FK project/created_by/region | nombre, tipo, usuarios, disponibilidad, objetivos, presupuesto, RTO/RPO |
| proposal_services | PK (proposal_id, service_code), dos FK | servicios seleccionados normalizados |
| proposal_frameworks | PK (proposal_id, framework_code), dos FK | cumplimiento seleccionado normalizado |
| audit_events | PK id; FK actor/project opcional | acción, entity_id lógico, resultado, correlación; append-only |

`entity_id` de auditoría es una referencia lógica polimórfica, no FK a una entidad concreta: conserva el identificador de una propuesta eliminada. La acción indica el tipo de entidad.
Sólo los hijos de propuestas usan CASCADE al borrarse la propuesta; auditoría e inventario no se borran por cascada.

## Invariantes y normalización

- Una relación N:M tiene fila por asociación; no listas de servicios/roles en una columna.
- Nombres de servicio, proveedor y región no se duplican en hechos operacionales.
- Identidad cloud única por `(connection_id, service_code, region_code, resource_type, external_id)`.
- Conexión única por `(project_id, mode, account_id, region_code)`; cuenta de 12 dígitos y modo limitado mediante CHECK.
- Índice parcial único impide dos sincronizaciones queued/running de una conexión.
- Estados y tipo de sincronización limitados por CHECK; este incremento sólo soporta inventory.
- Presupuesto/RTO/RPO no negativos, usuarios ≥1 y disponibilidad válida en PostgreSQL y Pydantic.
- Importes `NUMERIC`, no flotantes para persistencia; no representan facturación real.
- Snapshot enlaza la observación con su ejecución; payload original separado no sustituye columnas consultables.
- Atributos de red dependen del snapshot: no sobrescriben configuración histórica ni duplican cuenta, región o proveedor.
- CIDR multivaluado se representa en filas, no arrays JSON ni columnas numeradas. La familia IPv4/IPv6 se valida y el bloque se normaliza antes de persistir.
- Subnet referencia una identidad VPC de la misma conexión y región. Una referencia sin observación puede crear esa identidad, pero nunca un snapshot, estado ni configuración inventados.
- `parent_observed` sólo es verdadero cuando la VPC tiene snapshot en la misma ejecución; no se mezcla una VPC histórica con una subnet actual. Identidades referenciadas sin snapshot no cuentan como recursos observados.
- Trigger impide UPDATE/DELETE de auditoría. No sustituye controles de privilegios del administrador DB ni almacenamiento externo resistente a manipulación.

El esquema evita dependencias transitivas de nombres de catálogo y atributos multivaluados, siguiendo 3FN.
Historial y evidencia tienen propósito propio; no se fusionan tablas para ahorrar joins.
No se almacena configuración de credenciales/endpoint por usuario. No hay tabla de facturas, controles o métricas todavía.

## Índices y evolución

FK prioritarias de workspace/proyecto/conexión, cola por estado/creación y auditoría por proyecto/fecha tienen índices explícitos.
La FK subnet→VPC está indexada. Los CIDR se consultan en batch para la página de resultados, sin una consulta de payload por recurso.
Las PK compuestas cubren consultas que empiezan por su primer componente; no reemplazan índices por user_id si crecen consultas inversas.
Medir EXPLAIN ANALYZE con cardinalidades realistas antes de añadir índices, particiones o denormalización.
Pendientes: consultas batch de puentes de propuestas, paginación por cursor para historiales grandes, retención y estrategia de backup.

Toda evolución requiere nueva migración versionada; no editar `0001_core` después de su publicación.
El test de migración comprueba upgrade desde vacío, ausencia de drift ORM, downgrade y re-upgrade sobre una base aislada.
`0002_network` es autocontenida y transforma evidencia existente sin importar helpers del runtime. Valida atributos/CIDR; datos malformados abortan la migración transaccionalmente. No modifica ni borra los payloads originales. Su downgrade elimina sólo las tres tablas de detalles; conserva evidencia e identidades cloud, incluidas referencias VPC sin observación. El test también migra evidencia antigua con IPv4/IPv6, relaciones y una VPC sólo referenciada.
La readiness de la API requiere `0002_network`. En el volumen local se verificó que los 9 payloads del inventario AWS previo conservaron exactamente su hash tras el upgrade.
La futura seguridad de tenant debe evaluar RLS y permisos DB mínimos; actualmente el aislamiento es por autorización API, no RLS.
