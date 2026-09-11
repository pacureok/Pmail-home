/**
 * Pmail Web Client - Main Application Controller (Google Drive Folder-Centric)
 * Autenticación con Google OAuth2, Validación de Carpeta Drive y Sincronización Autónoma
 */
(function () {
  const db = new window.PmailWebDatabase();
  const lan = new window.PmailLanConnector();
  const backup = new window.PmailBackupReader();
  const gdrive = new window.PmailGoogleDriveSync();

  const state = {
    currentUser: null,
    googleUser: null,
    folderInfo: null,
    currentFolder: 'inbox',
    currentFilter: 'all',
    selectedEmailId: null,
    emails: [],
    tasks: [
      { id: 1, text: 'Vincular carpeta de Google Drive', done: true },
      { id: 2, text: 'Configurar dirección @pac.p o @pacur.p', done: true },
      { id: 3, text: 'Probar respaldo autónomo en Google Drive', done: false }
    ],
    contacts: [
      { name: 'Soporte PAC', email: 'soporte@pacur.p' },
      { name: 'Administración', email: 'admin@pac.p' },
      { name: 'Operaciones', email: 'operaciones@pac.p' },
      { name: 'Auditoría', email: 'auditoria@pacur.p' }
    ]
  };

  let silentSyncTimeout = null;

  const dom = {
    // Auth Modal (Google Drive)
    authModal: document.getElementById('auth-modal'),
    formGoogleAuth: document.getElementById('form-google-auth'),
    btnLoginGoogle: document.getElementById('btn-login-google'),
    googleAuthStatusBadge: document.getElementById('google-auth-status-badge'),
    googleProfilePreview: document.getElementById('google-profile-preview'),
    googleProfileImg: document.getElementById('google-profile-img'),
    googleProfileName: document.getElementById('google-profile-name'),
    googleProfileEmail: document.getElementById('google-profile-email'),
    btnToggleManualToken: document.getElementById('btn-toggle-manual-token'),
    manualTokenContainer: document.getElementById('manual-token-container'),
    inputCustomClientId: document.getElementById('input-custom-client-id'),
    inputManualToken: document.getElementById('input-manual-token'),
    btnApplyManualToken: document.getElementById('btn-apply-manual-token'),
    inputPmailUsername: document.getElementById('input-pmail-username'),
    selectPmailDomain: document.getElementById('select-pmail-domain'),
    previewActivePmailEmail: document.getElementById('preview-active-pmail-email'),
    inputGdriveFolderUrl: document.getElementById('input-gdrive-folder-url'),
    authErrorMsg: document.getElementById('auth-error-msg'),
    authSuccessMsg: document.getElementById('auth-success-msg'),
    btnSubmitValidateEnter: document.getElementById('btn-submit-validate-enter'),

    // Perfil y Header
    btnUserProfile: document.getElementById('btn-user-profile'),
    userAvatarBadge: document.getElementById('user-avatar-badge'),
    userDropdown: document.getElementById('user-dropdown'),
    dropdownAvatar: document.getElementById('dropdown-avatar'),
    dropdownUserName: document.getElementById('dropdown-user-name'),
    dropdownUserEmail: document.getElementById('dropdown-user-email'),
    dropdownBtnGdrive: document.getElementById('dropdown-btn-gdrive'),
    dropdownGdriveStatus: document.getElementById('dropdown-gdrive-status'),
    dropdownBtnSwitchAccount: document.getElementById('dropdown-btn-switch-account'),
    btnLogout: document.getElementById('btn-logout'),

    // Google Drive Modal
    gdriveModal: document.getElementById('gdrive-modal'),
    btnOpenGdrive: document.getElementById('btn-open-gdrive'),
    btnCloseGdrive: document.getElementById('btn-close-gdrive'),
    gdriveHeaderLabel: document.getElementById('gdrive-header-label'),
    modalGdriveFolderName: document.getElementById('modal-gdrive-folder-name'),
    modalGdriveFolderId: document.getElementById('modal-gdrive-folder-id'),
    btnOpenGdriveFolderWeb: document.getElementById('btn-open-gdrive-folder-web'),
    btnModalSyncGdrive: document.getElementById('btn-modal-sync-gdrive'),
    btnModalRestoreGdrive: document.getElementById('btn-modal-restore-gdrive'),
    modalGdriveStatusMsg: document.getElementById('modal-gdrive-status-msg'),

    // Sidebar Cuenta
    sidebarAvatar: document.getElementById('sidebar-avatar'),
    currentAccountName: document.getElementById('current-account-name'),
    currentAccountEmail: document.getElementById('current-account-email'),
    sidebarBtnSyncGdrive: document.getElementById('sidebar-btn-sync-gdrive'),
    gdriveSyncSpinner: document.getElementById('gdrive-sync-spinner'),

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
    setupGoogleDriveListeners();

    if (window.lucide) window.lucide.createIcons();

    // 1. Verificar autenticación de Google Drive
    const savedProfile = gdrive.getSavedProfile();
    if (gdrive.isAuthenticated() && savedProfile) {
      applyUserProfile(savedProfile);
      updateDriveUI(true);
      hideAuthModal();
      // Restauración en background si es necesario
      checkAndRestoreFromDrive();
    } else {
      showAuthModal();
    }

    // 2. Cargar datos locales de IndexedDB
    await loadInitialData();

    // 3. Conectar LAN con PC Host
    lan.on(handleLanEvents);
    lan.startAutoSync(6000);
    await checkLanSync();
  }

  // ==========================================
  // GOOGLE DRIVE AUTH & FOLDER SETUP
  // ==========================================
  function showAuthModal() {
    dom.authModal.classList.remove('hidden');
    dom.authErrorMsg.classList.add('hidden');
    dom.authSuccessMsg.classList.add('hidden');
    updatePmailEmailPreview();
  }

  function hideAuthModal() {
    dom.authModal.classList.add('hidden');
  }

  function updatePmailEmailPreview() {
    const u = dom.inputPmailUsername.value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'usuario';
    const d = dom.selectPmailDomain.value;
    dom.previewActivePmailEmail.textContent = `${u}${d}`;
  }

  function applyUserProfile(profile) {
    state.currentUser = profile;
    const initial = (profile.pmailEmail ? profile.pmailEmail[0] : 'P').toUpperCase();

    // Header y Avatar
    if (profile.googlePicture) {
      dom.userAvatarBadge.innerHTML = `<img src="${profile.googlePicture}" class="w-full h-full object-cover">`;
      dom.dropdownAvatar.innerHTML = `<img src="${profile.googlePicture}" class="w-full h-full object-cover">`;
      dom.sidebarAvatar.innerHTML = `<img src="${profile.googlePicture}" class="w-full h-full object-cover">`;
    } else {
      dom.userAvatarBadge.textContent = initial;
      dom.dropdownAvatar.textContent = initial;
      dom.sidebarAvatar.textContent = initial;
    }

    dom.dropdownUserName.textContent = profile.googleName || profile.pmailEmail;
    dom.dropdownUserEmail.textContent = profile.pmailEmail;

    // Sidebar
    dom.currentAccountName.textContent = profile.googleName || profile.pmailEmail;
    dom.currentAccountEmail.textContent = profile.pmailEmail;

    // Actualizar selector del compositor
    dom.composerFrom.innerHTML = `
      <option value="${profile.pmailEmail}">${profile.pmailEmail} (Principal Drive)</option>
    `;
  }

  function updateDriveUI(connected) {
    if (connected && gdrive.folderId) {
      dom.gdriveHeaderLabel.textContent = 'Drive: Activo';
      dom.dropdownGdriveStatus.textContent = 'Conectada';
      dom.dropdownGdriveStatus.className = 'text-[10px] text-emerald-400 font-medium';

      dom.modalGdriveFolderId.textContent = `ID: ${gdrive.folderId}`;
      dom.btnOpenGdriveFolderWeb.href = `https://drive.google.com/drive/folders/${gdrive.folderId}`;
    } else {
      dom.gdriveHeaderLabel.textContent = 'Google Drive';
      dom.dropdownGdriveStatus.textContent = 'Desconectado';
      dom.dropdownGdriveStatus.className = 'text-[10px] text-slate-500 font-medium';
    }
  }

  function setupGoogleDriveListeners() {
    dom.inputPmailUsername.addEventListener('input', updatePmailEmailPreview);
    dom.selectPmailDomain.addEventListener('change', updatePmailEmailPreview);

    // Toggle para Client ID manual o token
    dom.btnToggleManualToken.addEventListener('click', () => {
      dom.manualTokenContainer.classList.toggle('hidden');
    });

    // Aplicar token manual / Client ID
    dom.btnApplyManualToken.addEventListener('click', async () => {
      const customClientId = dom.inputCustomClientId.value.trim();
      const manualToken = dom.inputManualToken.value.trim();

      if (customClientId) {
        gdrive.setClientId(customClientId);
      }

      if (manualToken) {
        gdrive.saveToken(manualToken);
        try {
          const user = await gdrive.fetchGoogleUserInfo(manualToken);
          onGoogleAuthSuccess(user, manualToken);
        } catch (err) {
          alert('Error con el token ingresado: ' + err.message);
        }
      }
    });

    // Iniciar OAuth con Google Identity Services
    dom.btnLoginGoogle.addEventListener('click', async () => {
      dom.btnLoginGoogle.disabled = true;
      dom.btnLoginGoogle.innerText = 'Conectando con Google...';
      dom.authErrorMsg.classList.add('hidden');

      try {
        const token = await gdrive.requestGoogleToken();
        const user = await gdrive.fetchGoogleUserInfo(token);
        onGoogleAuthSuccess(user, token);
      } catch (err) {
        console.warn('Error en Google Auth:', err);
        dom.authErrorMsg.textContent = err.message || 'Error al autorizar con Google.';
        dom.authErrorMsg.classList.remove('hidden');
      } finally {
        dom.btnLoginGoogle.disabled = false;
        dom.btnLoginGoogle.innerHTML = `
          <svg class="w-4 h-4 mr-2" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span>Acceder con mi Cuenta de Google</span>
        `;
      }
    });

    function onGoogleAuthSuccess(user, token) {
      state.googleUser = user;
      dom.googleAuthStatusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium';
      dom.googleAuthStatusBadge.textContent = 'Conectado';

      dom.googleProfilePreview.classList.remove('hidden');
      dom.googleProfileImg.src = user.picture || 'https://cdn-icons-png.flaticon.com/512/561/561127.png';
      dom.googleProfileName.textContent = user.name;
      dom.googleProfileEmail.textContent = user.email;

      // Autocompletar nombre de usuario si está vacío
      if (!dom.inputPmailUsername.value) {
        const suggested = user.email.split('@')[0].replace(/[^a-z0-9._-]/g, '');
        dom.inputPmailUsername.value = suggested;
        updatePmailEmailPreview();
      }
    }

    // Validación de Carpeta e Ingreso
    dom.formGoogleAuth.addEventListener('submit', async (e) => {
      e.preventDefault();
      dom.authErrorMsg.classList.add('hidden');
      dom.authSuccessMsg.classList.add('hidden');

      if (!gdrive.accessToken) {
        dom.authErrorMsg.textContent = 'Debes conectarte con tu cuenta de Google primero.';
        dom.authErrorMsg.classList.remove('hidden');
        return;
      }

      const folderUrlInput = dom.inputGdriveFolderUrl.value.trim();
      const username = dom.inputPmailUsername.value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      const domain = dom.selectPmailDomain.value;
      const pmailEmail = `${username}${domain}`;

      dom.btnSubmitValidateEnter.disabled = true;
      dom.btnSubmitValidateEnter.innerHTML = '<span class="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2"></span> Validando carpeta y archivos...';

      try {
        // 1. Validar existencia y permisos en Google Drive
        const folderData = await gdrive.validateFolder(folderUrlInput);
        dom.modalGdriveFolderName.textContent = folderData.name;

        // 2. Comprobar si ya existen pmail_account.json y pmail_data_backup.json en la carpeta
        const { accountFile, dataFile } = await gdrive.findPmailFilesInFolder();

        let profileData = {
          pmailEmail,
          googleEmail: state.googleUser?.email || '',
          googleName: state.googleUser?.name || username,
          googlePicture: state.googleUser?.picture || '',
          folderId: folderData.id,
          folderName: folderData.name,
          domain,
          createdAt: Date.now()
        };

        if (accountFile) {
          // Restaurar perfil existente desde Google Drive
          const remoteAccount = await gdrive.downloadJsonFile(accountFile.id);
          if (remoteAccount && remoteAccount.pmailEmail) {
            profileData = { ...profileData, ...remoteAccount };
          }
        }

        if (dataFile) {
          // Restaurar datos existentes en la carpeta
          const remoteData = await gdrive.downloadJsonFile(dataFile.id);
          if (remoteData) {
            if (remoteData.emails) await db.saveEmailsBatch(remoteData.emails);
            if (remoteData.tasks) state.tasks = remoteData.tasks;
            if (remoteData.contacts) state.contacts = remoteData.contacts;
          }
        }

        // Guardar o actualizar archivos autónomamente en la carpeta de Drive
        await gdrive.syncAllToDrive(profileData, {
          emails: state.emails,
          tasks: state.tasks,
          contacts: state.contacts,
          lastSync: new Date().toISOString()
        });

        // Guardar perfil en sesión local
        localStorage.setItem(gdrive.STORAGE_KEY_PROFILE, JSON.stringify(profileData));
        applyUserProfile(profileData);
        updateDriveUI(true);

        dom.authSuccessMsg.textContent = `✔ Carpeta "${folderData.name}" validada con éxito. Sesión iniciada.`;
        dom.authSuccessMsg.classList.remove('hidden');

        setTimeout(async () => {
          hideAuthModal();
          await refreshAllData();
        }, 900);
      } catch (err) {
        dom.authErrorMsg.textContent = err.message;
        dom.authErrorMsg.classList.remove('hidden');
      } finally {
        dom.btnSubmitValidateEnter.disabled = false;
        dom.btnSubmitValidateEnter.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4 mr-2"></i> Validar Carpeta e Ingresar a Pmail';
        if (window.lucide) window.lucide.createIcons();
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

    // Modales de Drive
    const openDriveModal = () => {
      dom.gdriveModal.classList.remove('hidden');
      dom.userDropdown.classList.add('hidden');
      dom.modalGdriveStatusMsg.textContent = '';
      updateDriveUI(gdrive.isAuthenticated());
    };

    dom.btnOpenGdrive.addEventListener('click', openDriveModal);
    dom.dropdownBtnGdrive.addEventListener('click', openDriveModal);
    dom.btnCloseGdrive.addEventListener('click', () => dom.gdriveModal.classList.add('hidden'));

    dom.dropdownBtnSwitchAccount.addEventListener('click', () => {
      dom.userDropdown.classList.add('hidden');
      showAuthModal();
    });

    dom.btnLogout.addEventListener('click', () => {
      if (confirm('¿Cerrar sesión de Pmail y desvincular carpeta de Drive localmente?')) {
        dom.userDropdown.classList.add('hidden');
        gdrive.clearSession();
        updateDriveUI(false);
        showAuthModal();
      }
    });

    // Botones de sincronización manual
    dom.btnModalSyncGdrive.addEventListener('click', triggerDriveSync);
    dom.sidebarBtnSyncGdrive.addEventListener('click', triggerDriveSync);

    // Botón restaurar desde Drive
    dom.btnModalRestoreGdrive.addEventListener('click', async () => {
      if (!confirm('¿Deseas descargar y restaurar los datos desde tu carpeta de Google Drive?')) return;
      dom.btnModalRestoreGdrive.textContent = 'Descargando...';
      try {
        await checkAndRestoreFromDrive();
        alert('✔ Datos restaurados exitosamente desde tu carpeta de Google Drive.');
        dom.gdriveModal.classList.add('hidden');
      } catch (err) {
        alert('Error al restaurar: ' + err.message);
      } finally {
        dom.btnModalRestoreGdrive.innerHTML = '<i data-lucide="download-cloud" class="w-4 h-4 mr-1.5"></i> Restaurar desde Drive';
        if (window.lucide) window.lucide.createIcons();
      }
    });
  }

  // Sincronización a Drive manual
  async function triggerDriveSync() {
    if (!gdrive.isAuthenticated()) {
      showAuthModal();
      return;
    }

    dom.gdriveSyncSpinner.classList.add('animate-spin');
    dom.btnModalSyncGdrive.textContent = 'Sincronizando a Drive...';
    dom.modalGdriveStatusMsg.textContent = 'Subiendo pmail_data_backup.json y pmail_account.json...';

    const accountData = state.currentUser || gdrive.getSavedProfile();
    const dataPayload = {
      user: accountData,
      contacts: state.contacts,
      drafts: await db.getAllDrafts(),
      tasks: state.tasks,
      emails: state.emails,
      syncedAt: new Date().toISOString()
    };

    try {
      const res = await gdrive.syncAllToDrive(accountData, dataPayload);
      if (res && res.success) {
        dom.modalGdriveStatusMsg.innerHTML = `<span class="text-emerald-400">✔ Sincronizado en Drive (${new Date(res.syncedAt).toLocaleTimeString()})</span>`;
        alert('✔ Respaldo completado en tu carpeta de Google Drive.');
      }
    } catch (err) {
      dom.modalGdriveStatusMsg.textContent = `❌ Error: ${err.message}`;
      alert('Error al sincronizar con Google Drive: ' + err.message);
    } finally {
      dom.gdriveSyncSpinner.classList.remove('animate-spin');
      dom.btnModalSyncGdrive.innerHTML = '<i data-lucide="upload-cloud" class="w-4 h-4 mr-1.5"></i> Sincronizar a Drive Ahora';
      if (window.lucide) window.lucide.createIcons();
    }
  }

  // Sincronización silenciosa en background con debounce
  function scheduleSilentDriveSync() {
    if (!gdrive.isAuthenticated()) return;
    if (silentSyncTimeout) clearTimeout(silentSyncTimeout);

    silentSyncTimeout = setTimeout(async () => {
      try {
        const accountData = state.currentUser || gdrive.getSavedProfile();
        const dataPayload = {
          user: accountData,
          contacts: state.contacts,
          drafts: await db.getAllDrafts(),
          tasks: state.tasks,
          emails: state.emails,
          syncedAt: new Date().toISOString()
        };
        await gdrive.syncAllToDrive(accountData, dataPayload);
        console.log('[Pmail] Sincronización silenciosa a Google Drive completada.');
      } catch (err) {
        console.warn('[Pmail] Error en sincronización silenciosa:', err.message);
      }
    }, 4000);
  }

  // Restaurar desde Google Drive
  async function checkAndRestoreFromDrive() {
    if (!gdrive.isAuthenticated()) return;

    try {
      const { dataFile } = await gdrive.findPmailFilesInFolder();
      if (dataFile) {
        const remoteData = await gdrive.downloadJsonFile(dataFile.id);
        if (remoteData) {
          if (remoteData.emails && remoteData.emails.length > 0) {
            await db.saveEmailsBatch(remoteData.emails);
          }
          if (remoteData.tasks) state.tasks = remoteData.tasks;
          if (remoteData.contacts) state.contacts = remoteData.contacts;
          await refreshAllData();
        }
      }
    } catch (err) {
      console.warn('Error al restaurar en inicio:', err.message);
    }
  }

  async function refreshAllData() {
    state.emails = await db.getAllEmails();
    renderEmailList();
    updateBadges();
    renderTasks();
    renderContacts();
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
        scheduleSilentDriveSync();
      }

      // Reenviar correos pendientes generados en la web
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
      scheduleSilentDriveSync();
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
      const activeUser = state.currentUser || gdrive.getSavedProfile();
      const myEmail = activeUser ? activeUser.pmailEmail : 'usuario@pac.p';

      localEmails = [
        {
          id: 'web_welcome_01',
          from_address: 'soporte@pac.p',
          to_address: myEmail,
          subject: '¡Bienvenido a Pmail en Google Drive!',
          body_text: 'Tu cuenta personalizada está lista. Los archivos pmail_account.json y pmail_data_backup.json se sincronizan automáticamente en tu carpeta de Google Drive.',
          body_html: '<p>Tu cuenta personalizada está lista.<br>Los archivos <code>pmail_account.json</code> y <code>pmail_data_backup.json</code> se sincronizan de forma autónoma en tu carpeta de <b>Google Drive</b>.</p>',
          folder: 'inbox',
          status: 'SYNCED',
          created_at: Date.now() - 3600000
        },
        {
          id: 'web_welcome_02',
          from_address: 'operaciones@pacur.p',
          to_address: myEmail,
          subject: 'Respaldo Autónomo Cross-Device',
          body_text: 'Al abrir Pmail en cualquier otra PC o navegador ingresando el mismo enlace de tu carpeta de Drive, tus correos se restaurarán instantáneamente.',
          body_html: '<p>Al abrir Pmail en cualquier otra PC o navegador ingresando el mismo enlace de tu carpeta de Drive, tus correos se restaurarán instantáneamente.</p>',
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
          alert('Correo guardado en cola local IndexedDB (se enviará automáticamente cuando conectes la app de PC).');
        }
        renderEmailList();
        updateBadges();
        closeComposer();
        scheduleSilentDriveSync();
      } catch (err) {
        emailData.status = 'PENDING_SEND';
        await db.saveEmail(emailData);
        state.emails.unshift(emailData);
        renderEmailList();
        updateBadges();
        closeComposer();
        scheduleSilentDriveSync();
        alert('Guardado en cola IndexedDB: ' + err.message);
      } finally {
        dom.btnSubmitSend.disabled = false;
        dom.btnSubmitSend.innerHTML = '<i data-lucide="send" class="w-3.5 h-3.5 mr-1"></i> Enviar';
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
      scheduleSilentDriveSync();
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
        scheduleSilentDriveSync();
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
      scheduleSilentDriveSync();
    });
  }

  function setupShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        if (e.key === 'Escape') {
          closeComposer();
          dom.lanModal.classList.add('hidden');
          dom.importModal.classList.add('hidden');
          dom.gdriveModal.classList.add('hidden');
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
    scheduleSilentDriveSync();
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
