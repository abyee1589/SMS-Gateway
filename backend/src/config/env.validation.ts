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

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),

  SMS_USAGE_REMINDER_PERCENT: z.coerce.number().optional().default(75),
  SMS_USAGE_CRITICAL_PERCENT: z.coerce.number().optional().default(95),
  SMS_USAGE_EXHAUSTED_PERCENT: z.coerce.number().optional().default(100),
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