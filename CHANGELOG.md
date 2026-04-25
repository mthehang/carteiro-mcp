# Changelog

Todos os marcos relevantes deste projeto são documentados aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento segue [SemVer](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Adicionado
- Tools para envio de mídia, reactions, marcar como lida, operações de grupo.

## [0.1.0] - 2026-04-25

### Adicionado
- Conexão WhatsApp via Baileys (multi-device) com QR code e pairing code.
- Sessão persistida em `/data/sessions`.
- Auto-reconnect com backoff exponencial.
- 9 tools MCP MVP: `authenticate`, `get_status`, `logout`, `send_text_message`, `list_chats`, `get_chat`, `list_messages`, `get_message_context`, `search_contacts`.
- Transports stdio e Streamable HTTP, simultâneos ou independentes.
- Admin UI minimal em `/admin` com QR, pairing code, logout.
- Persistência SQLite com encriptação seletiva AES-256-GCM.
- Rate limit token bucket por destinatário.
- Whitelist de contatos via `ALLOWED_CONTACTS`.
- Audit log de todas as chamadas de tools.
- Auto-purge de mensagens antigas (`MESSAGE_RETENTION_DAYS`).
- Dockerfile multi-stage e docker-compose hardened.
- Documentação: README, SECURITY, PRIVACY.
