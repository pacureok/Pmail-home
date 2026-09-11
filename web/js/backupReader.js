/**
 * Pmail Web Client - Lector e Importador Criptográfico de Respaldos
 * Soporta descifrado y verificación de archivos .pmailpkg mediante Web Crypto API
 */
class PmailBackupReader {
  /**
   * @param {string} [password] Clave secreta para descifrado AES-256
   */
  constructor(password = 'pmail_pac_security_key_2026') {
    this.password = password;
  }

  /**
   * Leer y descifrar un archivo .pmailpkg provisto por el usuario
   * @param {File|Blob} file Objeto de archivo
   */
  async decryptFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    if (bytes.length < 44) {
      throw new Error('El archivo de respaldo está corrupto o es demasiado pequeño.');
    }

    const salt = bytes.slice(0, 16);
    const iv = bytes.slice(16, 28);
    const authTag = bytes.slice(28, 44);
    const encryptedData = bytes.slice(44);

    // En AES-GCM en Web Crypto API, el authTag debe anexarse al final del ciphertext
    const combinedCiphertext = new Uint8Array(encryptedData.length + authTag.length);
    combinedCiphertext.set(encryptedData, 0);
    combinedCiphertext.set(authTag, encryptedData.length);

    // Derivar clave de 256 bits usando PBKDF2
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(this.password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    const derivedKey = await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    try {
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv,
          tagLength: 128
        },
        derivedKey,
        combinedCiphertext
      );

      const decryptedText = new TextDecoder().decode(decryptedBuffer);
      return JSON.parse(decryptedText);
    } catch {
      // Fallback si fue cifrado con scrypt desde Node.js:
      // Se puede soportar formato JSON de respaldo directo
      throw new Error('No se pudo descifrar el paquete. Verifique la contraseña o utilice el archivo JSON exportado.');
    }
  }

  /**
   * Exportar correos locales a un archivo JSON seguro
   */
  exportToJson(emails) {
    const payload = {
      client: 'Pmail Web Client',
      supportedDomains: ['@pac.p', '@pacur.p'],
      exportedAt: new Date().toISOString(),
      count: emails.length,
      emails
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pmail_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

window.PmailBackupReader = PmailBackupReader;
