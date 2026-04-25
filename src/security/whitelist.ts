import { isGroupJid, jidToPhone } from '../whatsapp/types.js';

export class ContactWhitelist {
  private readonly enabled: boolean;
  private readonly phones: Set<string>;

  constructor(allowed: string[]) {
    this.enabled = allowed.length > 0;
    this.phones = new Set(
      allowed.map((p) => p.trim()).filter(Boolean).map(this.normalizePhone),
    );
  }

  private normalizePhone(p: string): string {
    return p.replace(/\D/g, '');
  }

  isAllowed(jid: string): boolean {
    if (!this.enabled) return true;
    if (isGroupJid(jid)) return false;
    const phone = jidToPhone(jid);
    if (!phone) return false;
    return this.phones.has(this.normalizePhone(phone));
  }

  assertAllowed(jid: string): void {
    if (!this.isAllowed(jid)) {
      throw new Error(
        `Destinatario ${jid} nao esta na whitelist (ALLOWED_CONTACTS). Adicione no .env ou desative a whitelist.`,
      );
    }
  }
}
