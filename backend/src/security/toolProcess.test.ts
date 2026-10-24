import test from 'node:test';
import assert from 'node:assert/strict';
import { executeTool } from './toolProcess.js';

test('el runner descarta stderr sensible incluso cuando falla un proceso real', async () => {
  await assert.rejects(executeTool(process.execPath, ['-e', 'process.stderr.write("secret-value-hidden"); process.exit(2)'], 3000, 'Tool'),
    (error: unknown) => error instanceof Error && error.message.includes('código 2') && !error.message.includes('secret-value-hidden'));
});

test('el runner detiene un proceso propio al agotar su plazo', async () => {
  const started = performance.now();
  await assert.rejects(executeTool(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], 200, 'Tool'), /presupuesto/);
  assert.ok(performance.now() - started < 5000);
});

test('la captura conserva caracteres UTF-8 divididos entre chunks', async () => {
  const output = await executeTool(process.execPath, ['-e', 'process.stdout.write(Buffer.from([226])); setTimeout(() => process.stdout.write(Buffer.from([130,172])), 20)'], 3000, 'Tool');
  assert.equal(output, '€');
});
