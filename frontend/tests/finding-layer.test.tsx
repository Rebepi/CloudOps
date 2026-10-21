import { describe, expect, it } from 'vitest';
import { detectFindingLayer } from '../src/components/security/findingLayerHelper';

describe('detectFindingLayer', () => {
  it('separa backend y frontend usando la ruta del recurso', () => {
    expect(detectFindingLayer({ category: 'secret', source: 'cloudops', resource: 'SalesIA/backend/.env' })).toBe('backend');
    expect(detectFindingLayer({ category: 'code', source: 'cloudops', resource: 'SalesIA/frontend/src/App.tsx' })).toBe('frontend');
  });

  it('prioriza dependencias e infraestructura sobre su carpeta física', () => {
    expect(detectFindingLayer({ category: 'dependency', source: 'osv', resource: 'SalesIA/backend/uv.lock' })).toBe('dependencies');
    expect(detectFindingLayer({ category: 'iac', source: 'cloudops', resource: 'SalesIA/frontend/Dockerfile' })).toBe('infrastructure');
  });
});


