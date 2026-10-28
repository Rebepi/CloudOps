# Instalación de CloudOps en otra PC

CloudOps utiliza dos autenticaciones independientes:

1. El inicio de sesión de la aplicación valida usuarios almacenados en PostgreSQL.
2. El backend consulta AWS mediante el SDK, el perfil local de AWS CLI y una sesión temporal de `CloudOpsAuditRole`.

La aplicación no utiliza la sesión abierta en la consola web de AWS y no guarda credenciales AWS en PostgreSQL ni en el navegador.

## 1. Requisitos

- Git.
- Node.js 24 y npm (validado con Node 24.14.1 y npm 11.11.0).
- Docker Desktop con Docker Compose.
- AWS CLI v2.
- Acceso autorizado al repositorio de CloudOps.
- Una identidad AWS de origen autorizada para asumir `CloudOpsAuditRole`.

## 2. Obtener el proyecto

```powershell
git clone REPLACE_WITH_REPOSITORY_URL CloudOps
Set-Location CloudOps
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
```

Asigna una contraseña local nueva para PostgreSQL y coloca el mismo valor en
`POSTGRES_PASSWORD` y en la contraseña incluida en `DATABASE_URL`. Define también un
`JWT_SECRET` largo y aleatorio. No copies al repositorio los archivos `.env`.

## 3. Configurar el acceso a AWS

Security Hub, AWS Config y `CloudOpsAuditRole` ya pertenecen a la cuenta AWS. No se
vuelven a crear por cada PC. Cada equipo solamente necesita una identidad de origen
capaz de asumir el rol.

La configuración actual usa estos perfiles:

- `cloudops-source`: identidad de origen con el único permiso de asumir el rol;
- `cloudops-audit`: perfil que obtiene credenciales temporales de
  `CloudOpsAuditRole` mediante STS.

Configura la identidad de origen en la PC nueva:

```powershell
aws configure --profile cloudops-source
```

Introduce el Access Key ID y Secret Access Key entregados de forma segura para esa
identidad, la región `us-east-1` y salida `json`. No utilices claves de root. Para un
entorno empresarial es preferible reemplazar esta identidad por IAM Identity Center o
por credenciales de carga de trabajo.

En `%UserProfile%\.aws\config`, añade el perfil de rol. Usa los valores ya definidos
para la cuenta y conserva el External ID fuera del repositorio:

```ini
[profile cloudops-audit]
role_arn = arn:aws:iam::143924590537:role/CloudOpsAuditRole
source_profile = cloudops-source
external_id = REPLACE_WITH_EXISTING_EXTERNAL_ID
role_session_name = cloudops-audit
region = us-east-1
output = json
```

Verifica la sesión antes de iniciar CloudOps:

```powershell
aws sts get-caller-identity --profile cloudops-audit
```

La respuesta correcta debe contener:

```text
Account: 143924590537
Arn: arn:aws:sts::143924590537:assumed-role/CloudOpsAuditRole/cloudops-audit
```

El archivo `backend/.env` debe contener como mínimo:

```env
DATABASE_URL=postgresql://cloudops:REPLACE_PASSWORD@127.0.0.1:5433/cloudops
AWS_PROFILE=cloudops-audit
AWS_REGION=us-east-1
AWS_ALLOW_ROOT_AUDIT=false
JWT_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
```

## 4. Base de datos e inicio de sesión

Si se crea una base de datos nueva, las migraciones construyen el esquema y el usuario
administrador inicial definido actualmente por el proyecto. Cambia inmediatamente esa
contraseña para un despliegue real.

Si necesitas conservar proyectos, evaluaciones, usuarios e historial de la PC anterior,
debes realizar un respaldo de PostgreSQL y restaurarlo en la PC nueva. Copiar solamente
el código no transfiere esos datos.

## 5. Instalar e iniciar

Desde la raíz:

```powershell
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

Abre `http://127.0.0.1:29000`.

Aplica todas las migraciones disponibles, incluida `010_assessment_advice.cjs` para la revisión de IA. Para preparar/habilitar Semgrep, Trivy, Gitleaks e IaC y configurar Groq solo en el backend, sigue [FASES_8_9.md](FASES_8_9.md). Los analizadores deshabilitados o fallidos conservan ese estado y reducen la cobertura; no se convierten en controles aprobados.

## 6. Verificación

```powershell
Invoke-RestMethod "http://127.0.0.1:27902/api/v1/health"
Invoke-RestMethod "http://127.0.0.1:27902/api/v1/aws/connection"
```

Después de iniciar sesión, el Centro de Seguridad debe mostrar la cuenta
`143924590537` y una identidad `assumed-role` cuyo ARN corresponda a
`CloudOpsAuditRole`.

## 7. Despliegue compartido

Para una instalación accesible por varios usuarios no copies perfiles personales a
cada computadora. Ejecuta backend, frontend y PostgreSQL en un servidor controlado y
asigna al backend una identidad de carga de trabajo o un rol IAM. Los navegadores de
los usuarios solo inician sesión en CloudOps; nunca reciben credenciales AWS.

Usa HTTPS, cambia las credenciales iniciales, rota `JWT_SECRET`, restringe el acceso a
PostgreSQL y conserva copias de seguridad cifradas antes de considerar la instalación
apta para producción.
