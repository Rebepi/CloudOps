export type ArchitectureEvidenceKind = 'manifest' | 'configuration' | 'source' | 'reference';
const packages: Record<string, string[]> = {
  react: ['react'], vue: ['vue', '@vue/core'], angular: ['@angular/core'], fastapi: ['fastapi'], fastify: ['fastify'], express: ['express'], django: ['django'],
  postgresql: ['pg', 'asyncpg', 'psycopg', 'psycopg2'], mongodb: ['mongoose', 'pymongo', 'mongodb'], redis: ['redis', 'ioredis'],
  'token-auth': ['jwt', 'jose', 'pyjwt', 'jsonwebtoken', 'python-jose'], telemetry: ['opentelemetry', 'prometheus_client', '@opentelemetry/api', '@sentry/node'],
  worker: ['celery', 'rq', 'bullmq', 'sidekiq'], email: ['nodemailer', 'sendgrid', '@sendgrid/mail'],
};
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function architectureEvidenceKind(path: string, text: string, id: string): ArchitectureEvidenceKind {
  const normalized = path.replace(/\\/g, '/').toLowerCase();
  const base = normalized.split('/').pop()!;
  const names = packages[id] ?? [];
  if (base === 'package.json') {
    try {
      const data = JSON.parse(text);
      if (names.some((name) => ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].some((key) => Object.hasOwn(data[key] ?? {}, name)))) return 'manifest';
    } catch { /* Invalid declaration remains an unverified reference. */ }
  }
  if (/^(?:requirements.*\.txt|pyproject\.toml|poetry\.lock|uv\.lock|pipfile(?:\.lock)?|composer\.(?:json|lock)|package-lock\.json|gemfile(?:\.lock)?)$/.test(base)) {
    if (names.some((name) => new RegExp(`^\\s*(?:["']?${escape(name)}["']?\\s*(?:[:=<>~!\\[]|$)|name\\s*=\\s*["']${escape(name)}["'])`, 'im').test(text))) return 'manifest';
  }
  if (/\.(?:[cm]?[jt]sx?|py|php|rb)$/.test(base)) {
    if (names.some((name) => new RegExp(`^\\s*(?:from\\s+${escape(name)}(?:\\.[\\w.]+)?\\s+import\\b|import\\s+${escape(name)}(?:\\s|$)|import\\b[^;\\n]*?\\bfrom\\s*["']${escape(name)}(?:/[^"']*)?["']|import\\s*["']${escape(name)}["']|(?:const|let|var)\\s+[^=;\\n]+?=\\s*require\\(["']${escape(name)}["']\\))`, 'm').test(text))) return 'source';
  }
  if (base === 'dockerfile' || /^(?:docker-)?compose(?:\.[^.]+)?\.ya?ml$/.test(base) || /\.(?:tf|tfvars)$/.test(base) || /(?:^|\/)\.github\/workflows\//.test(normalized) || base === '.gitlab-ci.yml' || /^nginx.*\.conf$/.test(base) || /^\.env(?:\.|$)/.test(base)) return 'configuration';
  return 'reference';
}
