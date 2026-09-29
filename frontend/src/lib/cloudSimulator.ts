import { serviciosAWS } from '../data/awsServices';
import type { Disponibilidad, PropuestaCloud, DesgloseServicioPropuesta, CategoriaServicio } from '../types/cloud';

export interface ParametrosSimulacion {
  usuariosEstimados?: number;
  tipoAplicacion: PropuestaCloud['tipoAplicacion'];
  disponibilidad: Disponibilidad;
  serviciosSeleccionados: string[];
  presupuestoMaximo?: number;
  rtoHoras?: number;
  rpoMinutos?: number;
  cumplimiento?: string[];
  regionId: string;
}

export interface IncoherenciaArquitectura {
  tipo: 'error' | 'advertencia' | 'recomendacion';
  titulo: string;
  descripcion: string;
  pilar: 'Seguridad' | 'Fiabilidad' | 'Costos' | 'Rendimiento' | 'Operaciones';
}

export interface DetalleCumplimientoMarco {
  id: string;
  nombre: string;
  cubierto: boolean;
  serviciosPresentes: string[];
  serviciosFaltantesRecomendados: string[];
  descripcion: string;
}

export interface PilaresPuntuacion {
  seguridad: number;
  fiabilidad: number;
  eficienciaRendimiento: number;
  optimizacionCostos: number;
  excelenciaOperativa: number;
  scoreGlobal: number;
}

export interface ResultadoSimulacion {
  costoMensualEstimado: number;
  costoAnualEstimado: number;
  costoPorUsuarioMensual: number;
  desglose: DesgloseServicioPropuesta[];
  presupuestoMaximo: number;
  diferenciaPresupuesto: number;
  porcentajeUsoPresupuesto: number;
  estadoPresupuesto: 'optimo' | 'holgado' | 'deficit' | 'excedido';
  mensajePresupuesto: string;

  slaPorcentaje: number;
  downtimeAnualTexto: string;
  estrategiaRto: string;
  estrategiaRpo: string;
  incoherencias: IncoherenciaArquitectura[];

  pilares: PilaresPuntuacion;
  cumplimientoAnalisis: DetalleCumplimientoMarco[];
  recomendacionesAhorro: { titulo: string; detalle: string; ahorroPotencialMensual: number }[];
}

export function calcularSubtotalItemCosto(
  servicioId: string,
  cantidad: number,
  horasMes: number,
  multiplicadorAmbiente: number = 1.0,
  factorDescuento: number = 1.0
): number {
  const serv = serviciosAWS.find((s) => s.id === servicioId);
  if (!serv) return 0;

  if (serv.tipoCobro === 'hora') {
    return serv.precioUnitario * cantidad * horasMes * multiplicadorAmbiente * factorDescuento;
  }

  // Para servicios con cuota fija o almacenamiento/transferencia:
  // Si horasMes es 730 o 1, se asume el periodo mensual completo
  const factorTemporal = horasMes > 1 && horasMes < 730 ? horasMes / 730 : 1;
  return serv.precioUnitario * cantidad * factorTemporal * multiplicadorAmbiente * factorDescuento;
}

export function simularArquitecturaCloud(
  params: ParametrosSimulacion,
  multiplicadorAmbiente: number = 1.0
): ResultadoSimulacion {
  const {
    usuariosEstimados = 1000,
    tipoAplicacion = 'Web',
    disponibilidad = 'alta',
    serviciosSeleccionados = [],
    presupuestoMaximo = 200,
    rtoHoras = 2,
    rpoMinutos = 15,
    cumplimiento = [],
  } = params;

  const desglose: DesgloseServicioPropuesta[] = [];
  let costoMensualEstimado = 0;

  // 1. Dimensionamiento de cada servicio seleccionado
  serviciosSeleccionados.forEach((sId) => {
    const s = serviciosAWS.find((x) => x.id === sId);
    if (!s) return;

    let cantidadEstimada = 1;
    let unidadMedida = s.unidad;
    let subtotalMensual = 0;
    let explicacionCalculo = '';

    switch (sId) {
      case 'ec2': {
        const minInstancias = disponibilidad === 'critica' ? 4 : disponibilidad === 'alta' ? 2 : 1;
        const instanciasPorCarga = Math.ceil(usuariosEstimados / 15000);
        cantidadEstimada = Math.max(minInstancias, instanciasPorCarga);
        unidadMedida = 'instancias t3.medium';
        subtotalMensual = cantidadEstimada * 730 * s.precioUnitario * multiplicadorAmbiente;
        explicacionCalculo = `${cantidadEstimada} inst. t3.medium (730h c/u a $${s.precioUnitario}/h) · ${
          disponibilidad === 'critica'
            ? 'Multi-Región Activo-Activo'
            : disponibilidad === 'alta'
            ? 'Multi-AZ Redundante'
            : 'Mono-AZ Estándar'
        }`;
        break;
      }

      case 'rds': {
        cantidadEstimada = disponibilidad === 'critica' ? 3 : disponibilidad === 'alta' ? 2 : 1;
        unidadMedida = 'instancias db.t3.medium';
        subtotalMensual = cantidadEstimada * 730 * s.precioUnitario * multiplicadorAmbiente;
        explicacionCalculo = `${cantidadEstimada} inst. db.t3.medium (730h c/u a $${s.precioUnitario}/h) · ${
          disponibilidad === 'critica'
            ? 'Multi-AZ con Réplica de Lectura Global'
            : disponibilidad === 'alta'
            ? 'Despliegue Multi-AZ Standby Síncrono'
            : 'Instancia única Mono-AZ'
        }`;
        break;
      }

      case 's3': {
        const factorGbPorUsuario =
          tipoAplicacion === 'Analítica' ? 0.2 : tipoAplicacion === 'Web' ? 0.05 : 0.02;
        cantidadEstimada = Math.max(50, Math.round(usuariosEstimados * factorGbPorUsuario));
        unidadMedida = 'GB al mes (Standard)';
        subtotalMensual = cantidadEstimada * s.precioUnitario * multiplicadorAmbiente;
        explicacionCalculo = `${cantidadEstimada} GB almacenamiento para archivos estáticos y activos`;
        break;
      }

      case 'ebs': {
        const instanciasEc2 = serviciosSeleccionados.includes('ec2')
          ? Math.max(disponibilidad === 'critica' ? 4 : disponibilidad === 'alta' ? 2 : 1, Math.ceil(usuariosEstimados / 15000))
          : 1;
        cantidadEstimada = instanciasEc2 * 40;
        unidadMedida = 'GB gp3 persistente';
        subtotalMensual = cantidadEstimada * s.precioUnitario * multiplicadorAmbiente;
        explicacionCalculo = `${cantidadEstimada} GB (40 GB por cada instancia EC2) para volúmenes root OS y apps`;
        break;
      }

      case 'elb': {
        cantidadEstimada = disponibilidad === 'critica' ? 2 : 1;
        unidadMedida = 'Application Load Balancers';
        subtotalMensual = cantidadEstimada * 730 * s.precioUnitario * multiplicadorAmbiente;
        explicacionCalculo = `${cantidadEstimada} ALB (730h a $${s.precioUnitario}/h) para balanceo HTTP/S y TLS Offloading`;
        break;
      }

      case 'lambda': {
        const invocacionesEstimadas = Math.max(500000, usuariosEstimados * 120);
        cantidadEstimada = Math.round(invocacionesEstimadas / 1000);
        unidadMedida = 'k invocaciones';
        subtotalMensual = Math.max(2.5, (invocacionesEstimadas / 1000000) * 3.8) * multiplicadorAmbiente;
        explicacionCalculo = `~${(invocacionesEstimadas / 1000000).toFixed(1)}M ejecuciones serverless estimadas/mes`;
        break;
      }

      case 'dynamodb': {
        const millonesEscrituras = Math.max(1, Math.round((usuariosEstimados * 0.04) * 10) / 10);
        cantidadEstimada = millonesEscrituras;
        unidadMedida = 'millones de escrituras';
        subtotalMensual = Math.max(2.5, millonesEscrituras * s.precioUnitario) * multiplicadorAmbiente;
        explicacionCalculo = `${millonesEscrituras}M escrituras NoSQL con latencia milisegundo`;
        break;
      }

      case 'cloudfront': {
        const factorGbCdn = tipoAplicacion === 'Web' ? 0.08 : 0.03;
        cantidadEstimada = Math.max(50, Math.round(usuariosEstimados * factorGbCdn));
        unidadMedida = 'GB transferidos CDN';
        subtotalMensual = cantidadEstimada * s.precioUnitario * multiplicadorAmbiente;
        explicacionCalculo = `${cantidadEstimada} GB egress acelerados globalmente con más de 450 PoPs`;
        break;
      }

      case 'route53': {
        const healthChecks = disponibilidad === 'critica' ? 4 : disponibilidad === 'alta' ? 2 : 1;
        cantidadEstimada = 1;
        unidadMedida = 'zona alojada + health checks';
        subtotalMensual = (0.5 + healthChecks * 0.5) * multiplicadorAmbiente;
        explicacionCalculo = `1 Zona DNS pública + ${healthChecks} health-checks automáticos con failover`;
        break;
      }

      case 'waf': {
        cantidadEstimada = 1;
        unidadMedida = 'Web ACL';
        subtotalMensual = 5.0 * multiplicadorAmbiente;
        explicacionCalculo = '1 Web ACL administrada con mitigación de OWASP Top 10 y Bot Control';
        break;
      }

      case 'cloudwatch': {
        const numMetricas = serviciosSeleccionados.length * 3;
        cantidadEstimada = Math.max(10, numMetricas);
        unidadMedida = 'métricas y alarmas';
        subtotalMensual = cantidadEstimada * s.precioUnitario * multiplicadorAmbiente;
        explicacionCalculo = `${cantidadEstimada} métricas detalladas, logs de auditoría y alarmas de auto-scaling`;
        break;
      }

      case 'kms': {
        cantidadEstimada = disponibilidad === 'critica' ? 3 : 2;
        unidadMedida = 'claves maestras (CMK)';
        subtotalMensual = cantidadEstimada * s.precioUnitario * multiplicadorAmbiente;
        explicacionCalculo = `${cantidadEstimada} claves KMS gestionadas para cifrado de bases de datos y buckets`;
        break;
      }

      case 'vpc':
      case 'iam': {
        cantidadEstimada = 1;
        unidadMedida = 'servicio incluido';
        subtotalMensual = 0;
        explicacionCalculo =
          sId === 'vpc'
            ? 'VPC aislada con subredes públicas/privadas en múltiples AZs (Sin costo)'
            : 'Roles y políticas IAM de mínimo privilegio con MFA forzado (Sin costo)';
        break;
      }

      default: {
        cantidadEstimada = 1;
        subtotalMensual = s.precioUnitario * multiplicadorAmbiente;
        explicacionCalculo = `Tarifa base de ${s.nombre}`;
      }
    }

    subtotalMensual = Math.round(subtotalMensual * 100) / 100;
    costoMensualEstimado += subtotalMensual;

    desglose.push({
      servicioId: s.id,
      nombre: s.nombre,
      categoria: s.categoria as CategoriaServicio,
      cantidadEstimada,
      unidadMedida,
      costoUnitario: s.precioUnitario,
      subtotalMensual,
      explicacionCalculo,
    });
  });

  costoMensualEstimado = Math.round(costoMensualEstimado * 100) / 100;
  const costoAnualEstimado = Math.round(costoMensualEstimado * 12 * 100) / 100;
  const costoPorUsuarioMensual =
    usuariosEstimados > 0
      ? Math.round((costoMensualEstimado / usuariosEstimados) * 10000) / 10000
      : 0;

  // 2. Análisis Presupuestario FinOps
  const diferenciaPresupuesto = Math.round((presupuestoMaximo - costoMensualEstimado) * 100) / 100;
  const porcentajeUsoPresupuesto =
    presupuestoMaximo > 0 ? Math.round((costoMensualEstimado / presupuestoMaximo) * 100) : 100;

  let estadoPresupuesto: ResultadoSimulacion['estadoPresupuesto'] = 'optimo';
  let mensajePresupuesto = '';

  if (porcentajeUsoPresupuesto > 120) {
    estadoPresupuesto = 'excedido';
    mensajePresupuesto = `Déficit presupuestario severo: excede el presupuesto en un ${porcentajeUsoPresupuesto - 100}% ($${Math.abs(diferenciaPresupuesto).toFixed(2)}/mes de sobrecosto).`;
  } else if (porcentajeUsoPresupuesto > 100) {
    estadoPresupuesto = 'deficit';
    mensajePresupuesto = `Presupuesto ajustado: excede por $${Math.abs(diferenciaPresupuesto).toFixed(2)} USD/mes (${porcentajeUsoPresupuesto}% de consumo).`;
  } else if (porcentajeUsoPresupuesto >= 70) {
    estadoPresupuesto = 'optimo';
    mensajePresupuesto = `Presupuesto óptimo: consumo del ${porcentajeUsoPresupuesto}% con holgura de $${diferenciaPresupuesto.toFixed(2)} USD/mes.`;
  } else {
    estadoPresupuesto = 'holgado';
    mensajePresupuesto = `Presupuesto con alta holgura (${porcentajeUsoPresupuesto}% utilizado, $${diferenciaPresupuesto.toFixed(2)} USD/mes disponible).`;
  }

  // 3. Auditoría de Resiliencia, SLA y DRP
  const slaMap = {
    basica: { sla: 99.5, downtime: '~43.8 h/año' },
    alta: { sla: 99.9, downtime: '~8.76 h/año' },
    critica: { sla: 99.99, downtime: '~52.6 min/año' },
  };

  const slaPorcentaje = slaMap[disponibilidad].sla;
  const downtimeAnualTexto = slaMap[disponibilidad].downtime;

  const estrategiaRto =
    rtoHoras <= 1
      ? 'Hot Standby / Multi-AZ Activo'
      : rtoHoras <= 4
      ? 'Warm Standby / Piloto'
      : 'Backup & Restore en Frío';

  const estrategiaRpo =
    rpoMinutos <= 15
      ? 'Replicación Síncrona / WAL'
      : rpoMinutos <= 60
      ? 'Snapshots Continuos Cada Hora'
      : 'Backups Diarios';

  // 4. Detección de Incoherencias y Violaciones Arquitectónicas
  const incoherencias: IncoherenciaArquitectura[] = [];

  if (disponibilidad === 'basica' && rtoHoras < 2) {
    incoherencias.push({
      tipo: 'error',
      titulo: 'Incompatibilidad de RTO con Nivel Básico (Mono-AZ)',
      descripcion: `Has configurado un RTO de ${rtoHoras}h, pero el nivel Básico no tiene conmutación por error automática (failover). Ante una caída de centro de datos en la única AZ, la recuperación manual tomará al menos 2 a 4 horas.`,
      pilar: 'Fiabilidad',
    });
  }

  if (disponibilidad === 'critica' && rpoMinutos > 15) {
    incoherencias.push({
      tipo: 'advertencia',
      titulo: 'RPO Excesivo para Misión Crítica (99.99%)',
      descripcion: `Una arquitectura de Misión Crítica con 99.99% SLA tolera únicamente ~52 minutos de caída al año. Un RPO de ${rpoMinutos} minutos expone a pérdidas de transacciones no admisibles para este nivel. Se recomienda RPO ≤ 15 min.`,
      pilar: 'Fiabilidad',
    });
  }

  if ((disponibilidad === 'alta' || disponibilidad === 'critica') && !serviciosSeleccionados.includes('elb')) {
    incoherencias.push({
      tipo: 'error',
      titulo: 'Falta Application Load Balancer (ALB) para Multi-AZ',
      descripcion: 'Para aprovechar la redundancia Multi-AZ se requiere un balanceador ALB que distribuya tráfico entre zonas y retire instancias no saludables.',
      pilar: 'Fiabilidad',
    });
  }

  if (
    (tipoAplicacion === 'Web' || tipoAplicacion === 'API') &&
    !serviciosSeleccionados.includes('rds') &&
    !serviciosSeleccionados.includes('dynamodb')
  ) {
    incoherencias.push({
      tipo: 'advertencia',
      titulo: 'Capa de Datos Persistente No Definida',
      descripcion: 'La aplicación Web/API no incluye Amazon RDS ni DynamoDB para persistencia transaccional.',
      pilar: 'Fiabilidad',
    });
  }

  if (usuariosEstimados >= 10000 && !serviciosSeleccionados.includes('cloudfront')) {
    incoherencias.push({
      tipo: 'recomendacion',
      titulo: 'Alta Concurrencia sin CloudFront CDN',
      descripcion: `Con ${usuariosEstimados.toLocaleString()} usuarios, la entrega directa desde servidores saturará la capacidad de red y aumentará la latencia. Agregar CloudFront descargará hasta un 70% del tráfico estático.`,
      pilar: 'Rendimiento',
    });
  }

  if (cumplimiento.includes('PCI-DSS v4.0')) {
    if (!serviciosSeleccionados.includes('waf')) {
      incoherencias.push({
        tipo: 'error',
        titulo: 'Violación PCI-DSS v4.0 (Requisito 6.6)',
        descripcion: 'PCI-DSS exige un firewall de aplicaciones web (WAF) activo frente a aplicaciones orientadas a Internet para mitigar ataques como SQLi y XSS.',
        pilar: 'Seguridad',
      });
    }
    if (!serviciosSeleccionados.includes('kms')) {
      incoherencias.push({
        tipo: 'error',
        titulo: 'Violación PCI-DSS v4.0 (Requisito 3.4)',
        descripcion: 'Se requiere cifrado criptográfico robusto en reposo para datos de tarjetahabientes utilizando AWS KMS con rotación de claves.',
        pilar: 'Seguridad',
      });
    }
  }

  if ((cumplimiento.includes('SOC 2 Tipo II') || cumplimiento.includes('ISO/IEC 27001')) && !serviciosSeleccionados.includes('cloudwatch')) {
    incoherencias.push({
      tipo: 'advertencia',
      titulo: 'Trazabilidad y Auditoría Requerida (CloudWatch)',
      descripcion: 'Las auditorías de SOC 2 e ISO 27001 requieren retención de logs de acceso y telemetría de monitoreo con Amazon CloudWatch.',
      pilar: 'Operaciones',
    });
  }

  // 5. Evaluación de Pilares Well-Architected (Puntuación 0-100)
  let pSeguridad = 40;
  if (serviciosSeleccionados.includes('iam')) pSeguridad += 15;
  if (serviciosSeleccionados.includes('waf')) pSeguridad += 20;
  if (serviciosSeleccionados.includes('kms')) pSeguridad += 15;
  if (serviciosSeleccionados.includes('vpc')) pSeguridad += 10;
  pSeguridad = Math.min(100, pSeguridad);

  let pFiabilidad = 35;
  if (disponibilidad === 'alta') pFiabilidad += 25;
  if (disponibilidad === 'critica') pFiabilidad += 35;
  if (serviciosSeleccionados.includes('elb')) pFiabilidad += 15;
  if (serviciosSeleccionados.includes('rds')) pFiabilidad += 10;
  if (rtoHoras <= 2) pFiabilidad += 5;
  pFiabilidad = Math.min(100, pFiabilidad);

  let pRendimiento = 40;
  if (serviciosSeleccionados.includes('cloudfront')) pRendimiento += 25;
  if (serviciosSeleccionados.includes('lambda')) pRendimiento += 15;
  if (serviciosSeleccionados.includes('dynamodb')) pRendimiento += 15;
  if (serviciosSeleccionados.includes('elb')) pRendimiento += 10;
  pRendimiento = Math.min(100, pRendimiento);

  let pCostos = 50;
  if (porcentajeUsoPresupuesto <= 100) pCostos += 30;
  if (porcentajeUsoPresupuesto <= 75) pCostos += 15;
  if (porcentajeUsoPresupuesto > 120) pCostos -= 35;
  pCostos = Math.max(15, Math.min(100, pCostos));

  let pOperaciones = 40;
  if (serviciosSeleccionados.includes('cloudwatch')) pOperaciones += 35;
  if (serviciosSeleccionados.includes('iam')) pOperaciones += 15;
  if (cumplimiento.length > 0) pOperaciones += 10;
  pOperaciones = Math.min(100, pOperaciones);

  const scoreGlobal = Math.round(
    pSeguridad * 0.25 +
    pFiabilidad * 0.25 +
    pRendimiento * 0.15 +
    pCostos * 0.20 +
    pOperaciones * 0.15
  );

  const pilares: PilaresPuntuacion = {
    seguridad: pSeguridad,
    fiabilidad: pFiabilidad,
    eficienciaRendimiento: pRendimiento,
    optimizacionCostos: pCostos,
    excelenciaOperativa: pOperaciones,
    scoreGlobal,
  };

  // 6. Matriz de Cumplimiento
  const marcosDefinidos = [
    {
      id: 'SOC 2 Tipo II',
      nombre: 'SOC 2 Tipo II (Auditoría SaaS y Seguridad)',
      requeridos: ['iam', 'cloudwatch', 'kms'],
      desc: 'Control de acceso lógico, retención de registros de auditoría y cifrado de datos de clientes.',
    },
    {
      id: 'PCI-DSS v4.0',
      nombre: 'PCI-DSS v4.0 (Seguridad en Pagos y Tarjetas)',
      requeridos: ['waf', 'kms', 'iam', 'cloudwatch'],
      desc: 'Protección perimetral con WAF, cifrado obligatorio en reposo y monitoreo continuo de transacciones.',
    },
    {
      id: 'ISO/IEC 27001',
      nombre: 'ISO/IEC 27001 (Gestión de Seguridad de la Información)',
      requeridos: ['iam', 'kms', 'cloudwatch', 'vpc'],
      desc: 'Políticas de control de acceso, segmentación de redes privadas y gobierno criptográfico.',
    },
    {
      id: 'HIPAA',
      nombre: 'HIPAA (Privacidad y Seguridad de Datos de Salud)',
      requeridos: ['kms', 'iam', 'cloudwatch'],
      desc: 'Cifrado de registros médicos PHI en tránsito y reposo, y registro inmutable de accesos.',
    },
    {
      id: 'GDPR',
      nombre: 'GDPR (Reglamento General de Protección de Datos UE)',
      requeridos: ['kms', 'iam', 's3'],
      desc: 'Cifrado y derecho al olvido sobre datos personales, con gobernanza de almacenamiento.',
    },
  ];

  const cumplimientoAnalisis: DetalleCumplimientoMarco[] = marcosDefinidos
    .filter((m) => cumplimiento.includes(m.id))
    .map((m) => {
      const presentes = m.requeridos.filter((r) => serviciosSeleccionados.includes(r));
      const faltantes = m.requeridos.filter((r) => !serviciosSeleccionados.includes(r));
      return {
        id: m.id,
        nombre: m.nombre,
        cubierto: faltantes.length === 0,
        serviciosPresentes: presentes,
        serviciosFaltantesRecomendados: faltantes,
        descripcion: m.desc,
      };
    });

  // 7. Recomendaciones FinOps de Ahorro
  const recomendacionesAhorro = [];
  if (serviciosSeleccionados.includes('ec2')) {
    recomendacionesAhorro.push({
      titulo: 'Compromiso Savings Plans para EC2 (1 Año)',
      detalle: 'Aplica hasta 28% de descuento en la tarifa On-Demand comprometiendo uso continuo de cómputo.',
      ahorroPotencialMensual: Math.round(costoMensualEstimado * 0.18 * 100) / 100,
    });
  }
  if (serviciosSeleccionados.includes('s3')) {
    recomendacionesAhorro.push({
      titulo: 'Habilitar S3 Intelligent-Tiering',
      detalle: 'Mueve automáticamente objetos no accedidos a clases de almacenamiento económico sin impacto de latencia.',
      ahorroPotencialMensual: Math.round(costoMensualEstimado * 0.05 * 100) / 100,
    });
  }

  return {
    costoMensualEstimado,
    costoAnualEstimado,
    costoPorUsuarioMensual,
    desglose,
    presupuestoMaximo,
    diferenciaPresupuesto,
    porcentajeUsoPresupuesto,
    estadoPresupuesto,
    mensajePresupuesto,
    slaPorcentaje,
    downtimeAnualTexto,
    estrategiaRto,
    estrategiaRpo,
    incoherencias,
    pilares,
    cumplimientoAnalisis,
    recomendacionesAhorro,
  };
}
