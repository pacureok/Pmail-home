/**
 * Pmail - Google Apps Script Web App Adapter (Google for Developers)
 * Permite desplegar Pmail como una Web App gratuita alojada en Google Cloud / Workspace.
 */

function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Page');
  return template.evaluate()
    .setTitle('Pmail Web Client (@pac.p / @pacur.p)')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Endpoint de envío de correos utilizando la API de Gmail de Google Apps Script
 * Soporta envíos y enrutamiento con alias personalizados
 */
function sendEmailGoogle(to, subject, body, fromAlias) {
  try {
    GmailApp.sendEmail(to, subject, body, {
      from: fromAlias || 'contacto@pac.p',
      name: 'Pmail Client'
    });
    return { success: true, timestamp: Date.now() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Obtener correos recientes de la cuenta
 */
function getRecentEmails() {
  try {
    const threads = GmailApp.getInboxThreads(0, 20);
    const emails = [];

    threads.forEach(thread => {
      const messages = thread.getMessages();
      const lastMsg = messages[messages.length - 1];

      emails.push({
        id: lastMsg.getId(),
        from_address: lastMsg.getFrom(),
        to_address: lastMsg.getTo(),
        subject: lastMsg.getSubject(),
        body_text: lastMsg.getPlainBody(),
        folder: 'inbox',
        status: 'SYNCED',
        created_at: lastMsg.getDate().getTime()
      });
    });

    return { success: true, emails };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
