import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const TransportSchema = z.enum(['stdio', 'http', 'both']);

const ConfigSchema = z.object({
  transport: TransportSchema.default('stdio'),
  httpPort: z.coerce.number().int().positive().default(3000),
  adminPort: z.coerce.number().int().positive().default(3001),
  adminToken: z.string().min(16).optional(),

  dataDir: z.string().default('./data'),
  dataEncryptionKey: z.string().optional(),
  messageRetentionDays: z.coerce.number().int().nonnegative().default(90),

  waBrowserName: z.string().default('Carteiro MCP'),
  waAutoReconnect: z.coerce.boolean().default(true),
  waPhoneNumber: z.string().optional(),

  allowedContacts: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    ),
  rateLimitSendPerMin: z.coerce.number().int().positive().default(30),
  ignoreGroups: z.coerce.boolean().default(true),

  logLevel: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
    .default('info'),
  logJson: z.coerce.boolean().default(false),
});

export type Config = z.infer<typeof ConfigSchema>;

function parseEnv(): Config {
  const raw = {
    transport: process.env.TRANSPORT,
    httpPort: process.env.HTTP_PORT,
    adminPort: process.env.ADMIN_PORT,
    adminToken: process.env.ADMIN_TOKEN || undefined,

    dataDir: process.env.DATA_DIR,
    dataEncryptionKey: process.env.DATA_ENCRYPTION_KEY || undefined,
    messageRetentionDays: process.env.MESSAGE_RETENTION_DAYS,

    waBrowserName: process.env.WA_BROWSER_NAME,
    waAutoReconnect: process.env.WA_AUTO_RECONNECT,
    waPhoneNumber: process.env.WA_PHONE_NUMBER || undefined,

    allowedContacts: process.env.ALLOWED_CONTACTS,
    rateLimitSendPerMin: process.env.RATE_LIMIT_SEND_PER_MIN,
    ignoreGroups: process.env.IGNORE_GROUPS,

    logLevel: process.env.LOG_LEVEL,
    logJson: process.env.LOG_JSON,
  };

  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuracao invalida:\n${issues}`);
  }
  return parsed.data;
}

export const config: Config = parseEnv();

export function validateRuntimeConfig(cfg: Config): void {
  if (cfg.dataEncryptionKey) {
    if (!/^[0-9a-fA-F]{64}$/.test(cfg.dataEncryptionKey)) {
      throw new Error(
        'DATA_ENCRYPTION_KEY deve ter 64 caracteres hex (32 bytes). Gere com: openssl rand -hex 32',
      );
    }
  }
  if (cfg.transport !== 'stdio' && !cfg.adminToken) {
    console.warn(
      '[config] AVISO: ADMIN_TOKEN vazio. Rotas admin ficam abertas. Defina em producao.',
    );
  }
}
