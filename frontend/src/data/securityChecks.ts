import type { ControlSeguridad, UsuarioIAM, CloudWatchEvento } from '../types/cloud';

export const controlesSeguridad: ControlSeguridad[] = [
  {
    id: 'rc-1',
    dominio: 'Responsabilidad compartida',
    titulo: 'Seguridad DE la nube (Responsabilidad AWS)',
    descripcion: 'AWS gestiona la seguridad física de centros de datos, red troncal, servidores bare-metal y el hipervisor de virtualización Nitro.',
    nivel: 'correcto',
    recomendacion: 'Sin acción directa del cliente. Revisar certificaciones SOC 1/2/3 e ISO 27001 en AWS Artifact.',
    framework: 'AWS Shared Responsibility Model',
  },
  {
    id: 'rc-2',
    dominio: 'Responsabilidad compartida',
    titulo: 'Seguridad EN la nube (Responsabilidad del Cliente)',
    descripcion: 'El cliente es responsable del sistema operativo, reglas de firewall (Security Groups), parches de software, cifrado y control de identidades IAM.',
    nivel: 'correcto',
    recomendacion: 'Mantener matrices RACI actualizadas y automatizar el parchado con AWS Systems Manager Patch Manager.',
    framework: 'AWS Shared Responsibility Model',
  },
  {
    id: 'iam-1',
    dominio: 'Gestión de identidades (IAM)',
    titulo: 'Principio de privilegio mínimo (PoLP)',
    descripcion: 'Cada usuario, rol y microservicio recibe únicamente las acciones IAM estrictamente requeridas para su operación.',
    nivel: 'correcto',
    recomendacion: 'Auditar permisos inactivos usando IAM Access Analyzer cada 90 días.',
    framework: 'CIS AWS Benchmark 1.16',
  },
  {
    id: 'iam-2',
    dominio: 'Gestión de identidades (IAM)',
    titulo: 'Autenticación Multifactor (MFA) Obligatoria',
    descripcion: 'El usuario root y todas las cuentas con privilegios administrativos tienen token MFA de hardware o aplicación virtual activado.',
    nivel: 'revision',
    recomendacion: 'Activar MFA obligatorio en 2 cuentas de desarrolladores de nivel intermedio.',
    framework: 'CIS AWS Benchmark 1.5',
  },
  {
    id: 'iam-3',
    dominio: 'Gestión de identidades (IAM)',
    titulo: 'Rotación de credenciales programática',
    descripcion: 'Las claves de acceso de larga duración se reemplazan por roles IAM asumidos temporalmente mediante AWS STS.',
    nivel: 'correcto',
    recomendacion: 'Prohibir access keys en cuentas humanas e integrar Identity Center (SSO).',
    framework: 'PCI-DSS v4.0 Req 8.3',
  },
  {
    id: 'cta-1',
    dominio: 'Protección de la cuenta',
    titulo: 'Restricción de la cuenta Root',
    descripcion: 'Las claves de acceso root están eliminadas permanentemente. La cuenta se resguarda en bóveda de seguridad física.',
    nivel: 'correcto',
    recomendacion: 'Generar alarmas automáticas en CloudWatch si el usuario root inicia sesión.',
    framework: 'CIS AWS Benchmark 1.1',
  },
  {
    id: 'cta-2',
    dominio: 'Protección de la cuenta',
    titulo: 'Registro unificado de auditoría (CloudTrail)',
    descripcion: 'AWS CloudTrail activo en todas las regiones, registrando llamadas API de administración y eventos de datos hacia S3 inmutable.',
    nivel: 'correcto',
    recomendacion: 'Habilitar CloudTrail Lake para consultas analíticas de seguridad con SQL.',
    framework: 'CIS AWS Benchmark 2.1',
  },
  {
    id: 'cta-3',
    dominio: 'Protección de la cuenta',
    titulo: 'Detección inteligente de amenazas (GuardDuty)',
    descripcion: 'Amazon GuardDuty analiza flujos de VPC, logs de DNS y eventos de inicio de sesión buscando anomalías con machine learning.',
    nivel: 'revision',
    recomendacion: 'Integrar notificaciones de hallazgos críticos a un canal de Slack mediante Amazon EventBridge.',
    framework: 'SOC 2 Tipo II',
  },
  {
    id: 'dat-1',
    dominio: 'Protección de datos',
    titulo: 'Cifrado de datos en reposo con AWS KMS',
    descripcion: 'Todos los buckets S3 y volúmenes EBS utilizan cifrado del lado del servidor SSE-KMS con claves administradas por el cliente.',
    nivel: 'correcto',
    recomendacion: 'Aplicar políticas de ciclo de vida para bloquear la eliminación accidental de claves maestras.',
    framework: 'ISO/IEC 27001',
  },
  {
    id: 'dat-2',
    dominio: 'Protección de datos',
    titulo: 'Cifrado de datos en tránsito (TLS 1.3)',
    descripcion: 'Toda comunicación externa e interna entre microservicios y bases de datos está forzada bajo HTTPS con certificados de AWS Certificate Manager.',
    nivel: 'correcto',
    recomendacion: 'Deshabilitar versiones anteriores de TLS (TLS 1.0 y 1.1) en las políticas de seguridad del ALB.',
    framework: 'NIST SP 800-52 Rev 2',
  },
  {
    id: 'dat-3',
    dominio: 'Protección de datos',
    titulo: 'Bloqueo de acceso público en Amazon S3',
    descripcion: 'La directiva de bloqueo de acceso público está aplicada a nivel de cuenta completa, evitando filtración de datos accidentales.',
    nivel: 'correcto',
    recomendacion: 'Mantener habilitado S3 Object Lock en buckets que almacenen logs de cumplimiento financiero.',
    framework: 'CIS AWS Benchmark 2.1.4',
  },
  {
    id: 'cum-1',
    dominio: 'Cumplimiento',
    titulo: 'Cumplimiento regulatorio y Well-Architected Framework',
    descripcion: 'Evaluación continua del pilar de seguridad de AWS Well-Architected con remediación automatizada de desvíos.',
    nivel: 'revision',
    recomendacion: 'Ejecutar revisión Well-Architected formal previo al pase a producción masiva.',
    framework: 'AWS Well-Architected Pillar 2',
  },
];

export const usuariosIAM: UsuarioIAM[] = [
  {
    id: 'usr-1',
    nombre: 'admin.infra',
    tipo: 'Usuario',
    politicas: ['AdministratorAccess', 'BillingFullAccess'],
    mfa: true,
    ultimoAcceso: 'Hace 12 minutos',
    arn: 'arn:aws:iam::123456789012:user/admin.infra',
    politicaJson: JSON.stringify(
      {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: '*',
            Resource: '*',
          },
        ],
      },
      null,
      2
    ),
  },
  {
    id: 'usr-2',
    nombre: 'dev.backend',
    tipo: 'Usuario',
    politicas: ['AmazonEC2ReadOnlyAccess', 'AmazonRDSDataFullAccess', 'AWSLambda_FullAccess'],
    mfa: true,
    ultimoAcceso: 'Ayer a las 16:45',
    arn: 'arn:aws:iam::123456789012:user/dev.backend',
    politicaJson: JSON.stringify(
      {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['lambda:*', 'rds-data:*', 'ec2:Describe*'],
            Resource: '*',
          },
        ],
      },
      null,
      2
    ),
  },
  {
    id: 'usr-3',
    nombre: 'auditor.seguridad',
    tipo: 'Usuario',
    politicas: ['SecurityAudit', 'ViewOnlyAccess'],
    mfa: true,
    ultimoAcceso: 'Hace 3 días',
    arn: 'arn:aws:iam::123456789012:user/auditor.seguridad',
    politicaJson: JSON.stringify(
      {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['cloudtrail:LookupEvents', 'config:Get*', 'iam:GenerateCredentialReport'],
            Resource: '*',
          },
        ],
      },
      null,
      2
    ),
  },
  {
    id: 'rol-1',
    nombre: 'EC2-AppInstance-Role',
    tipo: 'Rol',
    politicas: ['AmazonS3ReadOnlyAccess', 'CloudWatchAgentServerPolicy'],
    mfa: false,
    ultimoAcceso: 'Continuo (Instancia EC2)',
    arn: 'arn:aws:iam::123456789012:role/EC2-AppInstance-Role',
    politicaJson: JSON.stringify(
      {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['s3:GetObject', 's3:ListBucket', 'cloudwatch:PutMetricData'],
            Resource: '*',
          },
        ],
      },
      null,
      2
    ),
  },
  {
    id: 'grp-1',
    nombre: 'DevOps-Team-Group',
    tipo: 'Grupo',
    politicas: ['AmazonVPCFullAccess', 'AWSCloudFormationFullAccess'],
    mfa: true,
    ultimoAcceso: 'Hace 1 hora',
    arn: 'arn:aws:iam::123456789012:group/DevOps-Team-Group',
    politicaJson: JSON.stringify(
      {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['ec2:*Vpc*', 'ec2:*Subnet*', 'cloudformation:*'],
            Resource: '*',
          },
        ],
      },
      null,
      2
    ),
  },
];

export const eventosAuditoria: CloudWatchEvento[] = [
  {
    id: 'evt-1',
    tiempo: '13:12:04 UTC',
    servicio: 'Amazon EC2',
    evento: 'RunInstances',
    actor: 'admin.infra',
    estado: 'Éxito',
    region: 'us-east-1',
  },
  {
    id: 'evt-2',
    tiempo: '12:58:33 UTC',
    servicio: 'Amazon RDS',
    evento: 'CreateDBSnapshot',
    actor: 'aws:rds:backup-service',
    estado: 'Éxito',
    region: 'us-east-1',
  },
  {
    id: 'evt-3',
    tiempo: '12:45:10 UTC',
    servicio: 'AWS WAF',
    evento: 'BlockedSQLInjection',
    actor: 'waf:managed-rule-owasp',
    estado: 'Advertencia',
    region: 'Global (CloudFront)',
  },
  {
    id: 'evt-4',
    tiempo: '11:30:22 UTC',
    servicio: 'AWS IAM',
    evento: 'CreateRole',
    actor: 'admin.infra',
    estado: 'Éxito',
    region: 'Global',
  },
  {
    id: 'evt-5',
    tiempo: '10:15:00 UTC',
    servicio: 'Amazon S3',
    evento: 'PutBucketEncryption',
    actor: 'admin.infra',
    estado: 'Éxito',
    region: 'sa-east-1',
  },
];
