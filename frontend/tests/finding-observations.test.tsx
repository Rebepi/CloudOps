import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FindingObservations } from '../src/components/security/FindingObservations';

describe('trazabilidad de hallazgos normalizados', () => {
  it('muestra ambas fuentes y sus recomendaciones aunque el hallazgo tenga una sola fuente principal', () => {
    const html = renderToStaticMarkup(<FindingObservations evidence={{ observations: [
      { source: 'cloudops', externalId: 'cloudops:rds-public:orders', severity: 'HIGH', resource: 'orders', recommendation: 'Usar subredes privadas.' },
      { source: 'security-hub', externalId: 'security-control/RDS.2', severity: 'CRITICAL', resource: 'arn:aws:rds:us-east-1:123456789012:db:orders', recommendation: 'Corregir PubliclyAccessible.' },
    ] }} />);
    expect(html).toContain('CloudOps Engine');
    expect(html).toContain('AWS Security Hub');
    expect(html).toContain('Usar subredes privadas.');
    expect(html).toContain('Corregir PubliclyAccessible.');
    expect(html).toContain('se contabiliza una sola vez');
  });

  it('tolera ejecuciones históricas y evidencia con formato inválido', () => {
    expect(renderToStaticMarkup(<FindingObservations evidence={{}} />)).toBe('');
    expect(renderToStaticMarkup(<FindingObservations evidence={{ observations: [null, {}, 'invalid'] }} />)).toBe('');
  });
});
