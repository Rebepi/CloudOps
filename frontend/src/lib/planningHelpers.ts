import { serviciosAWS } from '../data/awsServices';
import { regionGeometry } from '../data/regionGeometry';
import { usd, numero, fecha } from './format';
import type { PropuestaCloud } from '../types/cloud';

export interface DesgloseCalculado {
  servicioId: string;
  nombre: string;
  categoria: string;
  cantidad: string;
  costoEstimado: number;
  funcion: string;
  responsabilidad: string;
  unidad: string;
  cli: string;
  gratisTier: boolean;
}

export interface MetricasPropuesta {
  costoMensualCalculado: number;
  costoAnualCalculado: number;
  presupuestoMaximo: number;
  varianzaPresupuesto: number;
  dentroPresupuesto: boolean;
  porcentajeUsoPresupuesto: number;
  rpsEstimados: number;
  anchoBandaGbMes: number;
  conexionesBdEstimadas: number;
  storageGbEstimado: number;
  tierEscala: string;
  nombreRegion: string;
  continenteRegion: string;
  slaDetalle: {
    porcentaje: string;
    downtimeMes: string;
    downtimeAno: string;
    descripcion: string;
  };
  drpDetalle: {
    rtoHoras: number;
    rtoEstrategia: string;
    rpoMinutos: number;
    rpoEstrategia: string;
  };
  wellArchitectedScores: {
    global: number;
    seguridad: number;
    fiabilidad: number;
    rendimiento: number;
    costos: number;
    operaciones: number;
  };
  wellArchitectedPillares: Array<{
    id: string;
    nombre: string;
    score: number;
    color: string;
    descripcion: string;
    puntosClave: string[];
  }>;
  desgloseServicios: DesgloseCalculado[];
  serviciosPorCapa: {
    borde: DesgloseCalculado[];
    red: DesgloseCalculado[];
    computo: DesgloseCalculado[];
    datos: DesgloseCalculado[];
    gobierno: DesgloseCalculado[];
  };
  ahorroFinOps: {
    savingsPlans1Ano: number;
    savingsPlans3Anos: number;
    reservedInstances: number;
    s3Glacier: number;
  };
}

export function calcularMetricasPropuesta(p: PropuestaCloud): MetricasPropuesta {
  const usuarios = Math.max(100, p.usuariosEstimados || 1000);
  const disp = p.disponibilidad || 'alta';
  const presupuesto = p.presupuestoMaximo ?? 200;
  const regionInfo = regionGeometry[p.regionId] || {
    name: p.regionId,
    continent: 'América' as const,
    gps: [0, 0] as [number, number],
  };

  const rpsEstimados = Math.max(1, Math.round(usuarios * 0.12));
  const anchoBandaGbMes = Math.max(5, Math.round((usuarios * 0.12 * 86400 * 30 * 18) / (1024 * 1024)));
  const conexionesBdEstimadas = Math.max(2, Math.round(usuarios * 0.05));
  const storageGbEstimado = Math.max(20, Math.round(usuarios * 0.08 + 40));

  let tierEscala = 'Pequeña (Dev/SMB)';
  if (usuarios >= 50000) tierEscala = 'Enterprise (Escala Masiva)';
  else if (usuarios >= 15000) tierEscala = 'Grande (Alta Demanda)';
  else if (usuarios >= 2500) tierEscala = 'Mediana (Crecimiento)';

  const slaDetalle = {
    critica: {
      porcentaje: '99.99%',
      downtimeMes: '4.38 minutos',
      downtimeAno: '52.6 minutos',
      descripcion: 'Misión Crítica Multi-AZ / Multi-Región con conmutación en milisegundos y respaldo continuo.',
    },
    alta: {
      porcentaje: '99.95%',
      downtimeMes: '21.9 minutos',
      downtimeAno: '4.38 horas',
      descripcion: 'Alta Disponibilidad Multi-AZ con balanceo redundante y réplica en base de datos.',
    },
    basica: {
      porcentaje: '99.50%',
      downtimeMes: '3.65 horas',
      downtimeAno: '43.8 horas',
      descripcion: 'Despliegue estándar en Zona Única (Single-AZ) apto para desarrollo o cargas de trabajo internas.',
    },
  }[disp] || {
    porcentaje: '99.95%',
    downtimeMes: '21.9 minutos',
    downtimeAno: '4.38 horas',
    descripcion: 'Alta Disponibilidad estándar recomendada.',
  };

  const rto = p.rtoHoras ?? 2;
  const rpo = p.rpoMinutos ?? 30;

  const rtoEstrategia =
    rto <= 1
      ? 'Multi-AZ Hot Standby con conmutación por error automatizada en Route 53'
      : rto <= 4
      ? 'Warm Standby con réplicas activas listas para escalar en minutos'
      : 'Copia de seguridad y restauración programada (Backup & Restore)';

  const rpoEstrategia =
    rpo <= 15
      ? 'Replicación Síncrona continua con streaming de logs transaccionales (WAL)'
      : rpo <= 60
      ? 'Snapshots incrementales horarios con replicación interregional'
      : 'Copias de seguridad diarias automatizadas con retención de 30 días';

  const factorDisp = disp === 'critica' ? 1.8 : disp === 'alta' ? 1.35 : 1.0;

  const desgloseServicios: DesgloseCalculado[] = (p.serviciosSeleccionados || []).map((id) => {
    const s = serviciosAWS.find((srv) => srv.id === id) || {
      id,
      nombre: id.toUpperCase(),
      categoria: 'Cómputo',
      descripcion: 'Servicio en la nube de AWS',
      funcionPrincipal: 'Componente arquitectónico en la infraestructura',
      unidad: 'mes',
      responsabilidad: 'Compartida' as const,
      gratisTier: false,
      comandoCli: `aws ${id} help`,
    };

    let cantidadTexto = '1 unidad';
    let costoUnitario = 15;

    switch (id) {
      case 'ec2': {
        const inst = Math.max(1, Math.ceil(usuarios / 5000)) * (disp === 'critica' ? 4 : disp === 'alta' ? 2 : 1);
        cantidadTexto = `${inst}x instancias t3.medium (2 vCPU, 4GB RAM)`;
        costoUnitario = Math.round(inst * 30.5 * 100) / 100;
        break;
      }
      case 'lambda': {
        const inv = Math.max(50000, usuarios * 150);
        cantidadTexto = `~${numero(inv)} ejecuciones/mes (128MB)`;
        costoUnitario = Math.round(Math.max(4, inv * 0.0000025) * 100) / 100;
        break;
      }
      case 'rds': {
        const nodos = disp === 'critica' || disp === 'alta' ? 2 : 1;
        cantidadTexto = `${nodos}x nodo(s) db.t3.medium (${disp === 'critica' || disp === 'alta' ? 'Multi-AZ' : 'Single-AZ'}) + 50GB gp3`;
        costoUnitario = Math.round(nodos * 58.4 * 100) / 100;
        break;
      }
      case 'dynamodb': {
        cantidadTexto = `Capacidad On-Demand + ~${numero(usuarios * 30)} peticiones`;
        costoUnitario = Math.round(Math.max(8, 10 + (usuarios / 4000) * 3) * factorDisp * 100) / 100;
        break;
      }
      case 's3': {
        cantidadTexto = `${storageGbEstimado} GB Standard + 10k PUT/GET`;
        costoUnitario = Math.round((4 + storageGbEstimado * 0.023) * 100) / 100;
        break;
      }
      case 'ebs': {
        const gbs = Math.max(40, Math.round(storageGbEstimado * 0.8));
        cantidadTexto = `${gbs} GB almacenamiento gp3 (3000 IOPS, 125 MB/s)`;
        costoUnitario = Math.round((gbs * 0.08) * factorDisp * 100) / 100;
        break;
      }
      case 'elb': {
        cantidadTexto = '1x Application Load Balancer + LCU por tráfico';
        costoUnitario = Math.round((22.5 + (usuarios / 8000) * 3.5) * 100) / 100;
        break;
      }
      case 'cloudfront': {
        cantidadTexto = `${anchoBandaGbMes} GB transferencia hacia Internet + Edge PoPs`;
        costoUnitario = Math.round(Math.max(6, 4 + anchoBandaGbMes * 0.085) * 100) / 100;
        break;
      }
      case 'route53': {
        cantidadTexto = '1x Zona DNS alojada + comprobaciones de salud con failover';
        costoUnitario = 1.5;
        break;
      }
      case 'vpc': {
        cantidadTexto = '1x VPC dedicada con subredes públicas y privadas multi-AZ';
        costoUnitario = 0;
        break;
      }
      case 'iam': {
        cantidadTexto = 'Políticas RBAC, roles de servicio y credenciales cifradas';
        costoUnitario = 0;
        break;
      }
      case 'waf': {
        cantidadTexto = '1x Web ACL con reglas OWASP Top 10 y Rate Limiting';
        costoUnitario = 14;
        break;
      }
      case 'kms': {
        cantidadTexto = '1x Clave de cifrado CMK administrada por cliente (AES-256)';
        costoUnitario = 2.5;
        break;
      }
      case 'cloudwatch': {
        cantidadTexto = '15 métricas personalizadas, alarmas y retención de logs';
        costoUnitario = Math.round(Math.max(7, 6 + (usuarios / 5000) * 2) * 100) / 100;
        break;
      }
      default: {
        cantidadTexto = '1 aprovisionamiento base';
        costoUnitario = 12;
      }
    }

    return {
      servicioId: s.id,
      nombre: s.nombre,
      categoria: s.categoria,
      cantidad: cantidadTexto,
      costoEstimado: costoUnitario,
      funcion: s.funcionPrincipal,
      responsabilidad: s.responsabilidad,
      unidad: s.unidad,
      cli: s.comandoCli || `aws ${s.id} describe-resources`,
      gratisTier: !!s.gratisTier,
    };
  });

  const costoMensualCalculado = Math.round(desgloseServicios.reduce((acc, curr) => acc + curr.costoEstimado, 0) * 100) / 100;
  const costoAnualCalculado = Math.round(costoMensualCalculado * 12 * 100) / 100;
  const varianzaPresupuesto = Math.round((presupuesto - costoMensualCalculado) * 100) / 100;
  const dentroPresupuesto = varianzaPresupuesto >= 0;
  const porcentajeUsoPresupuesto = Math.round((costoMensualCalculado / Math.max(1, presupuesto)) * 100);

  const tieneKms = p.serviciosSeleccionados.includes('kms');
  const tieneIam = p.serviciosSeleccionados.includes('iam');
  const tieneWaf = p.serviciosSeleccionados.includes('waf');
  const tieneVpc = p.serviciosSeleccionados.includes('vpc');
  const tieneCloudWatch = p.serviciosSeleccionados.includes('cloudwatch');
  const tieneElb = p.serviciosSeleccionados.includes('elb');
  const tieneCloudFront = p.serviciosSeleccionados.includes('cloudfront');
  const tieneDynamo = p.serviciosSeleccionados.includes('dynamodb');
  const cumplimientoCount = p.cumplimiento?.length || 0;

  const scoreSeguridad = Math.min(99, Math.max(50, 60 + (tieneKms ? 10 : 0) + (tieneIam ? 10 : 0) + (tieneWaf ? 10 : 0) + (tieneVpc ? 5 : 0) + Math.min(10, cumplimientoCount * 3)));
  const scoreFiabilidad = Math.min(99, Math.max(50, (disp === 'critica' ? 95 : disp === 'alta' ? 88 : 70) + (tieneElb ? 4 : 0) + (rto <= 2 ? 3 : 0) + (rpo <= 30 ? 3 : 0)));
  const scoreRendimiento = Math.min(99, Math.max(50, 70 + (tieneCloudFront ? 14 : 0) + (tieneDynamo ? 8 : 0) + (tieneElb ? 6 : 0)));
  const scoreCostos = Math.min(99, Math.max(50, dentroPresupuesto ? (porcentajeUsoPresupuesto <= 80 ? 95 : 88) : Math.max(55, 90 - (porcentajeUsoPresupuesto - 100))));
  const scoreOperaciones = Math.min(99, Math.max(50, 68 + (tieneCloudWatch ? 18 : 0) + (tieneIam ? 8 : 0) + (tieneVpc ? 4 : 0)));
  const scoreGlobal = Math.round((scoreSeguridad + scoreFiabilidad + scoreRendimiento + scoreCostos + scoreOperaciones) / 5);

  const wellArchitectedScores = {
    global: scoreGlobal,
    seguridad: scoreSeguridad,
    fiabilidad: scoreFiabilidad,
    rendimiento: scoreRendimiento,
    costos: scoreCostos,
    operaciones: scoreOperaciones,
  };

  const wellArchitectedPillares = [
    {
      id: 'seguridad',
      nombre: 'Seguridad & Protección',
      score: scoreSeguridad,
      color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
      descripcion: 'Capacidad para proteger información, sistemas y activos mientras se aporta valor mediante evaluaciones de riesgo.',
      puntosClave: [
        tieneKms ? 'Cifrado en reposo habilitado con AWS KMS (AES-256)' : 'Recomendación: Incorporar AWS KMS para cifrado de reposo',
        tieneIam ? 'Control de acceso granular con IAM y principio de privilegio mínimo' : 'Recomendación: Fortalecer gobernanza de identidades con IAM',
        tieneWaf ? 'Firewall WAF perimetral activo contra ataques de capa 7 (OWASP)' : 'Recomendación: Implementar AWS WAF en balanceadores o CDN',
        tieneVpc ? 'Aislamiento de red mediante VPC con segmentación de subredes' : 'Recomendación: Aislar recursos en VPC dedicada',
      ],
    },
    {
      id: 'fiabilidad',
      nombre: 'Fiabilidad & Resiliencia',
      score: scoreFiabilidad,
      color: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
      descripcion: 'Capacidad de la carga de trabajo para recuperarse de interrupciones de infraestructura o de servicio.',
      puntosClave: [
        `Disponibilidad objetivo configurada en nivel ${disp.toUpperCase()} (${slaDetalle.porcentaje})`,
        `RTO garantizado de ${rto}h máx con estrategia: ${rtoEstrategia}`,
        `RPO garantizado de ${rpo}m máx con estrategia: ${rpoEstrategia}`,
        tieneElb ? 'Distribución elástica con Application Load Balancer' : 'Recomendación: Añadir ALB para distribución redundante',
      ],
    },
    {
      id: 'rendimiento',
      nombre: 'Eficiencia de Rendimiento',
      score: scoreRendimiento,
      color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
      descripcion: 'Uso estructurado y eficiente de los recursos informáticos para satisfacer los requisitos del sistema a escala.',
      puntosClave: [
        `Diseño dimensionado para soportar ${numero(usuarios)} usuarios (${numero(rpsEstimados)} RPS pico)`,
        tieneCloudFront ? 'Aceleración perimetral con CDN CloudFront en más de 450 PoPs' : 'Recomendación: Usar CloudFront para reducir latencias globales',
        tieneDynamo ? 'Almacenamiento NoSQL de latencia de milisegundo de un solo dígito' : 'Caché o base transaccional optimizada',
        `Ancho de banda mensual proyectado en ${numero(anchoBandaGbMes)} GB`,
      ],
    },
    {
      id: 'costos',
      nombre: 'Optimización de Costos (FinOps)',
      score: scoreCostos,
      color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
      descripcion: 'Capacidad de ejecutar sistemas para entregar valor comercial al precio más bajo posible.',
      puntosClave: [
        `Presupuesto objetivo: ${usd(presupuesto)}/mes frente a ${usd(costoMensualCalculado)}/mes proyectado`,
        dentroPresupuesto ? `Margen superávit disponible de ${usd(varianzaPresupuesto)}/mes (${100 - porcentajeUsoPresupuesto}% de holgura)` : `Alerta: Proyección excede el tope por ${usd(Math.abs(varianzaPresupuesto))}/mes (${porcentajeUsoPresupuesto}%)`,
        'Compatibilidad con Compute Savings Plans a 1 o 3 años para reducción adicional',
        'Políticas de ciclo de vida en S3 recomendadas para mover backups fríos a Glacier',
      ],
    },
    {
      id: 'operaciones',
      nombre: 'Excelencia Operativa',
      score: scoreOperaciones,
      color: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
      descripcion: 'Capacidad para dar soporte al desarrollo y ejecutar cargas de trabajo de forma eficaz con observabilidad.',
      puntosClave: [
        tieneCloudWatch ? 'Telemetría integral y registros centralizados en Amazon CloudWatch' : 'Recomendación: Agregar CloudWatch para observabilidad',
        'Estructura preparada para despliegue automatizado mediante Terraform (IaC)',
        `Supervisión continua en la región ${p.regionId} (${regionInfo.name})`,
        'Trazabilidad de auditoría para auditorías de cumplimiento normativo',
      ],
    },
  ];

  const serviciosPorCapa = {
    borde: desgloseServicios.filter((s) => ['route53', 'cloudfront', 'waf'].includes(s.servicioId)),
    red: desgloseServicios.filter((s) => ['vpc', 'elb'].includes(s.servicioId)),
    computo: desgloseServicios.filter((s) => ['ec2', 'lambda'].includes(s.servicioId)),
    datos: desgloseServicios.filter((s) => ['rds', 'dynamodb', 's3', 'ebs'].includes(s.servicioId)),
    gobierno: desgloseServicios.filter((s) => ['iam', 'kms', 'cloudwatch'].includes(s.servicioId)),
  };

  const ahorroFinOps = {
    savingsPlans1Ano: Math.round(costoMensualCalculado * 0.32 * 100) / 100,
    savingsPlans3Anos: Math.round(costoMensualCalculado * 0.54 * 100) / 100,
    reservedInstances: Math.round(costoMensualCalculado * 0.40 * 100) / 100,
    s3Glacier: Math.round(costoMensualCalculado * 0.15 * 100) / 100,
  };

  return {
    costoMensualCalculado,
    costoAnualCalculado,
    presupuestoMaximo: presupuesto,
    varianzaPresupuesto,
    dentroPresupuesto,
    porcentajeUsoPresupuesto,
    rpsEstimados,
    anchoBandaGbMes,
    conexionesBdEstimadas,
    storageGbEstimado,
    tierEscala,
    nombreRegion: regionInfo.name,
    continenteRegion: regionInfo.continent,
    slaDetalle,
    drpDetalle: {
      rtoHoras: rto,
      rtoEstrategia,
      rpoMinutos: rpo,
      rpoEstrategia,
    },
    wellArchitectedScores,
    wellArchitectedPillares,
    desgloseServicios,
    serviciosPorCapa,
    ahorroFinOps,
  };
}

export function generarTerraformCode(p: PropuestaCloud, m: MetricasPropuesta): string {
  const sanitize = (name: string) => name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const slug = sanitize(p.nombre || 'cloudops-app');

  const tieneVpc = p.serviciosSeleccionados.includes('vpc');
  const tieneEc2 = p.serviciosSeleccionados.includes('ec2');
  const tieneRds = p.serviciosSeleccionados.includes('rds');
  const tieneS3 = p.serviciosSeleccionados.includes('s3');
  const tieneKms = p.serviciosSeleccionados.includes('kms');
  const tieneElb = p.serviciosSeleccionados.includes('elb');
  const tieneCloudWatch = p.serviciosSeleccionados.includes('cloudwatch');

  return `terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "${p.regionId}"
  default_tags {
    tags = {
      Proyecto       = "${p.nombre}"
      Ambiente       = "Produccion"
      TipoAplicacion = "${p.tipoAplicacion}"
      SLA            = "${p.disponibilidad}"
      GestionadoPor  = "CloudOps-Planner"
    }
  }
}

variable "region" {
  type    = string
  default = "${p.regionId}"
}

variable "project_name" {
  type    = string
  default = "${slug}"
}

${tieneKms ? `resource "aws_kms_key" "primary" {
  description             = "Clave KMS CMK para cifrado de ${slug}"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

resource "aws_kms_alias" "primary" {
  name          = "alias/\${var.project_name}-key"
  target_key_id = aws_kms_key.primary.key_id
}
` : ''}
${tieneVpc ? `resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "\${var.project_name}-vpc"
  }
}

resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "\${var.region}a"
  map_public_ip_on_launch = true

  tags = {
    Name = "\${var.project_name}-subnet-public-a"
  }
}

resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = "\${var.region}a"

  tags = {
    Name = "\${var.project_name}-subnet-private-a"
  }
}

resource "aws_subnet" "private_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.11.0/24"
  availability_zone = "\${var.region}b"

  tags = {
    Name = "\${var.project_name}-subnet-private-b"
  }
}

resource "aws_internet_gateway" "gw" {
  vpc_id = aws_vpc.main.id
}

resource "aws_security_group" "app_sg" {
  name        = "\${var.project_name}-app-sg"
  description = "Reglas de seguridad para aplicacion ${slug}"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "Trafico HTTPS seguro"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
` : ''}
${tieneS3 ? `resource "aws_s3_bucket" "storage" {
  bucket        = "\${var.project_name}-assets-bucket"
  force_destroy = false
}

resource "aws_s3_bucket_versioning" "storage" {
  bucket = aws_s3_bucket.storage.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "storage" {
  bucket = aws_s3_bucket.storage.id

  rule {
    apply_server_side_encryption_by_default {
      ${tieneKms ? `kms_master_key_id = aws_kms_key.primary.arn
      sse_algorithm     = "aws:kms"` : `sse_algorithm     = "AES256"`}
    }
  }
}
` : ''}
${tieneEc2 ? `resource "aws_instance" "app_server" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.medium"
  ${tieneVpc ? `subnet_id     = aws_subnet.private_a.id
  vpc_security_group_ids = [aws_security_group.app_sg.id]` : ''}

  root_block_device {
    volume_size           = 50
    volume_type           = "gp3"
    encrypted             = true
    ${tieneKms ? 'kms_key_id = aws_kms_key.primary.arn' : ''}
  }

  tags = {
    Name = "\${var.project_name}-backend"
  }
}
` : ''}
${tieneRds ? `resource "aws_db_subnet_group" "db_subnets" {
  name       = "\${var.project_name}-db-subnet-group"
  ${tieneVpc ? 'subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]' : 'subnet_ids = []'}
}

resource "aws_db_instance" "db" {
  identifier           = "\${var.project_name}-db"
  allocated_storage    = 50
  max_allocated_storage = 200
  storage_type         = "gp3"
  engine               = "postgres"
  engine_version       = "16.1"
  instance_class       = "db.t3.medium"
  db_name              = "appdb"
  username             = "cloudops_admin"
  password             = "CambiarPorPasswordEnSecretsManager123!"
  multi_az             = ${p.disponibilidad === 'critica' || p.disponibilidad === 'alta' ? 'true' : 'false'}
  skip_final_snapshot  = false
  storage_encrypted    = true
  ${tieneKms ? 'kms_key_id = aws_kms_key.primary.arn' : ''}
  db_subnet_group_name = aws_db_subnet_group.db_subnets.name
}
` : ''}
${tieneElb ? `resource "aws_lb" "main" {
  name               = "\${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  ${tieneVpc ? `subnets            = [aws_subnet.public_a.id, aws_subnet.private_b.id]
  security_groups    = [aws_security_group.app_sg.id]` : ''}
}
` : ''}
${tieneCloudWatch ? `resource "aws_cloudwatch_log_group" "app_logs" {
  name              = "/aws/\${var.project_name}/production"
  retention_in_days = 90
  ${tieneKms ? 'kms_key_id = aws_kms_key.primary.arn' : ''}
}
` : ''}
output "project_details" {
  value = {
    nombre         = "${p.nombre}"
    region         = var.region
    costo_estimado = "${usd(m.costoMensualCalculado)}/mes"
    sla            = "${m.slaDetalle.porcentaje}"
  }
}
`;
}

export function generarMarkdownRFC(p: PropuestaCloud, m: MetricasPropuesta): string {
  const serviciosTexto = m.desgloseServicios
    .map(
      (s) =>
        `| **${s.nombre}** | \`${s.categoria}\` | ${s.cantidad} | ${usd(s.costoEstimado)}/m | ${s.responsabilidad} |`
    )
    .join('\n');

  const frameworksTexto = (p.cumplimiento || []).length
    ? (p.cumplimiento || []).map((c) => `- [x] **${c}**: Controles implementados y preparados para auditoria.`).join('\n')
    : '- No se especificaron marcos normativos formales.';

  return `# RFC de Arquitectura Cloud: ${p.nombre}

**Fecha de Generación:** ${fecha(p.creadaEn || new Date().toISOString())}  
**Estado:** Propuesta Técnica Aprobada  
**Tipo de Aplicación:** ${p.tipoAplicacion}  
**Región AWS Principal:** ${p.regionId} (${m.nombreRegion}, ${m.continenteRegion})  
**Score Well-Architected:** ${m.wellArchitectedScores.global} / 100  

---

## 1. Resumen Ejecutivo & Justificación
${p.descripcion}

- **Objetivo Estratégico:** ${p.objetivoMigracion}
- **Escala Proyectada:** ${numero(p.usuariosEstimados)} usuarios concurrentes (${m.tierEscala})
- **RPS Estimados en Pico:** ${numero(m.rpsEstimados)} req/s
- **Ancho de Banda Mensual:** ${numero(m.anchoBandaGbMes)} GB/mes

---

## 2. Continuidad del Negocio & Nivel de Servicio (SLA / DRP)
- **Nivel de Disponibilidad:** ${p.disponibilidad.toUpperCase()} (${m.slaDetalle.porcentaje})
- **Tolerancia Máxima a Caídas:** ${m.slaDetalle.downtimeMes}/mes (~${m.slaDetalle.downtimeAno}/año)
- **RTO (Recovery Time Objective):** ${m.drpDetalle.rtoHoras} horas máx
  - *Estrategia DRP:* ${m.drpDetalle.rtoEstrategia}
- **RPO (Recovery Point Objective):** ${m.drpDetalle.rpoMinutos} minutos máx
  - *Estrategia Replicación:* ${m.drpDetalle.rpoEstrategia}

---

## 3. Matriz de Componentes AWS & Dimensionamiento
| Servicio AWS | Categoría | Dimensionamiento | Costo Proyectado | Responsabilidad |
| :--- | :--- | :--- | :--- | :--- |
${serviciosTexto}

---

## 4. Análisis FinOps & Presupuesto
- **Presupuesto Máximo Autorizado:** ${usd(m.presupuestoMaximo)} / mes
- **Costo Mensual Estimado:** ${usd(m.costoMensualCalculado)} / mes
- **Costo Anual Proyectado:** ${usd(m.costoAnualCalculado)} / año
- **Estado Presupuestario:** ${m.dentroPresupuesto ? `Dentro del Presupuesto (Holgura de ${usd(m.varianzaPresupuesto)}/mes)` : `Supera el Presupuesto (Exceso de ${usd(Math.abs(m.varianzaPresupuesto))}/mes)`}
- **Porcentaje de Uso de Presupuesto:** ${m.porcentajeUsoPresupuesto}%

### Oportunidades de Reducción de Costos
- **Compute Savings Plans (1 año):** Ahorro estimado de ${usd(m.ahorroFinOps.savingsPlans1Ano)}/mes (-32%)
- **Compute Savings Plans (3 años):** Ahorro estimado de ${usd(m.ahorroFinOps.savingsPlans3Anos)}/mes (-54%)
- **Reserved Instances para RDS:** Ahorro de hasta ${usd(m.ahorroFinOps.reservedInstances)}/mes
- **Políticas de Ciclo de Vida S3 Glacier:** Ahorro de hasta ${usd(m.ahorroFinOps.s3Glacier)}/mes

---

## 5. Evaluación AWS Well-Architected Framework
- **Puntuación Global:** ${m.wellArchitectedScores.global}%
  - **Seguridad:** ${m.wellArchitectedScores.seguridad}%
  - **Fiabilidad:** ${m.wellArchitectedScores.fiabilidad}%
  - **Eficiencia de Rendimiento:** ${m.wellArchitectedScores.rendimiento}%
  - **Optimización de Costos:** ${m.wellArchitectedScores.costos}%
  - **Excelencia Operativa:** ${m.wellArchitectedScores.operaciones}%

---

## 6. Cumplimiento Normativo & Auditoría
${frameworksTexto}

---

## 7. Plan de Implementación (Roadmap)
1. **Fase 1 (Semanas 1-2): Cimientos de Red & Gobernanza**
   - Creación de VPC, subredes públicas/privadas, llaves KMS y roles IAM.
2. **Fase 2 (Semanas 3-4): Persistencia & Almacenamiento**
   - Despliegue de cluster RDS Multi-AZ, buckets S3 con cifrado y backups.
3. **Fase 3 (Semanas 5-6): Cómputo, Balanceo & CDN**
   - Configuración de ALB, instancias EC2 / Lambda y distribución CloudFront.
4. **Fase 4 (Semanas 7-8): Pruebas de Estrés & Puesta en Marcha**
   - Pruebas de conmutación DRP (RTO/RPO), verificación de CloudWatch y Cutover DNS en Route 53.
`;
}

export function generarCsvPropuesta(p: PropuestaCloud, m: MetricasPropuesta): string {
  const encabezado = 'ServicioID,Nombre,Categoria,Dimensionamiento,CostoMensualUSD,UnidadCobro,Responsabilidad,GratisTier\n';
  const filas = m.desgloseServicios
    .map(
      (s) =>
        `"${s.servicioId}","${s.nombre}","${s.categoria}","${s.cantidad}",${s.costoEstimado},"${s.unidad}","${s.responsabilidad}",${s.gratisTier ? 'SI' : 'NO'}`
    )
    .join('\n');
  const metadata = `\n\nMETRICAS DE PROPUESTA\nNombre,"${p.nombre}"\nTipo,"${p.tipoAplicacion}"\nRegion,"${p.regionId} (${m.nombreRegion})"\nDisponibilidad,"${p.disponibilidad} (${m.slaDetalle.porcentaje})"\nUsuariosConcurrentes,${p.usuariosEstimados}\nRPS,${m.rpsEstimados}\nPresupuestoMaximoUSD,${m.presupuestoMaximo}\nCostoMensualProyectadoUSD,${m.costoMensualCalculado}\nCostoAnualProyectadoUSD,${m.costoAnualCalculado}\nScoreWellArchitected,${m.wellArchitectedScores.global}%\nRTOHoras,${m.drpDetalle.rtoHoras}\nRPOMinutos,${m.drpDetalle.rpoMinutos}\nFechaCreacion,"${p.creadaEn}"\n`;
  return encabezado + filas + metadata;
}

export function generarHtmlImpresion(p: PropuestaCloud, m: MetricasPropuesta): string {
  const fechaHoy = new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });

  const filasServicios = m.desgloseServicios
    .map(
      (s) => `
    <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
      <td style="padding: 8px 6px; font-weight: bold; color: #0f172a;">${s.nombre}</td>
      <td style="padding: 8px 6px; color: #475569;">${s.categoria}</td>
      <td style="padding: 8px 6px; color: #334155;">${s.cantidad}</td>
      <td style="padding: 8px 6px; font-family: monospace; font-weight: bold; text-align: right; color: #0f172a;">${usd(s.costoEstimado)}</td>
      <td style="padding: 8px 6px; color: #64748b;">${s.responsabilidad}</td>
    </tr>
  `
    )
    .join('');

  const pillaresHtml = m.wellArchitectedPillares
    .map(
      (pil) => `
    <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; background: #f8fafc; margin-bottom: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <span style="font-size: 12px; font-weight: bold; color: #0f172a;">${pil.nombre}</span>
        <span style="font-size: 12px; font-weight: bold; font-family: monospace; color: #2563eb;">${pil.score}%</span>
      </div>
      <p style="font-size: 10px; color: #64748b; margin: 0 0 4px 0;">${pil.descripcion}</p>
      <ul style="margin: 0; padding-left: 14px; font-size: 10px; color: #334155;">
        ${pil.puntosClave.map((pt) => `<li>${pt}</li>`).join('')}
      </ul>
    </div>
  `
    )
    .join('');

  const cumplimientosHtml = (p.cumplimiento || []).length
    ? (p.cumplimiento || []).map((c) => `<span style="display: inline-block; padding: 2px 8px; margin: 2px; border-radius: 4px; background: #eff6ff; color: #1d4ed8; font-size: 10px; font-weight: bold; border: 1px solid #bfdbfe;">${c}</span>`).join(' ')
    : '<span style="font-size: 11px; color: #64748b;">No se especificaron normativas formales.</span>';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Informe de Arquitectura Cloud - ${p.nombre}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 0; background: #fff; line-height: 1.4; }
    .header { border-bottom: 3px solid #2563eb; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start; }
    .title { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0; }
    .subtitle { font-size: 11px; color: #64748b; margin-top: 4px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; text-transform: uppercase; background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
    .section-title { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #1e293b; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 16px; margin-bottom: 10px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
    .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 12px; }
    .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; background: #f8fafc; }
    .card-label { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 2px; }
    .card-value { font-size: 14px; font-weight: 800; color: #0f172a; font-family: monospace; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { padding: 6px; font-size: 10px; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
    .footer { border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 24px; font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between; }
    .page-break { page-break-before: always; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">${p.nombre}</h1>
      <p class="subtitle">Propuesta de Arquitectura Cloud & Auditoría Well-Architected · Tipo: <strong>${p.tipoAplicacion}</strong> · Región: <strong>${p.regionId} (${m.nombreRegion})</strong></p>
    </div>
    <div style="text-align: right;">
      <span class="badge">SLA ${p.disponibilidad.toUpperCase()}</span>
      <p style="font-size: 10px; color: #64748b; margin-top: 4px;">Fecha: ${fechaHoy}</p>
    </div>
  </div>

  <div class="card" style="margin-bottom: 14px;">
    <div class="card-label">Justificación Técnica & Alcance</div>
    <p style="font-size: 11px; color: #334155; margin: 4px 0 0 0;">${p.descripcion}</p>
  </div>

  <div class="grid-4">
    <div class="card">
      <div class="card-label">Concurrencia Estimada</div>
      <div class="card-value">${numero(p.usuariosEstimados)} u</div>
      <span style="font-size: 9px; color: #64748b;">${m.tierEscala}</span>
    </div>
    <div class="card">
      <div class="card-label">RPS en Pico</div>
      <div class="card-value">${numero(m.rpsEstimados)} req/s</div>
      <span style="font-size: 9px; color: #64748b;">~${numero(m.anchoBandaGbMes)} GB/mes ancho banda</span>
    </div>
    <div class="card">
      <div class="card-label">Costo Proyectado</div>
      <div class="card-value" style="color: #2563eb;">${usd(m.costoMensualCalculado)}/m</div>
      <span style="font-size: 9px; color: #64748b;">Presupuesto: ${usd(m.presupuestoMaximo)}/m</span>
    </div>
    <div class="card">
      <div class="card-label">Score Arquitectura</div>
      <div class="card-value" style="color: #16a34a;">${m.wellArchitectedScores.global} / 100</div>
      <span style="font-size: 9px; color: #64748b;">Well-Architected AWS</span>
    </div>
  </div>

  <div class="section-title">Resiliencia & Recuperación ante Desastres (DRP)</div>
  <div class="grid-2">
    <div class="card">
      <div class="card-label">RTO (Recovery Time Objective)</div>
      <div class="card-value">${m.drpDetalle.rtoHoras} horas máx</div>
      <p style="font-size: 10px; color: #475569; margin: 4px 0 0 0;">${m.drpDetalle.rtoEstrategia}</p>
    </div>
    <div class="card">
      <div class="card-label">RPO (Recovery Point Objective)</div>
      <div class="card-value">${m.drpDetalle.rpoMinutos} minutos máx</div>
      <p style="font-size: 10px; color: #475569; margin: 4px 0 0 0;">${m.drpDetalle.rpoEstrategia}</p>
    </div>
  </div>

  <div class="section-title">Componentes AWS Incluidos (${m.desgloseServicios.length} servicios)</div>
  <table>
    <thead>
      <tr>
        <th>Servicio</th>
        <th>Categoría</th>
        <th>Dimensionamiento Estimado</th>
        <th style="text-align: right;">Costo/Mes</th>
        <th>Responsabilidad</th>
      </tr>
    </thead>
    <tbody>
      ${filasServicios}
    </tbody>
  </table>

  <div class="section-title" style="margin-top: 18px;">Evaluación Well-Architected Framework (5 Pilares)</div>
  ${pillaresHtml}

  <div class="grid-2" style="margin-top: 14px;">
    <div class="card">
      <div class="card-label">Cumplimiento Normativo & Auditoría</div>
      <div style="margin-top: 6px;">${cumplimientosHtml}</div>
    </div>
    <div class="card">
      <div class="card-label">Análisis FinOps Anualizado</div>
      <div class="card-value">${usd(m.costoAnualCalculado)} / año</div>
      <p style="font-size: 10px; color: #475569; margin: 4px 0 0 0;">
        Ahorro potencial con Compute Savings Plans a 3 años: <strong>${usd(m.ahorroFinOps.savingsPlans3Anos)}/mes</strong> (-54%).
      </p>
    </div>
  </div>

  <div class="footer">
    <span>Generado automáticamente por CloudOps Architect Planner</span>
    <span>Alineado a las mejores prácticas de AWS Well-Architected</span>
  </div>
</body>
</html>`;
}
