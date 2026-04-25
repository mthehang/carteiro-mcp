import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { logger } from './logger.js';
import {
  authenticate,
  authenticateInput,
  getStatus,
  getStatusInput,
  logout,
  logoutInput,
} from './tools/auth.tool.js';
import { getChat, getChatInput, listChats, listChatsInput } from './tools/chats.tool.js';
import { searchContacts, searchContactsInput } from './tools/contacts.tool.js';
import type { ToolContext } from './tools/context.js';
import {
  getMessageContext,
  getMessageContextInput,
  listMessages,
  listMessagesInput,
} from './tools/messages.tool.js';
import { sendTextMessage, sendTextMessageInput } from './tools/messaging.tool.js';

interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  handler: (ctx: ToolContext, input: unknown) => Promise<unknown>;
}

function tool<I extends z.ZodTypeAny>(def: {
  name: string;
  description: string;
  schema: I;
  handler: (ctx: ToolContext, input: z.infer<I>) => Promise<unknown>;
}): ToolDef {
  return def as ToolDef;
}

const TOOLS: readonly ToolDef[] = [
  tool({
    name: 'authenticate',
    description:
      'Inicia ou continua a sessao do WhatsApp. Retorna QR code (data URL + texto) ou pairing code (8 digitos). Se ja conectado, indica isso.',
    schema: authenticateInput,
    handler: authenticate,
  }),
  tool({
    name: 'get_status',
    description:
      'Retorna status atual da conexao com WhatsApp: disconnected | connecting | qr_pending | connected | logged_out.',
    schema: getStatusInput,
    handler: getStatus,
  }),
  tool({
    name: 'logout',
    description: 'Encerra a sessao do WhatsApp e limpa credenciais. Sera necessario re-autenticar.',
    schema: logoutInput,
    handler: logout,
  }),
  tool({
    name: 'send_text_message',
    description:
      'Envia uma mensagem de texto para um contato ou grupo. Use telefone E.164 (+5511999999999), JID (xxx@s.whatsapp.net) ou JID de grupo (xxx@g.us).',
    schema: sendTextMessageInput,
    handler: sendTextMessage,
  }),
  tool({
    name: 'list_chats',
    description: 'Lista chats recentes do banco local. Suporta paginacao por cursor (timestamp) e busca por nome/JID.',
    schema: listChatsInput,
    handler: listChats,
  }),
  tool({
    name: 'get_chat',
    description: 'Retorna detalhes de um chat especifico pelo JID.',
    schema: getChatInput,
    handler: getChat,
  }),
  tool({
    name: 'list_messages',
    description: 'Lista mensagens de um chat (ordenadas por timestamp DESC). Paginavel por cursor (parametro before).',
    schema: listMessagesInput,
    handler: listMessages,
  }),
  tool({
    name: 'get_message_context',
    description: 'Retorna N mensagens antes/depois de uma mensagem especifica para fornecer contexto.',
    schema: getMessageContextInput,
    handler: getMessageContext,
  }),
  tool({
    name: 'search_contacts',
    description: 'Busca contatos no banco local por nome (ou parte dele) ou telefone.',
    schema: searchContactsInput,
    handler: searchContacts,
  }),
];

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodFieldToJson(value);
      if (!value.isOptional()) required.push(key);
    }
    return {
      type: 'object',
      properties,
      ...(required.length ? { required } : {}),
      additionalProperties: false,
    };
  }
  return { type: 'object' };
}

function zodFieldToJson(field: z.ZodTypeAny): Record<string, unknown> {
  let inner = field;
  let optional = false;
  let description: string | undefined;
  let defaultValue: unknown;

  if (inner._def?.description) description = inner._def.description;

  while (true) {
    if (inner instanceof z.ZodOptional) {
      optional = true;
      inner = inner.unwrap();
      continue;
    }
    if (inner instanceof z.ZodDefault) {
      defaultValue = inner._def.defaultValue();
      inner = inner._def.innerType;
      continue;
    }
    if (inner._def?.description && !description) description = inner._def.description;
    break;
  }

  let base: Record<string, unknown> = { type: 'string' };
  if (inner instanceof z.ZodString) base = { type: 'string' };
  else if (inner instanceof z.ZodNumber) base = { type: 'number' };
  else if (inner instanceof z.ZodBoolean) base = { type: 'boolean' };
  else if (inner instanceof z.ZodEnum) base = { type: 'string', enum: inner.options };
  else if (inner instanceof z.ZodArray) base = { type: 'array', items: zodFieldToJson(inner.element) };
  else if (inner instanceof z.ZodObject) base = zodToJsonSchema(inner);

  if (description) base.description = description;
  if (defaultValue !== undefined) base.default = defaultValue;
  void optional;
  return base;
}

export function createMcpServer(ctx: ToolContext): Server {
  const server = new Server(
    {
      name: 'carteiro-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.schema),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const def = TOOLS.find((t) => t.name === name);
    if (!def) {
      return {
        content: [{ type: 'text', text: `Tool desconhecida: ${name}` }],
        isError: true,
      };
    }
    const parsed = def.schema.safeParse(args ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      return {
        content: [{ type: 'text', text: `Argumentos invalidos para ${name}: ${issues}` }],
        isError: true,
      };
    }
    try {
      const result = await def.handler(ctx, parsed.data);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ tool: name, err: message }, '[mcp] tool falhou');
      return {
        content: [{ type: 'text', text: `Erro em ${name}: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}
