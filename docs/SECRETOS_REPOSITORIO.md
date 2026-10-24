# Secretos de repositorio con Gitleaks

Motor CloudOps `1.8.0`; metodología código/full `2026.18`. AWS conserva `2026.14`.

## Alcance

Gitleaks analiza el contenido de texto del snapshot ZIP o archivo de GitHub/GitLab que recibe CloudOps. No ejecuta el proyecto, no consulta proveedores para comprobar actividad y no analiza el historial de commits. La ausencia de un hallazgo no prueba que no existan credenciales.

Se incluyen extensiones de texto compatibles, configuraciones, `.env` y sus variantes como `.env.production`/`.env.local`, PEM/KEY y archivos sensibles sin extensión como `id_rsa` y `credentials`. Los archivos no compatibles, binarios, archivos cifrados y capas de codificación fuera del límite no se presentan como evaluados por este motor.

La base previa de firmas internas permanece como evidencia complementaria. Una plantilla `.env.example` que solo contiene placeholders ya no se marca automáticamente como archivo con credenciales. Si contiene valores configurados que no son placeholders, la evidencia nativa de exposición se conserva.

## Herramienta y configuración

Gitleaks `8.30.1` se preparó y verificó mediante la imagen:

```text
ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f
```

Desde `backend`:

```powershell
node --import tsx scripts/prepare-security-tools.ts
node --import tsx scripts/verify-repository-secrets.ts
```

El script de preparación incluye Semgrep, Trivy y Gitleaks. La verificación completa `scripts/verify-security-tools.ts` incluye también los casos Gitleaks.

Configuración Docker:

```dotenv
CLOUDOPS_GITLEAKS_ENABLED=true
CLOUDOPS_GITLEAKS_MODE=docker
```

El entorno local está habilitado en `backend/.env`, ignorado por Git. Otros despliegues conservan `CLOUDOPS_GITLEAKS_ENABLED=false` hasta preparar sus herramientas. Existe modalidad nativa con `CLOUDOPS_GITLEAKS_MODE=native` y `CLOUDOPS_GITLEAKS_PATH`; el operador debe comprobar una versión compatible. La versión nativa no se inventa en la evidencia.

Los contenedores no tienen red, no reciben credenciales del backend ni el socket Docker, usan fuentes/reglas de solo lectura y límites del runner común. Las imágenes se preparan explícitamente; las evaluaciones usan `--pull never`.

No hay migración adicional: los hallazgos, resumen y ejecuciones usan las tablas existentes. Deben estar aplicadas las migraciones anteriores. Los archivos de `backend/security-rules` deben acompañar el despliegue.

## Perfil versionado y contexto

El pack `backend/security-rules/gitleaks-v1.toml` se identifica como `2026.10.1`, con SHA-256 de configuración. Extiende las reglas predeterminadas compiladas de Gitleaks y añade:

- `cloudops-assigned-secret`: asignaciones de credenciales de 16–128 caracteres con entropía mínima 3.5.
- `cloudops-db-credentials`: contraseñas en URI de PostgreSQL/MySQL/MongoDB de 12–128 caracteres con entropía mínima 3.2.

Las reglas predeterminadas no se describen como únicamente estas dos reglas; dependen de la versión/digest del motor. El perfil está disponible en la API autenticada `GET /api/v1/security/rules`, campo `secrets`.

El valor de entropía es información del motor, no prueba de validez ni seguridad. Una contraseña de baja entropía puede ser una credencial real e insegura; un control negativo de entropía no la certifica como segura.

Las coincidencias genéricas en carpetas de pruebas/fixtures, archivos de test de código y plantillas reconocidas se conservan como informativas y excluidas del puntaje. Esto no las marca automáticamente como falsos positivos ni oculta firmas específicas de proveedor o claves privadas. Un archivo CI o de entorno no se rebaja solo por incluir `test` en su nombre. Las credenciales genéricas de migraciones siguen siendo puntuables: pueden ser credenciales iniciales desplegadas realmente.

Las firmas específicas se conservan como patrones de proveedor/formato, sin afirmar que la credencial esté activa. Las claves privadas mantienen severidad crítica incluso dentro de fixtures. La evidencia nativa de mayor severidad no se degrada al corroborarse con una coincidencia genérica contextual.

## Redacción y procedencia

El comando usa redacción del 100 %, reporte JSON por stdout y mensajes de proceso reducidos. Las pruebas reales comprobaron que ni el valor sintético ni el cuerpo de una clave privada generada aparecían en el reporte del motor.

El normalizador no copia `Secret`, `Match`, descripciones del motor, autor, correo ni fragmentos. Solo conserva regla, ruta original, posición, entropía numérica, contexto y clasificación. Las rutas originales se conservan para triage; no se copian cuerpos de archivos a la evidencia. Los mensajes del hallazgo y recomendaciones son propios de CloudOps.

Las fuentes se escriben temporalmente en una carpeta privada con nombres hash. Las rutas originales no se usan como rutas de escritura. La carpeta se elimina al terminar o fallar. No se construye ni conserva un hash del valor secreto: las huellas identifican regla y ubicación, no credenciales únicas.

Las coincidencias genéricas y de proveedor con rangos de una sola línea solapados se corroboran; columnas distintas se mantienen separadas. Las firmas internas/Gitleaks se combinan cuando hay una única correspondencia demostrable de ubicación/tipo, conservando observaciones y mayor severidad. Las correspondencias ambiguas no se eligen por orden de reporte. Los controles globales de exposición de archivo, como un `.env` poblado, no se confunden con cualquier línea individual. La exposición de un archivo de clave privada conocido sí puede corroborarse con una única firma de contenido.

Mover archivos, cambiar líneas o cambiar la carpeta envolvente de un ZIP puede producir nuevas huellas. El contador de detecciones no representa cantidad de credenciales únicas. Las observaciones conservan las huellas anteriores para el ciclo de vida cuando se demuestra la misma ubicación.

## Cobertura, responsables y rotación

El panel de Cobertura muestra Gitleaks, catálogo, motor, archivos enviados, omisiones y detecciones previas a corroboración. El reporte `dir` no exporta un inventario individual de archivos leídos: el contador corresponde a archivos preparados en una invocación finalizada correctamente (`itemsBasis=staged-files-in-successful-dir-scan`).

Un motor deshabilitado, un fallo de proceso, JSON inválido o fuentes fuera de límite no equivalen a un resultado limpio. La cobertura global y de protección de datos incluyen un control Gitleaks cuando hay texto candidato; los fallos/omisiones aportan cero y las mediciones parciales se distinguen.

Los hallazgos recomiendan validación, rotación/revocación en el proveedor y sustitución por referencias a un gestor de secretos. Se sugiere un equipo por la ruta (backend, frontend, infraestructura o mantenedores). No se asigna un propietario, modifica un estado ni rota/revoca ninguna credencial automáticamente. Las claves AWS y demás credenciales existentes no fueron modificadas.

## Límites iniciales

- Dos mil archivos, 2 MB por archivo y 40 MB de texto enviados a Gitleaks.
- Presupuesto externo de ejecución de 120 s y salida máxima de 20 MB.
- Quinientos hallazgos normalizados antes de corroboración; los excesos se registran como resultado parcial.
- Cien omisiones detalladas retenidas, además del contador completo.
- Una capa de decodificación y cero niveles de archivos anidados.
- Sin enlaces simbólicos; se mantienen los controles ZIP de rutas y tamaño de CloudOps.

No se respetan comentarios de supresión `gitleaks:allow` de un repositorio evaluado ni sus archivos de configuración/ignore: se usa el pack local y un directorio ignore controlado. Sí se conservan las allowlists del perfil de detección propio/predeterminado.

## Verificación

Suite completa: 119 pruebas backend y 34 frontend, compilación y lint aprobados. Las pruebas ordinarias no requieren Docker ni red.

La ejecución real de Gitleaks en Docker utilizó cuatro archivos con material efímero generado en memoria: dos credenciales sintéticas de aplicación, una coincidencia genérica en fixture y una clave privada de prueba. Obtuvo cuatro detecciones: dos altas, una informativa contextual y una crítica de clave privada, sin pérdida por contexto. Un control negativo separado con placeholders y baja entropía produjo cero coincidencias Gitleaks. No se usaron credenciales de cuentas reales ni se publicaron los valores generados.

Una comprobación adicional con la asignación sintética envuelta en una capa Base64 produjo un hallazgo alto, sin conservar el valor original ni la cadena codificada en el resultado normalizado.

Pendientes de ampliación: historial Git, más codificaciones/formatos y políticas específicas de organizaciones. La comprobación de actividad o rotación automática no forma parte del analizador de snapshot.
