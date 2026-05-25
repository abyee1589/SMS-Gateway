import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number(),

  DB_HOST: z.string(),
  DB_PORT: z.coerce.number(),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),

  REDIS_HOST: z.string(),
  REDIS_PORT: z.coerce.number(),

  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string(),

  SMS_PROVIDER: z.string(),
  
  AT_APP_USERNAME: z.string().optional(),
  AT_APP_API_KEY: z.string().optional(),
  AT_SENDER_ID: z.string().optional(),
  AT_ENV: z.string().optional(),

  ZERGAW_SMS_URL: z.string().optional(),
  ZERGAW_SMS_USERNAME: z.string().optional(),
  ZERGAW_SMS_PASSWORD: z.string().optional(),

  SMS_WEBHOOK_SECRET: z.string(),
});

export const validateEnv = (config: Record<string, unknown>) => {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');

    throw new Error(`Environment validation error: ${errors}`);
  }

  return result.data;
};