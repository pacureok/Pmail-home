/**
 * Pmail Web Client - Conector de Google Drive API v3 (Folder-Centric)
 * Maneja la autenticación OAuth2 de Google, validación de la carpeta del usuario
 * y creación/sincronización autónoma de `pmail_account.json` y `pmail_data_backup.json`.
 */
class PmailGoogleDriveSync {
  constructor() {
    this.STORAGE_KEY_TOKEN = 'pmail_gdrive_token_v1';
    this.STORAGE_KEY_TOKEN_EXP = 'pmail_gdrive_token_exp_v1';
    this.STORAGE_KEY_FOLDER_ID = 'pmail_gdrive_folder_id_v1';
    this.STORAGE_KEY_FOLDER_URL = 'pmail_gdrive_folder_url_v1';
    this.STORAGE_KEY_PROFILE = 'pmail_gdrive_profile_v1';
    this.STORAGE_KEY_CLIENT_ID = 'pmail_gdrive_client_id_v1';
    this.STORAGE_KEY_FILE_IDS = 'pmail_gdrive_file_ids_v1'; // { accountFileId, dataFileId }

    // Client ID por defecto (el usuario puede configurar su propio Client ID de Google Cloud Console)
    this.DEFAULT_CLIENT_ID = '388775466485-pmail-web.apps.googleusercontent.com';

    this.tokenClient = null;
    this.accessToken = this._getSavedToken();
    this.folderId = localStorage.getItem(this.STORAGE_KEY_FOLDER_ID) || null;
    this.folderUrl = localStorage.getItem(this.STORAGE_KEY_FOLDER_URL) || '';
    this.isSyncing = false;
  }

  getClientId() {
    return localStorage.getItem(this.STORAGE_KEY_CLIENT_ID) || this.DEFAULT_CLIENT_ID;
  }

  setClientId(clientId) {
    if (clientId) {
      localStorage.setItem(this.STORAGE_KEY_CLIENT_ID, clientId.trim());
    }
  }

  _getSavedToken() {
    const token = localStorage.getItem(this.STORAGE_KEY_TOKEN);
    const exp = Number(localStorage.getItem(this.STORAGE_KEY_TOKEN_EXP) || 0);
    if (token && exp > Date.now()) {
      return token;
    }
    return null;
  }

  saveToken(token, expiresInSeconds = 3599) {
    this.accessToken = token;
    localStorage.setItem(this.STORAGE_KEY_TOKEN, token);
    localStorage.setItem(this.STORAGE_KEY_TOKEN_EXP, String(Date.now() + (expiresInSeconds * 1000)));
  }

  clearSession() {
    this.accessToken = null;
    localStorage.removeItem(this.STORAGE_KEY_TOKEN);
    localStorage.removeItem(this.STORAGE_KEY_TOKEN_EXP);
    localStorage.removeItem(this.STORAGE_KEY_FOLDER_ID);
    localStorage.removeItem(this.STORAGE_KEY_FOLDER_URL);
    localStorage.removeItem(this.STORAGE_KEY_PROFILE);
    localStorage.removeItem(this.STORAGE_KEY_FILE_IDS);
  }

  isAuthenticated() {
    return !!this.accessToken && !!this.folderId;
  }

  getSavedProfile() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY_PROFILE);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /**
   * Extraer ID limpio de carpeta a partir de URL o texto directo
   * Soporta:
   * - https://drive.google.com/drive/folders/1AbC...
   * - https://drive.google.com/drive/u/0/folders/1AbC...?usp=sharing
   * - ID directo de 20-50 caracteres
   */
  extractFolderId(input) {
    if (!input) return null;
    const str = input.trim();
    const match = str.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) return match[1];

    if (/^[a-zA-Z0-9_-]{15,60}$/.test(str)) {
      return str;
    }
    return null;
  }

  /**
   * Iniciar solicitud de autenticación con Google Identity Services
   */
  requestGoogleToken(clientId = null) {
    const effectiveClientId = clientId || this.getClientId();

    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        // Modo fallback si la biblioteca aún no ha cargado o si el usuario introduce un Access Token directo
        return reject(new Error('La biblioteca de Google Identity Services no está lista. Verifica tu conexión a internet o introduce un token de acceso.'));
      }

      try {
        this.tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: effectiveClientId,
          scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
          callback: (tokenResponse) => {
            if (tokenResponse.error) {
              return reject(new Error(`Error de autorización Google: ${tokenResponse.error}`));
            }
            if (tokenResponse.access_token) {
              this.saveToken(tokenResponse.access_token, Number(tokenResponse.expires_in) || 3599);
              resolve(tokenResponse.access_token);
            } else {
              reject(new Error('No se recibió token de acceso de Google.'));
            }
          }
        });

        this.tokenClient.requestAccessToken({ prompt: '' });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Obtener perfil de Google del usuario
   */
  async fetchGoogleUserInfo(token = null) {
    const activeToken = token || this.accessToken;
    if (!activeToken) throw new Error('No hay token de acceso disponible.');

    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${activeToken}` }
    });

    if (!res.ok) {
      if (res.status === 401) {
        this.clearSession();
        throw new Error('Tu sesión de Google ha expirado. Por favor inicia sesión nuevamente.');
      }
      throw new Error(`Error al consultar información de Google (${res.status})`);
    }

    const info = await res.json();
    return {
      googleId: info.sub,
      email: info.email,
      name: info.name || info.given_name || 'Usuario Pmail',
      picture: info.picture
    };
  }

  /**
   * Validar carpeta de Google Drive: existencia y permisos de edición
   */
  async validateFolder(folderInput, token = null) {
    const activeToken = token || this.accessToken;
    if (!activeToken) throw new Error('Debes iniciar sesión con Google primero.');

    const folderId = this.extractFolderId(folderInput);
    if (!folderId) {
      throw new Error('La URL o ID de la carpeta de Google Drive tiene un formato inválido.');
    }

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType,capabilities,trashed`, {
      headers: { Authorization: `Bearer ${activeToken}` }
    });

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('La carpeta de Google Drive no fue encontrada. Asegúrate de que el enlace sea correcto y pertenezca a tu cuenta.');
      }
      if (res.status === 403) {
        throw new Error('No tienes permisos para acceder a esta carpeta de Google Drive.');
      }
      throw new Error(`Error al validar carpeta de Google Drive (${res.status}).`);
    }

    const folderData = await res.json();

    if (folderData.trashed) {
      throw new Error('La carpeta de Google Drive indicada se encuentra en la papelera de reciclaje.');
    }

    if (folderData.mimeType !== 'application/vnd.google-apps.folder') {
      throw new Error('El enlace proporcionado corresponde a un archivo, no a una carpeta de Google Drive.');
    }

    if (folderData.capabilities && folderData.capabilities.canAddChildren === false) {
      throw new Error('No tienes permisos de escritura/edición en esta carpeta de Google Drive.');
    }

    this.folderId = folderId;
    this.folderUrl = folderInput.trim();
    localStorage.setItem(this.STORAGE_KEY_FOLDER_ID, folderId);
    localStorage.setItem(this.STORAGE_KEY_FOLDER_URL, this.folderUrl);

    return {
      id: folderData.id,
      name: folderData.name,
      valid: true
    };
  }

  /**
   * Localizar o listar los archivos pmail_account.json y pmail_data_backup.json dentro de la carpeta
   */
  async findPmailFilesInFolder() {
    if (!this.folderId || !this.accessToken) return { accountFile: null, dataFile: null };

    const q = encodeURIComponent(`'${this.folderId}' in parents and trashed=false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime,size)`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (!res.ok) {
      throw new Error(`Error al inspeccionar archivos de la carpeta (${res.status})`);
    }

    const data = await res.json();
    const files = data.files || [];

    const accountFile = files.find(f => f.name === 'pmail_account.json') || null;
    const dataFile = files.find(f => f.name === 'pmail_data_backup.json') || null;

    const fileIds = {
      accountFileId: accountFile?.id || null,
      dataFileId: dataFile?.id || null
    };
    localStorage.setItem(this.STORAGE_KEY_FILE_IDS, JSON.stringify(fileIds));

    return { accountFile, dataFile };
  }

  /**
   * Leer contenido de un archivo JSON desde Google Drive
   */
  async downloadJsonFile(fileId) {
    if (!fileId || !this.accessToken) return null;

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (!res.ok) {
      throw new Error(`Error al descargar archivo desde Google Drive (${res.status})`);
    }

    return await res.json();
  }

  /**
   * Guardar o actualizar archivo en la carpeta de Google Drive
   * Si fileId ya existe, ejecuta PATCH. Si no, crea un nuevo archivo con multipart/related.
   */
  async uploadOrUpdateJsonFile(fileName, contentObject, existingFileId = null) {
    if (!this.accessToken || !this.folderId) {
      throw new Error('Sesión de Google Drive no autenticada.');
    }

    const contentString = JSON.stringify(contentObject, null, 2);

    if (existingFileId) {
      // Actualizar archivo existente
      const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: contentString
      });

      if (!res.ok) {
        throw new Error(`Error al actualizar ${fileName} en Google Drive (${res.status})`);
      }
      return await res.json();
    } else {
      // Crear nuevo archivo mediante multipart en la carpeta de Drive
      const metadata = {
        name: fileName,
        parents: [this.folderId],
        mimeType: 'application/json',
        description: `Pmail Cloud Data - ${fileName}`
      };

      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        contentString +
        closeDelimiter;

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartRequestBody
      });

      if (!res.ok) {
        throw new Error(`Error al crear ${fileName} en Google Drive (${res.status})`);
      }
      return await res.json();
    }
  }

  /**
   * Sincronización completa: Guarda pmail_account.json y pmail_data_backup.json
   */
  async syncAllToDrive(accountData, emailDataPayload) {
    if (this.isSyncing) return null;
    this.isSyncing = true;

    try {
      const { accountFile, dataFile } = await this.findPmailFilesInFolder();

      // 1. Guardar pmail_account.json
      const accountFileResult = await this.uploadOrUpdateJsonFile(
        'pmail_account.json',
        accountData,
        accountFile?.id
      );

      // 2. Guardar pmail_data_backup.json
      const dataFileResult = await this.uploadOrUpdateJsonFile(
        'pmail_data_backup.json',
        emailDataPayload,
        dataFile?.id
      );

      const fileIds = {
        accountFileId: accountFileResult.id,
        dataFileId: dataFileResult.id
      };
      localStorage.setItem(this.STORAGE_KEY_FILE_IDS, JSON.stringify(fileIds));

      return {
        success: true,
        accountFileId: accountFileResult.id,
        dataFileId: dataFileResult.id,
        syncedAt: Date.now()
      };
    } finally {
      this.isSyncing = false;
    }
  }
}

window.PmailGoogleDriveSync = PmailGoogleDriveSync;
