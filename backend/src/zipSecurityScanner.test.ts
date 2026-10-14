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
