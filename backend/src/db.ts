import pg from 'pg';
import { config } from './config.js';

export const db = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<{ data: T; observedAt: string; cached: boolean }> {
  const found = await db.query<{ payload: T; fetched_at: Date }>(
    'SELECT payload, fetched_at FROM aws_cache WHERE key = $1 AND expires_at > now()', [key]
  );
  if (found.rows[0]) return { data: found.rows[0].payload, observedAt: found.rows[0].fetched_at.toISOString(), cached: true };
  const data = await load();
  const observedAt = new Date().toISOString();
  await db.query(
    `INSERT INTO aws_cache(key,payload,fetched_at,expires_at) VALUES($1,$2,$3,$4)
     ON CONFLICT(key) DO UPDATE SET payload=EXCLUDED.payload,fetched_at=EXCLUDED.fetched_at,expires_at=EXCLUDED.expires_at`,
    [key, JSON.stringify(data), observedAt, new Date(Date.now() + ttlMs)]
  );
  return { data, observedAt, cached: false };
}
