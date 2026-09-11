# Pmail - Motor de Sincronización Offline-First y Respaldo en la Nube

Arquitectura y motor de sincronización para **Pmail**, un cliente de correo de escritorio para PC con soporte nativo de dominios personalizados (`@pac.p` y `@pacur.p`).

---

## 🏛 Arquitectura del Sistema

```
                      +-----------------------------+
                      |   Interfaz de Usuario UI    |
                      | (Redactar, Bandejas, etc.)  |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |      SyncOrchestrator       |
                      +---+----------+----------+---+
                          |          |          |
         +----------------+          |          +----------------+
         |                           |                           |
         v                           v                           v
+------------------+       +------------------+       +-------------------+
|  NetworkMonitor  |       |   PmailDatabase  |       |   OutboxWorker    |
| (DNS + HTTP 204) |       | (SQLite WAL Mode)|       | (Cola + Retries)  |
+------------------+       +--------+---------+       +---------+---------+
                                    |                           |
                                    v                           v
                           +------------------+       +-------------------+
                           |  BackupPackager  |       | Despachador SMTP  |
                           |  (AES-256-GCM)   |       | @pac.p / @pacur.p |
                           +--------+---------+       +-------------------+
                                    |
                    +---------------+---------------+
                    |                               |
                    v                               v
         +--------------------+          +--------------------+
         | GoogleDriveProvider|          | TeraboxSyncProvider|
         | (Google Drive API) |          | (Local Sync Folder)|
         +--------------------+          +--------------------+
```

---

## 📂 Estructura del Proyecto

```
d:/pmail/
├── data/
│   ├── backups/                     # Paquetes de respaldo cifrados (.pmailpkg)
│   ├── terabox_sync/Pmail_Backups/  # Carpeta de sincronización local de TeraBox
│   └── pmail_local.db               # Base de datos SQLite (Modo WAL)
├── src/
│   ├── db/
│   │   └── database.js              # Capa SQLite con transacciones atómicas y colas
│   ├── network/
│   │   └── networkMonitor.js        # Detección multinivel de conectividad (DNS + HTTP)
│   ├── queue/
│   │   └── outboxWorker.js          # Despachador de cola con backoff exponencial
│   ├── backup/
│   │   ├── backupPackager.js        # Empaquetado cifrado AES-256-GCM + SHA-256
│   │   └── providers/
│   │       ├── googleDriveProvider.js  # Integración oficial Google Drive API v3
│   │       └── teraboxSyncProvider.js  # Sincronización atómica para cliente TeraBox
│   ├── sync/
│   │   └── syncOrchestrator.js      # Orquestador del ciclo de vida y eventos
│   └── index.js                     # Punto de entrada y demostración ejecutable
└── package.json
```

---

## 🚀 Cómo Ejecutar la Demostración

No requiere instalación de compiladores C++ adicionales, ya que aprovecha `node:sqlite` nativo en Node.js 22+:

```bash
node src/index.js
```
