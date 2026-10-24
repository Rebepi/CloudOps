# Plan de escalamiento del módulo de seguridad

Estado al 2026-10-23: bases de Fases 0 a 6 implementadas, con Semgrep, Trivy y Gitleaks preparados y verificados realmente. Las ampliaciones indicadas en cada fase y las Fases 7 a 9 siguen pendientes.

Versión actual: motor `1.8.0`, metodología AWS `2026.14` y metodología de código/full `2026.18`.

Este documento es la referencia del avance actual. `docs/BASELINE_SEGURIDAD.md` conserva resultados históricos; no representa una ejecución del motor actualizado.

## 1. Objetivo

Evolucionar el módulo de seguridad de CloudOps desde un conjunto de reglas estáticas y consultas AWS hacia una evaluación trazable, comparable y extensible. El resultado debe explicar qué se evaluó, con qué herramienta, sobre qué fuente, con qué cobertura y por qué un control pasó, falló o no pudo medirse.

## 2. Principios

1. La evidencia manda: no se estiman componentes, controles ni cobertura sin archivos o respuestas observadas.
2. Un control no medido no es un control aprobado.
3. El puntaje siempre se acompaña de cobertura y estados.
4. Los hallazgos se normalizan, deduplican y clasifican antes de puntuar.
5. Las herramientas externas se integran por adaptadores; no se acoplan al motor.
6. La IA solo redacta, prioriza y explica. Nunca calcula puntajes ni cambia severidades de forma automática.
7. Cada cambio de metodología queda versionado y es comparable contra la versión anterior.

## 3. Modelo conceptual

| Concepto | Valores |
|---|---|
| Fuente | ZIP, repositorio GitHub/GitLab, cuenta AWS |
| Capa | backend, frontend, infraestructura, dependencias, compartido |
| Dimensión | identidad, datos, aplicación, dependencias, configuración, detección |
| Analizador | regla interna, OSV, Semgrep/Opengrep, Gitleaks, Trivy, Security Hub, AWS Config, Inspector |
| Estado de control | pass, fail, partial, not_applicable, not_supported, failed, skipped |
| Estado de dimensión | measured, partial, not_measured |

Estados de cobertura que deben mostrarse por separado:

- Evaluado sin hallazgos.
- Evaluado con hallazgos.
- Parcial: solo parte de la evidencia fue procesada.
- No aplicable: la tecnología o el recurso no existe en el alcance.
- No soportado: el analizador no cubre ese lenguaje o formato.
- Fallido: el analizador o la fuente no respondió.
- Omitido por límite: tamaño, tiempo, cantidad de archivos o permisos.

## 4. Reglas de puntaje

- Solo los hallazgos puntuables afectan el puntaje.
- Los hallazgos informativos se conservan para contexto y no penalizan.
- La evidencia excluida se cuenta y se muestra, pero no se usa para afirmar que el dominio está limpio.
- Una dimensión sin controles medidos devuelve `score: null`.
- Un control `failed`, `skipped` o `not_supported` aporta cero cobertura. Un control `partial` aporta media unidad; por sí solo no habilita un puntaje.
- Una dimensión cuyos únicos hallazgos están excluidos devuelve `score: null` y estado `partial`.
- Un hallazgo crítico limita el puntaje de su dimensión a 45.
- El puntaje global existente se conserva para comparabilidad histórica. El desglose por dimensión es aditivo.

## 5. Fases

### Fase 0: línea base

Estado: completada.

Entregables:

- Ejecuciones reales de repositorio, ZIP, AWS y full.
- Identificación de falsos positivos, ruido y límites de cobertura.
- Documento `docs/BASELINE_SEGURIDAD.md`.

Hallazgos que motivan el resto del plan:

- Puntaje 100 de código con cero hallazgos puntuables.
- OSV sin reintento ante fallos transitorios.
- Ruido y duplicados entre CloudOps y Security Hub.
- Cobertura única sin estados ni alcance por analizador.

### Fase 1: dimensiones, controles y analizadores

Estado: base implementada; correcciones de cobertura incorporadas en el motor `1.2.0`.

Entregables:

- Catálogo de seis dimensiones en `backend/src/security/dimensions.ts`.
- Clasificación de hallazgos por dimensión.
- Resultados por control con estado y detalle.
- Persistencia de `dimension_scores`, `control_results`, `engine_version` y `assessment_analyzers`.
- Migración aditiva `007_security_dimensions.cjs`.
- API con dimensiones, controles y analizadores.
- Panel de dimensiones y cobertura en la vista de cobertura del proyecto.
- Pruebas de clasificación, aplicabilidad, exclusión y cobertura parcial.

Criterios cumplidos:

- Una fuente sin medición produce `score: null`.
- Una dimensión con hallazgos excluidos no produce 100.
- Cada ejecución registra analizadores, elementos revisados y errores.

Correcciones de la revisión del 2026-10-23:

- Los errores de consulta ya no cuentan como controles medidos.
- La ausencia de evidencia IAM/CloudTrail deja el control omitido, no aprobado.
- Inspector deshabilitado o sin recursos cubiertos no implica un análisis limpio.
- Los límites de Security Hub, Config, Inspector, S3 y RDS reducen la cobertura del control afectado. Los errores por bucket S3 también la reducen.
- Los hallazgos AWS no contaminan el estado de controles del ZIP/repositorio.
- Los hallazgos excluidos se cuentan en el analizador que los produjo.
- OSV registra versiones realmente consultadas, no el total inventariado, como elementos revisados.
- Se repararon textos con codificación incorrecta y se separó visualmente cobertura de ausencia de riesgo.
- Las comparaciones de puntaje y cobertura exigen igual metodología y versión del motor.

Pendientes de alcance, antes de declarar un motor extensible completo:

- Ampliar los catálogos iniciales de reglas regex/SAST versionados y los adaptadores ya separados por analizador.
- Completar atribución temporal de `builtin:configuration` y estados de soporte por lenguaje. Los tiempos y límites ya instrumentados se detallan en Fase 3.
- Cobertura específica de reglas de identidad y datos dentro del código, además de los dominios generales actuales.

### Fase 2: normalización y deduplicación entre fuentes

Estado: correlación implementada para identidades conocidas de CloudOps, Security Hub, Config e Inspector. La ampliación a todos los controles y formatos sigue pendiente. Versiones vigentes indicadas al inicio del documento.

Objetivo: evitar que el mismo riesgo se cuente dos veces.

Entregables:

- Identidad canónica por recurso, control y fuente.
- Deduplicación entre CloudOps, Security Hub, AWS Config e Inspector.
- Reglas explícitas para elegir severidad y recomendación cuando hay conflicto.
- Pruebas con casos reales de la cuenta de prueba.

Criterio de salida: el hallazgo de clave de acceso root aparece una sola vez con trazabilidad a ambas fuentes.

Avance verificado:

- Catálogo explícito en `backend/src/security/controlCatalog.ts`, compartido por la deduplicación y la clasificación de dimensiones.
- Identidad canónica para cinco controles, limitada a cuenta, partición y recurso comprobables:

| Control CloudOps | Security Hub | Alcance |
|---|---|---|
| Claves de acceso root | `IAM.4` | Cuenta global |
| MFA root | `IAM.9` | Cuenta global; no se fusiona con MFA hardware `IAM.6` |
| RDS públicamente accesible | `RDS.2` | Cuenta, región e instancia |
| RDS sin cifrado | `RDS.3` | Cuenta, región e instancia |
| Bloqueo público de S3 incompleto | `S3.8` | Cuenta y bucket |

- Una sola penalización; se conserva la mayor severidad. Los empates siguen la prioridad de fuente existente.
- `evidence.observations` conserva identificadores, recursos, recomendaciones y evidencia de cada fuente.
- La tarjeta del hallazgo muestra las fuentes y recomendaciones originales en un panel desplegable.
- Las huellas anteriores se consultan como alias al recuperar el ciclo de vida del hallazgo.
- Pruebas de idempotencia, orden de entrada, separación de cuentas/particiones/regiones/recursos y atribución de analizadores, incluida una evaluación AWS sintética completa de RDS y S3.
- La forma de `IAM.4` se contrastó mediante lectura de la ejecución histórica `b034d1de-049d-431e-93e6-d1286fce3688`. La prueba de integración reproduce ese formato sin llamadas AWS nuevas.
- También se consultaron los formatos históricos de `RDS.2`, `RDS.3` y `S3.8`. Los RDS informativos con un identificador de cuenta como recurso no se tratan como instancias ni se fusionan con vulnerabilidades.

Continuación implementada:

- Config consulta `DescribeConfigRules` y `GetComplianceDetailsByConfigRule` para obtener la identidad administrada de la regla y sus recursos individuales. Los nombres personalizados de regla no se usan como equivalencia.
- Los cinco controles de la tabla admiten también Config mediante `IAM_ROOT_ACCESS_KEY_CHECK`, `ROOT_ACCOUNT_MFA_ENABLED`, `RDS_INSTANCE_PUBLIC_ACCESS_CHECK`, `RDS_STORAGE_ENCRYPTED` y `S3_BUCKET_LEVEL_PUBLIC_ACCESS_PROHIBITED`, con validación del tipo de recurso.
- Cada recurso no conforme produce su hallazgo. Cuando hay detalle, el resumen agregado no vuelve a penalizarlo. Si el detalle es parcial se registra un hallazgo de cobertura excluido del puntaje; si no hay detalle, se conserva el resumen sin fusionarlo por su nombre.
- El recolector limita metadatos a cinco páginas y detalle a veinte reglas, con dos páginas de cien resultados por regla. Los errores de permisos, los límites y los resultados parciales quedan visibles y reducen cobertura.
- Inspector y Security Hub se vinculan por el mismo ARN upstream `inspector2:...:finding/...` y el mismo recurso. Se normalizan identificadores EC2 y sus ARN; para ECR/Lambda se exige el mismo ARN. No se fusionan hallazgos únicamente por CVE o título.
- Las observaciones conservan categoría y título originales; un ganador de Security Hub no elimina la atribución ni el fallo del control Inspector.
- La política versionada incorpora `config:DescribeConfigRules` y `config:GetComplianceDetailsByConfigRule`. El despliegue debe actualizar el rol para habilitar el detalle. Esta revisión no modificó políticas en la cuenta AWS.

Pendiente: equivalencias para otros controles y formatos. Un identificador físico RDS de Config distinto del nombre/ARN observado no se resuelve por similitud; requiere enriquecimiento de inventario. Una imagen ECR identificada solo por digest no se equipara a un ARN de repositorio. Los documentos OCSF que no conserven el ARN original de Inspector permanecen separados. Los hallazgos sin equivalencia demostrada conservan sus huellas originales.

Referencia de formato Inspector/ASFF: https://docs.aws.amazon.com/inspector/latest/user/securityhub-integration.html (consulta del 2026-10-23). La normalización OCSF conserva el ARN cuando viene en `finding_info.uid`; no lo infiere de eventos relacionados.

### Fase 3: cobertura confiable y reintentos

Estado: núcleo implementado y probado; quedan pendientes las extensiones indicadas abajo.

Objetivo: reducir falsos negativos por fallos transitorios y límites silenciosos.

Entregables:

- Reintento con espera exponencial para OSV y APIs externas.
- Registro de tiempo por analizador y motivo de omisión.
- Límites visibles: cantidad de archivos, tamaño, tiempo y profundidad.
- Comparación de cobertura entre ejecuciones.

Criterio de salida: una tasa de error transitoria de OSV no deja dependencias como no evaluadas sin explicación.

Implementado:

- Cliente OSV separado en `backend/src/security/osvClient.ts`, con hasta tres intentos por solicitud. Reintenta errores de red, timeout, HTTP 408, 429 y 5xx; no reintenta errores permanentes 4xx ni JSON inválido.
- Esperas exponenciales de 250 y 500 ms, respetando `Retry-After`. Si la espera solicitada supera 10 s o el plazo restante, no se adelanta la petición: se registra el límite.
- Presupuesto compartido de 120 s para lotes y detalles. Cada intento tiene como máximo 20 s para lotes o 15 s para detalles, reducido al plazo restante.
- Un lote posterior fallido no descarta coincidencias ni versiones evaluadas en lotes anteriores. Los resultados incompletos o inválidos no cuentan como dependencias comprobadas.
- La falta de detalle de un aviso conserva la coincidencia y marca el análisis como parcial. La severidad de respaldo queda identificada mediante `severityEstimated`; no se presenta como severidad confirmada.
- Límites OSV explícitos: cien versiones por lote, trescientas coincidencias, cien detalles y concurrencia de diez solicitudes de detalle. `osvMetrics` registra solicitudes, reintentos y duración; `scanLimits` registra los límites alcanzados.
- El límite de texto ZIP y el límite de quinientos hallazgos estáticos reducen cobertura. Si ningún archivo del dominio se analizó, el control queda omitido y aporta cero cobertura.
- `summary.analyzerTimings` conserva mediciones reales con alcance explícito. Reglas/parsing usan tiempo acumulado de ejecución; IAM/CloudTrail suman tiempos de solicitud; OSV y otros servicios usan tiempo transcurrido por servicio. Las medidas acumuladas pueden superponerse y no deben sumarse como duración total de evaluación.
- Migración aditiva `008_analyzer_duration.cjs`: `assessment_analyzers.duration_ms` nullable. API y panel de cobertura muestran duración y reintentos OSV. `null` significa sin medición; cero ms es una medida válida tras redondeo. No se fabrican tiempos para históricos ni para dominios sin instrumentación.
- AWS mantiene los reintentos del SDK (`maxAttempts: 2`). No se añadieron reintentos propios a proveedores de repositorio ni a otras APIs.
- La evaluación full conserva las mediciones AWS y de código. Los cambios de cobertura se versionan; las comparaciones entre motores/metodologías distintos no muestran deltas numéricos.

Despliegue: ejecutar `npm run migrate` en `backend` antes de iniciar el backend actualizado. La migración 008 se aplicó y comprobó en PostgreSQL local; los tiempos históricos siguen siendo `NULL`.

Pendientes: medición de `builtin:configuration`, trazas temporales de evaluaciones que abortan antes de producir un resultado, cobertura por lenguaje con reglas versionadas y tendencias históricas por analizador/dimensión. Las pruebas de reintentos usan transporte simulado y las pruebas de integración escanean ZIP reales de prueba, sin tráfico OSV/AWS en vivo.

### Fase 4: dependencias y cadena de suministro

Estado: base implementada y Trivy real validado mediante Docker. Los demás entornos requieren preparar y habilitar sus analizadores; ampliaciones de formatos documentadas en `docs/CADENA_SUMINISTRO.md`.

Objetivo: pasar de consultar versiones a construir un inventario verificable.

Entregables:

- Generación de SBOM CycloneDX.
- Integración de Trivy para vulnerabilidades, licencias y secretos en imágenes.
- Verificación de lockfiles y artefactos sin versión fija.
- Enlaces a CVE, versión corregida y disponibilidad de parche.

Criterio de salida: cada dependencia vulnerable tiene paquete, versión observada, versión corregida y evidencia.

Avance:

- SBOM CycloneDX JSON 1.6 por ejecución de código/full, con PURL, versiones distintas, manifiestos de origen, licencias e integridad declarada cuando están disponibles.
- Vulnerabilidades OSV/Trivy enlazadas a componentes existentes. Enlaces a avisos y versión corregida cuando el proveedor la devuelve; no se inventa una corrección cuando no está disponible.
- Identificadores OSV incluyen ahora la versión para evitar colapsar versiones vulnerables distintas. Los cambios de identidad se reflejan en la nueva metodología.
- Revisión de declaraciones sin versión fija y lockfiles inválidos/ausentes. Los rangos respaldados por un lockfile válido no se confunden con versiones resueltas flotantes. Entradas no interpretables quedan explícitas.
- Migración `009_assessment_sboms.cjs`, artefacto JSONB, checksum canónico y descarga autenticada vinculada al proyecto y evaluación completada.
- Panel de cadena de suministro con descarga, checksum, observaciones, licencias observadas e imágenes/estado Trivy.
- Adaptador Trivy opcional para vulnerabilidades, secretos y licencias de imágenes remotas. No ejecuta el proyecto ni contenedores. Límites, errores y omisiones quedan como cobertura parcial/fallida/omitida.
- Variables `CLOUDOPS_TRIVY_ENABLED`, `CLOUDOPS_TRIVY_PATH` y `CLOUDOPS_TRIVY_MODE` en la plantilla. Trivy 0.76.1 se preparó en Docker con digest fijo y caché propia; se validó una imagen real. El entorno local está habilitado, sin requerir un binario Windows global.
- Se conservan digests de imagen cuando Trivy los informa. Los hashes de paquetes procedentes del lockfile se identifican como declarados, no verificados descargando el paquete.

Pendientes: ampliar parsers, grafos, entradas editables/Git e integridad verificada. El criterio de versión corregida se cumple solo para avisos que la informan; los demás permanecen sin corrección confirmada. La prueba real de Trivy conservó estado parcial por dos severidades desconocidas, sin descartar hallazgos.

### Fase 5: SAST real sobre código de aplicación

Estado: base implementada y validada con Semgrep CE 1.182.0 real. La ampliación a autorización de negocio, otros lenguajes/frameworks y flujos interarchivo sigue pendiente.

Objetivo: cubrir flujo de datos y lógica, no solo patrones.

Entregables:

- Adaptador Semgrep u Opengrep con reglas por lenguaje.
- Reglas para inyección SQL, XSS, SSRF, deserialización, command injection y control de acceso.
- Exclusión explícita de pruebas, fixtures y migraciones.
- Mapeo de resultados a OWASP y a la dimensión aplicación.

Criterio de salida: un archivo de aplicación con concatenación SQL produce un hallazgo puntuable; una migración equivalente queda excluida con justificación.

Implementado:

- Adaptador Semgrep nativo/Docker, pack local de doce reglas y catálogo `2026.10.1` con CWE, severidad, lenguaje, dimensión, recomendación y hash.
- Análisis de sintaxis y taint para Python, JavaScript, TypeScript y PHP: SQL, comandos, SSRF, XSS, deserialización y una regla explícita de firma JWT. No se declara cobertura general de autorización por recurso.
- Prueba real de cuatro fuentes: catorce hallazgos ejercitaron las doce reglas; consultas parametrizadas seguras no produjeron hallazgos y se verificó taint de un parámetro `str` FastAPI.
- Staging temporal de nombres hash, sin ejecución de código ni instalación del proyecto. Docker Semgrep no tiene red y usa montajes de solo lectura y límites de CPU/memoria/tiempo.
- Exclusiones explícitas por contexto, estados por lenguaje, errores de parsing y archivos omitidos visibles. El código fuente y las trazas del analizador no se persisten como evidencia.
- Corroboración de reglas internas/Semgrep por CWE+archivo+línea con una sola penalización y conservación de observaciones/huellas anteriores.
- Catálogo regex interno `2026.10.regex1` y conteo de invocaciones reales. API autenticada `GET /api/v1/security/rules`; panel SAST por lenguaje y catálogo.
- Preparación reproducible y validación real: `scripts/prepare-security-tools.ts` y `scripts/verify-security-tools.ts`. Ambos analizadores quedaron habilitados localmente en el archivo de entorno ignorado por Git.
- La cobertura global ahora incorpora SAST e imágenes cuando corresponden. La metodología `2026.17` distingue estos resultados de las ejecuciones anteriores.

Guía operativa, versiones/digests, resultados y límites: `docs/SAST_Y_ANALIZADORES.md`.

### Fase 6: secretos y protección de datos

Estado: base implementada y validada con Gitleaks 8.30.1 real en Docker; ampliaciones de historial y formatos pendientes.

Objetivo: detectar credenciales reales sin exponerlas.

Entregables:

- Integración de Gitleaks con reglas propias.
- Verificación de entropía y contexto de archivo.
- Redacción de valores en evidencia y reportes.
- Rotación recomendada y responsable sugerido.

Criterio de salida: cero valores secretos completos almacenados o mostrados.

Implementado:

- Adaptador Gitleaks nativo/Docker y pack `2026.10.1`, que extiende reglas predeterminadas y añade asignaciones/URI de base de datos con entropía mínima explícita.
- Staging privado, motor Docker sin red, redacción 100 % y normalización que descarta valores, matches, fragmentos y metadatos personales del reporte. El test real comprueba también el reporte redactado antes de normalizarlo.
- Contexto genérico de pruebas/plantillas informativo; firmas de proveedor/claves privadas permanecen puntuables. Migraciones no ocultan credenciales iniciales por defecto.
- Nuevos candidatos sensibles PEM/KEY y archivos sin extensión. Plantillas `.env.example` con solo placeholders ya no producen evidencia nativa de archivo con credenciales.
- Corroboración por ubicación/rangos/tipo con firmas internas y preservación de mayor severidad y observaciones. No se deduplica calculando el valor ni un hash de la credencial.
- Control de cobertura Gitleaks, métricas/tiempo, panel propio, catálogo autenticado, recomendaciones de rotación y responsables sugeridos sin asignación o revocación automática.
- Herramienta preparada por digest y habilitada en el entorno local ignorado por Git. Verificación real: cuatro detecciones en cuatro archivos, manteniendo crítica una clave privada de prueba; control negativo con cero coincidencias.

Guía de alcance, privacidad, límites y reproducción: `docs/SECRETOS_REPOSITORIO.md`. El criterio se refiere a valores detectados/cuerpos de evidencia; se conservan rutas originales para triage. No se afirma validación de actividad de credenciales ni análisis de historial Git.

### Fase 7: infraestructura como código y contenedores

Objetivo: evaluar configuración antes del despliegue.

Entregables:

- Trivy config o Checkov para Terraform, CloudFormation, Kubernetes y Docker.
- Políticas para IAM, redes, cifrado, almacenamiento y exposición.
- Mapeo a CIS y AWS Foundational Security Best Practices.
- Distinción entre infraestructura detectada y recursos desplegados.

Criterio de salida: un Security Group abierto en Terraform se detecta aunque no exista en AWS.

### Fase 8: expansión AWS y reducción de ruido

Objetivo: aumentar profundidad sin inundar el informe.

Entregables:

- Inventario de recursos por servicio y región.
- Deduplicación de controles de Security Hub.
- Priorización por exposición, privilegio y datos.
- Filtros de informativos y agrupación por recurso.
- Cobertura explícita por servicio.

Criterio de salida: los informativos no dominan el conteo principal y cada servicio muestra su estado de medición.

### Fase 9: reportes, tendencias e IA consultiva

Objetivo: convertir evidencia en decisiones.

Entregables:

- Comparación por dimensión entre ejecuciones.
- Reporte ejecutivo y técnico con límites declarados.
- Explicación asistida por Groq sobre hallazgos ya calculados.
- Revisión humana obligatoria antes de publicar conclusiones de IA.

Criterio de salida: la IA no modifica puntajes, severidades ni estados; solo agrega texto identificado como asistido.

## 6. Métricas de éxito

- Porcentaje de ejecuciones con cobertura explicada por analizador.
- Porcentaje de hallazgos con dimensión, fuente y control.
- Duplicados entre fuentes por ejecución.
- Tiempo medio por analizador y tasa de fallos.
- Porcentaje de dominios con `score: null` justificado.
- Diferencias de puntaje atribuibles a cambios de metodología.

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Falsos negativos por reglas limitadas | Mostrar cobertura y herramienta por dominio; integrar SAST real en Fase 5 |
| Falsos positivos en pruebas y migraciones | Exclusión contextual explícita y conteo separado |
| Dependencia de servicios externos | Reintentos, timeout y estado fallido visible |
| Ruido de Security Hub | Deduplicación, agrupación y filtros en Fase 8 |
| Conclusiones infladas | `score: null` sin medición; prohibición de IA en puntajes |
| Cambios de esquema | Migraciones aditivas y compatibilidad con ejecuciones históricas |

## 8. Comandos de verificación

```powershell
cd backend
npm run build
npm test
npm run migrate

cd ..\frontend
npm run build
npm run lint
npm test
```

Verificación del 2026-10-23: compilación backend/frontend, lint, 119 pruebas backend y 34 frontend aprobadas. Se ejecutaron Semgrep, Trivy y Gitleaks reales en Docker. Semgrep detectó catorce hallazgos en cuatro fuentes y ejercitó doce reglas; Trivy conservó quince componentes y setenta y siete hallazgos de una imagen real, con estado parcial por dos severidades desconocidas. Gitleaks detectó cuatro casos controlados y cero en el control negativo, manteniendo redacción y contexto. No se sobrescribieron evaluaciones históricas ni se modificaron políticas, servicios o credenciales AWS. Los permisos Config adicionales siguen pendientes de validación en vivo.

## 9. Próximo paso

Continuar con Fase 7 (infraestructura como código y contenedores), ampliar catálogos y resolver las métricas/formatos pendientes. En otros entornos, aplicar las migraciones existentes, preparar imágenes fijadas y habilitar los analizadores. Para validar Config en vivo se requieren los dos permisos adicionales. Las evaluaciones históricas se conservan; una nueva ejecución genera SAST, secretos, SBOM, desglose y tiempos.
