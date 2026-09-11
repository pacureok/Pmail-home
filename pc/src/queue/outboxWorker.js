const EventEmitter = require('events');
const { EmailStatus } = require('../db/database');

class OutboxWorker extends EventEmitter {
  /**
   * @param {Object} options
   * @param {import('../db/database').PmailDatabase} options.db Instancia de base de datos SQLite
   * @param {Function} [options.transportDispatcher] Función de envío de correo (SMTP o API de dominio @pac.p / @pacur.p)
   */
  constructor(options = {}) {
    super();
    this.db = options.db;
    this.transportDispatcher = options.transportDispatcher || this._defaultDispatcher.bind(this);
    this._isRunning = false;
    this._isProcessing = false;
    this._pollTimer = null;
    this.pollIntervalMs = options.pollIntervalMs || 4000;
  }

  /**
   * Despachador por defecto para los dominios personalizados @pac.p y @pacur.p
   */
  async _defaultDispatcher(email) {
    // Validar formato de dominio
    const fromDomain = email.from_address.split('@')[1];
    const validDomains = ['pac.p', 'pacur.p'];

    if (!validDomains.includes(fromDomain)) {
      console.warn(`[OutboxWorker] Advertencia: Enviando desde dominio no estándar: @${fromDomain}`);
    }

    // Simulación de transporte SMTP/Relay
    console.log(`[OutboxWorker] Despachando correo [${email.message_id || email.email_id}] de <${email.from_address}> para <${email.to_address}>...`);
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Retorna éxito con id de mensaje y timestamp
    return {
      messageId: email.message_id,
      responseCode: 250,
      timestamp: Date.now()
    };
  }

  start() {
    if (this._isRunning) return;
    this._isRunning = true;
    this._pollTimer = setInterval(() => {
      this.processQueue();
    }, this.pollIntervalMs);
  }

  stop() {
    this._isRunning = false;
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  /**
   * Procesa los mensajes pendientes en la cola
   * @param {boolean} isOnline Indica si hay conexión disponible
   */
  async processQueue(isOnline = true) {
    if (!isOnline) {
      // Si no hay conexión, abortamos inmediatamente el procesamiento
      return { processed: 0, skipped: true, reason: 'offline' };
    }

    if (this._isProcessing) {
      return { processed: 0, skipped: true, reason: 'already_processing' };
    }

    this._isProcessing = true;
    let processedCount = 0;

    try {
      const pendingItems = this.db.getPendingQueueItems(10);

      for (const item of pendingItems) {
        // Doble verificación: si la red se corta a mitad de la cola, detenerse
        if (!isOnline) {
          console.log('[OutboxWorker] Conexión perdida durante el procesamiento. Pausando cola.');
          break;
        }

        const queueId = item.queue_id || item.id;
        try {
          this.emit('sending', { emailId: item.email_id, queueId });

          // Despachar el mensaje
          const result = await this.transportDispatcher(item);

          // Si el envío fue exitoso, marcar en base de datos como SENT
          this.db.markEmailSent(item.email_id, queueId);
          processedCount++;

          this.emit('sent', {
            emailId: item.email_id,
            queueId,
            to: item.to_address,
            subject: item.subject,
            result
          });

          console.log(`[OutboxWorker] Correo [${item.email_id}] enviado con éxito a ${item.to_address}. Estado actualizado a: ${EmailStatus.SENT}`);
        } catch (dispatchError) {
          console.error(`[OutboxWorker] Error al despachar correo [${item.email_id}]: ${dispatchError.message}`);
          this.db.markEmailFailed(queueId, item.email_id, dispatchError.message, item.retry_count, item.max_retries);

          this.emit('failed', {
            emailId: item.email_id,
            queueId,
            error: dispatchError.message
          });
        }
      }
    } finally {
      this._isProcessing = false;
    }

    return { processed: processedCount };
  }
}

module.exports = OutboxWorker;
