import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  // Direct (non-pooled) Postgres connection, used only by Prisma Migrate. Not
  // needed to run the server, so it's optional here.
  DIRECT_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Base URL of the API, used to build supplier confirmation links in emails.
  APP_BASE_URL: z.string().default('http://localhost:4000'),

  // Email. If SMTP_HOST is set, real emails send via SMTP. Otherwise preview mode:
  // MAIL_TRANSPORT=ethereal (default) captures to a test inbox with a preview URL;
  // MAIL_TRANSPORT=json builds the message offline (no network) and logs it.
  MAIL_FROM: z.string().default('"ILA Orders" <orders@ila.local>'),
  MAIL_TRANSPORT: z.enum(['ethereal', 'json']).default('ethereal'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

/** Allowed CORS origins as an array. */
export const corsOrigins = env.CORS_ORIGIN.split(',').map((s) => s.trim());
