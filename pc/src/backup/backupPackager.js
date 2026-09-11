const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class BackupPackager {
  /**
   * @param {Object} options
   * @param {string} options.backupDir Directorio para almacenar los paquetes locales cifrados
   * @param {string} options.secretKey Clave o contraseña maestra para cifrado AES-256-GCM
   */
  constructor(options = {}) {
    this.backupDir = options.backupDir || path.resolve(__dirname, '../../data/backups');
    this.secretKey = options.secretKey || 'pmail_secure_master_key_pac_p_2026';
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Derivar una clave criptográfica de 256 bits a partir de la clave secreta y un salt
   */
  _deriveKey(salt) {
    return crypto.scryptSync(this.secretKey, salt, 32);
  }

  /**
   * Empaquetar y cifrar un lote de correos, borradores y metadatos
   * Formato de salida: archivo binario seguro conteniendo [Salt (16B) | IV (12B) | AuthTag (16B) | Ciphertext]
   *
   * @param {Array} emails Lista de correos y borradores
   * @param {Object} extraMetadata Metadatos adicionales (cuentas @pac.p, versión, etc.)
   * @returns {Object} Información del archivo generado, hash y cantidad de items
   */
  packageAndEncrypt(emails, extraMetadata = {}) {
    if (!emails || emails.length === 0) {
      return null;
    }

    const payload = {
      version: '1.0.0',
      client: 'Pmail Desktop Client',
      supportedDomains: ['@pac.p', '@pacur.p'],
      createdAt: new Date().toISOString(),
      timestamp: Date.now(),
      metadata: extraMetadata,
      itemsCount: emails.length,
      emails: emails.map(email => ({
        id: email.id,
        messageId: email.message_id,
        from: email.from_address,
        to: email.to_address,
        cc: email.cc,
        bcc: email.bcc,
        subject: email.subject,
        bodyText: email.body_text,
        bodyHtml: email.body_html,
        attachments: typeof email.attachments_json === 'string'
          ? JSON.parse(email.attachments_json || '[]')
          : email.attachments_json,
        folder: email.folder,
        status: email.status,
        createdAt: email.created_at,
        updated_at: email.updated_at
      }))
    };

    const jsonString = JSON.stringify(payload);

    // Cifrado AES-256-GCM
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12); // Tamaño recomendado para GCM
    const key = this._deriveKey(salt);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(jsonString, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Empaquetar todo en un único buffer seguro
    const finalBuffer = Buffer.concat([salt, iv, authTag, encrypted]);

    // Generar nombre de archivo con timestamp
    const filename = `pmail_backup_${Date.now()}_${emails.length}_items.pmailpkg`;
    const filePath = path.join(this.backupDir, filename);

    fs.writeFileSync(filePath, finalBuffer);

    // Calcular hash SHA-256 para verificación de integridad de transferencia en la nube
    const fileHash = crypto.createHash('sha256').update(finalBuffer).digest('hex');

    return {
      filePath,
      filename,
      fileSize: finalBuffer.length,
      fileHash,
      itemsCount: emails.length,
      emailIds: emails.map(e => e.id),
      createdAt: Date.now()
    };
  }

  /**
   * Descifrar y verificar un paquete .pmailpkg
   * @param {string} filePath Ruta del archivo empaquetado
   */
  decryptPackage(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    if (fileBuffer.length < 44) {
      throw new Error('El archivo de respaldo está truncado o es inválido.');
    }

    const salt = fileBuffer.subarray(0, 16);
    const iv = fileBuffer.subarray(16, 28);
    const authTag = fileBuffer.subarray(28, 44);
    const ciphertext = fileBuffer.subarray(44);

    const key = this._deriveKey(salt);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  }
}

module.exports = BackupPackager;
