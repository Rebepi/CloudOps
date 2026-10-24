# Implementación de análisis de seguridad en CloudOps

> Actualización de seguimiento (2026-10-23): el avance vigente está en `../PLAN_ESCALAMIENTO_SEGURIDAD.md`. Este documento conserva la implementación y las observaciones históricas del 2026-10-14. El motor de dimensiones es `1.4.0`; AWS/full usan metodología `2026.14`. Incluye cobertura corregida, cinco controles equivalentes entre CloudOps/Security Hub/Config y correlación Inspector por ARN original y recurso. Las fuentes originales son visibles en la tarjeta del hallazgo. Config obtiene detalle por recurso con límites y errores explícitos. Los permisos nuevos de lectura están en la política versionada; aún requieren aplicarse al rol desplegado y validarse en vivo. La deduplicación de todos los formatos y controles no está completada.

Última actualización: 2026-10-14  
Cuenta de prueba: `143924590537`  
Región controlada: `us-east-1`

## 1. Objetivo

CloudOps debe evaluar la seguridad de un proyecto combinando tres fuentes distintas:

```text
ZIP o repositorio ──► código, dependencias, secretos e IaC
Cuenta AWS ─────────► IAM, CloudTrail, Security Hub, Config e Inspector
Aplicación web ─────► análisis dinámico opcional (pendiente)
                                │
                                ▼
                  normalización de hallazgos
                                │
                                ▼
                puntaje, cobertura, evidencias e informe
```

El lenguaje o framework del proyecto no tiene que ser “compatible con AWS”. Un sistema
PHP, PostgreSQL y React puede analizarse desde un ZIP o repositorio aunque todavía no
esté desplegado. Las comprobaciones de cuenta AWS solo aplican cuando existe una cuenta
o infraestructura AWS a la cual conectarse.

El resultado es una evaluación técnica y priorizada. No debe presentarse como una
certificación formal ni como sustituto de un pentest manual.

## 2. Alcance alcanzado

### 2.1 Proyectos y evaluaciones persistentes

Se incorporó un portafolio de proyectos con historial de evaluaciones. Cada proyecto
registra cliente, tipo de aplicación, ambiente, región, tecnologías y fuente de análisis.

Tablas principales:

- `projects`: proyecto y contexto de negocio.
- `security_assessments`: ejecución, tipo, estado, puntaje, cobertura y resumen.
- `security_findings`: hallazgos normalizados con fuente, severidad, evidencia, recomendación, huella y ciclo de vida.
- `security_finding_events`: auditoría de cambios de estado, responsable y justificación.
- `project_artifacts`: metadatos del ZIP, nombre, tamaño y SHA-256; no conserva el contenido.
- `assessment_schedules` y `assessment_runs`: programaciones y su historial de ejecuciones.

Migraciones: `backend/migrations/004_projects_security.cjs`,
`backend/migrations/005_code_artifacts.cjs` y
`backend/migrations/006_security_lifecycle.cjs`.

### 2.2 Análisis de ZIP

El backend acepta ZIP de hasta 100 MB, lo procesa sin ejecutar el proyecto y elimina el
archivo temporal al finalizar. La prueba inicial utilizó:

```text
C:\Users\W11\Desktop\sistema empresarial V-A.zip
```

Controles de seguridad del archivo:

- prevención de Zip Slip y rutas que escapen del archivo lógico;
- rechazo de ZIP cifrado y enlaces inseguros;
- máximo de 10 000 entradas;
- máximo de 250 MB descomprimidos;
- máximo de 8 MB por entrada;
- máximo de 60 MB de texto analizado;
- límite de relación de compresión para mitigar ZIP bombs;
- máximo de 500 hallazgos estáticos por ejecución.

Análisis incluido:

- posibles secretos y archivos sensibles;
- patrones peligrosos en PHP, JavaScript, TypeScript, React y Python;
- configuraciones IaC inseguras;
- dependencias con versiones fijadas;
- consulta de vulnerabilidades a OSV usando solo ecosistema, paquete y versión.

OSV no recibe el código fuente ni el contenido del ZIP.

Implementación: `backend/src/zipSecurityScanner.ts`.

### 2.3 Evaluación de cuenta AWS

CloudOps consulta y normaliza:

- IAM: usuarios, roles, MFA, políticas y resumen de cuenta;
- CloudTrail: trails, estado de registro y validación;
- Security Hub V2: hallazgos OCSF y estado del servicio;
- Security Hub CSPM: estándar habilitado y estado de aprovisionamiento;
- AWS Config: recorders administrados y reglas visibles;
- Amazon Inspector: cobertura y vulnerabilidades cuando el servicio esté activo;
- STS: identidad real utilizada por el backend.

Implementación: `backend/src/aws.ts` y `backend/src/securityAssessment.ts`.

### 2.4 Normalización y puntaje

Todos los resultados se convierten al formato interno:

- fuente;
- categoría;
- título y descripción;
- severidad: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` o `INFORMATIONAL`;
- estado;
- recurso afectado;
- recomendación;
- evidencia técnica;
- huella estable (`fingerprint`);
- marco de referencia (`framework`).

El puntaje parte de 100 y descuenta según severidad. La cobertura indica cuántas fuentes
se pudieron observar realmente. Un puntaje alto con cobertura baja no debe interpretarse
como garantía de seguridad.

Los hallazgos informativos de cobertura de Security Hub indican servicios que no están
activos. No equivalen automáticamente a vulnerabilidades explotables.

Antes de puntuar, cada evaluación:

- **deduplica** hallazgos por huella estable (`source:externalId`, o hash de
  `source + category + title + resource` como respaldo), conservando el de mayor
  severidad y prioridad de fuente (cloudops > security-hub > aws-config >
  amazon-inspector > osv);
- **excluye del puntaje** los hallazgos de categoría `coverage` (controles declarados
  fuera de alcance) para que una fuente no disponible no altere artificialmente el
  puntaje;
- **etiqueta el marco** ligero: OWASP Top 10 para código/web y mapeo a FSBP/CIS para
  cuenta AWS;
- registra la **versión de metodología** (`2026.10`) para que las comparaciones futuras
  sean reproducibles.

Implementación: `backend/src/findingFingerprint.ts` (huella y deduplicación) y
`backend/src/findingFramework.ts` (marco y aplicabilidad).

## 3. Autenticación AWS implementada

### 3.1 Diseño

CloudOps no usa SSH para conectarse a AWS. Utiliza las APIs oficiales, AWS SDK, STS y
credenciales temporales obtenidas al asumir un rol IAM.

Flujo real:

```text
perfil cloudops-source
        │ sts:AssumeRole + External ID
        ▼
CloudOpsAuditRole
        │ credenciales temporales
        ▼
backend CloudOps ──► APIs AWS de solo lectura
```

Recursos creados:

- usuario técnico: `cloudops-source`;
- rol: `CloudOpsAuditRole`;
- perfil operativo: `cloudops-audit`;
- política de lectura: `CloudOpsAuditReadOnly`.

El External ID y las claves se mantienen fuera del repositorio. No deben copiarse a esta
documentación, PostgreSQL, el navegador ni archivos versionados.

### 3.2 Protecciones del backend

- bloquea evaluaciones si STS devuelve el principal root;
- no acepta credenciales permanentes de un usuario IAM como identidad final de auditoría;
- exige una sesión de rol asumido o rol IAM;
- permite comprobar el estado mediante `GET /api/v1/aws/connection`;
- mantiene `AWS_ALLOW_ROOT_AUDIT=false` en operación normal.

Configuración local esperada:

```env
AWS_PROFILE=cloudops-audit
AWS_REGION=us-east-1
AWS_ALLOW_ROOT_AUDIT=false
```

La guía específica está en `docs/AWS_AUDIT_ROLE.md` y las políticas en `aws/`.

## 4. Estado real de servicios AWS

| Elemento | Estado al 2026-10-14 |
| --- | --- |
| Plan de cuenta | `PAID`, activo |
| Créditos observados | USD 119.94 |
| Región de prueba | `us-east-1` |
| Security Hub V2 | Habilitado |
| Prueba Security Hub V2 | 2026-10-14 a 2026-11-13 07:33:02 UTC |
| Security Hub CSPM | Habilitado |
| Estándar CSPM | Solo AWS Foundational Security Best Practices v1.0.0 |
| Estado FSBP | `READY`; controles `READY_FOR_UPDATES` |
| CIS | Deshabilitado |
| NIST / PCI / AI Security | Deshabilitados |
| Funciones opt-in de Security Hub | Ninguna habilitada |
| AWS Config | Tres recorders administrados `INTERNAL` |
| Amazon Inspector | Deshabilitado |
| EC2/ECR/Lambda cubiertos | Ninguno actualmente |
| Threat Analytics / GuardDuty | No habilitado por CloudOps |
| Network Scanning | Deshabilitado |
| Lambda Code Scanning | Deshabilitado |
| AWS Organizations | No utilizado |

Security Hub V2 ARN:

```text
arn:aws:securityhub:us-east-1:143924590537:hubv2/da7b38bc-e1ee-4dbb-871b-e3529706b4de
```

Recorders de AWS Config creados automáticamente:

- `AWSConfigurationRecorderForSecurityHubAssets`;
- `AWSConfigurationRecorderForSecurityHubAssetsGlobal`;
- `AWSConfigurationRecorderForSecurityHubCSPM`.

Los tres tienen alcance `INTERNAL`. No se creó manualmente un recorder Config de alcance
`PAID`.

Primera línea base AWS guardada:

- proyecto: `Sistema empresarial V-A`;
- evaluación: `c2ac4f0e-0ea2-4cae-a31b-67d5b1631639`;
- estado: `completed`;
- puntaje bruto: 0/100;
- cobertura: 75%, confianza media;
- hallazgos: 44 (4 críticos, 7 altos, 16 medios y 17 informativos).

El puntaje es bruto y todavía cuenta duplicados entre controles propios y Security Hub,
además de controles de servicios declarados fuera de alcance como GuardDuty e Inspector.
Las evaluaciones nuevas ya aplican deduplicación y aplicabilidad (sección 2.4); vuelve a
ejecutar la auditoría para regenerar la línea base con el criterio corregido antes de
entregarla a un cliente.

## 5. Decisiones de alcance y costos

La cuenta se cambió directamente del plan gratuito al plan de pago porque el plan
gratuito devolvía `SubscriptionRequiredException` al habilitar Security Hub. El cambio
conservó los créditos existentes.

No se creó ni se unió la cuenta a AWS Organizations, porque esa ruta podía afectar los
créditos promocionales y no era necesaria para una cuenta de prueba.

Guardas de costo aplicadas:

- una sola región;
- sin servicios opt-in adicionales;
- solo un estándar CSPM;
- Inspector desactivado mientras no haya recursos compatibles;
- Config administrado con alcance interno;
- rol de aplicación estrictamente de lectura;
- procedimiento de baja documentado.

Los créditos no son un límite duro de gasto. Al agotarse o vencer pueden existir cargos
en el método de pago. Deben revisarse créditos, Bills y Cost Explorer periódicamente.

## 6. API y experiencia de usuario

Endpoints principales:

| Método y ruta | Función |
| --- | --- |
| `GET /api/v1/aws/connection` | identidad, tipo de principal y preparación del rol |
| `GET /api/v1/aws/security?region=...` | postura en vivo de la cuenta AWS |
| `GET /api/v1/projects` | portafolio de proyectos |
| `POST /api/v1/projects` | crear proyecto |
| `GET /api/v1/projects/:id` | detalle del proyecto |
| `POST /api/v1/projects/:id/security/assessments/aws` | evaluación AWS persistente |
| `POST /api/v1/projects/:id/security/assessments/code` | evaluación ZIP asíncrona |
| `POST /api/v1/projects/:id/security/assessments/full` | evaluación combinada AWS + código (ZIP) |
| `POST /api/v1/projects/:id/security/assessments/repository` | evaluación de repositorio Git asíncrona |
| `GET /api/v1/projects/:id/security/assessments` | historial |
| `GET /api/v1/projects/:id/security/assessments/:assessmentId` | evaluación y evidencias |
| `GET /api/v1/projects/:id/security/assessments/:assessmentId/comparison` | cambios frente a la evaluación anterior |
| `GET /api/v1/projects/:id/security/findings/:findingId/events` | auditoría de cambios del hallazgo |
| `PATCH /api/v1/projects/:id/security/findings/:findingId` | ciclo de vida del hallazgo |
| `GET/POST /api/v1/projects/:id/security/schedules` | listar y crear programaciones |
| `PATCH/DELETE /api/v1/projects/:id/security/schedules/:scheduleId` | editar o borrar una programación |
| `POST /api/v1/projects/:id/security/schedules/:scheduleId/run` | ejecución manual de una programación |
| `GET /api/v1/projects/:id/security/runs` | historial de ejecuciones programadas |
| `POST /api/v1/projects/:id/repository` | conectar GitHub o GitLab |

En la interfaz:

- **Proyectos** administra el portafolio;
- **Detalle de proyecto** ejecuta AWS, ZIP, repositorio o evaluación **completa
  (AWS + código)**, y muestra historial;
- el panel de **comparación** resume nuevos, corregidos, recurrentes, cambios de
  severidad y variación de puntaje y cobertura;
- cada hallazgo permite **ciclo de vida** (estado, responsable, fecha límite,
  justificación y comentario) con auditoría de eventos;
- el botón **Informe PDF** abre el informe imprimible (impresión del navegador);
- el panel de **evaluaciones programadas** crea, pausa, ejecuta y elimina
  programaciones;
- el panel de **repositorio Git** conecta y analiza GitHub o GitLab;
- **Seguridad** consulta IAM, CloudTrail, Security Hub, Config e Inspector en vivo;
- la tarjeta de conexión muestra si CloudOps usa un rol asumido;
- FSBP aparece con su estado `PENDING`, `READY` o error;
- los textos ya no afirman que CIS está activo.

## 7. Cómo completar la primera línea base

### Paso 1: comprobar FSBP

Ejecutar de forma periódica, sin reactivar ni modificar el estándar:

```powershell
aws securityhub get-enabled-standards `
  --profile cloudops-audit `
  --region us-east-1 `
  --query "StandardsSubscriptions[].{Standard:StandardsArn,Status:StandardsStatus,Controls:StandardsControlsUpdatable}" `
  --output table
```

El estándar ya alcanzó `READY`. No se debe ejecutar nuevamente
`batch-enable-standards`.

### Paso 2: ejecutar la auditoría en vivo

1. Iniciar CloudOps.
2. Abrir **Seguridad**.
3. Confirmar que la identidad sea `assumed-role`.
4. Seleccionar `us-east-1`.
5. Pulsar **Ejecutar Auditoría en Vivo**.
6. Revisar errores de fuente y cobertura antes de interpretar el puntaje.

### Paso 3: guardar la evaluación del proyecto

1. Abrir **Proyectos**.
2. Seleccionar el proyecto que representa la cuenta o aplicación.
3. Pulsar la acción de evaluación AWS.
4. Esperar estado `completed`.
5. Registrar como línea base el ID, fecha, puntaje, cobertura y número de hallazgos.
6. No corregir ni suprimir hallazgos hasta conservar esta primera evidencia.

También puede ejecutarse desde el backend con el rol configurado:

```powershell
npm run security:baseline -- <project-id>
```

### Paso 4: combinar con el ZIP

1. Desde el mismo proyecto, seleccionar el ZIP.
2. Ejecutar el análisis de código.
3. Esperar a que finalice la tarea asíncrona.
4. Revisar separados los hallazgos de código, secretos, IaC, dependencias y OSV.

Actualmente las ejecuciones AWS y ZIP quedan como evaluaciones distintas, salvo que se
use la evaluación **completa (AWS + código)** que combina ambas fuentes en un solo
puntaje, resumen e informe.

## 8. Retiro seguro de access keys root

CloudOps ya no depende de las credenciales root, pero se observaron dos access keys root
activas con uso reciente. No deben eliminarse sin identificar sus consumidores.

Procedimiento:

1. Abrir IAM y revisar **Security credentials** de root.
2. Registrar únicamente fecha de creación, estado, último uso y servicio; no copiar el secreto.
3. Buscar scripts, CI/CD, tareas programadas y herramientas locales que puedan usar cada clave.
4. Sustituir cada consumidor por un rol, IAM Identity Center o una identidad técnica mínima.
5. Desactivar una sola clave.
6. Monitorear errores y CloudTrail durante una ventana acordada.
7. Si no existe impacto, eliminar esa clave.
8. Repetir el procedimiento con la segunda clave.
9. Confirmar MFA de root y guardar los códigos de recuperación de forma segura.

No usar `git grep`, logs compartidos ni capturas para publicar valores de claves. Si una
clave root se expuso, debe rotarse inmediatamente aunque todavía tenga dependencias.

## 9. Activación condicional de Inspector

Inspector no está pendiente como error. Está deshabilitado deliberadamente.

Antes de activarlo:

1. Inventariar si existen instancias EC2, imágenes ECR o funciones Lambda.
2. Definir qué tipos de recurso aportan valor al proyecto.
3. Estimar cobertura y costo.
4. Activar solo `EC2`, `ECR` o `LAMBDA` según corresponda.
5. No activar `LAMBDA_CODE` sin aprobación específica.
6. Verificar `batch-get-account-status`, `list-coverage` y `list-findings`.
7. Desactivar el tipo de escaneo cuando deje de existir el recurso o termine la prueba.

## 10. Baja de la prueba AWS

Antes de deshabilitar servicios:

1. exportar los informes y evidencias necesarios;
2. guardar la última evaluación en CloudOps;
3. registrar la fecha de baja;
4. confirmar que no se necesita conservar acceso a hallazgos históricos.

Orden recomendado:

1. deshabilitar FSBP;
2. deshabilitar Security Hub CSPM;
3. deshabilitar Security Hub V2;
4. verificar la eliminación de recorders y roles vinculados administrados;
5. revisar Bills y Cost Explorer cuando AWS actualice la información.

El comando de Security Hub V2 es:

```powershell
aws securityhub disable-security-hub-v2 `
  --profile cloudops-root `
  --region us-east-1
```

No ejecutar una baja sin exportar primero los datos, porque Security Hub deja de dar
acceso a hallazgos, integraciones y configuraciones al deshabilitarse.

## 11. Pendientes priorizados

### P0 — cierre operativo y seguridad

#### 11.1 Esperar FSBP y guardar línea base

Hecho cuando:

- FSBP figure `READY`;
- exista una evaluación AWS `completed` posterior;
- se haya revisado cobertura y fuentes con error;
- la línea base esté identificada en el proyecto.

#### 11.2 Eliminar dependencia de access keys root

Hecho cuando:

- todos los consumidores estén migrados;
- las dos claves root estén deshabilitadas y después eliminadas;
- root tenga MFA;
- CloudOps continúe operando con `CloudOpsAuditRole`.

#### 11.3 Protección de costos

Pendiente añadir un presupuesto o alerta con umbrales bajos y documentar responsables.
La aplicación debe mostrar crédito restante, vencimiento de la prueba y advertencias de
uso sin convertir créditos en una supuesta garantía de costo cero.

### P1 — mayor valor para clientes

#### 11.4 Comparación entre evaluaciones (implementado)

Estado: implementado. La comparación se calcula al vuelo con la huella estable de
hallazgo (sección 2.4) y se expone en
`GET /api/v1/projects/:id/security/assessments/:assessmentId/comparison` y en el panel
de comparación del detalle de proyecto.

Muestra por proyecto:

- nuevos;
- corregidos;
- recurrentes;
- cambio de severidad;
- cambio de puntaje y cobertura.

Clave de comparación: `source + external_id`; como respaldo, una huella estable
de `source + category + title + resource`.

#### 11.5 Ciclo de vida de hallazgos (implementado)

Estado: implementado sobre la columna `security_findings.status`.

Estados:

- abierto;
- en tratamiento;
- corregido;
- falso positivo;
- riesgo aceptado.

Incluye responsable, comentario, fecha límite, justificación y auditoría de cambios
(`security_finding_events`). Un nuevo análisis hereda el estado por huella para no
borrar una aceptación de riesgo válida, y registra eventos cuando cambia la evidencia o
la severidad.

#### 11.6 Informe PDF profesional (implementado)

Estado: implementado con impresión del navegador (`window.print`) sobre el componente
`SecurityReportDocument`, sin dependencias nuevas.

Contenido:

- portada y datos del cliente;
- alcance y limitaciones;
- resumen ejecutivo;
- puntaje y cobertura;
- cambios desde la evaluación anterior;
- hallazgos priorizados;
- evidencias y recomendaciones;
- riesgos aceptados y falsos positivos;
- metodología, fuentes y fecha.

### P2 — automatización y fuentes

#### 11.7 Evaluaciones programadas y alertas (implementado)

Estado: implementado (`backend/src/scheduler.ts` y tablas `assessment_schedules` y
`assessment_runs`).

- programación diaria, semanal o mensual;
- alerta solo ante hallazgo nuevo, aumento de severidad, caída de cobertura o fallo;
- reintentos limitados (máximo 3);
- historial de ejecuciones;
- zona horaria explícita (por defecto `America/Lima`);
- destino de alerta opcional vía webhook (`SECURITY_ALERT_WEBHOOK`) o email por
  programación.

#### 11.8 Repositorios Git (implementado)

Estado: implementado (`backend/src/repository.ts`).

- GitHub o GitLab además de ZIP;
- token de alcance mínimo por variable de entorno (`CLOUDOPS_REPOSITORY_TOKEN`), no se
  guarda en el proyecto;
- rama y commit asociados a cada evaluación;
- ejecución manual desde el detalle del proyecto;
- el repositorio no se conserva después del análisis;
- se calcula SHA-256 durante la descarga y se elimina el archivo temporal al finalizar;
- la descarga se aborta si el archivo supera 500 MB.

### P3 — expansión técnica

#### 11.9 Análisis dinámico opcional

Para URLs autorizadas:

- TLS y certificados;
- cabeceras HTTP de seguridad;
- cookies;
- CORS;
- redirecciones y contenido mixto;
- exposición básica de información.

Requiere autorización explícita del propietario del objetivo, límites de tráfico y una
lista de dominios permitidos. No debe convertirse en escaneo ofensivo automático.

#### 11.10 Inspector por demanda

Activar únicamente cuando el inventario encuentre EC2, ECR o Lambda. Mostrar cobertura,
hallazgos y costo estimado antes de activar tipos de escaneo adicionales.

#### 11.11 Mapeo de marcos (implementado el mapeo ligero)

Estado: implementado el mapeo ligero (`backend/src/findingFramework.ts`).

- código y web: OWASP Top 10;
- cuenta AWS: FSBP y mapeo ligero a CIS;
- NIST o PCI solo cuando el cliente tenga ese requisito.

No habilitar todos los estándares AWS solo para mostrar más etiquetas: aumenta ruido,
evaluaciones y costo sin aportar necesariamente valor.

### P4 — producto multicliente

- separación fuerte de datos por cliente;
- External ID único por cliente;
- roles y permisos internos de CloudOps;
- registro de accesos y cambios;
- cifrado y retención de evidencias;
- controles multirregión configurables;
- agregación por cuenta y región;
- límites de consumo por cliente.

## 12. Mejoras técnicas identificadas

- ~~unir evaluaciones AWS y código en una evaluación `full` coordinada~~ (implementado:
  `POST .../assessments/full` y `backend/src/fullAssessment.ts`);
- ~~paginar todos los hallazgos V2, no solo la primera página~~ (implementado:
  paginación por `NextToken` con tope de seguridad de 1000 hallazgos);
- ~~distinguir hallazgos de cobertura opcional de vulnerabilidades o incumplimientos~~
  (implementado: categoría `coverage` excluida del puntaje);
- mostrar estado y vencimiento de pruebas en la UI;
- añadir estado explícito de Inspector mediante `BatchGetAccountStatus`;
- ~~almacenar una versión de metodología para que comparaciones futuras sean
  reproducibles~~ (implementado: `methodology_version` en `security_assessments`);
- añadir pruebas de integración con respuestas AWS simuladas;
- dividir el bundle principal del frontend, actualmente superior a 500 kB minificado;
- ~~evitar que una fuente temporalmente caída cambie artificialmente el puntaje~~
  (implementado: aplicabilidad de controles de cobertura);
- definir retención y eliminación de informes y evidencias por cliente.

## 13. Validaciones realizadas

- STS devuelve una sesión `assumed-role` de `CloudOpsAuditRole`.
- el usuario técnico directo no puede consultar IAM;
- el rol puede leer las APIs requeridas;
- Security Hub V2 devuelve hallazgos OCSF reales;
- CloudOps normaliza esos hallazgos;
- Config devuelve tres recorders internos;
- Inspector devuelve cero cobertura y ningún error, permaneciendo desactivado;
- backend: 15 pruebas aprobadas;
- frontend: 8 pruebas aprobadas;
- backend: compilación TypeScript aprobada;
- frontend: compilación de producción aprobada;
- frontend: lint aprobado.

## 14. Archivos principales

| Archivo | Responsabilidad |
| --- | --- |
| `backend/src/aws.ts` | clientes AWS, rol, Security Hub V2, Config e Inspector |
| `backend/src/securityAssessment.ts` | normalización, deduplicación, puntaje y cobertura AWS |
| `backend/src/zipSecurityScanner.ts` | lectura segura de ZIP y OSV |
| `backend/src/findingFingerprint.ts` | huella estable y deduplicación |
| `backend/src/findingFramework.ts` | mapeo OWASP/CIS-FSBP y aplicabilidad |
| `backend/src/fullAssessment.ts` | fusión de evaluaciones AWS + código |
| `backend/src/scheduler.ts` | evaluaciones programadas, reintentos y alertas |
| `backend/src/repository.ts` | descarga de repositorios GitHub/GitLab |
| `backend/src/server.ts` | API, persistencia y ejecución de evaluaciones |
| `frontend/src/pages/Security.tsx` | postura en vivo y estándar activo |
| `frontend/src/pages/Projects.tsx` | portafolio |
| `frontend/src/pages/ProjectDetail.tsx` | evaluaciones, comparación, ciclo de vida, programaciones y repositorio |
| `frontend/src/components/reports/SecurityReportDocument.tsx` | informe imprimible |
| `frontend/src/components/reports/SecurityReportModal.tsx` | modal del informe de seguridad |
| `frontend/src/lib/print.ts` | impresión del informe |
| `aws/cloudops-audit-policy.json` | permisos de solo lectura del rol |
| `docs/AWS_AUDIT_ROLE.md` | autenticación por rol |
| `docs/SECURITY_HUB_TRIAL.md` | activación y baja de Security Hub |

## 15. Próxima secuencia recomendada

1. Regenerar la línea base con deduplicación y aplicabilidad y revisar el puntaje.
2. Identificar y retirar las access keys root.
3. Decidir sobre MFA físico de root, bloqueo público de SSM y CloudTrail multirregión.
4. Añadir protección de costos.
5. Definir retención y eliminación de informes y evidencias por cliente.
6. Mostrar en la UI el estado y vencimiento de las pruebas.
7. Activar Inspector únicamente cuando existan recursos compatibles.
8. Añadir análisis dinámico autorizado.
9. Incorporar controles multicliente/multirregión.

Ya entregados: deduplicación y aplicabilidad, comparación entre evaluaciones, ciclo de
vida de hallazgos, informe PDF, evaluaciones programadas con alertas, integración de
repositorios Git, mapeo ligero OWASP/CIS-FSBP y evaluación combinada AWS + código.
