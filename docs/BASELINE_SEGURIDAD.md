# Línea base de seguridad (Fase 0)

Fecha de corte: 2026-10-22  
Metodología observada: `2026.11`  
Proyecto de prueba: `SalesIA Baseline` (`af6ba746-c2bc-470d-bd82-9a8568edafae`)

## 1. Objetivo

Registrar el comportamiento real del módulo de seguridad antes de incorporar el modelo de dimensiones, estados de control y cobertura por analizador. Los datos provienen de ejecuciones reales contra el repositorio `Rebepi/SalesIA` (rama `main`) y la cuenta AWS `143924590537` (región `us-east-1`).

## 2. Entradas evaluadas

| Entrada | Identificador | Contenido |
|---|---|---|
| Repositorio | `https://github.com/Rebepi/SalesIA`, rama `main` | Código completo, sin historial |
| ZIP | `SalesIA.zip`, 10 389 098 bytes, SHA-256 `21d0f00381afd3eaa642497c24030af410b7176b6208a7eea2187dbf761d7e09` | Código completo |
| AWS | Cuenta `143924590537`, rol `arn:aws:iam::143924590537:role/CloudOpsAuditRole` | IAM, CloudTrail, Security Hub, AWS Config, Inspector, S3, Security Groups, RDS |

La conexión AWS se verificó con credenciales asumidas (`assumed-role`) y `readyForAssessment: true`.

## 3. Resultados de las ejecuciones

| Ejecución | ID | Tipo | Puntaje | Cobertura | Hallazgos | Distribución |
|---|---|---|---|---|---|---|
| Repositorio | `e7396094-21a3-4844-937c-7329cf98d57b` | `code` | 100 | 75 | 37 | 37 informativos |
| ZIP | `05316c48-2ef2-4937-b5d4-b203dbcbdf1d` | `code` | 100 | 75 | 37 | 37 informativos |
| AWS | `46fb7a3f-89e4-4b3a-85a3-4d8680032af1` | `aws-account` | 17 | 82 | 414 | 4 críticos, 9 altos, 33 medios, 7 bajos, 361 informativos |
| ZIP + AWS | `c1d3c95c-bc13-4b52-8f4f-db674e0d1881` | `full` | 9 | 83 | 494 | 9 críticos, 33 altos, 47 medios, 7 bajos, 398 informativos |

Las ejecuciones `code` del repositorio y del ZIP son equivalentes: 1 813 archivos analizados, 27 reglas ejecutadas, 339 dependencias inventariadas y 6 controles de código.

La ejecución `full` reporta fuentes `security-hub=411`, `cloudops=40` y `osv=43`. OSV respondió en esta ejecución (339 dependencias consultadas), a diferencia de las dos ejecuciones `code`, donde falló con `fetch failed` y `vulnerabilitiesChecked=0`.

## 4. Hallazgos principales de la línea base

### 4.1 El puntaje 100 de código no representa ausencia de riesgo

Los 37 hallazgos de código quedaron excluidos del cálculo (`scoreExcluded`):

- 44 coincidencias de concatenación SQL en migraciones (`database-migration`).
- 28 coincidencias de secretos en archivos de prueba (`test`).
- 2 coincidencias de URL de base de datos.

Resultado: **cero hallazgos puntuables**. El motor no demuestra cobertura SAST sobre código de aplicación; solo ejecuta reglas sobre migraciones y pruebas.

### 4.2 El análisis de dependencias depende de OSV y no reintenta

- Se parsea `uv.lock` de Python además de los manifiestos de Node, PHP y Python.
- Cuando OSV responde, aparecen vulnerabilidades reales en `pillow` y `certifi` (críticas y altas).
- El fallo inicial fue transitorio: OSV respondió HTTP 200 desde PowerShell y desde `fetch` de Node.
- No existe reintento con espera; una falla transitoria deja la dependencia como no evaluada y reduce la confianza del resultado.

### 4.3 AWS: cobertura parcial y ruido de Security Hub

- 9 de 11 controles AWS observados (82 %).
- Security Hub aporta 411 de los 414 hallazgos. La evaluación completa contiene 361 informativos; no deben confundirse ambos conteos.
- El mismo riesgo puede aparecer dos veces con huellas distintas. Ejemplo: clave de acceso root reportada por `cloudops` y por `security-hub`; no se deduplica entre fuentes.
- Hallazgos críticos confirmados: clave de acceso root activa, MFA root no observado, recursos expuestos y compartición pública en SSM.
- RDS, S3, Security Groups, Config e Inspector se consultan por separado; si un servicio falla o no tiene permisos, la cobertura baja, pero el puntaje restante puede seguir pareciendo alto.

### 4.4 Limitaciones del modelo actual

- No existe dimensión de seguridad: los hallazgos se agrupan por fuente y categoría, no por dominio de control.
- La cobertura es un porcentaje único; no distingue entre evaluado sin hallazgos, evaluado con hallazgos, no aplicable, no soportado, fallido u omitido.
- No se persiste qué analizador se ejecutó, cuántos elementos revisó, cuánto tardó ni por qué falló.
- El puntaje global combina fuentes con coberturas distintas sin explicar el peso de cada dominio.
- No hay deduplicación entre fuentes para el mismo recurso/control.
- El token de repositorio es global (`config.repositoryToken`); `repo_token_ref` se guarda pero no se usa y no hay selector de rama.
- `notify_email` se guarda en la programación, pero las notificaciones solo se envían al webhook.

## 5. Matriz de alcance observada

| Dominio | Código/ZIP | AWS | Evidencia actual |
|---|---|---|---|
| Identidad y autorización | Parcial: búsqueda de JWT, CORS y autorización por patrones | Medido: MFA root, claves root, MFA de usuarios IAM | No hay pruebas de autorización por recurso ni análisis de políticas IAM |
| Protección de datos y secretos | Parcial: secretos, URLs de base de datos y cifrado por patrones | Medido: cifrado RDS y exposición de datos | Muchos hallazgos de secretos quedan excluidos por estar en pruebas o migraciones |
| Seguridad del código | Parcial: 27 reglas estáticas | No aplica | Sin SAST de flujo de datos, inyección real, XSS, SSRF o deserialización |
| Dependencias y cadena de suministro | Parcial: inventario de 339 dependencias | Inspector cubre imágenes y recursos | OSV puede fallar sin reintento; no hay SBOM ni verificación de firmas |
| Configuración e infraestructura | Parcial: detección de Docker, Compose e IaC | Medido: S3, Security Groups, RDS, Config | No se evalúa Terraform/CloudFormation con políticas |
| Registro y detección | No aplica | Medido: CloudTrail, Config, Security Hub, Inspector | Falta verificar retención, integridad y alertas |

## 6. Criterios de aceptación para la Fase 1

1. Cada hallazgo tiene una dimensión explícita y una regla de catálogo identificable.
2. Cada dimensión expone puntaje, cobertura y estado de sus controles.
3. Los estados distinguen: evaluado sin hallazgos, evaluado con hallazgos, parcial, no aplicable, no soportado, fallido y omitido por límite.
4. Una dimensión sin controles medidos devuelve `score: null`; nunca 100.
5. Se persiste la ejecución de cada analizador con estado, elementos revisados, hallazgos y error.
6. La API y la interfaz muestran el desglose por dimensión y los motivos de cobertura.
7. El puntaje global anterior se conserva para comparabilidad; el desglose por dimensión es aditivo.

## 7. Reproducción

```powershell
# Estado de la API
Invoke-RestMethod http://127.0.0.1:27902/api/v1/health

# Ejecuciones registradas
docker exec cloudops-local-postgres-1 psql -U cloudops -d cloudops -c "select id, assessment_type, status, score, coverage from security_assessments order by started_at desc;"

# Distribución de hallazgos de la ejecución full
docker exec cloudops-local-postgres-1 psql -U cloudops -d cloudops -c "select severity, count(*) from security_findings where assessment_id='c1d3c95c-bc13-4b52-8f4f-db674e0d1881' group by severity order by 2 desc;"

# Fuentes de la ejecución full
docker exec cloudops-local-postgres-1 psql -U cloudops -d cloudops -c "select source, count(*) from security_findings where assessment_id='c1d3c95c-bc13-4b52-8f4f-db674e0d1881' group by source order by 2 desc;"
```

## 8. Conclusión

La línea base confirma que el módulo funciona de extremo a extremo, pero su resultado actual no es suficiente para afirmar cobertura de seguridad. El puntaje 100 de código se explica por la exclusión de todos los hallazgos y no por ausencia de riesgo. La Fase 1 debe hacer visibles la dimensión, el estado del control y el alcance real de cada analizador antes de incorporar nuevas herramientas.

## 9. Verificación de la Fase 1

La implementación se verificó con una ejecución full del mismo repositorio:

| Campo | Valor |
|---|---|
| Ejecución | `b034d1de-049d-431e-93e6-d1286fce3688` |
| Estado | `completed` |
| Puntaje global | 9 |
| Cobertura global | 83 % |
| Motor | 1.1.0 |
| Dimensiones persistidas | 6 |
| Analizadores persistidos | 15 |

Resultado por dimensión:

| Dimensión | Puntaje | Cobertura | Estado | Hallazgos excluidos |
|---|---:|---:|---|---:|
| Identidad y autorización | 0 | 100 | Medido | 0 |
| Protección de datos y secretos | 0 | 100 | Medido | 15 |
| Seguridad del código | — | 100 | Parcial | 22 |
| Dependencias y cadena de suministro | 0 | 100 | Medido | 0 |
| Configuración e infraestructura | 0 | 100 | Medido | 0 |
| Registro y detección | 0 | 100 | Medido | 0 |

La dimensión de aplicación ya no muestra 100: sus 22 hallazgos están excluidos del puntaje y el estado queda en `partial`. OSV registra 339 dependencias consultadas y 43 hallazgos. Los analizadores AWS, el motor interno y OSV quedan auditables por ejecución.

Criterios pendientes para fases posteriores: deduplicación entre fuentes, reintento de OSV, SAST de flujo de datos y reducción del ruido de Security Hub.

## 10. Revisión posterior de la cobertura (2026-10-23)

Las tablas anteriores son resultados históricos del motor `1.1.0`. La revisión detectó que ese motor contaba los controles `failed` como medidos y podía mostrar cobertura 100 % pese a errores. También infería aprobación IAM/CloudTrail por ausencia de hallazgos, sin exigir evidencia explícita, y mezclaba hallazgos AWS con controles de código.

El motor `1.2.0` corrige esas condiciones: los controles fallidos/omitidos aportan cero cobertura; los parciales, media unidad. Una dimensión sin ningún control completamente medido conserva `score: null`. Los textos dañados por codificación y el conteo de hallazgos excluidos por analizador también se corrigieron.

La deduplicación inicial de root/IAM.4 se verificó con pruebas de integración y con el formato observado en la lectura de la evaluación histórica. No se modificaron los resultados históricos ni se ejecutó una nueva evaluación AWS para esta revisión. El estado detallado y los pendientes están en `../PLAN_ESCALAMIENTO_SEGURIDAD.md`.

La continuación de Fase 2 incorpora MFA root/IAM.9, RDS.2, RDS.3 y S3.8 en el motor `1.3.0`. Se contrastaron los formatos históricos por consultas de lectura y se verificó la fusión con snapshots sintéticos por recurso. Los RDS informativos cuyo recurso es la cuenta completa permanecen separados. Las tablas de esta línea base siguen siendo históricas y no deben reinterpretarse como resultados del motor actualizado.

El motor `1.4.0` añade detalle Config por recurso y correlación Inspector/Security Hub mediante ARN original más recurso. La validación usa clientes simulados y snapshots; no existe todavía una nueva línea base en vivo con los dos permisos Config adicionales. La política y el procedimiento de despliegue están documentados en `AWS_AUDIT_ROLE.md`.

El motor `1.5.0` añade reintentos OSV, preserva resultados parciales y registra tiempos reales para los analizadores instrumentados. La migración 008 se aplicó en la base local; no rellena tiempos históricos ni cambia las evaluaciones anteriores. Las pruebas escanean archivos ZIP sintéticos reales y simulan las respuestas OSV para verificar fallos y límites sin consultas externas.

El motor `1.6.0` genera SBOM CycloneDX para nuevas evaluaciones de código/full y añade inventario de licencias, diagnóstico de versiones/lockfiles y adaptador Trivy opcional de imágenes. La migración 009 se aplicó en PostgreSQL local. Las evaluaciones históricas no reciben un SBOM reconstruido artificialmente. Las pruebas HTTP, de inventario y Trivy simulado están documentadas en `CADENA_SUMINISTRO.md`; el binario real aún requiere instalación y validación.
