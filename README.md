# Carteiro MCP

Servidor **Model Context Protocol** para WhatsApp pessoal. Conecta via Baileys (multi-device) e expõe tools para que clientes MCP, como Claude Desktop, Claude Code, Cursor ou n8n, leiam e enviem mensagens em seu nome.

> Self-hosted, single-binary Docker, sessão persistida, encriptação de mensagens em SQLite com AES-256-GCM, rate limit, whitelist de contatos opcional.

---

## Por que Carteiro

- **Sem API paga.** Conecta direto na sua conta pessoal via WhatsApp Web Multi-Device.
- **Stack simples.** Node 22 + TypeScript + Baileys. Sem puppeteer, sem browser, container leve.
- **Dois transports.** stdio para Claude Desktop/Code, Streamable HTTP para n8n e clientes remotos.
- **Privado por padrão.** Mensagens ficam apenas no seu host, encriptadas em repouso.
- **Tudo MCP-nativo.** Compatível com qualquer cliente que fale Model Context Protocol.

---

## Quick start (Docker)

```bash
git clone https://github.com/<seu-usuario>/carteiro-mcp.git
cd carteiro-mcp
cp .env.example .env

# Gere as chaves
echo "DATA_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
echo "ADMIN_TOKEN=$(openssl rand -hex 32)" >> .env

# Build e start
docker compose up -d --build

# Acesse o admin para escanear o QR
# http://localhost:3000/admin?token=<ADMIN_TOKEN>
```

Quando o status mudar para **connected**, o Carteiro está pronto para receber chamadas MCP.

---

## Quick start (local, sem Docker)

```bash
npm install
cp .env.example .env
echo "DATA_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env

# Modo desenvolvimento (auto-reload)
npm run dev

# Build + start
npm run build
npm start
```

---

## Tools disponíveis (MVP)

| Tool | O que faz |
|---|---|
| `authenticate` | Inicia sessão. Retorna QR (data URL) ou pairing code de 8 dígitos. |
| `get_status` | Estado da conexão: `disconnected`, `connecting`, `qr_pending`, `connected`, `logged_out`. |
| `logout` | Encerra a sessão e limpa credenciais. |
| `send_text_message` | Envia texto. Aceita E.164 (`+5511...`), JID individual ou JID de grupo. |
| `list_chats` | Lista chats recentes. Suporta paginação por cursor e busca por nome/JID. |
| `get_chat` | Detalhes de um chat. |
| `list_messages` | Mensagens de um chat. Paginação por timestamp. |
| `get_message_context` | N mensagens antes/depois de uma mensagem específica. |
| `search_contacts` | Busca por nome, telefone ou JID. |

Próximas fases: envio de mídia, reactions, grupos, marcar como lida.

---

## Configuração MCP no cliente

### Claude Desktop / Claude Code

Adicione em `~/.config/claude/mcp.json` (ou onde estiver o `mcp.json` do seu cliente):

```json
{
  "mcpServers": {
    "carteiro": {
      "command": "node",
      "args": ["/caminho/absoluto/para/carteiro-mcp/dist/index.js"],
      "env": {
        "TRANSPORT": "stdio",
        "DATA_DIR": "/caminho/absoluto/para/carteiro-mcp/data",
        "DATA_ENCRYPTION_KEY": "<sua-chave-hex-32>"
      }
    }
  }
}
```

### Cursor

Mesma estrutura JSON, em `~/.cursor/mcp.json`.

### n8n / clientes HTTP

Suba o container com `TRANSPORT=http`, depois aponte o cliente para `http://localhost:3000/mcp`. O servidor segue o padrão Streamable HTTP do MCP (header `mcp-session-id` para continuidade).

---

## Variáveis de ambiente

Veja `.env.example` para a lista completa. Resumo do essencial:

| Variável | Uso |
|---|---|
| `TRANSPORT` | `stdio`, `http` ou `both`. |
| `DATA_DIR` | Onde ficam sessões + SQLite. |
| `DATA_ENCRYPTION_KEY` | Chave AES-256-GCM (hex 64 chars). Gere com `openssl rand -hex 32`. |
| `ADMIN_TOKEN` | Bearer token para rotas `/admin`. |
| `WA_PHONE_NUMBER` | E.164 para receber pairing code. Vazio = QR. |
| `ALLOWED_CONTACTS` | CSV E.164. Vazio = sem whitelist. |
| `RATE_LIMIT_SEND_PER_MIN` | Default 30. |
| `MESSAGE_RETENTION_DAYS` | Auto-purge de mensagens antigas. 0 = nunca. |

---

## Segurança

- Container roda como UID 1001, sem privilégios extras, FS read-only exceto volumes.
- Mensagens em SQLite são encriptadas seletivamente (`messages.body_encrypted`) com AES-256-GCM.
- Rate limit por destinatário (token bucket).
- Whitelist de contatos via `ALLOWED_CONTACTS`.
- Toda chamada de tool é gravada em `audit_log` com hash dos parâmetros.
- Nunca commite `.env` ou o conteúdo de `data/`.

Ver [SECURITY.md](./SECURITY.md) e [PRIVACY.md](./PRIVACY.md).

---

## Arquitetura

```
+----------------------------+        +---------------------------+
|  MCP Server (TS)           |<------>|  Baileys WhatsApp Client  |
|  stdio + Streamable HTTP   |        |  (multi-device WS)        |
+--------------+-------------+        +-------------+-------------+
               |                                    |
               v                                    v
+----------------------------+        +---------------------------+
|  Tools (Zod-validados)     |        |  Sessão persistida        |
|  audit + rate-limit        |        |  /data/sessions           |
+--------------+-------------+        +---------------------------+
               |
               v
+----------------------------+        +---------------------------+
|  SQLite + AES-256-GCM      |        |  Admin UI (HTTP /admin)   |
+----------------------------+        +---------------------------+
```

---

## Limitações conhecidas

- WhatsApp não oferece API oficial para uso pessoal. Esse projeto usa o protocolo Web Multi-Device através do Baileys. Você assume o risco de eventual restrição da sua conta. Use bom senso, evite spam, respeite o rate limit padrão.
- Sessão expira após cerca de 20 dias inativos. Basta refazer o pairing.
- Mídia ainda não está implementada nesta versão (Fase 2).

---

## Roadmap

- [x] MVP: send_text, list_chats, list_messages, search_contacts, auth flow
- [x] Streamable HTTP + Admin UI
- [x] Encriptação at rest, rate limit, whitelist, audit log
- [ ] Envio e download de mídia (imagem, vídeo, áudio, documento)
- [ ] Reactions, mark as read
- [ ] Operações de grupo (criar, adicionar, remover participantes)
- [ ] Webhooks de mensagens recebidas
- [ ] Suporte a múltiplas contas (multi-tenant)

---

## Desenvolvimento

```bash
npm run dev          # tsx watch
npm run build        # tsc
npm run typecheck    # tsc --noEmit
npm run lint         # biome check
npm run lint:fix
npm test             # vitest
```

---

## Licença

[MIT](./LICENSE)
