// AI Dict - Options Page Script

const PRESETS = {
  cambridge: {
    name: 'Cambridge',
    language: 'en',
    url_template: 'https://dictionary.cambridge.org/dictionary/english/{{str}}',
    icon_url: 'https://dictionary.cambridge.org/external/images/favicon.ico'
  },
  leo: {
    name: 'LEO',
    language: 'de',
    url_template: 'https://dict.leo.org/german-english/{{str}}',
    icon_url: 'https://dict.leo.org/favicon.ico'
  },
  duden: {
    name: 'Duden',
    language: 'de',
    url_template: 'https://www.duden.de/suchen/dudenonline/{{str}}',
    icon_url: 'https://www.duden.de/favicon.ico'
  },
  wiktionary: {
    name: 'Wiktionary',
    language: 'all',
    url_template: 'https://en.wiktionary.org/wiki/{{str}}',
    icon_url: 'https://en.wiktionary.org/favicon.ico'
  },
  deepl: {
    name: 'DeepL',
    language: 'all',
    url_template: 'https://www.deepl.com/translator#auto/en/{{str}}',
    icon_url: 'https://www.deepl.com/img/favicon/favicon-32x32.png'
  },
  google: {
    name: 'Google Translate',
    language: 'all',
    url_template: 'https://translate.google.com/?sl=auto&tl=en&text={{str}}',
    icon_url: 'https://ssl.gstatic.com/translate/favicon.ico'
  },
  wordreference: {
    name: 'WordReference',
    language: 'all',
    url_template: 'https://www.wordreference.com/enit/{{str}}',
    icon_url: 'https://www.wordreference.com/favicon.ico'
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const serverUrlInput = document.getElementById('server-url');
  const testConnectionBtn = document.getElementById('test-connection-btn');
  const connectionStatusMsg = document.getElementById('connection-status-msg');
  const activeProfileSelect = document.getElementById('active-profile-select');
  const activeSessionInput = document.getElementById('active-session-id');
  const optDefaultMode = document.getElementById('opt-default-mode');
  const optModifierKey = document.getElementById('opt-modifier-key');
  const optDoubleClickLookup = document.getElementById('opt-double-click-lookup');
  const optPersistentWindow = document.getElementById('opt-persistent-window');
  const optPersistentNewTab = document.getElementById('opt-persistent-newtab');
  const optAutoDetectSentence = document.getElementById('opt-auto-detect-sentence');
  const optCardPlacement = document.getElementById('opt-card-placement');
  const optExternalOverlay = document.getElementById('opt-external-overlay');
  const optBlacklist = document.getElementById('opt-blacklist');
  const domainChipsContainer = document.getElementById('domain-chips-container');
  const addDomainInput = document.getElementById('add-domain-input');
  const addDomainBtn = document.getElementById('add-domain-btn');
  const testDomainInput = document.getElementById('test-domain-input');
  const testDomainBtn = document.getElementById('test-domain-btn');
  const testDomainResult = document.getElementById('test-domain-result');
  const optTheme = document.getElementById('opt-theme');
  const sizeDisplay = document.getElementById('size-display');
  const resetSizeBtn = document.getElementById('reset-size-btn');
  const saveAllBtn = document.getElementById('save-all-btn');
  const saveToast = document.getElementById('save-toast');
  const openAppLink = document.getElementById('open-app-link');
  const externalSitesTbody = document.getElementById('external-sites-tbody');
  const addSiteBtn = document.getElementById('add-site-btn');
  const syncTemplatesBtn = document.getElementById('sync-templates-btn');
  const siteModal = document.getElementById('site-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  const siteForm = document.getElementById('site-form');
  const optionsBody = document.getElementById('options-body');

  let currentSettings = await chrome.storage.local.get(null);
  let currentSites = currentSettings.externalSites || [];
  let currentBlacklist = (currentSettings.blacklist || []).map(s => s.trim()).filter(Boolean);
  let profilesList = [];

  // Tab navigation
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = link.dataset.tab;
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      link.classList.add('active');
      const targetPanel = document.getElementById(`panel-${tabId}`);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // Load and apply form fields
  populateFormFields();

  // Test connection button
  testConnectionBtn.addEventListener('click', testConnection);

  // Open App button
  openAppLink.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'OPEN_APP' });
  });

  // Reset Size Button
  if (resetSizeBtn) {
    resetSizeBtn.addEventListener('click', async () => {
      await chrome.storage.local.set({ cardWidth: 440, cardHeight: 520 });
      currentSettings.cardWidth = 440;
      currentSettings.cardHeight = 520;
      if (sizeDisplay) sizeDisplay.textContent = '440 × 520 px';
      showToast('Popup window size reset to default (440×520)!');
    });
  }

  // Manage Shortcuts Button
  const manageShortcutsBtn = document.getElementById('manage-shortcuts-btn');
  if (manageShortcutsBtn) {
    manageShortcutsBtn.addEventListener('click', () => {
      if (chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }, () => {
          if (chrome.runtime.lastError) {
            alert('To customize shortcuts, navigate to chrome://extensions/shortcuts in your browser address bar.');
          }
        });
      }
    });
  }

  // Default Lookup Action change listener
  if (optDefaultMode) {
    optDefaultMode.addEventListener('change', async (e) => {
      await chrome.storage.local.set({ defaultMode: e.target.value });
      currentSettings.defaultMode = e.target.value;
      const text = e.target.options[e.target.selectedIndex] ? e.target.options[e.target.selectedIndex].text : e.target.value;
      showToast(`Default Lookup Action set to ${text}!`);
    });
  }

  // Default Persistent Window checkbox live change
  if (optPersistentWindow) {
    optPersistentWindow.addEventListener('change', async (e) => {
      await chrome.storage.local.set({ defaultPersistentWindow: e.target.checked });
      await chrome.storage.local.remove(['persistentWindow']).catch(() => {});
      currentSettings.defaultPersistentWindow = e.target.checked;
      showToast(e.target.checked ? 'Default Persistent Window enabled for new tabs!' : 'Default Persistent Window disabled!');
    });
  }

  // Persistent New Tab While Loading checkbox live change
  if (optPersistentNewTab) {
    optPersistentNewTab.addEventListener('change', async (e) => {
      await chrome.storage.local.set({ persistentNewTabOnLoading: e.target.checked });
      currentSettings.persistentNewTabOnLoading = e.target.checked;
      showToast(e.target.checked ? 'New Tab while loading enabled!' : 'New Tab while loading disabled!');
    });
  }

  // Save All button
  saveAllBtn.addEventListener('click', saveAllSettings);

  // Preset chips click for external dictionaries
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const presetKey = chip.dataset.preset;
      if (!presetKey) return;
      const preset = PRESETS[presetKey];
      if (preset) {
        addOrUpdateSite({
          id: `preset_${presetKey}_${Date.now()}`,
          name: preset.name,
          language: preset.language,
          url_template: preset.url_template,
          icon_url: preset.icon_url
        });
      }
    });
  });

  // Domain Management UI
  function renderDomainChips() {
    if (!domainChipsContainer) return;
    if (currentBlacklist.length === 0) {
      domainChipsContainer.innerHTML = '<span style="opacity:0.5; font-size:12px; font-style:italic;">No domains blacklisted. AI Dict is enabled on all websites.</span>';
      return;
    }

    domainChipsContainer.innerHTML = currentBlacklist.map((d, idx) => `
      <div class="domain-chip" style="display:inline-flex; align-items:center; gap:6px; background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); color:#f87171; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:500;">
        <span>${escapeHtml(d)}</span>
        <button type="button" class="domain-chip-remove" data-idx="${idx}" style="background:none; border:none; color:inherit; cursor:pointer; font-size:14px; line-height:1; padding:0 2px;" title="Remove ${escapeHtml(d)} from blacklist">×</button>
      </div>
    `).join('');

    domainChipsContainer.querySelectorAll('.domain-chip-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        currentBlacklist.splice(idx, 1);
        syncBlacklist();
      });
    });
  }

  function syncBlacklist() {
    if (optBlacklist) optBlacklist.value = currentBlacklist.join('\n');
    renderDomainChips();
  }

  if (addDomainBtn && addDomainInput) {
    const handleAdd = () => {
      const raw = addDomainInput.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (!raw) return;
      if (!currentBlacklist.includes(raw)) {
        currentBlacklist.push(raw);
        syncBlacklist();
      }
      addDomainInput.value = '';
    };

    addDomainBtn.addEventListener('click', handleAdd);
    addDomainInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    });
  }

  document.querySelectorAll('.domain-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = btn.dataset.domain;
      if (d && !currentBlacklist.includes(d)) {
        currentBlacklist.push(d);
        syncBlacklist();
      }
    });
  });

  if (optBlacklist) {
    optBlacklist.addEventListener('input', () => {
      currentBlacklist = optBlacklist.value
        .split('\n')
        .map(s => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
        .filter(Boolean);
      renderDomainChips();
    });
  }

  if (testDomainBtn && testDomainInput && testDomainResult) {
    testDomainBtn.addEventListener('click', () => {
      const d = testDomainInput.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (!d) return;
      testDomainResult.style.display = 'block';
      const isBlocked = currentBlacklist.some(b => d.includes(b));
      if (isBlocked) {
        testDomainResult.innerHTML = `<span style="color:#ef4444; font-weight:600;">⛔ AI Dict is DISABLED on ${escapeHtml(d)}</span> (matches blacklisted domain)`;
      } else {
        testDomainResult.innerHTML = `<span style="color:#22c55e; font-weight:600;">✓ AI Dict is ACTIVE on ${escapeHtml(d)}</span>`;
      }
    });
  }

  document.querySelectorAll('.nav-switch-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.dataset.target;
      const navTarget = document.querySelector(`.nav-link[data-tab="${target}"]`);
      if (navTarget) navTarget.click();
    });
  });

  // Add Custom Site modal
  addSiteBtn.addEventListener('click', () => {
    openSiteModal();
  });

  modalCloseBtn.addEventListener('click', closeSiteModal);
  modalCancelBtn.addEventListener('click', closeSiteModal);

  // Site form submit
  siteForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = document.getElementById('site-edit-id').value;
    const name = document.getElementById('modal-site-name').value.trim();
    const url_template = document.getElementById('modal-site-url').value.trim();
    const language = document.getElementById('modal-site-lang').value.trim() || 'all';
    const icon_url = document.getElementById('modal-site-icon').value.trim();

    const siteObj = {
      id: editId || `site_${Date.now()}`,
      name,
      url_template,
      language,
      icon_url
    };

    addOrUpdateSite(siteObj);
    closeSiteModal();
  });

  // Sync templates from AI Dict backend
  syncTemplatesBtn.addEventListener('click', syncTemplatesFromBackend);

  // Theme change live preview
  optTheme.addEventListener('change', (e) => {
    optionsBody.className = `theme-${e.target.value}`;
  });

  function populateFormFields() {
    serverUrlInput.value = currentSettings.serverUrl || 'http://127.0.0.1:4321';
    activeSessionInput.value = currentSettings.activeSessionId || '';
    if (optDefaultMode) optDefaultMode.value = currentSettings.defaultMode || 'machine_translation';
    optModifierKey.value = currentSettings.modifierKey || 'none';
    if (optDoubleClickLookup) optDoubleClickLookup.checked = currentSettings.doubleClickLookup !== false;
    if (optPersistentWindow) optPersistentWindow.checked = currentSettings.defaultPersistentWindow === true;
    if (optPersistentNewTab) optPersistentNewTab.checked = currentSettings.persistentNewTabOnLoading === true;
    optAutoDetectSentence.checked = currentSettings.autoDetectSentence !== false;
    if (optCardPlacement) optCardPlacement.value = currentSettings.cardPlacement || 'auto';
    if (optExternalOverlay) optExternalOverlay.checked = currentSettings.showExternalFallbackOverlay === true;
    currentBlacklist = (currentSettings.blacklist || []).map(s => s.trim()).filter(Boolean);
    syncBlacklist();
    optTheme.value = currentSettings.theme || 'tokyonight';
    optionsBody.className = `theme-${optTheme.value}`;

    if (sizeDisplay) {
      sizeDisplay.textContent = `${currentSettings.cardWidth || 440} × ${currentSettings.cardHeight || 520} px`;
    }

    const trig = currentSettings.triggerMode || 'bubble';
    const trigRadio = document.querySelector(`input[name="optTriggerMode"][value="${trig}"]`);
    if (trigRadio) trigRadio.checked = true;

    renderSitesTable();
    fetchProfiles();
  }

  async function testConnection() {
    connectionStatusMsg.style.display = 'block';
    connectionStatusMsg.className = 'status-msg';
    connectionStatusMsg.textContent = 'Testing connection to AI Dict...';

    const testUrl = serverUrlInput.value.trim() || 'http://127.0.0.1:4321';
    const startTime = performance.now();

    try {
      const res = await fetch(`${testUrl.replace(/\/+$/, '')}/api/profiles`);
      const latency = Math.round(performance.now() - startTime);

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();

      connectionStatusMsg.className = 'status-msg success';
      connectionStatusMsg.textContent = `✓ Connected! (${latency}ms) — Found ${Array.isArray(data) ? data.length : 0} profiles.`;

      if (Array.isArray(data)) {
        profilesList = data;
        populateProfilesDropdown();
      }
    } catch (err) {
      connectionStatusMsg.className = 'status-msg error';
      connectionStatusMsg.textContent = `✗ Connection failed: ${err.message}. Make sure AI Dict is running ('ai_dict serve').`;
    }
  }

  async function fetchProfiles() {
    try {
      const base = (serverUrlInput.value || 'http://127.0.0.1:4321').replace(/\/+$/, '');
      const res = await fetch(`${base}/api/profiles`);
      if (res.ok) {
        profilesList = await res.json();
        populateProfilesDropdown();
      }
    } catch (e) {}
  }

  function populateProfilesDropdown() {
    if (!profilesList || profilesList.length === 0) return;
    activeProfileSelect.innerHTML = profilesList.map(p => `
      <option value="${p.id}" ${p.id === currentSettings.activeProfileId ? 'selected' : ''}>👤 ${escapeHtml(p.name)}</option>
    `).join('');
  }

  function renderSitesTable() {
    if (!currentSites || currentSites.length === 0) {
      externalSitesTbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding:24px; opacity:0.6;">
            No external sites configured. Click "Add Popular Dictionaries" above or "Add Custom Site".
          </td>
        </tr>
      `;
      return;
    }

    externalSitesTbody.innerHTML = currentSites.map(s => `
      <tr data-id="${escapeHtml(s.id)}">
        <td>
          ${s.icon_url 
            ? `<img src="${escapeHtml(s.icon_url)}" class="site-icon-img"/>` 
            : `<img src="icons/icon16.png" class="site-icon-img"/>`}
        </td>
        <td class="site-name-col">${escapeHtml(s.name)}</td>
        <td><span class="preset-chip" style="padding:1px 6px; font-size:10px;">${escapeHtml(s.language || 'all')}</span></td>
        <td><span class="site-url-code" title="${escapeHtml(s.url_template)}">${escapeHtml(s.url_template)}</span></td>
        <td>
          <div class="table-actions">
            <button class="table-btn edit-site-btn" data-id="${escapeHtml(s.id)}">Edit</button>
            <button class="table-btn delete delete-site-btn" data-id="${escapeHtml(s.id)}">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');

    // Handle image load errors cleanly without violating CSP inline handler rule
    externalSitesTbody.querySelectorAll('.site-icon-img').forEach(img => {
      img.addEventListener('error', () => {
        img.src = 'icons/icon16.png';
      });
    });

    // Attach edit and delete listeners
    externalSitesTbody.querySelectorAll('.edit-site-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const found = currentSites.find(s => s.id === id);
        if (found) openSiteModal(found);
      });
    });

    externalSitesTbody.querySelectorAll('.delete-site-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        currentSites = currentSites.filter(s => s.id !== id);
        renderSitesTable();
        chrome.storage.local.set({ externalSites: currentSites });
      });
    });
  }

  function openSiteModal(site = null) {
    document.getElementById('site-edit-id').value = site ? site.id : '';
    document.getElementById('modal-site-name').value = site ? site.name : '';
    document.getElementById('modal-site-url').value = site ? site.url_template : '';
    document.getElementById('modal-site-lang').value = site ? (site.language || 'all') : 'all';
    document.getElementById('modal-site-icon').value = site ? (site.icon_url || '') : '';
    document.getElementById('modal-title').textContent = site ? 'Edit External Site' : 'Add External Dictionary Site';
    siteModal.style.display = 'flex';
  }

  function closeSiteModal() {
    siteModal.style.display = 'none';
  }

  function addOrUpdateSite(siteObj) {
    const idx = currentSites.findIndex(s => s.id === siteObj.id);
    if (idx >= 0) {
      currentSites[idx] = siteObj;
    } else {
      currentSites.push(siteObj);
    }
    renderSitesTable();
    chrome.storage.local.set({ externalSites: currentSites });
    showToast('External site updated!');
  }

  async function syncTemplatesFromBackend() {
    const base = (serverUrlInput.value || 'http://127.0.0.1:4321').replace(/\/+$/, '');
    syncTemplatesBtn.disabled = true;
    syncTemplatesBtn.textContent = 'Syncing...';

    try {
      const res = await fetch(`${base}/api/templates`);
      if (!res.ok) throw new Error(await res.text());
      const backendTemplates = await res.json();

      if (Array.isArray(backendTemplates)) {
        let addedCount = 0;
        backendTemplates.forEach(bt => {
          const exists = currentSites.some(cs => cs.name.toLowerCase() === bt.name.toLowerCase());
          if (!exists) {
            currentSites.push({
              id: `backend_${bt.id}_${Date.now()}`,
              name: bt.name,
              language: bt.language || 'all',
              url_template: bt.url_template,
              icon_url: bt.icon_url || ''
            });
            addedCount++;
          }
        });

        renderSitesTable();
        await chrome.storage.local.set({ externalSites: currentSites });
        showToast(`Synced ${addedCount} new templates from AI Dict!`);
      }
    } catch (err) {
      alert(`Could not sync templates from AI Dict: ${err.message}`);
    } finally {
      syncTemplatesBtn.disabled = false;
      syncTemplatesBtn.textContent = '🔄 Sync from AI Dict';
    }
  }

  async function saveAllSettings() {
    const trigSelected = document.querySelector('input[name="optTriggerMode"]:checked');
    const trigVal = trigSelected ? trigSelected.value : 'bubble';

    const pId = parseInt(activeProfileSelect.value) || 1;
    const pObj = profilesList.find(p => p.id === pId);
    const pName = pObj ? pObj.name : `Profile ${pId}`;

    const blacklistLines = optBlacklist.value
      .split('\n')
      .map(s => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
      .filter(Boolean);
    currentBlacklist = blacklistLines;

    const toSave = {
      serverUrl: serverUrlInput.value.trim() || 'http://127.0.0.1:4321',
      activeProfileId: pId,
      activeProfileName: pName,
      activeSessionId: activeSessionInput.value.trim(),
      defaultMode: optDefaultMode ? optDefaultMode.value : 'machine_translation',
      triggerMode: trigVal,
      doubleClickLookup: optDoubleClickLookup ? optDoubleClickLookup.checked : true,
      defaultPersistentWindow: optPersistentWindow ? optPersistentWindow.checked : false,
      persistentNewTabOnLoading: optPersistentNewTab ? optPersistentNewTab.checked : false,
      modifierKey: optModifierKey.value,
      autoDetectSentence: optAutoDetectSentence.checked,
      cardPlacement: optCardPlacement ? optCardPlacement.value : 'auto',
      showExternalFallbackOverlay: optExternalOverlay ? optExternalOverlay.checked : false,
      blacklist: blacklistLines,
      theme: optTheme.value,
      externalSites: currentSites
    };

    await chrome.storage.local.set(toSave);
    await chrome.storage.local.remove(['persistentWindow']).catch(() => {});
    currentSettings = { ...currentSettings, ...toSave };
    showToast('All settings saved successfully!');
  }

  function showToast(msg = 'Settings saved!') {
    saveToast.textContent = msg;
    saveToast.classList.add('show');
    setTimeout(() => {
      saveToast.classList.remove('show');
    }, 2400);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
