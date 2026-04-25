import { z } from 'zod';
import { withAudit } from '../security/audit.js';
import { normalizeJid } from '../whatsapp/types.js';
import type { ToolContext } from './context.js';

export const sendTextMessageInput = z
  .object({
    to: z
      .string()
      .min(1)
      .describe(
        'Destinatario: telefone E.164 (+5511...), JID (xxx@s.whatsapp.net) ou JID de grupo (xxx@g.us).',
      ),
    text: z.string().min(1).max(4096).describe('Texto da mensagem (max 4096 chars).'),
  })
  .strict();

export type SendTextMessageInput = z.infer<typeof sendTextMessageInput>;

export async function sendTextMessage(ctx: ToolContext, input: SendTextMessageInput) {
  return withAudit(ctx.repo, 'send_text_message', { to: input.to, length: input.text.length }, async () => {
    const jid = normalizeJid(input.to);
    ctx.whitelist.assertAllowed(jid);

    const rl = ctx.rateLimit.consume(`send:${jid}`);
    if (!rl.allowed) {
      throw new Error(
        `Rate limit excedido. Tente novamente em ${Math.ceil((rl.retryAfterMs ?? 0) / 1000)}s.`,
      );
    }

    const result = await ctx.client.sendText(jid, input.text);
    ctx.repo.insertMessage({
      id: result.id,
      chatJid: jid,
      senderJid: ctx.client.getStatus().jid ?? null,
      fromMe: true,
      ts: result.ts,
      type: 'text',
      body: input.text,
      status: 'sent',
    });
    return {
      sent: true,
      message_id: result.id,
      to: result.to,
      ts: result.ts,
    };
  });
}
