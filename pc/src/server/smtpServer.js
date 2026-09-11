const net = require('net');
const EventEmitter = require('events');
const { EmailStatus } = require('../db/database');

/**
 * Servidor SMTP Local RFC 5321 para Pmail
 * Soporta procesamiento, recepción y enrutamiento interno para @pac.p y @pacur.p
 */
class PmailSmtpServer extends EventEmitter {
  /**
   * @param {Object} options
   * @param {number} [options.port=2525] Puerto de escucha SMTP local (2525 para evitar requerir admin en Windows)
   * @param {string} [options.host='127.0.0.1'] Host de escucha
   * @param {import('../db/database').PmailDatabase} options.db Instancia de SQLite
   */
  constructor(options = {}) {
    super();
    this.port = options.port || 2525;
    this.host = options.host || '0.0.0.0';
    this.db = options.db;
    this.server = null;
    this.connections = new Set();
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => this._handleConnection(socket));

      this.server.on('error', (err) => {
        console.error(`[PmailSmtpServer] Error en servidor SMTP: ${err.message}`);
        this.emit('error', err);
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        console.log(`[PmailSmtpServer] 🚀 Servidor SMTP local activo en ${this.host}:${this.port}`);
        console.log(`[PmailSmtpServer] 📧 Dominios gestionados: @pac.p, @pacur.p`);
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      for (const socket of this.connections) {
        try {
          socket.destroy();
        } catch {}
      }
      this.connections.clear();

      if (this.server) {
        this.server.close(() => {
          console.log('[PmailSmtpServer] Servidor SMTP detenido.');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  _handleConnection(socket) {
    this.connections.add(socket);
    socket.setEncoding('utf8');

    let state = 'CONNECTED';
    let clientName = '';
    let mailFrom = '';
    let rcptList = [];
    let dataBuffer = '';
    let isDataMode = false;

    // Saludo inicial SMTP RFC 5321
    socket.write('220 pmail.local ESMTP Pmail Mail Service Ready (@pac.p / @pacur.p)\r\n');

    let buffer = '';

    socket.on('data', (chunk) => {
      buffer += chunk;
      let lines = buffer.split('\r\n');
      // La última línea puede estar incompleta si se partió el paquete TCP
      buffer = lines.pop();

      for (const line of lines) {
        if (isDataMode) {
          if (line === '.') {
            // Fin del flujo DATA
            isDataMode = false;
            const parsedEmail = this._parseRawEmail(dataBuffer, mailFrom, rcptList);

            try {
              // Guardar en SQLite como correo recibido en Inbox
              this._saveIncomingEmail(parsedEmail);

              socket.write(`250 2.0.0 OK: message queued as ${parsedEmail.id}\r\n`);
              this.emit('mail_received', parsedEmail);
              console.log(`[PmailSmtpServer] 📥 Correo recibido [${parsedEmail.id}] de <${mailFrom}> para <${rcptList.join(', ')}>: "${parsedEmail.subject}"`);
            } catch (err) {
              console.error(`[PmailSmtpServer] Error al guardar correo recibido: ${err.message}`);
              socket.write('451 4.3.0 Local error in processing\r\n');
            }

            // Resetear estado de transacción
            mailFrom = '';
            rcptList = [];
            dataBuffer = '';
            state = 'ESTABLISHED';
          } else {
            // Unescape de punto al inicio de línea (RFC 5321 dot-stuffing)
            const cleanLine = line.startsWith('..') ? line.substring(1) : line;
            dataBuffer += cleanLine + '\r\n';
          }
          continue;
        }

        const trimmed = line.trim();
        if (!trimmed) continue;

        const spaceIndex = trimmed.indexOf(' ');
        const command = (spaceIndex === -1 ? trimmed : trimmed.substring(0, spaceIndex)).toUpperCase();
        const arg = spaceIndex === -1 ? '' : trimmed.substring(spaceIndex + 1).trim();

        switch (command) {
          case 'EHLO':
          case 'HELO':
            clientName = arg;
            state = 'ESTABLISHED';
            socket.write(
              '250-pmail.local at your service\r\n' +
              '250-SIZE 35880000\r\n' +
              '250-8BITMIME\r\n' +
              '250-ENHANCEDSTATUSCODES\r\n' +
              '250 HELP\r\n'
            );
            break;

          case 'MAIL': {
            // Sintaxis esperada: FROM:<usuario@pac.p>
            const match = arg.match(/^FROM:\s*<([^>]+)>/i) || arg.match(/^FROM:\s*([^\s]+)/i);
            if (!match) {
              socket.write('501 5.5.2 Syntax: MAIL FROM:<address>\r\n');
              break;
            }
            mailFrom = match[1].toLowerCase().trim();
            rcptList = [];
            state = 'MAIL_FROM';
            socket.write(`250 2.1.0 Sender <${mailFrom}> OK\r\n`);
            break;
          }

          case 'RCPT': {
            // Sintaxis esperada: TO:<destinatario@pacur.p>
            if (state !== 'MAIL_FROM' && state !== 'RCPT_TO') {
              socket.write('503 5.5.1 Bad sequence of commands (send MAIL FROM first)\r\n');
              break;
            }
            const match = arg.match(/^TO:\s*<([^>]+)>/i) || arg.match(/^TO:\s*([^\s]+)/i);
            if (!match) {
              socket.write('501 5.5.2 Syntax: RCPT TO:<address>\r\n');
              break;
            }
            const recipient = match[1].toLowerCase().trim();
            rcptList.push(recipient);
            state = 'RCPT_TO';
            socket.write(`250 2.1.5 Recipient <${recipient}> OK\r\n`);
            break;
          }

          case 'DATA':
            if (state !== 'RCPT_TO' || rcptList.length === 0) {
              socket.write('503 5.5.1 Bad sequence of commands (Need RCPT TO first)\r\n');
              break;
            }
            isDataMode = true;
            dataBuffer = '';
            socket.write('354 Start mail input; end with <CRLF>.<CRLF>\r\n');
            break;

          case 'RSET':
            mailFrom = '';
            rcptList = [];
            dataBuffer = '';
            isDataMode = false;
            state = 'ESTABLISHED';
            socket.write('250 2.0.0 Reset state OK\r\n');
            break;

          case 'NOOP':
            socket.write('250 2.0.0 OK\r\n');
            break;

          case 'QUIT':
            socket.write('221 2.0.0 pmail.local Service closing transmission channel\r\n');
            socket.end();
            break;

          default:
            socket.write(`502 5.5.1 Command "${command}" unrecognized\r\n`);
            break;
        }
      }
    });

    socket.on('close', () => {
      this.connections.delete(socket);
    });

    socket.on('error', (err) => {
      console.warn(`[PmailSmtpServer] Socket warning: ${err.message}`);
      this.connections.delete(socket);
    });
  }

  _parseRawEmail(rawText, from, recipients) {
    const headerEndIndex = rawText.indexOf('\r\n\r\n');
    let headerText = '';
    let bodyText = '';

    if (headerEndIndex !== -1) {
      headerText = rawText.substring(0, headerEndIndex);
      bodyText = rawText.substring(headerEndIndex + 4);
    } else {
      headerText = rawText;
      bodyText = '';
    }

    const headers = {};
    const lines = headerText.split('\r\n');
    let currentKey = null;

    for (const line of lines) {
      if (line.startsWith(' ') || line.startsWith('\t')) {
        if (currentKey) {
          headers[currentKey] += ' ' + line.trim();
        }
      } else {
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
          currentKey = line.substring(0, colonIndex).trim().toLowerCase();
          headers[currentKey] = line.substring(colonIndex + 1).trim();
        }
      }
    }

    const now = Date.now();
    const id = `rcv_${now}_${Math.random().toString(36).substr(2, 7)}`;

    return {
      id,
      message_id: headers['message-id'] || `<${id}@${from.split('@')[1] || 'pac.p'}>`,
      from_address: from || headers['from'] || 'desconocido@pac.p',
      to_address: recipients.join(', ') || headers['to'] || '',
      subject: headers['subject'] || '(Sin Asunto)',
      body_text: bodyText,
      body_html: `<div style="font-family:sans-serif;line-height:1.6;">${bodyText.replace(/\n/g, '<br>')}</div>`,
      headers,
      attachments_json: '[]',
      folder: 'inbox',
      status: EmailStatus.SYNCED,
      created_at: now,
      updated_at: now
    };
  }

  _saveIncomingEmail(email) {
    if (!this.db) return;

    const stmt = this.db.db.prepare(`
      INSERT INTO emails (
        id, message_id, from_address, to_address, subject,
        body_text, body_html, attachments_json, folder,
        status, is_backed_up, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'inbox', '${EmailStatus.SYNCED}', 0, ?, ?)
      ON CONFLICT(id) DO NOTHING;
    `);

    stmt.run(
      email.id,
      email.message_id,
      email.from_address,
      email.to_address,
      email.subject,
      email.body_text,
      email.body_html,
      email.attachments_json,
      email.created_at,
      email.updated_at
    );
  }
}

module.exports = PmailSmtpServer;
