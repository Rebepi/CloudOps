import 'dotenv/config';

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? '',
  awsProfile: (process.env.AWS_PROFILE ?? 'default').trim(),
  awsRoleArn: (process.env.AWS_ROLE_ARN ?? '').trim(),
  awsExternalId: (process.env.AWS_EXTERNAL_ID ?? '').trim(),
  awsRoleSessionName: (process.env.AWS_ROLE_SESSION_NAME ?? 'cloudops-audit').trim(),
  awsAllowRootAudit: (process.env.AWS_ALLOW_ROOT_AUDIT ?? '').trim().toLowerCase() === 'true',
  region: process.env.AWS_REGION ?? 'us-east-1',
  port: Number(process.env.PORT ?? 27902),
  jwtSecret: process.env.JWT_SECRET ?? 'secreto-super-seguro-cloudops-2026-jwt',
  internalSsoSecret: (process.env.INTERNAL_SSO_SECRET ?? '').trim(),
  nexusBackendUrl: (process.env.NEXUS_BACKEND_URL ?? 'http://127.0.0.1:21401').replace(/\/+$/, ''),
  adminEmail: (process.env.ADMIN_EMAIL ?? 'renzobendezu51@gmail.com').trim().toLowerCase(),
  securityAlertWebhook: (process.env.SECURITY_ALERT_WEBHOOK ?? '').trim(),
  repositoryToken: (process.env.CLOUDOPS_REPOSITORY_TOKEN ?? '').trim(),
  trivyEnabled: (process.env.CLOUDOPS_TRIVY_ENABLED ?? '').trim().toLowerCase() === 'true',
  trivyExecutable: (process.env.CLOUDOPS_TRIVY_PATH ?? 'trivy').trim(),
  trivyMode: (process.env.CLOUDOPS_TRIVY_MODE ?? 'native').trim() === 'docker' ? 'docker' as const : 'native' as const,
  sastEnabled: (process.env.CLOUDOPS_SAST_ENABLED ?? '').trim().toLowerCase() === 'true',
  sastExecutable: (process.env.CLOUDOPS_SAST_PATH ?? 'semgrep').trim(),
  sastMode: (process.env.CLOUDOPS_SAST_MODE ?? 'docker').trim() === 'native' ? 'native' as const : 'docker' as const,
  gitleaksEnabled: (process.env.CLOUDOPS_GITLEAKS_ENABLED ?? '').trim().toLowerCase() === 'true',
  gitleaksMode: (process.env.CLOUDOPS_GITLEAKS_MODE ?? 'docker').trim() === 'native' ? 'native' as const : 'docker' as const,
  gitleaksExecutable: (process.env.CLOUDOPS_GITLEAKS_PATH ?? 'gitleaks').trim(),
  iacEnabled: (process.env.CLOUDOPS_IAC_ENABLED ?? '').trim().toLowerCase() === 'true',
};

if (!config.databaseUrl) throw new Error('DATABASE_URL es obligatorio');
