import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { logger } from '../logger.js';
import type { Encryption } from './encryption.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ChatRow {
  jid: string;
  name: string | null;
  is_group: number;
  last_message_ts: number | null;
  unread_count: number;
  archived: number;
  pinned: number;
  metadata_json: string | null;
  created_at: number;
  updated_at: number;
}

export interface ContactRow {
  jid: string;
  name: string | null;
  notify_name: string | null;
  phone: string | null;
  is_business: number;
  metadata_json: string | null;
  updated_at: number;
}

export interface MessageRow {
  id: string;
  chat_jid: string;
  sender_jid: string | null;
  from_me: number;
  ts: number;
  type: string;
  body_encrypted: string | null;
  quoted_id: string | null;
  media_path: string | null;
  metadata_json: string | null;
  status: string | null;
  created_at: number;
}

export interface MessageView extends Omit<MessageRow, 'body_encrypted'> {
  body: string | null;
}

function applySchema(db: Database.Database, sql: string): void {
  const fn = (db as unknown as { exec: (s: string) => void }).exec.bind(db);
  fn(sql);
}

export class Repository {
  private readonly db: Database.Database;

  constructor(
    dbPath: string,
    private readonly encryption: Encryption,
  ) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.runMigrations();
  }

  private runMigrations(): void {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');
    applySchema(this.db, schema);
    logger.debug('[db] schema aplicada');
  }

  upsertChat(chat: {
    jid: string;
    name?: string | null;
    isGroup?: boolean;
    lastMessageTs?: number | null;
    unreadCount?: number;
    archived?: boolean;
    pinned?: boolean;
    metadata?: unknown;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO chats (jid, name, is_group, last_message_ts, unread_count, archived, pinned, metadata_json, updated_at)
      VALUES (@jid, @name, @is_group, @last_message_ts, @unread_count, @archived, @pinned, @metadata_json, @updated_at)
      ON CONFLICT(jid) DO UPDATE SET
        name = COALESCE(excluded.name, chats.name),
        is_group = excluded.is_group,
        last_message_ts = COALESCE(excluded.last_message_ts, chats.last_message_ts),
        unread_count = excluded.unread_count,
        archived = excluded.archived,
        pinned = excluded.pinned,
        metadata_json = COALESCE(excluded.metadata_json, chats.metadata_json),
        updated_at = excluded.updated_at
    `);
    stmt.run({
      jid: chat.jid,
      name: chat.name ?? null,
      is_group: chat.isGroup ? 1 : 0,
      last_message_ts: chat.lastMessageTs ?? null,
      unread_count: chat.unreadCount ?? 0,
      archived: chat.archived ? 1 : 0,
      pinned: chat.pinned ? 1 : 0,
      metadata_json: chat.metadata ? JSON.stringify(chat.metadata) : null,
      updated_at: Date.now(),
    });
  }

  listChats(opts: { limit?: number; cursor?: number; query?: string }): ChatRow[] {
    const limit = Math.min(opts.limit ?? 50, 200);
    const cursor = opts.cursor ?? Number.MAX_SAFE_INTEGER;
    if (opts.query) {
      const stmt = this.db.prepare(`
        SELECT * FROM chats
        WHERE (name LIKE @q OR jid LIKE @q)
          AND last_message_ts < @cursor
        ORDER BY last_message_ts DESC NULLS LAST
        LIMIT @limit
      `);
      return stmt.all({ q: `%${opts.query}%`, cursor, limit }) as ChatRow[];
    }
    const stmt = this.db.prepare(`
      SELECT * FROM chats
      WHERE last_message_ts < @cursor
      ORDER BY last_message_ts DESC NULLS LAST
      LIMIT @limit
    `);
    return stmt.all({ cursor, limit }) as ChatRow[];
  }

  getChat(jid: string): ChatRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM chats WHERE jid = ?');
    return stmt.get(jid) as ChatRow | undefined;
  }

  upsertContact(contact: {
    jid: string;
    name?: string | null;
    notifyName?: string | null;
    phone?: string | null;
    isBusiness?: boolean;
    metadata?: unknown;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO contacts (jid, name, notify_name, phone, is_business, metadata_json, updated_at)
      VALUES (@jid, @name, @notify_name, @phone, @is_business, @metadata_json, @updated_at)
      ON CONFLICT(jid) DO UPDATE SET
        name = COALESCE(excluded.name, contacts.name),
        notify_name = COALESCE(excluded.notify_name, contacts.notify_name),
        phone = COALESCE(excluded.phone, contacts.phone),
        is_business = excluded.is_business,
        metadata_json = COALESCE(excluded.metadata_json, contacts.metadata_json),
        updated_at = excluded.updated_at
    `);
    stmt.run({
      jid: contact.jid,
      name: contact.name ?? null,
      notify_name: contact.notifyName ?? null,
      phone: contact.phone ?? null,
      is_business: contact.isBusiness ? 1 : 0,
      metadata_json: contact.metadata ? JSON.stringify(contact.metadata) : null,
      updated_at: Date.now(),
    });
  }

  searchContacts(query: string, limit = 20): ContactRow[] {
    const q = `%${query}%`;
    const stmt = this.db.prepare(`
      SELECT * FROM contacts
      WHERE name LIKE @q OR notify_name LIKE @q OR phone LIKE @q OR jid LIKE @q
      ORDER BY updated_at DESC
      LIMIT @limit
    `);
    return stmt.all({ q, limit }) as ContactRow[];
  }

  insertMessage(msg: {
    id: string;
    chatJid: string;
    senderJid?: string | null;
    fromMe: boolean;
    ts: number;
    type: string;
    body?: string | null;
    quotedId?: string | null;
    mediaPath?: string | null;
    metadata?: unknown;
    status?: string | null;
  }): void {
    const bodyEnc = msg.body ? this.encryption.encrypt(msg.body) : null;
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages
        (id, chat_jid, sender_jid, from_me, ts, type, body_encrypted, quoted_id, media_path, metadata_json, status)
      VALUES (@id, @chat_jid, @sender_jid, @from_me, @ts, @type, @body, @quoted_id, @media_path, @metadata, @status)
    `);
    stmt.run({
      id: msg.id,
      chat_jid: msg.chatJid,
      sender_jid: msg.senderJid ?? null,
      from_me: msg.fromMe ? 1 : 0,
      ts: msg.ts,
      type: msg.type,
      body: bodyEnc,
      quoted_id: msg.quotedId ?? null,
      media_path: msg.mediaPath ?? null,
      metadata: msg.metadata ? JSON.stringify(msg.metadata) : null,
      status: msg.status ?? null,
    });
  }

  listMessages(opts: {
    chatJid: string;
    limit?: number;
    before?: number;
  }): MessageView[] {
    const limit = Math.min(opts.limit ?? 50, 500);
    const before = opts.before ?? Number.MAX_SAFE_INTEGER;
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE chat_jid = @chat_jid AND ts < @before
      ORDER BY ts DESC
      LIMIT @limit
    `);
    const rows = stmt.all({ chat_jid: opts.chatJid, before, limit }) as MessageRow[];
    return rows.map((r) => this.toView(r));
  }

  getMessageContext(messageId: string, around = 5): MessageView[] {
    const target = this.db
      .prepare('SELECT * FROM messages WHERE id = ?')
      .get(messageId) as MessageRow | undefined;
    if (!target) return [];
    const before = this.db
      .prepare(
        'SELECT * FROM messages WHERE chat_jid = ? AND ts < ? ORDER BY ts DESC LIMIT ?',
      )
      .all(target.chat_jid, target.ts, around) as MessageRow[];
    const after = this.db
      .prepare('SELECT * FROM messages WHERE chat_jid = ? AND ts > ? ORDER BY ts ASC LIMIT ?')
      .all(target.chat_jid, target.ts, around) as MessageRow[];
    return [...before.reverse(), target, ...after].map((r) => this.toView(r));
  }

  private toView(r: MessageRow): MessageView {
    const { body_encrypted, ...rest } = r;
    let body: string | null = null;
    if (body_encrypted) {
      try {
        body = this.encryption.decrypt(body_encrypted);
      } catch (err) {
        logger.warn({ err, id: r.id }, '[db] falha ao decriptar mensagem');
        body = '[encrypted: decryption failed]';
      }
    }
    return { ...rest, body };
  }

  recordAudit(entry: {
    toolName: string;
    caller?: string;
    paramsHash?: string;
    result: 'ok' | 'error';
    errorMessage?: string;
    durationMs: number;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO audit_log (tool_name, caller, params_hash, result, error_message, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      entry.toolName,
      entry.caller ?? null,
      entry.paramsHash ?? null,
      entry.result,
      entry.errorMessage ?? null,
      entry.durationMs,
    );
  }

  purgeOldMessages(retentionDays: number): number {
    if (retentionDays <= 0) return 0;
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const result = this.db.prepare('DELETE FROM messages WHERE ts < ?').run(cutoff);
    return result.changes;
  }

  close(): void {
    this.db.close();
  }
}
