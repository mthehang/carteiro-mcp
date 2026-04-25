# Política de segurança

## Modelo de ameaça

Carteiro MCP roda no host do usuário, conecta-se a uma conta pessoal de WhatsApp e expõe tools para clientes MCP. Os principais vetores que tratamos:

1. Vazamento da sessão WhatsApp (`/data/sessions`).
2. Vazamento de mensagens armazenadas em SQLite.
3. Acesso não autorizado às rotas administrativas.
4. Spam ou envio massivo levando a banimento da conta.
5. Injeção de tools via clientes MCP comprometidos.

## Defesas implementadas

- **Container hardening:** non-root (UID 1001), `cap_drop: ALL`, FS read-only exceto volumes, `no-new-privileges`.
- **Encriptação at rest:** AES-256-GCM em `messages.body_encrypted` quando `DATA_ENCRYPTION_KEY` estiver definida.
- **Validação de entrada:** todos os tools usam schemas Zod com `.strict()`. JID destinatário é normalizado.
- **Rate limit:** token bucket configurável (`RATE_LIMIT_SEND_PER_MIN`, default 30/min).
- **Whitelist de contatos:** `ALLOWED_CONTACTS` permite restringir destinatários.
- **Audit log:** toda invocação de tool grava `audit_log` com hash SHA-256 truncado dos parâmetros.
- **Admin Token:** rotas `/admin/*` exigem `Authorization: Bearer <ADMIN_TOKEN>` quando configurado.
- **Auto-purge:** `MESSAGE_RETENTION_DAYS` apaga mensagens antigas periodicamente.

## Boas práticas para o operador

1. Gere `DATA_ENCRYPTION_KEY` e `ADMIN_TOKEN` com `openssl rand -hex 32`. Nunca reutilize valores de exemplo.
2. Nunca commite `.env`, `data/` ou qualquer coisa em `auth_info_*`.
3. Em produção, exponha o admin apenas em rede privada ou atrás de proxy autenticado.
4. Considere usar um número dedicado (chip separado) em vez do número pessoal principal.
5. Monitore `audit_log` para uso anômalo (muitos `error` ou volume incomum).

## Reportando vulnerabilidades

Abra uma *issue* privada (Security Advisory) no GitHub ou envie um email para o mantenedor. Não divulgue publicamente antes de uma correção. Tempo alvo de resposta: 7 dias.

## Disclaimer

Este projeto não é afiliado a WhatsApp ou Meta. Usa o protocolo Web Multi-Device de forma não oficial via Baileys. Use por sua conta e risco e em conformidade com os Termos de Serviço do WhatsApp.
