import { api, type AwsResponse } from '../lib/api';

export interface PrecioLive {
  precio: number;
  fuente: 'live';
  fechaActualizacion?: string;
}

interface Quote { unit: string; priceUsd: number; description: string; beginRange: string; product: string }

const queries: Record<string, string> = {
  ec2: 'serviceCode=AmazonEC2&instanceType=t3.medium&operatingSystem=Linux&tenancy=Shared&capacitystatus=Used&preInstalledSw=NA',
  s3: 'serviceCode=AmazonS3&storageClass=General Purpose',
  rds: 'serviceCode=AmazonRDS&instanceType=db.t3.medium&databaseEngine=PostgreSQL',
};


export async function obtenerPrecios(region: string): Promise<Record<string, PrecioLive>> {
  const result: Record<string, PrecioLive> = {};
  await Promise.all(Object.entries(queries).map(async ([id, query]) => {
    try {
      const response = await api<AwsResponse<Quote[]>>(`/aws/pricing?${query}&regionCode=${encodeURIComponent(region)}`);
      const quote = response.data.find((q) => q.beginRange === '0' &&
        (id === 'ec2' ? q.unit === 'Hrs' : id === 's3' ? q.unit === 'GB-Mo' && q.product.endsWith('TimedStorage-ByteHrs') && !q.product.includes('Annotation') : q.unit === 'Hrs' && q.description.includes('Single-AZ')));
      if (quote) result[id] = { precio: quote.priceUsd, fuente: 'live', fechaActualizacion: response.observedAt };
    } catch { /* La cotización queda sin dato hasta que AWS responda. */ }
  }));
  return result;
}

export function invalidarCache(): void { /* La API administra el TTL de Price List en PostgreSQL. */ }
