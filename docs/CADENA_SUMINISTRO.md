# Cadena de suministro y SBOM

Motor actual: `1.10.0`. Metodología de código/full: `2026.19`. La base SBOM se introdujo en `1.6.0`.

## Despliegue

Ejecuta `npm run migrate` en `backend` antes de iniciar el backend actualizado. La migración `009_assessment_sboms.cjs` crea un artefacto SBOM por evaluación, asociado al proyecto mediante su evaluación. La migración se aplicó en PostgreSQL local.

El análisis de ZIP, GitHub y GitLab genera el SBOM sin ejecutar el código del proyecto. La evaluación full conserva el SBOM de su componente de código. Una evaluación exclusivamente AWS no genera un SBOM de aplicación.

## Contenido y alcance

El formato es CycloneDX JSON 1.6. Incluye:

- Componentes con nombre, versión y PURL para npm, PyPI y Composer.
- Versiones simultáneas del mismo paquete como componentes distintos.
- Rutas de manifiestos como procedencia; las ocurrencias repetidas conservan sus rutas.
- Licencias observadas en los lockfiles npm/Composer y en la salida Trivy cuando existen. Los nombres se conservan como nombres de licencia, sin inventar identificadores SPDX ni emitir un dictamen legal.
- Integridad SHA-256/SHA-512 declarada por npm cuando el formato y la longitud son válidos. La propiedad `cloudops:integrity:source=lockfile-unverified` aclara que CloudOps no descargó el tarball para verificarla.
- Referencias de imágenes Dockerfile/Compose. Si Trivy informa un digest observado, también se conserva.
- Avisos OSV/Trivy con referencias a componentes existentes y enlace al aviso. Los hallazgos conservan la versión corregida cuando el proveedor la informa.

No se inventa un grafo de dependencias directas/transitivas ni se afirma que un paquete esté instalado o ejecutándose. El inventario refleja manifiestos procesados y, cuando está habilitado, contenido observado de imágenes.

Los lockfiles compatibles son `package-lock.json` (incluidas dependencias anidadas de v1), `composer.lock`, `Pipfile.lock`, `poetry.lock` y `uv.lock`. También se reconocen versiones exactas en `requirements*.txt`. Los lectores TOML cubren las entradas simples de paquete; versiones Git, entradas editables y formatos no interpretables quedan como observaciones, sin fabricar versiones. `package.json`, `composer.json` y `pyproject.toml` aportan declaraciones, no versiones instaladas inferidas.

Los rangos de `package.json`/`composer.json` respaldados por un lockfile compatible y válido no se reportan como versiones resueltas flotantes. Los lockfiles inválidos, entradas sin versión compatible, inclusiones requirements no resueltas y ausencia de lockfile se distinguen en las observaciones. Las observaciones de cobertura no penalizan como vulnerabilidades.

## Descarga y checksum

La pestaña **Cobertura** incluye el panel **Cadena de suministro y SBOM** y el botón **Descargar SBOM**.

Ruta autenticada:

```text
GET /api/v1/projects/:projectId/security/assessments/:assessmentId/sbom
```

La ruta exige que el artefacto pertenezca al proyecto indicado y a una evaluación completada. Usa los mismos controles de autenticación que el resto de las rutas de evaluación. Devuelve `application/vnd.cyclonedx+json`, un nombre `.cdx.json` y un ETag con el SHA-256 del JSON canónico.

El panel descarga el texto exacto sin reserializarlo, de modo que su archivo coincide con el checksum mostrado. Las claves de objetos se ordenan de forma estable para que el almacenamiento JSONB no altere el checksum. El checksum identifica el documento; no equivale a una firma ni a una verificación criptográfica de los paquetes.

Las evaluaciones históricas permanecen intactas. Si no tienen SBOM, la ruta devuelve 404 y la interfaz pide un nuevo análisis.

## Trivy para imágenes

Trivy es opcional y está deshabilitado de forma predeterminada en nuevos despliegues. Se admite un ejecutable nativo o una imagen Docker fijada. El entorno local ya se preparó y habilitó con Docker; no requiere un binario Windows global. La preparación reproducible y la configuración están en `SAST_Y_ANALIZADORES.md`.

Configuración:

```dotenv
CLOUDOPS_TRIVY_ENABLED=false
CLOUDOPS_TRIVY_PATH=trivy
CLOUDOPS_TRIVY_MODE=docker
```

En Docker, ejecuta primero `node --import tsx scripts/prepare-security-tools.ts` desde `backend`, configura `CLOUDOPS_TRIVY_ENABLED=true` y reinicia el backend. En modalidad nativa, verifica `trivy --version`, configura `CLOUDOPS_TRIVY_MODE=native` y usa `CLOUDOPS_TRIVY_PATH` si el ejecutable no está en PATH.

El adaptador usa argumentos separados y `shell: false`. Solicita `vuln,secret,license`, JSON, todos los paquetes y licencias completas. Usa `--image-src remote`, por lo que consulta el registro y no ejecuta contenedores ni instrucciones Dockerfile. Trivy puede descargar imágenes y su base de vulnerabilidades usando su propia configuración de red y caché.

Las variables de imágenes no se expanden desde el entorno ni se ejecutan instrucciones del repositorio. Las referencias con variables sin resolver o formato no compatible quedan omitidas. Se distinguen etiquetas mutables de referencias fijadas por digest.

Los secretos se normalizan sin conservar `Match`, fragmentos `Code` ni stderr. Se guardan regla, objetivo y línea. Las severidades no reconocidas quedan estimadas y vuelven parcial el resultado. Las licencias son informativas y no descuentan puntaje.

Si Trivy está deshabilitado, falta el ejecutable, falla el proceso o hay límites, el sistema registra `skipped`, `failed` o `partial`; no interpreta esas situaciones como imágenes seguras. El SBOM sigue disponible y su inventario queda parcial cuando las imágenes no se analizaron completamente.

## Límites

- Diez mil entradas de dependencias por archivo ZIP; se señala el límite alcanzado.
- Cien observaciones por manifiesto y doscientas observaciones retenidas del escaneo, incluidos los diagnósticos de lockfiles ausentes.
- Cien referencias de imagen inventariadas; hasta tres imágenes únicas invocadas por evaluación.
- Presupuesto compartido de 120 s para invocaciones Trivy y hasta 20 MB de stdout por imagen.
- Mil hallazgos y diez mil componentes por imagen. Los resultados anteriores se conservan si falla una imagen posterior.

Los límites y omisiones reducen cobertura o marcan el inventario como parcial. La existencia de un SBOM no agrega por sí misma un control de seguridad aprobado.

## Verificación y pendientes

Se aprobaron 136 pruebas backend y 37 frontend, además de compilación y lint. Las pruebas incluyen ZIP reales de prueba, respuesta HTTP del SBOM, checksum, autenticación heredada, separación por proyecto, entradas inválidas, versiones múltiples, IaC y redacción de secretos.

Además de las pruebas simuladas, se ejecutó Trivy 0.76.1 real mediante Docker sobre `alpine:3.20.3`: quince componentes y setenta y siete hallazgos. El resultado fue parcial por dos severidades desconocidas, conservando los avisos estimados. Se preparó la caché y se verificó la imagen del analizador por digest. En otros despliegues se requiere preparar/habilitar la modalidad elegida; no se afirma una instalación nativa Windows.

La comprobación adicional `node --import tsx scripts/verify-sbom-roundtrip.ts`, ejecutada desde `backend`, verifica PostgreSQL real, respuesta HTTP inyectada, aislamiento por identificador de proyecto y checksum tras almacenar JSONB. Crea sus propios registros dentro de una transacción y siempre ejecuta `ROLLBACK`; no abre un servidor ni modifica evaluaciones previas. El resultado local fue descarga 200, proyecto distinto 404 y checksum coincidente. La autenticación heredada se comprueba en las pruebas HTTP unitarias.

Pendientes de ampliación: lectores completos para todos los formatos de lockfile, resolución de entradas editables/Git, verificación de integridad contra artefactos descargados, grafos completos y políticas de licencias específicas de la organización.

Referencia CLI: https://trivy.dev/latest/docs/references/configuration/cli/trivy_image/
