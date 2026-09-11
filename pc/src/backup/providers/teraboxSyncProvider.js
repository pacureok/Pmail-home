const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

/**
 * Proveedor de Sincronización para TeraBox en Entornos Desktop (Windows PC)
 *
 * TeraBox cuenta con un agente de sincronización local que supervisa carpetas
 * en el equipo del usuario y las replica automáticamente a la nube.
 * Este proveedor asegura la copia atómica y verificación criptográfica
 * en la carpeta designada de TeraBox.
 */
class TeraboxSyncProvider {
  /**
   * @param {Object} [config]
   * @param {string} [config.syncPath] Ruta local de la carpeta de sincronización de TeraBox
   */
  constructor(config = {}) {
    this.name = 'terabox';
    // Detección de ruta predeterminada de TeraBox en Windows
    const userHome = os.homedir();
    const defaultTeraboxPath = process.platform === 'win32'
      ? path.join(userHome, 'TeraBox', 'Pmail_Backups')
      : path.join(userHome, 'terabox_sync', 'Pmail_Backups');

    this.syncDir = config.syncPath || defaultTeraboxPath;
    this._ensureSyncDir();
  }

  _ensureSyncDir() {
    if (!fs.existsSync(this.syncDir)) {
      try {
        fs.mkdirSync(this.syncDir, { recursive: true });
      } catch (err) {
        console.warn(`[TeraboxSyncProvider] Advertencia al crear carpeta de sincronización TeraBox: ${err.message}`);
      }
    }
  }

  /**
   * Sincronizar un paquete de respaldo copiándolo a la carpeta monitoreada por TeraBox
   * @param {Object} packageInfo Información del paquete cifrado generado
   */
  async uploadBackup(packageInfo) {
    const { filePath, filename, fileHash } = packageInfo;

    if (!fs.existsSync(filePath)) {
      throw new Error(`El archivo de origen no existe: ${filePath}`);
    }

    this._ensureSyncDir();
    const destinationPath = path.join(this.syncDir, filename);

    console.log(`[TeraboxSyncProvider] Sincronizando respaldo seguro hacia TeraBox Sync: ${destinationPath}`);

    // Copia atómica mediante archivo temporal para evitar que el agente de TeraBox
    // intente subir un archivo incompleto mientras se escribe
    const tempDest = `${destinationPath}.tmp`;
    fs.copyFileSync(filePath, tempDest);

    // Verificar hash SHA-256 del archivo copiado
    const tempBuffer = fs.readFileSync(tempDest);
    const destHash = crypto.createHash('sha256').update(tempBuffer).digest('hex');

    if (destHash !== fileHash) {
      fs.unlinkSync(tempDest);
      throw new Error('Fallo de integridad: El hash del archivo copiado no coincide con el paquete original.');
    }

    // Renombrar a su nombre definitivo una vez validada la integridad
    fs.renameSync(tempDest, destinationPath);

    console.log(`[TeraboxSyncProvider] Respaldo colocado exitosamente en TeraBox Sync. Listo para propagación a la nube.`);

    return {
      success: true,
      provider: this.name,
      remoteFileId: `terabox_local_${filename}`,
      destinationPath,
      uploadedAt: Date.now(),
      fileHash
    };
  }
}

module.exports = TeraboxSyncProvider;
