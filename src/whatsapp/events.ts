import type { WAMessage, Contact as BaileysContact } from '@whiskeysockets/baileys';
import { config } from '../config.js';
import type { Repository } from '../db/repository.js';
import { logger } from '../logger.js';
import type { WhatsAppClient } from './client.js';
import { isGroupJid, jidToPhone } from './types.js';

function extractText(msg: WAMessage): string | null {
  const m = msg.message;
  if (!m) return null;
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    null
  );
}

function extractType(msg: WAMessage): string {
  const m = msg.message;
  if (!m) return 'unknown';
  if (m.conversation || m.extendedTextMessage) return 'text';
  if (m.imageMessage) return 'image';
  if (m.videoMessage) return 'video';
  if (m.audioMessage) return 'audio';
  if (m.documentMessage) return 'document';
  if (m.stickerMessage) return 'sticker';
  if (m.locationMessage) return 'location';
  if (m.contactMessage) return 'contact';
  if (m.reactionMessage) return 'reaction';
  return 'unknown';
}

export function wireEvents(client: WhatsAppClient, repo: Repository): void {
  client.on('message', ({ msg }: { msg: WAMessage; type: string }) => {
    try {
      if (!msg.key?.id || !msg.key.remoteJid) return;
      if (config.ignoreGroups && isGroupJid(msg.key.remoteJid)) return;
      const ts =
        typeof msg.messageTimestamp === 'number'
          ? msg.messageTimestamp * 1000
          : Date.now();
      repo.upsertChat({
        jid: msg.key.remoteJid,
        isGroup: isGroupJid(msg.key.remoteJid),
        lastMessageTs: ts,
      });
      repo.insertMessage({
        id: msg.key.id,
        chatJid: msg.key.remoteJid,
        senderJid: msg.key.participant ?? (msg.key.fromMe ? client.getStatus().jid : msg.key.remoteJid) ?? null,
        fromMe: !!msg.key.fromMe,
        ts,
        type: extractType(msg),
        body: extractText(msg),
        status: msg.status ? String(msg.status) : null,
      });
    } catch (err) {
      logger.warn({ err }, '[events] erro ao processar mensagem recebida');
    }
  });

  client.on('contact', (c: BaileysContact) => {
    try {
      if (!c.id) return;
      repo.upsertContact({
        jid: c.id,
        name: c.name ?? null,
        notifyName: c.notify ?? null,
        phone: jidToPhone(c.id),
      });
    } catch (err) {
      logger.warn({ err }, '[events] erro ao processar contato');
    }
  });

  client.on('chat', (c: { id?: string; name?: string | null; unreadCount?: number; archived?: boolean; pinned?: number | null | undefined }) => {
    try {
      if (!c.id) return;
      if (config.ignoreGroups && isGroupJid(c.id)) return;
      repo.upsertChat({
        jid: c.id,
        name: c.name ?? null,
        isGroup: isGroupJid(c.id),
        unreadCount: c.unreadCount ?? 0,
        archived: !!c.archived,
        pinned: !!c.pinned,
      });
    } catch (err) {
      logger.warn({ err }, '[events] erro ao processar chat');
    }
  });
}
