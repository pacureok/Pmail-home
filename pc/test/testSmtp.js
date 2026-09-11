const net = require('net');
const http = require('http');
const path = require('path');
const { PmailDatabase } = require('../src/db/database');
const PmailSmtpServer = require('../src/server/smtpServer');
const LanSyncServer = require('../src/server/lanSyncServer');

async function testServers() {
  console.log('--- TEST 1: INICIANDO SERVIDOR SMTP Y BASE DE DATOS ---');
  const db = new PmailDatabase(path.resolve(__dirname, '../data/test_pmail.db'));
  const smtpServer = new PmailSmtpServer({ db, port: 2526 });
  await smtpServer.start();

  console.log('\n--- TEST 2: ENVIANDO CORREO RFC 5321 A TRAVÉS DEL SOCKET TCP ---');
  const client = new net.Socket();

  let conversationLog = [];

  await new Promise((resolve, reject) => {
    client.connect(2526, '127.0.0.1', () => {
      console.log('✔ Conexión TCP establecida con el servidor SMTP');
    });

    let step = 0;
    client.setEncoding('utf8');

    client.on('data', (data) => {
      conversationLog.push(`S: ${data.trim()}`);
      // console.log(`S: ${data.trim()}`);

      if (step === 0 && data.startsWith('220')) {
        client.write('EHLO client.pac.p\r\n');
        conversationLog.push('C: EHLO client.pac.p');
        step = 1;
      } else if (step === 1 && data.includes('250 HELP')) {
        client.write('MAIL FROM:<contacto@pac.p>\r\n');
        conversationLog.push('C: MAIL FROM:<contacto@pac.p>');
        step = 2;
      } else if (step === 2 && data.startsWith('250')) {
        client.write('RCPT TO:<gerencia@pacur.p>\r\n');
        conversationLog.push('C: RCPT TO:<gerencia@pacur.p>');
        step = 3;
      } else if (step === 3 && data.startsWith('250')) {
        client.write('DATA\r\n');
        conversationLog.push('C: DATA');
        step = 4;
      } else if (step === 4 && data.startsWith('354')) {
        const emailContent =
          'Subject: Prueba de Protocolo SMTP Local Pmail\r\n' +
          'From: contacto@pac.p\r\n' +
          'To: gerencia@pacur.p\r\n' +
          'Date: Fri, 11 Sep 2026 15:50:00 -0600\r\n' +
          '\r\n' +
          'Hola equipo PAC,\r\n' +
          'Este es un mensaje procesado por el motor SMTP nativo de Pmail en Node.js.\r\n' +
          'Verificación de dominios @pac.p y @pacur.p exitosa.\r\n' +
          '.\r\n';
        client.write(emailContent);
        conversationLog.push('C: [DATA RAW EMAIL RFC 822]');
        step = 5;
      } else if (step === 5 && data.startsWith('250')) {
        console.log('✔ Servidor aceptó el correo y retornó código 250');
        client.write('QUIT\r\n');
        step = 6;
      } else if (step === 6 && data.startsWith('221')) {
        client.end();
        resolve();
      }
    });

    client.on('error', reject);
  });

  // Verificar que el correo esté guardado en SQLite
  const emails = db.getAllEmails();
  console.log(`✔ Correos en base de datos SQLite tras recepción SMTP: ${emails.length}`);
  console.table(emails);

  console.log('\n--- TEST 3: PROBANDO SERVIDOR LAN SYNC HTTP ---');
  const lanServer = new LanSyncServer({ db, port: 7891 });
  await lanServer.start();

  await new Promise((resolve) => {
    http.get('http://127.0.0.1:7891/api/status', (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log('✔ Respuesta de /api/status LAN:', body);
        resolve();
      });
    });
  });

  await smtpServer.stop();
  await lanServer.stop();
  console.log('\n=== TODOS LOS TESTS PASARON EXITOSAMENTE ===');
  process.exit(0);
}

testServers().catch(err => {
  console.error('Error en test:', err);
  process.exit(1);
});
