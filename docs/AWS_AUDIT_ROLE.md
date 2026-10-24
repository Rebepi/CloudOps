# Conexión AWS segura para CloudOps

CloudOps admite un perfil de origen y la asunción de un rol IAM mediante STS. La aplicación no guarda claves AWS en PostgreSQL ni las envía al navegador.

## Variables del backend

Cuando AWS CLI ya contiene un perfil de rol con `source_profile`, configura el backend así:

```env
AWS_PROFILE=cloudops-audit
AWS_REGION=us-east-1
AWS_ALLOW_ROOT_AUDIT=false
```

El perfil `cloudops-audit` debe definir `role_arn`, `source_profile`, `external_id` y `role_session_name` en la configuración local de AWS CLI. El backend recibe directamente una sesión temporal. Como alternativa, el backend también admite un perfil de origen mediante `AWS_PROFILE` junto con `AWS_ROLE_ARN`, `AWS_EXTERNAL_ID` y `AWS_ROLE_SESSION_NAME`. Para cuentas de clientes, usa un External ID distinto por cliente.

## Políticas incluidas

- `aws/cloudops-audit-policy.json`: acciones de lectura que utiliza actualmente el backend.
- `aws/cloudops-audit-trust-policy.example.json`: plantilla de confianza. Sustituye ambos marcadores antes de utilizarla.
- `aws/cloudops-source-assume-role-policy.example.json`: único permiso que necesita el usuario técnico de origen.

La confianza utiliza el principal de la cuenta acompañado por `aws:PrincipalArn`, que restringe la asunción exclusivamente a `cloudops-source`. El uso de `:root` en el campo `Principal` no concede acceso al usuario root porque la condición exige el ARN exacto del usuario técnico.

Las acciones usan `Resource: "*"` porque muchas APIs de inventario y postura no admiten restricciones por ARN. La política no contiene acciones de creación, actualización, eliminación ni activación de servicios.

### Detalle por recurso de AWS Config (motor 1.4.0)

El rol debe incluir las acciones de lectura `config:DescribeConfigRules` y `config:GetComplianceDetailsByConfigRule`, agregadas a `aws/cloudops-audit-policy.json`. Actualiza la política del rol durante el despliegue antes de validar esta funcionalidad en vivo. Cambiar el archivo versionado no actualiza automáticamente IAM.

Si faltan esos permisos, CloudOps conserva el inventario y el resumen de cumplimiento disponibles, registra el error y marca la cobertura como parcial. No infiere identidades de recursos ni equivalencias a partir del nombre de una regla. El recolector limita el detalle a veinte reglas no conformes y dos páginas de cien resultados por regla; los límites alcanzados también quedan registrados.

## Comprobación

La API `GET /api/v1/aws/connection` devuelve el tipo de principal, si el rol fue asumido y si la conexión está lista. Cuando STS identifica la cuenta root, el backend solo permite consultar `GET /api/v1/aws/identity` y `GET /api/v1/aws/connection`; el resto de consultas y evaluaciones AWS quedan bloqueadas. El análisis ZIP continúa disponible porque no necesita credenciales AWS.

`AWS_ALLOW_ROOT_AUDIT=true` existe únicamente como mecanismo temporal de recuperación. No debe usarse en operación normal ni en entornos con clientes.

## Secuencia de migración

1. Crear o seleccionar la identidad de origen no root.
2. Crear `CloudOpsAuditRole` con la política de lectura incluida.
3. Configurar la relación de confianza y un External ID único.
4. Configurar las variables del backend y reiniciarlo.
5. Confirmar en CloudOps que el principal sea `assumed-role`.
6. Ejecutar una evaluación de prueba.
7. Solo después, deshabilitar y eliminar la clave root actualmente utilizada.

No elimines la clave root antes de comprobar que el rol puede consultar todas las fuentes necesarias.
