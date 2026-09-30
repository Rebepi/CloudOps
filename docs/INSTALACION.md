# Instalar y levantar CloudOps en otra PC

Esta guía parte de una copia nueva del repositorio. Frontend y API corren en la PC; únicamente PostgreSQL corre en Docker. La API consulta AWS con credenciales configuradas en AWS CLI en esa misma PC. Ninguna instrucción despliega recursos en AWS.

## 1. Requisitos

- Git, Node.js 24 con npm, Docker Desktop con Docker Compose y AWS CLI v2.
- Acceso a la cuenta AWS de pruebas mediante el perfil local `cloudops-root`. Configura las credenciales por el método autorizado en esa PC; nunca las pegues en el proyecto ni en Git.
- Puertos libres: `27903` (frontend), `27902` (API), `5433` (PostgreSQL).
- En Windows, usa PowerShell. Los scripts `.bat` sirven para Windows; los comandos manuales de esta guía también se pueden adaptar a macOS/Linux.

Comprueba las herramientas:

```powershell
git --version
node --version
npm --version
docker compose version
aws --version
```

## 2. Descargar y configurar

```powershell
git clone https://github.com/Rebepi/CloudOps.git
Set-Location CloudOps
git switch nofunciona2
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
```

Pon una contraseña local larga en `POSTGRES_PASSWORD` dentro de `.env`. En `backend/.env`, sustituye `replace-with-a-long-local-password` de `DATABASE_URL` por **la misma contraseña**. Si la contraseña tiene caracteres especiales, codifícalos para una URL PostgreSQL o usa una contraseña alfanumérica larga. Mantén `AWS_PROFILE=cloudops-root`, `AWS_REGION=us-east-1` y `PORT=27902`, salvo que necesites valores distintos.

Los dos archivos `.env` están ignorados por Git. No copies credenciales AWS a esos archivos: el SDK las obtiene del perfil de AWS CLI. Verifica primero la identidad configurada:

```powershell
aws sts get-caller-identity --profile cloudops-root --region us-east-1
```

Comprueba que la cuenta devuelta sea la cuenta de pruebas esperada **antes** de consultar sus recursos. Si el perfil usa una sesión temporal, renuévala cuando venza. No incluyas claves, tokens ni la salida completa del archivo de credenciales en incidencias o commits.

## 3. Instalar dependencias

Desde la raíz del proyecto:

```powershell
npm ci --prefix backend
npm ci --prefix frontend
```

`npm ci` usa los archivos `package-lock.json` versionados y reproduce sus versiones. `node_modules` se genera en cada PC y no se sube a Git.

## 4. Iniciar base de datos y migrar

```powershell
docker compose up -d postgres
docker compose ps
Set-Location backend
npm run migrate
Set-Location ..
```

Espera a que `postgres` aparezca como `healthy` antes de migrar. Las migraciones en `backend/migrations` crean las tablas de propuestas, partidas, ajustes y caché. El volumen Docker conserva los datos al detener el contenedor. Después de actualizar la rama, vuelve a ejecutar `npm run migrate`.

## 5. Iniciar API y frontend

Abre dos terminales en la raíz del repositorio.

Terminal API:

```powershell
Set-Location backend
npm run dev
```

Terminal frontend:

```powershell
Set-Location frontend
npm run dev
```

Abre `http://127.0.0.1:27903`. Vite envía `/api` a la API local; no hace falta una variable de URL en el frontend. También puedes usar `iniciar_sistema.bat` desde la raíz una vez completados los pasos 2 y 3. Ese script inicia PostgreSQL, aplica migraciones y abre API y frontend. `apagar_sistema.bat` detiene los tres servicios sin borrar el volumen de la base de datos.

## 6. Verificar

```powershell
Invoke-RestMethod http://127.0.0.1:27902/api/v1/health
Invoke-RestMethod http://127.0.0.1:27902/api/v1/aws/identity
Invoke-RestMethod http://127.0.0.1:27902/api/v1/aws/regions
```

`health` debe responder `status: ok` y `database: connected`. La identidad y las regiones validan el acceso AWS desde la API. En Infraestructura, selecciona una región o zona de disponibilidad para ver su detalle consultado a AWS. Una región sin recursos mostrará cero o una lista vacía; eso es un resultado válido. Las respuestas pueden servirse de la caché local durante unos minutos y muestran `observedAt` y `cached`.

Para verificar el código:

```powershell
npm run build --prefix backend
npm run build --prefix frontend
npm run lint --prefix frontend
```

## Problemas habituales

| Síntoma | Revisión |
| --- | --- |
| `DATABASE_URL es obligatorio` | Confirma que existe `backend/.env` y que la API se ejecuta desde `backend`. |
| Error de autenticación PostgreSQL | Comprueba que la contraseña de ambos `.env` coincide. Si cambiaste la contraseña después de crear el volumen, PostgreSQL mantiene la contraseña anterior; actualízala dentro de PostgreSQL o usa una base local nueva sabiendo que perderías sus datos. |
| Puerto ocupado | Libera `27902`, `27903` o `5433`; el proyecto los fija en su configuración actual. |
| AWS `Unable to locate credentials` o token vencido | Reconfigura o renueva `cloudops-root` en AWS CLI y repite `aws sts get-caller-identity`. |
| AWS `AccessDenied` o servicio no habilitado | Revisa la acción y el servicio en la cuenta de pruebas. Security Hub y Compute Optimizer pueden no estar habilitados. |
| API responde pero frontend no carga datos | Comprueba las terminales de API y Vite; la ruta `/api` se proxifica desde `127.0.0.1:27903` hacia `127.0.0.1:27902`. |

La aplicación no requiere túneles, Cloudflare ni despliegue AWS para ejecutarse localmente. Las credenciales de la cuenta root de pruebas requieren especial cuidado: esta guía únicamente valida identidad y consulta datos; cualquier acción de escritura en AWS debe revisarse antes de implementarse o ejecutarse.
