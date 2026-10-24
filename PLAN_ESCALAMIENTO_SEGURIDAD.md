# Plan de escalamiento del módulo de seguridad

Estado al 2026-10-23: Fase 0 documentada, base de Fase 1 implementada y corregida, Fase 2 iniciada. Fases 3 a 9 pendientes.

Versión actual: motor `1.4.0`, metodología AWS/full `2026.14` y metodología de código `2026.11`.

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

- Catálogo versionado de reglas y adaptadores por analizador.
- Medición de duración real y estados de omisión por límite/lenguaje en el escáner de código.
- Cobertura específica de reglas de identidad y datos dentro del código, además de los dominios generales actuales.

### Fase 2: normalización y deduplicación entre fuentes

Estado: correlación implementada para identidades conocidas de CloudOps, Security Hub, Config e Inspector. La ampliación a todos los controles y formatos sigue pendiente. AWS y full usan metodología `2026.14`; código conserva `2026.11`.

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

Objetivo: reducir falsos negativos por fallos transitorios y límites silenciosos.

Entregables:

- Reintento con espera exponencial para OSV y APIs externas.
- Registro de tiempo por analizador y motivo de omisión.
- Límites visibles: cantidad de archivos, tamaño, tiempo y profundidad.
- Comparación de cobertura entre ejecuciones.

Criterio de salida: una tasa de error transitoria de OSV no deja dependencias como no evaluadas sin explicación.

### Fase 4: dependencias y cadena de suministro

Objetivo: pasar de consultar versiones a construir un inventario verificable.

Entregables:

- Generación de SBOM CycloneDX.
- Integración de Trivy para vulnerabilidades, licencias y secretos en imágenes.
- Verificación de lockfiles y artefactos sin versión fija.
- Enlaces a CVE, versión corregida y disponibilidad de parche.

Criterio de salida: cada dependencia vulnerable tiene paquete, versión observada, versión corregida y evidencia.

### Fase 5: SAST real sobre código de aplicación

Objetivo: cubrir flujo de datos y lógica, no solo patrones.

Entregables:

- Adaptador Semgrep u Opengrep con reglas por lenguaje.
- Reglas para inyección SQL, XSS, SSRF, deserialización, command injection y control de acceso.
- Exclusión explícita de pruebas, fixtures y migraciones.
- Mapeo de resultados a OWASP y a la dimensión aplicación.

Criterio de salida: un archivo de aplicación con concatenación SQL produce un hallazgo puntuable; una migración equivalente queda excluida con justificación.

### Fase 6: secretos y protección de datos

Objetivo: detectar credenciales reales sin exponerlas.

Entregables:

- Integración de Gitleaks con reglas propias.
- Verificación de entropía y contexto de archivo.
- Redacción de valores en evidencia y reportes.
- Rotación recomendada y responsable sugerido.

Criterio de salida: cero valores secretos completos almacenados o mostrados.

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

Verificación del 2026-10-23: compilación backend y frontend, lint frontend, 59 pruebas backend y 21 pruebas frontend aprobadas. La validación de deduplicación y del recolector Config usa snapshots y clientes simulados; las consultas a PostgreSQL fueron solo de lectura. No se recalcularon ni sobrescribieron evaluaciones históricas ni se verificaron los nuevos permisos contra AWS en vivo.

## 9. Próximo paso

Abordar reintentos OSV y tiempos por analizador de la Fase 3, completar el catálogo de reglas de código de la Fase 1 y ampliar progresivamente las equivalencias pendientes. Para validar el detalle Config en vivo, el despliegue debe aplicar primero los dos permisos nuevos de lectura. Las evaluaciones históricas se conservan; una nueva ejecución genera el desglose corregido.
