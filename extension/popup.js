// AI Dict - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const statusIndicator = document.getElementById('status-indicator');
  const profileSelect = document.getElementById('profile-select');
  const activeProfileBadge = document.getElementById('active-profile-badge');
  const quickSearchForm = document.getElementById('quick-search-form');
  const quickSearchInput = document.getElementById('quick-search-input');
  const quickResultBox = document.getElementById('quick-result-box');
  const resultTerm = document.getElementById('result-term');
  const resultLang = document.getElementById('result-lang');
  const resultContent = document.getElementById('result-content');
  const recentWordsList = document.getElementById('recent-words-list');
  const refreshRecentBtn = document.getElementById('refresh-recent-btn');
  const openAppBtn = document.getElementById('open-app-btn');
  const openOptionsBtn = document.getElementById('open-options-btn');
  const modifierSelect = document.getElementById('modifier-select');
  const doubleClickCheckbox = document.getElementById('double-click-lookup');
  const themeSelect = document.getElementById('theme-select');
  const popupBody = document.getElementById('popup-body');
  const popupOpenPageBtn = document.getElementById('popup-open-page-btn');
  const popupMoveBtn = document.getElementById('popup-move-btn');
  const popupMoveMenu = document.getElementById('popup-move-menu');
  const popupDeleteBtn = document.getElementById('popup-delete-btn');
  const popupSimpleLlmSaveBtn = document.getElementById('popup-simple-llm-save-btn');
  const popupSimpleLlmPromptRow = document.getElementById('popup-simple-llm-prompt-row');
  const popupSimpleLlmPromptSelect = document.getElementById('popup-simple-llm-prompt-select');
  const popupSimpleLlmSetDefaultBtn = document.getElementById('popup-simple-llm-set-default-btn');
  const popupResultPromptBar = document.getElementById('popup-result-prompt-bar');
  const popupResultPromptSelect = document.getElementById('popup-result-prompt-select');
  const popupResultRerunBtn = document.getElementById('popup-result-rerun-btn');
  const siteStatusBar = document.getElementById('site-status-bar');
  const siteStatusDot = document.getElementById('site-status-dot');
  const siteDomainLabel = document.getElementById('site-domain-label');
  const toggleSiteBtn = document.getElementById('toggle-site-btn');
  const pauseStatusDot = document.getElementById('pause-status-dot');
  const pauseStatusText = document.getElementById('pause-status-text');
  const pause15mBtn = document.getElementById('pause-15m-btn');
  const pause1hBtn = document.getElementById('pause-1h-btn');
  const pauseToggleBtn = document.getElementById('pause-toggle-btn');
  const togglePersistentBtn = document.getElementById('toggle-persistent-btn');
  const persistentDot = document.getElementById('persistent-dot');
  const persistentBtnText = document.getElementById('persistent-btn-text');
  const activatePersistentBtn = document.getElementById('activate-persistent-btn');
  const togglePersistentNewTabBtn = document.getElementById('toggle-persistent-newtab-btn');
  const persistentNewTabDot = document.getElementById('persistent-newtab-dot');
  const persistentNewTabBtnText = document.getElementById('persistent-newtab-btn-text');
  const popupLangRow = document.getElementById('popup-lang-row');
  const popupModetypeBtn = document.getElementById('popup-modetype-btn');
  const popupModetypeLabel = document.getElementById('popup-modetype-label');
  const popupLangSelectors = document.getElementById('popup-lang-selectors');
  const popupSrcLangSelect = document.getElementById('popup-src-lang-select');
  const popupSwapLangBtn = document.getElementById('popup-swap-lang-btn');
  const popupTgtLangSelect = document.getElementById('popup-tgt-lang-select');
  const llmModeStatusBar = document.getElementById('llm-mode-status-bar');
  const activateQuickLlmBtn = document.getElementById('activate-quick-llm-btn');
  const toggleQuickLlmBtn = document.getElementById('toggle-quick-llm-btn');
  const quickLlmDot = document.getElementById('quick-llm-dot');
  const quickLlmBtnText = document.getElementById('quick-llm-btn-text');
  const activateLlmBtn = document.getElementById('activate-llm-btn');
  const toggleLlmModeBtn = document.getElementById('toggle-llm-mode-btn');
  const llmModeDot = document.getElementById('llm-mode-dot');
  const llmModeBtnText = document.getElementById('llm-mode-btn-text');

  let config = await chrome.storage.local.get(null);
  let profiles = [];
  let currentPopupResult = null;
  let currentSiteDomain = '';
  let selectedHistoryMode = 'search';
  let selectedSearchMode = config.defaultMode || 'machine_translation';

  // Apply saved theme
  applyTheme(config.theme || 'tokyonight');

  const BUILTIN_SIMPLE_LLM_PRESETS = [
    { id: 'quick_glance', icon: '⚡', name: 'Quick Glance' },
    { id: 'grammar_breakdown', icon: '🧩', name: 'Grammar & Syntax' },
    { id: 'nuance_slang', icon: '💡', name: 'Nuance & Context' },
    { id: 'simplify', icon: '👶', name: 'Plain & Simple (ELI5)' },
    { id: 'key_points', icon: '📋', name: 'Key Takeaways' },
    { id: 'examples', icon: '🗣️', name: 'Real Dialogues' }
  ];

  function populatePopupPromptSelects(promptsList, activeKey) {
    const list = (promptsList && promptsList.length > 0) ? promptsList : BUILTIN_SIMPLE_LLM_PRESETS;
    const key = activeKey || config.simpleLlmActivePrompt || config.simpleLlmDefaultPrompt || 'quick_glance';
    const html = list.map(p => {
      const icon = p.icon || '⚡';
      const label = p.name ? (p.name.includes(icon) ? p.name : `${icon} ${p.name}`) : p.id;
      return `<option value="${escapeHtml(p.id)}">${escapeHtml(label)}</option>`;
    }).join('');

    if (popupSimpleLlmPromptSelect) {
      popupSimpleLlmPromptSelect.innerHTML = html;
      popupSimpleLlmPromptSelect.value = key;
      if (!popupSimpleLlmPromptSelect.value && list[0]) {
        popupSimpleLlmPromptSelect.value = list[0].id;
      }
    }
    if (popupResultPromptSelect) {
      popupResultPromptSelect.innerHTML = html;
      popupResultPromptSelect.value = key;
      if (!popupResultPromptSelect.value && list[0]) {
        popupResultPromptSelect.value = list[0].id;
      }
    }
  }

  populatePopupPromptSelects(config.simpleLlmPrompts);

  if (popupSimpleLlmPromptRow) {
    popupSimpleLlmPromptRow.style.display = (selectedSearchMode === 'simple_llm') ? 'flex' : 'none';
  }
  if (popupResultPromptBar) {
    popupResultPromptBar.style.display = 'none';
  }

  // Apply quick pause UI
  function updatePauseUI() {
    if (!pauseStatusText || !pauseStatusDot || !pauseToggleBtn) return;
    const isPaused = config.isPaused === true;
    const pauseUntil = config.pauseUntil || 0;

    if (isPaused) {
      if (pauseUntil > 0) {
        const remainingMs = pauseUntil - Date.now();
        if (remainingMs <= 0) {
          config.isPaused = false;
          config.pauseUntil = 0;
          chrome.storage.local.set({ isPaused: false, pauseUntil: 0 });
          updatePauseUI();
          return;
        }
        const remainingMin = Math.ceil(remainingMs / 60000);
        pauseStatusText.textContent = `⏸ Paused (${remainingMin}m left)`;
      } else {
        pauseStatusText.textContent = '⏸ Paused (Manual)';
      }
      pauseStatusDot.className = 'pause-status-dot paused';
      pauseToggleBtn.textContent = '▶ Resume';
      pauseToggleBtn.className = 'pause-toggle-btn is-paused';
      if (pause15mBtn) pause15mBtn.style.display = 'none';
      if (pause1hBtn) pause1hBtn.style.display = 'none';
    } else {
      pauseStatusText.textContent = 'Extension Active';
      pauseStatusDot.className = 'pause-status-dot';
      pauseToggleBtn.textContent = 'Pause';
      pauseToggleBtn.className = 'pause-toggle-btn';
      if (pause15mBtn) pause15mBtn.style.display = 'inline-block';
      if (pause1hBtn) pause1hBtn.style.display = 'inline-block';
    }
  }

  updatePauseUI();

  if (pause15mBtn) {
    pause15mBtn.addEventListener('click', async () => {
      config.isPaused = true;
      config.pauseUntil = Date.now() + 15 * 60 * 1000;
      await chrome.storage.local.set({ isPaused: true, pauseUntil: config.pauseUntil });
      updatePauseUI();
    });
  }

  if (pause1hBtn) {
    pause1hBtn.addEventListener('click', async () => {
      config.isPaused = true;
      config.pauseUntil = Date.now() + 60 * 60 * 1000;
      await chrome.storage.local.set({ isPaused: true, pauseUntil: config.pauseUntil });
      updatePauseUI();
    });
  }

  if (pauseToggleBtn) {
    pauseToggleBtn.addEventListener('click', async () => {
      if (config.isPaused) {
        config.isPaused = false;
        config.pauseUntil = 0;
        await chrome.storage.local.set({ isPaused: false, pauseUntil: 0 });
      } else {
        config.isPaused = true;
        config.pauseUntil = 0;
        await chrome.storage.local.set({ isPaused: true, pauseUntil: 0 });
      }
      updatePauseUI();
    });
  }

  let activeTabPersistent = false;

  // Query active tab persistent state from background
  if (chrome.tabs?.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs && tabs[0];
      if (activeTab?.id) {
        chrome.runtime.sendMessage({ action: 'GET_TAB_PERSISTENT', tabId: activeTab.id }, (res) => {
          if (res && res.success) {
            activeTabPersistent = !!res.persistent;
            updatePersistentUI();
          }
        });
      }
    });
  }

  // Persistent Window Mode Toggle
  function updatePersistentUI() {
    if (!togglePersistentBtn || !persistentDot || !persistentBtnText) return;
    const isPersistent = !!activeTabPersistent;
    if (isPersistent) {
      persistentDot.className = 'persistent-dot active';
      persistentBtnText.textContent = 'ON';
      togglePersistentBtn.className = 'persistent-toggle-btn is-active';
      togglePersistentBtn.title = 'Persistent Window: ON (Current tab only - click to turn OFF)';
    } else {
      persistentDot.className = 'persistent-dot';
      persistentBtnText.textContent = 'OFF';
      togglePersistentBtn.className = 'persistent-toggle-btn';
      togglePersistentBtn.title = 'Persistent Window: OFF (Current tab only - click to turn ON)';
    }
  }

  updatePersistentUI();

  if (togglePersistentBtn) {
    togglePersistentBtn.addEventListener('click', async () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs && tabs[0];
        if (activeTab?.id) {
          chrome.runtime.sendMessage({ action: 'TOGGLE_TAB_PERSISTENT', tabId: activeTab.id }, (res) => {
            if (res && res.success) {
              activeTabPersistent = !!res.persistent;
              updatePersistentUI();
            }
          });
        }
      });
    });
  }

  if (activatePersistentBtn) {
    activatePersistentBtn.addEventListener('click', async () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs && tabs[0];
        if (activeTab?.id) {
          chrome.runtime.sendMessage({ action: 'SET_TAB_PERSISTENT', tabId: activeTab.id, persistent: true }, (res) => {
            if (res && res.success) {
              activeTabPersistent = true;
              updatePersistentUI();
            }
          });
        }
      });

      const term = (quickSearchInput ? quickSearchInput.value : '').trim();
      const mode = selectedSearchMode || 'search';
      sendActivatePersistentWindowToTab(term, mode);
    });
  }

  // Persistent New Tab Mode Toggle
  function updatePersistentNewTabUI() {
    if (!togglePersistentNewTabBtn || !persistentNewTabDot || !persistentNewTabBtnText) return;
    const isNewTab = !!config.persistentNewTabOnLoading;
    if (isNewTab) {
      persistentNewTabDot.className = 'persistent-dot active';
      persistentNewTabBtnText.textContent = 'ON';
      togglePersistentNewTabBtn.className = 'persistent-toggle-btn is-active';
      togglePersistentNewTabBtn.title = 'New Tab If Loading: ON (Opens new tab if prior word still loading - click to turn OFF)';
    } else {
      persistentNewTabDot.className = 'persistent-dot';
      persistentNewTabBtnText.textContent = 'OFF';
      togglePersistentNewTabBtn.className = 'persistent-toggle-btn';
      togglePersistentNewTabBtn.title = 'New Tab If Loading: OFF (Replaces current search - click to turn ON)';
    }
  }

  updatePersistentNewTabUI();

  if (togglePersistentNewTabBtn) {
    togglePersistentNewTabBtn.addEventListener('click', async () => {
      config.persistentNewTabOnLoading = !config.persistentNewTabOnLoading;
      await chrome.storage.local.set({ persistentNewTabOnLoading: config.persistentNewTabOnLoading });
      updatePersistentNewTabUI();
    });
  }

  // Quick LLM & Full LLM Mode UI & Toggles
  function updateLlmModeUI() {
    if (config.showLlmModeInPopup === false) {
      if (llmModeStatusBar) llmModeStatusBar.style.display = 'none';
      return;
    } else {
      if (llmModeStatusBar) llmModeStatusBar.style.display = 'flex';
    }

    const currentMode = config.defaultMode || 'machine_translation';
    const isQuickLlm = currentMode === 'simple_llm';
    const isFullLlm = currentMode !== 'machine_translation' && currentMode !== 'simple_llm';

    // Quick LLM status
    if (toggleQuickLlmBtn && quickLlmDot && quickLlmBtnText) {
      if (isQuickLlm) {
        quickLlmDot.className = 'persistent-dot quick-active';
        quickLlmBtnText.textContent = 'ON';
        toggleQuickLlmBtn.className = 'persistent-toggle-btn quick-toggle-btn is-active';
        toggleQuickLlmBtn.title = 'Quick LLM: ON (Ling Flash) - click to switch default back to Simple MT';
      } else {
        quickLlmDot.className = 'persistent-dot';
        quickLlmBtnText.textContent = 'OFF';
        toggleQuickLlmBtn.className = 'persistent-toggle-btn quick-toggle-btn';
        toggleQuickLlmBtn.title = 'Quick LLM: OFF (Simple MT active) - click to turn ON Quick LLM Mode';
      }
    }

    // Full LLM status
    if (toggleLlmModeBtn && llmModeDot && llmModeBtnText) {
      if (isFullLlm) {
        llmModeDot.className = 'persistent-dot active';
        llmModeBtnText.textContent = 'ON';
        toggleLlmModeBtn.className = 'persistent-toggle-btn llm-toggle-btn is-active';
        const modeName = currentMode === 'search' ? 'Word' : currentMode;
        toggleLlmModeBtn.title = `Full LLM Mode: ON (${modeName}) - click to switch default back to Simple MT`;
      } else {
        llmModeDot.className = 'persistent-dot';
        llmModeBtnText.textContent = 'OFF';
        toggleLlmModeBtn.className = 'persistent-toggle-btn llm-toggle-btn';
        toggleLlmModeBtn.title = 'Full LLM Mode: OFF (Simple MT active) - click to turn ON Full LLM Mode';
      }
    }
  }

  updateLlmModeUI();

  if (toggleQuickLlmBtn) {
    toggleQuickLlmBtn.addEventListener('click', async () => {
      const isCurrentlyQuick = config.defaultMode === 'simple_llm';
      const newMode = isCurrentlyQuick ? 'machine_translation' : 'simple_llm';
      config.defaultMode = newMode;
      await chrome.storage.local.set({ defaultMode: newMode });
      updateLlmModeUI();

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs && tabs[0];
        if (activeTab?.id) {
          chrome.tabs.sendMessage(activeTab.id, {
            action: 'SET_DEFAULT_MODE',
            mode: newMode
          }).catch(() => {});
        }
      });

      selectedSearchMode = newMode;
      searchModePills.forEach(p => p.classList.toggle('active', p.dataset.mode === newMode));
      if (newMode === 'machine_translation') {
        quickSearchInput.placeholder = 'Type text to translate offline (NLLB)...';
      } else {
        quickSearchInput.placeholder = 'Type word or text for Ling Flash (Not saved)...';
      }
      syncPopupLanguageRow();
    });
  }

  if (activateQuickLlmBtn) {
    activateQuickLlmBtn.addEventListener('click', async () => {
      if (config.defaultMode !== 'simple_llm') {
        config.defaultMode = 'simple_llm';
        await chrome.storage.local.set({ defaultMode: 'simple_llm' });
        updateLlmModeUI();
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs && tabs[0];
        if (activeTab?.id) {
          chrome.tabs.sendMessage(activeTab.id, {
            action: 'SET_DEFAULT_MODE',
            mode: 'simple_llm'
          }).catch(() => {});

          chrome.runtime.sendMessage({ action: 'SET_TAB_PERSISTENT', tabId: activeTab.id, persistent: true }, (res) => {
            if (res && res.success) {
              activeTabPersistent = true;
              updatePersistentUI();
            }
          });
        }
      });

      const term = (quickSearchInput ? quickSearchInput.value : '').trim();
      sendActivatePersistentWindowToTab(term, 'simple_llm');
    });
  }

  if (toggleLlmModeBtn) {
    toggleLlmModeBtn.addEventListener('click', async () => {
      const isCurrentlyFullLlm = config.defaultMode && config.defaultMode !== 'machine_translation' && config.defaultMode !== 'simple_llm';
      const newMode = isCurrentlyFullLlm ? 'machine_translation' : 'search';
      config.defaultMode = newMode;
      await chrome.storage.local.set({ defaultMode: newMode });
      updateLlmModeUI();

      // Broadcast mode switch to active tab so any currently displayed card switches immediately
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs && tabs[0];
        if (activeTab?.id) {
          chrome.tabs.sendMessage(activeTab.id, {
            action: 'SET_DEFAULT_MODE',
            mode: newMode
          }).catch(() => {});
        }
      });

      // Sync the search mode pills in popup
      selectedSearchMode = newMode;
      searchModePills.forEach(p => p.classList.toggle('active', p.dataset.mode === newMode));
      if (newMode === 'machine_translation') {
        quickSearchInput.placeholder = 'Type text to translate offline (NLLB)...';
      } else {
        quickSearchInput.placeholder = 'Type a word to define & save...';
      }
      syncPopupLanguageRow();
    });
  }

  if (activateLlmBtn) {
    activateLlmBtn.addEventListener('click', async () => {
      // Ensure default mode is set to search if currently MT or simple_llm
      const isFullLlm = config.defaultMode && config.defaultMode !== 'machine_translation' && config.defaultMode !== 'simple_llm';
      if (!isFullLlm) {
        config.defaultMode = 'search';
        await chrome.storage.local.set({ defaultMode: 'search' });
        updateLlmModeUI();
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs && tabs[0];
        if (activeTab?.id) {
          chrome.tabs.sendMessage(activeTab.id, {
            action: 'SET_DEFAULT_MODE',
            mode: 'search'
          }).catch(() => {});

          chrome.runtime.sendMessage({ action: 'SET_TAB_PERSISTENT', tabId: activeTab.id, persistent: true }, (res) => {
            if (res && res.success) {
              activeTabPersistent = true;
              updatePersistentUI();
            }
          });
        }
      });

      const term = (quickSearchInput ? quickSearchInput.value : '').trim();
      const mode = (selectedSearchMode && selectedSearchMode !== 'machine_translation' && selectedSearchMode !== 'simple_llm') ? selectedSearchMode : 'search';
      sendActivatePersistentWindowToTab(term, mode);
    });
  }

  // Apply saved trigger mode
  const currentTrig = config.triggerMode || 'bubble';
  const trigRadio = document.querySelector(`input[name="triggerMode"][value="${currentTrig}"]`);
  if (trigRadio) trigRadio.checked = true;

  // Apply double click checkbox (default true!)
  if (doubleClickCheckbox) {
    doubleClickCheckbox.checked = config.doubleClickLookup !== false;
    doubleClickCheckbox.addEventListener('change', async (e) => {
      config.doubleClickLookup = e.target.checked;
      await chrome.storage.local.set({ doubleClickLookup: e.target.checked });
    });
  }

  // Apply saved modifier
  if (modifierSelect) modifierSelect.value = config.modifierKey || 'none';

  // Check backend & fetch profiles
  await refreshBackendStatus();

  // Profile select event
  profileSelect.addEventListener('change', async (e) => {
    const id = parseInt(e.target.value);
    const selected = profiles.find(p => p.id === id);
    const name = selected ? selected.name : `Profile ${id}`;

    config.activeProfileId = id;
    config.activeProfileName = name;
    await chrome.storage.local.set({ activeProfileId: id, activeProfileName: name });

    activeProfileBadge.textContent = name;
    syncPopupLanguageRow();
    loadRecentWords(id);
  });

  // Trigger mode radio change
  document.querySelectorAll('input[name="triggerMode"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      config.triggerMode = e.target.value;
      await chrome.storage.local.set({ triggerMode: e.target.value });
    });
  });

  // Modifier select change
  if (modifierSelect) {
    modifierSelect.addEventListener('change', async (e) => {
      config.modifierKey = e.target.value;
      await chrome.storage.local.set({ modifierKey: e.target.value });
    });
  }

  // Theme select change
  if (themeSelect) {
    themeSelect.addEventListener('change', async (e) => {
      const t = e.target.value;
      config.theme = t;
      applyTheme(t);
      await chrome.storage.local.set({ theme: t });
    });
  }

  // Open App Button
  openAppBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'OPEN_APP' });
  });

  // Open Options Button
  openOptionsBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'OPEN_OPTIONS' });
  });

  // Refresh recent button
  refreshRecentBtn.addEventListener('click', () => {
    loadRecentWords(config.activeProfileId, selectedHistoryMode);
  });

  // Active Site Detection & Quick 1-Click Toggle
  if (chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].url) {
        try {
          const u = new URL(tabs[0].url);
          if (u.protocol.startsWith('http')) {
            currentSiteDomain = u.hostname;
            renderSiteToggleStatus();
          }
        } catch (e) {}
      }
    });
  }

  function renderSiteToggleStatus() {
    if (!siteStatusBar || !currentSiteDomain) return;
    siteStatusBar.style.display = 'flex';
    siteDomainLabel.textContent = currentSiteDomain;

    const blacklist = (config.blacklist || []).map(s => s.trim().toLowerCase());
    const isBlocked = blacklist.some(d => d && currentSiteDomain.toLowerCase().includes(d));

    if (isBlocked) {
      siteStatusDot.className = 'site-status-dot disabled';
      toggleSiteBtn.className = 'site-toggle-btn is-disabled';
      toggleSiteBtn.textContent = 'Disabled (Enable)';
      toggleSiteBtn.title = `AI Dict is disabled on ${currentSiteDomain}. Click to enable.`;
    } else {
      siteStatusDot.className = 'site-status-dot';
      toggleSiteBtn.className = 'site-toggle-btn';
      toggleSiteBtn.textContent = 'Active (Disable)';
      toggleSiteBtn.title = `AI Dict is active on ${currentSiteDomain}. Click to disable on this site.`;
    }
  }

  if (toggleSiteBtn) {
    toggleSiteBtn.addEventListener('click', async () => {
      if (!currentSiteDomain) return;
      const targetDomain = currentSiteDomain.toLowerCase();
      let blacklist = (config.blacklist || []).map(s => s.trim().toLowerCase()).filter(Boolean);
      const isBlocked = blacklist.some(d => d && targetDomain.includes(d));

      if (isBlocked) {
        // Unblock: remove domain from blacklist
        blacklist = blacklist.filter(d => d && !targetDomain.includes(d));
      } else {
        // Block: add domain to blacklist
        blacklist.push(targetDomain);
      }

      config.blacklist = blacklist;
      await chrome.storage.local.set({ blacklist });
      renderSiteToggleStatus();
    });
  }

  // Default Languages list
  const DEFAULT_LANGS = ['🌐 Auto', '🇺🇸 EN', '🇩🇪 DE', '🇻🇳 VI', '🇫🇷 FR', '🇪🇸 ES', '🇯🇵 JA', '🇨🇳 ZH', '🇰🇷 KO'];

  function populatePopupLangSelects(currentSrc, currentTgt) {
    let srcLangs = [...DEFAULT_LANGS];
    if (currentSrc && !srcLangs.includes(currentSrc)) {
      srcLangs.push(currentSrc);
    }
    let tgtLangs = DEFAULT_LANGS.filter(l => !l.includes('Auto'));
    if (currentTgt && !tgtLangs.includes(currentTgt)) {
      tgtLangs.push(currentTgt);
    }

    if (popupSrcLangSelect) {
      popupSrcLangSelect.innerHTML = srcLangs.map(l => `<option value="${l}" ${l === currentSrc ? 'selected' : ''}>${l}</option>`).join('');
    }
    if (popupTgtLangSelect) {
      popupTgtLangSelect.innerHTML = tgtLangs.map(l => `<option value="${l}" ${l === currentTgt ? 'selected' : ''}>${l}</option>`).join('');
    }
  }

  function syncPopupLanguageRow() {
    if (!popupLangRow) return;
    const pid = config.activeProfileId || 1;
    const appSettings = config.appSettings || {};

    if (selectedSearchMode === 'correction') {
      popupLangRow.style.display = 'flex';
      if (popupModetypeBtn) {
        popupModetypeBtn.style.display = 'inline-flex';
        const modeType = appSettings[`correctionModeType_${pid}`] || 'both';
        const isBoth = modeType === 'both';
        if (popupModetypeLabel) {
          popupModetypeLabel.textContent = isBoth ? '✍️ Correct + Translate' : '✍️ Correct Only';
        }
        popupModetypeBtn.style.background = isBoth ? 'rgba(59, 130, 246, 0.15)' : 'rgba(34, 197, 94, 0.15)';
        popupModetypeBtn.style.borderColor = isBoth ? 'rgba(59, 130, 246, 0.4)' : 'rgba(34, 197, 94, 0.4)';
        popupModetypeBtn.style.color = isBoth ? '#3b82f6' : '#22c55e';
        if (popupTgtLangSelect) popupTgtLangSelect.style.display = isBoth ? 'inline-block' : 'none';
        if (popupSwapLangBtn) popupSwapLangBtn.style.display = isBoth ? 'inline-block' : 'none';
      }
      populatePopupLangSelects(
        appSettings[`correctionSourceLang_${pid}`] || '🌐 Auto',
        appSettings[`correctionTargetLang_${pid}`] || '🇺🇸 EN'
      );
    } else if (['explain', 'translation', 'compare', 'search', 'simple_llm'].includes(selectedSearchMode)) {
      popupLangRow.style.display = 'flex';
      if (popupModetypeBtn) popupModetypeBtn.style.display = 'none';
      if (popupTgtLangSelect) popupTgtLangSelect.style.display = 'inline-block';
      if (popupSwapLangBtn) popupSwapLangBtn.style.display = 'inline-block';

      const defaultTgt = appSettings[`searchTargetLang_${pid}`] || appSettings['SEARCH_TARGET_LANG'] || '🇺🇸 EN';
      const defaultSrc = '🌐 Auto';

      let srcVal = appSettings[`${selectedSearchMode}SourceLang_${pid}`];
      let tgtVal = appSettings[`${selectedSearchMode}TargetLang_${pid}`];

      if (selectedSearchMode === 'search') {
        srcVal = srcVal || appSettings['SEARCH_SOURCE_LANG'] || defaultSrc;
        tgtVal = tgtVal || appSettings['SEARCH_TARGET_LANG'] || defaultTgt;
      } else {
        srcVal = srcVal || defaultSrc;
        tgtVal = tgtVal || defaultTgt;
      }

      populatePopupLangSelects(srcVal, tgtVal);
    } else {
      popupLangRow.style.display = 'none';
    }

    if (popupSimpleLlmPromptRow) {
      popupSimpleLlmPromptRow.style.display = (selectedSearchMode === 'simple_llm') ? 'flex' : 'none';
    }
  }

  if (popupModetypeBtn) {
    popupModetypeBtn.addEventListener('click', async () => {
      const pid = config.activeProfileId || 1;
      const appSettings = config.appSettings || {};
      const curType = appSettings[`correctionModeType_${pid}`] || 'both';
      const newType = curType === 'both' ? 'correction_only' : 'both';
      appSettings[`correctionModeType_${pid}`] = newType;
      config.appSettings = appSettings;
      await chrome.storage.local.set({ appSettings });
      callBackend('/api/settings', 'POST', { key: `correctionModeType_${pid}`, value: newType }).catch(() => {});
      syncPopupLanguageRow();
    });
  }

  if (popupSrcLangSelect) {
    popupSrcLangSelect.addEventListener('change', async (e) => {
      const pid = config.activeProfileId || 1;
      const appSettings = config.appSettings || {};
      const key = `${selectedSearchMode}SourceLang_${pid}`;
      appSettings[key] = e.target.value;
      if (selectedSearchMode === 'search') {
        appSettings['SEARCH_SOURCE_LANG'] = e.target.value;
      }
      config.appSettings = appSettings;
      await chrome.storage.local.set({ appSettings });
      callBackend('/api/settings', 'POST', { key, value: e.target.value }).catch(() => {});
      if (selectedSearchMode === 'search') {
        callBackend('/api/settings', 'POST', { key: 'SEARCH_SOURCE_LANG', value: e.target.value }).catch(() => {});
      }
    });
  }

  if (popupTgtLangSelect) {
    popupTgtLangSelect.addEventListener('change', async (e) => {
      const pid = config.activeProfileId || 1;
      const appSettings = config.appSettings || {};
      const key = `${selectedSearchMode}TargetLang_${pid}`;
      appSettings[key] = e.target.value;
      if (selectedSearchMode === 'search') {
        appSettings['SEARCH_TARGET_LANG'] = e.target.value;
      }
      config.appSettings = appSettings;
      await chrome.storage.local.set({ appSettings });
      callBackend('/api/settings', 'POST', { key, value: e.target.value }).catch(() => {});
      if (selectedSearchMode === 'search') {
        callBackend('/api/settings', 'POST', { key: 'SEARCH_TARGET_LANG', value: e.target.value }).catch(() => {});
      }
    });
  }

  if (popupSwapLangBtn) {
    popupSwapLangBtn.addEventListener('click', async () => {
      const pid = config.activeProfileId || 1;
      const appSettings = config.appSettings || {};
      const srcKey = `${selectedSearchMode}SourceLang_${pid}`;
      const tgtKey = `${selectedSearchMode}TargetLang_${pid}`;
      const defaultTgt = appSettings[`searchTargetLang_${pid}`] || appSettings['SEARCH_TARGET_LANG'] || '🇺🇸 EN';
      const oldSrc = appSettings[srcKey] || (selectedSearchMode === 'search' ? (appSettings['SEARCH_SOURCE_LANG'] || '🌐 Auto') : '🌐 Auto');
      const oldTgt = appSettings[tgtKey] || (selectedSearchMode === 'search' ? defaultTgt : defaultTgt);
      if (oldSrc.includes('Auto')) return;
      appSettings[srcKey] = oldTgt;
      appSettings[tgtKey] = oldSrc;
      if (selectedSearchMode === 'search') {
        appSettings['SEARCH_SOURCE_LANG'] = oldTgt;
        appSettings['SEARCH_TARGET_LANG'] = oldSrc;
      }
      config.appSettings = appSettings;
      await chrome.storage.local.set({ appSettings });
      callBackend('/api/settings', 'POST', { key: srcKey, value: oldTgt }).catch(() => {});
      callBackend('/api/settings', 'POST', { key: tgtKey, value: oldSrc }).catch(() => {});
      if (selectedSearchMode === 'search') {
        callBackend('/api/settings', 'POST', { key: 'SEARCH_SOURCE_LANG', value: oldTgt }).catch(() => {});
        callBackend('/api/settings', 'POST', { key: 'SEARCH_TARGET_LANG', value: oldSrc }).catch(() => {});
      }
      syncPopupLanguageRow();
    });
  }

  // Search Mode Selection
  selectedSearchMode = config.defaultMode || 'machine_translation';
  const searchModePills = document.querySelectorAll('#search-mode-pills .search-mode-pill');
  searchModePills.forEach(p => p.classList.toggle('active', p.dataset.mode === selectedSearchMode));
  if (selectedSearchMode === 'machine_translation') {
    quickSearchInput.placeholder = 'Type text to translate offline (NLLB)...';
  }
  syncPopupLanguageRow();
  searchModePills.forEach(pill => {
    pill.addEventListener('click', () => {
      const mode = pill.dataset.mode;
      selectedSearchMode = mode;
      searchModePills.forEach(p => p.classList.toggle('active', p.dataset.mode === mode));
      if (mode === 'search') {
        quickSearchInput.placeholder = 'Type a word to define & save...';
      } else if (mode === 'explain') {
        quickSearchInput.placeholder = 'Type a phrase or sentence to explain...';
      } else if (mode === 'translation') {
        quickSearchInput.placeholder = 'Type text to translate...';
      } else if (mode === 'correction') {
        quickSearchInput.placeholder = 'Type text to correct / translate...';
      } else if (mode === 'machine_translation') {
        quickSearchInput.placeholder = 'Type text to translate offline (NLLB)...';
      } else if (mode === 'simple_llm') {
        quickSearchInput.placeholder = 'Type word or text for Ling Flash (Not saved)...';
      } else if (mode === 'compare') {
        quickSearchInput.placeholder = 'Type words to compare (e.g. affect, effect)...';
      }
      syncPopupLanguageRow();
      quickSearchInput.focus();
    });
  });

  // Recent History Mode Selection
  selectedHistoryMode = 'machine_translation';
  const historyModePills = document.querySelectorAll('#recent-history-mode-pills .search-mode-pill');
  historyModePills.forEach(pill => {
    pill.addEventListener('click', () => {
      const mode = pill.dataset.mode;
      selectedHistoryMode = mode;
      historyModePills.forEach(p => p.classList.toggle('active', p.dataset.mode === mode));
      loadRecentWords(config.activeProfileId, selectedHistoryMode);
    });
  });

  // Quick Search Form - Opens full floating card window on active web page
  quickSearchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const term = quickSearchInput.value.trim();
    if (!term) return;

    openWordOnActivePage(term, null, selectedSearchMode);
  });

  async function performPopupSearch(term, mode = 'search', customPromptKey = null) {
    quickResultBox.style.display = 'block';
    resultTerm.textContent = term;
    resultLang.textContent = 'Searching...';
    if (popupResultPromptBar) popupResultPromptBar.style.display = 'none';
    resultContent.innerHTML = mode === 'simple_llm'
      ? `<div style="opacity:0.6; padding:8px 0;">Looking up with Quick LLM (ephemeral, no-save)...</div>`
      : mode === 'machine_translation'
      ? `<div style="opacity:0.6; padding:8px 0;">Translating offline with Meta NLLB-200...</div>`
      : `<div style="opacity:0.6; padding:8px 0;">Looking up in AI Dict (${mode}) and saving to profile...</div>`;
    currentPopupResult = null;
    if (popupMoveBtn) popupMoveBtn.style.display = 'none';
    if (popupMoveMenu) popupMoveMenu.style.display = 'none';
    if (popupOpenPageBtn) popupOpenPageBtn.style.display = 'none';
    if (popupDeleteBtn) popupDeleteBtn.style.display = 'none';
    if (popupSimpleLlmSaveBtn) popupSimpleLlmSaveBtn.style.display = 'none';

    try {
      const pid = config.activeProfileId || 1;
      const appSettings = config.appSettings || {};
      let endpoint = '/api/search';
      let requestBody = {};
      const getLang = (modeName, type) => {
        return appSettings[`${modeName}${type}_${pid}`] ||
               appSettings[`search${type}_${pid}`] ||
               appSettings[`SEARCH_${type === 'SourceLang' ? 'SOURCE' : 'TARGET'}_LANG`] ||
               '';
      };

      if (mode === 'search') {
        endpoint = '/api/search';
        requestBody = {
          term: term,
          profile_id: pid,
          session_id: config.activeSessionId || undefined,
          source_language: getLang('search', 'SourceLang') || undefined,
          target_language: getLang('search', 'TargetLang') || undefined
        };
      } else if (mode === 'explain') {
        endpoint = '/api/explains/search';
        requestBody = {
          text: term,
          profile_id: pid,
          session_id: config.activeSessionId || undefined,
          source_language: getLang('explain', 'SourceLang') || undefined,
          target_language: getLang('explain', 'TargetLang') || undefined
        };
      } else if (mode === 'translation') {
        endpoint = '/api/translations/search';
        requestBody = {
          text: term,
          source_lang: getLang('translation', 'SourceLang') || '🌐 Auto',
          target_lang: getLang('translation', 'TargetLang') || '🇺🇸 EN',
          profile_id: pid,
          session_id: config.activeSessionId || undefined
        };
      } else if (mode === 'compare') {
        endpoint = '/api/comparisons/search';
        requestBody = {
          terms: term,
          profile_id: pid,
          session_id: config.activeSessionId || undefined,
          source_language: getLang('compare', 'SourceLang') || undefined,
          target_language: getLang('compare', 'TargetLang') || undefined
        };
      } else if (mode === 'correction') {
        endpoint = '/api/corrections/search';
        const modeType = appSettings[`correctionModeType_${pid}`] || 'both';
        requestBody = {
          text: term,
          source_lang: getLang('correction', 'SourceLang') || '🌐 Auto',
          target_lang: getLang('correction', 'TargetLang') || '🇺🇸 EN',
          mode_type: modeType,
          profile_id: pid,
          session_id: config.activeSessionId || undefined
        };
      } else if (mode === 'simple_llm') {
        endpoint = '/api/simple-llm/lookup';
        const chosenPrompt = customPromptKey || (popupSimpleLlmPromptSelect ? popupSimpleLlmPromptSelect.value : (config.simpleLlmDefaultPrompt || 'quick_glance'));
        requestBody = {
          text: term,
          source_lang: getLang('simple_llm', 'SourceLang') || getLang('search', 'SourceLang') || undefined,
          target_lang: getLang('simple_llm', 'TargetLang') || getLang('search', 'TargetLang') || undefined,
          model: config.simpleLlmModel || 'inclusionai/ling-3.0-flash',
          prompt_key: chosenPrompt,
          profile_id: pid
        };
      } else if (mode === 'machine_translation') {
        endpoint = '/api/mt/translate';
        requestBody = {
          text: term,
          source_lang: getLang('correction', 'SourceLang') || '🌐 Auto',
          target_lang: getLang('correction', 'TargetLang') || '🇺🇸 EN',
          level: 'standard',
          profile_id: pid,
          save_history: false // Guarantee zero memory for default MT lookups
        };
      }

      const res = await callBackend(endpoint, 'POST', requestBody);
      const chats = Array.isArray(res.chats) ? res.chats : [];
      const assistantChat = chats.find(c => c.role === 'assistant') || chats[0];
      let exp = '';
      let item = null;

      if (mode === 'search') {
        item = res.word || res;
        exp = assistantChat ? assistantChat.content : (item.explanation || '');
      } else if (mode === 'explain') {
        item = res.explain || res;
        exp = assistantChat ? assistantChat.content : (item.response || item.explanation || '');
      } else if (mode === 'translation') {
        item = res.translation || res;
        exp = assistantChat ? assistantChat.content : (item.explanation || '');
      } else if (mode === 'compare') {
        item = res.comparison || res;
        exp = assistantChat ? assistantChat.content : (item.explanation || '');
      } else if (mode === 'correction') {
        item = res.correction || res;
        exp = assistantChat ? assistantChat.content : (item.explanation || '');
      } else if (mode === 'simple_llm') {
        item = { id: null, text: term, language: res.language || '' };
        exp = res.content || (assistantChat ? assistantChat.content : '');
      } else if (mode === 'machine_translation') {
        item = { id: null, text: term, source_lang: res.source_lang, target_lang: res.target_lang };
        exp = res.translated_text || '';
      }

      resultTerm.textContent = item?.term || item?.terms || item?.text || term;
      resultLang.textContent = mode === 'search' ? (item?.language || 'Saved') : mode === 'explain' ? 'Explain' : mode === 'translation' ? 'Translate' : mode === 'correction' ? (item?.mode_type === 'correction_only' ? 'Correct Only' : 'Correct + Translate') : mode === 'machine_translation' ? `⚡ MT (${res.source_lang || 'Auto'} → ${res.target_lang || 'EN'})` : mode === 'simple_llm' ? `⚡ Ling Flash (Not saved)` : 'Compare';

      if (popupResultPromptBar) {
        if (mode === 'simple_llm') {
          popupResultPromptBar.style.display = 'flex';
          const activePrompt = requestBody.prompt_key || config.simpleLlmDefaultPrompt || 'quick_glance';
          if (popupResultPromptSelect) {
            popupResultPromptSelect.value = activePrompt;
          }
        } else {
          popupResultPromptBar.style.display = 'none';
        }
      }

      if (mode === 'machine_translation') {
        resultContent.innerHTML = `
          <textarea id="popup-mt-edit-textarea" style="width:100%; min-height:80px; box-sizing:border-box; background:rgba(0,0,0,0.15); border:1px solid rgba(125,125,125,0.25); border-radius:8px; padding:8px 10px; font-size:13px; font-family:inherit; color:inherit; resize:vertical; outline:none;" spellcheck="false" placeholder="Translation...">${escapeHtml(exp)}</textarea>
        `;
        const popupMtTextarea = document.getElementById('popup-mt-edit-textarea');
        if (popupMtTextarea) {
          popupMtTextarea.addEventListener('input', () => {
            exp = popupMtTextarea.value;
          });
        }
      } else {
        resultContent.innerHTML = formatSummaryHtml(exp);
      }

      const mtFooter = document.getElementById('popup-mt-footer');
      if (mtFooter) {
        mtFooter.style.display = (mode === 'machine_translation') ? 'block' : 'none';
      }

      if (popupSimpleLlmSaveBtn) {
        if (mode === 'simple_llm') {
          popupSimpleLlmSaveBtn.style.display = 'inline-flex';
          popupSimpleLlmSaveBtn.disabled = false;
          popupSimpleLlmSaveBtn.innerHTML = '<span>💾 Save</span>';
          popupSimpleLlmSaveBtn.onclick = async () => {
            popupSimpleLlmSaveBtn.disabled = true;
            popupSimpleLlmSaveBtn.innerHTML = '<span>Saving...</span>';
            try {
              const saveRes = await callBackend('/api/simple-llm/save', 'POST', {
                text: currentPopupResult?.term || term,
                content: exp,
                source_lang: currentPopupResult?.language || undefined,
                profile_id: pid,
                session_id: config.activeSessionId || undefined
              });
              popupSimpleLlmSaveBtn.innerHTML = '<span>✓ Saved</span>';
              resultLang.textContent = '✓ Saved to Profile';
              if (saveRes.id) {
                currentPopupResult.id = saveRes.id;
              }
              if (popupDeleteBtn) popupDeleteBtn.style.display = 'inline-flex';
              loadRecentWords(config.activeProfileId, selectedHistoryMode);
            } catch (err) {
              popupSimpleLlmSaveBtn.disabled = false;
              popupSimpleLlmSaveBtn.innerHTML = '<span>Retry Save</span>';
              alert(`Failed to save: ${err.message}`);
            }
          };
        } else {
          popupSimpleLlmSaveBtn.style.display = 'none';
        }
      }

      currentPopupResult = {
        mode: mode,
        id: item?.id,
        term: item?.term || item?.terms || item?.text || term,
        language: item?.language || ''
      };
      updatePopupMoveMenu();
      loadRecentWords(config.activeProfileId, selectedHistoryMode);
    } catch (err) {
      resultLang.textContent = 'Error';
      resultContent.innerHTML = `<span style="color:#ef4444;">${err.message}</span>`;
      if (popupMoveBtn) popupMoveBtn.style.display = 'none';
      if (popupOpenPageBtn) popupOpenPageBtn.style.display = 'none';
      if (popupDeleteBtn) popupDeleteBtn.style.display = 'none';
      if (popupSimpleLlmSaveBtn) popupSimpleLlmSaveBtn.style.display = 'none';
      if (popupResultPromptBar) popupResultPromptBar.style.display = 'none';
      const mtFooter = document.getElementById('popup-mt-footer');
      if (mtFooter) mtFooter.style.display = 'none';
    }
  }
  window.__performPopupSearch = performPopupSearch;
  window.__getCurrentPopupResult = () => currentPopupResult;

  // Popup Move Mode UI
  function updatePopupMoveMenu() {
    if (!currentPopupResult) return;
    if (popupOpenPageBtn) popupOpenPageBtn.style.display = 'inline-flex';
    if (popupDeleteBtn) popupDeleteBtn.style.display = currentPopupResult?.id ? 'inline-flex' : 'none';
    if (!popupMoveBtn || !popupMoveMenu) return;
    popupMoveBtn.style.display = 'inline-flex';

    const cur = currentPopupResult.mode;
    popupMoveMenu.innerHTML = `
      ${cur !== 'search' ? `<button type="button" class="popup-move-opt" data-to="search">🔍 Move to Word & Regenerate</button>` : ''}
      ${cur !== 'explain' ? `<button type="button" class="popup-move-opt" data-to="explain">📖 Move to Explain & Regenerate</button>` : ''}
      ${cur !== 'translation' ? `<button type="button" class="popup-move-opt" data-to="translation">🌐 Move to Translate & Regenerate</button>` : ''}
      ${cur !== 'compare' ? `<button type="button" class="popup-move-opt" data-to="compare">⚖️ Move to Compare & Regenerate</button>` : ''}
      ${cur !== 'correction' ? `<button type="button" class="popup-move-opt" data-to="correction">✍️ Move to Correct & Regenerate</button>` : ''}
    `;

    popupMoveMenu.querySelectorAll('.popup-move-opt').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        popupMoveMenu.style.display = 'none';
        const targetMode = opt.dataset.to;
        handlePopupMoveMode(targetMode);
      });
    });
  }

  if (popupOpenPageBtn) {
    popupOpenPageBtn.addEventListener('click', () => {
      if (currentPopupResult && currentPopupResult.term) {
        openWordOnActivePage(currentPopupResult.term, currentPopupResult.id, currentPopupResult.mode);
      }
    });
  }

  if (popupDeleteBtn) {
    popupDeleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!currentPopupResult || !currentPopupResult.id) return;
      if (!confirm(`Delete "${currentPopupResult.term}" from history?`)) return;

      popupDeleteBtn.disabled = true;
      popupDeleteBtn.style.opacity = '0.5';

      try {
        let endpoint = `/api/words/${currentPopupResult.id}`;
        if (currentPopupResult.mode === 'explain') endpoint = `/api/explains/${currentPopupResult.id}`;
        else if (currentPopupResult.mode === 'translation') endpoint = `/api/translations/${currentPopupResult.id}`;
        else if (currentPopupResult.mode === 'compare') endpoint = `/api/comparisons/${currentPopupResult.id}`;
        else if (currentPopupResult.mode === 'correction') endpoint = `/api/corrections/${currentPopupResult.id}`;

        await callBackend(endpoint, 'DELETE');
        currentPopupResult = null;
        if (quickResultBox) quickResultBox.style.display = 'none';
        loadRecentWords(config.activeProfileId, selectedHistoryMode);
      } catch (err) {
        alert('Failed to delete: ' + err.message);
        popupDeleteBtn.disabled = false;
        popupDeleteBtn.style.opacity = '1';
      }
    });
  }

  if (popupMoveBtn && popupMoveMenu) {
    popupMoveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = popupMoveMenu.style.display === 'flex';
      popupMoveMenu.style.display = isOpen ? 'none' : 'flex';
    });

    document.addEventListener('click', () => {
      if (popupMoveMenu) popupMoveMenu.style.display = 'none';
    });
  }

  const popupQuickLlmBtn = document.getElementById('popup-quick-llm-btn');
  if (popupQuickLlmBtn) {
    popupQuickLlmBtn.addEventListener('click', () => {
      selectedSearchMode = 'simple_llm';
      searchModePills.forEach(p => p.classList.toggle('active', p.dataset.mode === 'simple_llm'));
      syncPopupLanguageRow();
      const term = (quickSearchInput ? quickSearchInput.value : '').trim() || currentPopupResult?.term;
      if (term) {
        quickSearchInput.value = term;
        performPopupSearch(term, 'simple_llm');
      }
    });
  }

  if (popupSimpleLlmPromptSelect) {
    popupSimpleLlmPromptSelect.addEventListener('change', () => {
      const chosen = popupSimpleLlmPromptSelect.value;
      config.simpleLlmActivePrompt = chosen;
      chrome.storage.local.set({ simpleLlmActivePrompt: chosen });
      if (popupResultPromptSelect) popupResultPromptSelect.value = chosen;
    });
  }

  if (popupSimpleLlmSetDefaultBtn && popupSimpleLlmPromptSelect) {
    popupSimpleLlmSetDefaultBtn.addEventListener('click', async () => {
      const chosen = popupSimpleLlmPromptSelect.value;
      config.simpleLlmDefaultPrompt = chosen;
      config.simpleLlmActivePrompt = chosen;
      await chrome.storage.local.set({ simpleLlmDefaultPrompt: chosen, simpleLlmActivePrompt: chosen });
      popupSimpleLlmSetDefaultBtn.textContent = '★ Saved!';
      setTimeout(() => {
        popupSimpleLlmSetDefaultBtn.textContent = '★ Default';
      }, 1500);
    });
  }

  if (popupResultRerunBtn && popupResultPromptSelect) {
    popupResultRerunBtn.addEventListener('click', () => {
      const term = currentPopupResult?.term || (quickSearchInput ? quickSearchInput.value : '').trim();
      const chosenPrompt = popupResultPromptSelect.value;
      config.simpleLlmActivePrompt = chosenPrompt;
      chrome.storage.local.set({ simpleLlmActivePrompt: chosenPrompt });
      if (popupSimpleLlmPromptSelect) popupSimpleLlmPromptSelect.value = chosenPrompt;
      if (term) {
        performPopupSearch(term, 'simple_llm', chosenPrompt);
      }
    });
  }

  if (popupResultPromptSelect) {
    popupResultPromptSelect.addEventListener('change', () => {
      const term = currentPopupResult?.term || (quickSearchInput ? quickSearchInput.value : '').trim();
      const chosenPrompt = popupResultPromptSelect.value;
      config.simpleLlmActivePrompt = chosenPrompt;
      chrome.storage.local.set({ simpleLlmActivePrompt: chosenPrompt });
      if (popupSimpleLlmPromptSelect) popupSimpleLlmPromptSelect.value = chosenPrompt;
      if (term) {
        performPopupSearch(term, 'simple_llm', chosenPrompt);
      }
    });
  }

  const popupReturnLlmBtn = document.getElementById('popup-return-llm-btn');
  if (popupReturnLlmBtn) {
    popupReturnLlmBtn.addEventListener('click', () => {
      selectedSearchMode = 'search';
      searchModePills.forEach(p => p.classList.toggle('active', p.dataset.mode === 'search'));
      syncPopupLanguageRow();
      const term = (quickSearchInput ? quickSearchInput.value : '').trim() || currentPopupResult?.term;
      if (term) {
        quickSearchInput.value = term;
        performPopupSearch(term, 'search');
      }
    });
  }

  const popupMtRegenerateBtn = document.getElementById('popup-mt-regenerate-btn');
  if (popupMtRegenerateBtn) {
    popupMtRegenerateBtn.addEventListener('click', () => {
      const term = (quickSearchInput ? quickSearchInput.value : '').trim() || currentPopupResult?.term;
      if (term) {
        performPopupSearch(term, 'machine_translation');
      }
    });
  }

  async function handlePopupMoveMode(toMode) {
    if (!currentPopupResult) return;
    const targetLabel = toMode === 'search' ? 'Word' : toMode === 'explain' ? 'Explain' : toMode === 'translation' ? 'Translate' : toMode === 'correction' ? 'Correct' : 'Compare';
    resultLang.textContent = 'Regenerating...';
    resultContent.innerHTML = `<div style="opacity:0.7; padding:8px 0;">Moving to ${targetLabel} mode & regenerating...</div>`;

    try {
      const pid = config.activeProfileId || 1;
      const appSettings = config.appSettings || {};
      const srcLang = appSettings[`${toMode}SourceLang_${pid}`] || appSettings[`searchSourceLang_${pid}`] || undefined;
      const tgtLang = appSettings[`${toMode}TargetLang_${pid}`] || appSettings[`searchTargetLang_${pid}`] || undefined;

      const res = await callBackend('/api/modes/move', 'POST', {
        from_mode: currentPopupResult.mode,
        to_mode: toMode,
        item_id: currentPopupResult.id,
        term: currentPopupResult.term,
        profile_id: pid,
        source_lang: srcLang,
        target_lang: tgtLang
      });

      const chats = Array.isArray(res.chats) ? res.chats : [];
      const assistantChat = chats.find(c => c.role === 'assistant') || chats[0];
      let exp = '';
      let newItem = null;

      if (toMode === 'search') {
        newItem = res.word || res;
        exp = assistantChat ? assistantChat.content : (newItem.explanation || '');
      } else if (toMode === 'explain') {
        newItem = res.explain || res;
        exp = assistantChat ? assistantChat.content : (newItem.response || newItem.explanation || '');
      } else if (toMode === 'translation') {
        newItem = res.translation || res;
        exp = assistantChat ? assistantChat.content : (newItem.explanation || '');
      } else if (toMode === 'compare') {
        newItem = res.comparison || res;
        exp = assistantChat ? assistantChat.content : (newItem.explanation || '');
      } else if (toMode === 'correction') {
        newItem = res.correction || res;
        exp = assistantChat ? assistantChat.content : (newItem.explanation || '');
      }

      currentPopupResult = {
        mode: toMode,
        id: newItem?.id,
        term: newItem?.term || newItem?.terms || newItem?.text || currentPopupResult.term,
        language: newItem?.language || ''
      };

      resultTerm.textContent = currentPopupResult.term;
      resultLang.textContent = toMode === 'search' ? (newItem?.language || 'Word') : toMode === 'explain' ? 'Explain' : toMode === 'translation' ? 'Translate' : toMode === 'correction' ? (newItem?.mode_type === 'correction_only' ? 'Correct Only' : 'Correct + Translate') : 'Compare';
      resultContent.innerHTML = formatSummaryHtml(exp);
      updatePopupMoveMenu();
      loadRecentWords(config.activeProfileId);
    } catch (err) {
      resultLang.textContent = 'Error';
      resultContent.innerHTML = `<span style="color:#ef4444;">Failed to move mode: ${err.message}</span>`;
    }
  }

  async function refreshBackendStatus() {
    statusIndicator.className = 'status-indicator';
    statusIndicator.title = 'Connecting to AI Dict...';

    try {
      const data = await callBackend('/api/profiles');
      statusIndicator.className = 'status-indicator online';
      statusIndicator.title = `Connected to AI Dict (${config.serverUrl || 'http://127.0.0.1:4321'})`;

      if (Array.isArray(data) && data.length > 0) {
        profiles = data;
        profileSelect.innerHTML = profiles.map(p => `
          <option value="${p.id}" ${p.id === config.activeProfileId ? 'selected' : ''}>👤 ${escapeHtml(p.name)}</option>
        `).join('');

        const activeP = profiles.find(p => p.id === config.activeProfileId) || profiles[0];
        config.activeProfileId = activeP.id;
        config.activeProfileName = activeP.name;
        activeProfileBadge.textContent = activeP.name;
        await chrome.storage.local.set({ activeProfileId: activeP.id, activeProfileName: activeP.name });

        try {
          const settingsData = await callBackend('/api/settings');
          if (settingsData && settingsData.settings) {
            config.appSettings = settingsData.settings;
            await chrome.storage.local.set({ appSettings: settingsData.settings });
          }
        } catch (e) {}

        try {
          const promptData = await callBackend('/api/simple-llm/prompts');
          if (Array.isArray(promptData) && promptData.length > 0) {
            config.simpleLlmPrompts = promptData;
            await chrome.storage.local.set({ simpleLlmPrompts: promptData });
            populatePopupPromptSelects(promptData);
          }
        } catch (e) {}

        syncPopupLanguageRow();
        loadRecentWords(activeP.id, selectedHistoryMode);
      }
    } catch (err) {
      console.error('refreshBackendStatus error:', err);
      statusIndicator.className = 'status-indicator offline';
      statusIndicator.title = `Offline: Cannot connect to AI Dict at ${config.serverUrl || 'http://127.0.0.1:4321'}. Start with 'ai_dict serve'.`;
      recentWordsList.innerHTML = `<div class="empty-state" style="color:#ef4444;">AI Dict is offline. Start backend with <code>ai_dict serve</code></div>`;
    }
  }

  async function loadRecentWords(profileId, mode = selectedHistoryMode) {
    if (!profileId) return;
    selectedHistoryMode = mode;
    recentWordsList.innerHTML = `<div class="empty-state">Loading history...</div>`;

    // Sync recent history pills
    const pills = document.querySelectorAll('#recent-history-mode-pills .search-mode-pill');
    pills.forEach(p => p.classList.toggle('active', p.dataset.mode === mode));

    let endpoint = `/api/words?profile_id=${profileId}`;
    if (mode === 'explain') endpoint = `/api/explains?profile_id=${profileId}`;
    else if (mode === 'translation') endpoint = `/api/translations?profile_id=${profileId}`;
    else if (mode === 'compare') endpoint = `/api/comparisons?profile_id=${profileId}`;
    else if (mode === 'correction') endpoint = `/api/corrections?profile_id=${profileId}`;
    else if (mode === 'machine_translation') endpoint = `/api/mt/records?profile_id=${profileId}`;

    try {
      let items = await callBackend(endpoint);
      if (!Array.isArray(items) || items.length === 0) {
        const modeLabel = mode === 'search' ? 'words' : mode === 'explain' ? 'explanations' : mode === 'translation' ? 'translations' : mode === 'correction' ? 'corrections' : mode === 'machine_translation' ? 'MT translations' : 'comparisons';
        recentWordsList.innerHTML = `<div class="empty-state">No saved ${modeLabel} in this profile yet.</div>`;
        return;
      }

      const COLORS = {
        red: '#ef4444',
        orange: '#f97316',
        yellow: '#eab308',
        green: '#22c55e'
      };

      const topItems = items.slice(0, 8);
      recentWordsList.innerHTML = topItems.map(w => {
        const term = w.term || w.terms || w.text || '';
        let meta = '';
        if (mode === 'search') meta = w.language || '';
        else if (mode === 'translation') meta = `${w.source_lang || 'Auto'} → ${w.target_lang || 'EN'}`;
        else if (mode === 'correction') meta = w.mode_type === 'correction_only' ? 'Correct Only' : `${w.source_lang || 'Auto'} → ${w.target_lang || 'EN'}`;
        else if (mode === 'machine_translation') meta = `⚡ ${w.source_lang || 'Auto'} → ${w.target_lang || 'EN'}`;
        else if (mode === 'explain') meta = 'Explain';
        else if (mode === 'compare') meta = 'Compare';

        return `
          <div class="recent-item" data-id="${w.id}" data-term="${escapeHtml(term)}" data-mode="${mode}">
            <span class="recent-term" title="${escapeHtml(term)}">${escapeHtml(term)}</span>
            <div class="recent-meta">
              ${w.color ? `<span class="recent-dot" style="background-color:${COLORS[w.color] || 'transparent'};"></span>` : ''}
              <span>${escapeHtml(meta)}</span>
              <span style="opacity:0.5;">(${w.search_count || w.view_count || 1}x)</span>
              <button type="button" class="recent-delete-btn" data-id="${w.id}" data-term="${escapeHtml(term)}" data-mode="${mode}" title="Delete from history">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>
        `;
      }).join('');

      recentWordsList.querySelectorAll('.recent-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.closest('.recent-delete-btn')) return;
          openWordOnActivePage(item.dataset.term, item.dataset.id, item.dataset.mode || mode);
        });
      });

      recentWordsList.querySelectorAll('.recent-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const delId = btn.dataset.id;
          const delTerm = btn.dataset.term;
          const delMode = btn.dataset.mode || mode;
          if (!delId) return;
          if (!confirm(`Delete "${delTerm}" from history?`)) return;

          btn.disabled = true;
          btn.style.opacity = '0.3';
          try {
            let endpoint = `/api/words/${delId}`;
            if (delMode === 'explain') endpoint = `/api/explains/${delId}`;
            else if (delMode === 'translation') endpoint = `/api/translations/${delId}`;
            else if (delMode === 'compare') endpoint = `/api/comparisons/${delId}`;
            else if (delMode === 'correction') endpoint = `/api/corrections/${delId}`;

            await callBackend(endpoint, 'DELETE');
            const row = btn.closest('.recent-item');
            if (row) {
              row.style.transition = 'all 0.2s ease';
              row.style.opacity = '0';
              row.style.transform = 'translateX(20px)';
              setTimeout(() => {
                row.remove();
                if (recentWordsList.querySelectorAll('.recent-item').length === 0) {
                  loadRecentWords(profileId, mode);
                }
              }, 200);
            }
          } catch (err) {
            alert('Failed to delete: ' + err.message);
            btn.disabled = false;
            btn.style.opacity = '1';
          }
        });
      });
    } catch (e) {
      recentWordsList.innerHTML = `<div class="empty-state" style="color:#ef4444;">Could not load recent history.</div>`;
    }
  }

  function openWordOnActivePage(term, wordId, mode = 'search') {
    if (!term) return;

    const fallbackToPopup = () => {
      performPopupSearch(term, mode);
    };

    if (!chrome.tabs || !chrome.tabs.query) {
      fallbackToPopup();
      return;
    }

    const sendToTab = (targetTab) => {
      chrome.tabs.sendMessage(targetTab.id, {
        action: 'OPEN_SAVED_WORD',
        term: term,
        wordId: wordId,
        mode: mode
      }, (response) => {
        if (chrome.runtime.lastError) {
          // If content script is not loaded yet, inject it and retry
          if (chrome.scripting && chrome.scripting.executeScript) {
            chrome.scripting.executeScript({
              target: { tabId: targetTab.id },
              files: ['content.js']
            }, () => {
              if (chrome.runtime.lastError) {
                fallbackToPopup();
              } else {
                setTimeout(() => {
                  chrome.tabs.sendMessage(targetTab.id, {
                    action: 'OPEN_SAVED_WORD',
                    term: term,
                    wordId: wordId,
                    mode: mode
                  }, () => {
                    window.close();
                  });
                }, 120);
              }
            });
          } else {
            fallbackToPopup();
          }
        } else {
          // Opened successfully on active tab, close the toolbar popup
          window.close();
        }
      });
    };

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs && tabs[0];
      const isRestricted = !activeTab || !activeTab.id || !activeTab.url ||
          activeTab.url.startsWith('chrome://') ||
          activeTab.url.startsWith('edge://') ||
          activeTab.url.startsWith('about:') ||
          activeTab.url.startsWith('chrome-extension://');

      if (isRestricted) {
        // Look for any regular web page in this window (e.g. if popup was opened in a tab for testing)
        chrome.tabs.query({ currentWindow: true }, (allTabs) => {
          const webTab = (allTabs || []).find(t => t.url && (t.url.startsWith('http://') || t.url.startsWith('https://') || t.url.startsWith('file://')));
          if (webTab) {
            sendToTab(webTab);
          } else {
            fallbackToPopup();
          }
        });
        return;
      }

      sendToTab(activeTab);
    });
  }

  function sendActivatePersistentWindowToTab(term = '', mode = 'search') {
    if (!chrome.tabs || !chrome.tabs.query) return;

    const doSend = (targetTab) => {
      chrome.runtime.sendMessage({ action: 'SET_TAB_PERSISTENT', tabId: targetTab.id, persistent: true });
      chrome.tabs.sendMessage(targetTab.id, {
        action: 'ACTIVATE_PERSISTENT_WINDOW',
        term: term,
        mode: mode
      }, (response) => {
        if (chrome.runtime.lastError) {
          if (chrome.scripting && chrome.scripting.executeScript) {
            chrome.scripting.executeScript({
              target: { tabId: targetTab.id },
              files: ['content.js']
            }, () => {
              if (!chrome.runtime.lastError) {
                setTimeout(() => {
                  chrome.tabs.sendMessage(targetTab.id, {
                    action: 'ACTIVATE_PERSISTENT_WINDOW',
                    term: term,
                    mode: mode
                  }, () => {
                    window.close();
                  });
                }, 120);
              }
            });
          }
        } else {
          window.close();
        }
      });
    };

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs && tabs[0];
      const isRestricted = !activeTab || !activeTab.id || !activeTab.url ||
          activeTab.url.startsWith('chrome://') ||
          activeTab.url.startsWith('edge://') ||
          activeTab.url.startsWith('about:') ||
          activeTab.url.startsWith('chrome-extension://');

      if (isRestricted) {
        chrome.tabs.query({ currentWindow: true }, (allTabs) => {
          const webTab = (allTabs || []).find(t => t.url && (t.url.startsWith('http://') || t.url.startsWith('https://') || t.url.startsWith('file://')));
          if (webTab) {
            doSend(webTab);
          }
        });
        return;
      }

      doSend(activeTab);
    });
  }

  function applyTheme(theme) {
    popupBody.className = `theme-${theme}`;
  }

  function callBackend(endpoint, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'API_CALL',
        endpoint: endpoint,
        method: method,
        body: body
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || !response.success) {
          reject(new Error(response?.error || 'Network error'));
          return;
        }
        resolve(response.data);
      });
    });
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

  function isTableDelimiter(line) {
    if (!line) return false;
    const trimmed = line.trim();
    if (!trimmed.includes('|')) return false;
    const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
    const cells = inner.split('|');
    if (cells.length === 0) return false;
    return cells.every(c => {
      const t = c.trim();
      return t.length >= 1 && /^:?-+:?$/.test(t);
    });
  }

  function getTableAlignments(delimiterLine) {
    const inner = delimiterLine.trim().replace(/^\|/, '').replace(/\|$/, '');
    return inner.split('|').map(c => {
      const t = c.trim();
      const left = t.startsWith(':');
      const right = t.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      if (left) return 'left';
      return '';
    });
  }

  function parseTableCells(rowLine) {
    const inner = rowLine.trim().replace(/^\|/, '').replace(/\|$/, '');
    return inner.split('|').map(c => c.trim());
  }

  function formatSummaryHtml(md) {
    if (!md) return '';
    const lines = String(md).split('\n');
    let html = '';
    let inList = false;
    let listType = 'ul';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) {
        if (inList) { html += `</${listType}>`; inList = false; }
        continue;
      }

      // Markdown Table
      if (trimmed.includes('|') && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
        if (inList) { html += `</${listType}>`; inList = false; }
        const headerCells = parseTableCells(lines[i]);
        const alignments = getTableAlignments(lines[i + 1]);
        i += 1; // Skip delimiter row

        let tableHtml = '<div class="table-container"><table><thead><tr>';
        for (let col = 0; col < headerCells.length; col++) {
          const align = alignments[col] ? ` style="text-align: ${alignments[col]};"` : '';
          tableHtml += `<th${align}>${formatInlinePopup(headerCells[col])}</th>`;
        }
        tableHtml += '</tr></thead><tbody>';

        while (i + 1 < lines.length && lines[i + 1].trim().includes('|') && !isTableDelimiter(lines[i + 1])) {
          i += 1;
          const rowCells = parseTableCells(lines[i]);
          tableHtml += '<tr>';
          for (let col = 0; col < headerCells.length; col++) {
            const align = alignments[col] ? ` style="text-align: ${alignments[col]};"` : '';
            const val = rowCells[col] !== undefined ? rowCells[col] : '';
            tableHtml += `<td${align}>${formatInlinePopup(val)}</td>`;
          }
          tableHtml += '</tr>';
        }

        tableHtml += '</tbody></table></div>';
        html += tableHtml;
        continue;
      }

      // Headings
      if (trimmed.startsWith('###### ')) {
        if (inList) { html += `</${listType}>`; inList = false; }
        html += `<h6>${formatInlinePopup(trimmed.slice(7))}</h6>`;
      } else if (trimmed.startsWith('##### ')) {
        if (inList) { html += `</${listType}>`; inList = false; }
        html += `<h5>${formatInlinePopup(trimmed.slice(6))}</h5>`;
      } else if (trimmed.startsWith('#### ')) {
        if (inList) { html += `</${listType}>`; inList = false; }
        html += `<h4>${formatInlinePopup(trimmed.slice(5))}</h4>`;
      } else if (trimmed.startsWith('### ')) {
        if (inList) { html += `</${listType}>`; inList = false; }
        html += `<h3>${formatInlinePopup(trimmed.slice(4))}</h3>`;
      } else if (trimmed.startsWith('## ')) {
        if (inList) { html += `</${listType}>`; inList = false; }
        html += `<h2>${formatInlinePopup(trimmed.slice(3))}</h2>`;
      } else if (trimmed.startsWith('# ')) {
        if (inList) { html += `</${listType}>`; inList = false; }
        html += `<h1>${formatInlinePopup(trimmed.slice(2))}</h1>`;
      } else {
        const ulMatch = line.match(/^(\s*)([\*\-]\s+)(.*)$/);
        if (ulMatch) {
          if (!inList || listType !== 'ul') {
            if (inList) html += `</${listType}>`;
            html += '<ul>';
            inList = true;
            listType = 'ul';
          }
          html += `<li>${formatInlinePopup(ulMatch[3])}</li>`;
          continue;
        }
        const olMatch = line.match(/^(\s*)(\d+[\.\)]\s+)(.*)$/);
        if (olMatch) {
          if (!inList || listType !== 'ol') {
            if (inList) html += `</${listType}>`;
            html += '<ol>';
            inList = true;
            listType = 'ol';
          }
          html += `<li>${formatInlinePopup(olMatch[3])}</li>`;
          continue;
        }

        if (inList) { html += `</${listType}>`; inList = false; }
        html += `<p>${formatInlinePopup(trimmed)}</p>`;
      }
    }
    if (inList) html += `</${listType}>`;
    return html;
  }

  function formatInlinePopup(str) {
    let safe = escapeHtml(str);
    safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
    safe = safe.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
    return safe;
  }
});
