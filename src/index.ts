#!/usr/bin/env node
import { join } from 'node:path';
import { config, validateRuntimeConfig } from './config.js';
import { EncryptionService, NoopEncryption, type Encryption } from './db/encryption.js';
import { Repository } from './db/repository.js';
import { logger } from './logger.js';
import { TokenBucket } from './security/rate-limit.js';
import { ContactWhitelist } from './security/whitelist.js';
import { createMcpServer } from './server.js';
import type { ToolContext } from './tools/context.js';
import { startHttp } from './transport/http.js';
import { startStdio } from './transport/stdio.js';
import { WhatsAppClient } from './whatsapp/client.js';
import { wireEvents } from './whatsapp/events.js';

async function main(): Promise<void> {
  validateRuntimeConfig(config);

  const encryption: Encryption = config.dataEncryptionKey
    ? new EncryptionService(config.dataEncryptionKey)
    : new NoopEncryption();

  if (!config.dataEncryptionKey) {
    logger.warn(
      '[main] DATA_ENCRYPTION_KEY nao definida. Mensagens salvas em texto puro. Defina para producao.',
    );
  }

  const repo = new Repository(join(config.dataDir, 'carteiro.db'), encryption);
  const client = new WhatsAppClient();
  wireEvents(client, repo);

  const ctx: ToolContext = {
    client,
    repo,
    rateLimit: new TokenBucket(config.rateLimitSendPerMin),
    whitelist: new ContactWhitelist(config.allowedContacts),
  };

  void client.start().catch((err) => logger.error({ err }, '[main] WhatsApp start falhou'));

  if (config.messageRetentionDays > 0) {
    setInterval(
      () => {
        const purged = repo.purgeOldMessages(config.messageRetentionDays);
        if (purged > 0) logger.info({ purged }, '[main] mensagens antigas removidas');
      },
      6 * 60 * 60 * 1000,
    );
  }

  const startTransports: Array<Promise<void>> = [];

  if (config.transport === 'stdio' || config.transport === 'both') {
    const server = createMcpServer(ctx);
    startTransports.push(startStdio(server));
  }

  if (config.transport === 'http' || config.transport === 'both') {
    startTransports.push(startHttp(() => createMcpServer(ctx), client));
  }

  await Promise.all(startTransports);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, '[main] shutdown');
    try {
      await client.destroy();
      repo.close();
    } catch (err) {
      logger.warn({ err }, '[main] erro no shutdown');
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err: err instanceof Error ? err.message : err, stack: err?.stack }, '[main] fatal');
  process.exit(1);
});
