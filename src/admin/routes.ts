import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Express, Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type { WhatsAppClient } from '../whatsapp/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  if (!config.adminToken) {
    next();
    return;
  }
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (token !== config.adminToken) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

export function mountAdminRoutes(app: Express, client: WhatsAppClient): void {
  const uiHtml = readFileSync(join(__dirname, 'ui.html'), 'utf8');

  app.get('/admin', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(uiHtml);
  });

  app.get('/admin/status', requireAdminToken, (_req, res) => {
    const s = client.getStatus();
    res.json({
      status: s.status,
      jid: s.jid,
      push_name: s.pushName,
      qr_data_url: s.qr?.dataUrl,
      pairing_code: s.pairingCode,
      connected_at: s.connectedAt,
      last_error: s.lastError,
    });
  });

  app.post('/admin/authenticate', requireAdminToken, async (_req, res) => {
    try {
      const status = client.getStatus();
      if (status.status !== 'connecting' && status.status !== 'qr_pending') {
        await client.start();
      }
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message }, '[admin] authenticate falhou');
      res.status(500).json({ error: message });
    }
  });

  app.post('/admin/logout', requireAdminToken, async (_req, res) => {
    try {
      await client.logout();
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });
}
