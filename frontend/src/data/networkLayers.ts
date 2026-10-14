import { geoInterpolate } from 'd3-geo';
import { regionGeometry } from './regionGeometry';

export type CapaRed = 'fibra' | 'regiones' | 'cloudfront';

export interface CloudFrontPoP {
  id: string;
  ciudad: string;
  pais: string;
  gps: [number, number];
  regionCercana: string;
  latenciaEdgeMs: number;
}

export interface CableSubmarino {
  id: string;
  nombre: string;
  capacidad: string;
  longitudKm: number;
  estaciones: string;
  coordenadas: [number, number][];
}

export interface EnlaceAws {
  id: string;
  regionA: string;
  regionB: string;
  capacidad: string;
  latenciaEstMs: number;
}

export const ENLACES_AWS_BACKBONE: EnlaceAws[] = [
  { id: 'us-e1-w2', regionA: 'us-east-1', regionB: 'us-west-2', capacidad: '100 Gbps', latenciaEstMs: 68 },
  { id: 'us-e1-e2', regionA: 'us-east-1', regionB: 'us-east-2', capacidad: '100 Gbps', latenciaEstMs: 12 },
  { id: 'us-e2-w2', regionA: 'us-east-2', regionB: 'us-west-2', capacidad: '100 Gbps', latenciaEstMs: 52 },
  { id: 'us-w1-w2', regionA: 'us-west-1', regionB: 'us-west-2', capacidad: '100 Gbps', latenciaEstMs: 16 },
  { id: 'us-e1-ca', regionA: 'us-east-1', regionB: 'ca-central-1', capacidad: '100 Gbps', latenciaEstMs: 22 },
  { id: 'us-e1-sa', regionA: 'us-east-1', regionB: 'sa-east-1', capacidad: '100 Gbps', latenciaEstMs: 112 },
  { id: 'us-e1-euw1', regionA: 'us-east-1', regionB: 'eu-west-1', capacidad: '100 Gbps', latenciaEstMs: 74 },
  { id: 'us-e1-euc1', regionA: 'us-east-1', regionB: 'eu-central-1', capacidad: '100 Gbps', latenciaEstMs: 86 },
  { id: 'euw1-euw2', regionA: 'eu-west-1', regionB: 'eu-west-2', capacidad: '100 Gbps', latenciaEstMs: 9 },
  { id: 'euw1-euc1', regionA: 'eu-west-1', regionB: 'eu-central-1', capacidad: '100 Gbps', latenciaEstMs: 15 },
  { id: 'euw3-euc1', regionA: 'eu-west-3', regionB: 'eu-central-1', capacidad: '100 Gbps', latenciaEstMs: 11 },
  { id: 'euc1-eun1', regionA: 'eu-central-1', regionB: 'eu-north-1', capacidad: '100 Gbps', latenciaEstMs: 24 },
  { id: 'euc1-eus1', regionA: 'eu-central-1', regionB: 'eu-south-1', capacidad: '100 Gbps', latenciaEstMs: 14 },
  { id: 'euc1-eus2', regionA: 'eu-central-1', regionB: 'eu-south-2', capacidad: '100 Gbps', latenciaEstMs: 26 },
  { id: 'euc1-mec1', regionA: 'eu-central-1', regionB: 'me-central-1', capacidad: '100 Gbps', latenciaEstMs: 64 },
  { id: 'euc1-aps1', regionA: 'eu-central-1', regionB: 'ap-south-1', capacidad: '100 Gbps', latenciaEstMs: 96 },
  { id: 'euw1-afs1', regionA: 'eu-west-1', regionB: 'af-south-1', capacidad: '100 Gbps', latenciaEstMs: 138 },
  { id: 'us-w2-apne1', regionA: 'us-west-2', regionB: 'ap-northeast-1', capacidad: '100 Gbps', latenciaEstMs: 88 },
  { id: 'us-w1-apse1', regionA: 'us-west-1', regionB: 'ap-southeast-1', capacidad: '100 Gbps', latenciaEstMs: 142 },
  { id: 'us-w2-apse2', regionA: 'us-west-2', regionB: 'ap-southeast-2', capacidad: '100 Gbps', latenciaEstMs: 124 },
  { id: 'apne1-apne2', regionA: 'ap-northeast-1', regionB: 'ap-northeast-2', capacidad: '100 Gbps', latenciaEstMs: 29 },
  { id: 'apne1-ape1', regionA: 'ap-northeast-1', regionB: 'ap-east-1', capacidad: '100 Gbps', latenciaEstMs: 44 },
  { id: 'ape1-apse1', regionA: 'ap-east-1', regionB: 'ap-southeast-1', capacidad: '100 Gbps', latenciaEstMs: 34 },
  { id: 'aps1-apse1', regionA: 'ap-south-1', regionB: 'ap-southeast-1', capacidad: '100 Gbps', latenciaEstMs: 38 },
  { id: 'apse1-apse2', regionA: 'ap-southeast-1', regionB: 'ap-southeast-2', capacidad: '100 Gbps', latenciaEstMs: 91 },
  { id: 'mec1-aps1', regionA: 'me-central-1', regionB: 'ap-south-1', capacidad: '100 Gbps', latenciaEstMs: 31 },
];

export const CABLES_FIBRA_SUBMARINA: CableSubmarino[] = [
  {
    id: 'marea',
    nombre: 'MAREA',
    capacidad: '200 Tbps',
    longitudKm: 6600,
    estaciones: 'Virginia Beach (EE.UU.) - Bilbao (España)',
    coordenadas: [
      [-75.97, 36.85],
      [-55.0, 39.5],
      [-32.0, 42.0],
      [-15.0, 43.5],
      [-2.95, 43.3],
    ],
  },
  {
    id: 'dunant',
    nombre: 'Dunant',
    capacidad: '250 Tbps',
    longitudKm: 6400,
    estaciones: 'Virginia Beach (EE.UU.) - Saint-Hilaire (Francia)',
    coordenadas: [
      [-75.97, 36.85],
      [-52.0, 41.0],
      [-28.0, 44.0],
      [-10.0, 46.0],
      [-1.93, 46.72],
    ],
  },
  {
    id: 'grace-hopper',
    nombre: 'Grace Hopper',
    capacidad: '340 Tbps',
    longitudKm: 6250,
    estaciones: 'Nueva York (EE.UU.) - Bude (Reino Unido) - Bilbao (España)',
    coordenadas: [
      [-74.0, 40.71],
      [-48.0, 45.0],
      [-24.0, 48.5],
      [-4.54, 50.82],
      [-2.95, 43.3],
    ],
  },
  {
    id: 'curie',
    nombre: 'Curie',
    capacidad: '72 Tbps',
    longitudKm: 10500,
    estaciones: 'Los Ángeles (EE.UU.) - Valparaíso (Chile)',
    coordenadas: [
      [-118.24, 33.74],
      [-105.0, 18.0],
      [-90.0, 2.0],
      [-80.0, -15.0],
      [-71.61, -33.04],
    ],
  },
  {
    id: 'monet',
    nombre: 'Monet / Seabras',
    capacidad: '64 Tbps',
    longitudKm: 10550,
    estaciones: 'Boca Raton (Florida) - Fortaleza - Santos (São Paulo)',
    coordenadas: [
      [-80.08, 26.35],
      [-65.0, 18.0],
      [-48.0, 5.0],
      [-38.54, -3.73],
      [-46.33, -23.96],
    ],
  },
  {
    id: 'sacs',
    nombre: 'SACS (South Atlantic Cable)',
    capacidad: '40 Tbps',
    longitudKm: 6165,
    estaciones: 'Fortaleza (Brasil) - Luanda (Angola) - Ciudad del Cabo',
    coordenadas: [
      [-38.54, -3.73],
      [-20.0, -5.5],
      [-5.0, -7.5],
      [13.23, -8.83],
      [18.42, -33.92],
    ],
  },
  {
    id: 'faster',
    nombre: 'FASTER Cable System',
    capacidad: '60 Tbps',
    longitudKm: 11629,
    estaciones: 'Bandon (Oregón) - Chikura (Japón) - Tamsui (Taiwán)',
    coordenadas: [
      [-124.4, 43.12],
      [-155.0, 48.0],
      [-180.0, 49.5],
      [160.0, 47.0],
      [139.95, 34.96],
      [121.44, 25.17],
    ],
  },
  {
    id: 'southern-cross',
    nombre: 'Southern Cross NEXT',
    capacidad: '72 Tbps',
    longitudKm: 15840,
    estaciones: 'Oregón (EE.UU.) - Hawái - Fiyi - Sídney (Australia)',
    coordenadas: [
      [-124.0, 45.0],
      [-157.85, 21.3],
      [-179.0, -5.0],
      [178.44, -18.14],
      [165.0, -28.0],
      [151.21, -33.87],
    ],
  },
  {
    id: 'seamewe5',
    nombre: 'SEA-ME-WE 5',
    capacidad: '24 Tbps',
    longitudKm: 20000,
    estaciones: 'Marsella (Francia) - Suez (Egipto) - Bombay (India) - Singapur',
    coordenadas: [
      [5.37, 43.29],
      [18.0, 35.0],
      [32.55, 29.96],
      [42.0, 15.0],
      [58.0, 18.0],
      [72.87, 19.07],
      [88.0, 8.0],
      [103.82, 1.35],
    ],
  },
  {
    id: '2africa',
    nombre: '2Africa',
    capacidad: '180 Tbps',
    longitudKm: 45000,
    estaciones: 'Bude (Reino Unido) - Lisboa - Dakar - Ciudad del Cabo - Mombasa - Suez',
    coordenadas: [
      [-4.54, 50.82],
      [-9.14, 38.72],
      [-17.44, 14.69],
      [3.37, 6.45],
      [18.42, -33.92],
      [39.66, -4.04],
      [32.55, 29.96],
      [5.37, 43.29],
    ],
  },
  {
    id: 'apg',
    nombre: 'Asia Pacific Gateway (APG)',
    capacidad: '54 Tbps',
    longitudKm: 10400,
    estaciones: 'Tokio (Japón) - Seúl - Shanghái - Hong Kong - Singapur',
    coordenadas: [
      [139.69, 35.69],
      [129.07, 35.17],
      [121.47, 31.23],
      [114.17, 22.32],
      [108.0, 14.0],
      [103.82, 1.35],
    ],
  },
];

export const CLOUDFRONT_POPS: CloudFrontPoP[] = [
  { id: 'JFK', ciudad: 'Nueva York', pais: 'EE.UU.', gps: [-73.78, 40.64], regionCercana: 'us-east-1', latenciaEdgeMs: 5 },
  { id: 'MIA', ciudad: 'Miami', pais: 'EE.UU.', gps: [-80.19, 25.76], regionCercana: 'us-east-1', latenciaEdgeMs: 9 },
  { id: 'ORD', ciudad: 'Chicago', pais: 'EE.UU.', gps: [-87.62, 41.88], regionCercana: 'us-east-2', latenciaEdgeMs: 6 },
  { id: 'DFW', ciudad: 'Dallas', pais: 'EE.UU.', gps: [-96.8, 32.78], regionCercana: 'us-east-2', latenciaEdgeMs: 8 },
  { id: 'LAX', ciudad: 'Los Ángeles', pais: 'EE.UU.', gps: [-118.24, 34.05], regionCercana: 'us-west-1', latenciaEdgeMs: 6 },
  { id: 'SEA', ciudad: 'Seattle', pais: 'EE.UU.', gps: [-122.33, 47.61], regionCercana: 'us-west-2', latenciaEdgeMs: 5 },
  { id: 'YYZ', ciudad: 'Toronto', pais: 'Canadá', gps: [-79.38, 43.65], regionCercana: 'ca-central-1', latenciaEdgeMs: 7 },
  { id: 'MEX', ciudad: 'Ciudad de México', pais: 'México', gps: [-99.13, 19.43], regionCercana: 'mx-central-1', latenciaEdgeMs: 12 },
  { id: 'BOG', ciudad: 'Bogotá', pais: 'Colombia', gps: [-74.07, 4.71], regionCercana: 'us-east-1', latenciaEdgeMs: 28 },
  { id: 'LIM', ciudad: 'Lima', pais: 'Perú', gps: [-77.04, -12.04], regionCercana: 'us-east-1', latenciaEdgeMs: 38 },
  { id: 'SCL', ciudad: 'Santiago', pais: 'Chile', gps: [-70.66, -33.45], regionCercana: 'sa-east-1', latenciaEdgeMs: 16 },
  { id: 'EZE', ciudad: 'Buenos Aires', pais: 'Argentina', gps: [-58.38, -34.6], regionCercana: 'sa-east-1', latenciaEdgeMs: 14 },
  { id: 'GIG', ciudad: 'Río de Janeiro', pais: 'Brasil', gps: [-43.17, -22.9], regionCercana: 'sa-east-1', latenciaEdgeMs: 8 },
  { id: 'LHR', ciudad: 'Londres', pais: 'Reino Unido', gps: [-0.12, 51.5], regionCercana: 'eu-west-2', latenciaEdgeMs: 4 },
  { id: 'CDG', ciudad: 'París', pais: 'Francia', gps: [2.35, 48.85], regionCercana: 'eu-west-3', latenciaEdgeMs: 5 },
  { id: 'FRA', ciudad: 'Fráncfort', pais: 'Alemania', gps: [8.68, 50.11], regionCercana: 'eu-central-1', latenciaEdgeMs: 4 },
  { id: 'MAD', ciudad: 'Madrid', pais: 'España', gps: [-3.7, 40.41], regionCercana: 'eu-south-2', latenciaEdgeMs: 6 },
  { id: 'AMS', ciudad: 'Ámsterdam', pais: 'Países Bajos', gps: [4.9, 52.37], regionCercana: 'eu-west-1', latenciaEdgeMs: 7 },
  { id: 'MXP', ciudad: 'Milán', pais: 'Italia', gps: [9.19, 45.46], regionCercana: 'eu-south-1', latenciaEdgeMs: 5 },
  { id: 'ARN', ciudad: 'Estocolmo', pais: 'Suecia', gps: [18.06, 59.32], regionCercana: 'eu-north-1', latenciaEdgeMs: 8 },
  { id: 'WAW', ciudad: 'Varsovia', pais: 'Polonia', gps: [21.01, 52.23], regionCercana: 'eu-central-1', latenciaEdgeMs: 11 },
  { id: 'NRT', ciudad: 'Tokio', pais: 'Japón', gps: [139.69, 35.68], regionCercana: 'ap-northeast-1', latenciaEdgeMs: 5 },
  { id: 'ICN', ciudad: 'Seúl', pais: 'Corea del Sur', gps: [126.97, 37.56], regionCercana: 'ap-northeast-2', latenciaEdgeMs: 6 },
  { id: 'HKG', ciudad: 'Hong Kong', pais: 'China', gps: [114.16, 22.28], regionCercana: 'ap-east-1', latenciaEdgeMs: 6 },
  { id: 'TPE', ciudad: 'Taipéi', pais: 'Taiwán', gps: [121.56, 25.03], regionCercana: 'ap-east-2', latenciaEdgeMs: 7 },
  { id: 'SIN', ciudad: 'Singapur', pais: 'Singapur', gps: [103.85, 1.29], regionCercana: 'ap-southeast-1', latenciaEdgeMs: 4 },
  { id: 'BOM', ciudad: 'Bombay', pais: 'India', gps: [72.87, 19.07], regionCercana: 'ap-south-1', latenciaEdgeMs: 6 },
  { id: 'SYD', ciudad: 'Sídney', pais: 'Australia', gps: [151.2, -33.86], regionCercana: 'ap-southeast-2', latenciaEdgeMs: 6 },
  { id: 'MEL', ciudad: 'Melbourne', pais: 'Australia', gps: [144.96, -37.81], regionCercana: 'ap-southeast-4', latenciaEdgeMs: 7 },
  { id: 'DXB', ciudad: 'Dubái', pais: 'EAU', gps: [55.27, 25.2], regionCercana: 'me-central-1', latenciaEdgeMs: 7 },
  { id: 'TLV', ciudad: 'Tel Aviv', pais: 'Israel', gps: [34.78, 32.08], regionCercana: 'il-central-1', latenciaEdgeMs: 8 },
  { id: 'JNB', ciudad: 'Johannesburgo', pais: 'Sudáfrica', gps: [28.04, -26.2], regionCercana: 'af-south-1', latenciaEdgeMs: 12 },
];

export function generarGeoLinea(p1: [number, number], p2: [number, number], pasos = 8) {
  const interpolador = geoInterpolate(p1, p2);
  const coords: [number, number][] = [];
  for (let i = 0; i <= pasos; i++) {
    coords.push(interpolador(i / pasos));
  }
  return {
    type: 'LineString' as const,
    coordinates: coords,
  };
}

export function generarGeoMultiPuntos(puntos: [number, number][], pasosPorSegmento = 6) {
  const coords: [number, number][] = [];
  for (let s = 0; s < puntos.length - 1; s++) {
    const pA = puntos[s];
    const pB = puntos[s + 1];
    const interp = geoInterpolate(pA, pB);
    for (let i = 0; i < pasosPorSegmento; i++) {
      coords.push(interp(i / pasosPorSegmento));
    }
  }
  coords.push(puntos[puntos.length - 1]);
  return {
    type: 'LineString' as const,
    coordinates: coords,
  };
}

export function obtenerGpsRegion(regionId: string): [number, number] | null {
  const geo = regionGeometry[regionId];
  return geo ? geo.gps : null;
}
