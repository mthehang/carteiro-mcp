import { z } from 'zod';
import { withAudit } from '../security/audit.js';
import type { ToolContext } from './context.js';

export const listChatsInput = z
  .object({
    limit: z.number().int().positive().max(200).default(50),
    cursor: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Timestamp em ms; lista chats com last_message_ts < cursor'),
    query: z.string().optional().describe('Filtra por nome ou JID (LIKE).'),
  })
  .strict();

export const getChatInput = z
  .object({
    jid: z.string().min(1).describe('JID do chat ou grupo.'),
  })
  .strict();

export type ListChatsInput = z.infer<typeof listChatsInput>;
export type GetChatInput = z.infer<typeof getChatInput>;

export async function listChats(ctx: ToolContext, input: ListChatsInput) {
  return withAudit(ctx.repo, 'list_chats', input, async () => {
    const rows = ctx.repo.listChats(input);
    const last = rows[rows.length - 1];
    return {
      count: rows.length,
      chats: rows.map((r) => ({
        jid: r.jid,
        name: r.name,
        is_group: !!r.is_group,
        last_message_ts: r.last_message_ts,
        unread_count: r.unread_count,
        archived: !!r.archived,
        pinned: !!r.pinned,
      })),
      next_cursor: last?.last_message_ts ?? null,
    };
  });
}

export async function getChat(ctx: ToolContext, input: GetChatInput) {
  return withAudit(ctx.repo, 'get_chat', input, async () => {
    const row = ctx.repo.getChat(input.jid);
    if (!row) return { found: false, jid: input.jid };
    return {
      found: true,
      jid: row.jid,
      name: row.name,
      is_group: !!row.is_group,
      last_message_ts: row.last_message_ts,
      unread_count: row.unread_count,
      archived: !!row.archived,
      pinned: !!row.pinned,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    };
  });
}
