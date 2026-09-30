# CloudOps — estado actual y pendientes

Corte: **29 de septiembre de 2026**, migración `0002_network`, rama de entrega `diegx`.
Documento de continuidad: lo implementado se distingue de lo probado y de lo todavía planificado. Para arrancar en otra PC, seguir [OTRA-PC.md](OTRA-PC.md).

## 1. Arquitectura efectiva

```text
React / TypeScript / Vite
          │ HTTP mismo origen, Bearer local
        nginx
          │ /api/v1
    FastAPI / Pydantic ───────────── PostgreSQL 16
          │                              │
          │ encola sync_runs              │ cola durable / snapshots / auditoría
          └────────────────────────── worker Python
                                         │ boto3 + guardas
                                         ├── FLOCI opcional, laboratorio/CI
                                         └── AWS read-only opt-in, sin escrituras
```

- Python 3.13 en Docker, SQLAlchemy asíncrono, asyncpg, Alembic y boto3. Versions concretas en requirements/constraints; no depender de un `.venv` copiado.
- PostgreSQL OLTP normalizado, 26 tablas de dominio y `alembic_version`; puentes N:M, FK, índices y CHECK. JSONB sólo conserva evidencia externa.
- Servicios separados: PostgreSQL, migrate/bootstrap, API, worker y frontend; FLOCI/test mediante perfiles. Puertos publicados en loopback.
- Aplicación local completamente funcional **en el alcance conectado descrito abajo**, no todos los módulos del plan. No hay infraestructura AWS desplegada.
- El login mock permite seleccionar perfil sin contraseña: sólo laboratorio. No es SSO ni autenticación productiva. No publicar por túneles o interfaces públicas.

## 2. Implementado y alcance real

| Subsistema | Estado actual | Límite importante |
|---|---|---|
| Sesión | Login mock admin/lector, token opaco con hash DB, expiración 8 horas, logout | SSO y usuarios productivos pendientes |
| Organización y permisos | Workspaces/proyectos, GET y creación de proyecto, membresías persistidas, capacidades por proyecto | Administración completa de proyectos/miembros pendiente; rol local puede elegirse en login mock |
| Propuestas | Alta/listado/reemplazo/eliminación API, catálogos validados, servicios/frameworks mediante puentes, auditoría | Guardar una propuesta no provisiona AWS ni certifica cumplimiento; importación demo pendiente |
| Conexiones | Registro/listado por cuenta/región/proyecto, prueba STS, guardas, interfaz en Operaciones | Prueba STS no valida todos los permisos; edición/eliminación de conexión pendientes |
| Inventario | EC2 instances, VPC, subnets, RDS instances, buckets S3 filtrados por ubicación regional | No inventario global de todos los servicios; no contenido de objetos S3 |
| Worker | Cola PostgreSQL durable, claim SKIP LOCKED, un job activo/conexión, estados/auditoría y snapshot atómico | No scheduler/reintento completo automático; recuperación de abandoned tras 15 minutos |
| Historial | Identidades estables, snapshots/tags/payloads ligados al run; se muestra último succeeded por conexión | Snapshots no equivalen a monitoreo en vivo; retención pendiente |
| Auditoría | Eventos append-only mediante trigger y correlación solicitud/job | No CloudTrail; un administrador DB puede alterar controles; almacenamiento externo protegido pendiente |
| Dashboard API | Inventario, conexiones, propuestas y eventos locales | Sin CPU, tráfico, importes facturados ni scores inventados |
| Red API | VPC/subnets/CIDR normalizados, atributos observados, relaciones y fuente/fecha | Sin rutas, IGW/NAT, ACLs, security groups ni pruebas de conectividad |
| Infraestructura API | Recursos observados, regiones configuradas y zonas desde subnets; filtros/paginación | Sin globo/backbone/latencia/SLA o conmutación inventados |
| Costos/FinOps | Calculadora/estimaciones educativas del frontend | No facturación de la cuenta ni backend de costos reales |
| Seguridad/IAM | Contenido y simulador educativos identificados como no conectados | No findings reales, evaluación IAM ni certificación |
| Catálogo/precios | Material educativo y consulta pública de precios existente | Tarifas públicas no son gasto real ni inventario de una cuenta |
| Docker/CI | Construcción reproducible, migraciones/bootstrap/healthchecks, workflow local con FLOCI | Primera ejecución de CI remoto tras push debe comprobarse; despliegue productivo pendiente |

Modo API es el default, con errores/vacíos visibles y **sin fallback demo**. Demo se conserva sólo por configuración explícita. Los roles/capacidades se verifican también en backend; ocultar botones no sustituye autorización.

## 3. Esquema y trazabilidad

El [diccionario relacional](MODELO-DATOS.md) es la fuente concreta del esquema. `0001_core` define el núcleo; `0002_network` añade `network_vpc_snapshots`, `network_subnet_snapshots` y `network_cidr_blocks`, con backfill de evidencia previa y downgrade que conserva payloads/identidades.

Los CIDR multivaluados tienen fila propia; no se fusionan tablas para reducir joins. Los atributos no informados permanecen NULL. Una VPC sólo referenciada por una subnet conserva identidad, pero no configuración/estado inventados ni conteo de recurso observado. Las relaciones se resuelven en la misma conexión/región y `parent_observed` exige el mismo run; no se construye una topología mezclando snapshots históricos.

Flujo trazable:

1. API autoriza usuario/proyecto, crea `sync_runs(queued)` y `audit_events` con correlación.
2. Worker reclama run, registra started; valida STS/cuenta antes del inventario cloud.
3. Persiste identidades, snapshots, tags, evidencia y atributos normalizados en una transacción de éxito.
4. Un fallo deja safe error code/auditoría y no reemplaza el último éxito. Un éxito vacío sí actualiza la vista sin borrar historia.
5. Los GET consultan PostgreSQL; Actualizar en Red/Infraestructura no invoca cloud ni crea otro run.

Los nuevos DTO de red/estado son tipados y paginados (máximo 200). Completar contratos de salida del resto de la API continúa pendiente.

## 4. Prueba AWS ya realizada, no activación permanente

- Prueba puntual CLI autorizada por el propietario con excepción local para root: succeeded, **9 recursos: 2 buckets, 1 VPC y 6 subnets**, región `us-east-1`. No instancias EC2/RDS devueltas en ese inventario regional.
- Job `343a3719-ba9f-4328-86fa-83a9bf02ad15`; correlación `987398ce-fb63-4b7f-a8da-794665c5a9f0`. Evidencia/auditoría preservadas en PostgreSQL local.
- Upgrade a `0002_network` conservó los 9 payloads con hash idéntico. GET de red como lector devolvió 1 VPC, 6 subnets, 7 bloques CIDR y seis relaciones con parent observado.
- Esta prueba no convirtió root en credencial normal. API/worker permanentes rechazan root, siguen con `aws_enabled=false`, sin montaje de credenciales. La lista de operaciones SDK del adaptador limita el inventario a las lecturas implementadas; no reduce por sí sola los privilegios IAM del perfil.
- No se desplegaron ni modificaron recursos AWS, ni se habilitaron Cost Explorer/CloudWatch/CloudTrail/Security Hub. No se afirma costo cero ni cobertura global. La evidencia no viaja en Git.
- Detalles, excepción y comandos opt-in: [IMPLEMENTACION.md, sección 10](IMPLEMENTACION.md#10-aws-real-con-la-aplicación-local).

## 5. Verificación local más reciente

| Comprobación | Resultado |
|---|---|
| Backend: dominio, guardas, permisos, PostgreSQL, worker y contrato FLOCI | 46 pruebas correctas; 1 smoke AWS omitida intencionalmente |
| Migraciones | Base vacía, drift ORM, downgrade/re-upgrade, evidencia legacy y parent sólo referenciado probados en base temporal |
| Ruff / lint frontend / TypeScript y Vite build | Correctos; advertencia de bundle grande pendiente |
| Unitarias frontend | 5 correctas |
| Playwright | 9 correctas: 5 fixtures UI de red/infra y 4 integraciones API/worker/FLOCI/permisos/propuestas |
| Stack local | API, worker, frontend y PostgreSQL saludables con `0002_network` |

Los fixtures UI son sintéticos y no acreditan AWS real. Los tests FLOCI tampoco acreditan IAM, cuotas, latencia o comportamiento administrado real. La prueba AWS puntual es evidencia separada. Los comandos de reproducción están en [OTRA-PC.md](OTRA-PC.md#pruebas-reproducibles).

## 6. Pendientes priorizados y criterio de cierre

### P0 — seguridad antes de acceso público/AWS continuo

- **Revocar el token Cloudflare expuesto anteriormente**, operación del propietario. El código actual no lo contiene; borrarlo del archivo no revoca el secreto ni lo elimina del historial Git previo. No se reescribe ni fuerza el historial remoto en esta entrega.
- **Sustituir el perfil root** por perfil no-root temporal read-only, revisar permisos adjuntos y allowlists, comprobar cuenta/región y ejecutar smoke normal explícito. No crear usuarios/roles/políticas IAM ni desactivar claves automáticamente.
- **SSO/identidad productiva**: validación de tokens, issuer/audience, expiración, mapeo de roles, sesiones y amenazas; tests de autorización/aislamiento. Hasta entonces, sin publicación del login mock.
- **Privilegios DB/secret management**: rol de runtime separado de migraciones/tests, credenciales privadas/temporales, rotación y TLS según despliegue. Evaluar RLS con pruebas; no afirmar que existe hoy.

### P1 — completar dominio y cobertura observada

- CRUD/DTO de proyectos, administración de membresías y roles, endpoints de consulta individual y decisiones PUT/PATCH. Cierre: contratos OpenAPI de salida y matriz de permisos probada, sin fuga entre proyectos.
- Importación **opt-in** de propuestas `localStorage`: vista previa, validaciones, proyecto destino, control de duplicados/idempotencia y auditoría. No importar mocks silenciosamente.
- Gestión de conexiones: cambios/baja controlados sin destruir historial y sin jobs en carrera. No almacenar secretos en campos del frontend/DB de dominio.
- Ampliar red a route tables, gateways, security groups y ACLs: permisos de lectura revisados, nuevas entidades/puentes normalizados, evidencia y contratos. No inferir Internet público a partir de `MapPublicIpOnLaunch`.
- Mejorar estados/cobertura del dashboard y paginación histórica; no depender de una página reciente de jobs para determinar la totalidad del proyecto.

### P2 — sustituir los módulos aún educativos

- **Costos reales**: modelo de periodos, monedas, dimensiones y line items normalizados; adaptador Cost Explorer o fuente acordada, permisos/costos aprobados, conciliación y distinción factura/estimación. No reutilizar importes simulados como hechos.
- **Métricas**: adaptador CloudWatch, series/unidades/periodos/zonas temporales, agregaciones y retención. Cierre: pruebas de ausencia/atraso/error y valores realmente observados, sin CPU/tráfico generados.
- **Eventos AWS**: adaptador CloudTrail o fuente acordada y tabla/evidencia distinguida de auditoría local. Permisos/alcance/retención y costo explícitos.
- **Seguridad/cumplimiento**: catálogo de controles, findings y evidencia normalizada, severidad/estado/fecha y cobertura. Una selección de framework no acredita cumplimiento; validar origen y reglas.
- **Servicios/precios**: revisar acceso público directo existente y migrar lo cloud al backend conforme a la arquitectura; catálogos versionados y límites/caché. Precios de catálogo no equivalen a costos de la cuenta.
- Para cada bloque: migración explícita, aislamiento/autorización, dominio/integración/contrato FLOCI donde aplique, smoke AWS separado opt-in y actualización de docs/UI. Los stubs de FLOCI nunca se presentan como evidencia de inferencia/servicio real.

### P3 — operación, rendimiento y despliegue

- Backups/restore cifrados probados, retención de snapshots/auditoría, recuperación y eliminaciones controladas. No subir dumps.
- Evaluar EXPLAIN con cardinalidades reales, N+1 en puentes de propuestas, índices inversos, cursor para históricos grandes. Mantener normalización; optimizar por medición, no por cantidad de tablas.
- División del bundle/lazy loading; revisar dependencia tipográfica externa y reproducibilidad offline. Tests accesibilidad/UX adicionales y reporting operativo con fuentes verificables.
- Scheduler/reintentos/idempotencia/backoff con política explícita; instrumentación de API/worker, alarmas reales y recuperación ante fallos prolongados.
- Comprobar CI remoto después de publicar; dependencias/actions e imágenes con actualización revisada, análisis de seguridad/secretos adicional. El detector local incluido es heurístico, no auditoría completa.
- IaC y despliegue futuro, sólo con presupuesto autorizado: frontend → API Gateway/ALB → FastAPI en ECS/Fargate o App Runner → RDS PostgreSQL/Aurora Serverless v2, más worker y secret management. Lambda es opcional, no requisito estructural. No hay stacks cloud creados ni elección/despliegue definitivo en esta entrega.

## 7. Entrega portable y reglas de publicación

Se versionan código frontend/backend, Dockerfiles/Compose, requirements y constraints, package-lock, migraciones, tests, CI, política IAM de ejemplo y documentación.
No se versionan `.env`, `.aws`, claves/tokens, `node_modules`, venvs, builds, caches, logs, reportes de tests ni bases/volúmenes/backups. `.env.example` contiene sólo configuración/defaults de laboratorio.

`infra/check_git_files.py` revisa el **índice Git** antes de publicar y en CI, imprime sólo rutas/categorías si detecta problemas, nunca el valor hallado. No escanea historial ni garantiza descubrir secretos arbitrarios. `.gitignore` no protege archivos que ya estén trackeados; por eso se revisa el índice también.

La copia en otra PC debe crear su propia base/perfiles privados. Si necesitas los datos anteriores, seguir el traslado privado descrito en [OTRA-PC.md](OTRA-PC.md#trasladar-datos-existentes-opcional-privado); no reemplazar una base ni exponer secretos para hacerlo más rápido.

Este documento no certifica finalización global ni seguridad de producción. La fuente del objetivo completo sigue siendo [ARQUITECTURA-Y-PLAN.md](../ARQUITECTURA-Y-PLAN.md); el código/migraciones y los resultados reproducibles determinan qué existe hoy.
