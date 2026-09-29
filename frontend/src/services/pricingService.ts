const PRICING_BASE = 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws';
const CACHE_KEY = 'cloudops_pricing_cache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const PRECIOS_FALLBACK: Record<string, number> = {
  ec2:        0.0416,
  lambda:     0.0000166667,
  s3:         0.023,
  ebs:        0.08,
  rds:        0.068,
  dynamodb:   0.25,
  vpc:        0,
  route53:    0.50,
  elb:        0.0225,
  cloudfront: 0.085,
  iam:        0,
  waf:        5.0,
  cloudwatch: 0.30,
  kms:        1.0,
};

const SERVICIOS_FETCHEABLES: Record<string, { offerCode: string; region?: string }> = {
  lambda:     { offerCode: 'AWSLambda',       region: 'us-east-1' },
  route53:    { offerCode: 'AmazonRoute53' },
  kms:        { offerCode: 'awskms',           region: 'us-east-1' },
  waf:        { offerCode: 'awswaf' },
  cloudwatch: { offerCode: 'AmazonCloudWatch', region: 'us-east-1' },
  cloudfront: { offerCode: 'AmazonCloudFront' },
};

export const SERVICIOS_ESTATICOS = new Set(['ec2', 'rds', 'ebs', 's3', 'elb', 'dynamodb', 'vpc', 'iam']);

export interface PrecioLive {
  precio: number;
  fuente: 'live' | 'estatico';
  fechaActualizacion?: string;
}

type CacheEntry = {
  precios: Record<string, PrecioLive>;
  timestamp: number;
};

function leerCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

function guardarCache(entry: CacheEntry): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
  }
}

function extraerPrecio(
  data: Record<string, any>,
  filtroProducto: (attrs: Record<string, string>) => boolean,
  filtroDimension?: (dim: Record<string, any>) => boolean
): number | null {
  const products: Record<string, any> = data.products ?? {};
  const onDemand: Record<string, any> = data.terms?.OnDemand ?? {};

  for (const sku of Object.keys(products)) {
    const attrs: Record<string, string> = products[sku]?.attributes ?? {};
    if (!filtroProducto(attrs)) continue;

    const terms: Record<string, any> = onDemand[sku] ?? {};
    for (const termKey of Object.keys(terms)) {
      const dims: Record<string, any> = terms[termKey]?.priceDimensions ?? {};
      for (const dimKey of Object.keys(dims)) {
        const dim = dims[dimKey];
        if (filtroDimension && !filtroDimension(dim)) continue;
        const precio = parseFloat(dim?.pricePerUnit?.USD ?? '0');
        if (precio > 0) return precio;
      }
    }
  }
  return null;
}

async function fetchPrecioServicio(servicioId: string): Promise<number | null> {
  const config = SERVICIOS_FETCHEABLES[servicioId];
  if (!config) return null;

  const url = config.region
    ? `${PRICING_BASE}/${config.offerCode}/current/${config.region}/index.json`
    : `${PRICING_BASE}/${config.offerCode}/current/index.json`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();

    switch (servicioId) {
      case 'lambda':
        return extraerPrecio(
          data,
          (a) => a.group === 'AWS-Lambda-Duration' && a.location === 'US East (N. Virginia)',
          (d) => d.unit === 'seconds'
        );

      case 'route53':
        return extraerPrecio(
          data,
          (a) => (a.usagetype ?? '').includes('HostedZone') && a.location === 'US East (N. Virginia)'
        );

      case 'kms':
        return extraerPrecio(
          data,
          (a) =>
            (a.usagetype ?? '').toLowerCase().includes('kms-keys') &&
            a.location === 'US East (N. Virginia)'
        );

      case 'waf':
        return extraerPrecio(
          data,
          (a) => (a.usagetype ?? '').includes('WebACL') && a.location === 'US East (N. Virginia)'
        );

      case 'cloudwatch':
        return extraerPrecio(
          data,
          (a) =>
            (a.usagetype ?? '').toLowerCase().includes('metricmonitor') &&
            a.location === 'US East (N. Virginia)'
        );

      case 'cloudfront':
        return extraerPrecio(
          data,
          (a) =>
            a.location === 'US East (N. Virginia)' &&
            (a.usagetype ?? '').includes('DataTransfer-Out-Bytes') &&
            a.originGroup === 'US, Mexico, & Canada'
        );

      default:
        return null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

let _promesaEnCurso: Promise<Record<string, PrecioLive>> | null = null;

export async function obtenerPrecios(): Promise<Record<string, PrecioLive>> {
  if (_promesaEnCurso) return _promesaEnCurso;

  _promesaEnCurso = (async () => {
    const cached = leerCache();
    if (cached) return cached.precios;

    const resultado: Record<string, PrecioLive> = {};
    for (const [id, precio] of Object.entries(PRECIOS_FALLBACK)) {
      resultado[id] = { precio, fuente: 'estatico' };
    }

    const fechaHoy = new Date().toLocaleDateString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });

    const fetchPromesas = Object.keys(SERVICIOS_FETCHEABLES).map(async (id) => {
      const precioLive = await fetchPrecioServicio(id);
      if (precioLive !== null) {
        resultado[id] = { precio: precioLive, fuente: 'live', fechaActualizacion: fechaHoy };
      }
    });

    await Promise.allSettled(fetchPromesas);

    guardarCache({ precios: resultado, timestamp: Date.now() });

    return resultado;
  })().finally(() => {
    _promesaEnCurso = null;
  });

  return _promesaEnCurso;
}

export function invalidarCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
}
