import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
  type ConnectionState,
  type WAMessage,
  type Contact as BaileysContact,
} from '@whiskeysockets/baileys';
import type { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type { ClientStatus, ConnectionStatus, SendTextResult } from './types.js';
import { normalizeJid } from './types.js';

const RECONNECT_DELAY_MS = 3_000;
const MAX_RECONNECT_DELAY_MS = 60_000;

export class WhatsAppClient extends EventEmitter {
  private sock?: WASocket;
  private state: ClientStatus = { status: 'disconnected' };
  private reconnectAttempts = 0;
  private readonly authDir: string;
  private starting = false;
  private manualLogout = false;

  constructor() {
    super();
    this.authDir = join(config.dataDir, 'sessions', 'baileys');
    mkdirSync(this.authDir, { recursive: true });
  }

  getStatus(): ClientStatus {
    return { ...this.state };
  }

  async start(): Promise<void> {
    if (this.starting) {
      logger.warn('[wa] start() ja em andamento');
      return;
    }
    this.starting = true;
    this.manualLogout = false;
    try {
      await this.connect();
    } finally {
      this.starting = false;
    }
  }

  private async connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

    this.setStatus('connecting');
    logger.info('[wa] conectando ao WhatsApp...');

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: [config.waBrowserName, 'Chrome', '120.0.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      logger: logger.child({ module: 'baileys' }) as never,
    });

    this.sock.ev.on('creds.update', saveCreds);
    this.sock.ev.on('connection.update', (u) => this.handleConnectionUpdate(u));

    if (config.waPhoneNumber && !state.creds.registered) {
      try {
        const code = await this.sock.requestPairingCode(
          config.waPhoneNumber.replace(/\D/g, ''),
        );
        const formatted = code.match(/.{1,4}/g)?.join('-') ?? code;
        this.state.pairingCode = formatted;
        logger.info({ pairingCode: formatted }, '[wa] pairing code gerado');
        this.emit('pairing-code', formatted);
      } catch (err) {
        logger.error({ err }, '[wa] falha ao gerar pairing code, fallback para QR');
      }
    }

    this.attachMessageListeners();
  }

  private attachMessageListeners(): void {
    if (!this.sock) return;
    this.sock.ev.on('messages.upsert', ({ messages, type }) => {
      for (const msg of messages) {
        this.emit('message', { msg, type });
      }
    });
    this.sock.ev.on('contacts.upsert', (contacts: BaileysContact[]) => {
      for (const c of contacts) this.emit('contact', c);
    });
    this.sock.ev.on('contacts.update', (updates) => {
      for (const c of updates) this.emit('contact', c);
    });
    this.sock.ev.on('chats.upsert', (chats) => {
      for (const c of chats) this.emit('chat', c);
    });
    this.sock.ev.on('chats.update', (updates) => {
      for (const c of updates) this.emit('chat', c);
    });
  }

  private async handleConnectionUpdate(update: Partial<ConnectionState>): Promise<void> {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const dataUrl = await qrcode.toDataURL(qr, { errorCorrectionLevel: 'M', margin: 1 });
      this.state.qr = { text: qr, dataUrl };
      this.setStatus('qr_pending');
      qrcodeTerminal.generate(qr, { small: true }, (rendered) => {
        logger.info(`[wa] escaneie o QR no WhatsApp:\n${rendered}`);
      });
      this.emit('qr', { text: qr, dataUrl });
    }

    if (connection === 'open') {
      this.reconnectAttempts = 0;
      this.state.qr = undefined;
      this.state.pairingCode = undefined;
      this.state.jid = this.sock?.user?.id;
      this.state.pushName = this.sock?.user?.name;
      this.state.connectedAt = Date.now();
      this.state.lastError = undefined;
      this.setStatus('connected');
      logger.info({ jid: this.state.jid }, '[wa] conectado');
      this.emit('connected');
    }

    if (connection === 'close') {
      const boom = lastDisconnect?.error as Boom | undefined;
      const code = boom?.output?.statusCode;
      const isLoggedOut = code === DisconnectReason.loggedOut;
      this.state.lastError = boom?.message ?? 'connection closed';
      logger.warn({ code, message: boom?.message }, '[wa] conexao fechada');

      if (isLoggedOut || this.manualLogout) {
        this.setStatus('logged_out');
        logger.info('[wa] sessao encerrada (logged_out)');
        this.emit('logged-out');
        return;
      }

      if (config.waAutoReconnect) {
        this.reconnectAttempts += 1;
        const delay = Math.min(
          RECONNECT_DELAY_MS * 2 ** (this.reconnectAttempts - 1),
          MAX_RECONNECT_DELAY_MS,
        );
        logger.info({ attempt: this.reconnectAttempts, delayMs: delay }, '[wa] reconectando...');
        setTimeout(() => {
          this.connect().catch((err) => logger.error({ err }, '[wa] falha no reconnect'));
        }, delay);
      } else {
        this.setStatus('disconnected');
      }
    }
  }

  private setStatus(status: ConnectionStatus): void {
    this.state.status = status;
    this.emit('status', status);
  }

  async sendText(to: string, text: string): Promise<SendTextResult> {
    this.assertConnected();
    const jid = normalizeJid(to);
    const result = await this.sock!.sendMessage(jid, { text });
    if (!result?.key?.id) throw new Error('WhatsApp nao retornou ID da mensagem');
    return {
      id: result.key.id,
      to: jid,
      ts: typeof result.messageTimestamp === 'number'
        ? result.messageTimestamp * 1000
        : Date.now(),
    };
  }

  async logout(): Promise<void> {
    this.manualLogout = true;
    if (!this.sock) return;
    try {
      await this.sock.logout();
    } catch (err) {
      logger.warn({ err }, '[wa] erro no logout (ignorado)');
    }
    this.setStatus('logged_out');
    this.state.jid = undefined;
    this.state.pushName = undefined;
    this.state.qr = undefined;
    this.state.pairingCode = undefined;
    this.emit('logged-out');
  }

  async destroy(): Promise<void> {
    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch (err) {
        logger.debug({ err }, '[wa] erro ao encerrar socket');
      }
      this.sock = undefined;
    }
    this.setStatus('disconnected');
  }

  private assertConnected(): void {
    if (this.state.status !== 'connected' || !this.sock) {
      throw new Error(
        `WhatsApp nao conectado (status: ${this.state.status}). Chame authenticate primeiro.`,
      );
    }
  }

  raw(): WASocket | undefined {
    return this.sock;
  }
}
