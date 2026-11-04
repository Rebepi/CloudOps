import test from 'node:test';
import assert from 'node:assert/strict';
import { architectureEvidenceKind } from './architectureEvidence.js';

test('a framework mention in scanner strings or documentation is only a reference', () => {
  assert.equal(architectureEvidenceKind('backend/src/scanner.ts', 'const patterns = ["fastapi", "django"];', 'fastapi'), 'reference');
  assert.equal(architectureEvidenceKind('README.md', 'from fastapi import FastAPI', 'fastapi'), 'reference');
  assert.equal(architectureEvidenceKind('package.json', JSON.stringify({ description: 'react vue fastify' }), 'react'), 'reference');
});
test('classifies package declarations and explicit imports without retaining source text', () => {
  assert.equal(architectureEvidenceKind('frontend/package.json', JSON.stringify({ dependencies: { react: '^19.0.0' } }), 'react'), 'manifest');
  assert.equal(architectureEvidenceKind('backend/requirements.txt', 'fastapi==0.115.0', 'fastapi'), 'manifest');
  assert.equal(architectureEvidenceKind('backend/uv.lock', '[[package]]\nname = "fastapi"\nversion = "0.115.0"', 'fastapi'), 'manifest');
  assert.equal(architectureEvidenceKind('backend/main.py', 'from fastapi import FastAPI', 'fastapi'), 'source');
  assert.equal(architectureEvidenceKind('frontend/src/App.tsx', 'import React from "react";', 'react'), 'source');
  assert.equal(architectureEvidenceKind('compose.yaml', 'services:\n  db:\n    image: postgres:17', 'compose'), 'configuration');
});
