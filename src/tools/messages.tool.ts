import { z } from 'zod';
import { withAudit } from '../security/audit.js';
import type { ToolContext } from './context.js';

export const listMessagesInput = z
  .object({
    chat_jid: z.string().min(1),
    limit: z.number().int().positive().max(500).default(50),
    before: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Timestamp em ms; retorna mensagens com ts < before'),
  })
  .strict();

export const getMessageContextInput = z
  .object({
    message_id: z.string().min(1),
    around: z.number().int().nonnegative().max(50).default(5),
  })
  .strict();

export type ListMessagesInput = z.infer<typeof listMessagesInput>;
export type GetMessageContextInput = z.infer<typeof getMessageContextInput>;

export async function listMessages(ctx: ToolContext, input: ListMessagesInput) {
  return withAudit(ctx.repo, 'list_messages', input, async () => {
    const rows = ctx.repo.listMessages({
      chatJid: input.chat_jid,
      limit: input.limit,
      before: input.before,
    });
    const last = rows[rows.length - 1];
    return {
      count: rows.length,
      messages: rows.map((r) => ({
        id: r.id,
        chat_jid: r.chat_jid,
        sender_jid: r.sender_jid,
        from_me: !!r.from_me,
        ts: r.ts,
        type: r.type,
        body: r.body,
        quoted_id: r.quoted_id,
        media_path: r.media_path,
        status: r.status,
      })),
      next_before: last?.ts ?? null,
    };
  });
}

export async function getMessageContext(ctx: ToolContext, input: GetMessageContextInput) {
  return withAudit(ctx.repo, 'get_message_context', input, async () => {
    const rows = ctx.repo.getMessageContext(input.message_id, input.around);
    return {
      count: rows.length,
      messages: rows.map((r) => ({
        id: r.id,
        chat_jid: r.chat_jid,
        sender_jid: r.sender_jid,
        from_me: !!r.from_me,
        ts: r.ts,
        type: r.type,
        body: r.body,
        is_target: r.id === input.message_id,
      })),
    };
  });
}
