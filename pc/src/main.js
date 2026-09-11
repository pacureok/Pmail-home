const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage } = require('electron');
const path = require('path');

const { PmailDatabase } = require('./db/database');
const NetworkMonitor = require('./network/networkMonitor');
const BackupPackager = require('./backup/backupPackager');
const OutboxWorker = require('./queue/outboxWorker');
const GoogleDriveProvider = require('./backup/providers/googleDriveProvider');
const TeraboxSyncProvider = require('./backup/providers/teraboxSyncProvider');
const SyncOrchestrator = require('./sync/syncOrchestrator');
const PmailSmtpServer = require('./server/smtpServer');
const LanSyncServer = require('./server/lanSyncServer');

let mainWindow = null;
let tray = null;
let orchestrator = null;
let db = null;
let smtpServer = null;
let lanServer = null;

function createTrayIcon() {
  // Crear un icono simple si no existe archivo .ico o .png
  const size = 16;
  const canvasBuffer = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    canvasBuffer[i * 4] = 99;     // R (Indigo accent)
    canvasBuffer[i * 4 + 1] = 102; // G
    canvasBuffer[i * 4 + 2] = 241; // B
    canvasBuffer[i * 4 + 3] = 255; // A
  }
  return nativeImage.createFromBuffer(canvasBuffer, { width: size, height: size });
}

function showNativeNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({
      title: title || 'Pmail',
      body: body || '',
      icon: createTrayIcon()
    }).show();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    frame: false, // Frameless para diseño ultramoderno tipo Superhuman/Spark
    titleBarStyle: 'hidden',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'ui/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupTray() {
  try {
    const icon = createTrayIcon();
    tray = new Tray(icon);

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Pmail Desktop (@pac.p / @pacur.p)', enabled: false },
      { type: 'separator' },
      {
        label: 'Abrir Pmail',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            createWindow();
          }
        }
      },
      {
        label: 'Forzar Sincronización en Nube',
        click: () => {
          if (orchestrator) orchestrator.triggerFullSync();
        }
      },
      { type: 'separator' },
      {
        label: 'Salir de Pmail',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setToolTip('Pmail - Cliente Offline-First');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
      }
    });
  } catch (err) {
    console.warn(`[Tray] No se pudo inicializar la bandeja del sistema: ${err.message}`);
  }
}

// Inicialización de los servicios de fondo
async function initBackendServices() {
  console.log('[Main] Inicializando base de datos y servicios de Pmail...');

  db = new PmailDatabase();

  const networkMonitor = new NetworkMonitor({ checkIntervalMs: 8000 });
  const backupPackager = new BackupPackager({
    backupDir: path.resolve(__dirname, '../data/backups')
  });

  const googleDriveProvider = new GoogleDriveProvider({ mockMode: true });
  const teraboxProvider = new TeraboxSyncProvider({
    syncPath: path.resolve(__dirname, '../data/terabox_sync/Pmail_Backups')
  });

  const outboxWorker = new OutboxWorker({ db });

  orchestrator = new SyncOrchestrator({
    db,
    networkMonitor,
    outboxWorker,
    backupPackager,
    cloudProviders: [googleDriveProvider, teraboxProvider]
  });

  // Iniciar monitor de red
  networkMonitor.start();

  // Iniciar servidor SMTP local en puerto 2525
  smtpServer = new PmailSmtpServer({ db, port: 2525 });
  try {
    await smtpServer.start();
  } catch (err) {
    console.warn(`[Main] Advertencia SMTP: ${err.message}`);
  }

  // Iniciar servidor LAN para cliente Web en puerto 7890
  lanServer = new LanSyncServer({ db, orchestrator, port: 7890 });
  try {
    await lanServer.start();
  } catch (err) {
    console.warn(`[Main] Advertencia LAN Server: ${err.message}`);
  }

  // Notificar al frontend y al servidor LAN ante correos entrantes del servidor SMTP
  smtpServer.on('mail_received', (email) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mail-received', email);
    }
    if (lanServer) {
      lanServer.broadcast('mail_received', email);
    }
    showNativeNotification(`Nuevo correo para ${email.to_address}`, `De: ${email.from_address}\nAsunto: ${email.subject}`);
  });

  // Notificar cambios de red
  networkMonitor.on('status_change', (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('network-change', status);
    }
    if (lanServer) {
      lanServer.broadcast('network_status', status);
    }
  });

  // Notificar sincronización
  orchestrator.on('sync_completed', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sync-completed', info);
    }
    if (lanServer) {
      lanServer.broadcast('sync_completed', info);
    }
  });
}

// Registro de IPC Handlers
function setupIpcHandlers() {
  ipcMain.handle('get-emails', () => {
    return db.getAllEmails();
  });

  ipcMain.handle('get-email-by-id', (event, id) => {
    return db.getEmailById(id);
  });

  ipcMain.handle('send-email', async (event, data) => {
    return await orchestrator.sendEmail(data);
  });

  ipcMain.handle('save-draft', (event, data) => {
    return orchestrator.saveDraft(data);
  });

  ipcMain.handle('get-network-status', () => {
    return {
      isOnline: orchestrator?.networkMonitor?.isOnline ?? true
    };
  });

  ipcMain.handle('trigger-sync', async () => {
    await orchestrator.triggerFullSync();
    return { success: true };
  });

  ipcMain.handle('get-backup-status', () => {
    return {
      unbackedUp: db.getUnbackedUpItems().length
    };
  });

  // Controles de ventana frameless
  ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow) {
      mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    }
  });

  ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
  });

  ipcMain.on('show-notification', (event, { title, body }) => {
    showNativeNotification(title, body);
  });
}

app.whenReady().then(async () => {
  await initBackendServices();
  setupIpcHandlers();
  createWindow();
  setupTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // En Windows se puede mantener en segundo plano o cerrar
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (smtpServer) await smtpServer.stop();
  if (lanServer) await lanServer.stop();
});
