const fs = require('fs');
const path = require('path');

/**
 * Proveedor de Respaldo para Google Drive API (v3)
 */
class GoogleDriveProvider {
  /**
   * @param {Object} config
   * @param {Object} [config.authClient] Cliente de autenticación OAuth2 o Service Account
   * @param {string} [config.folderName] Nombre de la carpeta de respaldos en Google Drive
   * @param {boolean} [config.mockMode] Si es true, simula la subida para entornos sin credenciales
   */
  constructor(config = {}) {
    this.name = 'google_drive';
    this.authClient = config.authClient || null;
    this.folderName = config.folderName || 'Pmail_Offline_Backups';
    this.mockMode = config.mockMode ?? !config.authClient;
    this.folderId = null;
    this.drive = null;

    if (!this.mockMode) {
      try {
        const { google } = require('googleapis');
        this.drive = google.drive({ version: 'v3', auth: this.authClient });
      } catch (err) {
        console.warn('[GoogleDriveProvider] Biblioteca "googleapis" no disponible. Activando modo simulado.');
        this.mockMode = true;
      }
    }
  }

  /**
   * Localiza o crea la carpeta de respaldo en Google Drive
   */
  async _ensureRemoteFolder() {
    if (this.folderId) return this.folderId;
    if (this.mockMode) {
      this.folderId = 'gdrive_folder_pmail_backups_id';
      return this.folderId;
    }

    // Buscar si ya existe la carpeta
    const res = await this.drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${this.folderName}' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    if (res.data.files && res.data.files.length > 0) {
      this.folderId = res.data.files[0].id;
    } else {
      // Crear la carpeta
      const fileMetadata = {
        name: this.folderName,
        mimeType: 'application/vnd.google-apps.folder'
      };
      const createdFolder = await this.drive.files.create({
        resource: fileMetadata,
        fields: 'id'
      });
      this.folderId = createdFolder.data.id;
    }

    return this.folderId;
  }

  /**
   * Subir un archivo de respaldo empaquetado y cifrado
   * @param {Object} packageInfo Datos del paquete generado por BackupPackager
   */
  async uploadBackup(packageInfo) {
    const { filePath, filename, fileHash, itemsCount } = packageInfo;

    if (!fs.existsSync(filePath)) {
      throw new Error(`El archivo de respaldo local no existe: ${filePath}`);
    }

    console.log(`[GoogleDriveProvider] Iniciando subida de respaldo a Google Drive: ${filename}`);

    if (this.mockMode) {
      // Simulación de latencia de red y confirmación de subida
      await new Promise(resolve => setTimeout(resolve, 800));
      const simulatedFileId = `gdrive_file_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      console.log(`[GoogleDriveProvider] [SIMULADO] Archivo respaldado con éxito en Google Drive. ID remoto: ${simulatedFileId}`);
      return {
        success: true,
        provider: this.name,
        remoteFileId: simulatedFileId,
        uploadedAt: Date.now(),
        fileHash
      };
    }

    const folderId = await this._ensureRemoteFolder();

    const fileMetadata = {
      name: filename,
      parents: [folderId],
      description: `Pmail Offline Backup Snapshot - ${itemsCount} items (@pac.p, @pacur.p)`,
      properties: {
        sha256: fileHash,
        itemsCount: String(itemsCount),
        source: 'pmail-desktop'
      }
    };

    const media = {
      mimeType: 'application/octet-stream',
      body: fs.createReadStream(filePath)
    };

    const response = await this.drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, size, webViewLink'
    });

    console.log(`[GoogleDriveProvider] Archivo subido exitosamente a Google Drive. ID: ${response.data.id}`);

    return {
      success: true,
      provider: this.name,
      remoteFileId: response.data.id,
      link: response.data.webViewLink,
      uploadedAt: Date.now(),
      fileHash
    };
  }
}

module.exports = GoogleDriveProvider;
