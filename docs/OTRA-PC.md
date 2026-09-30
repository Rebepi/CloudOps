# Ejecutar CloudOps en otra PC

## Arranque mínimo

Requisitos: Git, Docker con Compose v2 y motor Linux activo (Docker Desktop en Windows). No necesitas instalar Node, Python, PostgreSQL ni FLOCI en el host para ejecutar la aplicación. La primera construcción necesita Internet para imágenes/dependencias y puede tardar varios minutos.

Puertos locales libres: 5432, 8000 y 27901; 4566 sólo para FLOCI. No publicar el laboratorio en Internet: el login actual es mock y permite elegir perfil sin contraseña.

Desde una terminal, clonar directamente la rama:

```powershell
git clone --branch diegx --single-branch https://github.com/Rebepi/CloudOps.git
cd CloudOps
docker compose up -d --build --wait --wait-timeout 180 api worker frontend
```

El mismo bloque funciona en una terminal Linux/macOS. Si el repositorio requiere acceso, autenticar Git con tu cuenta sin poner tokens en la URL.

Abrir http://127.0.0.1:27901. Elegir Administrador o Lector y entrar al proyecto `Laboratorio local`.
API/OpenAPI: http://127.0.0.1:8000/docs. Comprobar contenedores con `docker compose ps`.

Compose instala requirements/constraints de Python y dependencias del package-lock; inicia PostgreSQL; aplica Alembic hasta `0002_network`; ejecuta bootstrap idempotente de catálogos, workspace, proyecto y usuarios; inicia API/worker/frontend. El frontend usa API, no fallback demo.

**No es necesario crear `.env` para el primer arranque.** Los defaults de PostgreSQL son valores públicos de laboratorio, no credenciales AWS/productivas. Si necesitas overrides, copiar `.env.example` a `.env` y editarlo de forma privada. No reutilizar esos defaults fuera del laboratorio. No cambiar la contraseña de un volumen PostgreSQL existente sólo editando `.env`: el volumen mantiene su contraseña original.

### Qué verás al clonar

La base nueva comienza sin propuestas, conexiones ni snapshots del equipo anterior. Ver listas vacías es correcto: la app no fabrica inventario. La prueba AWS de 9 recursos quedó en un volumen privado de la laptop original, **no está en Git**. Los datos de `localStorage` y `sessionStorage` tampoco viajan en el repositorio.

El código y todas las migraciones sí viajan. El backend puede funcionar sin FLOCI y sin cuenta AWS: planificación, sesiones, autorización, almacenamiento y auditoría local.

## FLOCI opcional, sin AWS real

```powershell
docker compose --profile floci up -d --wait --wait-timeout 180 floci
```

Entrar como administrador, abrir Operaciones, crear conexión FLOCI, probar identidad y sincronizar. La cuenta emulada es `000000000000` y la región inicial `us-east-1`. Un emulador nuevo está vacío; los tests crean sus propios fixtures y no habilitan AWS real. FLOCI usa volumen WAL y no recibe el socket Docker.

## Detener, reanudar y actualizar

```powershell
docker compose stop
docker compose up -d --wait --wait-timeout 180 api worker frontend
```

Estos comandos conservan los volúmenes. No usar `docker compose down -v` para resolver errores: eliminaría la base y la evidencia local.

Para actualizar una copia limpia de esta rama:

```powershell
git pull --ff-only
docker compose up -d --build --wait --wait-timeout 180 api worker frontend
```

Si tienes cambios locales, preservarlos antes de actualizar. No usar reset/checkout destructivos. Una migración fallida deja la API no-ready; revisar `docker compose logs --tail 50 migrate` antes de intentar nuevamente. Docker Desktop debe estar activo tras reiniciar Windows.

## Pruebas reproducibles

Desde la raíz, backend/Linux/PostgreSQL/FLOCI:

```powershell
docker compose --profile test run --build --rm test
```

Usa `cloudops_test` y bases temporales de migración, no borra la base de negocio. Última suite validada: 46 correctas, 1 smoke AWS intencionalmente omitida. Ruff incluido.

Para las pruebas frontend instalar Node 24 en el host; desde `frontend/`:

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

En Linux/macOS usar `npm`/`npx` sin `.cmd`. E2E requiere el frontend Docker activo y FLOCI disponible; ejecutar antes el perfil test inicia PostgreSQL/FLOCI. Última validación: 5 unitarias y 9 E2E. Los E2E de integración pueden dejar conexión/jobs/auditoría de laboratorio; no contactan AWS. CI reproduce esas comprobaciones con AWS deshabilitado.

## AWS real: configuración privada y separada

El arranque mínimo fuerza `ALLOW_AWS=false` y no monta `.aws`. Clonar no reutiliza el perfil de esta laptop. No subir claves, tokens de SSO, `.aws` ni `.env` para conseguir portabilidad.

Configurar en el nuevo host un perfil **no-root**, temporal y read-only. La política de ejemplo `infra/iam/cloudops-inventory-readonly.json` es documentación, no se aplica ni crea identidades automáticamente. Después de autorizar alcance/cuenta/región, configurar en `.env` privado:

```dotenv
ALLOW_AWS=true
AWS_PROFILE=cloudops-readonly
AWS_SHARED_CONFIG_DIR=C:/Users/TU_USUARIO/.aws
AWS_ACCOUNT_ALLOWLIST=["CUENTA_AUTORIZADA_12_DIGITOS"]
AWS_REGION_ALLOWLIST=["us-east-1"]
```

Son placeholders: reemplazarlos localmente; usar ruta absoluta existente (Linux/macOS: ruta real a tu `.aws`). No añadir access keys a este archivo. Aplicar el override explícito:

```powershell
docker compose -f compose.yaml -f compose.aws.yaml up -d --wait --wait-timeout 180 api worker frontend
```

El override monta configuración/credenciales del host en modo lectura sólo en API/worker. Un fallo de permisos del montaje o del perfil no se soluciona copiando secretos al código. STS comprueba identidad/cuenta antes del inventario; root queda rechazado en el flujo normal. La excepción CLI previa no se activa al clonar y no es el arranque recomendado.

Consultar AWS puede generar cargos dependiendo de las APIs/recursos; ejecutar localmente no garantiza costo cero. Cost Explorer, CloudWatch, CloudTrail, Security Hub y despliegue cloud no se activan por estos comandos. No ejecutar nuevamente el smoke root para llenar la pantalla sin revisar autorización y costo.

Para volver al arranque sin montajes AWS, recrear explícitamente los contenedores normales:

```powershell
docker compose up -d --force-recreate --wait --wait-timeout 180 api worker frontend
```

## Trasladar datos existentes (opcional, privado)

Git transporta código, **no datos**. Si necesitas propuestas/auditoría/snapshots de la otra laptop, el traslado debe hacerse por backup privado, no con `git add` ni adjuntos públicos. El dump contiene información de cuenta, recursos y hashes de sesiones; tratarlo como sensible. `backups/` y `*.dump` están excluidos.

Procedimiento recomendado: detener API/worker del origen, crear backup PostgreSQL con `pg_dump` en formato custom, verificarlo con `pg_restore --list`, transferirlo cifrado por un canal privado y restaurarlo en una **base nueva dedicada** en el destino. No sobrescribir una base con datos sin aprobación. Comprobar Alembic, conteos y muestras de relaciones; revocar sesiones trasladadas antes de uso. El backup/restore automatizado y probado aún es un pendiente, no se ejecutó como parte del push.

No copiar `node_modules`, `.venv`, volúmenes Docker, `.aws` ni cachés. No se necesitan para reconstruir el sistema.

## Mapa de documentación

- [Estado actual y pendientes verificables](ESTADO-Y-PENDIENTES.md).
- [Implementación, endpoints, pruebas y resultado AWS puntual](IMPLEMENTACION.md).
- [Modelo relacional y migraciones](MODELO-DATOS.md).
- [Plan de arquitectura completo](../ARQUITECTURA-Y-PLAN.md).
