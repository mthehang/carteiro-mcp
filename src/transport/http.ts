import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import express, { type Request, type Response } from 'express';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { mountAdminRoutes } from '../admin/routes.js';
import type { WhatsAppClient } from '../whatsapp/client.js';

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: Server;
}

export async function startHttp(
  serverFactory: () => Server,
  client: WhatsAppClient,
): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  const sessions = new Map<string, SessionEntry>();

  app.post('/mcp', async (req: Request, res: Response) => {
    const headerSession = req.header('mcp-session-id');
    let sessionId: string = headerSession ?? randomUUID();
    let entry = sessions.get(sessionId);

    if (!entry) {
      const fixedId = sessionId;
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => fixedId,
      });
      const server = serverFactory();
      await server.connect(transport);
      entry = { transport, server };
      sessions.set(sessionId, entry);
      logger.info({ sessionId }, '[http] nova sessao MCP');
    }

    res.setHeader('mcp-session-id', sessionId);
    await entry.transport.handleRequest(req, res, req.body);
  });

  app.get('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.header('mcp-session-id');
    const entry = sessionId ? sessions.get(sessionId) : undefined;
    if (!entry) {
      res.status(400).json({ error: 'mcp-session-id header missing or unknown' });
      return;
    }
    await entry.transport.handleRequest(req, res);
  });

  app.delete('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.header('mcp-session-id');
    if (sessionId && sessions.has(sessionId)) {
      const entry = sessions.get(sessionId)!;
      await entry.transport.close();
      sessions.delete(sessionId);
      logger.info({ sessionId }, '[http] sessao encerrada');
    }
    res.status(204).end();
  });

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', whatsapp: client.getStatus().status });
  });

  mountAdminRoutes(app, client);

  app.listen(config.httpPort, () => {
    logger.info({ port: config.httpPort }, '[http] MCP server escutando em /mcp');
    logger.info(
      { port: config.httpPort, url: `http://localhost:${config.httpPort}/admin` },
      '[http] Admin UI em /admin',
    );
  });
}
