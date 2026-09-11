/**
 * Pmail Web - Módulo de Autenticación de Usuario (Estilo Gmail / Google Account)
 * Gestiona el registro, inicio de sesión, hash criptográfico y persistencia de cuentas @pac.p y @pacur.p
 */
class PmailAuth {
  constructor() {
    this.STORAGE_KEY_USERS = 'pmail_accounts_v1';
    this.STORAGE_KEY_SESSION = 'pmail_active_session_v1';
    this.onAuthChangeCallbacks = new Set();
  }

  /**
   * Hashear contraseña en el navegador con SHA-256 usando Web Crypto API
   */
  async hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + '_pmail_salt_pac_2026');
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Obtener todas las cuentas registradas en este navegador
   */
  getRegisteredUsers() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY_USERS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /**
   * Obtener usuario actualmente con sesión activa
   */
  getCurrentUser() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY_SESSION);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /**
   * Registrar una nueva cuenta @pac.p o @pacur.p
   */
  async register({ fullName, username, domain, password }) {
    const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (!cleanUser) {
      throw new Error('El nombre de usuario debe contener caracteres válidos (a-z, 0-9, puntos o guiones).');
    }

    const cleanDomain = domain === '@pacur.p' ? '@pacur.p' : '@pac.p';
    const email = `${cleanUser}${cleanDomain}`;

    const users = this.getRegisteredUsers();
    const exists = users.some(u => u.email === email);
    if (exists) {
      throw new Error(`La cuenta ${email} ya existe en este navegador. Por favor inicia sesión.`);
    }

    const passwordHash = await this.hashPassword(password);
    const newUser = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      fullName: fullName.trim(),
      username: cleanUser,
      domain: cleanDomain,
      email,
      passwordHash,
      avatarColor: this._getRandomGradient(),
      createdAt: Date.now()
    };

    users.push(newUser);
    localStorage.setItem(this.STORAGE_KEY_USERS, JSON.stringify(users));

    // Iniciar sesión automáticamente
    this._setSession(newUser);
    return newUser;
  }

  /**
   * Iniciar sesión con email o usuario y contraseña
   */
  async login(emailOrUsername, password) {
    const query = emailOrUsername.trim().toLowerCase();
    const users = this.getRegisteredUsers();

    const user = users.find(u =>
      u.email === query ||
      u.username === query ||
      `${u.username}@pac.p` === query ||
      `${u.username}@pacur.p` === query
    );

    if (!user) {
      throw new Error('No se encontró ninguna cuenta registrada con ese correo o usuario.');
    }

    const inputHash = await this.hashPassword(password);
    if (user.passwordHash !== inputHash) {
      throw new Error('Contraseña incorrecta. Por favor verifica tus credenciales.');
    }

    this._setSession(user);
    return user;
  }

  /**
   * Cerrar sesión activa
   */
  logout() {
    localStorage.removeItem(this.STORAGE_KEY_SESSION);
    this._notifyAuthChange(null);
  }

  _setSession(user) {
    const sessionData = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      username: user.username,
      domain: user.domain,
      avatarColor: user.avatarColor || 'from-indigo-600 to-violet-500',
      loginAt: Date.now()
    };

    localStorage.setItem(this.STORAGE_KEY_SESSION, JSON.stringify(sessionData));
    this._notifyAuthChange(sessionData);
  }

  _notifyAuthChange(user) {
    for (const cb of this.onAuthChangeCallbacks) {
      try {
        cb(user);
      } catch (err) {
        console.error('Error en listener de auth:', err);
      }
    }
  }

  onAuthChange(callback) {
    this.onAuthChangeCallbacks.add(callback);
  }

  _getRandomGradient() {
    const gradients = [
      'from-indigo-600 to-violet-500',
      'from-blue-600 to-cyan-500',
      'from-emerald-600 to-teal-500',
      'from-purple-600 to-pink-500',
      'from-rose-600 to-orange-500'
    ];
    return gradients[Math.floor(Math.random() * gradients.length)];
  }
}

window.PmailAuth = PmailAuth;
