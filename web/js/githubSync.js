/**
 * Pmail Web - Sincronización y Respaldo en la Nube con GitHub API (Gists / Repos)
 * Permite a los usuarios de @pac.p y @pacur.p respaldar su perfil, contactos,
 * borradores y correos en un GitHub Gist privado o repositorio mediante un PAT.
 */
class PmailGitHubSync {
  constructor() {
    this.STORAGE_KEY_TOKEN = 'pmail_github_pat_v1';
    this.STORAGE_KEY_GIST_ID = 'pmail_github_gist_id_v1';
    this.STORAGE_KEY_USER_INFO = 'pmail_github_user_cache_v1';
    this.GIST_FILENAME = 'pmail_cloud_backup.json';
    this.GIST_DESCRIPTION = 'Pmail Cloud Backup Seguro (@pac.p / @pacur.p)';
  }

  getToken() {
    return localStorage.getItem(this.STORAGE_KEY_TOKEN) || '';
  }

  getGistId() {
    return localStorage.getItem(this.STORAGE_KEY_GIST_ID) || '';
  }

  isLinked() {
    return !!this.getToken();
  }

  getSavedGitHubUser() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY_USER_INFO);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /**
   * Verificar y vincular Token de Acceso Personal (PAT) de GitHub
   * @param {string} token GitHub Personal Access Token (con permisos 'gist' o 'repo')
   */
  async linkToken(token) {
    const cleanToken = token.trim();
    if (!cleanToken) {
      throw new Error('Por favor ingresa un token de GitHub válido.');
    }

    const res = await fetch('https://api.github.com/user', {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${cleanToken}`
      }
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Token de GitHub inválido o expirado. Verifica los permisos.');
      }
      throw new Error(`Error de autenticación con GitHub (${res.status}).`);
    }

    const userData = await res.json();
    const githubUser = {
      login: userData.login,
      name: userData.name || userData.login,
      avatarUrl: userData.avatar_url,
      htmlUrl: userData.html_url,
      linkedAt: Date.now()
    };

    localStorage.setItem(this.STORAGE_KEY_TOKEN, cleanToken);
    localStorage.setItem(this.STORAGE_KEY_USER_INFO, JSON.stringify(githubUser));

    // Buscar si ya existe un Gist previo del usuario para reutilizarlo
    await this._findExistingGist(cleanToken);

    return githubUser;
  }

  /**
   * Desvincular cuenta de GitHub
   */
  unlink() {
    localStorage.removeItem(this.STORAGE_KEY_TOKEN);
    localStorage.removeItem(this.STORAGE_KEY_GIST_ID);
    localStorage.removeItem(this.STORAGE_KEY_USER_INFO);
  }

  /**
   * Buscar si el usuario ya tiene un Gist de respaldo creado anteriormente
   */
  async _findExistingGist(token) {
    try {
      const res = await fetch('https://api.github.com/gists', {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        const gists = await res.json();
        const found = gists.find(g =>
          g.description && g.description.includes('Pmail Cloud Backup') &&
          g.files && g.files[this.GIST_FILENAME]
        );

        if (found) {
          localStorage.setItem(this.STORAGE_KEY_GIST_ID, found.id);
          return found.id;
        }
      }
    } catch (err) {
      console.warn('[PmailGitHubSync] No se pudieron listar Gists previos:', err);
    }
    return null;
  }

  /**
   * Enviar respaldo completo (perfil, contactos, borradores, correos) hacia GitHub Gist privado
   * @param {Object} data Datos para respaldar
   */
  async syncToGitHub(data) {
    const token = this.getToken();
    if (!token) {
      throw new Error('No hay ninguna cuenta de GitHub vinculada. Ingresa tu Token primero.');
    }

    const payload = {
      app: 'Pmail Web Client',
      version: '1.0.0',
      syncedAt: new Date().toISOString(),
      timestamp: Date.now(),
      account: data.user || {},
      contacts: data.contacts || [],
      drafts: data.drafts || [],
      tasks: data.tasks || [],
      emailsCount: (data.emails || []).length,
      emails: data.emails || []
    };

    const jsonContent = JSON.stringify(payload, null, 2);
    let gistId = this.getGistId();

    if (!gistId) {
      gistId = await this._findExistingGist(token);
    }

    let result = null;

    if (gistId) {
      // Actualizar Gist existente
      const res = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          description: `${this.GIST_DESCRIPTION} - ${data.user?.email || ''} (Actualizado: ${new Date().toLocaleDateString()})`,
          files: {
            [this.GIST_FILENAME]: {
              content: jsonContent
            }
          }
        })
      });

      if (!res.ok) {
        // Si el Gist fue borrado en GitHub, crear uno nuevo
        if (res.status === 404) {
          localStorage.removeItem(this.STORAGE_KEY_GIST_ID);
          return this.syncToGitHub(data);
        }
        throw new Error(`Error al actualizar Gist de respaldo (${res.status})`);
      }

      result = await res.json();
    } else {
      // Crear nuevo Gist privado
      const res = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          description: `${this.GIST_DESCRIPTION} - ${data.user?.email || ''}`,
          public: false, // GIST PRIVADO PARA MÁXIMA SEGURIDAD
          files: {
            [this.GIST_FILENAME]: {
              content: jsonContent
            }
          }
        })
      });

      if (!res.ok) {
        throw new Error(`Error al crear Gist privado de respaldo (${res.status})`);
      }

      result = await res.json();
      localStorage.setItem(this.STORAGE_KEY_GIST_ID, result.id);
    }

    return {
      success: true,
      gistId: result.id,
      gistUrl: result.html_url,
      updatedAt: result.updated_at,
      itemsCount: (data.emails || []).length + (data.drafts || []).length
    };
  }

  /**
   * Descargar y restaurar respaldo desde GitHub
   */
  async restoreFromGitHub() {
    const token = this.getToken();
    if (!token) throw new Error('Debes vincular tu token de GitHub primero.');

    let gistId = this.getGistId();
    if (!gistId) gistId = await this._findExistingGist(token);

    if (!gistId) {
      throw new Error('No se encontró ningún Gist de respaldo de Pmail en tu cuenta de GitHub.');
    }

    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) throw new Error(`No se pudo leer el Gist de GitHub (${res.status})`);
    const gist = await res.json();

    const file = gist.files && gist.files[this.GIST_FILENAME];
    if (!file || !file.content) {
      throw new Error('El archivo de respaldo en el Gist está vacío o dañado.');
    }

    return JSON.parse(file.content);
  }
}

window.PmailGitHubSync = PmailGitHubSync;
