import { z } from 'zod';

const EnvSchema = z.object({
  BOCHA_API_KEY: z.string().default(''),
  ZHIPU_API_KEY: z.string().default(''),
  DEEPSEEK_API_KEY: z.string().default(''),
  DEEPSEEK_MODEL: z.string().default('deepseek-chat'),
  QWEN_MODEL: z.string().default('qwen-plus'),
  SEARCH_MODE: z.enum(['bocha', 'zhipu', 'ab']).default('bocha'),
  SCARCITY_THRESHOLD: z.coerce.number().default(3),
  REPORT_MAX_SOURCES: z.coerce.number().default(12),
  FETCH_CONCURRENCY: z.coerce.number().default(4),
  TIANDITU_KEY_SERVER: z.string().default(''),
  TIANDITU_KEY_BROWSER: z.string().default(''),
  DB_PATH: z.string().default('data/shidi.db'),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  return EnvSchema.parse(env);
}

export const config = loadConfig();
