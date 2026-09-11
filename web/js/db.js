/**
 * Pmail Web Client - Capa de Persistencia Local IndexedDB
 * Permite que la versión Web funcione de forma 100% offline en el navegador.
 */
class PmailWebDatabase {
  constructor(dbName = 'pmail_web_db', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }

  async open() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Almacén de correos (recibidos, enviados y sincronizados)
        if (!db.objectStoreNames.contains('emails')) {
          const emailStore = db.createObjectStore('emails', { keyPath: 'id' });
          emailStore.createIndex('folder', 'folder', { unique: false });
          emailStore.createIndex('status', 'status', { unique: false });
          emailStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // Almacén de borradores
        if (!db.objectStoreNames.contains('drafts')) {
          const draftStore = db.createObjectStore('drafts', { keyPath: 'id' });
          draftStore.createIndex('updated_at', 'updated_at', { unique: false });
        }

        // Almacén de configuración local
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getAllEmails() {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('emails', 'readonly');
      const store = tx.objectStore('emails');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async saveEmail(email) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('emails', 'readwrite');
      const store = tx.objectStore('emails');
      const req = store.put(email);
      req.onsuccess = () => resolve(email);
      req.onerror = () => reject(req.error);
    });
  }

  async saveEmailsBatch(emails) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('emails', 'readwrite');
      const store = tx.objectStore('emails');
      for (const email of emails) {
        store.put(email);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async saveDraft(draft) {
    await this.open();
    draft.updated_at = Date.now();
    if (!draft.id) draft.id = `draft_web_${Date.now()}`;

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('drafts', 'readwrite');
      const store = tx.objectStore('drafts');
      const req = store.put(draft);
      req.onsuccess = () => resolve(draft);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllDrafts() {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('drafts', 'readonly');
      const store = tx.objectStore('drafts');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteEmail(id) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('emails', 'readwrite');
      const store = tx.objectStore('emails');
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

window.PmailWebDatabase = PmailWebDatabase;
