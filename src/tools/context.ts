import type { Repository } from '../db/repository.js';
import type { TokenBucket } from '../security/rate-limit.js';
import type { ContactWhitelist } from '../security/whitelist.js';
import type { WhatsAppClient } from '../whatsapp/client.js';

export interface ToolContext {
  client: WhatsAppClient;
  repo: Repository;
  rateLimit: TokenBucket;
  whitelist: ContactWhitelist;
}
