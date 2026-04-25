# Política de privacidade

## Quem é o controlador

Você. Carteiro MCP é self-hosted. Os autores do projeto não têm acesso a nenhum dado processado pela sua instância.

## Que dados são processados

- **Sessão Baileys:** chaves criptográficas que autenticam seu dispositivo no WhatsApp. Armazenadas em `/data/sessions/baileys`.
- **Cache de chats:** JID, nome, timestamp da última mensagem, contagem de não lidas, flags de arquivado/fixado.
- **Cache de contatos:** JID, nome, notify name, telefone.
- **Mensagens:** ID, chat, remetente, timestamp, tipo, conteúdo de texto (encriptado quando há chave), caminho de mídia.
- **Audit log:** nome da tool, hash dos parâmetros, resultado, duração.

Nenhum dado deixa o seu host a menos que você configure transporte HTTP exposto a clientes externos.

## Onde os dados ficam

Em volumes Docker locais (`carteiro-data`, `carteiro-media`) ou em `./data` e `./media` quando rodando fora de container. Nunca em serviços de terceiros operados pelo projeto.

## Retenção

Mensagens são auto-purgadas após `MESSAGE_RETENTION_DAYS` dias (default 90, configurável; 0 desativa). Sessões persistem indefinidamente até logout ou expiração natural pelo WhatsApp.

## Telemetria

Nenhuma. O servidor não envia métricas, logs ou crash reports para terceiros.

## Direitos do titular

- Para apagar tudo: `docker compose down -v` remove volumes. Localmente, apague `data/` e `media/`.
- Para apagar só mensagens: configure `MESSAGE_RETENTION_DAYS=1` por algumas horas, depois volte ao valor desejado.
- Para revogar acesso do dispositivo: `logout` via tool MCP, ou pelo próprio WhatsApp em "Aparelhos conectados".

## Terceiros

- **WhatsApp/Meta** recebe seus envios e mantém histórico próprio segundo a política deles.
- **Clientes MCP** que você conectar (Claude, Cursor, n8n) recebem o conteúdo das tools que invocarem. Confira a política deles separadamente.

## Crianças

O projeto não é destinado a menores de 13 anos. Não colete dados de menores via Carteiro.

## Contato

Issues no GitHub para dúvidas gerais. Para relatos de privacidade sensíveis, use Security Advisory privado do repositório.
