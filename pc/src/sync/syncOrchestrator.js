const EventEmitter = require('events');
const { EmailStatus } = require('../db/database');

class SyncOrchestrator extends EventEmitter {
  /**
   * @param {Object} options
   * @param {import('../db/database').PmailDatabase} options.db
   * @param {import('../network/networkMonitor')} options.networkMonitor
   * @param {import('../queue/outboxWorker')} options.outboxWorker
   * @param {import('../backup/backupPackager')} options.backupPackager
   * @param {Array<Object>} options.cloudProviders Lista de proveedores (Google Drive, Terabox)
   */
  constructor(options = {}) {
    super();
    this.db = options.db;
    this.networkMonitor = options.networkMonitor;
    this.outboxWorker = options.outboxWorker;
    this.backupPackager = options.backupPackager;
    this.cloudProviders = options.cloudProviders || [];

    this._setupListeners();
  }

  _setupListeners() {
    // Al pasar a estado ONLINE
    this.networkMonitor.on('online', async () => {
      console.log('\n[SyncOrchestrator] 🌐 Conexión a Internet DETECTADA. Iniciando ciclo de sincronización y envío...');
      this.emit('network_online');
      await this.triggerFullSync();
    });

    // Al pasar a estado OFFLINE
    this.networkMonitor.on('offline', async () => {
      console.log('\n[SyncOrchestrator] 🔌 Conexión a Internet PERDIDA. Activando MODO OFFLINE AUTOMÁTICO...');
      this.emit('network_offline');
      // Empaquetar y cifrar inmediatamente correos y borradores pendientes
      await this.createLocalOfflineBackup();
    });

    // Eventos del outbox worker
    this.outboxWorker.on('sent', (info) => {
      this.emit('email_sent', info);
    });
  }

  /**
   * Envío de un correo desde la interfaz del usuario
   * @param {Object} emailData { from_address, to_address, subject, body_text, ... }
   */
  async sendEmail(emailData) {
    const isOnline = this.networkMonitor.isOnline;

    // 1. Guardar de forma atómica en SQLite y encolar como PENDING_SEND
    const queueRecord = this.db.enqueueEmail(emailData);
    console.log(`[SyncOrchestrator] Correo registrado localmente en SQLite con estado: ${queueRecord.status} [ID: ${queueRecord.emailId}]`);

    if (!isOnline) {
      console.log(`[SyncOrchestrator] ⚠️ Modo Offline activo. El mensaje queda almacenado en la cola local de la PC como "${EmailStatus.PENDING_SEND}".`);
      // Generar snapshot cifrado preventivo de respaldo
      await this.createLocalOfflineBackup();
      return {
        success: true,
        queued: true,
        status: EmailStatus.PENDING_SEND,
        emailId: queueRecord.emailId,
        message: 'Correo guardado de forma segura en cola local (Pendiente de envío).'
      };
    }

    // 2. Si estamos online, procesar la cola de salida inmediatamente
    console.log('[SyncOrchestrator] Conexión disponible. Despachando mensaje...');
    await this.outboxWorker.processQueue(true);

    const updatedEmail = this.db.getEmailById(queueRecord.emailId);
    return {
      success: true,
      queued: false,
      status: updatedEmail.status,
      emailId: queueRecord.emailId,
      message: updatedEmail.status === EmailStatus.SENT ? 'Correo enviado exitosamente.' : 'Encolado para reintento.'
    };
  }

  /**
   * Guardar borrador en SQLite sin perder datos
   */
  saveDraft(draftData) {
    const draft = this.db.saveDraft(draftData);
    console.log(`[SyncOrchestrator] Borrador guardado localmente en SQLite: "${draft.subject}" (ID: ${draft.id})`);
    return draft;
  }

  /**
   * Crea un paquete cifrado local con los correos y borradores que aún no se han respaldado
   */
  async createLocalOfflineBackup() {
    const unbackedUpItems = this.db.getUnbackedUpItems();

    if (unbackedUpItems.length === 0) {
      console.log('[SyncOrchestrator] No hay elementos nuevos o pendientes por empaquetar para respaldo.');
      return null;
    }

    console.log(`[SyncOrchestrator] 📦 Empaquetando y cifrando ${unbackedUpItems.length} elemento(s) para respaldo local seguro...`);
    const packageInfo = this.backupPackager.packageAndEncrypt(unbackedUpItems, {
      triggerReason: 'OFFLINE_STATE_DETECTED',
      machineHostname: process.env.COMPUTERNAME || 'PC_LOCAL'
    });

    console.log(`[SyncOrchestrator] 🔒 Paquete cifrado generado exitosamente: ${packageInfo.filename} (${packageInfo.fileSize} bytes)`);
    console.log(`[SyncOrchestrator] Hash SHA-256 de integridad: ${packageInfo.fileHash}`);

    return packageInfo;
  }

  /**
   * Ciclo completo de sincronización al recuperar conectividad:
   * 1. Subir respaldos pendientes a Google Drive / Terabox
   * 2. Despachar mensajes en cola de salida
   * 3. Actualizar estados locales a 'SYNCED' / 'SENT'
   */
  async triggerFullSync() {
    if (!this.networkMonitor.isOnline) {
      console.log('[SyncOrchestrator] Intento de sincronización cancelado: Sin conexión de red.');
      return;
    }

    console.log('[SyncOrchestrator] ================= INICIO DE SINCRONIZACIÓN =================');

    // PASO 1: Despachar cola de mensajes pendientes
    console.log('[SyncOrchestrator] 1. Procesando cola de mensajes salientes pendientes...');
    await this.outboxWorker.processQueue(true);

    // PASO 2: Identificar correos no respaldados en la nube
    const unbackedUp = this.db.getUnbackedUpItems();

    if (unbackedUp.length > 0) {
      console.log(`[SyncOrchestrator] 2. Generando paquete seguro para respaldo en la nube (${unbackedUp.length} items)...`);
      const packageInfo = this.backupPackager.packageAndEncrypt(unbackedUp, {
        triggerReason: 'ONLINE_AUTO_SYNC',
        machineHostname: process.env.COMPUTERNAME || 'PC_LOCAL'
      });

      // PASO 3: Subir a los proveedores en la nube configurados
      for (const provider of this.cloudProviders) {
        try {
          console.log(`[SyncOrchestrator] 3. Transfiriendo respaldo hacia [${provider.name}]...`);
          const uploadResult = await provider.uploadBackup(packageInfo);

          if (uploadResult && uploadResult.success) {
            // Registrar snapshot
            this.db.recordBackupSnapshot({
              id: `snap_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
              snapshot_file: packageInfo.filename,
              file_hash_sha256: packageInfo.fileHash,
              provider: provider.name,
              remote_file_id: uploadResult.remoteFileId || null,
              items_count: packageInfo.itemsCount,
              status: 'UPLOADED',
              created_at: packageInfo.createdAt,
              uploaded_at: uploadResult.uploadedAt
            });

            // Actualizar estado de los correos a 'SYNCED' o mantener SENT si ya fue despachado
            this.db.markEmailsBackedUp(packageInfo.emailIds, uploadResult.remoteFileId);

            console.log(`[SyncOrchestrator] ✅ Respaldo confirmado en [${provider.name}]. Estados locales actualizados a "${EmailStatus.SYNCED}" / "${EmailStatus.SENT}".`);
          }
        } catch (uploadError) {
          console.error(`[SyncOrchestrator] ❌ Error durante el respaldo en [${provider.name}]: ${uploadError.message}`);
        }
      }
    } else {
      console.log('[SyncOrchestrator] Todos los elementos locales ya se encuentran respaldados.');
    }

    console.log('[SyncOrchestrator] ================= SINCRONIZACIÓN COMPLETADA =================\n');
  }
}

module.exports = SyncOrchestrator;
