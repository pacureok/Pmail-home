const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pmailAPI', {
  // Operaciones de Correo
  getEmails: () => ipcRenderer.invoke('get-emails'),
  getEmailById: (id) => ipcRenderer.invoke('get-email-by-id', id),
  sendEmail: (data) => ipcRenderer.invoke('send-email', data),
  saveDraft: (data) => ipcRenderer.invoke('save-draft', data),

  // Estado del Sistema y Red
  getNetworkStatus: () => ipcRenderer.invoke('get-network-status'),
  triggerSync: () => ipcRenderer.invoke('trigger-sync'),
  getBackupStatus: () => ipcRenderer.invoke('get-backup-status'),

  // Eventos Push hacia el Frontend
  onMailReceived: (callback) => ipcRenderer.on('mail-received', (event, val) => callback(val)),
  onNetworkChange: (callback) => ipcRenderer.on('network-change', (event, val) => callback(val)),
  onSyncCompleted: (callback) => ipcRenderer.on('sync-completed', (event, val) => callback(val)),

  // Controles de Ventana (Estilo Frameless Moderno)
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // Notificaciones nativas
  notify: (title, body) => ipcRenderer.send('show-notification', { title, body })
});
