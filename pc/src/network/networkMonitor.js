const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const EventEmitter = require('events');

class NetworkMonitor extends EventEmitter {
  /**
   * @param {Object} options
   * @param {number} options.checkIntervalMs Intervalo de comprobación en milisegundos (default: 5000ms)
   * @param {number} options.timeoutMs Timeout por prueba de red (default: 3000ms)
   * @param {string[]} options.dnsHosts Hosts para verificación DNS rápida
   * @param {string[]} options.httpEndpoints Endpoints HTTP rápidos para validación de salida a Internet
   */
  constructor(options = {}) {
    super();
    this.checkIntervalMs = options.checkIntervalMs || 5000;
    this.timeoutMs = options.timeoutMs || 3000;
    this.dnsHosts = options.dnsHosts || ['dns.google', '1.1.1.1'];
    this.httpEndpoints = options.httpEndpoints || [
      'http://clients3.google.com/generate_204',
      'http://connectivitycheck.gstatic.com/generate_204'
    ];

    this._isOnline = null; // null = desconocido al iniciar
    this._intervalId = null;
    this._consecutiveFailures = 0;
    this._consecutiveSuccesses = 0;
    this._isChecking = false;
  }

  get isOnline() {
    return this._isOnline === true;
  }

  start() {
    if (this._intervalId) return;
    // Comprobación inmediata
    this.checkConnection();
    // Sondeo periódico activo
    this._intervalId = setInterval(() => {
      this.checkConnection();
    }, this.checkIntervalMs);
  }

  stop() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  /**
   * Forzar comprobación activa de conectividad
   * Combina DNS rápido con sondeo HTTP 204 para evitar falsos positivos
   * (por ejemplo, WiFi conectado pero sin salida real a Internet).
   */
  async checkConnection() {
    if (this._isChecking) return this.isOnline;
    this._isChecking = true;

    let hasConnection = false;

    try {
      // 1. Prueba DNS rápida
      hasConnection = await this._probeDNS();

      // 2. Si DNS es exitoso, confirmamos salida HTTP real (genera_204)
      if (hasConnection) {
        hasConnection = await this._probeHTTP();
      }
    } catch {
      hasConnection = false;
    } finally {
      this._isChecking = false;
      this._updateStatus(hasConnection);
    }

    return hasConnection;
  }

  async _probeDNS() {
    for (const host of this.dnsHosts) {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('DNS Timeout')), this.timeoutMs)
        );
        await Promise.race([dns.lookup(host), timeoutPromise]);
        return true;
      } catch {
        // Continuar probando el siguiente host
      }
    }
    return false;
  }

  async _probeHTTP() {
    for (const endpoint of this.httpEndpoints) {
      try {
        const reachable = await new Promise((resolve) => {
          const client = endpoint.startsWith('https') ? https : http;
          const req = client.get(endpoint, { timeout: this.timeoutMs }, (res) => {
            // Un código 204 o 200 indica salida libre a internet
            resolve(res.statusCode === 204 || res.statusCode === 200);
            res.resume();
          });

          req.on('timeout', () => {
            req.destroy();
            resolve(false);
          });

          req.on('error', () => {
            resolve(false);
          });
        });

        if (reachable) return true;
      } catch {
        // Probar siguiente endpoint
      }
    }
    return false;
  }

  _updateStatus(newStatus) {
    const previousStatus = this._isOnline;

    if (newStatus) {
      this._consecutiveSuccesses++;
      this._consecutiveFailures = 0;
    } else {
      this._consecutiveFailures++;
      this._consecutiveSuccesses = 0;
    }

    // Debounce / Filtro de ruido: Confirmar cambio de estado tras 1 verificación consistente
    if (this._isOnline !== newStatus) {
      this._isOnline = newStatus;

      this.emit('status_change', {
        isOnline: this._isOnline,
        previousStatus: previousStatus,
        timestamp: Date.now()
      });

      if (this._isOnline) {
        this.emit('online', { timestamp: Date.now() });
      } else {
        this.emit('offline', { timestamp: Date.now() });
      }
    }
  }

  // Método para simulación de pruebas offline/online
  setSimulatedStatus(status) {
    this._updateStatus(status);
  }
}

module.exports = NetworkMonitor;
