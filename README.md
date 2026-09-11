# Pmail - Sistema de Correo Revolucionario con Dominios @pac.p y @pacur.p

Pmail es un ecosistema completo de correo electrónico *offline-first* dividido en dos arquitecturas complementarias:

---

## 📂 Estructura General del Proyecto

```
d:/pmail/
├── pc/                                   # APLICACIÓN DE ESCRITORIO NATIVA
│   ├── package.json                      # Scripts y dependencias de Electron
│   ├── data/                             # Base de datos SQLite y snapshots cifrados
│   ├── test/
│   │   └── testSmtp.js                   # Test integral de servidor SMTP y LAN
│   └── src/
│       ├── main.js                       # Proceso Principal Electron (Tray, IPC, Ventana)
│       ├── preload.js                    # ContextBridge seguro hacia el frontend
│       ├── server/
│       │   ├── smtpServer.js             # Servidor SMTP RFC 5321 nativo (Port 2525)
│       │   └── lanSyncServer.js          # Servidor LAN HTTP/SSE para cliente Web (Port 7890)
│       ├── db/database.js                # Base de datos SQLite (Modo WAL)
│       ├── network/networkMonitor.js     # Detector activo de red (DNS + HTTP 204)
│       ├── queue/outboxWorker.js         # Cola de salida con reintentos exponenciales
│       ├── backup/                       # Empaquetado AES-256-GCM + Google Drive & TeraBox
│       ├── sync/syncOrchestrator.js      # Orquestador del ciclo de vida
│       └── ui/                           # GUI avanzada estilo Superhuman/Spark
│           ├── index.html                # Shell frameless moderna
│           ├── styles.css                # Sistema de diseño dark/light y glassmorphism
│           └── app.js                    # Atajos de teclado (C, J, K, Ctrl+K), widgets y estado
│
└── web/                                  # VERSIÓN WEB / CLOUD CLIENT
    ├── index.html                        # Interfaz Web idéntica a la versión de PC
    ├── styles.css                        # Estilos responsivos cross-platform
    ├── manifest.json                     # Soporte PWA para instalación en navegador
    ├── serve.js                          # Servidor HTTP estático de previsualización (Port 3000)
    ├── package.json
    ├── js/
    │   ├── app.js                        # Controlador Web UI
    │   ├── db.js                         # Persistencia local en navegador con IndexedDB
    │   ├── backupReader.js               # Lector .pmailpkg y exportador JSON con Web Crypto
    │   └── lanConnector.js               # Sincronización en tiempo real con la app de PC
    └── apps-script/                      # Adaptador para Google Apps Script
        ├── Code.gs                       # Backend Apps Script con API Gmail / Google Cloud
        └── Page.html                     # Plantilla HTML para Google for Developers
```

---

## ⚡ Guía Rápida de Uso

### 1. Probar el Servidor SMTP y Servidor LAN de la PC:
```bash
cd pc
node test/testSmtp.js
```

### 2. Ejecutar la Simulación del Motor de Respaldo Offline y Nube (PC):
```bash
cd pc
node src/index.js
```

### 3. Iniciar la Aplicación de Escritorio Nativa (Electron):
```bash
cd pc
npm start
```

### 4. Iniciar y Previsualizar la Versión Web:
```bash
cd web
npm start
# Abrir en el navegador: http://localhost:3000
```

---

## 🔑 Atajos de Teclado (Estilo Superhuman)

| Tecla | Acción |
|---|---|
| `C` | Redactar nuevo correo |
| `J` / `K` | Navegar al correo siguiente / anterior |
| `Ctrl + K` / `Cmd + K` | Abrir Paleta de Comandos rápida |
| `E` | Archivar correo seleccionado |
| `Esc` | Cerrar compositor o modales |
