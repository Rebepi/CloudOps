import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeTextFile, parseDependencies, validateArchivePath } from './zipSecurityScanner.js';

test('rechaza rutas ZIP capaces de escapar del directorio lógico', () => {
  assert.equal(validateArchivePath('src/app.ts'), true);
  assert.equal(validateArchivePath('../secreto.txt'), false);
  assert.equal(validateArchivePath('src/../../secreto.txt'), false);
  assert.equal(validateArchivePath('C:/Windows/system.ini'), false);
  assert.equal(validateArchivePath('/etc/passwd'), false);
});

test('detecta secretos y patrones inseguros sin guardar el valor sensible', () => {
  const source = [
    'const api_key = "super-secret-value-123456";',
    'const output = eval(userInput);',
    'export const View = () => <div dangerouslySetInnerHTML={{__html: value}} />;',
  ].join('\n');
  const findings = analyzeTextFile('frontend/src/App.tsx', source);
  assert.deepEqual(findings.map((item) => item.category).sort(), ['code', 'code', 'secret']);
  assert.equal(JSON.stringify(findings).includes('super-secret-value-123456'), false);
  assert.deepEqual(findings.map((item) => item.evidence.line), [1, 2, 3]);
});

test('extrae versiones fijadas desde package-lock y requirements', () => {
  const npm = parseDependencies('package-lock.json', JSON.stringify({
    packages: { '': { version: '1.0.0' }, 'node_modules/react': { version: '19.1.0' } },
  }));
  const python = parseDependencies('requirements-prod.txt', 'Django==5.1.2\nrequests>=2.0\n');
  assert.deepEqual(npm, [{ ecosystem: 'npm', name: 'react', version: '19.1.0', manifest: 'package-lock.json' }]);
  assert.deepEqual(python, [{ ecosystem: 'PyPI', name: 'Django', version: '5.1.2', manifest: 'requirements-prod.txt' }]);
});

test('extrae dependencias Python fijadas desde uv.lock', () => {
  const dependencies = parseDependencies('uv.lock', [
    '[[package]]',
    'name = "fastapi"',
    'version = "0.115.2"',
    '[[package]]',
    'name = "asyncpg"',
    'version = "0.30.0"',
  ].join('\n'));
  assert.deepEqual(dependencies, [
    { ecosystem: 'PyPI', name: 'fastapi', version: '0.115.2', manifest: 'uv.lock' },
    { ecosystem: 'PyPI', name: 'asyncpg', version: '0.30.0', manifest: 'uv.lock' },
  ]);
});

test('conserva fixtures y migraciones como evidencia sin afectar el puntaje', () => {
  const fixture = analyzeTextFile('backend/tests/test_auth.py', 'password = "test-password-value"');
  const migration = analyzeTextFile('backend/alembic/versions/001_init.py', 'op.execute(f"ALTER ROLE {role} LOGIN")');
  assert.equal(fixture[0]?.severity, 'INFORMATIONAL');
  assert.equal(fixture[0]?.evidence.scoreExcluded, true);
  assert.equal(migration[0]?.severity, 'INFORMATIONAL');
  assert.equal(migration[0]?.evidence.scoreExcluded, true);
});

test('clasifica un .env poblado como exposición crítica sin conservar valores', () => {
  const findings = analyzeTextFile('backend/.env', 'SECRET_KEY=real-secret-material\nDATABASE_URL=postgresql://user:password@db/app');
  assert.equal(findings[0]?.severity, 'CRITICAL');
  assert.deepEqual(findings[0]?.evidence.populatedSensitiveKeys, ['SECRET_KEY', 'DATABASE_URL']);
  assert.equal(JSON.stringify(findings).includes('real-secret-material'), false);
  assert.equal(JSON.stringify(findings).includes('user:password'), false);
});
