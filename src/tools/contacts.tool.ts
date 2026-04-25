import { z } from 'zod';
import { withAudit } from '../security/audit.js';
import type { ToolContext } from './context.js';

export const searchContactsInput = z
  .object({
    query: z.string().min(1).max(100).describe('Trecho do nome ou telefone (busca LIKE).'),
    limit: z.number().int().positive().max(100).default(20),
  })
  .strict();

export type SearchContactsInput = z.infer<typeof searchContactsInput>;

export async function searchContacts(ctx: ToolContext, input: SearchContactsInput) {
  return withAudit(ctx.repo, 'search_contacts', input, async () => {
    const rows = ctx.repo.searchContacts(input.query, input.limit);
    return {
      count: rows.length,
      contacts: rows.map((r) => ({
        jid: r.jid,
        name: r.name,
        notify_name: r.notify_name,
        phone: r.phone,
        is_business: !!r.is_business,
      })),
    };
  });
}
