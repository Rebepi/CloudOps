# Plan de escalamiento del módulo de seguridad

Estado: Fase 0 y Fase 1 implementadas. Fases 2 a 9 pendientes.

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

Estado: completada.

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

### Fase 2: normalización y deduplicación entre fuentes

Objetivo: evitar que el mismo riesgo se cuente dos veces.

Entregables:

- Identidad canónica por recurso, control y fuente.
- Deduplicación entre CloudOps, Security Hub, AWS Config e Inspector.
- Reglas explícitas para elegir severidad y recomendación cuando hay conflicto.
- Pruebas con casos reales de la cuenta de prueba.

Criterio de salida: el hallazgo de clave de acceso root aparece una sola vez con trazabilidad a ambas fuentes.

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
```

## 9. Próximo paso

Ejecutar la Fase 2: deduplicación entre fuentes y normalización canónica de hallazgos. Antes de integrar nuevas herramientas, la misma clave de acceso root no debe aparecer dos veces ni inflar el conteo.
