# CloudOps — Arquitectura, alcance y plan de implementación

> Plan objetivo, no lista de funciones ya terminadas. Avance concreto: ver [estado y ejecución](docs/IMPLEMENTACION.md) y [modelo implementado](docs/MODELO-DATOS.md). Inventario AWS puntual validado y Red/Infraestructura conectadas a snapshots persistidos; operación AWS permanente con identidad de permisos mínimos, SSO y costos/métricas/seguridad conectados continúan pendientes.

> Actualización de alcance: la validación se orienta a AWS real con toda la aplicación y PostgreSQL locales. FLOCI queda opcional para laboratorio/CI; no se sustituye la implementación de adaptadores AWS por respuestas mock ni se presupone que probar localmente evita cargos de APIs AWS. La activación exige cuenta, región y perfil temporal autorizados.

> Entrega `diegx`: [estado y pendientes detallados](docs/ESTADO-Y-PENDIENTES.md), [arranque desde otra PC](docs/OTRA-PC.md). Git transporta código/migraciones/configuración de ejemplo, no secretos ni datos de PostgreSQL.

## 1. Objetivo

CloudOps evolucionará desde un dashboard React con simulaciones locales hacia una plataforma profesional para:

- inventario de recursos cloud;
- análisis de costos y FinOps;
- observabilidad básica;
- postura de seguridad y cumplimiento;
- auditoría y trazabilidad;
- planificación de arquitecturas AWS.

La primera versión real será **read-only**: consultará información, pero no creará, modificará ni eliminará recursos AWS.

El sistema debe funcionar en tres modos:

1. **Demo:** frontend con datos locales para desarrollo visual.
2. **Local real:** backend local conectado a FLOCI.
3. **AWS real:** backend local o desplegado conectado a una cuenta AWS autorizada.

## 2. Decisiones tecnológicas

### Frontend

- React + TypeScript + Vite.
- React Router.
- Cliente HTTP tipado para consumir FastAPI.
- Modo demo separado del modo API.
- El frontend nunca tendrá credenciales AWS.

### Backend

- Python 3.12+.
- FastAPI.
- Pydantic v2 para validación.
- SQLAlchemy 2.x con soporte asíncrono.
- Alembic para migraciones.
- boto3 para AWS y FLOCI.
- Pytest y pytest-asyncio.
- OpenAPI generado por FastAPI.

### Persistencia

- PostgreSQL como fuente de verdad de CloudOps.
- Docker Compose para desarrollo.
- Volumen persistente para PostgreSQL.
- Migraciones reproducibles desde una base vacía.
- JSONB sólo para payloads externos, evidencia y metadata flexible.

### Entorno cloud local

- FLOCI ejecutado con Docker.
- Puerto local `4566`.
- Imagen de FLOCI fijada a una versión concreta, no `latest`.
- Memoria para pruebas rápidas.
- Persistencia/WAL para desarrollo manual cuando sea necesario.

## 3. FLOCI frente a AWS real

FLOCI es un emulador local compatible con APIs y SDKs AWS. Permite ejecutar desarrollo, integración y CI sin cuenta AWS ni consumo de créditos. No reemplaza completamente a AWS: no representa todas las cuotas, facturación, disponibilidad, límites operativos, latencia regional ni comportamiento administrado de la nube real.

La arquitectura usará un adaptador común:

```text
CloudOps
  |
  +-- CloudProvider interface
          |
          +-- FlociProvider (local/test)
          +-- AwsProvider (AWS real)
```

La lógica de negocio no dependerá directamente de FLOCI ni de boto3. Sólo el adaptador cloud conocerá el proveedor concreto.

### Entornos

| Entorno | Ejecución | Objetivo |
|---|---|---|
| Desarrollo | Docker + FLOCI + PostgreSQL | Trabajo diario sin costo AWS |
| CI | FLOCI efímero + PostgreSQL temporal | Tests de integración |
| Validación real | FastAPI local + boto3 + AWS | Consultas reales read-only |
| Staging futuro | App Runner o ECS/Fargate + PostgreSQL administrado | Validar operación cloud |
| Producción futura | AWS real | Operación controlada |

## 4. ¿Serverless?

La primera versión no será completamente serverless.

La arquitectura principal será FastAPI en contenedor porque:

- mantiene paridad entre local, FLOCI y AWS;
- simplifica workers y sincronizaciones;
- facilita SQLAlchemy, Alembic y debugging;
- evita introducir API Gateway y adaptadores Lambda innecesarios;
- es adecuada para un dashboard administrativo de tráfico bajo o moderado.

Para una prueba real existen dos alternativas válidas:

### Alternativa recomendada: App Runner

```text
Frontend estático
        |
        v
App Runner
FastAPI en contenedor
        |
        v
RDS PostgreSQL
        |
        v
Servicios AWS reales
```

App Runner administra el contenedor, escalado y balanceo.

### Alternativa con más control: ECS/Fargate

```text
Frontend
   |
   v
ALB
   |
   v
ECS/Fargate
FastAPI + Worker
   |
   v
RDS o Aurora PostgreSQL
```

Lambda queda reservada para tareas puntuales, como sincronizaciones programadas, eventos o notificaciones. No es requisito para demostrar que el sistema funciona realmente en AWS.

## 5. Modelo de base de datos

Se utilizará un modelo relacional OLTP normalizado hasta tercera forma normal como mínimo.

La cantidad de tablas no se reducirá artificialmente. La velocidad dependerá de índices, consultas, cardinalidad, paginación, planes de ejecución y diseño de acceso; no de tener menos tablas.

### Entidades principales

```text
workspaces
  ├── workspace_members
  ├── projects
  │    ├── project_members
  │    ├── cloud_connections
  │    │    ├── sync_runs
  │    │    ├── cloud_resources
  │    │    │    ├── resource_snapshots
  │    │    │    ├── resource_payloads
  │    │    │    └── resource_tags
  │    │    ├── cost_snapshots
  │    │    │    └── cost_line_items
  │    │    └── security_findings
  │    ├── architecture_proposals
  │    │    └── proposal_services
  │    └── audit_events
  └── users
```

### Tablas y responsabilidad

#### `users`

Identidad externa compatible con Nexus SSO.

- `id`
- `external_subject`
- `email`
- `display_name`
- `status`
- `created_at`
- `updated_at`

#### `workspaces` y `workspace_members`

Representan el tenant organizacional y sus usuarios.

Roles iniciales: `owner`, `admin`, `analyst`, `viewer`.

#### `projects` y `project_members`

Separan proyectos, permisos y pertenencia. Un usuario puede pertenecer a varios proyectos y un proyecto puede tener varios usuarios.

#### `cloud_providers`, `cloud_regions` y `cloud_services`

Catálogos normalizados para no repetir nombres de proveedor, región o servicio en cada registro.

#### `cloud_connections`

Relacionan un proyecto con FLOCI o AWS.

- proveedor;
- cuenta o identificador externo;
- región predeterminada;
- endpoint;
- estado de validación;
- role ARN cuando aplique.

Las credenciales no se guardarán directamente en PostgreSQL.

#### `sync_runs`

Registran cada sincronización de inventario, costos, métricas, seguridad o auditoría.

#### `cloud_resources`

Representan la identidad estable de un recurso externo.

Restricción única recomendada:

```text
(connection_id, service_id, resource_type, external_id)
```

#### `resource_snapshots`, `resource_payloads` y `resource_tags`

Separan identidad, historial, respuesta cruda y tags. Esto permite reconstruir cambios sin sobrescribir la historia.

#### `cost_snapshots` y `cost_line_items`

Separan el periodo de consulta del detalle por servicio, región, operación y tipo de uso.

#### `security_controls` y `security_findings`

Separan el catálogo de controles de los resultados concretos de una evaluación.

#### `architecture_proposals` y `proposal_services`

Permiten guardar propuestas y sus servicios mediante relación muchos-a-muchos, sin almacenar listas no normalizadas.

#### `audit_events`

Registro append-only de acciones, sincronizaciones, consultas sensibles, exportaciones y futuras operaciones de infraestructura.

## 6. Uso de JSONB

JSONB se utilizará únicamente para:

- respuesta original de AWS/FLOCI;
- evidencia de seguridad;
- metadata variable por servicio;
- configuración externa temporal;
- payloads no normalizados que luego puedan procesarse.

No se usarán JSONB para usuarios, proyectos, roles, permisos, servicios, regiones, conexiones, recursos principales, costos principales ni relaciones.

## 7. API inicial

Todas las rutas estarán bajo `/api/v1`.

```text
POST /auth/mock/login
GET  /auth/me
POST /auth/logout

GET  /projects
POST /projects
GET  /projects/{project_id}
PATCH /projects/{project_id}

GET  /projects/{project_id}/connections
POST /projects/{project_id}/connections
POST /connections/{connection_id}/test

POST /connections/{connection_id}/sync/inventory
POST /connections/{connection_id}/sync/costs
POST /connections/{connection_id}/sync/security

GET /projects/{project_id}/resources
GET /projects/{project_id}/costs
GET /projects/{project_id}/security/findings
GET /projects/{project_id}/audit-events

GET    /projects/{project_id}/proposals
POST   /projects/{project_id}/proposals
GET    /proposals/{proposal_id}
PATCH  /proposals/{proposal_id}
DELETE /proposals/{proposal_id}
```

El login será mock durante la primera implementación, pero usará claims compatibles con Nexus:

```json
{
  "user_id": "user-123",
  "email": "usuario@example.com",
  "project_ids": ["project-1"],
  "roles": ["analyst"],
  "permissions": ["cloud:read", "costs:read"]
}
```

## 8. Servicios AWS iniciales

El núcleo de integración será:

- STS/IAM: identidad y validación de permisos;
- EC2: inventario;
- VPC: regiones, subnets y redes;
- S3: buckets y configuración;
- RDS: inventario de bases de datos;
- CloudWatch: métricas;
- CloudTrail: eventos;
- Cost Explorer: costos;
- Security Hub: hallazgos.

El modo AWS exigirá:

1. validar la cuenta mediante STS;
2. comparar contra una allowlist;
3. validar región;
4. comprobar permisos read-only;
5. registrar la conexión y la sincronización.

## 9. Seguridad y costos

La primera integración AWS no permitirá `create`, `update` ni `delete`.

Se usarán:

- credenciales temporales o roles;
- cuenta sandbox autorizada;
- regiones permitidas;
- política IAM read-only;
- alertas de presupuesto;
- logs estructurados;
- correlation IDs;
- auditoría append-only.

Cost Explorer puede cobrar por solicitud de API. CloudTrail Event History ofrece historial de eventos de administración sin cargo, pero trails, data events, CloudTrail Lake, CloudWatch Logs y almacenamiento pueden generar costos. Security Hub puede tener prueba inicial, pero luego cobra según recursos y capacidades habilitadas. Cada servicio deberá revisarse antes de activarlo.

## 10. Pruebas

### Unitarias

- reglas de autorización;
- normalización de recursos;
- cálculos FinOps;
- validación de conexión;
- paginación;
- manejo de errores AWS/FLOCI;
- aislamiento por proyecto.

### Integración

- FastAPI contra PostgreSQL temporal;
- migraciones Alembic desde cero;
- persistencia de snapshots;
- auditoría;
- restricciones de claves foráneas;
- roles y permisos.

### Contrato cloud

Ejecutadas contra FLOCI:

- S3;
- IAM/STS;
- CloudWatch;
- CloudTrail;
- inventario;
- errores y paginación;
- respuestas boto3.

### Smoke tests AWS

Opcionales y nunca automáticos por defecto:

```env
RUN_AWS_SMOKE_TESTS=true
AWS_ACCOUNT_ALLOWLIST=...
```

### Frontend

- Vitest para hooks y componentes;
- Playwright para navegación;
- pruebas de carga, error y estado vacío;
- prueba de que no existan credenciales AWS en el navegador.

## 11. Docker Compose

Servicios iniciales:

```text
frontend
api
worker
postgres
floci
```

Todos tendrán healthchecks. PostgreSQL tendrá volumen persistente. FLOCI se usará en memoria para tests y con persistencia/WAL para desarrollo manual.

El worker procesará sincronizaciones persistentes desde `sync_runs`. No se añadirá Redis inicialmente; se incorporará sólo si las métricas justifican una cola externa.

## 12. Fases

### Fase 0 — Preparación

- revocar el token Cloudflare expuesto;
- corregir scripts de inicio;
- separar configuración frontend/backend;
- añadir `.env.example`;
- fijar versión de FLOCI;
- definir CI y convenciones.

### Fase 1 — Backend base

- FastAPI;
- PostgreSQL;
- SQLAlchemy;
- Alembic;
- healthchecks;
- logging;
- login mock.

### Fase 2 — Dominio y persistencia

- workspaces;
- proyectos;
- miembros;
- roles;
- propuestas;
- auditoría;
- migración desde `localStorage`.

### Fase 3 — Integración FLOCI

- adaptador boto3;
- prueba de conexión;
- inventario;
- snapshots;
- tests de contrato.

### Fase 4 — AWS real read-only

- STS;
- inventario;
- CloudWatch;
- CloudTrail;
- Cost Explorer;
- Security Hub;
- validación de cuenta y permisos.

### Fase 5 — Frontend conectado

- cliente HTTP;
- dashboard real;
- costos reales;
- seguridad real;
- inventario real;
- estados de sincronización.

### Fase 6 — Despliegue AWS opcional

- App Runner o ECS/Fargate;
- RDS PostgreSQL o Aurora;
- Secrets Manager;
- observabilidad;
- smoke tests reales.

## 13. Provisionamiento futuro

No se implementará en la primera versión, pero se reservará la arquitectura para Terraform/OpenTofu:

```text
Solicitud
   |
Plan Terraform/OpenTofu
   |
Revisión humana
   |
Aprobación
   |
Apply controlado
   |
Inventario + auditoría
```

No se ejecutarán llamadas arbitrarias de creación o eliminación directamente desde FastAPI.

## 14. Criterios de aceptación

La primera versión real deberá:

- iniciar con Docker Compose;
- crear PostgreSQL desde migraciones;
- ejecutar FLOCI localmente;
- conectarse a AWS real sólo con configuración explícita;
- validar cuenta mediante STS;
- guardar inventario y snapshots;
- registrar sincronizaciones y auditoría;
- aislar proyectos y usuarios;
- consumir la API desde el frontend;
- ejecutar tests unitarios, integración y contrato;
- impedir escrituras AWS;
- no almacenar secretos en código ni logs.

## 15. Supuestos

- PostgreSQL será la fuente de verdad de CloudOps.
- FLOCI será entorno de desarrollo y pruebas.
- AWS real será opcional inicialmente.
- El login será mock y compatible con Nexus.
- La primera versión será read-only.
- El backend será la única capa con acceso cloud.
- Serverless no será obligatorio.
- Terraform/OpenTofu se reservará para una fase posterior.
