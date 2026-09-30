# CloudOps — estado de implementación conectada

Este documento describe código implementado, no promete que el plan completo esté terminado.
El alcance estratégico está en [ARQUITECTURA-Y-PLAN.md](../ARQUITECTURA-Y-PLAN.md).
El esquema concreto está en [MODELO-DATOS.md](MODELO-DATOS.md).
Resumen de continuidad: [estado actual y pendientes](ESTADO-Y-PENDIENTES.md). Clonación/arranque en otra PC: [OTRA-PC.md](OTRA-PC.md).

## 1. Qué funciona

- API FastAPI, validación Pydantic, SQLAlchemy asíncrono y PostgreSQL.
- Migraciones Alembic explícitas `0001_core` → `0002_network`; bootstrap idempotente del laboratorio.
- Sesiones locales admin/lector: token opaco, sólo su hash en PostgreSQL, vencimiento de 8 horas y logout revocable.
- Workspaces, proyectos, membresías y permisos por proyecto.
- Propuestas persistidas con servicios y marcos de cumplimiento en tablas puente.
- Conexiones FLOCI, validación de identidad STS e inventario EC2, VPC, subnets, RDS y buckets S3 de la región.
- Worker separado, cola durable PostgreSQL, snapshots históricos, tags y payload externo JSONB.
- Auditoría append-only, protegida por trigger PostgreSQL; correlación de solicitud, job y eventos.
- Frontend modo API por defecto: sesión, permisos por proyecto, planificación persistida, dashboard con datos del backend y pantalla `/operations`.
- Red e Infraestructura en modo API consultan inventario persistido: VPC/subnets/CIDR normalizados, procedencia y fecha, filtro de conexión y estados vacío/error; simuladores conservados sólo en demo explícito.
- Docker Compose con volúmenes, healthchecks y puertos ligados a `127.0.0.1`.
- Pruebas unitarias, integración PostgreSQL, migraciones, contrato FLOCI y navegador; CI local sin AWS.

La interfaz cloud comparte un adaptador boto3 con modos `floci`/`aws`; FLOCI no es un proveedor comercial distinto de AWS.
El adaptador AWS tiene guardas y smoke test opt-in. Se validó una sincronización real de inventario mediante la excepción CLI puntual descrita en la sección 10; la conexión permanente con un perfil de permisos mínimos sigue pendiente.

## 2. Arranque recomendado

Requisito: Docker Desktop con motor Linux activo y puertos 5432, 8000 y 27901 libres. Puerto 4566 sólo si se habilita FLOCI.
Desde la raíz:

```powershell
docker compose up -d --build
docker compose ps
```

También puede ejecutarse `iniciar_sistema.bat`. No instala Docker ni abre un túnel público.
La configuración local funciona con valores de laboratorio del Compose; `.env.example` documenta overrides.
Si se crea `.env`, nunca debe versionarse ni usarse con credenciales productivas.

- Frontend: http://127.0.0.1:27901
- API/OpenAPI: http://127.0.0.1:8000/docs
- Liveness: `/health/live`; readiness: `/health/ready`.
- FLOCI opcional: http://127.0.0.1:4566 (sin consola ni acceso al socket Docker).

La migración se ejecuta antes de API/worker. El bootstrap crea workspace `local`, proyecto `laboratorio` y dos perfiles mock.
AWS real es el destino de la aplicación; FLOCI queda como laboratorio opcional y herramienta de contrato/CI.
Para ese laboratorio, primero ejecutar `docker compose --profile floci up -d floci`; después entrar como administrador, abrir Operaciones, conectar FLOCI, validar identidad y sincronizar inventario.
Una cuenta local vacía puede devolver cero recursos: no se fabrican recursos en el inventario para llenar la pantalla.
Las pruebas de contrato crean y eliminan su propio bucket **únicamente en FLOCI**.

Para detener conservando datos:

```powershell
docker compose stop
```

`apagar_sistema.bat` hace lo mismo. No usar `down -v` salvo que se quiera destruir deliberadamente los datos locales.
Cambiar la contraseña del `.env` no cambia automáticamente la de un PostgreSQL ya inicializado en el volumen.

## 3. Desarrollo fuera de contenedores

Mantener PostgreSQL en Docker; FLOCI sólo si se usa su laboratorio. Backend, desde `backend/`:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m app.bootstrap
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

En otra terminal del backend: `.\.venv\Scripts\python.exe -m app.worker`.
Las rutas nativas por defecto apuntan a PostgreSQL/FLOCI en localhost. El archivo `.env` se lee relativo al directorio de ejecución.
Usar los defaults locales o un `backend/.env` privado si se cambia la configuración del Compose.
No correr simultáneamente API Docker y API nativa sobre el mismo puerto.

Frontend, desde `frontend/`:

```powershell
npm ci
$env:VITE_DATA_MODE='api'
npm run dev
```

Vite y el build Docker usan API por defecto. Demo requiere `VITE_DATA_MODE=demo` explícito; un error de API no activa un fallback demo.
`VITE_API_BASE_URL` vacío usa el proxy de mismo origen; nunca incluir keys AWS en variables `VITE_*`.
El token del laboratorio se conserva en `sessionStorage`, no en la persistencia de propuestas demo.

## 4. Flujo y garantías

```text
Usuario → POST sync/inventory → sync_runs(queued) + auditoría
                                   |
Worker → claim PostgreSQL SKIP LOCKED → running
       → STS valida cuenta → lecturas boto3 limitadas
       → transacción: identidades + snapshots + tags + payloads + succeeded
       → frontend consulta último inventario completo
```

Una conexión admite un solo job activo mediante índice único parcial. Doble clic devuelve el job existente o 409 ante carrera.
Una lectura fallida no reemplaza el último inventario correcto. Un inventario posterior vacío retira recursos de la vista actual sin borrar su historia.
Una caída deja el job running: después de 15 minutos el worker lo marca failed/worker_interrupted; el usuario puede solicitar otra ejecución.
No hay reintento automático de un job completo ni sincronización parcial silenciosa.
Lecturas boto3 bloqueantes se ejecutan fuera del event loop. Hay timeouts SDK, límite de 100 páginas por operación, 2.000 recursos y presupuesto temporal de 300 segundos (cooperativo, no cancelación forzada).
S3 exige permiso de listado y consulta de ubicación; no se lee contenido de objetos ni se recopilan todos sus atributos/tags.

Los permisos del servidor se verifican por membresía del proyecto, no por botones del navegador.
Sin pertenencia se responde 404; sin permiso, 403. La UI usa `project_roles` y `project_permissions` del proyecto seleccionado y bloquea formulario/guardado/eliminación al lector; nunca sustituye la autorización del servidor.
El endpoint de prueba sólo verifica identidad STS: no certifica permisos para todos los servicios.
Logs HTTP incluyen método, ruta, duración, estado y correlación; no incluyen cuerpos ni tokens.

## 5. API de este incremento

Prefijo `/api/v1`; sesión Bearer salvo login:

| Área | Rutas implementadas |
|---|---|
| Sesión | POST `/auth/mock/login`; GET `/auth/me`; POST `/auth/logout`; GET `/runtime` (estado de habilitación AWS, sin credenciales) |
| Organización | GET `/workspaces`; GET/POST `/projects` |
| Catálogos | GET `/catalogs` |
| Conexiones | GET/POST `/projects/{id}/connections`; POST `/connections/{id}/test` |
| Inventario | POST `/connections/{id}/sync/inventory`; GET `/projects/{id}/resources`; GET `/projects/{id}/sync-runs` |
| Inventario observado de red | GET `/projects/{id}/inventory-status`; GET `/projects/{id}/network/resources` (DTOs tipados, sin payloads originales) |
| Propuestas | GET/POST `/projects/{id}/proposals`; PUT/DELETE `/proposals/{id}` |
| Auditoría | GET `/projects/{id}/audit-events` |

Listados de proyectos/propuestas/recursos/jobs/auditoría/estado de inventario/red aceptan `limit` (máximo 200) y `offset`.
Operaciones muestra las últimas 50 sincronizaciones y 50 eventos; el inventario usa paginación.
`PUT` reemplaza completamente una propuesta: `PATCH`, consulta individual y administración de miembros quedan pendientes.
No hay endpoints de costos, métricas ni seguridad implementados aún.

## 6. Pruebas reproducibles

Desde la raíz, comprobación Linux integral:

```powershell
docker compose --profile test run --build --rm test
```

El perfil crea `cloudops_test` sin borrar bases existentes, migra, ejecuta Ruff y Pytest.
Las pruebas de migraciones crean una base aleatoria con sufijo `_test`, hacen upgrade/check/downgrade/upgrade y eliminan **sólo esa base creada por la prueba**.
Las otras pruebas DB usan transacciones con rollback. No ejecutar este perfil con un rol de producción.

Desde `frontend/`:

```powershell
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

E2E requiere el stack Docker iniciado y deja conexión/auditoría/jobs de laboratorio; no toca AWS real.
CI ejecuta esta misma integración con FLOCI. El workflow sólo correrá al subirlo a GitHub.
En Windows, si la política de aplicaciones bloquea Ruff, usar el perfil Docker; no desactivar la política de seguridad.
Dependencias Python directas y transitivas se fijan en requirements/constraints; npm usa package-lock.

## 7. AWS real: preparación, no activación

Compose fuerza `ALLOW_AWS=false` y no monta credenciales. AWS smoke está omitido por defecto.
Antes de una prueba real: revocar secretos expuestos, cuenta sandbox autorizada, credenciales temporales, política IAM mínima, revisión de costos y aprobación del alcance.
El backend podría seguir local: probar AWS no requiere desplegar App Runner/ECS/RDS.
La bandera sola no basta: cuenta y región deben estar en `AWS_ACCOUNT_ALLOWLIST`/`AWS_REGION_ALLOWLIST` (listas JSON); STS debe devolver exactamente la cuenta esperada.
El SDK ignora overrides globales de endpoint en modo AWS. No se aceptan endpoints enviados por el navegador.
Un smoke test AWS requiere adicionalmente `RUN_AWS_SMOKE_TESTS=true` y `AWS_TEST_ACCOUNT_ID`; sólo consulta identidad.
No habilitar automáticamente CloudWatch, CloudTrail, Cost Explorer, Security Hub ni infraestructura de pago.
El estado actual no acredita comportamiento IAM real, cuotas, rendimiento ni seguridad administrada de AWS.

## 8. Pendientes priorizados y trazabilidad

| Prioridad | Pendiente | Criterio de cierre |
|---|---|---|
| Inmediata | Revocar token Cloudflare previamente expuesto | Revocación verificada por el dueño; nunca copiarlo de nuevo |
| Siguiente | Migración opt-in de propuestas localStorage | Vista previa, validación, proyecto destino, duplicados/idempotencia y auditoría |
| Siguiente | Completar contratos OpenAPI de salida y CRUD de proyectos/miembros | DTOs y pruebas de autorización específicas |
| Siguiente | SSO Nexus y sesiones productivas | Tokens verificados, roles mapeados, expiración y amenazas documentadas |
| Siguiente | Operación AWS read-only con identidad no-root | Perfil temporal de permisos mínimos, cuenta/región comprobadas; el smoke excepcional ya está registrado en sección 10 |
| Posterior | Costos reales | Nueva migración normalizada periodos/detalles/moneda, sin confundir estimaciones con facturas |
| Posterior | Métricas, eventos y seguridad | Adaptadores separados, historial/evidencia, tests FLOCI y reales opt-in |
| Posterior | Ampliar inventario de red | Rutas, gateways, security groups y ACLs con nuevas entidades normalizadas, evidencia y permisos revisados |
| Posterior | Backups, RLS evaluada, rol DB mínimo y retención | Restore probado, aislamiento revisado y eliminación controlada |
| Posterior | Despliegue cloud y telemetría operativa | IaC, secret management, worker independiente, presupuesto aprobado |

No se importaron propuestas demo automáticamente: `localStorage` se conserva y no contamina PostgreSQL.
El dashboard API consulta inventario, conexiones, propuestas y auditoría del backend: no muestra CPU, tráfico, facturación ni scores inventados. Red e Infraestructura también consultan PostgreSQL; sus simuladores sólo existen en demo explícito. FinOps estimado e IAM/seguridad simulados aún requieren sustitución: la franja identifica esas pantallas como no conectadas. No representan una cuenta AWS.
La fase 0 sigue pendiente de revocación externa; fases 1–3 tienen un primer núcleo implementado y probado; fase 2 no termina hasta resolver importación/administración; fases 4–6 no están completas.
El login mock permite elegir administrador sin contraseña: **laboratorio en loopback, nunca publicar en Internet**. La configuración rechaza `AUTH_MODE=mock` en producción.
El usuario PostgreSQL local tiene privilegios de laboratorio para migraciones/tests, no representa la política de privilegios de producción.
Antes de escalar: evaluar N+1 en propuestas, planes EXPLAIN, índices de usuario en tablas puente, retención de snapshots y tamaño del bundle frontend; no reducir tablas por intuición.

## 9. Verificación y recuperación tras reinicio

Verificado el 29 de septiembre de 2026, incluyendo una recuperación tras reinicio de la laptop:

- Backend: **18 pruebas correctas**, incluida integración PostgreSQL, migraciones y contrato FLOCI. **1 omitida**: smoke AWS real, desactivado intencionalmente.
- Frontend: **5 pruebas unitarias correctas** y **3 E2E correctas** (inventario/auditoría, restricciones del lector y propuesta persistida tras recargar).
- Ruff y lint frontend correctos; build TypeScript/Vite correcto antes del reinicio. Queda una advertencia de tamaño del bundle, no un error de compilación.
- API, worker, frontend, PostgreSQL y FLOCI saludables después del reinicio. Migración `0001_core` y eventos de auditoría anteriores al reinicio conservados en el volumen PostgreSQL.
- Workflow CI creado, pero no ejecutado en GitHub ni subido automáticamente. No se ha conectado este laboratorio a AWS real.

Para recuperar el laboratorio sin reconstruir imágenes ni borrar datos, iniciar Docker Desktop, esperar que el motor Linux esté listo y ejecutar desde la raíz:

```powershell
docker compose up -d api worker frontend
docker compose ps
```

El arranque automático del motor Docker puede iniciar el worker antes de que PostgreSQL esté disponible; durante esa transición puede aparecer un healthcheck fallido y un error de conexión. Comprobar que se recupere cuando PostgreSQL esté saludable. Si persiste, revisar `docker compose logs --tail 50 worker`; no eliminar volúmenes como solución.
Esta comprobación valida la recuperación del proyecto, **no determina la causa del reinicio de Windows**.
Los cambios de código están guardados en el directorio de trabajo; no se creó un commit automáticamente.

## 10. AWS real con la aplicación local

Decisión actual: frontend, FastAPI, worker y PostgreSQL permanecen en la laptop; el adaptador consulta AWS real. No se desplegarán ECS, App Runner, Lambda ni RDS para esta prueba. FLOCI sólo se inicia explícitamente para laboratorio/contratos; no es requisito del backend.

Implementado para esa transición:

- `compose.aws.yaml`: override opt-in que monta el directorio AWS del host en modo lectura sólo en API/worker. No copia credenciales a imágenes ni las envía al frontend.
- Formulario de conexión AWS por cuenta/región en Operaciones, bloqueado mientras AWS no esté habilitado o el usuario no tenga permiso.
- `infra/iam/cloudops-inventory-readonly.json`: ejemplo de permisos mínimos del inventario actual, no política aplicada automáticamente. No incluye escritura, Cost Explorer ni métricas.
- Dashboard API separado de demo, roles por proyecto visibles, campos del lector deshabilitados y pruebas de POST/PUT/DELETE rechazadas con 403 incluso evitando la UI.
- Notificaciones AWS fabricadas y badge de salud constante eliminados del modo API; reportes globales educativos no se exportan como operativos.

**La conexión permanente del backend con AWS real sigue deshabilitada.** La primera consulta dentro del sandbox no pudo localizar el perfil del host; una comprobación posterior con autorización encontró el perfil `default`, región `us-east-1`. STS confirmó credenciales válidas, pero su identidad es **root**. Esa comprobación inicial sólo consultó identidad. Posteriormente, por autorización explícita del propietario, se ejecutó el inventario puntual documentado al final de esta sección; nunca se montaron credenciales en los contenedores habituales ni se modificaron recursos AWS.

El adaptador rechaza identidades root en modo AWS con `aws_root_credentials_forbidden`, después de comprobar cuenta y antes de leer inventario. FLOCI conserva su identidad emulada para los tests locales. Esta protección no demuestra que un usuario/rol tenga permisos mínimos: su política IAM debe revisarse por separado.

Cuando esos datos estén definidos, configurar un `.env` privado con `ALLOW_AWS=true`, las allowlists JSON, `AWS_PROFILE` y `AWS_SHARED_CONFIG_DIR` (ruta absoluta al directorio `.aws` del host). No guardar claves estáticas en ese archivo ni montar el directorio personal completo. Para SSO, iniciar sesión con AWS CLI en el host y renovar allí las credenciales vencidas; el montaje del contenedor es read-only.

Comando opt-in, **sólo después de configurar y autorizar cuenta/perfil/región**:

```powershell
docker compose -f compose.yaml -f compose.aws.yaml up -d --build api worker frontend
```

El ejemplo presupone perfiles SSO o credenciales temporales compartidas compatibles con boto3. Un perfil que use un `credential_process` dependiente de programas del host puede no funcionar dentro del contenedor; no se considera validado hasta probarlo.

En Operaciones: registrar conexión AWS, validar identidad STS y solicitar inventario. Guardar una propuesta **no aprovisiona** recursos: es una propuesta persistida, no un despliegue. La integración sigue siendo read-only.
Si falta un permiso o un servicio no devuelve datos, debe verse fallo/estado vacío explícito; no se reemplaza la respuesta por datos demo.

Pendientes reales: autenticación Nexus/productiva, CloudWatch, CloudTrail, Cost Explorer y controles de seguridad. Conectar una cuenta no implementa automáticamente esos adaptadores. Cost Explorer cobra por solicitudes API; mantenerlo deshabilitado hasta aprobar su uso. [Precios oficiales](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/pricing/).

Verificación posterior a estas correcciones: 19 pruebas backend correctas y 1 smoke AWS omitida; 5 unitarias frontend y 4 E2E correctas. Se verificó rol lector en la interfaz y rechazo del servidor para crear, editar y eliminar propuestas.

### Perfil seguro pendiente

1. No reutilizar las credenciales root de `default` en CloudOps. AWS recomienda no crear access keys root y utilizar credenciales temporales y privilegios mínimos. [Buenas prácticas oficiales](https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html).
2. Configurar una identidad no-root dedicada con el nombre de perfil `cloudops-readonly`, preferiblemente mediante IAM Identity Center/SSO o un rol con credenciales temporales. Usar la política de ejemplo `infra/iam/cloudops-inventory-readonly.json` como alcance del inventario actual; revisar otras políticas adjuntas, pues ésta no revoca permisos ya concedidos.
3. Crear usuarios, roles o políticas IAM requiere autorización adicional: no se realizan esas escrituras AWS desde esta implementación. Tampoco se eliminan ni desactivan claves del host automáticamente.
4. Verificar STS con el perfil nuevo y la cuenta/región previstas; después configurar las allowlists y activar el override local. No compartir access keys ni secret keys por chat ni guardarlas en el repositorio.
5. Revisar y retirar las access keys root desde la consola AWS, y proteger root con MFA, como operación separada del propietario de la cuenta. Si otras herramientas las usan, preparar primero su sustitución.

La app continúa local y AWS permanece deshabilitado hasta resolver ese perfil. No se desplegaron servicios cloud ni se habilitaron APIs de costos.

Verificación de esta protección: Ruff correcto y **24 pruebas backend correctas, 1 omitida** (smoke AWS opt-in). Incluye rechazo de root en tres particiones antes del inventario, aceptación de identidades no-root y contrato FLOCI. Los tests usan respuestas STS simuladas; la comprobación CLI real fue sólo de identidad y no sustituye el smoke del backend.

### Excepción puntual root autorizada por el propietario

Por solicitud explícita del propietario, se añadió `python -m app.aws_readonly_smoke` para una prueba de inventario de **una ejecución**. No es el modo normal ni la configuración recomendada.

- Requiere `RUN_AWS_SMOKE_TESTS=true`, `--execute`, cuenta, región y UUID del proyecto explícitos. Root requiere además `--allow-root`; sólo se admite en entorno `local`.
- API y worker normales siguen rechazando root: `provider_for` nunca pasa esta excepción. No se habilita `ALLOW_AWS` en Compose ni se montan credenciales en los contenedores habituales.
- El proceso usa las credenciales compartidas del perfil CLI desde el host, sin copiarlas al repositorio. La cuenta devuelta por STS debe coincidir antes de consultar inventario.
- El adaptador AWS limita las operaciones SDK a `GetCallerIdentity`, `DescribeInstances`, `DescribeVpcs`, `DescribeSubnets`, `DescribeDBInstances`, `ListBuckets` y `GetBucketLocation`. Rechaza otras operaciones antes de construir parámetros de la solicitud. FLOCI conserva las escrituras de sus fixtures locales.
- Es una defensa de aplicación, **no una reducción de privilegios IAM**: root conserva control total si otro código/proceso accede a sus credenciales. Recomendación permanente: sustituirlo por un perfil de lectura con credenciales temporales. [AWS](https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html).
- Se registra aprobación excepcional, conexión, `sync_runs`, estados del worker, snapshots y auditoría con una misma correlación. El actor local queda identificado como `mock:admin`; no se presenta como login productivo ni como prueba de identidad personal del dueño.
- El worker permite reclamar un UUID de job específico, para no consumir otras tareas. Detener el worker habitual durante la prueba evita que reclame el job excepcional con su configuración AWS deshabilitada; reiniciarlo en `finally`.
- No crea/modifica/elimina recursos AWS, no lee objetos S3, ni llama a Cost Explorer, CloudWatch, CloudTrail o Security Hub. Sigue limitada a la región seleccionada; no representa un inventario global de la cuenta. No garantiza facturación cero por APIs de lectura.

Ejemplo deliberadamente sin cuenta ni proyecto reales (sustituir los placeholders sólo con datos autorizados):

```powershell
# Desde la raíz; Docker/PostgreSQL deben estar activos y backend/.venv instalado.
$env:AWS_PROFILE='default'
$env:RUN_AWS_SMOKE_TESTS='true'
docker compose stop worker
try {
    Push-Location backend
    try {
        .\.venv\Scripts\python.exe -m app.aws_readonly_smoke --execute --allow-root --account CUENTA_AUTORIZADA --region us-east-1 --project-id UUID_PROYECTO
    } finally { Pop-Location }
} finally {
    Remove-Item Env:RUN_AWS_SMOKE_TESTS -ErrorAction SilentlyContinue
    docker compose start worker
}
```

El comando termina con un resumen seguro de estado/conteos e identificadores de auditoría; no imprime payloads ni claves. Los resultados persistidos se consultan en Dashboard y Operaciones, incluso con AWS deshabilitado después. Volver a sincronizar por la API requiere el perfil seguro y la habilitación normal: no se extiende la excepción al frontend. Guardar propuestas sigue sin desplegar recursos.

### Resultado real verificado — 29 de septiembre de 2026

- Prueba CLI excepcional autorizada con el perfil del host, cuenta comprobada por STS y región `us-east-1`: **succeeded**, sin error, **9 recursos**.
- Desglose observado: **2 buckets S3, 1 VPC y 6 subnets**. El inventario no devolvió instancias EC2 ni RDS en esa región; no es una afirmación sobre otras regiones o servicios.
- Job local: `343a3719-ba9f-4328-86fa-83a9bf02ad15`; correlación: `987398ce-fb63-4b7f-a8da-794665c5a9f0`. Auditoría verificada: conexión creada, excepción root autorizada, job queued/started/succeeded.
- La API devolvió esos nueve recursos desde PostgreSQL. Frontend respondió HTTP 200; se pueden consultar en Dashboard y Operaciones del proyecto `Laboratorio local`. Es un snapshot de esa ejecución, no monitoreo continuo ni todos los módulos conectados.
- Proceso puntual terminado, worker reiniciado y API normal comprobada con **`aws_enabled=false`**. No se copiaron claves al repositorio, no se montó `.aws` en API/worker y no se desplegó infraestructura cloud.
- Ruff correcto y **34 pruebas backend correctas, 1 smoke estándar omitida** por opt-in desactivado en la suite local/CI. La prueba real fue el CLI aislado, no esa prueba omitida. Los casos nuevos cubren excepción local, doble opt-in, bloqueo de escrituras SDK, selección exacta de job y persistencia/auditoría.
- Costos, métricas, CloudTrail, seguridad y autenticación productiva continúan pendientes. Root no se convierte en la credencial de operación normal por haber pasado esta prueba.

## 11. Red e Infraestructura conectadas — 29 de septiembre de 2026

Bloque implementado y desplegado en el stack local. No se volvió a ejecutar la prueba AWS ni se habilitaron credenciales en API/worker.

### Backend, persistencia y trazabilidad

- `0002_network` agrega tres tablas normalizadas para detalles de VPC, detalles de subnet y bloques CIDR. No se reducen tablas ni se usa JSONB como modelo operacional de red; el payload externo sigue siendo evidencia separada.
- El worker primero resuelve identidades y después persiste snapshots/relaciones, independientemente del orden de respuesta SDK. Validaciones de tipos, familia IPv4/IPv6 y conteos abortan una ejecución malformada sin sustituir el último inventario completo.
- Relaciones limitadas a conexión/región. Una VPC sólo referenciada conserva su identidad, pero no se inventa su estado/configuración ni se cuenta como observada. Una subnet histórica no completa la topología de una ejecución distinta.
- Los dos GET nuevos requieren `cloud:read`, autorización de proyecto y paginación. Devuelven campos curados, no payloads completos; CIDR se recupera en batch. Los recursos proceden del último run succeeded por fecha de finalización de cada conexión, con desempate estable.
- `inventory-status` distingue último intento y último inventario completo por conexión, incluso si hay más historia que la página reciente de jobs. Un intento fallido conserva la evidencia previa; una ejecución completa vacía cambia la vista actual sin borrar historia.
- Cada recurso de red expone snapshot, ejecución, correlación, cuenta, región, modo y fecha. La interfaz muestra fuente/fecha/correlación y enlaza Operaciones para revisar auditoría. Leer estos GET no genera un nuevo `sync_run` ni llama a AWS.

### Interfaz y límites

| Pantalla modo API | Datos implementados | No se afirma |
|---|---|---|
| `/network` | VPC, subnets relacionadas, CIDR IPv4/IPv6, zona, IPs disponibles, asignación automática de IP pública, estado informado | Rutas, salida a Internet, tráfico, latencia ni configuración de security groups/ACLs |
| `/infrastructure` | Recursos observados por conexión, regiones configuradas, zonas extraídas de subnets, filtros y páginas de 25 resultados | Cobertura global, backbone AWS, capacidad, SLA, salud ni resiliencia probada |

Actualizar inventario en estas vistas sólo relee PostgreSQL. La sincronización cloud es una operación separada en Operaciones y permanece bloqueada para AWS mientras `aws_enabled=false`.
Un error no carga datos demo; un atributo ausente se muestra como no informado. El cambio de proyecto elimina recursos y filtros anteriores. AWS y FLOCI mantienen procedencia diferenciada.
En modo API se retiraron del lateral las etiquetas ficticias `AWS OK`, `8 Reg` y la identidad fija de administrador. El presupuesto estimado sólo aparece en Planificación/Costos, no se presenta como factura. Demo conserva las vistas educativas de red/globo/simuladores bajo configuración explícita.

### Verificación de este bloque

- Backend: **46 pruebas correctas y 1 smoke AWS omitida**; Ruff correcto. PostgreSQL/contrato FLOCI, aislamiento, paginación, rollback ante evidencia inválida, parentesco sólo del mismo snapshot y estados vacíos incluidos.
- Migraciones: desde base vacía, check contra ORM, downgrade/re-upgrade y transformación de evidencia antigua con IPv4/IPv6 y VPC sólo referenciada, sobre base temporal aislada.
- Frontend: lint y build correctos; **5 unitarias y 9 E2E correctas**. Sigue pendiente optimizar el tamaño del bundle advertido por Vite.
- Cinco E2E nuevos usan fixtures sintéticos de contrato UI, no prueban AWS real. Bloquean mutaciones/red externa y sustituyen localmente el CSS de la fuente tipográfica. Los cuatro E2E anteriores prueban API/worker/FLOCI, permisos y propuestas persistidas.
- Volumen de negocio actualizado a `0002_network`: **9 snapshots AWS conservados**, con hash de payloads idéntico antes/después. La API consultada como lector devolvió **1 VPC, 6 subnets, 7 bloques CIDR y 6 relaciones con VPC observada en la misma ejecución**. Esto acredita transformación/lectura de la evidencia previa, no una nueva consulta AWS.
- API, worker, frontend y PostgreSQL saludables; runtime normal con **AWS deshabilitado**. No se borraron volúmenes ni se creó un commit/push.

### Qué validar desde el frontend

1. Abrir http://127.0.0.1:27901, entrar como lector y seleccionar el proyecto `Laboratorio local`.
2. En Red, elegir la conexión del inventario AWS puntual: comprobar 1 VPC y 6 subnets, CIDR, zonas y relación VPC; la fecha corresponde a la prueba anterior, no al momento de abrir la pantalla.
3. En Infraestructura, elegir esa conexión: comprobar los 9 recursos y filtrar por servicio/identificador. Los otros laboratorios FLOCI pueden tener datos adicionales, por eso hay filtro de conexión.
4. Pulsar Actualizar inventario: sólo se consulta la base local. Para nuevas lecturas AWS se debe resolver antes el perfil no-root y habilitar el flujo normal; el lector no puede sincronizar.

**El plan completo aún no terminó.** Próximos bloques: identidad AWS no-root, autenticación productiva/SSO y administración de miembros; costos reales normalizados, métricas/eventos y evaluación de seguridad; importación opt-in de propuestas demo, backups/retención y despliegue con IaC. Ampliar topología requiere nuevos permisos de lectura, modelo y pruebas; este bloque no los habilita implícitamente.
