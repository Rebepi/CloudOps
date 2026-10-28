# CloudOps local

Consola local para consultar datos de una cuenta AWS desde la interfaz original del proyecto. El frontend usa React y Vite; la API usa Fastify y TypeScript; PostgreSQL 17 corre en Docker. La API consulta AWS con el perfil de rol temporal `cloudops-audit`. Las propuestas, partidas, proyectos y evaluaciones se guardan en PostgreSQL local.

## Puesta en marcha en otra PC

Lee la [guía de instalación](docs/INSTALACION.md). Incluye requisitos, configuración de AWS CLI, variables locales, dependencias, migraciones, inicio y verificación de los tres servicios, además de soluciones a problemas habituales.

Resumen, desde la raíz del repositorio:

```powershell
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
# Asigna la misma contraseña local a POSTGRES_PASSWORD y a DATABASE_URL.
docker compose up -d postgres
Set-Location backend
npm ci
npm run migrate
npm run dev
```

En otra terminal:

```powershell
Set-Location frontend
npm ci
npm run dev
```

Abre `http://127.0.0.1:29000`. La API responde en `http://127.0.0.1:27902/api/v1/health`; PostgreSQL escucha en `127.0.0.1:5433`. El arranque anterior usa comandos Docker y npm, sin requerir archivos `.bat`. Compose administra PostgreSQL; frontend y API se ejecutan con Node.

## Arquitectura y datos

| Vista | Fuente principal |
| --- | --- |
| Dashboard | STS, EC2, RDS, S3, CloudWatch, CloudTrail y Cost Explorer |
| Proyectos | Portafolio local con evaluaciones AWS y de código ZIP, puntaje, cobertura, hallazgos e historial |
| Infraestructura | Regiones, zonas de disponibilidad e inventario AWS de la región seleccionada |
| Red | VPC, subredes, rutas, gateways, grupos de seguridad y Flow Logs |
| Seguridad | IAM, CloudTrail, Security Hub, AWS Config y Amazon Inspector si están habilitados; simulación de políticas IAM |
| Costos | Cost Explorer y partidas de planificación guardadas localmente |
| Servicios | Catálogo descriptivo y ofertas bajo demanda de AWS Price List |
| Planificación | Propuestas guardadas en PostgreSQL local |

La API está en `backend/src`; sus migraciones están en `backend/migrations`. El frontend está en `frontend/src`. `compose.yaml` define PostgreSQL con un volumen persistente. Las respuestas AWS indican fuente y fecha; las consultas sin recursos muestran un estado vacío. Algunos servicios pueden devolver errores si no están habilitados en la cuenta. El gasto de Cost Explorer puede llegar con retraso y contener días estimados.

La importación automática lee `cops.propuestas` y `cops.costos` del mismo origen del navegador y es idempotente. Si la versión anterior se abrió en otro puerto o dominio, exporta su JSON y usa **Importar JSON anterior** en Planificación. Se omiten los registros de demostración originales.

## Desarrollo y seguridad

- Ejecuta `npm run migrate` desde `backend` después de cambios en el esquema.
- Verifica con `npm run build` en ambos directorios y `npm run lint` en `frontend`.
- Las credenciales AWS se resuelven en el backend mediante AWS CLI. No se copian al repositorio, al contenedor ni al navegador.
- La conexión admite credenciales temporales mediante `AWS_ROLE_ARN` y STS. El backend bloquea nuevas evaluaciones cuando detecta que el principal activo es root. Consulta [la guía del rol de auditoría](docs/AWS_AUDIT_ROLE.md) y las políticas de ejemplo en `aws/`.
- La activación limitada, verificación y baja de Security Hub están documentadas en [la guía de prueba controlada](docs/SECURITY_HUB_TRIAL.md).
- Las llamadas AWS implementadas son de lectura o simulación de políticas; crear propuestas y partidas solo modifica PostgreSQL local. No hay despliegue de infraestructura AWS.
- Las evaluaciones guardadas desde un proyecto consultan IAM, CloudTrail, Security Hub, AWS Config y Amazon Inspector con el perfil local configurado, normalizan los hallazgos y conservan cada ejecución en PostgreSQL. La consulta es de solo lectura: no habilita servicios ni crea reglas o escaneos.
- La evaluación de código acepta un ZIP de hasta 100 MB, valida rutas, cifrado, enlaces, tamaño expandido y relación de compresión, y lo procesa sin extraer ni ejecutar el proyecto. Analiza patrones de código, secretos, IaC y versiones fijadas; para dependencias consulta OSV enviando únicamente ecosistema, nombre y versión. El ZIP temporal se elimina al finalizar y se conserva su SHA-256 con el reporte.
- Los límites del análisis son 10 000 entradas, 250 MB descomprimidos, 8 MB por entrada y 60 MB acumulados de texto. Un resultado estático señala riesgos para revisión; no sustituye pruebas dinámicas, pentesting ni una certificación.
- El token de Cloudflare retirado de los scripts actuales permanece en el historial Git anterior y debe revocarse.

Para continuar el desarrollo con otro asistente, usa el [prompt de continuidad](docs/PROMPT_CONTINUIDAD.md).

El plan vigente está en [PLAN_ESCALAMIENTO_SEGURIDAD.md](PLAN_ESCALAMIENTO_SEGURIDAD.md). La entrega de fases 8 y 9, Groq, reproducción, resultados reales y límites se detallan en [docs/FASES_8_9.md](docs/FASES_8_9.md). [IMPLEMENTACION_SEGURIDAD_AWS.md](docs/IMPLEMENTACION_SEGURIDAD_AWS.md) conserva el historial de implementación.

## Inicio desde el contenedor Nexus

El botón Iniciar y `iniciar_sistema.bat` usan `../backend/scripts/cloudops-power.mjs` y el mismo controlador. Requieren el backend de Nexus compilado (`npm run build` desde `../backend`), dependencias instaladas y PostgreSQL disponible. La interfaz usa 29000, la API 27902 y la comprobación local del túnel 29001.

Guarda solamente el token vigente del túnel en `.cloudflare-token` (archivo local excluido de Git). En Cloudflare, la ruta pública `cloudops.rebepi.com` debe pertenecer al mismo túnel y tener servicio `http://127.0.0.1:29000`. Si aparece `Unauthorized: Tunnel not found`, el token guardado ya no permite conectar: obtén el token del túnel vigente y reemplaza el contenido del archivo. Reiniciar con el mismo token rechazado no resuelve el error 1033.

El arranque comprueba la API, PostgreSQL, la interfaz, la conexión del túnel y la API a través del dominio público antes de confirmar el estado en línea. Los fallos se devuelven al botón y se registran en `../backend/logs/cloudops-*.log`. Apagar detiene la interfaz, la API y el conector propio; PostgreSQL sigue disponible.
