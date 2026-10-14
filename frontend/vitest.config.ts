import { fileURLToPath } from 'node:url';

// Reuse the container's installed test runner; production dependencies are unchanged.
export default {
  resolve: { alias: { vitest: fileURLToPath(new URL('../../frontend/node_modules/vitest/dist/index.js', import.meta.url)) } },
  test: { environment: 'jsdom', include: ['tests/**/*.test.tsx'] },
};
