const http = require('http');
const EventEmitter = require('events');

/**
 * Servidor de Sincronización LAN para conectar el cliente Web con la aplicación de PC
 * Proporciona REST API con CORS y Server-Sent Events (SSE) para notificaciones en tiempo real
 */
class LanSyncServer extends EventEmitter {
  /**
   * @param {Object} options
   * @param {number} [options.port=7890] Puerto de escucha LAN
   * @param {string} [options.host='0.0.0.0'] Host
   * @param {import('../db/database').PmailDatabase} options.db
   * @param {import('../sync/syncOrchestrator')} options.orchestrator
   */
  constructor(options = {}) {
    super();
    this.port = options.port || 7890;
    this.host = options.host || '0.0.0.0';
    this.db = options.db;
    this.orchestrator = options.orchestrator;
    this.server = null;
    this.sseClients = new Set();
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this._handleRequest(req, res));

      this.server.on('error', (err) => {
        console.error(`[LanSyncServer] Error en servidor LAN: ${err.message}`);
        this.emit('error', err);
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        console.log(`[LanSyncServer] 🌐 Servidor de Sincronización LAN activo en http://${this.host}:${this.port}`);
        console.log(`[LanSyncServer] 🔗 Cliente Web puede sincronizarse vía http://localhost:${this.port}/api/`);
        resolve();
      });

      // Escuchar eventos del orquestador para propagar a clientes web conectados
      if (this.orchestrator) {
        this.orchestrator.on('email_sent', (info) => {
          this.broadcast('email_sent', info);
        });
        this.orchestrator.on('network_online', () => {
          this.broadcast('network_status', { isOnline: true });
        });
        this.orchestrator.on('network_offline', () => {
          this.broadcast('network_status', { isOnline: false });
        });
      }
    });
  }

  stop() {
    return new Promise((resolve) => {
      for (const client of this.sseClients) {
        try {
          client.end();
        } catch {}
      }
      this.sseClients.clear();

      if (this.server) {
        this.server.close(() => {
          console.log('[LanSyncServer] Servidor LAN detenido.');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  broadcast(eventType, data) {
    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(message);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  async _handleRequest(req, res) {
    // Cabeceras CORS abiertas para permitir peticiones desde cliente Web local o desplegado
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Canal de eventos en tiempo real SSE (Server-Sent Events)
    if (pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write(': connected\n\n');
      this.sseClients.add(res);

      req.on('close', () => {
        this.sseClients.delete(res);
      });
      return;
    }

    // Endpoint: Estado del servidor y conectividad
    if (pathname === '/api/status' && req.method === 'GET') {
      const isOnline = this.orchestrator?.networkMonitor?.isOnline ?? true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        app: 'Pmail Desktop Host',
        version: '1.0.0',
        supportedDomains: ['@pac.p', '@pacur.p'],
        isOnline,
        unbackedUpCount: this.db ? this.db.getUnbackedUpItems().length : 0,
        connectedWebClients: this.sseClients.size,
        timestamp: Date.now()
      }));
      return;
    }

    // Endpoint: Listar todos los correos
    if (pathname === '/api/emails' && req.method === 'GET') {
      try {
        const emails = this.db.getAllEmails();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: emails.length, emails }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // Endpoint: Enviar o encolar correo desde la Web
    if (pathname === '/api/send' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', async () => {
        try {
          const emailData = JSON.parse(body);
          if (!emailData.to_address || !emailData.subject) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Faltan campos obligatorios (to_address, subject)' }));
            return;
          }

          const result = await this.orchestrator.sendEmail(emailData);
          this.broadcast('email_queued', result);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, result }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // Endpoint: Guardar borrador desde la Web
    if (pathname === '/api/drafts' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => {
        try {
          const draftData = JSON.parse(body);
          const saved = this.orchestrator.saveDraft(draftData);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, draft: saved }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
  }
}

module.exports = LanSyncServer;
