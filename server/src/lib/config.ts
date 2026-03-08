import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve .env relative to this file's location (server/src/lib/config.ts),
// not process.cwd() — which varies depending on how npm scripts are invoked.
// Three levels up: lib/ → src/ → server/ → monorepo root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const envSchema = z
  .object({
    ANTHROPIC_API_KEY: z.string().min(1),
    SUPABASE_URL: z.string().url(), // Changed to .string().url() for better compatibility
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    NARA_API_KEY: z.string().min(1),
    REPLICATE_API_KEY: z.string().min(1),
    CLIP_MODEL_VERSION: z.string().min(1),
    PORT: z.coerce.number().int().positive().default(3001),
    CLIENT_ORIGIN: z.string().url(),
  })
  .transform((env) => ({
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    supabaseUrl: env.SUPABASE_URL,
    supabaseAnonKey: env.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    naraApiKey: env.NARA_API_KEY,
    replicateApiKey: env.REPLICATE_API_KEY,
    clipModelVersion: env.CLIP_MODEL_VERSION,
    port: env.PORT,
    clientOrigin: env.CLIENT_ORIGIN,
  }));

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const missing = result.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  // eslint-disable-next-line no-console
  console.error(
    `\n[config] Server startup failed — missing or invalid environment variables:\n${missing}\n\nCopy .env.example to .env and fill in the required values.\n`,
  );
  process.exit(1);
}

export const config = result.data;