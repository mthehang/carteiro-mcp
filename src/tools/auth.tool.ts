import { z } from 'zod';
import { withAudit } from '../security/audit.js';
import type { ToolContext } from './context.js';

export const authenticateInput = z
  .object({
    phone: z
      .string()
      .optional()
      .describe('Numero E.164 (+5511...) para receber pairing code. Se vazio, usa QR code.'),
  })
  .strict();

export const getStatusInput = z.object({}).strict();
export const logoutInput = z.object({}).strict();

export type AuthenticateInput = z.infer<typeof authenticateInput>;

export async function authenticate(ctx: ToolContext, _input: AuthenticateInput) {
  return withAudit(ctx.repo, 'authenticate', _input, async () => {
    const status = ctx.client.getStatus();
    if (status.status === 'connected') {
      return {
        already_connected: true,
        jid: status.jid,
        push_name: status.pushName,
        message: 'Sessao ativa. Use logout antes de re-autenticar.',
      };
    }

    if (status.status !== 'connecting' && status.status !== 'qr_pending') {
      await ctx.client.start();
    }

    const qrPromise = waitFor(ctx, ['qr', 'connected', 'pairing-code'], 30_000);
    const event = await qrPromise;
    const fresh = ctx.client.getStatus();

    if (event.kind === 'connected') {
      return {
        connected: true,
        jid: fresh.jid,
        push_name: fresh.pushName,
      };
    }

    if (fresh.pairingCode) {
      return {
        method: 'pairing_code',
        pairing_code: fresh.pairingCode,
        instructions:
          'WhatsApp -> Aparelhos conectados -> Conectar um aparelho -> Conectar com numero. Digite o codigo acima.',
      };
    }

    if (fresh.qr) {
      return {
        method: 'qr_code',
        qr_data_url: fresh.qr.dataUrl,
        qr_text: fresh.qr.text,
        instructions:
          'Abra o data URL no navegador OU escaneie o QR no Admin UI. WhatsApp -> Aparelhos conectados -> Conectar um aparelho.',
      };
    }

    return {
      status: fresh.status,
      message: 'Aguardando QR/pairing. Tente novamente em alguns segundos.',
    };
  });
}

export async function getStatus(ctx: ToolContext, _input: z.infer<typeof getStatusInput>) {
  return withAudit(ctx.repo, 'get_status', _input, async () => {
    const s = ctx.client.getStatus();
    return {
      status: s.status,
      jid: s.jid,
      push_name: s.pushName,
      connected_at: s.connectedAt,
      has_pending_qr: !!s.qr,
      has_pending_pairing_code: !!s.pairingCode,
      last_error: s.lastError,
    };
  });
}

export async function logout(ctx: ToolContext, _input: z.infer<typeof logoutInput>) {
  return withAudit(ctx.repo, 'logout', _input, async () => {
    await ctx.client.logout();
    return { logged_out: true };
  });
}

function waitFor(
  ctx: ToolContext,
  events: Array<'qr' | 'connected' | 'pairing-code' | 'logged-out'>,
  timeoutMs: number,
): Promise<{ kind: typeof events[number] }> {
  return new Promise((resolve) => {
    const handlers = events.map((kind) => {
      const handler = () => {
        cleanup();
        resolve({ kind });
      };
      ctx.client.on(kind, handler);
      return { kind, handler };
    });
    const timer = setTimeout(() => {
      cleanup();
      resolve({ kind: 'qr' });
    }, timeoutMs);
    function cleanup(): void {
      clearTimeout(timer);
      for (const { kind, handler } of handlers) {
        ctx.client.off(kind, handler);
      }
    }
  });
}
