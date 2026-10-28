export type ArchitectureComponent = { id: string; name: string; category: string; confidence: string; evidence: string[] };
type PlatformCandidate = { service: string; purpose: string; basedOn: string; evidence: string[] };
export function platformCandidates(components: ArchitectureComponent[]): PlatformCandidate[] {
  const byId = new Map(components.map((component) => [component.id, component]));
  const candidates: PlatformCandidate[] = [];
  const add = (ids: string[], service: string, purpose: string) => {
    const basis = ids.map((id) => byId.get(id)).find(Boolean);
    if (basis) candidates.push({ service, purpose, basedOn: basis.name, evidence: basis.evidence });
  };
  add(['postgresql'], 'Amazon RDS for PostgreSQL / Aurora PostgreSQL', 'Alternativa administrada para la base PostgreSQL detectada; permite Multi-AZ, backups y cifrado gestionado.');
  add(['docker', 'compose'], 'Amazon ECR + ECS Fargate', 'Destino compatible con las imágenes y servicios de contenedor detectados, sin administrar servidores EC2.');
  add(['redis'], 'Amazon ElastiCache for Redis', 'Alternativa administrada para la caché o broker Redis evidenciado.');
  add(['worker'], 'Amazon SQS + ECS/Lambda', 'Opción para desacoplar trabajos: validar compatibilidad del worker, reintentos y semántica del broker; no implica sustituir Redis automáticamente.');
  add(['react'], 'Amazon S3 + CloudFront', 'Opción de publicación para el cliente React detectado cuando su compilación sea estática.');
  add(['email'], 'Amazon SES', 'Servicio administrado para el flujo de correo evidenciado en la aplicación.');
  add(['telemetry'], 'Amazon CloudWatch + AWS Distro for OpenTelemetry', 'Centraliza métricas, logs y trazas para la instrumentación encontrada.');
  add(['token-auth'], 'Amazon Cognito o un IdP OIDC corporativo', 'Opción para externalizar identidad y ciclo de vida de tokens detectados en el código.');
  return candidates;
}
