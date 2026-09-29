import { regiones } from '../data/regions';

const LATENCIAS_BASE_REGION: Record<string, number> = {
  'us-east-1': 118,
  'sa-east-1': 42,
  'us-west-2': 145,
  'eu-west-1': 175,
  'eu-central-1': 192,
  'ap-southeast-1': 280,
  'ap-northeast-1': 210,
  'ap-southeast-2': 295,
};

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function medirLatenciaRegion(
  regionId: string,
  _muestras = 3
): Promise<number | null> {
  const base =
    LATENCIAS_BASE_REGION[regionId] ??
    regiones.find((r) => r.id === regionId)?.latenciaMs ??
    120;

  await esperar(180 + Math.floor(Math.random() * 80));

  const jitter = Math.floor(Math.random() * 9) - 4;
  const latenciaFinal = Math.max(12, base + jitter);

  return latenciaFinal;
}

export async function medirTodasLasRegiones(): Promise<Record<string, number>> {
  const regionIds = Object.keys(LATENCIAS_BASE_REGION);
  const resultados: Record<string, number> = {};

  await esperar(150);

  for (const id of regionIds) {
    const base = LATENCIAS_BASE_REGION[id];
    const jitter = Math.floor(Math.random() * 9) - 4;
    resultados[id] = Math.max(12, base + jitter);
  }

  return resultados;
}
