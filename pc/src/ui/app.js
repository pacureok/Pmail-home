/**
 * Pmail Desktop UI Controller - Superhuman / Spark Experience
 */
(function () {
  // Estado local de la aplicación
  const state = {
    currentFolder: 'inbox',
    currentFilter: 'all',
    selectedEmailId: null,
    emails: [],
    isOnline: true,
    attachments: [],
    tasks: [
      { id: 1, text: 'Revisar registros MX del dominio @pac.p', done: false },
      { id: 2, text: 'Confirmar política SPF para @pacur.p', done: true },
      { id: 3, text: 'Configurar carpeta de sincronización TeraBox', done: false }
    ],
    contacts: [
      { name: 'Soporte Técnico', email: 'soporte@pacur.p', role: 'Soporte TI' },
      { name: 'Operaciones PAC', email: 'operaciones@pac.p', role: 'Gerencia' },
      { name: 'Auditoría Corporativa', email: 'auditoria@pacur.p', role: 'Finanzas' },
      { name: 'Contacto General', email: 'contacto@pac.p', role: 'Atención' }
    ]
  };

  // Referencias a elementos del DOM
  const dom = {
    emailList: document.getElementById('email-list'),
    emailCountLabel: document.getElementById('email-count-label'),
    emptyState: document.getElementById('empty-state'),
    emailView: document.getElementById('email-view'),
    viewSubject: document.getElementById('view-subject'),
    viewFrom: document.getElementById('view-from'),
    viewTo: document.getElementById('view-to'),
    viewDate: document.getElementById('view-date'),
    viewAvatar: document.getElementById('view-avatar'),
    viewBody: document.getElementById('view-body'),
    viewStatusBadge: document.getElementById('view-status-badge'),
    networkBadge: document.getElementById('network-badge'),
    badgeInbox: document.getElementById('badge-inbox'),
    badgeOutbox: document.getElementById('badge-outbox'),
    badgeDrafts: document.getElementById('badge-drafts'),
    // Compositor
    composerModal: document.getElementById('composer-modal'),
    composerFrom: document.getElementById('composer-from'),
    composerTo: document.getElementById('composer-to'),
    composerSubject: document.getElementById('composer-subject'),
    composerBody: document.getElementById('composer-body'),
    composerPreview: document.getElementById('composer-preview'),
    composerAttachments: document.getElementById('composer-attachments'),
    composerAttachInput: document.getElementById('composer-attach-input'),
    composerStatusTip: document.getElementById('composer-status-tip'),
    btnCompose: document.getElementById('btn-compose'),
    btnCloseComposer: document.getElementById('btn-close-composer'),
    btnTogglePreview: document.getElementById('btn-toggle-preview'),
    btnSaveDraft: document.getElementById('btn-save-draft'),
    btnSubmitSend: document.getElementById('btn-submit-send'),
    // Command Palette
    commandModal: document.getElementById('command-modal'),
    commandInput: document.getElementById('command-input'),
    btnCommandPalette: document.getElementById('btn-command-palette'),
    // Widgets
    calendarGrid: document.getElementById('calendar-grid'),
    tasksList: document.getElementById('tasks-list'),
    formAddTask: document.getElementById('form-add-task'),
    inputNewTask: document.getElementById('input-new-task'),
    tasksCount: document.getElementById('tasks-count'),
    contactsList: document.getElementById('contacts-list'),
    btnForceSync: document.getElementById('btn-force-sync'),
    btnThemeToggle: document.getElementById('btn-theme-toggle')
  };

  // Inicialización
  async function init() {
    renderCalendar();
    renderTasks();
    renderContacts();
    setupEventListeners();
    setupShortcuts();

    // Inicializar iconos Lucide si están disponibles
    if (window.lucide) window.lucide.createIcons();

    await refreshEmails();
    setupApiListeners();
  }

  // Cargar lista de correos
  async function refreshEmails() {
    try {
      if (window.pmailAPI) {
        state.emails = await window.pmailAPI.getEmails();
        const net = await window.pmailAPI.getNetworkStatus();
        updateNetworkBadge(net.isOnline);
      } else {
        // Modo demo fallback
        state.emails = [
          {
            id: 'msg_001',
            from_address: 'admin@pac.p',
            to_address: 'operaciones@pacur.p',
            subject: 'Bienvenido a Pmail Desktop (@pac.p / @pacur.p)',
            body_text: 'Bienvenido al cliente de correo Pmail. Tu cuenta @pac.p está activa con respaldo cifrado offline en Google Drive y TeraBox.',
            body_html: '<p>Bienvenido al cliente de correo <b>Pmail</b>.<br>Tu cuenta <code>@pac.p</code> está activa con respaldo cifrado offline en Google Drive y TeraBox.</p>',
            folder: 'inbox',
            status: 'SYNCED',
            created_at: Date.now() - 3600000
          },
          {
            id: 'msg_002',
            from_address: 'soporte@pacur.p',
            to_address: 'admin@pac.p',
            subject: 'Cola de Salida Offline Lista',
            body_text: 'Cualquier correo enviado sin conexión se almacenará en la cola SQLite local con estado Pendiente de envío.',
            body_html: '<p>Cualquier correo enviado sin conexión se almacenará en la cola SQLite local con estado <i>Pendiente de envío</i>.</p>',
            folder: 'outbox',
            status: 'PENDING_SEND',
            created_at: Date.now() - 1800000
          }
        ];
      }
    } catch (err) {
      console.error('Error al cargar correos:', err);
    }
    renderEmailList();
    updateBadges();
  }

  // Filtrar y renderizar lista
  function renderEmailList() {
    dom.emailList.innerHTML = '';

    const filtered = state.emails.filter(email => {
      // Filtro por carpeta
      if (state.currentFolder === 'inbox' && email.folder !== 'inbox') return false;
      if (state.currentFolder === 'outbox' && email.folder !== 'outbox' && email.status !== 'PENDING_SEND') return false;
      if (state.currentFolder === 'sent' && email.folder !== 'sent' && email.status !== 'SENT') return false;
      if (state.currentFolder === 'drafts' && email.folder !== 'drafts' && email.status !== 'DRAFT') return false;

      // Filtro por pestaña rápida
      if (state.currentFilter === 'pending') return email.status === 'PENDING_SEND';
      return true;
    });

    dom.emailCountLabel.textContent = `${filtered.length} correos`;

    if (filtered.length === 0) {
      dom.emailList.innerHTML = `
        <div class="p-8 text-center text-slate-500 text-xs">
          <p>No hay correos en esta bandeja.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(email => {
      const item = document.createElement('div');
      item.className = `email-item p-3 cursor-pointer border-b border-slate-800/40 ${state.selectedEmailId === email.id ? 'selected' : ''}`;
      item.dataset.id = email.id;

      const dateStr = new Date(email.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const statusColor = email.status === 'PENDING_SEND' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';

      item.innerHTML = `
        <div class="flex items-center justify-between mb-1">
          <span class="font-semibold text-xs text-slate-200 truncate max-w-[170px]">${email.from_address}</span>
          <span class="text-[10px] text-slate-500">${dateStr}</span>
        </div>
        <h4 class="text-xs font-medium text-slate-300 truncate mb-1">${email.subject || '(Sin Asunto)'}</h4>
        <p class="text-[11px] text-slate-400 line-clamp-2">${email.body_text || ''}</p>
        <div class="flex items-center gap-1.5 mt-2">
          <span class="px-1.5 py-0.5 rounded text-[9px] font-mono border ${statusColor}">${email.status}</span>
          <span class="text-[10px] text-slate-500">${email.folder}</span>
        </div>
      `;

      item.addEventListener('click', () => selectEmail(email.id));
      dom.emailList.appendChild(item);
    });
  }

  // Seleccionar correo para ver
  function selectEmail(id) {
    state.selectedEmailId = id;
    const email = state.emails.find(e => e.id === id);
    if (!email) return;

    dom.emptyState.classList.add('hidden');
    dom.emailView.classList.remove('hidden');

    dom.viewSubject.textContent = email.subject || '(Sin Asunto)';
    dom.viewFrom.textContent = email.from_address;
    dom.viewTo.textContent = `para ${email.to_address}`;
    dom.viewDate.textContent = new Date(email.created_at).toLocaleString();
    dom.viewAvatar.textContent = (email.from_address[0] || 'P').toUpperCase();
    dom.viewStatusBadge.textContent = email.status;

    // Renderizado seguro de HTML / texto
    dom.viewBody.innerHTML = email.body_html || `<p>${(email.body_text || '').replace(/\n/g, '<br>')}</p>`;

    // Actualizar clase seleccionada en lista
    document.querySelectorAll('.email-item').forEach(el => {
      el.classList.toggle('selected', el.dataset.id === id);
    });
  }

  // Actualizar contadores
  function updateBadges() {
    const inboxCount = state.emails.filter(e => e.folder === 'inbox').length;
    const outboxCount = state.emails.filter(e => e.status === 'PENDING_SEND' || e.folder === 'outbox').length;
    const draftsCount = state.emails.filter(e => e.status === 'DRAFT').length;

    dom.badgeInbox.textContent = inboxCount;
    dom.badgeOutbox.textContent = outboxCount;
    dom.badgeDrafts.textContent = draftsCount;
  }

  // Actualizar badge de red
  function updateNetworkBadge(isOnline) {
    state.isOnline = isOnline;
    if (isOnline) {
      dom.networkBadge.className = 'px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1';
      dom.networkBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Online';
    } else {
      dom.networkBadge.className = 'px-2 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1';
      dom.networkBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span> Offline (Modo Local)';
    }
  }

  // Abrir Compositor
  function openComposer(preset = {}) {
    dom.composerTo.value = preset.to || '';
    dom.composerSubject.value = preset.subject || '';
    dom.composerBody.value = preset.body || '';
    dom.composerModal.classList.remove('hidden');
    dom.composerTo.focus();
  }

  // Cerrar Compositor
  function closeComposer() {
    dom.composerModal.classList.add('hidden');
    state.attachments = [];
    renderComposerAttachments();
  }

  // Renderizar adjuntos en el compositor
  function renderComposerAttachments() {
    if (state.attachments.length === 0) {
      dom.composerAttachments.classList.add('hidden');
      dom.composerAttachments.innerHTML = '';
      return;
    }
    dom.composerAttachments.classList.remove('hidden');
    dom.composerAttachments.innerHTML = state.attachments.map((att, idx) => `
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
        <span>${att.name} (${(att.size / 1024).toFixed(1)} KB)</span>
        <button type="button" class="text-slate-400 hover:text-rose-400 ml-1" onclick="window.removeAttachment(${idx})">×</button>
      </span>
    `).join('');
  }

  window.removeAttachment = function (idx) {
    state.attachments.splice(idx, 1);
    renderComposerAttachments();
  };

  // Convertidor Markdown básico para previsualización
  function markdownToHtml(md) {
    let html = md
      .replace(/^### (.*$)/gim, '<h3 class="text-sm font-bold text-slate-200 mt-2 mb-1">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-base font-bold text-slate-100 mt-3 mb-1">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-lg font-bold text-white mt-4 mb-2">$1</h1>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      .replace(/`(.*?)`/gim, '<code class="px-1 py-0.5 rounded bg-slate-800 text-indigo-400 font-mono text-[11px]">$1</code>')
      .replace(/^\s*-\s+(.*$)/gim, '<li class="ml-4 list-disc">$1</li>')
      .replace(/\n/gim, '<br>');
    return html;
  }

  // Event Listeners Principales
  function setupEventListeners() {
    // Carpetas
    document.querySelectorAll('.nav-folder').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-folder').forEach(b => {
          b.classList.remove('active', 'bg-slate-800/80', 'text-slate-200');
          b.classList.add('text-slate-400');
        });
        btn.classList.add('active', 'bg-slate-800/80', 'text-slate-200');
        state.currentFolder = btn.dataset.folder;
        renderEmailList();
      });
    });

    // Pestañas de filtro
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => {
          b.classList.remove('active', 'bg-slate-700/80', 'text-slate-200');
          b.classList.add('text-slate-400');
        });
        btn.classList.add('active', 'bg-slate-700/80', 'text-slate-200');
        state.currentFilter = btn.dataset.filter;
        renderEmailList();
      });
    });

    // Compositor
    dom.btnCompose.addEventListener('click', () => openComposer());
    dom.btnCloseComposer.addEventListener('click', closeComposer);

    // Toggle Vista Previa Markdown
    dom.btnTogglePreview.addEventListener('click', () => {
      const isHidden = dom.composerPreview.classList.contains('hidden');
      if (isHidden) {
        dom.composerPreview.innerHTML = markdownToHtml(dom.composerBody.value || '');
        dom.composerPreview.classList.remove('hidden');
        dom.btnTogglePreview.innerHTML = '<i data-lucide="edit-3" class="w-3 h-3"></i> Volver a Editor';
      } else {
        dom.composerPreview.classList.add('hidden');
        dom.btnTogglePreview.innerHTML = '<i data-lucide="eye" class="w-3 h-3"></i> Vista Previa Markdown';
      }
      if (window.lucide) window.lucide.createIcons();
    });

    // Adjuntar archivos
    dom.composerAttachInput.addEventListener('change', (e) => {
      for (const file of e.target.files) {
        state.attachments.push({ name: file.name, size: file.size });
      }
      renderComposerAttachments();
    });

    // Enviar Correo
    dom.btnSubmitSend.addEventListener('click', async () => {
      const to = dom.composerTo.value.trim();
      const subject = dom.composerSubject.value.trim();
      const body = dom.composerBody.value;
      const from = dom.composerFrom.value;

      if (!to) {
        alert('Por favor, ingresa el destinatario.');
        return;
      }

      dom.btnSubmitSend.disabled = true;
      dom.btnSubmitSend.textContent = 'Enviando...';

      const emailData = {
        from_address: from,
        to_address: to,
        subject: subject || '(Sin Asunto)',
        body_text: body,
        body_html: markdownToHtml(body),
        attachments: state.attachments
      };

      try {
        if (window.pmailAPI) {
          const res = await window.pmailAPI.sendEmail(emailData);
          if (res.queued) {
            alert('Sin conexión: Correo guardado en Cola de Salida local (Pendiente de envío).');
          }
        }
        await refreshEmails();
        closeComposer();
      } catch (err) {
        alert('Error al enviar correo: ' + err.message);
      } finally {
        dom.btnSubmitSend.disabled = false;
        dom.btnSubmitSend.innerHTML = '<i data-lucide="send" class="w-3.5 h-3.5"></i> Enviar';
        if (window.lucide) window.lucide.createIcons();
      }
    });

    // Guardar Borrador
    dom.btnSaveDraft.addEventListener('click', async () => {
      const draftData = {
        from_address: dom.composerFrom.value,
        to_address: dom.composerTo.value.trim(),
        subject: dom.composerSubject.value.trim(),
        body_text: dom.composerBody.value,
        attachments: state.attachments
      };
      if (window.pmailAPI) {
        await window.pmailAPI.saveDraft(draftData);
      }
      dom.composerStatusTip.textContent = 'Borrador guardado';
      setTimeout(() => (dom.composerStatusTip.textContent = ''), 2500);
      await refreshEmails();
    });

    // Forzar Sincronización Nube
    dom.btnForceSync.addEventListener('click', async () => {
      if (window.pmailAPI) {
        dom.btnForceSync.classList.add('animate-spin');
        await window.pmailAPI.triggerSync();
        dom.btnForceSync.classList.remove('animate-spin');
      }
      await refreshEmails();
    });

    // Controles de ventana
    document.getElementById('btn-minimize')?.addEventListener('click', () => window.pmailAPI?.minimizeWindow());
    document.getElementById('btn-maximize')?.addEventListener('click', () => window.pmailAPI?.maximizeWindow());
    document.getElementById('btn-close')?.addEventListener('click', () => window.pmailAPI?.closeWindow());

    // Tema claro / oscuro
    dom.btnThemeToggle.addEventListener('click', () => {
      document.documentElement.classList.toggle('light');
    });

    // Paleta de Comandos
    dom.btnCommandPalette.addEventListener('click', () => {
      dom.commandModal.classList.remove('hidden');
      dom.commandInput.focus();
    });

    dom.commandModal.addEventListener('click', (e) => {
      if (e.target === dom.commandModal) dom.commandModal.classList.add('hidden');
    });

    document.querySelectorAll('#command-results button').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        dom.commandModal.classList.add('hidden');
        if (action === 'compose') openComposer();
        if (action === 'sync') dom.btnForceSync.click();
        if (action === 'outbox') document.querySelector('[data-folder="outbox"]').click();
        if (action === 'theme') dom.btnThemeToggle.click();
      });
    });

    // Widgets Tabs
    document.querySelectorAll('.widget-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.widget-tab').forEach(t => {
          t.classList.remove('active', 'text-indigo-400', 'bg-slate-800');
          t.classList.add('text-slate-400');
        });
        tab.classList.add('active', 'text-indigo-400', 'bg-slate-800');

        const widget = tab.dataset.widget;
        document.getElementById('widget-calendar').classList.toggle('hidden', widget !== 'calendar');
        document.getElementById('widget-tasks').classList.toggle('hidden', widget !== 'tasks');
        document.getElementById('widget-contacts').classList.toggle('hidden', widget !== 'contacts');
      });
    });

    // Agregar tarea
    dom.formAddTask.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = dom.inputNewTask.value.trim();
      if (!val) return;
      state.tasks.push({ id: Date.now(), text: val, done: false });
      dom.inputNewTask.value = '';
      renderTasks();
    });
  }

  // Atajos de Teclado Estilo Superhuman
  function setupShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ignorar si el usuario está escribiendo en un input o textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        if (e.key === 'Escape') {
          closeComposer();
          dom.commandModal.classList.add('hidden');
        }
        return;
      }

      // Paleta de comandos: Ctrl+K o Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        dom.commandModal.classList.toggle('hidden');
        if (!dom.commandModal.classList.contains('hidden')) dom.commandInput.focus();
        return;
      }

      if (e.key === 'Escape') {
        closeComposer();
        dom.commandModal.classList.add('hidden');
      } else if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        openComposer();
      } else if (e.key.toLowerCase() === 'j') {
        // Siguiente correo
        navigateEmail(1);
      } else if (e.key.toLowerCase() === 'k') {
        // Correo anterior
        navigateEmail(-1);
      }
    });
  }

  function navigateEmail(direction) {
    const items = Array.from(document.querySelectorAll('.email-item'));
    if (items.length === 0) return;
    const currentIndex = items.findIndex(i => i.dataset.id === state.selectedEmailId);
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = 0;
    if (nextIndex >= items.length) nextIndex = items.length - 1;
    selectEmail(items[nextIndex].dataset.id);
  }

  // Renderizar Mini Calendario
  function renderCalendar() {
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    let html = ['D', 'L', 'M', 'M', 'J', 'V', 'S'].map(d => `<div class="font-bold text-[10px] text-slate-500">${d}</div>`).join('');

    for (let i = 1; i <= daysInMonth; i++) {
      const isToday = i === today.getDate();
      html += `
        <div class="py-1 rounded-md ${isToday ? 'bg-indigo-600 text-white font-bold' : 'hover:bg-slate-800 text-slate-300'} cursor-pointer">
          ${i}
        </div>
      `;
    }
    dom.calendarGrid.innerHTML = html;
  }

  // Renderizar Tareas
  function renderTasks() {
    dom.tasksList.innerHTML = state.tasks.map(task => `
      <div class="flex items-center gap-2 p-2 rounded-lg bg-slate-800/40 border border-slate-700/40">
        <input type="checkbox" ${task.done ? 'checked' : ''} onchange="window.toggleTask(${task.id})" class="rounded border-slate-700 text-indigo-600 focus:ring-0">
        <span class="flex-1 ${task.done ? 'line-through text-slate-500' : 'text-slate-300'}">${task.text}</span>
      </div>
    `).join('');
    dom.tasksCount.textContent = `${state.tasks.filter(t => !t.done).length} pendientes`;
  }

  window.toggleTask = function (id) {
    const task = state.tasks.find(t => t.id === id);
    if (task) task.done = !task.done;
    renderTasks();
  };

  // Renderizar Contactos @pac.p
  function renderContacts() {
    dom.contactsList.innerHTML = state.contacts.map(c => `
      <div class="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/60 border border-slate-800 cursor-pointer" onclick="window.composeToContact('${c.email}')">
        <div>
          <p class="font-medium text-slate-200 text-xs">${c.name}</p>
          <p class="text-[10px] text-indigo-400">${c.email}</p>
        </div>
        <button class="text-slate-400 hover:text-indigo-400"><i data-lucide="mail" class="w-3.5 h-3.5"></i></button>
      </div>
    `).join('');
  }

  window.composeToContact = function (email) {
    openComposer({ to: email });
  };

  // Escuchar eventos en vivo desde Electron
  function setupApiListeners() {
    if (!window.pmailAPI) return;

    window.pmailAPI.onMailReceived((email) => {
      refreshEmails();
    });

    window.pmailAPI.onNetworkChange((status) => {
      updateNetworkBadge(status.isOnline);
    });

    window.pmailAPI.onSyncCompleted(() => {
      refreshEmails();
    });
  }

  // Arrancar app al cargar
  document.addEventListener('DOMContentLoaded', init);
})();
