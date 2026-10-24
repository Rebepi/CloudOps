export type FrameworkLabel = string | null;

export function frameworkFor(source: string, category: string): FrameworkLabel {
  if (category === 'coverage') return null;
  if (category === 'license') return 'Inventario de licencias / CycloneDX';

  if (category === 'dependency' || category === 'vulnerability') {
    return 'OWASP Top 10 2021 · A06 Componentes vulnerables y desactualizados';
  }
  if (category === 'secret') {
    return 'OWASP Top 10 2021 · A02 Fallos criptográficos / A07 Fallos de identificación y autenticación';
  }
  if (category === 'code') {
    return 'OWASP Top 10 2021 · A03 Inyección';
  }
  if (category === 'iac' || category === 'archive') {
    return 'OWASP Top 10 2021 · A05 Configuración de seguridad incorrecta';
  }
  if (category === 'configuration' || category === 'compliance') {
    return 'CIS AWS Foundations Benchmark';
  }
  if (category === 'cloud-posture') {
    return 'CIS AWS Foundations Benchmark / AWS Foundational Security Best Practices';
  }
  if (category === 'identity' || category === 'account') {
    return 'CIS AWS Foundations Benchmark · Gestión de identidades y accesos';
  }
  if (category === 'logging') {
    return 'CIS AWS Foundations Benchmark · Registro y monitoreo';
  }
  if (source === 'security-hub' || source === 'aws-config' || source === 'amazon-inspector') {
    return 'CIS AWS Foundations Benchmark';
  }
  return null;
}

export function isApplicableForScore(category: string): boolean {
  return category !== 'coverage';
}
