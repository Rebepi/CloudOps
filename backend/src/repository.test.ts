import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyRepository } from './repository.js';

test('verifyRepository valida proveedor no soportado', async () => {
  await assert.rejects(
    async () => {
      await verifyRepository({ provider: 'bitbucket', owner: 'org', name: 'repo' }, '');
    },
    { message: 'Proveedor de repositorio no admitido.' }
  );
});

test('verifyRepository valida caracteres en owner y name', async () => {
  await assert.rejects(
    async () => {
      await verifyRepository({ provider: 'github', owner: 'bad/owner', name: 'repo' }, '');
    },
    { message: 'Propietario o nombre de repositorio inválido.' }
  );
});
