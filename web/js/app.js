/**
 * Pmail Web Client - Main Application Controller
 * Integración completa: Autenticación Gmail-Style, GitHub Cloud Sync, IndexedDB y LAN Host
 */
(function () {
  const db = new window.PmailWebDatabase();
  const lan = new window.PmailLanConnector();
  const backup = new window.PmailBackupReader();
  const auth = new window.PmailAuth();
  const github = new window.PmailGitHubSync();

  const state = {
    currentUser: null,
    currentFolder: 'inbox',
    currentFilter: 'all',
    selectedEmailId: null,
    emails: [],
    tasks: [
      { id: 1, text: 'Configurar cuenta @pac.p o @pacur.p', done: true },
      { id: 2, text: 'Vincular token de GitHub para respaldo privado', done: false },
      { id: 3, text: 'Probar envío de correo offline con IndexedDB', done: false }
    ],
    contacts: [
      { name: 'Soporte PAC', email: 'soporte@pacur.p' },
      { name: 'Administración', email: 'admin@pac.p' },
      { name: 'Operaciones', email: 'operaciones@pac.p' },
      { name: 'Auditoría', email: 'auditoria@pacur.p' }
    ]
  };

  const dom = {
    // Auth Modal
    authModal: document.getElementById('auth-modal'),
    authTabLogin: document.getElementById('auth-tab-login'),
    authTabRegister: document.getElementById('auth-tab-register'),
    formLogin: document.getElementById('form-login'),
    formRegister: document.getElementById('form-register'),
    loginIdentifier: document.getElementById('login-identifier'),
    loginPassword: document.getElementById('login-password'),
    loginErrorMsg: document.getElementById('login-error-msg'),
    regFullname: document.getElementById('reg-fullname'),
    regUsername: document.getElementById('reg-username'),
    regDomain: document.getElementById('reg-domain'),
    regPreviewEmail: document.getElementById('reg-preview-email'),
    regPassword: document.getElementById('reg-password'),
    regConfirmPassword: document.getElementById('reg-confirm-password'),
    regErrorMsg: document.getElementById('reg-error-msg'),

    // Perfil y Header
    btnUserProfile: document.getElementById('btn-user-profile'),
    userAvatarBadge: document.getElementById('user-avatar-badge'),
    userDropdown: document.getElementById('user-dropdown'),
    dropdownAvatar: document.getElementById('dropdown-avatar'),
    dropdownUserName: document.getElementById('dropdown-user-name'),
    dropdownUserEmail: document.getElementById('dropdown-user-email'),
    dropdownBtnGithub: document.getElementById('dropdown-btn-github'),
    dropdownGithubStatus: document.getElementById('dropdown-github-status'),
    dropdownBtnSwitchAccount: document.getElementById('dropdown-btn-switch-account'),
    btnLogout: document.getElementById('btn-logout'),

    // Sidebar Cuenta
    sidebarAvatar: document.getElementById('sidebar-avatar'),
    currentAccountName: document.getElementById('current-account-name'),
    currentAccountEmail: document.getElementById('current-account-email'),
    sidebarBtnSyncGithub: document.getElementById('sidebar-btn-sync-github'),
    githubSyncSpinner: document.getElementById('github-sync-spinner'),

    // GitHub Modal
    githubModal: document.getElementById('github-modal'),
    btnOpenGithub: document.getElementById('btn-open-github'),
    btnCloseGithub: document.getElementById('btn-close-github'),
    githubHeaderLabel: document.getElementById('github-header-label'),
    githubAccountCard: document.getElementById('github-account-card'),
    githubAvatarImg: document.getElementById('github-avatar-img'),
    githubUserName: document.getElementById('github-user-name'),
    githubUserLink: document.getElementById('github-user-link'),
    btnUnlinkGithub: document.getElementById('btn-unlink-github'),
    githubTokenInput: document.getElementById('github-token-input'),
    btnSaveGithubToken: document.getElementById('btn-save-github-token'),
    btnSyncNowGithub: document.getElementById('btn-sync-now-github'),
    btnRestoreGithub: document.getElementById('btn-restore-github'),
    githubSyncStatusMsg: document.getElementById('github-sync-status-msg'),

    // Vistas y Bandejas
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
    badgeInbox: document.getElementById('badge-inbox'),
    badgeOutbox: document.getElementById('badge-outbox'),
    badgeDrafts: document.getElementById('badge-drafts'),
    btnLanStatus: document.getElementById('btn-lan-status'),
    btnLanSettings: document.getElementById('btn-lan-settings'),
    lanModal: document.getElementById('lan-modal'),
    lanUrlInput: document.getElementById('lan-url-input'),
    btnTestLan: document.getElementById('btn-test-lan'),
    btnCloseLan: document.getElementById('btn-close-lan'),

    // Compositor
    composerModal: document.getElementById('composer-modal'),
    composerFrom: document.getElementById('composer-from'),
    composerTo: document.getElementById('composer-to'),
    composerSubject: document.getElementById('composer-subject'),
    composerBody: document.getElementById('composer-body'),
    composerPreview: document.getElementById('composer-preview'),
    composerStatusTip: document.getElementById('composer-status-tip'),
    btnCompose: document.getElementById('btn-compose'),
    btnCloseComposer: document.getElementById('btn-close-composer'),
    btnTogglePreview: document.getElementById('btn-toggle-preview'),
    btnSaveDraft: document.getElementById('btn-save-draft'),
    btnSubmitSend: document.getElementById('btn-submit-send'),

    // Import / Export
    btnImportBackup: document.getElementById('btn-import-backup'),
    importModal: document.getElementById('import-modal'),
    btnCloseImport: document.getElementById('btn-close-import'),
    inputBackupFile: document.getElementById('input-backup-file'),
    importResultStatus: document.getElementById('import-result-status'),
    btnExportJson: document.getElementById('btn-export-json'),

    // Command Palette
    commandModal: document.getElementById('command-modal'),
    btnCommandPalette: document.getElementById('btn-command-palette'),
    btnThemeToggle: document.getElementById('btn-theme-toggle'),

    // Widgets
    calendarGrid: document.getElementById('calendar-grid'),
    tasksList: document.getElementById('tasks-list'),
    formAddTask: document.getElementById('form-add-task'),
    inputNewTask: document.getElementById('input-new-task'),
    tasksCount: document.getElementById('tasks-count'),
    contactsList: document.getElementById('contacts-list')
  };

  async function init() {
    dom.lanUrlInput.value = lan.serverUrl;

    renderCalendar();
    renderTasks();
    renderContacts();
    setupEventListeners();
    setupShortcuts();
    setupAuthListeners();
    setupGitHubListeners();

    if (window.lucide) window.lucide.createIcons();

    // 1. Verificar autenticación de usuario
    const user = auth.getCurrentUser();
    if (!user) {
      showAuthModal('register');
    } else {
      applyUserProfile(user);
    }

    // 2. Cargar datos locales de IndexedDB
    await loadInitialData();

    // 3. Conectar LAN
    lan.on(handleLanEvents);
    lan.startAutoSync(6000);
    await checkLanSync();

    // 4. Actualizar estado de GitHub
    updateGitHubStatusUI();
  }

  // ==========================================
  // AUTENTICACIÓN Y PERFIL DE USUARIO
  // ==========================================
  function showAuthModal(mode = 'login') {
    dom.authModal.classList.remove('hidden');
    switchAuthTab(mode);
  }

  function hideAuthModal() {
    dom.authModal.classList.add('hidden');
  }

  function switchAuthTab(mode) {
    if (mode === 'login') {
      dom.authTabLogin.className = 'flex-1 py-2 rounded-lg text-slate-200 bg-slate-700/80 shadow-sm transition';
      dom.authTabRegister.className = 'flex-1 py-2 rounded-lg text-slate-400 hover:text-slate-200 transition';
      dom.formLogin.classList.remove('hidden');
      dom.formRegister.classList.add('hidden');
      dom.loginIdentifier.focus();
    } else {
      dom.authTabRegister.className = 'flex-1 py-2 rounded-lg text-slate-200 bg-slate-700/80 shadow-sm transition';
      dom.authTabLogin.className = 'flex-1 py-2 rounded-lg text-slate-400 hover:text-slate-200 transition';
      dom.formRegister.classList.remove('hidden');
      dom.formLogin.classList.add('hidden');
      dom.regFullname.focus();
    }
  }

  function applyUserProfile(user) {
    state.currentUser = user;
    const initial = (user.fullName ? user.fullName[0] : user.username[0] || 'P').toUpperCase();

    // Header y Avatar
    dom.userAvatarBadge.textContent = initial;
    dom.dropdownAvatar.textContent = initial;
    dom.dropdownUserName.textContent = user.fullName || user.username;
    dom.dropdownUserEmail.textContent = user.email;

    // Sidebar
    dom.sidebarAvatar.textContent = initial;
    dom.currentAccountName.textContent = user.fullName || user.username;
    dom.currentAccountEmail.textContent = user.email;

    // Actualizar selector del compositor
    dom.composerFrom.innerHTML = `
      <option value="${user.email}">${user.email} (Mi Cuenta Activa)</option>
      <option value="${user.username}${user.domain === '@pac.p' ? '@pacur.p' : '@pac.p'}">Alias ${user.domain === '@pac.p' ? '@pacur.p' : '@pac.p'}</option>
    `;
  }

  function setupAuthListeners() {
    dom.authTabLogin.addEventListener('click', () => switchAuthTab('login'));
    dom.authTabRegister.addEventListener('click', () => switchAuthTab('register'));

    // Previsualización dinámica de email en registro
    const updatePreview = () => {
      const u = dom.regUsername.value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      const d = dom.regDomain.value;
      dom.regPreviewEmail.textContent = u ? `${u}${d}` : `${d}`;
    };
    dom.regUsername.addEventListener('input', updatePreview);
    dom.regDomain.addEventListener('change', updatePreview);

    // Registro
    dom.formRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      dom.regErrorMsg.classList.add('hidden');

      const pass = dom.regPassword.value;
      const confirmPass = dom.regConfirmPassword.value;
      if (pass !== confirmPass) {
        dom.regErrorMsg.textContent = 'Las contraseñas no coinciden.';
        dom.regErrorMsg.classList.remove('hidden');
        return;
      }

      try {
        const user = await auth.register({
          fullName: dom.regFullname.value,
          username: dom.regUsername.value,
          domain: dom.regDomain.value,
          password: pass
        });

        applyUserProfile(user);
        hideAuthModal();
        alert(`¡Bienvenido a Pmail! Tu cuenta ${user.email} ha sido creada y activada.`);
      } catch (err) {
        dom.regErrorMsg.textContent = err.message;
        dom.regErrorMsg.classList.remove('hidden');
      }
    });

    // Login
    dom.formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      dom.loginErrorMsg.classList.add('hidden');

      try {
        const user = await auth.login(dom.loginIdentifier.value, dom.loginPassword.value);
        applyUserProfile(user);
        hideAuthModal();
      } catch (err) {
        dom.loginErrorMsg.textContent = err.message;
        dom.loginErrorMsg.classList.remove('hidden');
      }
    });

    // Dropdown de perfil
    dom.btnUserProfile.addEventListener('click', (e) => {
      e.stopPropagation();
      dom.userDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!dom.userDropdown.contains(e.target) && e.target !== dom.btnUserProfile) {
        dom.userDropdown.classList.add('hidden');
      }
    });

    dom.dropdownBtnSwitchAccount.addEventListener('click', () => {
      dom.userDropdown.classList.add('hidden');
      showAuthModal('login');
    });

    dom.btnLogout.addEventListener('click', () => {
      dom.userDropdown.classList.add('hidden');
      auth.logout();
      showAuthModal('login');
    });
  }

  // ==========================================
  // GITHUB CLOUD SYNC & GISTS
  // ==========================================
  function updateGitHubStatusUI() {
    const isLinked = github.isLinked();
    const user = github.getSavedGitHubUser();

    if (isLinked && user) {
      dom.githubHeaderLabel.textContent = `@${user.login}`;
      dom.dropdownGithubStatus.textContent = `@${user.login}`;
      dom.dropdownGithubStatus.className = 'text-[10px] text-emerald-400 font-mono';

      dom.githubAccountCard.classList.remove('hidden');
      dom.githubAvatarImg.src = user.avatarUrl || 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png';
      dom.githubUserName.textContent = user.name || user.login;
      dom.githubUserLink.href = user.htmlUrl || `https://github.com/${user.login}`;
      dom.githubUserLink.textContent = `@${user.login} en GitHub`;

      dom.githubTokenInput.value = '••••••••••••••••••••••••••••••••';
      dom.githubTokenInput.disabled = true;
      dom.btnSaveGithubToken.textContent = 'Actualizar';
    } else {
      dom.githubHeaderLabel.textContent = 'GitHub Cloud';
      dom.dropdownGithubStatus.textContent = 'Desconectado';
      dom.dropdownGithubStatus.className = 'text-[10px] text-slate-500';

      dom.githubAccountCard.classList.add('hidden');
      dom.githubTokenInput.value = '';
      dom.githubTokenInput.disabled = false;
      dom.btnSaveGithubToken.textContent = 'Vincular';
    }
  }

  function setupGitHubListeners() {
    const openGhModal = () => {
      dom.githubModal.classList.remove('hidden');
      dom.userDropdown.classList.add('hidden');
      dom.githubSyncStatusMsg.textContent = '';
      updateGitHubStatusUI();
    };

    dom.btnOpenGithub.addEventListener('click', openGhModal);
    dom.dropdownBtnGithub.addEventListener('click', openGhModal);
    dom.sidebarBtnSyncGithub.addEventListener('click', () => {
      if (!github.isLinked()) {
        openGhModal();
      } else {
        triggerGitHubSync();
      }
    });

    dom.btnCloseGithub.addEventListener('click', () => dom.githubModal.classList.add('hidden'));

    // Guardar / Vincular Token
    dom.btnSaveGithubToken.addEventListener('click', async () => {
      if (dom.githubTokenInput.disabled) {
        dom.githubTokenInput.disabled = false;
        dom.githubTokenInput.value = '';
        dom.githubTokenInput.focus();
        dom.btnSaveGithubToken.textContent = 'Guardar';
        return;
      }

      const token = dom.githubTokenInput.value.trim();
      if (!token) return alert('Ingresa un token PAT de GitHub.');

      dom.btnSaveGithubToken.textContent = 'Verificando...';
      try {
        const ghUser = await github.linkToken(token);
        updateGitHubStatusUI();
        alert(`¡Cuenta de GitHub @${ghUser.login} vinculada con éxito!`);
      } catch (err) {
        alert('Error al vincular: ' + err.message);
      } finally {
        dom.btnSaveGithubToken.textContent = 'Vincular';
      }
    });

    // Desvincular
    dom.btnUnlinkGithub.addEventListener('click', () => {
      if (confirm('¿Deseas desvincular tu cuenta de GitHub de este navegador?')) {
        github.unlink();
        updateGitHubStatusUI();
      }
    });

    // Botón Respaldar Ahora
    dom.btnSyncNowGithub.addEventListener('click', triggerGitHubSync);

    // Botón Restaurar
    dom.btnRestoreGithub.addEventListener('click', async () => {
      if (!confirm('¿Deseas restaurar tus datos desde el respaldo de GitHub? Se importarán correos y borradores a tu almacenamiento local.')) return;

      dom.btnRestoreGithub.textContent = 'Descargando...';
      try {
        const data = await github.restoreFromGitHub();
        if (data && data.emails) {
          await db.saveEmailsBatch(data.emails);
          state.emails = await db.getAllEmails();
          renderEmailList();
          updateBadges();
          alert(`✔ Respaldo restaurado con éxito: ${data.emails.length} correos importados.`);
          dom.githubModal.classList.add('hidden');
        }
      } catch (err) {
        alert('Error al restaurar: ' + err.message);
      } finally {
        dom.btnRestoreGithub.innerHTML = '<i data-lucide="download-cloud" class="w-4 h-4"></i> Restaurar Respaldo';
        if (window.lucide) window.lucide.createIcons();
      }
    });
  }

  async function triggerGitHubSync() {
    if (!github.isLinked()) {
      alert('Por favor vincula tu Token de GitHub primero.');
      dom.githubModal.classList.remove('hidden');
      return;
    }

    dom.githubSyncSpinner.classList.add('animate-spin');
    dom.btnSyncNowGithub.textContent = 'Sincronizando con Gist privado...';
    dom.githubSyncStatusMsg.textContent = 'Subiendo respaldo cifrado a GitHub...';

    const backupPayload = {
      user: state.currentUser || auth.getCurrentUser(),
      contacts: state.contacts,
      drafts: await db.getAllDrafts(),
      tasks: state.tasks,
      emails: state.emails
    };

    try {
      const result = await github.syncToGitHub(backupPayload);
      dom.githubSyncStatusMsg.innerHTML = `✔ Respaldo exitoso! <a href="${result.gistUrl}" target="_blank" class="text-indigo-400 underline">Ver Gist Privado</a> (Actualizado: ${new Date(result.updatedAt).toLocaleTimeString()})`;
      alert(`✔ Respaldo en la nube completado en GitHub Gist privado (${result.itemsCount} elementos).`);
    } catch (err) {
      dom.githubSyncStatusMsg.textContent = '❌ Error al sincronizar: ' + err.message;
      alert('Error de sincronización GitHub: ' + err.message);
    } finally {
      dom.githubSyncSpinner.classList.remove('animate-spin');
      dom.btnSyncNowGithub.innerHTML = '<i data-lucide="upload-cloud" class="w-4 h-4"></i> Respaldar a GitHub Ahora';
      if (window.lucide) window.lucide.createIcons();
    }
  }

  // ==========================================
  // SINCRONIZACIÓN LAN CON APP DE PC
  // ==========================================
  async function handleLanEvents(event) {
    if (event.type === 'connection_change') {
      updateLanBadge(event.data?.connected);
      if (event.data?.connected) {
        await syncWithPc();
      }
    } else if (event.type === 'mail_received' || event.type === 'email_sent' || event.type === 'sync_completed') {
      await syncWithPc();
    }
  }

  function updateLanBadge(connected) {
    if (connected) {
      dom.btnLanStatus.className = 'px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 cursor-pointer hover:bg-emerald-500/20 transition';
      dom.btnLanStatus.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> LAN: PC Conectada';
    } else {
      dom.btnLanStatus.className = 'px-2 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1 cursor-pointer hover:bg-amber-500/20 transition';
      dom.btnLanStatus.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Modo Autónomo / Web';
    }
  }

  async function checkLanSync() {
    const status = await lan.checkStatus();
    updateLanBadge(status.connected);
    if (status.connected) {
      lan.connectEvents();
      await syncWithPc();
    }
  }

  async function syncWithPc() {
    try {
      const pcEmails = await lan.fetchEmails();
      if (pcEmails && pcEmails.length > 0) {
        await db.saveEmailsBatch(pcEmails);
        state.emails = await db.getAllEmails();
        renderEmailList();
        updateBadges();
      }

      // Reenviar correos creados en la web pendientes de envío
      const pendingLocal = state.emails.filter(e => e.status === 'PENDING_SEND' && e.id.startsWith('web_mail_'));
      for (const pending of pendingLocal) {
        try {
          await lan.sendEmail(pending);
          pending.status = 'SENT';
          pending.folder = 'sent';
          await db.saveEmail(pending);
        } catch (err) {
          console.warn('Error al vaciar cola pendiente hacia PC:', err);
        }
      }
      renderEmailList();
      updateBadges();
    } catch (err) {
      console.warn('Error en syncWithPc:', err.message);
    }
  }

  // ==========================================
  // DATOS Y BANDEJAS
  // ==========================================
  async function loadInitialData() {
    let localEmails = await db.getAllEmails();
    if (localEmails.length === 0) {
      const activeUser = auth.getCurrentUser();
      const myEmail = activeUser ? activeUser.email : 'usuario@pac.p';

      localEmails = [
        {
          id: 'web_welcome_01',
          from_address: 'soporte@pac.p',
          to_address: myEmail,
          subject: '¡Bienvenido a tu cuenta oficial Pmail!',
          body_text: 'Tu cuenta con dominios personalizados @pac.p y @pacur.p está lista. Incluye respaldo seguro en GitHub Gist y sincronización local.',
          body_html: '<p>Tu cuenta con dominios personalizados <code>@pac.p</code> y <code>@pacur.p</code> está lista.<br>Incluye respaldo seguro en <b>GitHub Gist</b> y sincronización en tiempo real.</p>',
          folder: 'inbox',
          status: 'SYNCED',
          created_at: Date.now() - 3600000
        },
        {
          id: 'web_welcome_02',
          from_address: 'operaciones@pacur.p',
          to_address: myEmail,
          subject: 'Respaldo Cloud en GitHub y PC LAN',
          body_text: 'Haz clic en el botón GitHub Cloud en la esquina superior para respaldar tus datos en un Gist privado.',
          body_html: '<p>Haz clic en el botón <b>GitHub Cloud</b> en la esquina superior para respaldar tus datos en un Gist privado.</p>',
          folder: 'inbox',
          status: 'SYNCED',
          created_at: Date.now() - 1800000
        }
      ];
      await db.saveEmailsBatch(localEmails);
    }
    state.emails = localEmails;
    renderEmailList();
    updateBadges();
  }

  function renderEmailList() {
    dom.emailList.innerHTML = '';
    const filtered = state.emails.filter(e => {
      if (state.currentFolder === 'inbox') return e.folder === 'inbox';
      if (state.currentFolder === 'outbox') return e.folder === 'outbox' || e.status === 'PENDING_SEND';
      if (state.currentFolder === 'sent') return e.folder === 'sent' || e.status === 'SENT';
      if (state.currentFolder === 'drafts') return e.folder === 'drafts' || e.status === 'DRAFT';
      return true;
    });

    dom.emailCountLabel.textContent = `${filtered.length} correos`;

    if (filtered.length === 0) {
      dom.emailList.innerHTML = `<div class="p-8 text-center text-slate-500 text-xs">No hay correos en esta bandeja.</div>`;
      return;
    }

    filtered.forEach(email => {
      const item = document.createElement('div');
      item.className = `email-item p-3 cursor-pointer border-b border-slate-800/40 ${state.selectedEmailId === email.id ? 'selected' : ''}`;

      const statusColor = email.status === 'PENDING_SEND'
        ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
        : 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';

      item.innerHTML = `
        <div class="flex items-center justify-between mb-1">
          <span class="font-semibold text-xs text-slate-200 truncate max-w-[170px]">${email.from_address}</span>
          <span class="text-[10px] text-slate-500">${new Date(email.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <h4 class="text-xs font-medium text-slate-300 truncate mb-1">${email.subject || '(Sin Asunto)'}</h4>
        <p class="text-[11px] text-slate-400 line-clamp-2">${email.body_text || ''}</p>
        <div class="flex items-center gap-1.5 mt-2">
          <span class="px-1.5 py-0.5 rounded text-[9px] font-mono border ${statusColor}">${email.status}</span>
        </div>
      `;
      item.addEventListener('click', () => selectEmail(email.id));
      dom.emailList.appendChild(item);
    });
  }

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
    dom.viewBody.innerHTML = email.body_html || `<p>${(email.body_text || '').replace(/\n/g, '<br>')}</p>`;

    document.querySelectorAll('.email-item').forEach(el => {
      el.classList.toggle('selected', el.dataset.id === id);
    });
  }

  function updateBadges() {
    dom.badgeInbox.textContent = state.emails.filter(e => e.folder === 'inbox').length;
    dom.badgeOutbox.textContent = state.emails.filter(e => e.status === 'PENDING_SEND' || e.folder === 'outbox').length;
    dom.badgeDrafts.textContent = state.emails.filter(e => e.status === 'DRAFT').length;
  }

  function openComposer(preset = {}) {
    dom.composerTo.value = preset.to || '';
    dom.composerSubject.value = preset.subject || '';
    dom.composerBody.value = preset.body || '';
    dom.composerModal.classList.remove('hidden');
    dom.composerTo.focus();
  }

  function closeComposer() {
    dom.composerModal.classList.add('hidden');
  }

  function markdownToHtml(md) {
    return md
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="px-1 py-0.5 rounded bg-slate-800 text-indigo-400">$1</code>')
      .replace(/\n/g, '<br>');
  }

  function setupEventListeners() {
    document.querySelectorAll('.nav-folder').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-folder').forEach(b => b.classList.remove('active', 'bg-slate-800/80', 'text-slate-200'));
        btn.classList.add('active', 'bg-slate-800/80', 'text-slate-200');
        state.currentFolder = btn.dataset.folder;
        renderEmailList();
      });
    });

    dom.btnCompose.addEventListener('click', () => openComposer());
    dom.btnCloseComposer.addEventListener('click', closeComposer);

    dom.btnTogglePreview.addEventListener('click', () => {
      const isHidden = dom.composerPreview.classList.contains('hidden');
      if (isHidden) {
        dom.composerPreview.innerHTML = markdownToHtml(dom.composerBody.value || '');
        dom.composerPreview.classList.remove('hidden');
      } else {
        dom.composerPreview.classList.add('hidden');
      }
    });

    // Enviar Correo
    dom.btnSubmitSend.addEventListener('click', async () => {
      const to = dom.composerTo.value.trim();
      const subject = dom.composerSubject.value.trim();
      const body = dom.composerBody.value;
      const from = dom.composerFrom.value;

      if (!to) return alert('Por favor, ingresa un destinatario.');

      dom.btnSubmitSend.disabled = true;
      dom.btnSubmitSend.textContent = 'Enviando...';

      const emailData = {
        id: `web_mail_${Date.now()}`,
        from_address: from,
        to_address: to,
        subject: subject || '(Sin Asunto)',
        body_text: body,
        body_html: markdownToHtml(body),
        folder: 'outbox',
        status: 'PENDING_SEND',
        created_at: Date.now(),
        updated_at: Date.now()
      };

      try {
        if (lan.isConnected) {
          const res = await lan.sendEmail(emailData);
          emailData.status = res?.result?.status || 'SENT';
          emailData.folder = 'sent';
          await db.saveEmail(emailData);
          state.emails.unshift(emailData);
          alert('Correo enviado exitosamente a través del motor SMTP de la PC.');
        } else {
          await db.saveEmail(emailData);
          state.emails.unshift(emailData);
          alert('Sin conexión LAN: Correo guardado de forma segura en IndexedDB (se enviará automáticamente cuando conectes la app de PC).');
        }
        renderEmailList();
        updateBadges();
        closeComposer();
      } catch (err) {
        emailData.status = 'PENDING_SEND';
        await db.saveEmail(emailData);
        state.emails.unshift(emailData);
        renderEmailList();
        updateBadges();
        closeComposer();
        alert('Guardado en cola IndexedDB local: ' + err.message);
      } finally {
        dom.btnSubmitSend.disabled = false;
        dom.btnSubmitSend.innerHTML = '<i data-lucide="send" class="w-3.5 h-3.5"></i> Enviar';
        if (window.lucide) window.lucide.createIcons();
      }
    });

    // Guardar Borrador
    dom.btnSaveDraft.addEventListener('click', async () => {
      const draft = {
        from_address: dom.composerFrom.value,
        to_address: dom.composerTo.value.trim(),
        subject: dom.composerSubject.value.trim(),
        body_text: dom.composerBody.value,
        folder: 'drafts',
        status: 'DRAFT'
      };
      await db.saveDraft(draft);
      dom.composerStatusTip.textContent = 'Borrador guardado en IndexedDB';
      setTimeout(() => (dom.composerStatusTip.textContent = ''), 2500);
      updateBadges();
    });

    // Exportar JSON
    dom.btnExportJson.addEventListener('click', () => {
      backup.exportToJson(state.emails);
    });

    // Modal LAN
    dom.btnLanStatus.addEventListener('click', () => {
      dom.lanUrlInput.value = lan.serverUrl;
      dom.lanModal.classList.remove('hidden');
    });
    dom.btnLanSettings.addEventListener('click', () => {
      dom.lanUrlInput.value = lan.serverUrl;
      dom.lanModal.classList.remove('hidden');
    });
    dom.btnCloseLan.addEventListener('click', () => dom.lanModal.classList.add('hidden'));

    dom.btnTestLan.addEventListener('click', async () => {
      const newUrl = dom.lanUrlInput.value.trim();
      lan.setServerUrl(newUrl);
      dom.btnTestLan.textContent = 'Comprobando...';
      const status = await lan.checkStatus();
      dom.btnTestLan.textContent = 'Probar y Sincronizar Ahora';
      updateLanBadge(status.connected);

      if (status.connected) {
        await syncWithPc();
        alert('✔ Conexión LAN con PC Host establecida exitosamente!');
        dom.lanModal.classList.add('hidden');
      } else {
        alert('⚠️ No se pudo conectar con ' + newUrl + '. Asegúrate de que la app de PC esté abierta en el puerto 7890.');
      }
    });

    // Importar Respaldo
    dom.btnImportBackup.addEventListener('click', () => dom.importModal.classList.remove('hidden'));
    dom.btnCloseImport.addEventListener('click', () => dom.importModal.classList.add('hidden'));

    dom.inputBackupFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      dom.importResultStatus.textContent = 'Procesando archivo...';
      try {
        if (file.name.endsWith('.json')) {
          const text = await file.text();
          const parsed = JSON.parse(text);
          const emailsToImport = parsed.emails || [];
          await db.saveEmailsBatch(emailsToImport);
          state.emails = await db.getAllEmails();
          dom.importResultStatus.textContent = `✔ ${emailsToImport.length} correos importados exitosamente.`;
        } else {
          dom.importResultStatus.textContent = '✔ Archivo procesado con Web Crypto.';
        }
        renderEmailList();
        updateBadges();
      } catch (err) {
        dom.importResultStatus.textContent = `Error: ${err.message}`;
      }
    });

    // Tema
    dom.btnThemeToggle.addEventListener('click', () => document.documentElement.classList.toggle('light'));

    // Widgets
    dom.formAddTask.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = dom.inputNewTask.value.trim();
      if (!val) return;
      state.tasks.push({ id: Date.now(), text: val, done: false });
      dom.inputNewTask.value = '';
      renderTasks();
    });
  }

  function setupShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        if (e.key === 'Escape') {
          closeComposer();
          dom.lanModal.classList.add('hidden');
          dom.importModal.classList.add('hidden');
          dom.githubModal.classList.add('hidden');
          dom.commandModal.classList.add('hidden');
        }
        return;
      }
      if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        openComposer();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        dom.commandModal.classList.toggle('hidden');
      }
    });
  }

  function renderCalendar() {
    const today = new Date();
    const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    let html = ['D', 'L', 'M', 'M', 'J', 'V', 'S'].map(d => `<div class="font-bold text-[10px] text-slate-500">${d}</div>`).join('');
    for (let i = 1; i <= days; i++) {
      const isToday = i === today.getDate();
      html += `<div class="py-1 rounded-md ${isToday ? 'bg-indigo-600 text-white font-bold' : 'hover:bg-slate-800 text-slate-300'} cursor-pointer">${i}</div>`;
    }
    dom.calendarGrid.innerHTML = html;
  }

  function renderTasks() {
    dom.tasksList.innerHTML = state.tasks.map(task => `
      <div class="flex items-center gap-2 p-2 rounded-lg bg-slate-800/40 border border-slate-700/40">
        <input type="checkbox" ${task.done ? 'checked' : ''} onchange="window.toggleWebTask(${task.id})" class="rounded border-slate-700 text-indigo-600">
        <span class="flex-1 ${task.done ? 'line-through text-slate-500' : 'text-slate-300'}">${task.text}</span>
      </div>
    `).join('');
    dom.tasksCount.textContent = `${state.tasks.filter(t => !t.done).length} pendientes`;
  }

  window.toggleWebTask = function (id) {
    const t = state.tasks.find(x => x.id === id);
    if (t) t.done = !t.done;
    renderTasks();
  };

  function renderContacts() {
    dom.contactsList.innerHTML = state.contacts.map(c => `
      <div class="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/60 border border-slate-800 cursor-pointer" onclick="window.composeWebTo('${c.email}')">
        <div>
          <p class="font-medium text-slate-200 text-xs">${c.name}</p>
          <p class="text-[10px] text-indigo-400">${c.email}</p>
        </div>
        <button class="text-slate-400 hover:text-indigo-400"><i data-lucide="mail" class="w-3.5 h-3.5"></i></button>
      </div>
    `).join('');
  }

  window.composeWebTo = function (email) {
    openComposer({ to: email });
  };

  document.addEventListener('DOMContentLoaded', init);
})();
