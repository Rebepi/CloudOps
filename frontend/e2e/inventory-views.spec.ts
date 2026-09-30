import { expect, test as base, type Page } from '@playwright/test';
import type { Connection, Identity, Project, Resource } from '../src/services/backend';

// Fixtures sintéticos de contrato UI: no prueban AWS real ni contactan AWS/FLOCI.
// Usa la configuración existente: Chromium, un worker y puerto local 27901.
const ids = {
  workspace: '10000000-0000-4000-8000-000000000001',
  projectA: '10000000-0000-4000-8000-000000000002',
  projectB: '10000000-0000-4000-8000-000000000003',
  user: '10000000-0000-4000-8000-000000000004',
  awsConnection: '20000000-0000-4000-8000-000000000001',
  flociConnection: '20000000-0000-4000-8000-000000000002',
  vpc: '30000000-0000-4000-8000-000000000001',
  subnet: '30000000-0000-4000-8000-000000000002',
  bucket: '30000000-0000-4000-8000-000000000003',
  vpcSnapshot: '40000000-0000-4000-8000-000000000001',
  subnetSnapshot: '40000000-0000-4000-8000-000000000002',
  sync: '50000000-0000-4000-8000-000000000001',
  correlation: '60000000-0000-4000-8000-000000000001',
} as const;
const observedAt = '2026-09-01T12:00:00Z';
const projects: Project[] = [
  { id: ids.projectA, name: 'Proyecto A fixture', workspace_id: ids.workspace },
  { id: ids.projectB, name: 'Proyecto B fixture', workspace_id: ids.workspace },
];
const readPermissions = ['cloud:read', 'proposal:read'];
const identity: Identity = {
  id: ids.user, email: 'inventory-fixture@example.test', roles: ['viewer'],
  permissions: readPermissions,
  project_roles: { [ids.projectA]: 'viewer', [ids.projectB]: 'viewer' },
  project_permissions: { [ids.projectA]: readPermissions, [ids.projectB]: readPermissions },
};

type Attempt = {
  id: string; status: string; records_processed: number; error_code: string | null;
  correlation_id: string; created_at: string; finished_at: string | null;
};
type InventoryStatus = Connection & { last_attempt: Attempt | null; last_success: Attempt | null };
type NetworkResource = Resource & {
  service_code: 'vpc'; resource_type: 'vpc' | 'subnet'; mode: 'aws' | 'floci';
  account_id: string; snapshot_id: string; sync_run_id: string; correlation_id: string;
  cidr_blocks: { cidr: string; association_state: string | null }[];
  name: string | null; is_default: boolean | null; tenancy: string | null;
  vpc_resource_id: string | null; vpc_external_id: string | null; parent_observed: boolean;
  availability_zone: string | null; available_ip_address_count: number | null;
  map_public_ip_on_launch: boolean | null;
};
const success: Attempt = {
  id: ids.sync, status: 'succeeded', records_processed: 3, error_code: null,
  correlation_id: ids.correlation, created_at: '2026-09-01T11:59:00Z', finished_at: observedAt,
};
const awsStatus: InventoryStatus = {
  id: ids.awsConnection, name: 'AWS fixture A', mode: 'aws', account_id: '111111111111',
  region_code: 'us-east-1', last_checked_at: null, last_attempt: success, last_success: success,
};
const flociStatus: InventoryStatus = {
  id: ids.flociConnection, name: 'FLOCI fixture B', mode: 'floci', account_id: '000000000000',
  region_code: 'us-west-2', last_checked_at: null, last_attempt: null, last_success: null,
};
const vpc: NetworkResource = {
  id: ids.vpc, connection_id: ids.awsConnection, service_code: 'vpc', region_code: 'us-east-1',
  resource_type: 'vpc', external_id: 'vpc-0a000000000000001', status: 'available',
  observed_at: observedAt, mode: 'aws', account_id: awsStatus.account_id,
  snapshot_id: ids.vpcSnapshot, sync_run_id: ids.sync, correlation_id: ids.correlation,
  cidr_blocks: [{ cidr: '10.42.0.0/16', association_state: null }], name: null,
  is_default: null, tenancy: null, vpc_resource_id: null, vpc_external_id: null,
  parent_observed: false, availability_zone: null, available_ip_address_count: null,
  map_public_ip_on_launch: null,
};
const subnet: NetworkResource = {
  ...vpc, id: ids.subnet, resource_type: 'subnet', external_id: 'subnet-0a000000000000001',
  snapshot_id: ids.subnetSnapshot,
  cidr_blocks: [{ cidr: '10.42.1.0/24', association_state: null }],
  vpc_resource_id: ids.vpc, vpc_external_id: vpc.external_id, parent_observed: true,
  availability_zone: 'us-east-1a', available_ip_address_count: 251, map_public_ip_on_launch: false,
};
// Resource normal: solamente campos curados, sin payloads externos.
const resources: Resource[] = [vpc, subnet].map(r => ({
  id: r.id, connection_id: r.connection_id, service_code: r.service_code,
  region_code: r.region_code, resource_type: r.resource_type, external_id: r.external_id,
  status: r.status, observed_at: r.observed_at,
}));
const bucket: Resource = {
  id: ids.bucket, connection_id: ids.awsConnection, service_code: 's3', region_code: 'us-east-1',
  resource_type: 'bucket', external_id: 'cloudops-ui-fixture-bucket-a',
  status: 'available', observed_at: observedAt,
};
resources.push(bucket);

type FixtureState = {
  scenario: 'observed' | 'empty' | 'error'; requests: string[]; violations: string[];
};
const test = base.extend<{ inventory: FixtureState }>({
  inventory: [async ({ page, baseURL }, use) => {
    const state: FixtureState = { scenario: 'observed', requests: [], violations: [] };
    await page.addInitScript(projectId => {
      sessionStorage.setItem('cloudops_session', 'test-fixture');
      sessionStorage.setItem('cloudops_project', projectId);
    }, ids.projectA);

    // Todo acceso fuera del frontend local se bloquea; nunca hay passthrough cloud.
    const frontendOrigin = new URL(baseURL ?? 'http://127.0.0.1:27901').origin;
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      // La fuente existente es un asset visual, no parte del contrato API.
      // Sustituir su CSS localmente; no permitir solicitudes a Google.
      if (request.method() === 'GET' && url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2') {
        await route.fulfill({ contentType: 'text/css', body: '' });
        return;
      }
      if (request.method() !== 'GET' || new URL(request.url()).origin !== frontendOrigin) {
        state.violations.push(`${request.method()} ${new URL(request.url()).pathname}`);
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    await page.route('**/api/v1/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace(/^\/api\/v1/, '');
      const json = async (body: unknown, status = 200) => {
        await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      };
      if (request.method() !== 'GET') {
        state.violations.push(`${request.method()} ${path}`);
        await json({ detail: 'UI contract fixture permits GET only' }, 405);
        return;
      }
      state.requests.push(`${path}${url.search}`);
      if (path === '/auth/me') { await json(identity); return; }
      const match = path.match(/^\/projects\/([^/]+)\/(network\/resources|inventory-status|resources|proposals)$/);
      if (path !== '/projects' && (!match || !projects.some(p => p.id === match[1]))) {
        state.violations.push(`Unexpected GET ${path}`);
        await json({ detail: 'Unmocked UI contract endpoint' }, 404);
        return;
      }
      if (url.searchParams.get('limit') !== '200' || url.searchParams.get('offset') !== '0') {
        state.violations.push(`Unexpected pagination ${path}${url.search}`);
        await json({ detail: 'Expected limit=200&offset=0' }, 400);
        return;
      }
      if (path === '/projects') { await json(projects); return; }
      const [, projectId, endpoint] = match!;
      if (endpoint === 'proposals') { await json([]); return; }
      if (endpoint === 'inventory-status') {
        await json(projectId === ids.projectB ? [flociStatus] : [{
          ...awsStatus,
          ...(state.scenario === 'empty' ? { last_attempt: null, last_success: null } : {}),
        }]);
        return;
      }
      if (state.scenario === 'error') {
        await json({ detail: 'inventory_fixture_unavailable' }, 502);
        return;
      }
      await json(projectId === ids.projectB || state.scenario === 'empty' ? [] :
        endpoint === 'network/resources' ? [vpc, subnet] : resources);
    });
    await use(state);
    expect(state.violations, 'Sin mutaciones, red externa ni endpoints sin fixture').toEqual([]);
  }, { auto: true }],
});
test.use({ serviceWorkers: 'block' });

const views = [
  { path: '/network', heading: 'Red observada', endpoint: 'network/resources' },
  { path: '/infrastructure', heading: 'Infraestructura observada', endpoint: 'resources' },
] as const;

async function expectNoDemo(page: Page) {
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: /simulador/i })).toHaveCount(0);
  await expect(main.getByRole('button', { name: /simula|enviar paquete|medir latencia/i })).toHaveCount(0);
  // Textos y valores presentes en las vistas demo existentes, no copy hipotético.
  await expect(main).not.toContainText(/Simulador visual de paquetes|Backbone Activo|SLA Cumplido|Saludable \(33% Carga\)|Absorbiendo Carga \(50%\)/i);
  await expect(main).not.toContainText(/\b\d+(?:[.,]\d+)?\s*ms\b/);
}

async function expectNoProjectA(page: Page) {
  const main = page.getByRole('main');
  for (const value of [vpc.external_id, subnet.external_id, bucket.external_id,
    '10.42.0.0/16', '10.42.1.0/24', 'us-east-1a', awsStatus.account_id, awsStatus.name]) {
    await expect(main).not.toContainText(value);
  }
  await expect(page.getByLabel('Conexión observada').locator(`option[value="${ids.awsConnection}"]`)).toHaveCount(0);
}

async function expectConnectionOptions(page: Page) {
  const selector = page.getByLabel('Conexión observada', { exact: true });
  await expect(selector).toHaveValue('');
  await expect(selector.locator('option')).toHaveCount(2);
  await expect(selector.locator('option[value=""]')).toHaveCount(1);
  await expect(selector.locator(`option[value="${ids.awsConnection}"]`)).toHaveCount(1);
  await selector.selectOption(ids.awsConnection);
  await expect(selector).toHaveValue(ids.awsConnection);
  await selector.selectOption('');
}

async function refreshInventory(page: Page, state: FixtureState, endpoint: string) {
  const path = `/projects/${ids.projectA}/${endpoint}?limit=200&offset=0`;
  const before = state.requests.filter(request => request === path).length;
  await page.getByRole('button', { name: 'Actualizar inventario', exact: true }).click();
  await expect.poll(() => state.requests.filter(request => request === path).length).toBeGreaterThan(before);
}

test.describe('Fixtures de contrato UI de inventario (sin prueba AWS real)', () => {
  test('red muestra VPC, subnet, CIDR y AZ observados sin simulador ni latencias', async ({ page, inventory }) => {
    await page.goto('/network');
    await expect(page.getByRole('heading', { name: 'Red observada', exact: true })).toBeVisible();
    const main = page.getByRole('main');
    for (const value of [vpc.external_id, subnet.external_id, '10.42.0.0/16', '10.42.1.0/24', 'us-east-1a']) {
      await expect(main.getByText(value, { exact: true }).first()).toBeVisible();
    }
    await expect(main.getByText(bucket.external_id, { exact: true })).toHaveCount(0);
    await expectConnectionOptions(page);
    await refreshInventory(page, inventory, 'network/resources');
    await expect(main.getByText(subnet.external_id, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expectNoDemo(page);
    expect(inventory.requests).toContain(`/projects/${ids.projectA}/inventory-status?limit=200&offset=0`);
  });

  test('cambiar al proyecto B elimina recursos y procedencia del proyecto A', async ({ page, inventory }) => {
    for (const view of views) {
      await page.goto(view.path);
      await expect(page.getByRole('heading', { name: view.heading, exact: true })).toBeVisible();
      await expect(page.getByRole('main').getByText(vpc.external_id, { exact: true }).first()).toBeVisible();
      await page.getByLabel('Conexión observada', { exact: true }).selectOption(ids.awsConnection);
      await page.getByLabel('Proyecto', { exact: true }).selectOption(ids.projectB);
      await expect(page.getByLabel('Proyecto', { exact: true })).toHaveValue(ids.projectB);
      await expect(page.getByRole('main').getByText(/Sin recursos observados/).first()).toBeVisible();
      await expect(page.getByLabel('Conexión observada', { exact: true })).toHaveValue('');
      await expect(page.getByLabel('Conexión observada').locator(`option[value="${ids.flociConnection}"]`)).toHaveCount(1);
      await expectNoProjectA(page);
      await expectNoDemo(page);
      expect(inventory.requests).toContain(`/projects/${ids.projectB}/${view.endpoint}?limit=200&offset=0`);
      expect(inventory.requests).toContain(`/projects/${ids.projectB}/inventory-status?limit=200&offset=0`);
    }
  });

  test('error 502 muestra alerta sin inventario ficticio en ambas vistas', async ({ page, inventory }) => {
    inventory.scenario = 'error';
    for (const view of views) {
      await page.goto(view.path);
      await expect(page.getByRole('heading', { name: view.heading, exact: true })).toBeVisible();
      await expect(page.getByRole('alert').first()).toBeVisible();
      await expect(page.getByRole('alert').first()).not.toBeEmpty();
      for (const resource of resources) {
        await expect(page.getByRole('main').getByText(resource.external_id, { exact: true })).toHaveCount(0);
      }
      await expect(page.getByRole('main').getByText('10.42.0.0/16', { exact: true })).toHaveCount(0);
      await expectNoDemo(page);
    }
  });

  test('inventario vacío muestra Sin recursos observados en ambas vistas', async ({ page, inventory }) => {
    inventory.scenario = 'empty';
    for (const view of views) {
      await page.goto(view.path);
      await expect(page.getByRole('heading', { name: view.heading, exact: true })).toBeVisible();
      await expect(page.getByRole('main').getByText(/Sin recursos observados/).first()).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
      for (const resource of resources) {
        await expect(page.getByRole('main').getByText(resource.external_id, { exact: true })).toHaveCount(0);
      }
      await expectNoDemo(page);
    }
  });

  test('infraestructura muestra IDs y fuente del fixture sin SLA, cargas ni backbone demo', async ({ page, inventory }) => {
    await page.goto('/infrastructure');
    await expect(page.getByRole('heading', { name: 'Infraestructura observada', exact: true })).toBeVisible();
    const main = page.getByRole('main');
    for (const resource of resources) {
      await expect(main.getByText(resource.external_id, { exact: true }).first()).toBeVisible();
    }
    await expect(main.getByText(awsStatus.account_id, { exact: false }).first()).toBeVisible();
    await expect(main.getByRole('cell', { name: awsStatus.region_code, exact: true }).first()).toBeVisible();
    await expect(main.getByRole('cell', { name: 'AWS real', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('complementary')).not.toContainText(/AWS OK|8 Reg|Admin CloudOps|DevOps Lead/);
    await expectConnectionOptions(page);
    await refreshInventory(page, inventory, 'resources');
    await expect(main.getByText(bucket.external_id, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expectNoDemo(page);
    await expect(main.getByRole('heading', { name: /SLA|cargas de trabajo|backbone/i })).toHaveCount(0);
    await expect(main).not.toContainText(/Monet Submarine Cable|Trans-US Terrestrial 400GbE|MAREA Transatlantic|99\.99%/);
    expect(inventory.requests).toContain(`/projects/${ids.projectA}/inventory-status?limit=200&offset=0`);
    expect(inventory.requests).toContain(`/projects/${ids.projectA}/proposals?limit=200&offset=0`);
  });
});
