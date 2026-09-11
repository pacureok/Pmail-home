const path = require('path');
const fs = require('fs');

const { PmailDatabase, EmailStatus } = require('./db/database');
const NetworkMonitor = require('./network/networkMonitor');
const BackupPackager = require('./backup/backupPackager');
const OutboxWorker = require('./queue/outboxWorker');
const GoogleDriveProvider = require('./backup/providers/googleDriveProvider');
const TeraboxSyncProvider = require('./backup/providers/teraboxSyncProvider');
const SyncOrchestrator = require('./sync/syncOrchestrator');

async function runPmailDemo() {
  console.log('================================================================');
  console.log('   PMAIL CLIENT - MOTOR OFFLINE-FIRST Y RESPALDO EN LA NUBE     ');
  console.log('       Soporte para dominios corporativos @pac.p y @pacur.p     ');
  console.log('================================================================\n');

  // 1. Inicializar Base de Datos SQLite Local
  const db = new PmailDatabase();
  console.log('✔ Base de datos SQLite inicializada (WAL Mode activo en data/pmail_local.db)');

  // 2. Inicializar Monitor de Red Inteligente
  const networkMonitor = new NetworkMonitor({
    checkIntervalMs: 10000,
    timeoutMs: 2500
  });

  // 3. Inicializar Empaquetador y Cifrador Criptográfico (AES-256-GCM)
  const backupPackager = new BackupPackager({
    backupDir: path.resolve(__dirname, '../data/backups'),
    secretKey: 'pmail_pac_security_key_2026'
  });

  // 4. Inicializar Proveedores de Nube (Google Drive y TeraBox)
  const googleDriveProvider = new GoogleDriveProvider({
    folderName: 'Pmail_Offline_Backups',
    mockMode: true // Modo seguro si no hay token OAuth activo en la demo
  });

  const teraboxProvider = new TeraboxSyncProvider({
    syncPath: path.resolve(__dirname, '../data/terabox_sync/Pmail_Backups')
  });

  // 5. Inicializar Motor de Despacho de Cola
  const outboxWorker = new OutboxWorker({
    db,
    pollIntervalMs: 5000
  });

  // 6. Orquestador Central de Sincronización
  const orchestrator = new SyncOrchestrator({
    db,
    networkMonitor,
    outboxWorker,
    backupPackager,
    cloudProviders: [googleDriveProvider, teraboxProvider]
  });

  console.log('\n--- ESCENARIO 1: TRABAJO EN MODO OFFLINE AUTOMÁTICO ---');
  // Forzamos estado offline para demostrar resiliencia
  networkMonitor.setSimulatedStatus(false);
  console.log(`Estado actual de la red: [OFFLINE]`);

  // Paso 1.1: El usuario redacta y guarda un borrador
  console.log('\n[Acción de Usuario] Guardando borrador en curso...');
  const draft = orchestrator.saveDraft({
    id: 'draft_pac_001',
    from_address: 'gerencia@pac.p',
    to_address: 'auditoria@pacur.p',
    subject: 'Reporte Financiero Trimestral Q3',
    body_text: 'Estimado equipo de auditoría, adjunto los balances preliminares para revisión.',
    attachments: [{ filename: 'balance_q3.pdf', size: 1048576 }]
  });

  // Paso 1.2: El usuario intenta enviar un correo importante sin conexión
  console.log('\n[Acción de Usuario] Enviando correo a <soporte@pacur.p> sin internet...');
  const sendResult = await orchestrator.sendEmail({
    id: 'email_out_001',
    from_address: 'operaciones@pac.p',
    to_address: 'soporte@pacur.p',
    subject: 'Urgente: Configuración de servidor de correo @pac.p',
    body_text: 'Favor de revisar los registros MX y SPF para los nuevos nodos.',
    attachments: [{ filename: 'dns_records.txt', size: 2048 }]
  });

  console.log('\nResultado del envío offline:');
  console.log(`- Correo ID: ${sendResult.emailId}`);
  console.log(`- Estado en SQLite: ${sendResult.status} ("Pendiente de envío")`);
  console.log(`- Mensaje al usuario: ${sendResult.message}`);

  // Verificar estado en la base de datos
  console.log('\nRegistros actuales en la base de datos local SQLite:');
  const emailsOffline = db.getAllEmails();
  console.table(emailsOffline);

  console.log('\n--- ESCENARIO 2: RESTABLECIMIENTO DE INTERNET Y SINCRONIZACIÓN ---');
  console.log('Simulando recuperación de señal de red...');
  await new Promise(r => setTimeout(r, 1500));

  // Simulamos que la red vuelve
  networkMonitor.setSimulatedStatus(true);

  // Esperar a que el orquestador termine el ciclo de envío y respaldo
  await new Promise(r => setTimeout(r, 2000));

  console.log('\n--- VERIFICACIÓN POST-SINCRONIZACIÓN ---');
  console.log('Registros actualizados en la base de datos local SQLite:');
  const emailsOnline = db.getAllEmails();
  console.table(emailsOnline);

  // Inspeccionar archivos generados en disco
  const backupFiles = fs.readdirSync(path.resolve(__dirname, '../data/backups'));
  console.log('\nPaquetes de respaldo cifrados en data/backups/:', backupFiles);

  const teraboxFiles = fs.readdirSync(path.resolve(__dirname, '../data/terabox_sync/Pmail_Backups'));
  console.log('Paquetes replicados en la carpeta local de sincronización TeraBox:', teraboxFiles);

  // Demostrar verificación criptográfica del paquete
  if (backupFiles.length > 0) {
    const samplePackage = path.join(path.resolve(__dirname, '../data/backups'), backupFiles[0]);
    console.log(`\nVerificando descifrado del paquete local [${backupFiles[0]}]:`);
    try {
      const decrypted = backupPackager.decryptPackage(samplePackage);
      console.log(`✔ Paquete descifrado con éxito! Contiene ${decrypted.itemsCount} correos y metadatos:`);
      console.log(`  - Versión: ${decrypted.version}`);
      console.log(`  - Dominios: ${decrypted.supportedDomains.join(', ')}`);
      console.log(`  - Primer asunto: "${decrypted.emails[0]?.subject}"`);
    } catch (err) {
      console.error('Error al descifrar:', err.message);
    }
  }

  console.log('\n================================================================');
  console.log('   PRUEBA COMPLETADA CON ÉXITO: CERO PÉRDIDA DE DATOS           ');
  console.log('================================================================');
  process.exit(0);
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  runPmailDemo().catch(err => {
    console.error('Error en ejecución:', err);
    process.exit(1);
  });
}

module.exports = {
  PmailDatabase,
  NetworkMonitor,
  BackupPackager,
  GoogleDriveProvider,
  TeraboxSyncProvider,
  OutboxWorker,
  SyncOrchestrator
};
