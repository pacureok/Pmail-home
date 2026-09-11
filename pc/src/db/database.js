const path = require('path');
const fs = require('fs');

let DatabaseSync = null;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch {
  try {
    DatabaseSync = require('better-sqlite3');
  } catch {
    DatabaseSync = null;
  }
}

const EmailStatus = {
  DRAFT: 'DRAFT',
  PENDING_SEND: 'PENDING_SEND',
  SENDING: 'SENDING',
  SENT: 'SENT',
  SYNCED: 'SYNCED',
  FAILED: 'FAILED'
};

const QueueStatus = {
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
};

class PmailDatabase {
  constructor(dbPath = null) {
    const defaultDir = path.resolve(__dirname, '../../data');
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }
    this.dbPath = dbPath || path.join(defaultDir, 'pmail_local.db');
    this.db = null;
    this.init();
  }

  init() {
    if (!DatabaseSync) {
      throw new Error('[PmailDatabase] No se encontró motor SQLite compatible (node:sqlite o better-sqlite3).');
    }

    this.db = new DatabaseSync(this.dbPath);
    // Habilitar Write-Ahead Logging (WAL) para máxima concurrencia y tolerancia a fallos
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');

    this._createTables();
  }

  _createTables() {
    this.db.exec(`
      -- Tabla principal de mensajes de correo (entrantes, salientes, borradores)
      CREATE TABLE IF NOT EXISTS emails (
        id TEXT PRIMARY KEY,
        message_id TEXT UNIQUE,
        from_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        cc TEXT,
        bcc TEXT,
        subject TEXT,
        body_text TEXT,
        body_html TEXT,
        attachments_json TEXT DEFAULT '[]',
        folder TEXT DEFAULT 'inbox',
        status TEXT NOT NULL DEFAULT 'DRAFT',
        is_backed_up INTEGER DEFAULT 0,
        cloud_backup_id TEXT,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        sent_at INTEGER,
        synced_at INTEGER
      );

      -- Cola de salida persistente para reintentos y tolerancia a desconexión
      CREATE TABLE IF NOT EXISTS outbox_queue (
        id TEXT PRIMARY KEY,
        email_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'QUEUED',
        priority INTEGER DEFAULT 1,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 5,
        next_retry_at INTEGER NOT NULL,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
      );

      -- Registro histórico de copias de seguridad en Google Drive / Terabox
      CREATE TABLE IF NOT EXISTS backup_snapshots (
        id TEXT PRIMARY KEY,
        snapshot_file TEXT NOT NULL,
        file_hash_sha256 TEXT NOT NULL,
        provider TEXT NOT NULL,
        remote_file_id TEXT,
        items_count INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        created_at INTEGER NOT NULL,
        uploaded_at INTEGER
      );

      -- Índices para optimización de consultas en el cliente
      CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
      CREATE INDEX IF NOT EXISTS idx_emails_backed_up ON emails(is_backed_up);
      CREATE INDEX IF NOT EXISTS idx_outbox_status_retry ON outbox_queue(status, next_retry_at);
    `);
  }

  // Operación atómica con soporte de rollback
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      const result = fn();
      this.db.exec('COMMIT;');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  // Guardar o actualizar borrador
  saveDraft(emailData) {
    const now = Date.now();
    const id = emailData.id || `msg_${now}_${Math.random().toString(36).substr(2, 8)}`;
    const msgId = emailData.message_id || `<${id}@${(emailData.from_address || 'user@pac.p').split('@')[1]}>`;
    const attachments = JSON.stringify(emailData.attachments || []);

    const stmt = this.db.prepare(`
      INSERT INTO emails (
        id, message_id, from_address, to_address, cc, bcc,
        subject, body_text, body_html, attachments_json,
        folder, status, is_backed_up, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'drafts', 'DRAFT', 0, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        to_address = excluded.to_address,
        cc = excluded.cc,
        bcc = excluded.bcc,
        subject = excluded.subject,
        body_text = excluded.body_text,
        body_html = excluded.body_html,
        attachments_json = excluded.attachments_json,
        is_backed_up = 0,
        updated_at = excluded.updated_at;
    `);

    stmt.run(
      id,
      msgId,
      emailData.from_address || 'user@pac.p',
      emailData.to_address || '',
      emailData.cc || null,
      emailData.bcc || null,
      emailData.subject || '',
      emailData.body_text || '',
      emailData.body_html || '',
      attachments,
      now,
      now
    );

    return this.getEmailById(id);
  }

  // Encolar correo para envío con estado 'PENDING_SEND'
  enqueueEmail(emailData) {
    const now = Date.now();
    const emailId = emailData.id || `msg_${now}_${Math.random().toString(36).substr(2, 8)}`;
    const queueId = `queue_${now}_${Math.random().toString(36).substr(2, 8)}`;
    const msgId = emailData.message_id || `<${emailId}@${emailData.from_address.split('@')[1] || 'pac.p'}>`;
    const attachments = JSON.stringify(emailData.attachments || []);

    const insertOrUpdateEmail = this.db.prepare(`
      INSERT INTO emails (
        id, message_id, from_address, to_address, cc, bcc,
        subject, body_text, body_html, attachments_json,
        folder, status, is_backed_up, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'outbox', '${EmailStatus.PENDING_SEND}', 0, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        folder = 'outbox',
        status = '${EmailStatus.PENDING_SEND}',
        is_backed_up = 0,
        updated_at = excluded.updated_at;
    `);

    const insertQueue = this.db.prepare(`
      INSERT INTO outbox_queue (
        id, email_id, status, priority, retry_count, max_retries, next_retry_at, created_at, updated_at
      ) VALUES (?, ?, '${QueueStatus.QUEUED}', 1, 0, 5, ?, ?, ?);
    `);

    this.transaction(() => {
      insertOrUpdateEmail.run(
        emailId,
        msgId,
        emailData.from_address,
        emailData.to_address,
        emailData.cc || null,
        emailData.bcc || null,
        emailData.subject || '',
        emailData.body_text || '',
        emailData.body_html || '',
        attachments,
        now,
        now
      );

      insertQueue.run(queueId, emailId, now, now, now);
    });

    return { emailId, queueId, status: EmailStatus.PENDING_SEND };
  }

  // Obtener elementos pendientes de la cola listos para despachar
  getPendingQueueItems(limit = 10) {
    const now = Date.now();
    const stmt = this.db.prepare(`
      SELECT q.id AS queue_id, q.email_id, q.retry_count, q.max_retries,
             e.from_address, e.to_address, e.subject, e.body_text, e.body_html, e.attachments_json, e.message_id
      FROM outbox_queue q
      INNER JOIN emails e ON q.email_id = e.id
      WHERE q.status = '${QueueStatus.QUEUED}'
        AND q.next_retry_at <= ?
      ORDER BY q.priority DESC, q.created_at ASC
      LIMIT ?;
    `);
    return stmt.all(now, limit);
  }

  // Actualizar estado de correo enviado exitosamente
  markEmailSent(emailId, queueId) {
    const now = Date.now();
    this.transaction(() => {
      this.db.prepare(`
        UPDATE emails
        SET status = '${EmailStatus.SENT}',
            folder = 'sent',
            sent_at = ?,
            updated_at = ?
        WHERE id = ?;
      `).run(now, now, emailId);

      this.db.prepare(`
        UPDATE outbox_queue
        SET status = '${QueueStatus.COMPLETED}',
            updated_at = ?
        WHERE id = ?;
      `).run(now, queueId);
    });
  }

  // Manejo de fallo en envío con reintentos exponenciales
  markEmailFailed(queueId, emailId, errorMessage, retryCount, maxRetries) {
    const now = Date.now();
    const nextRetryCount = retryCount + 1;
    const isExhausted = nextRetryCount >= maxRetries;

    const backoffMs = Math.pow(4, nextRetryCount) * 1000;
    const nextRetryAt = now + backoffMs;

    this.transaction(() => {
      this.db.prepare(`
        UPDATE outbox_queue
        SET retry_count = ?,
            next_retry_at = ?,
            last_error = ?,
            status = ?,
            updated_at = ?
        WHERE id = ?;
      `).run(
        nextRetryCount,
        nextRetryAt,
        errorMessage,
        isExhausted ? QueueStatus.FAILED : QueueStatus.QUEUED,
        now,
        queueId
      );

      if (isExhausted) {
        this.db.prepare(`
          UPDATE emails
          SET status = '${EmailStatus.FAILED}',
              last_error = ?,
              updated_at = ?
          WHERE id = ?;
        `).run(errorMessage, now, emailId);
      }
    });
  }

  // Obtener elementos no respaldados
  getUnbackedUpItems() {
    const stmt = this.db.prepare(`
      SELECT * FROM emails
      WHERE is_backed_up = 0
      ORDER BY updated_at ASC;
    `);
    return stmt.all();
  }

  // Marcar correos como respaldados en la nube
  markEmailsBackedUp(emailIds, cloudBackupId = null) {
    if (!emailIds || emailIds.length === 0) return;
    const now = Date.now();
    const placeholders = emailIds.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      UPDATE emails
      SET is_backed_up = 1,
          cloud_backup_id = ?,
          synced_at = ?,
          status = CASE
            WHEN status = '${EmailStatus.SENT}' THEN '${EmailStatus.SYNCED}'
            ELSE status
          END,
          updated_at = ?
      WHERE id IN (${placeholders});
    `);
    stmt.run(cloudBackupId, now, now, ...emailIds);
  }

  // Registrar snapshot de respaldo
  recordBackupSnapshot(snapshotData) {
    const stmt = this.db.prepare(`
      INSERT INTO backup_snapshots (
        id, snapshot_file, file_hash_sha256, provider,
        remote_file_id, items_count, status, created_at, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);
    stmt.run(
      snapshotData.id,
      snapshotData.snapshot_file,
      snapshotData.file_hash_sha256,
      snapshotData.provider,
      snapshotData.remote_file_id || null,
      snapshotData.items_count,
      snapshotData.status,
      snapshotData.created_at,
      snapshotData.uploaded_at || null
    );
  }

  getEmailById(id) {
    const stmt = this.db.prepare('SELECT * FROM emails WHERE id = ?;');
    return stmt.get(id);
  }

  getAllEmails() {
    return this.db.prepare('SELECT id, from_address, to_address, subject, folder, status, is_backed_up FROM emails;').all();
  }
}

module.exports = {
  PmailDatabase,
  EmailStatus,
  QueueStatus
};
