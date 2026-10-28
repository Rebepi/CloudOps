# SAST y analizadores instalados

Motor CloudOps actual `1.10.0`; metodología código/full `2026.19`. AWS conserva `2026.14`. La base SAST se introdujo en `1.7.0`.

## Estado verificado

- Semgrep CE `1.182.0`, Trivy `0.76.1` y Gitleaks `8.30.1` están disponibles como imágenes Docker fijadas por digest, sin instalaciones globales de Python ni cambios de PATH.
- Semgrep real analizó cuatro fuentes de prueba Python, JavaScript, TypeScript y PHP. Detectó catorce hallazgos que ejercitan las doce reglas del catálogo. Las consultas parametrizadas seguras no produjeron hallazgos y se verificó un parámetro `str` de una ruta FastAPI como fuente de taint.
- Trivy real analizó `alpine:3.20.3`: quince componentes y setenta y siete hallazgos entre los tipos soportados. El estado fue **parcial**, no limpio ni fallido: dos avisos carecían de severidad utilizable y conservaron una severidad estimada. Estos números corresponden a esa prueba y pueden cambiar con la base de vulnerabilidades.
- El entorno local quedó con ambos analizadores habilitados en `backend/.env`, que no se versiona. Las plantillas conservan activación explícita para otros despliegues.

## Preparación y comprobación

Requiere Docker Desktop con motor Linux activo, dependencias Node del backend y las migraciones existentes aplicadas. Desde `backend`:

```powershell
node --import tsx scripts/prepare-security-tools.ts
node --import tsx scripts/verify-security-tools.ts
```

La preparación descarga únicamente las tres imágenes fijadas, comprueba sus versiones y prepara la base Trivy en el volumen `cloudops-trivy-cache`. El script de verificación ejecuta los analizadores reales; no ejecuta las aplicaciones de prueba. Los fixtures SAST están en `backend/tests/fixtures/sast` y se leen como texto. Gitleaks usa material de prueba efímero generado en memoria; su guía es `SECRETOS_REPOSITORIO.md`.

Imágenes verificadas:

```text
semgrep/semgrep@sha256:4a34048c04fef049f71665047f074cffb00cc3d89482f965a5cd151d589237af
aquasec/trivy@sha256:790fd66d1697395d8693d1acaa1ea702406a20f109b6fc7bac8db623eca6c06c
ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f
```

Las evaluaciones usan `--pull never`; preparar las imágenes es un paso de despliegue, no una descarga implícita durante cada análisis.

Configuración Docker:

```dotenv
CLOUDOPS_SAST_ENABLED=true
CLOUDOPS_SAST_MODE=docker
CLOUDOPS_TRIVY_ENABLED=true
CLOUDOPS_TRIVY_MODE=docker
```

Reinicia el backend después de cambiar su entorno. Para operadores que ya tengan los ejecutables nativos en un sistema compatible, existen `CLOUDOPS_SAST_MODE=native`, `CLOUDOPS_SAST_PATH`, `CLOUDOPS_TRIVY_MODE=native` y `CLOUDOPS_TRIVY_PATH`. En Windows se verificó la modalidad Docker. No se afirma compatibilidad nativa de Semgrep con Windows.

No se montan el socket Docker ni las credenciales AWS del backend dentro de los contenedores analizadores. Los registros privados requieren su propia configuración operativa; un fallo de autenticación de imagen se registra como fallo, no como imagen segura.

## Catálogo versionado

Ruta autenticada:

```text
GET /api/v1/security/rules
```

Devuelve dos catálogos con versión y checksum:

- `2026.10.regex1`: las veintisiete reglas regex internas. Se registra cuántos archivos se evaluaron por regla y el número de reglas realmente invocadas. Los controles auxiliares de nombre de archivo sensible e inventario no se presentan como reglas Semgrep.
- `2026.10.1`: doce reglas Semgrep declaradas en `backend/security-rules/sast-v1.yaml`, con metadatos en `backend/src/security/sastCatalog.ts`. El checksum cubre pack y metadatos; el test compara sus identificadores.

| Lenguaje | Reglas |
|---|---|
| Python | SQL, comandos, SSRF, deserialización no confiable y firma JWT deshabilitada |
| JavaScript/TypeScript, incluidos JSX/TSX | SQL, comandos, salida HTML no confiable y SSRF |
| PHP | SQL, comandos y deserialización no confiable |

Las reglas de flujo usan entradas HTTP conocidas de Flask, determinados accesos Request y parámetros `str` de rutas FastAPI, `req.query/body/params` de Express y superglobales PHP. Las reglas de Python también reconocen `input()`. No cubren automáticamente todos los frameworks, aliases, modelos Pydantic, validadores o fuentes de entrada posibles.

La regla JWT se informa como control de identidad solo cuando se observa contexto JWT/Jose o un hallazgo de esa regla; la ausencia de JWT no se convierte en un aprobado genérico de identidad. El control no prueba IDOR, RBAC ni autorización de objetos de negocio.

El pack local debe acompañar el despliegue junto a `backend/dist`; TypeScript por sí solo no copia `backend/security-rules`. El runtime resuelve ese directorio desde el módulo, sin depender de reglas del repositorio evaluado. Un nuevo pack debe recibir una versión y un archivo nuevos, manteniendo trazabilidad del anterior.

## Aislamiento, límites y datos conservados

Semgrep recibe solo fuentes elegibles, copiadas a una carpeta temporal privada con nombres hash y extensiones conocidas. Nunca se usan rutas del ZIP como rutas de escritura. Se conserva el mapeo de ubicación original para normalizar resultados. El proyecto no se instala ni se ejecuta.

El contenedor Semgrep no tiene red, recibe fuentes y reglas con montajes de solo lectura, raíz de solo lectura, capacidades eliminadas, `no-new-privileges`, dos CPU y 2 GB de memoria. Métricas, comprobación de versión y exportador de telemetría quedan deshabilitados. No se descargan reglas desde el registro Semgrep durante una evaluación.

Límites iniciales: dos mil archivos, 2 MB por fuente, 40 MB de fuentes, 120 s por invocación, diez segundos de timeout por regla, dos trabajos y quinientos hallazgos. La salida de procesos está limitada a 20 MB. Los contenedores tienen nombres únicos por trabajo y se eliminan también después de timeout/error; la carpeta temporal se limpia al terminar.

Las pruebas, fixtures, migraciones y fuentes vacías quedan excluidas del flujo SAST de aplicación. Las reglas internas de código/IaC en fixtures se conservan como contexto informativo. Se mantienen las comprobaciones previas de secretos de alta confianza, sin ocultarlas indiscriminadamente por encontrarse en pruebas.

No se persisten `extra.lines`, metavariables, trazas de datos ni stderr del analizador. Los hallazgos usan mensajes propios del catálogo y conservan archivo, línea, regla, CWE y versión. Las rutas temporales no sustituyen la ubicación original.

Cuando Semgrep y una regla interna señalan el mismo CWE, archivo y línea, se conserva una sola penalización con ambas observaciones originales. Las huellas previas sirven de alias para recuperar el ciclo de vida. No se fusionan solo por semejanza de título.

## Cobertura y límites funcionales

La pestaña Cobertura muestra estado, versión, hash, archivos y exclusiones por lenguaje. Los lenguajes sin reglas del catálogo se muestran como no soportados. Las omisiones, errores de parsing, timeouts y fallos de instalación no se interpretan como un análisis limpio.

La cobertura global incluye controles adicionales para SAST cuando hay fuentes de aplicación y Trivy cuando hay imágenes. Un analizador omitido/fallido aporta cero; un resultado parcial solo aporta media unidad cuando existe evidencia analizada. La generación de SBOM no agrega un aprobado de seguridad.

Semgrep CE proporciona análisis intraprocedimental basado en las reglas configuradas. No sustituye pruebas dinámicas ni demuestra seguridad de lógica de negocio, autorización por recurso o flujos entre archivos. Java, Go, C#, Ruby, Rust y otros lenguajes reconocidos aún no tienen reglas en este pack. La ampliación de fuentes y frameworks debe verificarse con casos vulnerables y seguros.

## Verificación automatizada

Compilación backend/frontend y lint aprobados. Suite actual: 136 pruebas backend y 37 frontend. Incluye rechazo de reglas/archivos desconocidos, descarte de fragmentos de código, staging, limpieza, contexto, cobertura parcial, corroboración, timeout y presentación de tipos no soportados. La verificación completa también incluye IaC; su guía es `INFRAESTRUCTURA_DECLARADA.md`.

Las pruebas unitarias no requieren Docker ni red. Los scripts de preparación y verificación son comprobaciones operativas explícitas y sí usan Docker; Trivy requiere red para su base y la imagen remota. No se modificaron políticas IAM ni se habilitaron servicios AWS durante esta entrega.
