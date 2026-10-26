export interface ServiceInfo {
  id: string;
  name: string;
  shortName: string;
  badgeClass: string;
  dotColor: string;
}

export function detectAwsService(finding: {
  title?: string;
  resource?: string | null;
  source?: string;
  category?: string;
}): ServiceInfo {
  if (finding.source === 'trivy-config' || finding.category === 'iac') return { id: 'iac', name: 'Infraestructura declarada', shortName: 'IaC', badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20', dotColor: '#f59e0b' };
  if (finding.source === 'gitleaks') return { id: 'repository-secrets', name: 'Secretos del repositorio', shortName: 'Secretos', badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20', dotColor: '#f43f5e' };
  if (finding.source === 'semgrep') return { id: 'sast', name: 'Análisis SAST', shortName: 'SAST', badgeClass: 'bg-violet-500/10 text-violet-400 border-violet-500/20', dotColor: '#8b5cf6' };
  if (finding.source === 'trivy') return { id: 'images', name: 'Análisis de imágenes', shortName: 'Imágenes', badgeClass: 'bg-violet-500/10 text-violet-400 border-violet-500/20', dotColor: '#8b5cf6' };
  const text = `${finding.title || ''} ${finding.resource || ''} ${finding.category || ''}`.toLowerCase();

  // 1. IAM & Access
  if (
    text.includes('iam') ||
    text.includes('root user') ||
    text.includes('cuenta root') ||
    text.includes('mfa') ||
    text.includes('access key') ||
    text.includes('clave de acceso') ||
    text.includes('usuario(s)') ||
    text.includes('assumed-role') ||
    text.includes('policy')
  ) {
    return {
      id: 'iam',
      name: 'AWS Identity & Access Management (IAM)',
      shortName: 'IAM',
      badgeClass: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
      dotColor: '#6366f1',
    };
  }

  // 2. Amazon S3
  if (text.includes('s3') || text.includes('bucket')) {
    return {
      id: 's3',
      name: 'Amazon Simple Storage Service (S3)',
      shortName: 'S3',
      badgeClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      dotColor: '#10b981',
    };
  }

  // 3. Amazon RDS
  if (text.includes('rds') || text.includes('dbinstance') || text.includes('database instance')) {
    return {
      id: 'rds',
      name: 'Amazon Relational Database Service (RDS)',
      shortName: 'RDS',
      badgeClass: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      dotColor: '#3b82f6',
    };
  }

  // 4. Amazon VPC & Networking
  if (
    text.includes('vpc') ||
    text.includes('security group') ||
    text.includes('security groups') ||
    text.includes('subnet') ||
    text.includes('inbound') ||
    text.includes('outbound') ||
    text.includes('traffic') ||
    text.includes('internet gateway') ||
    text.includes('route table')
  ) {
    return {
      id: 'vpc',
      name: 'Amazon Virtual Private Cloud (VPC)',
      shortName: 'VPC / Red',
      badgeClass: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
      dotColor: '#a855f7',
    };
  }

  // 5. CloudTrail & Logs / Monitoring
  if (
    text.includes('cloudtrail') ||
    text.includes('trail') ||
    text.includes('cloudwatch') ||
    text.includes('flow log') ||
    text.includes('audit log')
  ) {
    return {
      id: 'cloudtrail',
      name: 'AWS CloudTrail & Auditoría',
      shortName: 'CloudTrail',
      badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      dotColor: '#f59e0b',
    };
  }

  // 5. Amazon Inspector
  if (text.includes('inspector')) {
    return {
      id: 'inspector',
      name: 'Amazon Inspector',
      shortName: 'Inspector',
      badgeClass: 'bg-teal-500/10 text-teal-500 border-teal-500/20',
      dotColor: '#14b8a6',
    };
  }

  // 6. Amazon EC2 & Compute
  if (text.includes('ec2') || text.includes('ami') || text.includes('ebs') || text.includes('instance')) {
    return {
      id: 'ec2',
      name: 'Amazon EC2 (Cómputo)',
      shortName: 'EC2',
      badgeClass: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      dotColor: '#f97316',
    };
  }

  // 7. Amazon ECR & Containers
  if (text.includes('ecr') || text.includes('docker') || text.includes('container') || text.includes('ecs') || text.includes('eks')) {
    return {
      id: 'containers',
      name: 'Contenedores / Amazon ECR',
      shortName: 'ECR / Contenedores',
      badgeClass: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
      dotColor: '#06b6d4',
    };
  }

  // 8. AWS Systems Manager (SSM)
  if (text.includes('ssm') || text.includes('systems manager')) {
    return {
      id: 'ssm',
      name: 'AWS Systems Manager (SSM)',
      shortName: 'SSM',
      badgeClass: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      dotColor: '#3b82f6',
    };
  }

  // 9. AWS Config
  if (text.includes('config') || text.includes('compliance')) {
    return {
      id: 'config',
      name: 'AWS Config',
      shortName: 'Config',
      badgeClass: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
      dotColor: '#0ea5e9',
    };
  }

  // 10. KMS & Encryption
  if (text.includes('kms') || text.includes('encrypt') || text.includes('tls') || text.includes('ssl') || text.includes('cipher')) {
    return {
      id: 'encryption',
      name: 'AWS KMS & Cifrado',
      shortName: 'Cifrado / KMS',
      badgeClass: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
      dotColor: '#f43f5e',
    };
  }

  // 11. Code / Dependencies (SAST, OSV)
  if (finding.category === 'code' || finding.category === 'dependency' || finding.source === 'osv' || finding.category === 'secret') {
    return {
      id: 'code',
      name: 'Código & Dependencias (OSV)',
      shortName: 'Código / OSV',
      badgeClass: 'bg-fuchsia-500/10 text-fuchsia-500 border-fuchsia-500/20',
      dotColor: '#d946ef',
    };
  }

  // 12. AWS Security Hub
  if (
    finding.source === 'security-hub' ||
    text.includes('security hub') ||
    text.includes('securityhub') ||
    finding.category === 'cloud-posture'
  ) {
    return {
      id: 'security-hub',
      name: 'AWS Security Hub',
      shortName: 'Security Hub',
      badgeClass: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
      dotColor: '#f43f5e',
    };
  }

  // 13. Fallback
  return {
    id: 'aws-general',
    name: 'AWS General & Gobernanza',
    shortName: 'AWS General',
    badgeClass: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
    dotColor: '#64748b',
  };
}
