/**
 * Pmail Web Client - Conector de Sincronización en Red Local (LAN) y Túnel Cloud
 * Conecta la versión Web (GitHub Pages) con la App de PC de forma bidireccional y en tiempo real.
 */
class PmailLanConnector {
  /**
   * @param {string} [serverUrl] URL base del servidor de la PC (por defecto 127.0.0.1:7890 o guardada)
   */
  constructor(serverUrl = null) {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('pmail_lan_url') : null;
    this.serverUrl = (serverUrl || saved || 'http://127.0.0.1:7890').replace(/\/$/, '');
    this.isConnected = false;
    this.eventSource = null;
    this.listeners = new Set();
    this.reconnectTimer = null;
    this._isChecking = false;
  }

  setServerUrl(url) {
    this.serverUrl = url.replace(/\/$/, '');
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pmail_lan_url', this.serverUrl);
    }
    this.disconnectEvents();
    this.checkStatus().then(status => {
      if (status.connected) {
        this.connectEvents();
      }
    });
  }

  /**
   * Verificar estado y conectividad con la app de PC
   * Soporta fallback automático entre 127.0.0.1 y localhost
   */
  async checkStatus() {
    if (this._isChecking) return { connected: this.isConnected };
    this._isChecking = true;

    const urlsToTry = [this.serverUrl];
    if (this.serverUrl.includes('localhost')) {
      urlsToTry.push(this.serverUrl.replace('localhost', '127.0.0.1'));
    } else if (this.serverUrl.includes('127.0.0.1')) {
      urlsToTry.push(this.serverUrl.replace('127.0.0.1', 'localhost'));
    }

    let success = false;
    let responseData = null;

    for (const url of urlsToTry) {
      try {
        const response = await fetch(`${url}/api/status`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'ngrok-skip-browser-warning': 'true'
          },
          signal: AbortSignal.timeout(2500)
        });

        if (response.ok) {
          responseData = await response.json();
          this.serverUrl = url;
          success = true;
          break;
        }
      } catch {
        // Continuar probando
      }
    }

    this._isChecking = false;
    const previous = this.isConnected;
    this.isConnected = success;

    if (previous !== success) {
      this._emit('connection_change', { connected: success, data: responseData });
    }

    return { connected: success, data: responseData };
  }

  /**
   * Obtener correos sincronizados desde la base de datos SQLite de la PC
   */
  async fetchEmails() {
    const response = await fetch(`${this.serverUrl}/api/emails`, {
      headers: {
        'Accept': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      }
    });
    if (!response.ok) throw new Error('Error al obtener correos del Host PC');
    const result = await response.json();
    return result.emails || [];
  }

  /**
   * Enviar o encolar correo a través del motor SMTP de la PC
   */
  async sendEmail(emailData) {
    const response = await fetch(`${this.serverUrl}/api/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify(emailData)
    });
    if (!response.ok) throw new Error('Error al despachar correo vía PC Host');
    return await response.json();
  }

  /**
   * Conectar canal de eventos push en tiempo real (Server-Sent Events)
   */
  connectEvents(onMessage = null) {
    if (onMessage) this.listeners.add(onMessage);
    if (this.eventSource) return;

    try {
      this.eventSource = new EventSource(`${this.serverUrl}/api/events`);

      this.eventSource.onopen = () => {
        this.isConnected = true;
        this._emit('connected');
      };

      this.eventSource.addEventListener('mail_received', (e) => {
        this._emit('mail_received', JSON.parse(e.data));
      });

      this.eventSource.addEventListener('email_sent', (e) => {
        this._emit('email_sent', JSON.parse(e.data));
      });

      this.eventSource.addEventListener('email_queued', (e) => {
        this._emit('email_queued', JSON.parse(e.data));
      });

      this.eventSource.addEventListener('sync_completed', (e) => {
        this._emit('sync_completed', JSON.parse(e.data));
      });

      this.eventSource.addEventListener('network_status', (e) => {
        this._emit('network_status', JSON.parse(e.data));
      });

      this.eventSource.onerror = () => {
        this.isConnected = false;
        this._emit('disconnected');
        this.disconnectEvents();
        // Intentar reconectar tras pausa
        setTimeout(() => this.checkStatus(), 5000);
      };
    } catch (err) {
      console.warn('[PmailLanConnector] No se pudo abrir canal de eventos:', err);
    }
  }

  disconnectEvents() {
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {}
      this.eventSource = null;
    }
  }

  startAutoSync(intervalMs = 8000) {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setInterval(async () => {
      const status = await this.checkStatus();
      if (status.connected && !this.eventSource) {
        this.connectEvents();
      }
    }, intervalMs);
  }

  stopAutoSync() {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  _emit(type, data = null) {
    for (const listener of this.listeners) {
      try {
        listener({ type, data });
      } catch (err) {
        console.error('Error en listener LAN:', err);
      }
    }
  }

  on(listener) {
    this.listeners.add(listener);
  }

  off(listener) {
    this.listeners.delete(listener);
  }
}

window.PmailLanConnector = PmailLanConnector;
