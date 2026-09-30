import 'dotenv/config';

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? '',
  awsProfile: process.env.AWS_PROFILE ?? 'cloudops-root',
  region: process.env.AWS_REGION ?? 'us-east-1',
  port: Number(process.env.PORT ?? 27902),
};

if (!config.databaseUrl) throw new Error('DATABASE_URL es obligatorio');
