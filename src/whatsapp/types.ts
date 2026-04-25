export type ConnectionStatus = 'disconnected' | 'connecting' | 'qr_pending' | 'connected' | 'logged_out';

export interface ClientStatus {
  status: ConnectionStatus;
  jid?: string;
  pushName?: string;
  qr?: {
    text: string;
    dataUrl: string;
  };
  pairingCode?: string;
  lastError?: string;
  connectedAt?: number;
}

export interface SendTextResult {
  id: string;
  to: string;
  ts: number;
}

export interface SendMediaResult extends SendTextResult {
  mediaType: 'image' | 'video' | 'audio' | 'document';
}

export function normalizeJid(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes('@')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) throw new Error(`JID/numero invalido: "${input}"`);
  return `${digits}@s.whatsapp.net`;
}

export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us');
}

export function jidToPhone(jid: string): string | null {
  if (isGroupJid(jid)) return null;
  const m = jid.match(/^(\d+)@/);
  return m ? `+${m[1]}` : null;
}
