// AI Dict - Content Script (Encapsulated in Shadow DOM)

(function () {
  if (window.__AI_DICT_LOADED__ && typeof chrome !== 'undefined' && chrome.runtime?.id) {
    return;
  }
  window.__AI_DICT_LOADED__ = true;

  // Global state
  let config = {
    serverUrl: 'http://127.0.0.1:4321',
    activeProfileId: 1,
    activeProfileName: 'Default',
    activeSessionId: '',
    triggerMode: 'bubble', // 'bubble', 'auto', 'key'
    doubleClickLookup: true, // Default: true - double-click word queries directly without icon
    isPaused: false,
    pauseUntil: 0,
    modifierKey: 'none',   // 'none', 'alt', 'ctrl', 'shift'
    theme: 'tokyonight',
    cardWidth: 560,
    cardHeight: 640,
    simpleMtWidth: 480,
    simpleMtHeight: 380,
    defaultMode: 'machine_translation',
    simpleLlmModel: 'inclusionai/ling-3.0-flash',
    autoDetectSentence: true,
    cardPlacement: 'auto', // 'auto', 'side', 'below', 'above'
    persistentWindow: false, // Default: false - keep floating card open across lookups
    persistentNewTabOnLoading: false, // Default: false - open new tab in persistent window if previous word still loading
    showExternalFallbackOverlay: false,
    blacklist: [],
    externalSites: []
  };

  let activeLookupToken = 0; // Incremented on every new lookup or card close to prevent race conditions
  let cardTabs = []; // Concurrent tabs in persistent window: Array of { id, word, mode, token, isLoading, data, error, currentDetectedLanguage, activeView, externalUrl, externalName, chatMessages }
  let activeCardTabId = null; // Currently active tab id in persistent window

  let profiles = [];
  let shadowRoot = null;
  let containerEl = null;
  let triggerBtn = null;
  let cardEl = null;
  let currentSelectionText = '';
  let lastSelectionRect = null;
  let currentWordData = null;
  let currentMode = 'search';
  let isCardOpen = false;
  let currentDetectedLanguage = '';
  let currentExternalUrl = '';
  let isHistoryOpen = false;
  let activeHistoryMode = 'search';
  let cachedHistoryData = { search: null, explain: null, translation: null, compare: null, correction: null };
  let secondaryCardEl = null;
  let isSecondaryCardOpen = false;
  let secondaryLookupToken = 0;
  let cardMouseUpTimer = null;

  const SIMPLE_LLM_PROMPTS = [
    { id: 'quick_glance', name: '⚡ Quick Glance', desc: 'Definition, IPA & practical example' },
    { id: 'grammar_breakdown', name: '🧩 Grammar & Syntax', desc: 'Part of speech, tense & role' },
    { id: 'nuance_slang', name: '💡 Nuance & Context', desc: 'Colloquial usage & cultural context' },
    { id: 'simplify', name: '👶 Plain & Simple', desc: 'Simple everyday explanation (ELI5)' },
    { id: 'key_points', name: '📋 Key Takeaway', desc: 'Ultra-fast 1-sentence TL;DR' },
    { id: 'examples', name: '🗣️ Dialogues', desc: 'Real-world conversational examples' }
  ];

  function getActiveSimpleLlmPrompts() {
    if (config && Array.isArray(config.simpleLlmPrompts) && config.simpleLlmPrompts.length > 0) {
      return config.simpleLlmPrompts;
    }
    return SIMPLE_LLM_PROMPTS;
  }

  function isExtensionValid() {
    try {
      return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  function safeSendMessage(message, callback) {
    if (!isExtensionValid()) {
      if (callback) callback({ success: false, error: 'Extension context invalidated. Please reload this webpage.' });
      return;
    }
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime?.lastError) {
          if (callback) callback({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        if (callback) callback(response);
      });
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  }

  function safeStorageSet(obj) {
    if (isExtensionValid() && chrome.storage?.local) {
      try {
        return chrome.storage.local.set(obj);
      } catch (e) {}
    }
    return Promise.resolve();
  }

  init();

  async function init() {
    await loadConfig();
    await initTabPersistentState();
    setupHostContainer();
    setupEventListeners();
    fetchProfilesSilently();
    fetchTemplatesSilently();
  }

  async function loadConfig() {
    return new Promise((resolve) => {
      if (!isExtensionValid() || !chrome.storage?.local) {
        resolve();
        return;
      }
      try {
        chrome.storage.local.get(null, (items) => {
          if (chrome.runtime?.lastError) {
            resolve();
            return;
          }
          if (items) {
            const { persistentWindow, ...rest } = items;
            config = { ...config, ...rest };
            if (!items.defaultMode) {
              config.defaultMode = 'machine_translation';
            }
          }
          resolve();
        });
      } catch (e) {
        resolve();
      }
    });
  }

  async function initTabPersistentState() {
    let localVal = false;
    let hasLocalSession = false;
    try {
      const sessionVal = sessionStorage.getItem('ai_dict_tab_persistent');
      if (sessionVal !== null) {
        hasLocalSession = true;
        localVal = (sessionVal === 'true');
      }
    } catch (e) {}

    if (!hasLocalSession && config.defaultPersistentWindow) {
      localVal = true;
    }

    config.persistentWindow = localVal;

    return new Promise((resolve) => {
      safeSendMessage({ action: 'GET_TAB_PERSISTENT' }, (res) => {
        if (res && res.success && typeof res.persistent === 'boolean') {
          config.persistentWindow = res.persistent;
          try {
            sessionStorage.setItem('ai_dict_tab_persistent', String(res.persistent));
          } catch (e) {}
        } else if (localVal) {
          safeSendMessage({ action: 'SET_TAB_PERSISTENT', persistent: true });
        }
        resolve();
      });
    });
  }

  function setTabPersistent(newState) {
    config.persistentWindow = !!newState;
    try {
      sessionStorage.setItem('ai_dict_tab_persistent', String(config.persistentWindow));
    } catch (e) {}
    safeSendMessage({ action: 'SET_TAB_PERSISTENT', persistent: config.persistentWindow });
    updatePinButtonUI();
  }

  // Get active fullscreen root element if any (HTML5 Fullscreen API)
  // Get active fullscreen root element if any (HTML5 Fullscreen API + YouTube/HTML5 video players)
  function getFullscreenRoot() {
    let root = document.fullscreenElement ||
               document.webkitFullscreenElement ||
               document.mozFullScreenElement ||
               document.msFullscreenElement ||
               null;
    // Pierce open shadow roots if fullscreen element has an inner fullscreen element
    while (root && root.shadowRoot && root.shadowRoot.fullscreenElement) {
      root = root.shadowRoot.fullscreenElement;
    }
    // YouTube / video player fallback if player is in fullscreen mode but document.fullscreenElement wasn't caught
    if (!root) {
      const ytPlayer = document.querySelector('#movie_player.ytp-fullscreen, .html5-video-player.ytp-fullscreen');
      if (ytPlayer) {
        root = ytPlayer;
      }
    }
    return root;
  }

  // Ensure YouTube and video captions allow text selection
  function enableSubtitleSelectionIfSupported() {
    try {
      if (document.getElementById('ai-dict-subtitles-helper-style')) return;
      const style = document.createElement('style');
      style.id = 'ai-dict-subtitles-helper-style';
      style.textContent = `
        /* Ensure YouTube and HTML5 video subtitles are selectable */
        .ytp-caption-segment,
        .caption-window,
        .ytp-caption-window-bottom,
        .ytp-caption-window-rollup,
        [class*="caption-segment"],
        [class*="subtitle-text"] {
          user-select: text !important;
          -webkit-user-select: text !important;
          pointer-events: auto !important;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    } catch (e) {}
  }

  // Ensure containerEl is attached inside the current fullscreen element if active,
  // or restored to document.body/documentElement when outside fullscreen.
  function syncHostContainerParent() {
    setupHostContainer();
    if (!containerEl) return;
    const fullscreenTarget = getFullscreenRoot();
    const targetParent = fullscreenTarget || document.body || document.documentElement;
    if (targetParent && containerEl.parentNode !== targetParent) {
      targetParent.appendChild(containerEl);
    }
  }

  function clampCardInViewport(element) {
    if (!element || !element.parentNode) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const curW = element.offsetWidth || 0;
    const curH = element.offsetHeight || 0;
    if (!curW || !curH) return;

    let curLeft = parseInt(element.style.left, 10);
    let curTop = parseInt(element.style.top, 10);
    if (isNaN(curLeft) || isNaN(curTop)) return;

    const maxLeft = Math.max(10, vw - curW - 10);
    const maxTop = Math.max(10, vh - curH - 10);

    const clampedLeft = Math.min(Math.max(10, curLeft), maxLeft);
    const clampedTop = Math.min(Math.max(10, curTop), maxTop);

    if (clampedLeft !== curLeft) {
      element.style.left = `${Math.round(clampedLeft)}px`;
    }
    if (clampedTop !== curTop) {
      element.style.top = `${Math.round(clampedTop)}px`;
    }
  }

  // Setup Shadow DOM container
  function setupHostContainer() {
    enableSubtitleSelectionIfSupported();
    const fullscreenTarget = getFullscreenRoot();
    const targetParent = fullscreenTarget || document.body || document.documentElement;

    if (containerEl && shadowRoot) {
      if (targetParent && containerEl.parentNode !== targetParent) {
        targetParent.appendChild(containerEl);
      }
      // Purge any accidental duplicate roots in the DOM
      const duplicateRoots = document.querySelectorAll('#ai-dict-extension-root');
      duplicateRoots.forEach(el => {
        if (el !== containerEl && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
      return;
    }
    const existingRoots = document.querySelectorAll('#ai-dict-extension-root');
    existingRoots.forEach(el => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    containerEl = null;
    shadowRoot = null;

    containerEl = document.createElement('div');
    containerEl.id = 'ai-dict-extension-root';
    containerEl.style.cssText = 'all: initial !important; display: block !important; position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; z-index: 2147483647 !important; pointer-events: none !important; overflow: visible !important;';

    // Prevent any mouse/pointer clicks on AI Dict from triggering YouTube video pause/play
    ['mousedown', 'mouseup', 'click', 'dblclick', 'pointerdown', 'pointerup'].forEach(type => {
      containerEl.addEventListener(type, (e) => {
        e.stopPropagation();
      });
    });

    // Prevent YouTube keyboard shortcuts when typing inside AI Dict inputs/textareas
    ['keydown', 'keyup', 'keypress'].forEach(type => {
      containerEl.addEventListener(type, (e) => {
        const target = e.composedPath ? e.composedPath()[0] : e.target;
        const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        if (isInput && e.key !== 'Escape') {
          e.stopPropagation();
        }
      });
    });

    if (targetParent) {
      targetParent.appendChild(containerEl);
    }

    shadowRoot = containerEl.attachShadow({ mode: 'open' });

    // Inject stylesheet link
    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = chrome.runtime.getURL('content.css');
    shadowRoot.appendChild(styleLink);

    // Also fetch CSS text and inject as style tag to avoid any CSP delays
    fetch(chrome.runtime.getURL('content.css'))
      .then(res => res.text())
      .then(css => {
        const styleTag = document.createElement('style');
        styleTag.textContent = css;
        shadowRoot.appendChild(styleTag);
      })
      .catch(() => {});
  }

  // Listen for background messages (e.g. Context Menu trigger or Popup recent word click)
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action === 'TRIGGER_LOOKUP') {
      const text = (req.text || '').trim();
      if (text) {
        currentSelectionText = text;
        const sel = window.getSelection();
        let rect = null;
        if (sel && sel.rangeCount > 0) {
          rect = sel.getRangeAt(0).getBoundingClientRect();
        }
        openCardAtRect(rect, text);
        if (sendResponse) sendResponse({ success: true });
      }
    } else if (req.action === 'OPEN_SAVED_WORD') {
      const text = (req.term || '').trim();
      if (text) {
        openCardAtRect(null, text, req.mode);
        if (sendResponse) sendResponse({ success: true });
      }
    } else if (req.action === 'ACTIVATE_PERSISTENT_WINDOW') {
      setTabPersistent(true);
      const explicitTerm = (req.term || '').trim();
      const chosenMode = req.mode || currentMode || 'search';

      if (explicitTerm) {
        openCardAtRect(null, explicitTerm, chosenMode);
      } else if (isCardOpen && cardEl && cardEl.parentNode) {
        if (chosenMode !== 'machine_translation' && cardEl.classList.contains('simple-mt-card')) {
          switchToFullFeatureMode(currentSelectionText, chosenMode);
        } else if (chosenMode === 'machine_translation' && !cardEl.classList.contains('simple-mt-card')) {
          switchToSimpleMtMode(currentSelectionText, lastSelectionRect);
        } else {
          updatePinButtonUI();
          focusCardSearchInput();
        }
      } else {
        const sel = window.getSelection();
        const text = (sel ? sel.toString() : '').trim();
        if (text) {
          let rect = null;
          if (sel.rangeCount > 0) {
            try { rect = sel.getRangeAt(0).getBoundingClientRect(); } catch (err) {}
          }
          openCardAtRect(rect, text, chosenMode);
        } else if (currentSelectionText) {
          openCardAtRect(null, currentSelectionText, chosenMode);
        } else {
          openPersistentEmptyCard(chosenMode);
        }
      }
      if (sendResponse) sendResponse({ success: true });
    } else if (req.action === 'SET_PERSISTENT_STATE') {
      config.persistentWindow = !!req.persistent;
      try {
        sessionStorage.setItem('ai_dict_tab_persistent', String(config.persistentWindow));
      } catch (e) {}
      updatePinButtonUI();
      if (sendResponse) sendResponse({ success: true, persistent: config.persistentWindow });
    } else if (req.action === 'GET_PERSISTENT_STATE') {
      if (sendResponse) sendResponse({ success: true, persistent: !!config.persistentWindow });
    } else if (req.action === 'SET_DEFAULT_MODE') {
      const targetMode = req.mode || 'search';
      config.defaultMode = targetMode;
      if (isCardOpen && cardEl && cardEl.parentNode) {
        if (targetMode !== 'machine_translation' && cardEl.classList.contains('simple-mt-card')) {
          switchToFullFeatureMode(currentSelectionText, targetMode);
        } else if (targetMode === 'machine_translation' && !cardEl.classList.contains('simple-mt-card')) {
          switchToSimpleMtMode(currentSelectionText, lastSelectionRect);
        }
      }
      if (sendResponse) sendResponse({ success: true });
    } else if (req.action === 'TOGGLE_CARD') {
      const sel = window.getSelection();
      const text = (sel ? sel.toString() : '').trim();
      if (text) {
        let rect = null;
        if (sel.rangeCount > 0) {
          rect = sel.getRangeAt(0).getBoundingClientRect();
        }
        openCardAtRect(rect, text);
      } else if (isCardOpen) {
        closeCard();
      } else if (currentSelectionText) {
        openCardAtRect(null, currentSelectionText);
      }
      if (sendResponse) sendResponse({ success: true });
    }
    return true;
  });

  // Watch for storage changes
  chrome.storage.onChanged.addListener((changes) => {
    for (const [key, change] of Object.entries(changes)) {
      if (key === 'persistentWindow') continue;
      config[key] = change.newValue;
    }
    if (changes.defaultMode) {
      const newDefault = changes.defaultMode.newValue;
      config.defaultMode = newDefault;
      if (isCardOpen && cardEl && cardEl.parentNode) {
        if (newDefault && newDefault !== 'machine_translation' && cardEl.classList.contains('simple-mt-card')) {
          switchToFullFeatureMode(currentSelectionText, newDefault);
        } else if (newDefault === 'machine_translation' && !cardEl.classList.contains('simple-mt-card')) {
          switchToSimpleMtMode(currentSelectionText, lastSelectionRect);
        }
      }
    }
    if (changes.theme && cardEl) {
      const isMt = cardEl.classList.contains('simple-mt-card');
      cardEl.className = isMt ? `ai-dict-card theme-${config.theme} simple-mt-card` : `ai-dict-card theme-${config.theme}`;
    }
    if (changes.isPaused && changes.isPaused.newValue === true) {
      removeTriggerBtn();
    }
    if (changes.persistentNewTabOnLoading !== undefined && cardEl) {
      updateNewTabButtonUI();
    }
  });

  async function fetchProfilesSilently() {
    try {
      const res = await callBackend('/api/profiles');
      if (Array.isArray(res)) {
        profiles = res;
        const found = profiles.find(p => p.id === config.activeProfileId);
        if (found) {
          config.activeProfileName = found.name;
        }
      }
    } catch (e) {}
  }

  async function fetchTemplatesSilently() {
    try {
      const res = await callBackend('/api/settings');
      if (res) {
        if (res.settings) {
          config.appSettings = res.settings;
          safeStorageSet({ appSettings: res.settings });
        }
        if (Array.isArray(res.templates) && res.templates.length > 0) {
          if (!config.externalSites || config.externalSites.length === 0) {
            config.externalSites = res.templates;
          }
        }
      }
    } catch (e) {}
  }

  let isMouseDownOnPage = false;
  let selectionChangeTimer = null;

  function setupEventListeners() {
    // 1. Text Selection handling (Mouse up) - USE CAPTURE to intercept before YouTube / video controls stop propagation
    document.addEventListener('mouseup', (e) => {
      isMouseDownOnPage = false;
      handleMouseUp(e);
    }, true);

    // 2. Double click handling - USE CAPTURE
    document.addEventListener('dblclick', (e) => {
      handleDoubleClick(e);
    }, true);

    // 3. Selection change handling: detects programmatic subtitle selector clicks or keyboard selections
    document.addEventListener('selectionchange', () => {
      if (isDomainBlacklisted() || isExtensionPaused()) return;
      if (isMouseDownOnPage) return; // User is actively dragging with mouse; mouseup handles it

      if (selectionChangeTimer) clearTimeout(selectionChangeTimer);
      selectionChangeTimer = setTimeout(() => {
        selectionChangeTimer = null;
        if (isCardOpen && !config.persistentWindow) return;

        const sel = getDeepSelection();
        const rawText = sel ? sel.toString().trim() : '';
        const text = cleanSelectedText(rawText);
        if (!text || text.length === 0 || text.length > 1500) return;
        if (text === currentSelectionText && (triggerBtn || isCardOpen)) return;

        syncHostContainerParent();

        if (sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        const fullRect = range.getBoundingClientRect();
        if (!fullRect || (fullRect.width === 0 && fullRect.height === 0)) return;

        currentSelectionText = text;
        lastSelectionRect = fullRect;

        if (config.triggerMode === 'auto') {
          openCardAtRect(fullRect, text);
        } else if (config.triggerMode === 'bubble') {
          const rects = range.getClientRects();
          const lastRect = rects.length > 0 ? rects[rects.length - 1] : fullRect;
          showTriggerButton(lastRect, fullRect, text);
        }
      }, 180);
    });

    // 4. Dismiss trigger button on scroll
    window.addEventListener('scroll', () => {
      removeTriggerBtn();
    }, { passive: true });

    // 5. Dismiss secondary card on click outside (capture phase so it runs before any stopPropagation)
    document.addEventListener('mousedown', (e) => {
      isMouseDownOnPage = true;
      if (isSecondaryCardOpen && secondaryCardEl) {
        const path = e.composedPath ? e.composedPath() : [];
        if (!path.includes(secondaryCardEl)) {
          closeSecondaryCard();
        }
      }
    }, true);

    // 6. Dismiss trigger button / non-persistent card on click outside (capture phase)
    document.addEventListener('mousedown', (e) => {
      isMouseDownOnPage = true;
      const path = e.composedPath ? e.composedPath() : [];
      if (containerEl && path.includes(containerEl)) {
        return; // Click was inside our shadow DOM - do not dismiss!
      }

      // Click was outside
      removeTriggerBtn();
      if (isCardOpen && !config.persistentWindow) {
        closeCard();
      }
    }, true);

    // 7. Dismiss on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        removeTriggerBtn();
        if (isSecondaryCardOpen) {
          closeSecondaryCard();
          return;
        }
        if (isHistoryOpen) {
          closeHistoryPanel();
          return;
        }
        if (isCardOpen) closeCard();
      }
    });

    // 8. Fullscreen change handling: ensure extension overlays inside HTML5 fullscreen elements
    const handleFullscreenChange = () => {
      enableSubtitleSelectionIfSupported();
      syncHostContainerParent();
      setTimeout(syncHostContainerParent, 100);
      setTimeout(syncHostContainerParent, 500);
      if (isCardOpen && cardEl) {
        clampCardInViewport(cardEl);
      }
      if (isSecondaryCardOpen && secondaryCardEl) {
        clampCardInViewport(secondaryCardEl);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
  }

  function isDomainBlacklisted() {
    const host = window.location.hostname;
    return (config.blacklist || []).some(d => d && host.includes(d));
  }

  function isExtensionPaused() {
    if (!config.isPaused) return false;
    if (config.pauseUntil && config.pauseUntil > 0) {
      if (Date.now() >= config.pauseUntil) {
        config.isPaused = false;
        config.pauseUntil = 0;
        safeStorageSet({ isPaused: false, pauseUntil: 0 });
        return false;
      }
    }
    return true;
  }

  function showToast(message) {
    syncHostContainerParent();
    if (!shadowRoot) return;
    const existingToast = shadowRoot.querySelector('.ai-dict-toast');
    if (existingToast && existingToast.parentNode) {
      existingToast.parentNode.removeChild(existingToast);
    }
    const toast = document.createElement('div');
    toast.className = 'ai-dict-toast';
    toast.innerHTML = `<span>${escapeHtml(message)}</span><button type="button">Dismiss</button>`;
    const dismissBtn = toast.querySelector('button');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      });
    }
    shadowRoot.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4500);
  }

  function checkModifier(e) {
    if (!config.modifierKey || config.modifierKey === 'none') return true;
    if (config.modifierKey === 'alt' && e.altKey) return true;
    if (config.modifierKey === 'ctrl' && (e.ctrlKey || e.metaKey)) return true;
    if (config.modifierKey === 'shift' && e.shiftKey) return true;
    return false;
  }

  let mouseUpTimer = null;

  function cleanSelectedText(raw) {
    if (!raw) return '';
    const trimmed = raw.trim();
    // Preserve intentional ellipsis like '...' or '…'
    const hasTrailingEllipsis = /\.{2,}$|…$/.test(trimmed);
    let cleaned = trimmed;
    if (hasTrailingEllipsis) {
      cleaned = cleaned.replace(/^[\s,;:!?"'“”‘’()[\]{}«»‹›—–-]+/, '');
      cleaned = cleaned.replace(/[\s,;:!?"'“”‘’()[\]{}«»‹›—–-]+$/, '');
    } else {
      cleaned = cleaned.replace(/^[\s.,;:!?"'“”‘’()[\]{}«»‹›—–-]+|[\s.,;:!?"'“”‘’()[\]{}«»‹›—–-]+$/g, '');
    }
    return cleaned || trimmed;
  }

  // Get active text selection across standard window, Shadow DOMs (used by subtitle extensions), and active inputs
  function getDeepSelection(e) {
    // 1. Check if event target has a shadow root with a selection
    if (e && e.target && typeof e.target.getRootNode === 'function') {
      const root = e.target.getRootNode();
      if (root && root !== document && typeof root.getSelection === 'function') {
        const shadowSel = root.getSelection();
        if (shadowSel && shadowSel.toString().trim()) {
          return shadowSel;
        }
      }
    }

    // 2. Check document activeElement and its shadow root chain
    let active = document.activeElement;
    while (active && active.shadowRoot) {
      if (typeof active.shadowRoot.getSelection === 'function') {
        const s = active.shadowRoot.getSelection();
        if (s && s.toString().trim()) return s;
      }
      active = active.shadowRoot.activeElement;
    }

    // 3. Fallback to standard window.getSelection()
    return window.getSelection();
  }

  // Handle Double-Click: Automatically queries the selected word immediately without showing the icon
  function handleDoubleClick(e) {
    if (isDomainBlacklisted() || isExtensionPaused()) return;
    if (config.doubleClickLookup === false) return; // Enabled by default unless explicitly disabled

    const path = e.composedPath ? e.composedPath() : [];
    if (containerEl && path.includes(containerEl)) return;

    if (mouseUpTimer) {
      clearTimeout(mouseUpTimer);
      mouseUpTimer = null;
    }
    removeTriggerBtn();
    closeSecondaryCard();

    setTimeout(() => {
      syncHostContainerParent();
      const sel = getDeepSelection(e);
      const rawText = sel ? sel.toString().trim() : '';
      const text = cleanSelectedText(rawText);

      if (!text || text.length === 0 || text.length > 500) return;

      let rect = null;
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        rect = range.getBoundingClientRect();
      }

      // Robust fallback if range bounding rect is collapsed (common on video subtitle overlays)
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        if (e && e.target && typeof e.target.getBoundingClientRect === 'function') {
          const tRect = e.target.getBoundingClientRect();
          if (tRect.width > 0 && tRect.height > 0) rect = tRect;
        }
      }
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        if (e && typeof e.clientX === 'number' && typeof e.clientY === 'number') {
          rect = {
            left: e.clientX - 20,
            right: e.clientX + 20,
            top: e.clientY - 15,
            bottom: e.clientY + 15,
            width: 40,
            height: 30
          };
        }
      }

      if (!rect || (rect.width === 0 && rect.height === 0)) return;

      activeLookupToken++; // Invalidate any previous lookup
      currentSelectionText = text;
      lastSelectionRect = rect;
      // Immediately open card without showing bubble icon
      openCardAtRect(rect, text);
    }, 10);
  }

  // Handle Text Selection (Mouse up)
  function handleMouseUp(e) {
    if (isDomainBlacklisted() || isExtensionPaused()) return;

    // Ignore if mouse up occurred inside our own card or button
    const path = e.composedPath ? e.composedPath() : [];
    if (containerEl && path.includes(containerEl)) return;

    closeSecondaryCard();

    // If double-click is active, skip showing trigger button when e.detail >= 2
    if (config.doubleClickLookup !== false && e.detail >= 2) {
      if (mouseUpTimer) {
        clearTimeout(mouseUpTimer);
        mouseUpTimer = null;
      }
      removeTriggerBtn();
      return;
    }

    if (mouseUpTimer) {
      clearTimeout(mouseUpTimer);
      mouseUpTimer = null;
    }

    // Delay 140ms before showing trigger button for drag selection.
    // This gives double-click enough time to register without showing a flashing bubble.
    mouseUpTimer = setTimeout(() => {
      mouseUpTimer = null;
      if (isCardOpen && !config.persistentWindow) return;

      syncHostContainerParent();

      const sel = getDeepSelection(e);
      const rawText = sel ? sel.toString().trim() : '';
      const text = cleanSelectedText(rawText);

      if (!text || text.length === 0 || text.length > 1500) {
        removeTriggerBtn();
        return;
      }

      let lastRect = null;
      let fullRect = null;

      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const rects = range.getClientRects();
        lastRect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
        fullRect = range.getBoundingClientRect();
      }

      // Robust fallback if range bounding rect is collapsed (common on video subtitle overlays)
      if (!fullRect || (fullRect.width === 0 && fullRect.height === 0)) {
        if (e && e.target && typeof e.target.getBoundingClientRect === 'function') {
          const tRect = e.target.getBoundingClientRect();
          if (tRect.width > 0 && tRect.height > 0) {
            fullRect = tRect;
            lastRect = tRect;
          }
        }
      }
      if (!fullRect || (fullRect.width === 0 && fullRect.height === 0)) {
        if (e && typeof e.clientX === 'number' && typeof e.clientY === 'number') {
          const mRect = {
            left: e.clientX - 15,
            right: e.clientX + 15,
            top: e.clientY - 10,
            bottom: e.clientY + 10,
            width: 30,
            height: 20
          };
          fullRect = mRect;
          lastRect = mRect;
        }
      }

      // If selection is collapsed or invisible, ignore
      if (!fullRect || (fullRect.width === 0 && fullRect.height === 0)) return;

      currentSelectionText = text;
      lastSelectionRect = fullRect;

      const modOk = checkModifier(e);

      if (config.triggerMode === 'auto' && modOk) {
        openCardAtRect(fullRect, text);
      } else if (config.triggerMode === 'key' && modOk) {
        openCardAtRect(fullRect, text);
      } else {
        // Default Google Translate bubble mode:
        // Slow/drag selection shows the floating trigger button icon near the selection end
        showTriggerButton(lastRect || fullRect, fullRect, text);
      }
    }, 140);
  }

  function showTriggerButton(anchorRect, fullRect, textToLookup) {
    removeTriggerBtn();
    if (isExtensionPaused()) return;
    syncHostContainerParent();
    if (!shadowRoot) return;

    const term = textToLookup || currentSelectionText;
    triggerBtn = document.createElement('button');
    triggerBtn.type = 'button';
    triggerBtn.className = 'ai-dict-trigger-btn';
    triggerBtn.title = `Look up "${term.slice(0, 25)}" in AI Dict`;
    triggerBtn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
      </svg>
    `;

    const bubbleSize = 28;
    // Position on the lower right of the selection (to avoid overlapping upper highlight extensions)
    let x = anchorRect.right + 6;
    let y = anchorRect.bottom + 4;

    // Viewport bounds checking
    if (x + bubbleSize > window.innerWidth - 8) {
      x = window.innerWidth - bubbleSize - 8;
    }
    if (x < 8) {
      x = 8;
    }
    // Flip above subtitle if near bottom screen edge or video controls
    if (y + bubbleSize > window.innerHeight - 8 || anchorRect.bottom > window.innerHeight - 90) {
      y = anchorRect.top - bubbleSize - 6;
    }
    if (y < 8) {
      y = 8;
    }

    triggerBtn.style.left = `${Math.round(x)}px`;
    triggerBtn.style.top = `${Math.round(y)}px`;

    // Crucial: Prevent all pointer/mouse events from bubbling to YouTube video or clearing selection
    const stopBubbleEvents = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    triggerBtn.addEventListener('mousedown', stopBubbleEvents);
    triggerBtn.addEventListener('mouseup', stopBubbleEvents);
    triggerBtn.addEventListener('pointerdown', stopBubbleEvents);
    triggerBtn.addEventListener('pointerup', stopBubbleEvents);

    triggerBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      removeTriggerBtn();
      openCardAtRect(fullRect || anchorRect, term);
    });

    shadowRoot.appendChild(triggerBtn);
  }

  function removeTriggerBtn() {
    if (triggerBtn && triggerBtn.parentNode) {
      triggerBtn.parentNode.removeChild(triggerBtn);
      triggerBtn = null;
    }
  }

  function calculateSmartCardPosition(rect, targetWidth, targetHeight) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const PAD = 10;
    const WORD_GAP = 10;

    if (!rect || (rect.width === 0 && rect.height === 0)) {
      const w = Math.min(targetWidth, vw - PAD * 2);
      const h = Math.min(targetHeight, vh - PAD * 2);
      return {
        x: Math.max(PAD, (vw - w) / 2),
        y: Math.max(PAD, (vh - h) / 2),
        width: w,
        height: h,
        placement: 'center'
      };
    }

    let width = Math.min(targetWidth, vw - PAD * 2);
    let height = Math.min(targetHeight, vh - PAD * 2);

    // Available room strictly outside the word's bounding box
    const spaceRight = vw - rect.right - WORD_GAP - PAD;
    const spaceBelow = vh - rect.bottom - WORD_GAP - PAD;
    const spaceAbove = rect.top - WORD_GAP - PAD;
    const spaceLeft = rect.left - WORD_GAP - PAD;

    // Helper: calculate horizontal alignment for vertical (below/above) placement
    function getHorizontalXForVerticalPlacement() {
      let hx = rect.left;
      if (hx + width > vw - PAD) {
        hx = vw - width - PAD;
      }
      if (hx < PAD) hx = PAD;
      return hx;
    }

    // Helper: calculate vertical alignment for side (right/left) placement
    function getVerticalYForSidePlacement() {
      // Align slightly above word top for comfortable visual balance
      let vy = rect.top - 16;
      if (vy + height > vh - PAD) {
        vy = vh - height - PAD;
      }
      if (vy < PAD) vy = PAD;
      return vy;
    }

    let x = 0;
    let y = 0;
    let placement = 'below';

    const pref = config.cardPlacement || 'auto'; // 'auto', 'side', 'below', 'above'

    if (pref === 'above' && spaceAbove >= 200) {
      if (spaceAbove < height) {
        height = spaceAbove;
      }
      x = getHorizontalXForVerticalPlacement();
      y = rect.top - height - WORD_GAP;
      placement = 'above';
    } else if (pref === 'below' && spaceBelow >= 200) {
      if (spaceBelow < height) {
        height = spaceBelow;
      }
      x = getHorizontalXForVerticalPlacement();
      y = rect.bottom + WORD_GAP;
      placement = 'below';
    } else if (pref === 'side' && (spaceRight >= 280 || spaceLeft >= 280)) {
      if (spaceRight >= width) {
        x = rect.right + WORD_GAP;
        y = getVerticalYForSidePlacement();
        placement = 'right';
      } else if (spaceLeft >= width) {
        x = rect.left - width - WORD_GAP;
        y = getVerticalYForSidePlacement();
        placement = 'left';
      } else if (spaceRight >= spaceLeft) {
        width = Math.min(width, spaceRight);
        x = rect.right + WORD_GAP;
        y = getVerticalYForSidePlacement();
        placement = 'right';
      } else {
        width = Math.min(width, spaceLeft);
        x = rect.left - width - WORD_GAP;
        y = getVerticalYForSidePlacement();
        placement = 'left';
      }
    }
    // SMART AUTO PLACEMENT (Never hide the word):
    // 1. Next to the word on the Right if side space is ample (preserves paragraph reading flow)
    else if (spaceRight >= width) {
      x = rect.right + WORD_GAP;
      y = getVerticalYForSidePlacement();
      placement = 'right';
    }
    // 2. Downward below the word if vertical space below fits
    else if (spaceBelow >= height) {
      x = getHorizontalXForVerticalPlacement();
      y = rect.bottom + WORD_GAP;
      placement = 'below';
    }
    // 3. Upward above the word if vertical space above fits
    else if (spaceAbove >= height) {
      x = getHorizontalXForVerticalPlacement();
      y = rect.top - height - WORD_GAP;
      placement = 'above';
    }
    // 4. Next to the word on the Left if left space fits
    else if (spaceLeft >= width) {
      x = rect.left - width - WORD_GAP;
      y = getVerticalYForSidePlacement();
      placement = 'left';
    }
    // 5. Constrained viewports fallback: adapt width/height strictly outside the word's bounds
    else {
      const minSideW = Math.min(360, vw - PAD * 2);
      if (spaceRight >= minSideW && spaceRight >= spaceLeft) {
        width = Math.min(width, spaceRight);
        x = rect.right + WORD_GAP;
        y = getVerticalYForSidePlacement();
        placement = 'right';
      } else if (spaceLeft >= minSideW) {
        width = Math.min(width, spaceLeft);
        x = rect.left - width - WORD_GAP;
        y = getVerticalYForSidePlacement();
        placement = 'left';
      } else if (spaceBelow >= spaceAbove) {
        x = getHorizontalXForVerticalPlacement();
        y = rect.bottom + WORD_GAP;
        height = Math.max(220, Math.min(height, spaceBelow));
        placement = 'below';
      } else {
        height = Math.max(220, Math.min(height, spaceAbove));
        x = getHorizontalXForVerticalPlacement();
        y = Math.max(PAD, rect.top - height - WORD_GAP);
        placement = 'above';
      }
    }

    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      placement
    };
  }

  function syncSearchPlaceholder(mode) {
    if (!cardEl) return;
    const cardSearchInput = cardEl.querySelector('#ai-dict-card-search-input');
    if (!cardSearchInput) return;
    if (mode === 'explain') {
      cardSearchInput.placeholder = 'Type phrase or sentence to explain...';
    } else if (mode === 'translation') {
      cardSearchInput.placeholder = 'Type text to translate...';
    } else if (mode === 'correction') {
      cardSearchInput.placeholder = 'Type text to correct / translate...';
    } else if (mode === 'compare') {
      cardSearchInput.placeholder = 'Type words to compare (e.g. affect, effect)...';
    } else if (mode === 'simple_llm') {
      cardSearchInput.placeholder = 'Type word or text for Ling Flash (Not saved)...';
    } else {
      cardSearchInput.placeholder = 'Type word to define & save...';
    }
  }

  // Language list for Simple Machine Translation (NLLB-200 offline)
  const SIMPLE_MT_LANGUAGES = [
    { code: '🌐 Auto', name: 'Auto Detect' },
    { code: '🇺🇸 EN', name: 'English' },
    { code: '🇻🇳 VI', name: 'Vietnamese' },
    { code: '🇩🇪 DE', name: 'German' },
    { code: '🇫🇷 FR', name: 'French' },
    { code: '🇪🇸 ES', name: 'Spanish' },
    { code: '🇨🇳 ZH', name: 'Chinese' },
    { code: '🇯🇵 JA', name: 'Japanese' },
    { code: '🇰🇷 KO', name: 'Korean' },
    { code: '🇮🇹 IT', name: 'Italian' },
    { code: '🇵🇹 PT', name: 'Portuguese' },
    { code: '🇷🇺 RU', name: 'Russian' },
    { code: '🇸🇦 AR', name: 'Arabic' },
    { code: '🇳🇱 NL', name: 'Dutch' },
    { code: '🇵🇱 PL', name: 'Polish' },
    { code: '🇹🇷 TR', name: 'Turkish' },
    { code: '🇺🇦 UK', name: 'Ukrainian' },
    { code: '🇮🇩 ID', name: 'Indonesian' },
    { code: '🇮🇳 HI', name: 'Hindi' },
    { code: '🇹🇭 TH', name: 'Thai' },
    { code: '🇸🇪 SV', name: 'Swedish' },
    { code: '🇳🇴 NO', name: 'Norwegian' },
    { code: '🇩🇰 DA', name: 'Danish' },
    { code: '🇫🇮 FI', name: 'Finnish' },
    { code: '🇨🇿 CS', name: 'Czech' },
    { code: '🇬🇷 EL', name: 'Greek' },
    { code: '🇭🇺 HU', name: 'Hungarian' },
    { code: '🇷🇴 RO', name: 'Romanian' },
    { code: '🇮🇱 HE', name: 'Hebrew' }
  ];

  // Default Languages list for language selection in LLM modes
  const DEFAULT_LANGS = ['🌐 Auto', '🇺🇸 EN', '🇩🇪 DE', '🇻🇳 VI', '🇫🇷 FR', '🇪🇸 ES', '🇯🇵 JA', '🇨🇳 ZH', '🇰🇷 KO'];

  function populateCardLangSelects(currentSrc, currentTgt) {
    if (!cardEl) return;
    const srcSelect = cardEl.querySelector('#ai-dict-card-src-lang');
    const tgtSelect = cardEl.querySelector('#ai-dict-card-tgt-lang');

    let srcLangs = [...DEFAULT_LANGS];
    if (currentSrc && !srcLangs.includes(currentSrc)) {
      srcLangs.push(currentSrc);
    }
    let tgtLangs = DEFAULT_LANGS.filter(l => !l.includes('Auto'));
    if (currentTgt && !tgtLangs.includes(currentTgt)) {
      tgtLangs.push(currentTgt);
    }

    if (srcSelect) {
      srcSelect.innerHTML = srcLangs.map(l => `<option value="${l}" ${l === currentSrc ? 'selected' : ''}>${l}</option>`).join('');
    }
    if (tgtSelect) {
      tgtSelect.innerHTML = tgtLangs.map(l => `<option value="${l}" ${l === currentTgt ? 'selected' : ''}>${l}</option>`).join('');
    }
  }

  function syncCardLanguageRow() {
    if (!cardEl) return;
    const langRow = cardEl.querySelector('#ai-dict-card-lang-row');
    if (!langRow) return;
    const modetypeBtn = cardEl.querySelector('#ai-dict-card-modetype-btn');
    const modetypeLabel = cardEl.querySelector('#ai-dict-card-modetype-label');
    const tgtSelect = cardEl.querySelector('#ai-dict-card-tgt-lang');
    const swapBtn = cardEl.querySelector('#ai-dict-card-swap-lang-btn');

    const pid = config.activeProfileId || 1;
    const appSettings = config.appSettings || {};

    if (currentMode === 'correction') {
      langRow.style.setProperty('display', 'flex', 'important');
      langRow.classList.remove('hidden');
      if (modetypeBtn) {
        modetypeBtn.style.setProperty('display', 'inline-flex', 'important');
        const modeType = appSettings[`correctionModeType_${pid}`] || 'both';
        const isBoth = modeType === 'both';
        if (modetypeLabel) {
          modetypeLabel.textContent = isBoth ? 'Correction + Translation' : 'Correction Only';
        }
        modetypeBtn.classList.toggle('correction-only', !isBoth);
        if (tgtSelect) tgtSelect.style.setProperty('display', isBoth ? 'inline-block' : 'none', 'important');
        if (swapBtn) swapBtn.style.setProperty('display', isBoth ? 'inline-block' : 'none', 'important');
      }
      populateCardLangSelects(
        appSettings[`correctionSourceLang_${pid}`] || '🌐 Auto',
        appSettings[`correctionTargetLang_${pid}`] || '🇺🇸 EN'
      );
    } else if (['explain', 'translation', 'compare', 'search', 'simple_llm'].includes(currentMode)) {
      langRow.style.setProperty('display', 'flex', 'important');
      langRow.classList.remove('hidden');
      if (modetypeBtn) modetypeBtn.style.setProperty('display', 'none', 'important');
      if (tgtSelect) tgtSelect.style.setProperty('display', 'inline-block', 'important');
      if (swapBtn) swapBtn.style.setProperty('display', 'inline-block', 'important');

      const defaultTgt = appSettings[`searchTargetLang_${pid}`] || appSettings['SEARCH_TARGET_LANG'] || '🇺🇸 EN';
      const defaultSrc = '🌐 Auto';

      let srcVal = appSettings[`${currentMode}SourceLang_${pid}`];
      let tgtVal = appSettings[`${currentMode}TargetLang_${pid}`];

      if (currentMode === 'search') {
        srcVal = srcVal || appSettings['SEARCH_SOURCE_LANG'] || defaultSrc;
        tgtVal = tgtVal || appSettings['SEARCH_TARGET_LANG'] || defaultTgt;
      } else {
        srcVal = srcVal || defaultSrc;
        tgtVal = tgtVal || defaultTgt;
      }

      populateCardLangSelects(srcVal, tgtVal);
    } else {
      langRow.style.setProperty('display', 'none', 'important');
      langRow.classList.add('hidden');
    }
  }

  function focusCardSearchInput() {
    if (!cardEl) return;
    const cardSearchInput = cardEl.querySelector('#ai-dict-card-search-input');
    if (cardSearchInput) {
      setTimeout(() => {
        cardSearchInput.focus();
        cardSearchInput.select();
      }, 60);
    }
  }

  function openPersistentEmptyCard(explicitMode = null) {
    closeSecondaryCard();
    removeTriggerBtn();

    if (profiles.length === 0) {
      fetchProfilesSilently();
    }

    const mode = explicitMode || config.defaultMode || 'machine_translation';
    if (mode === 'machine_translation') {
      createCardElement('machine_translation');
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const cardWidth = Math.min(Math.round(vw * 0.95), Math.max(360, config.simpleMtWidth || 480));
      const cardHeight = Math.min(Math.round(vh * 0.9), Math.max(260, config.simpleMtHeight || 360));
      const x = Math.max(20, Math.round(vw - cardWidth - 36));
      const y = Math.max(24, Math.min(60, Math.round((vh - cardHeight) / 4)));
      cardEl.style.width = `${cardWidth}px`;
      cardEl.style.height = `${cardHeight}px`;
      cardEl.style.left = `${x}px`;
      cardEl.style.top = `${y}px`;
      cardEl.dataset.placement = 'right-docked';
      isCardOpen = true;
      currentMode = 'machine_translation';
      updatePinButtonUI();
      const srcInput = cardEl.querySelector('#simple-mt-source-input');
      if (srcInput) srcInput.focus();
      return;
    }

    createCardElement(mode);

    const cardWidth = Math.max(360, config.cardWidth || 560);
    const cardHeight = Math.max(280, config.cardHeight || 640);

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = Math.max(20, Math.round(vw - cardWidth - 36));
    const y = Math.max(24, Math.min(60, Math.round((vh - cardHeight) / 4)));

    cardEl.style.width = `${cardWidth}px`;
    cardEl.style.height = `${cardHeight}px`;
    cardEl.style.left = `${x}px`;
    cardEl.style.top = `${y}px`;
    cardEl.dataset.placement = 'right-docked';

    isCardOpen = true;
    currentMode = mode;
    cardTabs = [];
    activeCardTabId = null;

    // Sync mode pills
    const pills = cardEl.querySelectorAll('.mode-pill');
    pills.forEach(p => p.classList.toggle('active', p.dataset.mode === currentMode));

    // Update inline search bar
    const cardSearchInput = cardEl.querySelector('#ai-dict-card-search-input');
    if (cardSearchInput) {
      cardSearchInput.value = '';
    }
    const cardModeSelect = cardEl.querySelector('#ai-dict-card-search-mode-select');
    if (cardModeSelect) {
      cardModeSelect.value = currentMode;
    }
    syncSearchPlaceholder(currentMode);
    syncCardLanguageRow();
    closeHistoryPanel();
    updatePinButtonUI();
    updateNewTabButtonUI();
    renderWordTabsBar();

    // Render friendly ready empty state in card body
    const cardBody = cardEl.querySelector('#ai-dict-card-body');
    if (cardBody) {
      cardBody.innerHTML = `
        <div class="empty-state" style="padding: 44px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; box-sizing: border-box;">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: rgba(59, 130, 246, 0.14); display: flex; align-items: center; justify-content: center; margin-bottom: 14px; border: 1px solid rgba(59, 130, 246, 0.3);">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.2"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z"></path></svg>
          </div>
          <div style="font-size: 15.5px; font-weight: 700; margin-bottom: 6px; color: inherit;">Persistent Window Active</div>
          <div style="font-size: 12.5px; opacity: 0.75; max-width: 330px; line-height: 1.5; margin-bottom: 18px;">
            Select any word on this page to look up automatically, or type a term in the search bar above. This window stays open across searches.
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;">
            <button type="button" class="form-select-sm" id="empty-state-history-btn" style="cursor: pointer; padding: 5px 12px; font-size: 11.5px; font-weight: 500; display: inline-flex; align-items: center; gap: 4px; background: rgba(125, 125, 125, 0.12); border: 1px solid rgba(125, 125, 125, 0.25); border-radius: 6px; color: inherit;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span>Recent History</span>
            </button>
          </div>
        </div>
      `;
      const histBtn = cardBody.querySelector('#empty-state-history-btn');
      if (histBtn) {
        histBtn.addEventListener('click', () => {
          openHistoryPanel(currentMode);
        });
      }
    }

    const chatDrawer = cardEl.querySelector('#ai-dict-chat-drawer');
    if (chatDrawer) chatDrawer.style.display = 'none';

    focusCardSearchInput();
  }

  function openCardAtRect(rect, text, explicitMode = null) {
    syncHostContainerParent();
    closeSecondaryCard();
    removeTriggerBtn();
    const cleanWord = cleanSelectedText(text);
    if (!cleanWord) return;

    currentSelectionText = cleanWord;
    if (rect) {
      lastSelectionRect = rect;
    } else {
      lastSelectionRect = null;
    }

    if (profiles.length === 0) {
      fetchProfilesSilently();
    }

    // Determine mode
    let chosenMode = 'machine_translation';
    const isLlmActive = (config.defaultMode && config.defaultMode !== 'machine_translation') || (isCardOpen && cardEl && !cardEl.classList.contains('simple-mt-card'));

    if (explicitMode) {
      chosenMode = explicitMode;
    } else if (/\b(vs\.?|versus)\b/i.test(cleanWord) || cleanWord.includes(';')) {
      chosenMode = 'compare';
    } else if (config.autoDetectSentence && (cleanWord.split(/\s+/).length > 3 || /[.!?]/.test(cleanWord))) {
      chosenMode = isLlmActive ? 'explain' : 'machine_translation';
    } else if (isCardOpen && cardEl && !cardEl.classList.contains('simple-mt-card')) {
      // If Full LLM card is currently open and no explicit mode passed, STAY in LLM mode!
      chosenMode = (currentMode && currentMode !== 'machine_translation') ? currentMode : ((config.defaultMode && config.defaultMode !== 'machine_translation') ? config.defaultMode : 'search');
    } else {
      chosenMode = config.defaultMode || 'machine_translation';
    }

    // Simple Machine Translate Mode (Google Translate style, zero memory)
    if (chosenMode === 'machine_translation') {
      stopSpeech();
      activeLookupToken++; // Invalidate any in-flight LLM lookup callbacks
      if (!isCardOpen || !cardEl || !cardEl.parentNode || !cardEl.classList.contains('simple-mt-card')) {
        switchToSimpleMtMode(cleanWord, rect);
        return;
      }
      currentMode = 'machine_translation';
      currentSelectionText = cleanWord;
      const srcInput = cardEl.querySelector('#simple-mt-source-input');
      if (srcInput) {
        srcInput.value = cleanWord;
      }
      updateSimpleMtCharCount(cleanWord);
      if (!config.persistentWindow && rect) {
        const cardWidth = cardEl.offsetWidth || Math.min(Math.round(window.innerWidth * 0.95), Math.max(360, config.simpleMtWidth || 480));
        const cardHeight = cardEl.offsetHeight || Math.min(Math.round(window.innerHeight * 0.9), Math.max(260, config.simpleMtHeight || 360));
        const pos = calculateSmartCardPosition(rect, cardWidth, cardHeight);
        cardEl.style.left = `${pos.x}px`;
        cardEl.style.top = `${pos.y}px`;
        cardEl.dataset.placement = pos.placement;
      }
      performSimpleMtLookup(cleanWord);
      return;
    }

    // Full Feature Mode requested: If card was currently in Simple MT mode, transition to Full Feature
    if (isCardOpen && cardEl && cardEl.parentNode && cardEl.classList.contains('simple-mt-card')) {
      switchToFullFeatureMode(cleanWord, chosenMode);
      return;
    }

    if (config.persistentWindow && isCardOpen && cardEl && cardEl.parentNode) {
      const activeTab = cardTabs.find(t => t.id === activeCardTabId);
      const isCurrentTabBusy = activeTab ? !!activeTab.isLoading : false;
      const shouldOpenNewTab = config.persistentNewTabOnLoading && isCurrentTabBusy;

      if (shouldOpenNewTab) {
        // OPEN NEW TAB IN PERSISTENT WINDOW WHILE PRIOR IS STILL LOADING
        stopSpeech();
        const newTabId = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const newTab = {
          id: newTabId,
          word: cleanWord,
          mode: chosenMode,
          token: ++activeLookupToken,
          isLoading: true,
          data: null,
          error: null,
          currentDetectedLanguage: '',
          activeView: 'ai',
          externalUrl: '',
          externalName: '',
          chatMessages: []
        };
        cardTabs.push(newTab);
        activeCardTabId = newTab.id;
        currentMode = chosenMode;
        currentSelectionText = cleanWord;

        switchToAiTab();

        const pills = cardEl.querySelectorAll('.mode-pill');
        pills.forEach(p => p.classList.toggle('active', p.dataset.mode === currentMode));

        const cardSearchInput = cardEl.querySelector('#ai-dict-card-search-input');
        if (cardSearchInput && cardSearchInput !== document.activeElement) {
          cardSearchInput.value = cleanWord;
        }
        const cardModeSelect = cardEl.querySelector('#ai-dict-card-search-mode-select');
        if (cardModeSelect) {
          cardModeSelect.value = currentMode;
        }
        syncSearchPlaceholder(currentMode);
        syncCardLanguageRow();
        closeHistoryPanel();

        const cardBody = cardEl.querySelector('#ai-dict-card-body');
        if (cardBody) {
          cardBody.innerHTML = `
            <div class="loading-box">
              <div class="spinner"></div>
              <div style="font-size:12px; font-weight:600;">Generating & Saving to ${escapeHtml(config.activeProfileName || 'Profile')}...</div>
              <div style="font-size:11px; opacity:0.6; margin-top:4px;">"${escapeHtml(cleanWord.length > 50 ? cleanWord.slice(0, 50) + '...' : cleanWord)}"</div>
            </div>
          `;
        }
        const chatDrawer = cardEl.querySelector('#ai-dict-chat-drawer');
        if (chatDrawer) chatDrawer.style.display = 'none';

        renderWordTabsBar();
        performTabLookup(newTab);
        return;
      }

      // IN-PLACE UPDATE FOR PERSISTENT WINDOW (Default behavior: replace current with new search)
      stopSpeech();
      activeLookupToken++; // Invalidate previous in-flight lookup for active tab

      switchToAiTab();
      currentMode = chosenMode;
      currentSelectionText = cleanWord;

      let targetTab = cardTabs.find(t => t.id === activeCardTabId);
      if (!targetTab) {
        targetTab = {
          id: 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          word: cleanWord,
          mode: chosenMode,
          token: activeLookupToken,
          isLoading: true,
          data: null,
          error: null,
          currentDetectedLanguage: '',
          activeView: 'ai',
          externalUrl: '',
          externalName: '',
          chatMessages: []
        };
        cardTabs = [targetTab];
        activeCardTabId = targetTab.id;
      } else {
        targetTab.word = cleanWord;
        targetTab.mode = chosenMode;
        targetTab.token = activeLookupToken;
        targetTab.isLoading = true;
        targetTab.data = null;
        targetTab.error = null;
        targetTab.currentDetectedLanguage = '';
        targetTab.activeView = 'ai';
        targetTab.externalUrl = '';
        targetTab.externalName = '';
        targetTab.chatMessages = [];
      }

      const pills = cardEl.querySelectorAll('.mode-pill');
      pills.forEach(p => p.classList.toggle('active', p.dataset.mode === currentMode));

      const cardSearchInput = cardEl.querySelector('#ai-dict-card-search-input');
      if (cardSearchInput && cardSearchInput !== document.activeElement) {
        cardSearchInput.value = cleanWord;
      }
      const cardModeSelect = cardEl.querySelector('#ai-dict-card-search-mode-select');
      if (cardModeSelect) {
        cardModeSelect.value = currentMode;
      }
      syncSearchPlaceholder(currentMode);
      syncCardLanguageRow();
      closeHistoryPanel();

      const cardBody = cardEl.querySelector('#ai-dict-card-body');
      if (cardBody) {
        cardBody.innerHTML = `
          <div class="loading-box">
            <div class="spinner"></div>
            <div style="font-size:12px; font-weight:600;">Generating & Saving to ${escapeHtml(config.activeProfileName || 'Profile')}...</div>
            <div style="font-size:11px; opacity:0.6; margin-top:4px;">"${escapeHtml(cleanWord.length > 50 ? cleanWord.slice(0, 50) + '...' : cleanWord)}"</div>
          </div>
        `;
      }
      const chatDrawer = cardEl.querySelector('#ai-dict-chat-drawer');
      if (chatDrawer) chatDrawer.style.display = 'none';

      renderWordTabsBar();
      performTabLookup(targetTab);
      return;
    }

    createCardElement(chosenMode);

    const cardWidth = Math.max(360, config.cardWidth || 560);
    const cardHeight = Math.max(280, config.cardHeight || 640);

    const pos = calculateSmartCardPosition(rect, cardWidth, cardHeight);

    cardEl.style.width = `${pos.width}px`;
    cardEl.style.height = `${pos.height}px`;
    cardEl.style.left = `${pos.x}px`;
    cardEl.style.top = `${pos.y}px`;
    cardEl.dataset.placement = pos.placement;

    isCardOpen = true;
    currentMode = chosenMode;
    currentSelectionText = cleanWord;

    const firstTab = {
      id: 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      word: cleanWord,
      mode: chosenMode,
      token: ++activeLookupToken,
      isLoading: true,
      data: null,
      error: null,
      currentDetectedLanguage: '',
      activeView: 'ai',
      externalUrl: '',
      externalName: '',
      chatMessages: []
    };
    cardTabs = [firstTab];
    activeCardTabId = firstTab.id;

    // Sync mode pills
    const pills = cardEl.querySelectorAll('.mode-pill');
    pills.forEach(p => p.classList.toggle('active', p.dataset.mode === currentMode));

    // Update inline search bar
    const cardSearchInput = cardEl.querySelector('#ai-dict-card-search-input');
    if (cardSearchInput && cardSearchInput !== document.activeElement) {
      cardSearchInput.value = cleanWord;
    }
    const cardModeSelect = cardEl.querySelector('#ai-dict-card-search-mode-select');
    if (cardModeSelect) {
      cardModeSelect.value = currentMode;
    }
    syncSearchPlaceholder(currentMode);
    syncCardLanguageRow();
    closeHistoryPanel();
    updatePinButtonUI();
    updateNewTabButtonUI();
    renderWordTabsBar();

    performTabLookup(firstTab);
  }

  // ==========================================================================
  // SIMPLE MACHINE TRANSLATE VIEW (Google Translate Style, Zero Memory)
  // ==========================================================================

  let simpleMtInputDebounceTimer = null;
  let activeMtLookupToken = 0;

  function renderSimpleMtSkeleton() {
    if (!cardEl) return;
    const currentSrc = config.appSettings?.mtSourceLang || '🌐 Auto';
    const currentTgt = config.appSettings?.mtTargetLang || '🇺🇸 EN';

    const srcOptions = SIMPLE_MT_LANGUAGES.map(l =>
      `<option value="${l.code}" ${l.code === currentSrc ? 'selected' : ''}>${l.code} ${l.name}</option>`
    ).join('');

    const tgtOptions = SIMPLE_MT_LANGUAGES.filter(l => !l.code.includes('Auto')).map(l =>
      `<option value="${l.code}" ${l.code === currentTgt ? 'selected' : ''}>${l.code} ${l.name}</option>`
    ).join('');

    cardEl.innerHTML = `
      <div class="card-header simple-mt-header" id="ai-dict-drag-header">
        <div class="header-left simple-mt-header-left">
          <div class="drag-grip" id="ai-dict-drag-grip" title="Drag to move window">
            <svg width="12" height="14" viewBox="0 0 12 16" fill="currentColor">
              <circle cx="3" cy="3" r="1.5"></circle>
              <circle cx="9" cy="3" r="1.5"></circle>
              <circle cx="3" cy="8" r="1.5"></circle>
              <circle cx="9" cy="8" r="1.5"></circle>
              <circle cx="3" cy="13" r="1.5"></circle>
              <circle cx="9" cy="13" r="1.5"></circle>
            </svg>
          </div>

          <div class="simple-mt-lang-capsule">
            <select class="simple-mt-lang-select" id="simple-mt-src-lang" title="Source Language">
              ${srcOptions}
            </select>
            <button type="button" class="simple-mt-swap-btn" id="simple-mt-swap-btn" title="Swap languages">⇄</button>
            <select class="simple-mt-lang-select" id="simple-mt-tgt-lang" title="Target Language">
              ${tgtOptions}
            </select>
          </div>
        </div>

        <div class="header-actions simple-mt-header-actions">
          <button type="button" class="simple-mt-switch-quick-btn" id="simple-mt-header-quick-btn" title="Quick LLM: Run fast ephemeral Ling Flash lookup (No save)">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            <span>⚡ Quick</span>
          </button>
          <button type="button" class="simple-mt-switch-full-btn" id="simple-mt-header-full-btn" title="Full LLM: Full Feature AI Dict (Definitions, Profiles, Chat)">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>
            <span>✨ Full</span>
          </button>

          <button type="button" class="icon-btn ${config.persistentWindow ? 'active-pin' : ''}" id="ai-dict-pin-btn" title="${config.persistentWindow ? 'Persistent Window: ON (Click to unpin)' : 'Persistent Window: OFF (Click to pin & keep open)'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="${config.persistentWindow ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2">
              <path d="M12 17v5"></path>
              <path d="M9 2h6l1 7H8l1-7z"></path>
              <path d="M6 9h12l-1 5H7L6 9z"></path>
            </svg>
          </button>

          <button type="button" class="icon-btn close-btn" id="ai-dict-close-btn" title="Close (Esc)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>

      <div class="simple-mt-body" id="simple-mt-body">
        <div class="simple-mt-box source-box">
          <textarea class="simple-mt-textarea" id="simple-mt-source-input" placeholder="Type or paste text to translate..." rows="2" spellcheck="false"></textarea>
          <div class="simple-mt-box-footer">
            <span class="simple-mt-char-count" id="simple-mt-char-count">0 chars</span>
            <div class="simple-mt-box-actions">
              <button type="button" class="simple-mt-icon-btn" id="simple-mt-clear-btn" title="Clear text">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
              <button type="button" class="simple-mt-icon-btn" id="simple-mt-source-speak-btn" title="Listen source pronunciation">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
              </button>
              <button type="button" class="simple-mt-icon-btn" id="simple-mt-source-copy-btn" title="Copy source text">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
            </div>
          </div>
        </div>

        <div class="simple-mt-box target-box">
          <div class="simple-mt-target-content" id="simple-mt-target-content">
            <textarea class="simple-mt-textarea simple-mt-target-textarea" id="simple-mt-target-input" placeholder="Translation will appear here (editable)..." rows="2" spellcheck="false"></textarea>
          </div>
          <div class="simple-mt-box-footer">
            <span class="simple-mt-model-tag" id="simple-mt-detected-tag">
              <span class="mt-badge-dot"></span>
              <span>Standard 600M (Offline)</span>
            </span>
            <div class="simple-mt-box-actions">
              <button type="button" class="simple-mt-icon-btn" id="simple-mt-regenerate-btn" title="Regenerate translation from source text">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
              </button>
              <button type="button" class="simple-mt-icon-btn" id="simple-mt-target-speak-btn" title="Listen translation pronunciation">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
              </button>
              <button type="button" class="simple-mt-icon-btn copy-btn" id="simple-mt-target-copy-btn" title="Copy translation">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                <span class="copy-label">Copy</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="simple-mt-footer" id="simple-mt-footer">
        <button type="button" class="simple-mt-quick-llm-btn" id="simple-mt-quick-llm-btn" title="Quick LLM: Run fast, ephemeral Ling Flash lookup (No automatic save)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          <span>⚡ Quick LLM (${escapeHtml(config.simpleLlmModel || 'Ling Flash')})</span>
        </button>
        <button type="button" class="simple-mt-return-llm-btn" id="simple-mt-return-llm-btn" title="Full LLM: Switch to Full Feature Mode (Definitions, Grammar, Synonyms, Profiles & AI Chat)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>
          <span>✨ Full LLM</span>
        </button>
      </div>

      <div class="card-resize-handle resize-r" id="ai-dict-resize-r"></div>
      <div class="card-resize-handle resize-b" id="ai-dict-resize-b"></div>
      <div class="card-resize-handle resize-corner" id="ai-dict-resize-corner"></div>
    `;
  }

  function updateSimpleMtCharCount(text) {
    if (!cardEl) return;
    const countEl = cardEl.querySelector('#simple-mt-char-count');
    if (countEl) {
      countEl.textContent = `${(text || '').length} chars`;
    }
  }

  function bindSimpleMtTargetInputListener() {
    if (!cardEl) return;
    const tgtInput = cardEl.querySelector('#simple-mt-target-input');
    if (tgtInput && !tgtInput.dataset.bound) {
      tgtInput.dataset.bound = 'true';
      tgtInput.addEventListener('input', () => {
        if (currentWordData) {
          currentWordData.translated_text = tgtInput.value;
        }
      });
    }
  }

  function setupSimpleMtEventListeners() {
    if (!cardEl) return;

    bindSimpleMtTargetInputListener();

    // Close button
    const closeBtn = cardEl.querySelector('#ai-dict-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeCard);

    // Pin button
    const pinBtn = cardEl.querySelector('#ai-dict-pin-btn');
    if (pinBtn) {
      pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setTabPersistent(!config.persistentWindow);
        updatePinButtonUI();
        showToast(config.persistentWindow ? '📌 Persistent Window ON: Window stays open across lookups' : 'Persistent Window OFF');
      });
    }

    // Switch to Full Feature / Quick LLM mode buttons (header & footer)
    const switchQuickHeaderBtn = cardEl.querySelector('#simple-mt-header-quick-btn');
    if (switchQuickHeaderBtn) {
      switchQuickHeaderBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const srcInput = cardEl.querySelector('#simple-mt-source-input');
        const text = (srcInput ? srcInput.value.trim() : '') || currentSelectionText;
        switchToFullFeatureMode(text, 'simple_llm');
      });
    }

    const switchFullHeaderBtn = cardEl.querySelector('#simple-mt-header-full-btn');
    if (switchFullHeaderBtn) {
      switchFullHeaderBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const srcInput = cardEl.querySelector('#simple-mt-source-input');
        const text = (srcInput ? srcInput.value.trim() : '') || currentSelectionText;
        switchToFullFeatureMode(text, 'search');
      });
    }

    const quickLlmFooterBtn = cardEl.querySelector('#simple-mt-quick-llm-btn');
    if (quickLlmFooterBtn) {
      quickLlmFooterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const srcInput = cardEl.querySelector('#simple-mt-source-input');
        const text = (srcInput ? srcInput.value.trim() : '') || currentSelectionText;
        switchToFullFeatureMode(text, 'simple_llm');
      });
    }

    const returnLlmBtn = cardEl.querySelector('#simple-mt-return-llm-btn');
    if (returnLlmBtn) {
      returnLlmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const srcInput = cardEl.querySelector('#simple-mt-source-input');
        const text = (srcInput ? srcInput.value.trim() : '') || currentSelectionText;
        switchToFullFeatureMode(text, 'search');
      });
    }

    // Language selection
    const srcSelect = cardEl.querySelector('#simple-mt-src-lang');
    if (srcSelect) {
      srcSelect.addEventListener('change', async (e) => {
        e.stopPropagation();
        const newSrc = e.target.value;
        const appSettings = config.appSettings || {};
        appSettings.mtSourceLang = newSrc;
        config.appSettings = appSettings;
        await safeStorageSet({ appSettings });
        callBackend('/api/settings', 'POST', { key: 'mtSourceLang', value: newSrc }).catch(() => {});
        const srcInput = cardEl.querySelector('#simple-mt-source-input');
        if (srcInput && srcInput.value.trim()) {
          performSimpleMtLookup(srcInput.value.trim());
        }
      });
    }

    const tgtSelect = cardEl.querySelector('#simple-mt-tgt-lang');
    if (tgtSelect) {
      tgtSelect.addEventListener('change', async (e) => {
        e.stopPropagation();
        const newTgt = e.target.value;
        const appSettings = config.appSettings || {};
        appSettings.mtTargetLang = newTgt;
        config.appSettings = appSettings;
        await safeStorageSet({ appSettings });
        callBackend('/api/settings', 'POST', { key: 'mtTargetLang', value: newTgt }).catch(() => {});
        const srcInput = cardEl.querySelector('#simple-mt-source-input');
        if (srcInput && srcInput.value.trim()) {
          performSimpleMtLookup(srcInput.value.trim());
        }
      });
    }

    const swapBtn = cardEl.querySelector('#simple-mt-swap-btn');
    if (swapBtn) {
      swapBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const curSrc = srcSelect ? srcSelect.value : '🌐 Auto';
        const curTgt = tgtSelect ? tgtSelect.value : '🇺🇸 EN';
        let newSrc = curTgt;
        let newTgt = curSrc;
        if (curSrc.includes('Auto')) {
          const detected = currentWordData?.detected_source;
          const match = detected && SIMPLE_MT_LANGUAGES.find(l => !l.code.includes('Auto') && (l.name.toLowerCase().includes(detected.toLowerCase()) || detected.toLowerCase().includes(l.name.toLowerCase())));
          newTgt = match ? match.code : '🇺🇸 EN';
        }
        if (srcSelect) srcSelect.value = newSrc;
        if (tgtSelect) tgtSelect.value = newTgt;
        const appSettings = config.appSettings || {};
        appSettings.mtSourceLang = newSrc;
        appSettings.mtTargetLang = newTgt;
        config.appSettings = appSettings;
        await safeStorageSet({ appSettings });
        callBackend('/api/settings', 'POST', { key: 'mtSourceLang', value: newSrc }).catch(() => {});
        callBackend('/api/settings', 'POST', { key: 'mtTargetLang', value: newTgt }).catch(() => {});
        const srcInput = cardEl.querySelector('#simple-mt-source-input');
        if (srcInput && srcInput.value.trim()) {
          performSimpleMtLookup(srcInput.value.trim());
        }
      });
    }

    // Source textarea
    const srcInput = cardEl.querySelector('#simple-mt-source-input');
    if (srcInput) {
      srcInput.addEventListener('mousedown', (e) => e.stopPropagation());
      srcInput.addEventListener('input', () => {
        const val = srcInput.value;
        updateSimpleMtCharCount(val);
        if (simpleMtInputDebounceTimer) clearTimeout(simpleMtInputDebounceTimer);
        if (!val.trim()) {
          const tgtContent = cardEl.querySelector('#simple-mt-target-content');
          if (tgtContent) {
            tgtContent.innerHTML = `<textarea class="simple-mt-textarea simple-mt-target-textarea" id="simple-mt-target-input" placeholder="Translation will appear here (editable)..." rows="2" spellcheck="false"></textarea>`;
            bindSimpleMtTargetInputListener();
          }
          if (currentWordData) currentWordData.translated_text = '';
          return;
        }
        simpleMtInputDebounceTimer = setTimeout(() => {
          performSimpleMtLookup(val.trim());
        }, 450);
      });

      srcInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (simpleMtInputDebounceTimer) clearTimeout(simpleMtInputDebounceTimer);
          const val = srcInput.value.trim();
          if (val) performSimpleMtLookup(val);
        } else if (e.key === 'Escape') {
          srcInput.blur();
        }
      });
    }

    // Clear button
    const clearBtn = cardEl.querySelector('#simple-mt-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (srcInput) {
          srcInput.value = '';
          srcInput.focus();
        }
        updateSimpleMtCharCount('');
        const tgtContent = cardEl.querySelector('#simple-mt-target-content');
        if (tgtContent) {
          tgtContent.innerHTML = `<textarea class="simple-mt-textarea simple-mt-target-textarea" id="simple-mt-target-input" placeholder="Translation will appear here (editable)..." rows="2" spellcheck="false"></textarea>`;
          bindSimpleMtTargetInputListener();
        }
        if (currentWordData) currentWordData.translated_text = '';
      });
    }

    // Source Listen / TTS button
    const srcSpeakBtn = cardEl.querySelector('#simple-mt-source-speak-btn');
    if (srcSpeakBtn) {
      srcSpeakBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = srcInput ? srcInput.value.trim() : currentSelectionText;
        if (!text) return;
        const curSrc = srcSelect ? srcSelect.value : '🌐 Auto';
        speakWord(text, 'pronounce', curSrc, srcSpeakBtn);
      });
    }

    // Source Copy button
    const srcCopyBtn = cardEl.querySelector('#simple-mt-source-copy-btn');
    if (srcCopyBtn) {
      srcCopyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = srcInput ? srcInput.value.trim() : currentSelectionText;
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
          srcCopyBtn.classList.add('copied');
          setTimeout(() => srcCopyBtn.classList.remove('copied'), 1200);
        }).catch(() => {});
      });
    }

    // Regenerate button
    const regenBtn = cardEl.querySelector('#simple-mt-regenerate-btn');
    if (regenBtn) {
      regenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = srcInput ? srcInput.value.trim() : currentSelectionText;
        if (text) {
          performSimpleMtLookup(text);
        }
      });
    }

    // Target Listen / TTS button
    const tgtSpeakBtn = cardEl.querySelector('#simple-mt-target-speak-btn');
    if (tgtSpeakBtn) {
      tgtSpeakBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tgtInput = cardEl.querySelector('#simple-mt-target-input');
        const text = tgtInput ? tgtInput.value.trim() : (currentWordData?.translated_text || '');
        if (!text) return;
        const curTgt = tgtSelect ? tgtSelect.value : '🇺🇸 EN';
        speakWord(text, 'pronounce', curTgt, tgtSpeakBtn);
      });
    }

    // Target Copy button
    const tgtCopyBtn = cardEl.querySelector('#simple-mt-target-copy-btn');
    if (tgtCopyBtn) {
      tgtCopyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tgtInput = cardEl.querySelector('#simple-mt-target-input');
        const text = tgtInput ? tgtInput.value.trim() : (currentWordData?.translated_text || '');
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
          tgtCopyBtn.classList.add('copied');
          const label = tgtCopyBtn.querySelector('.copy-label');
          if (label) label.textContent = 'Copied!';
          setTimeout(() => {
            tgtCopyBtn.classList.remove('copied');
            if (label) label.textContent = 'Copy';
          }, 1500);
        }).catch(() => {});
      });
    }
  }

  async function performSimpleMtLookup(text) {
    if (!text || !text.trim() || !cardEl) return;
    const thisToken = ++activeMtLookupToken;
    const cleanText = text.trim();
    currentSelectionText = cleanText;

    const srcSelect = cardEl.querySelector('#simple-mt-src-lang');
    const tgtSelect = cardEl.querySelector('#simple-mt-tgt-lang');
    const srcLang = srcSelect ? srcSelect.value : (config.appSettings?.mtSourceLang || '🌐 Auto');
    const tgtLang = tgtSelect ? tgtSelect.value : (config.appSettings?.mtTargetLang || '🇺🇸 EN');

    const targetContent = cardEl.querySelector('#simple-mt-target-content');
    const modelTag = cardEl.querySelector('#simple-mt-detected-tag');
    if (targetContent) {
      targetContent.innerHTML = `
        <div class="simple-mt-loading">
          <div class="spinner"></div>
          <span>Translating offline (NLLB-200 600M)...</span>
        </div>
      `;
    }

    try {
      const res = await callBackend('/api/mt/translate', 'POST', {
        text: cleanText,
        source_lang: srcLang,
        target_lang: tgtLang,
        level: 'standard',
        save_history: false // ZERO MEMORY: Never save default MT lookups to SQLite
      });

      if (thisToken !== activeMtLookupToken || !isCardOpen || !cardEl || currentMode !== 'machine_translation' || !cardEl.classList.contains('simple-mt-card')) {
        return;
      }

      currentWordData = res;
      const translatedText = res.translated_text || '';
      if (targetContent) {
        targetContent.innerHTML = `
          <textarea class="simple-mt-textarea simple-mt-target-textarea" id="simple-mt-target-input" placeholder="Translation will appear here (editable)..." rows="2" spellcheck="false">${escapeHtml(translatedText)}</textarea>
        `;
        bindSimpleMtTargetInputListener();
      }
      if (modelTag) {
        const detected = res.detected_source ? `Detected: ${res.detected_source} • ` : '';
        modelTag.innerHTML = `<span class="mt-badge-dot"></span><span>${escapeHtml(detected)}Standard 600M (Offline)</span>`;
      }
    } catch (err) {
      if (thisToken !== activeMtLookupToken || !isCardOpen || !cardEl || currentMode !== 'machine_translation' || !cardEl.classList.contains('simple-mt-card')) {
        return;
      }
      if (targetContent) {
        targetContent.innerHTML = `
          <div class="simple-mt-error">
            <span style="color:#ef4444;">⚠️ Translation failed: ${escapeHtml(err.message || 'Server error')}</span>
            <button type="button" class="simple-mt-retry-btn" id="simple-mt-retry-btn">Retry</button>
          </div>
        `;
        const retryBtn = targetContent.querySelector('#simple-mt-retry-btn');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => performSimpleMtLookup(cleanText));
        }
      }
    }
  }

  function switchToFullFeatureMode(term, mode = 'search') {
    const textToLookUp = term || currentSelectionText;
    currentMode = mode;
    activeMtLookupToken++; // Invalidate any in-flight MT lookup!
    config.defaultMode = mode;
    safeStorageSet({ defaultMode: mode });

    createCardElement(mode);

    const cardWidth = Math.max(360, config.cardWidth || 560);
    const cardHeight = Math.max(280, config.cardHeight || 640);
    cardEl.style.width = `${cardWidth}px`;
    cardEl.style.height = `${cardHeight}px`;

    isCardOpen = true;
    updatePinButtonUI();
    updateNewTabButtonUI();

    if (textToLookUp) {
      openCardAtRect(lastSelectionRect, textToLookUp, mode);
    } else {
      openPersistentEmptyCard(mode);
    }
  }

  function switchToSimpleMtMode(term, rect = null) {
    const textToTranslate = term || currentSelectionText;
    currentMode = 'machine_translation';
    activeLookupToken++; // Invalidate any in-flight LLM lookup!
    config.defaultMode = 'machine_translation';
    safeStorageSet({ defaultMode: 'machine_translation' });

    createCardElement('machine_translation');

    const cardWidth = Math.min(Math.round(window.innerWidth * 0.95), Math.max(360, config.simpleMtWidth || 480));
    const cardHeight = Math.min(Math.round(window.innerHeight * 0.9), Math.max(260, config.simpleMtHeight || 360));
    const effectiveRect = rect || lastSelectionRect;
    const pos = calculateSmartCardPosition(effectiveRect, cardWidth, cardHeight);

    cardEl.style.width = `${pos.width}px`;
    cardEl.style.height = `${pos.height}px`;
    cardEl.style.left = `${pos.x}px`;
    cardEl.style.top = `${pos.y}px`;
    cardEl.dataset.placement = pos.placement;

    isCardOpen = true;
    updatePinButtonUI();

    if (textToTranslate) {
      const srcInput = cardEl.querySelector('#simple-mt-source-input');
      if (srcInput) srcInput.value = textToTranslate;
      updateSimpleMtCharCount(textToTranslate);
      performSimpleMtLookup(textToTranslate);
    }
  }

  function createCardElement(mode = currentMode) {
    syncHostContainerParent();
    if (!shadowRoot) return;

    // Purge ALL existing cards from shadowRoot to ensure strict mutual exclusivity
    const existingCards = shadowRoot.querySelectorAll('.ai-dict-card, .simple-mt-card, .ai-dict-secondary-card');
    existingCards.forEach(c => c.remove());
    cardEl = null;
    secondaryCardEl = null;
    isSecondaryCardOpen = false;

    cardEl = document.createElement('div');
    if (mode === 'machine_translation') {
      cardEl.className = `ai-dict-card theme-${config.theme || 'tokyonight'} simple-mt-card`;
      renderSimpleMtSkeleton();
      shadowRoot.appendChild(cardEl);
      setupSimpleMtEventListeners();
    } else {
      cardEl.className = `ai-dict-card theme-${config.theme || 'tokyonight'}`;
      renderCardSkeleton();
      shadowRoot.appendChild(cardEl);
    }

    setupDraggable(cardEl);
    setupResizable(cardEl);
    setupPersistentCardWordSelection(cardEl);
  }

  function closeCard() {
    closeSecondaryCard();
    stopSpeech();
    activeLookupToken++; // Invalidate any in-flight lookup callbacks so they never render into subsequent cards
    activeMtLookupToken++; // Invalidate any in-flight MT lookups
    cardTabs = [];
    activeCardTabId = null;
    const iframe = cardEl?.querySelector('#ai-dict-external-frame');
    if (iframe && iframe.parentNode) {
      iframe.src = 'about:blank';
      iframe.parentNode.removeChild(iframe);
    }
    if (shadowRoot) {
      const cards = shadowRoot.querySelectorAll('.ai-dict-card, .simple-mt-card, .ai-dict-secondary-card');
      cards.forEach(c => c.remove());
    }
    cardEl = null;
    isCardOpen = false;
    isHistoryOpen = false;
    currentWordData = null;
    currentSelectionText = '';
  }

  function renderCardSkeleton() {
    const profileOptions = profiles.length > 0 
      ? profiles.map(p => `<option value="${p.id}" ${p.id === config.activeProfileId ? 'selected' : ''}>👤 ${p.name}</option>`).join('')
      : `<option value="${config.activeProfileId}">👤 ${config.activeProfileName || 'Profile'}</option>`;

    cardEl.innerHTML = `
      <div class="card-header" id="ai-dict-drag-header">
        <div class="header-left">
          <div class="drag-grip" id="ai-dict-drag-grip" title="Drag to move window">
            <svg width="12" height="14" viewBox="0 0 12 16" fill="currentColor">
              <circle cx="3" cy="3" r="1.5"></circle>
              <circle cx="9" cy="3" r="1.5"></circle>
              <circle cx="3" cy="8" r="1.5"></circle>
              <circle cx="9" cy="8" r="1.5"></circle>
              <circle cx="3" cy="13" r="1.5"></circle>
              <circle cx="9" cy="13" r="1.5"></circle>
            </svg>
          </div>
          <div class="header-title-badge">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
            <span>AI Dict</span>
          </div>

          <select class="profile-select" id="ai-dict-profile-select" title="Active Profile (Uses profile prompt & model, saves here)">
            ${profileOptions}
          </select>

          <div class="mode-pills">
            <button type="button" class="mode-pill ${currentMode === 'machine_translation' ? 'active' : ''}" data-mode="machine_translation" title="Switch to Simple MT (Google Translate style, no memory)">⚡ Simple MT</button>
            <button type="button" class="mode-pill ${currentMode === 'simple_llm' ? 'active' : ''}" data-mode="simple_llm" title="⚡ Simple LLM (Ling Flash • Lightweight, save on click)">⚡ Ling Flash</button>
            <button type="button" class="mode-pill ${currentMode === 'search' ? 'active' : ''}" data-mode="search">Word</button>
            <button type="button" class="mode-pill ${currentMode === 'explain' ? 'active' : ''}" data-mode="explain">Explain</button>
            <button type="button" class="mode-pill ${currentMode === 'translation' ? 'active' : ''}" data-mode="translation">Translate</button>
            <button type="button" class="mode-pill ${currentMode === 'compare' ? 'active' : ''}" data-mode="compare">Compare</button>
            <button type="button" class="mode-pill ${currentMode === 'correction' ? 'active' : ''}" data-mode="correction">Correct</button>
          </div>
        </div>

        <div class="header-actions">
          <!-- Persistent Window Pin Button -->
          <button type="button" class="icon-btn ${config.persistentWindow ? 'active-pin' : ''}" id="ai-dict-pin-btn" title="${config.persistentWindow ? 'Persistent Window: ON (Click to unpin)' : 'Persistent Window: OFF (Click to pin & keep open)'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="${config.persistentWindow ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2">
              <path d="M12 17v5"></path>
              <path d="M9 2h6l1 7H8l1-7z"></path>
              <path d="M6 9h12l-1 5H7L6 9z"></path>
            </svg>
          </button>

          <!-- Persistent New Tab Mode Toggle Button -->
          <button type="button" class="icon-btn ${config.persistentNewTabOnLoading ? 'active-newtab' : ''}" id="ai-dict-newtab-toggle-btn" title="${config.persistentNewTabOnLoading ? 'New Tab on Loading: ON (Click to switch to replace mode)' : 'New Tab on Loading: OFF (Click to open new tab when searching while loading)'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </button>

          <!-- Quick History Button -->
          <button type="button" class="icon-btn" id="ai-dict-history-btn" title="Recent History (Word, Explain, Translate, Compare, Correct)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </button>

          <!-- Quick Pause Menu Dropdown -->
          <div class="pause-dropdown-container">
            <button type="button" class="icon-btn" id="ai-dict-pause-btn" title="Pause Extension...">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
            </button>
            <div class="pause-menu" id="ai-dict-pause-menu">
              <div class="pause-menu-title">Quick Pause Extension</div>
              <button type="button" class="pause-opt" data-pause="15m">⏸ Pause for 15 minutes</button>
              <button type="button" class="pause-opt" data-pause="1h">⏸ Pause for 1 hour</button>
              <button type="button" class="pause-opt" data-pause="24h">⏸ Pause for 24 hours</button>
              <div class="pause-menu-divider"></div>
              <button type="button" class="pause-opt" id="ai-dict-toggle-persist-menu-opt">
                ${config.persistentWindow ? '📌 Persistent Window: ON (Keep Open)' : '📌 Persistent Window: OFF'}
              </button>
              <button type="button" class="pause-opt" id="ai-dict-toggle-newtab-menu-opt">
                ${config.persistentNewTabOnLoading ? '📑 New Tab While Loading: ON (Branch)' : '📑 New Tab While Loading: OFF (Replace)'}
              </button>
              <button type="button" class="pause-opt text-red" id="ai-dict-pause-site-opt">🚫 Disable on this domain</button>
              <div class="pause-menu-divider"></div>
              <div class="pause-menu-title">Card Placement</div>
              <button type="button" class="pause-opt placement-opt ${config.cardPlacement === 'auto' || !config.cardPlacement ? 'active' : ''}" data-placement="auto">✨ Smart Auto (Never hide word)</button>
              <button type="button" class="pause-opt placement-opt ${config.cardPlacement === 'side' ? 'active' : ''}" data-placement="side">👉 Next to Word (Side)</button>
              <button type="button" class="pause-opt placement-opt ${config.cardPlacement === 'below' ? 'active' : ''}" data-placement="below">👇 Downward (Below)</button>
              <button type="button" class="pause-opt placement-opt ${config.cardPlacement === 'above' ? 'active' : ''}" data-placement="above">👆 Upward (Above)</button>
            </div>
          </div>

          <button type="button" class="icon-btn" id="ai-dict-open-app-btn" title="Open in AI Dict App">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          </button>
          <button type="button" class="icon-btn close-btn" id="ai-dict-close-btn" title="Close (Esc)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>

      <!-- Word Tabs Bar (Concurrent Word Tabs in Persistent Window) -->
      <div class="card-word-tabs-bar" id="ai-dict-word-tabs-bar" style="display:none;">
        <div class="word-tabs-scroll-list" id="ai-dict-word-tabs-list"></div>
        <button type="button" class="word-tab-add-btn" id="ai-dict-word-tab-add-btn" title="Open new tab">+</button>
      </div>

      <!-- Top Tabs Strip (Definer Tab System: AI Output vs External Dictionaries) -->
      <div class="card-tabs-bar" id="ai-dict-tabs-bar">
        <button type="button" class="card-tab-btn active" id="ai-dict-tab-ai">
          <span class="tab-icon">✦</span>
          <span>AI Output</span>
        </button>
        <div class="external-tabs-container" id="ai-dict-external-tabs"></div>
      </div>

      <!-- Quick Inline Search Bar (Fast word entry & mode switching) -->
      <div class="card-quick-search-bar" id="ai-dict-card-search-bar">
        <form class="card-search-form" id="ai-dict-card-search-form">
          <div class="card-search-group">
            <select class="card-search-mode-select" id="ai-dict-card-search-mode-select" title="Choose lookup mode">
              <option value="simple_llm" ${currentMode === 'simple_llm' ? 'selected' : ''}>⚡ Ling Flash</option>
              <option value="search" ${currentMode === 'search' ? 'selected' : ''}>🔍 Word</option>
              <option value="explain" ${currentMode === 'explain' ? 'selected' : ''}>📖 Explain</option>
              <option value="translation" ${currentMode === 'translation' ? 'selected' : ''}>🌐 Translate</option>
              <option value="compare" ${currentMode === 'compare' ? 'selected' : ''}>⚖️ Compare</option>
              <option value="correction" ${currentMode === 'correction' ? 'selected' : ''}>✍️ Correct</option>
            </select>
            <input
              type="text"
              class="card-search-input"
              id="ai-dict-card-search-input"
              value="${escapeHtml(currentSelectionText || '')}"
              placeholder="${currentMode === 'explain' ? 'Type phrase or sentence to explain...' : currentMode === 'translation' ? 'Type text to translate...' : currentMode === 'correction' ? 'Type text to correct / translate...' : currentMode === 'compare' ? 'Type words to compare (e.g. affect, effect)...' : currentMode === 'simple_llm' ? 'Type word or text for Ling Flash (Not saved)...' : 'Type word to define & save...'}"
              autocomplete="off"
              spellcheck="false"
            />
            <button type="submit" class="card-search-submit-btn" id="ai-dict-card-search-submit-btn" title="Lookup & Save (Enter)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
            <button type="button" class="card-search-newtab-btn ${config.persistentNewTabOnLoading ? 'active-newtab' : ''}" id="ai-dict-card-search-newtab-btn" title="${config.persistentNewTabOnLoading ? 'New tab if loading: ON (Click to switch to replace mode)' : 'New tab if loading: OFF (Click to open new tab when searching while loading)'}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <rect x="3" y="3" width="13" height="13" rx="2"></rect>
                <path d="M9 21h10a2 2 0 0 0 2-2V9"></path>
              </svg>
            </button>
            <button type="button" class="card-search-history-btn" id="ai-dict-card-search-history-btn" title="Recent History">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </button>
          </div>
          <!-- Language Capsule row for LLM modes -->
          <div class="card-lang-row ${!['search', 'explain', 'translation', 'compare', 'correction', 'simple_llm'].includes(currentMode) ? 'hidden' : ''}" id="ai-dict-card-lang-row" style="${['search', 'explain', 'translation', 'compare', 'correction', 'simple_llm'].includes(currentMode) ? 'display:flex !important;' : 'display:none !important;'}">
            <button type="button" class="lang-modetype-btn" id="ai-dict-card-modetype-btn" style="${currentMode === 'correction' ? 'display:inline-flex;' : 'display:none;'}" title="Toggle between Correction Only and Correction + Translation">
              <span id="ai-dict-card-modetype-label">Correction + Translation</span>
            </button>
            <div class="lang-select-group" id="ai-dict-card-lang-selectors" style="display:inline-flex; align-items:center; gap:4px;">
              <select class="lang-mini-select" id="ai-dict-card-src-lang" title="Source Language"></select>
              <button type="button" class="lang-mini-swap-btn" id="ai-dict-card-swap-lang-btn" title="Swap languages">⇄</button>
              <select class="lang-mini-select" id="ai-dict-card-tgt-lang" title="Target Language"></select>
            </div>
          </div>
        </form>
      </div>

      <!-- History Drawer Panel -->
      <div class="card-history-panel" id="ai-dict-history-panel" style="display:none !important;">
        <div class="history-panel-header">
          <div class="history-panel-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            <span>Recent History</span>
            <span class="history-profile-badge" id="ai-dict-history-profile-badge">${escapeHtml(config.activeProfileName || 'Profile')}</span>
          </div>
          <div class="history-panel-actions">
            <button type="button" class="icon-btn" id="ai-dict-history-refresh-btn" title="Refresh">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            </button>
            <button type="button" class="icon-btn" id="ai-dict-history-close-btn" title="Close History">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>

        <div class="history-mode-tabs" id="ai-dict-history-mode-tabs">
          <button type="button" class="history-mode-pill ${currentMode === 'machine_translation' ? 'active' : ''}" data-mode="machine_translation">⚡ MT</button>
          <button type="button" class="history-mode-pill ${currentMode === 'search' ? 'active' : ''}" data-mode="search">Word</button>
          <button type="button" class="history-mode-pill ${currentMode === 'explain' ? 'active' : ''}" data-mode="explain">Explain</button>
          <button type="button" class="history-mode-pill ${currentMode === 'translation' ? 'active' : ''}" data-mode="translation">Translate</button>
          <button type="button" class="history-mode-pill ${currentMode === 'compare' ? 'active' : ''}" data-mode="compare">Compare</button>
          <button type="button" class="history-mode-pill ${currentMode === 'correction' ? 'active' : ''}" data-mode="correction">Correct</button>
        </div>

        <div class="history-filter-row">
          <div class="history-filter-box">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input type="text" class="history-filter-input" id="ai-dict-history-filter-input" placeholder="Filter history items..." autocomplete="off" spellcheck="false" />
          </div>
        </div>

        <div class="history-items-list" id="ai-dict-history-items-list">
          <div class="history-loading"><div class="spinner"></div><span>Loading history...</span></div>
        </div>

        <div class="history-panel-footer">
          <span class="history-items-count" id="ai-dict-history-count">0 items</span>
          <button type="button" class="history-open-web-link" id="ai-dict-history-open-web-btn" title="Open full history in AI Dict App">
            <span>Open in Web App</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          </button>
        </div>
      </div>

      <!-- View 1: AI Output View (Default active view, full height, NO bottom dictionary) -->
      <div class="card-view-ai" id="ai-dict-ai-view">
        <div class="card-body" id="ai-dict-card-body">
          <div class="loading-box">
            <div class="spinner"></div>
            <div style="font-size:12px; font-weight:600;">Generating & Saving to ${escapeHtml(config.activeProfileName || 'Profile')}...</div>
          </div>
        </div>

        <div class="chat-drawer" id="ai-dict-chat-drawer" style="display:none;">
          <form class="chat-input-row" id="ai-dict-chat-form">
            <input type="text" class="chat-input-box" id="ai-dict-chat-input" placeholder="Ask follow-up question..." />
            <button type="submit" class="chat-send-btn">Ask</button>
          </form>
        </div>
      </div>

      <!-- View 2: Embedded External Dictionary View (Only shown when user clicks an external tab) -->
      <div class="card-view-external" id="ai-dict-external-view" style="display:none;">
        <div class="external-nav-bar">
          <button type="button" class="back-to-ai-btn" id="ai-dict-back-to-ai-btn" title="Return to AI Output">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
            <span>Back to AI Output</span>
          </button>
          <div class="external-site-title" id="ai-dict-external-title">Dictionary</div>
          <div class="external-nav-actions">
            <button type="button" class="icon-btn" id="ai-dict-external-newtab-btn" title="Open this dictionary in a new browser tab">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            </button>
          </div>
        </div>

        <div class="external-iframe-wrapper" id="ai-dict-iframe-container">
          <div class="external-iframe-loader" id="ai-dict-iframe-loader" style="display:none;">
            <div class="spinner"></div>
            <span>Loading dictionary...</span>
          </div>
        </div>
      </div>

      <!-- Resizing Handles (Right, Bottom, Corner) -->
      <div class="resize-handle-r" id="ai-dict-resize-r"></div>
      <div class="resize-handle-b" id="ai-dict-resize-b"></div>
      <div class="resize-handle-corner" id="ai-dict-resize-corner"></div>
    `;

    // Header buttons
    const closeBtn = cardEl.querySelector('#ai-dict-close-btn');
    closeBtn.addEventListener('click', closeCard);

    // Pause menu dropdown
    const pauseBtn = cardEl.querySelector('#ai-dict-pause-btn');
    const pauseMenu = cardEl.querySelector('#ai-dict-pause-menu');
    if (pauseBtn && pauseMenu) {
      pauseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        pauseMenu.classList.toggle('open');
      });

      const pauseOpts = pauseMenu.querySelectorAll('.pause-opt[data-pause]');
      pauseOpts.forEach(opt => {
        opt.addEventListener('click', async (e) => {
          e.stopPropagation();
          const dur = opt.dataset.pause;
          let ms = 0;
          let label = '';
          if (dur === '15m') { ms = 15 * 60 * 1000; label = '15 minutes'; }
          else if (dur === '1h') { ms = 60 * 60 * 1000; label = '1 hour'; }
          else if (dur === '24h') { ms = 24 * 60 * 60 * 1000; label = '24 hours'; }

          config.isPaused = true;
          config.pauseUntil = Date.now() + ms;
          await safeStorageSet({ isPaused: true, pauseUntil: config.pauseUntil });
          closeCard();
          showToast(`⏸ AI Dict paused for ${label}. Resume anytime from extension popup.`);
        });
      });

      const pauseSiteOpt = pauseMenu.querySelector('#ai-dict-pause-site-opt');
      if (pauseSiteOpt) {
        const host = window.location.hostname;
        pauseSiteOpt.textContent = `🚫 Disable on ${host}`;
        pauseSiteOpt.addEventListener('click', async (e) => {
          e.stopPropagation();
          const currentList = config.blacklist || [];
          if (!currentList.includes(host)) {
            currentList.push(host);
            config.blacklist = currentList;
            await safeStorageSet({ blacklist: currentList });
          }
          closeCard();
          showToast(`🚫 AI Dict disabled on ${host}. Re-enable in settings.`);
        });
      }

      // Card Placement selection options
      const placementOpts = pauseMenu.querySelectorAll('.placement-opt[data-placement]');
      placementOpts.forEach(opt => {
        opt.addEventListener('click', async (e) => {
          e.stopPropagation();
          const p = opt.dataset.placement;
          config.cardPlacement = p;
          await safeStorageSet({ cardPlacement: p });
          placementOpts.forEach(o => o.classList.toggle('active', o.dataset.placement === p));
          pauseMenu.classList.remove('open');
          const pLabel = p === 'auto' ? 'Smart Auto' : p === 'side' ? 'Next to Word (Side)' : p === 'below' ? 'Downward (Below)' : 'Upward (Above)';
          showToast(`Card placement: ${pLabel}`);
          if (lastSelectionRect) {
            const savedW = parseInt(localStorage.getItem('ai_dict_card_w'), 10);
            const savedH = parseInt(localStorage.getItem('ai_dict_card_h'), 10);
            const targetW = (!isNaN(savedW) && savedW >= 320) ? savedW : (cardEl.offsetWidth || 560);
            const targetH = (!isNaN(savedH) && savedH >= 240) ? savedH : (cardEl.offsetHeight || 640);
            const pos = calculateSmartCardPosition(lastSelectionRect, targetW, targetH);
            cardEl.style.left = `${pos.x}px`;
            cardEl.style.top = `${pos.y}px`;
            cardEl.style.width = `${pos.width}px`;
            cardEl.style.height = `${pos.height}px`;
            cardEl.dataset.placement = pos.placement;
          }
        });
      });

      cardEl.addEventListener('click', (e) => {
        if (!e.target.closest('.pause-dropdown-container')) {
          pauseMenu.classList.remove('open');
        }
      });
    }

    const openAppBtn = cardEl.querySelector('#ai-dict-open-app-btn');
    openAppBtn.addEventListener('click', () => {
      safeSendMessage({ action: 'OPEN_APP' });
    });

    // Mermaid code block copy handler
    cardEl.addEventListener('click', (e) => {
      const copyMermaidBtn = e.target.closest('.ai-dict-mermaid-copy-btn');
      if (copyMermaidBtn) {
        e.stopPropagation();
        const code = copyMermaidBtn.dataset.code || '';
        navigator.clipboard.writeText(code).then(() => {
          const span = copyMermaidBtn.querySelector('span');
          if (span) span.textContent = 'Copied!';
          setTimeout(() => {
            if (span) span.textContent = 'Copy Code';
          }, 2000);
        }).catch(() => {});
      }
    });

    // Tab buttons
    const tabAiBtn = cardEl.querySelector('#ai-dict-tab-ai');
    if (tabAiBtn) {
      tabAiBtn.addEventListener('click', switchToAiTab);
    }

    const backToAiBtn = cardEl.querySelector('#ai-dict-back-to-ai-btn');
    if (backToAiBtn) {
      backToAiBtn.addEventListener('click', switchToAiTab);
    }

    // Open External in Browser Tab button
    const extNewTabBtn = cardEl.querySelector('#ai-dict-external-newtab-btn');
    if (extNewTabBtn) {
      extNewTabBtn.addEventListener('click', () => {
        if (currentExternalUrl) {
          safeSendMessage({
            action: 'OPEN_EXTERNAL',
            url: currentExternalUrl,
            inBackground: false
          });
        }
      });
    }

    // Profile selector inside card header
    const profileSelect = cardEl.querySelector('#ai-dict-profile-select');
    profileSelect.addEventListener('change', (e) => {
      const newId = parseInt(e.target.value);
      config.activeProfileId = newId;
      const found = profiles.find(p => p.id === newId);
      if (found) config.activeProfileName = found.name;
      safeStorageSet({ activeProfileId: newId, activeProfileName: config.activeProfileName });
      cachedHistoryData = { search: null, explain: null, translation: null, compare: null, correction: null };
      if (isHistoryOpen) {
        const badge = cardEl.querySelector('#ai-dict-history-profile-badge');
        if (badge) badge.textContent = config.activeProfileName || 'Profile';
        loadHistoryItems(activeHistoryMode, true);
      }
      syncCardLanguageRow();
      performLookup(currentSelectionText);
    });

    // Inline search bar controls
    const cardSearchForm = cardEl.querySelector('#ai-dict-card-search-form');
    const cardSearchInput = cardEl.querySelector('#ai-dict-card-search-input');
    const cardModeSelect = cardEl.querySelector('#ai-dict-card-search-mode-select');

    // Mode pills in header
    const pills = cardEl.querySelectorAll('.mode-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        const targetMode = pill.dataset.mode;
        if (targetMode === 'machine_translation') {
          switchToSimpleMtMode(currentSelectionText || (cardSearchInput ? cardSearchInput.value.trim() : ''), lastSelectionRect);
          return;
        }
        currentMode = targetMode;
        config.defaultMode = targetMode;
        safeStorageSet({ defaultMode: targetMode });
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        if (cardModeSelect) cardModeSelect.value = currentMode;
        syncSearchPlaceholder(currentMode);
        syncCardLanguageRow();
        performLookup(currentSelectionText);
      });
    });

    // Inline mode select in search bar
    if (cardModeSelect) {
      cardModeSelect.addEventListener('change', () => {
        const targetMode = cardModeSelect.value;
        if (targetMode === 'machine_translation') {
          switchToSimpleMtMode(currentSelectionText || (cardSearchInput ? cardSearchInput.value.trim() : ''), lastSelectionRect);
          return;
        }
        currentMode = targetMode;
        config.defaultMode = targetMode;
        safeStorageSet({ defaultMode: targetMode });
        pills.forEach(p => p.classList.toggle('active', p.dataset.mode === currentMode));
        syncSearchPlaceholder(currentMode);
        syncCardLanguageRow();
        if (cardSearchInput) cardSearchInput.focus();
      });
    }

    // Inline search input interaction
    if (cardSearchInput) {
      cardSearchInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          cardSearchInput.blur();
        }
      });
      cardSearchInput.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
    }

    // Inline search form submit (fast entry in floating window)
    if (cardSearchForm) {
      cardSearchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = cardSearchInput ? cardSearchInput.value.trim() : '';
        if (!query) return;
        const chosenMode = cardModeSelect ? cardModeSelect.value : currentMode;
        openCardAtRect(null, query, chosenMode);
      });
    }

    // Inline Language Row Controls (Translation & Correction)
    const cardModetypeBtn = cardEl.querySelector('#ai-dict-card-modetype-btn');
    if (cardModetypeBtn) {
      cardModetypeBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pid = config.activeProfileId || 1;
        const appSettings = config.appSettings || {};
        const curType = appSettings[`correctionModeType_${pid}`] || 'both';
        const newType = curType === 'both' ? 'correction_only' : 'both';
        appSettings[`correctionModeType_${pid}`] = newType;
        config.appSettings = appSettings;
        await safeStorageSet({ appSettings });
        callBackend('/api/settings', 'POST', { key: `correctionModeType_${pid}`, value: newType }).catch(() => {});
        syncCardLanguageRow();
      });
    }

    const cardSrcLangSelect = cardEl.querySelector('#ai-dict-card-src-lang');
    if (cardSrcLangSelect) {
      cardSrcLangSelect.addEventListener('change', async (e) => {
        e.stopPropagation();
        const pid = config.activeProfileId || 1;
        const appSettings = config.appSettings || {};
        const key = `${currentMode}SourceLang_${pid}`;
        appSettings[key] = e.target.value;
        if (currentMode === 'search') {
          appSettings['SEARCH_SOURCE_LANG'] = e.target.value;
        }
        config.appSettings = appSettings;
        await safeStorageSet({ appSettings });
        callBackend('/api/settings', 'POST', { key, value: e.target.value }).catch(() => {});
        if (currentMode === 'search') {
          callBackend('/api/settings', 'POST', { key: 'SEARCH_SOURCE_LANG', value: e.target.value }).catch(() => {});
        }
        syncCardLanguageRow();
      });
    }

    const cardTgtLangSelect = cardEl.querySelector('#ai-dict-card-tgt-lang');
    if (cardTgtLangSelect) {
      cardTgtLangSelect.addEventListener('change', async (e) => {
        e.stopPropagation();
        const pid = config.activeProfileId || 1;
        const appSettings = config.appSettings || {};
        const key = `${currentMode}TargetLang_${pid}`;
        appSettings[key] = e.target.value;
        if (currentMode === 'search') {
          appSettings['SEARCH_TARGET_LANG'] = e.target.value;
        }
        config.appSettings = appSettings;
        await safeStorageSet({ appSettings });
        callBackend('/api/settings', 'POST', { key, value: e.target.value }).catch(() => {});
        if (currentMode === 'search') {
          callBackend('/api/settings', 'POST', { key: 'SEARCH_TARGET_LANG', value: e.target.value }).catch(() => {});
        }
        syncCardLanguageRow();
      });
    }

    const cardSwapLangBtn = cardEl.querySelector('#ai-dict-card-swap-lang-btn');
    if (cardSwapLangBtn) {
      cardSwapLangBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pid = config.activeProfileId || 1;
        const appSettings = config.appSettings || {};
        const srcKey = `${currentMode}SourceLang_${pid}`;
        const tgtKey = `${currentMode}TargetLang_${pid}`;
        const defaultTgt = appSettings[`searchTargetLang_${pid}`] || appSettings['SEARCH_TARGET_LANG'] || '🇺🇸 EN';
        const oldSrc = appSettings[srcKey] || (currentMode === 'search' ? (appSettings['SEARCH_SOURCE_LANG'] || '🌐 Auto') : '🌐 Auto');
        const oldTgt = appSettings[tgtKey] || (currentMode === 'search' ? defaultTgt : defaultTgt);
        if (oldSrc.includes('Auto')) return;
        appSettings[srcKey] = oldTgt;
        appSettings[tgtKey] = oldSrc;
        if (currentMode === 'search') {
          appSettings['SEARCH_SOURCE_LANG'] = oldTgt;
          appSettings['SEARCH_TARGET_LANG'] = oldSrc;
        }
        config.appSettings = appSettings;
        await safeStorageSet({ appSettings });
        callBackend('/api/settings', 'POST', { key: srcKey, value: oldTgt }).catch(() => {});
        callBackend('/api/settings', 'POST', { key: tgtKey, value: oldSrc }).catch(() => {});
        if (currentMode === 'search') {
          callBackend('/api/settings', 'POST', { key: 'SEARCH_SOURCE_LANG', value: oldTgt }).catch(() => {});
          callBackend('/api/settings', 'POST', { key: 'SEARCH_TARGET_LANG', value: oldSrc }).catch(() => {});
        }
        syncCardLanguageRow();
      });
    }

    // Quick History Buttons (Header icon & Inline search icon)
    const historyBtn = cardEl.querySelector('#ai-dict-history-btn');
    if (historyBtn) {
      historyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleHistoryPanel();
      });
    }

    const searchHistoryBtn = cardEl.querySelector('#ai-dict-card-search-history-btn');
    if (searchHistoryBtn) {
      searchHistoryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleHistoryPanel();
      });
    }

    // History Panel inner controls
    const historyCloseBtn = cardEl.querySelector('#ai-dict-history-close-btn');
    if (historyCloseBtn) {
      historyCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeHistoryPanel();
      });
    }

    const historyRefreshBtn = cardEl.querySelector('#ai-dict-history-refresh-btn');
    if (historyRefreshBtn) {
      historyRefreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        loadHistoryItems(activeHistoryMode, true);
      });
    }

    const historyModePills = cardEl.querySelectorAll('#ai-dict-history-mode-tabs .history-mode-pill');
    historyModePills.forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        activeHistoryMode = pill.dataset.mode;
        historyModePills.forEach(p => p.classList.toggle('active', p.dataset.mode === activeHistoryMode));
        loadHistoryItems(activeHistoryMode);
      });
    });

    const historyFilterInput = cardEl.querySelector('#ai-dict-history-filter-input');
    if (historyFilterInput) {
      historyFilterInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          closeHistoryPanel();
        }
      });
      historyFilterInput.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
      historyFilterInput.addEventListener('input', () => {
        const q = historyFilterInput.value;
        const cached = cachedHistoryData[activeHistoryMode] || [];
        renderHistoryList(cached, activeHistoryMode, q);
      });
    }

    const historyOpenWebBtn = cardEl.querySelector('#ai-dict-history-open-web-btn');
    if (historyOpenWebBtn) {
      historyOpenWebBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const path = activeHistoryMode === 'search' ? '/search' :
                     activeHistoryMode === 'explain' ? '/explain' :
                     activeHistoryMode === 'translation' ? '/translation' :
                     activeHistoryMode === 'correction' ? '/correction' :
                     '/compare';
        safeSendMessage({ action: 'OPEN_APP', path });
      });
    }

    // Follow-up chat form
    const chatForm = cardEl.querySelector('#ai-dict-chat-form');
    chatForm.addEventListener('submit', handleFollowUpChat);

    // Persistent Window Pin Button
    const pinBtn = cardEl.querySelector('#ai-dict-pin-btn');
    if (pinBtn) {
      pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setTabPersistent(!config.persistentWindow);
        showToast(config.persistentWindow ? '📌 Persistent Window ON: Window stays open across lookups' : 'Persistent Window OFF');
      });
    }

    const persistMenuOpt = cardEl.querySelector('#ai-dict-toggle-persist-menu-opt');
    if (persistMenuOpt) {
      persistMenuOpt.addEventListener('click', (e) => {
        e.stopPropagation();
        if (pauseMenu) pauseMenu.classList.remove('open');
        setTabPersistent(!config.persistentWindow);
        showToast(config.persistentWindow ? '📌 Persistent Window ON: Window stays open across lookups' : 'Persistent Window OFF');
      });
    }
    // Persistent New Tab Mode Toggle Button in Header
    const newtabToggleBtn = cardEl.querySelector('#ai-dict-newtab-toggle-btn');
    if (newtabToggleBtn) {
      newtabToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePersistentNewTabMode();
      });
    }

    // Persistent New Tab Mode Toggle Button in Search Bar
    const searchNewtabBtn = cardEl.querySelector('#ai-dict-card-search-newtab-btn');
    if (searchNewtabBtn) {
      searchNewtabBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePersistentNewTabMode();
      });
    }

    // New Tab Mode Toggle in Pause Menu
    const newtabMenuOpt = cardEl.querySelector('#ai-dict-toggle-newtab-menu-opt');
    if (newtabMenuOpt) {
      newtabMenuOpt.addEventListener('click', (e) => {
        e.stopPropagation();
        if (pauseMenu) pauseMenu.classList.remove('open');
        togglePersistentNewTabMode();
      });
    }

    // Add Word Tab Button in Word Tabs Bar
    const addWordTabBtn = cardEl.querySelector('#ai-dict-word-tab-add-btn');
    if (addWordTabBtn) {
      addWordTabBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        createEmptyWordTab();
      });
    }

    syncCardLanguageRow();
  }

  function updatePinButtonUI() {
    if (!cardEl) return;
    const pinBtn = cardEl.querySelector('#ai-dict-pin-btn');
    if (pinBtn) {
      pinBtn.classList.toggle('active-pin', !!config.persistentWindow);
      pinBtn.title = config.persistentWindow
        ? 'Persistent Window: ON (Click to unpin)'
        : 'Persistent Window: OFF (Click to pin & keep open)';
      const svg = pinBtn.querySelector('svg');
      if (svg) {
        svg.setAttribute('fill', config.persistentWindow ? 'currentColor' : 'none');
      }
    }
    const persistMenuOpt = cardEl.querySelector('#ai-dict-toggle-persist-menu-opt');
    if (persistMenuOpt) {
      persistMenuOpt.textContent = config.persistentWindow
        ? '📌 Persistent Window: ON (Keep Open)'
        : '📌 Persistent Window: OFF';
    }
  }

  function updateNewTabButtonUI() {
    if (!cardEl) return;
    const isNewTab = !!config.persistentNewTabOnLoading;
    const newtabToggleBtn = cardEl.querySelector('#ai-dict-newtab-toggle-btn');
    if (newtabToggleBtn) {
      newtabToggleBtn.classList.toggle('active-newtab', isNewTab);
      newtabToggleBtn.title = isNewTab
        ? 'New Tab on Loading: ON (Click to switch to replace mode)'
        : 'New Tab on Loading: OFF (Click to open new tab when searching while loading)';
    }

    const searchNewtabBtn = cardEl.querySelector('#ai-dict-card-search-newtab-btn');
    if (searchNewtabBtn) {
      searchNewtabBtn.classList.toggle('active-newtab', isNewTab);
      searchNewtabBtn.title = isNewTab
        ? 'New tab if loading: ON (Click to switch to replace mode)'
        : 'New tab if loading: OFF (Click to open new tab when searching while loading)';
    }

    const newtabMenuOpt = cardEl.querySelector('#ai-dict-toggle-newtab-menu-opt');
    if (newtabMenuOpt) {
      newtabMenuOpt.textContent = isNewTab
        ? '📑 New Tab While Loading: ON (Branch)'
        : '📑 New Tab While Loading: OFF (Replace)';
    }
  }

  async function togglePersistentNewTabMode() {
    config.persistentNewTabOnLoading = !config.persistentNewTabOnLoading;
    await safeStorageSet({ persistentNewTabOnLoading: config.persistentNewTabOnLoading });
    updateNewTabButtonUI();
    if (config.persistentNewTabOnLoading) {
      showToast('📑 New Tab ON: Lookups while loading will open in a new tab');
    } else {
      showToast('Replace Mode: Lookups while loading will replace the current search');
    }
  }

  function getModeIcon(mode) {
    if (mode === 'explain') return '📖';
    if (mode === 'translation') return '🌐';
    if (mode === 'compare') return '⚖️';
    if (mode === 'correction') return '✍️';
    return '🔍';
  }

  function renderWordTabsBar() {
    if (!cardEl) return;
    const tabsBar = cardEl.querySelector('#ai-dict-word-tabs-bar');
    const tabsList = cardEl.querySelector('#ai-dict-word-tabs-list');
    if (!tabsBar || !tabsList) return;

    if (cardTabs.length <= 1) {
      tabsBar.style.setProperty('display', 'none', 'important');
      tabsList.innerHTML = '';
      return;
    }

    tabsBar.style.setProperty('display', 'flex', 'important');
    tabsList.innerHTML = cardTabs.map(tab => {
      const isActive = tab.id === activeCardTabId;
      const title = tab.word || 'New Tab';
      const shortTitle = title.length > 16 ? title.slice(0, 16) + '…' : title;
      const iconHtml = tab.isLoading
        ? '<span class="word-tab-spinner" title="Loading definition..."></span>'
        : `<span class="word-tab-icon">${getModeIcon(tab.mode)}</span>`;

      return `
        <div class="word-tab ${isActive ? 'active' : ''}" data-tab-id="${tab.id}" title="${escapeHtml(title)} (${tab.mode})">
          ${iconHtml}
          <span class="word-tab-title">${escapeHtml(shortTitle)}</span>
          <button type="button" class="word-tab-close" data-close-tab-id="${tab.id}" title="Close tab">×</button>
        </div>
      `;
    }).join('');

    tabsList.querySelectorAll('.word-tab').forEach(tabEl => {
      tabEl.addEventListener('click', (e) => {
        if (e.target.closest('.word-tab-close')) return;
        const tid = tabEl.dataset.tabId;
        if (tid) switchToTab(tid);
      });
    });

    tabsList.querySelectorAll('.word-tab-close').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tid = btn.dataset.closeTabId;
        if (tid) closeWordTab(tid);
      });
    });
  }

  function switchToTab(tabId) {
    const tab = cardTabs.find(t => t.id === tabId);
    if (!tab || !cardEl) return;

    stopSpeech();
    activeCardTabId = tab.id;
    currentMode = tab.mode || 'search';
    currentSelectionText = tab.word || '';

    // Update pills
    const pills = cardEl.querySelectorAll('.mode-pill');
    pills.forEach(p => p.classList.toggle('active', p.dataset.mode === currentMode));

    // Update inline search bar
    const cardSearchInput = cardEl.querySelector('#ai-dict-card-search-input');
    if (cardSearchInput && cardSearchInput !== document.activeElement) {
      cardSearchInput.value = tab.word || '';
    }
    const cardModeSelect = cardEl.querySelector('#ai-dict-card-search-mode-select');
    if (cardModeSelect) {
      cardModeSelect.value = currentMode;
    }
    syncSearchPlaceholder(currentMode);
    syncCardLanguageRow();
    closeHistoryPanel();

    renderWordTabsBar();

    if (tab.isLoading) {
      switchToAiTab();
      const cardBody = cardEl.querySelector('#ai-dict-card-body');
      if (cardBody) {
        cardBody.innerHTML = `
          <div class="loading-box">
            <div class="spinner"></div>
            <div style="font-size:12px; font-weight:600;">Generating & Saving to ${escapeHtml(config.activeProfileName || 'Profile')}...</div>
            <div style="font-size:11px; opacity:0.6; margin-top:4px;">"${escapeHtml(tab.word.length > 50 ? tab.word.slice(0, 50) + '...' : tab.word)}"</div>
          </div>
        `;
      }
      const chatDrawer = cardEl.querySelector('#ai-dict-chat-drawer');
      if (chatDrawer) chatDrawer.style.display = 'none';
    } else if (tab.error) {
      switchToAiTab();
      renderLookupError(tab.error, tab.word);
    } else if (tab.data) {
      switchToAiTab();
      currentDetectedLanguage = tab.currentDetectedLanguage || '';
      renderLookupResult(tab.data, tab.word);
    } else if (!tab.word) {
      // Empty tab state
      switchToAiTab();
      const cardBody = cardEl.querySelector('#ai-dict-card-body');
      if (cardBody) {
        cardBody.innerHTML = `
          <div class="empty-state" style="padding: 40px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; box-sizing: border-box;">
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 6px;">New Lookup Tab</div>
            <div style="font-size: 12px; opacity: 0.7; max-width: 280px; line-height: 1.4;">
              Type a word in the search box above or highlight text on the page to define in this tab.
            </div>
          </div>
        `;
      }
      const chatDrawer = cardEl.querySelector('#ai-dict-chat-drawer');
      if (chatDrawer) chatDrawer.style.display = 'none';
      focusCardSearchInput();
    }
  }

  function closeWordTab(tabId) {
    const idx = cardTabs.findIndex(t => t.id === tabId);
    if (idx === -1) return;

    const [closedTab] = cardTabs.splice(idx, 1);
    if (closedTab) closedTab.token = -1; // Invalidate any callbacks

    if (cardTabs.length === 0) {
      if (config.persistentWindow) {
        openPersistentEmptyCard(currentMode);
      } else {
        closeCard();
      }
      return;
    }

    if (activeCardTabId === tabId) {
      const nextIdx = Math.min(idx, cardTabs.length - 1);
      switchToTab(cardTabs[nextIdx].id);
    } else {
      renderWordTabsBar();
    }
  }

  function createEmptyWordTab() {
    const newTabId = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const initialMode = (config.defaultMode && config.defaultMode !== 'machine_translation')
      ? config.defaultMode
      : (currentMode && currentMode !== 'machine_translation' ? currentMode : 'search');
    const newTab = {
      id: newTabId,
      word: '',
      mode: initialMode,
      token: ++activeLookupToken,
      isLoading: false,
      data: null,
      error: null,
      currentDetectedLanguage: '',
      activeView: 'ai',
      externalUrl: '',
      externalName: '',
      chatMessages: []
    };
    cardTabs.push(newTab);
    switchToTab(newTab.id);
  }

  // --- History Drawer Implementation ---
  function toggleHistoryPanel() {
    if (isHistoryOpen) {
      closeHistoryPanel();
    } else {
      openHistoryPanel(currentMode);
    }
  }

  function openHistoryPanel(mode = currentMode) {
    if (!cardEl) return;
    isHistoryOpen = true;
    activeHistoryMode = mode || 'search';
    const panel = cardEl.querySelector('#ai-dict-history-panel');
    const btn = cardEl.querySelector('#ai-dict-history-btn');
    if (panel) {
      panel.classList.add('open');
      panel.style.setProperty('display', 'flex', 'important');
    }
    if (btn) btn.classList.add('active-history');

    // Sync profile badge
    const badge = cardEl.querySelector('#ai-dict-history-profile-badge');
    if (badge) badge.textContent = config.activeProfileName || 'Profile';

    // Sync mode tabs
    const historyModePills = cardEl.querySelectorAll('#ai-dict-history-mode-tabs .history-mode-pill');
    historyModePills.forEach(p => p.classList.toggle('active', p.dataset.mode === activeHistoryMode));

    // Clear filter
    const filterInput = cardEl.querySelector('#ai-dict-history-filter-input');
    if (filterInput) {
      filterInput.value = '';
      setTimeout(() => filterInput.focus(), 50);
    }

    loadHistoryItems(activeHistoryMode);
  }

  function closeHistoryPanel() {
    isHistoryOpen = false;
    if (!cardEl) return;
    const panel = cardEl.querySelector('#ai-dict-history-panel');
    const btn = cardEl.querySelector('#ai-dict-history-btn');
    if (panel) {
      panel.classList.remove('open');
      panel.style.setProperty('display', 'none', 'important');
    }
    if (btn) btn.classList.remove('active-history');
  }

  async function loadHistoryItems(mode, forceRefresh = false) {
    if (!cardEl) return;
    const listEl = cardEl.querySelector('#ai-dict-history-items-list');
    const countEl = cardEl.querySelector('#ai-dict-history-count');
    if (!listEl) return;

    if (!forceRefresh && cachedHistoryData[mode]) {
      renderHistoryList(cachedHistoryData[mode], mode);
      return;
    }

    const modeLabels = {
      search: 'Word',
      explain: 'Explain',
      translation: 'Translate',
      compare: 'Compare',
      correction: 'Correct'
    };

    listEl.innerHTML = `
      <div class="history-loading">
        <div class="spinner"></div>
        <span>Loading ${modeLabels[mode] || mode} history...</span>
      </div>
    `;

    const pid = config.activeProfileId || 1;
    let endpoint = `/api/words?profile_id=${pid}`;
    if (mode === 'explain') endpoint = `/api/explains?profile_id=${pid}`;
    else if (mode === 'translation') endpoint = `/api/translations?profile_id=${pid}`;
    else if (mode === 'compare') endpoint = `/api/comparisons?profile_id=${pid}`;
    else if (mode === 'correction') endpoint = `/api/corrections?profile_id=${pid}`;

    try {
      const items = await callBackend(endpoint);
      cachedHistoryData[mode] = Array.isArray(items) ? items : [];
      renderHistoryList(cachedHistoryData[mode], mode);
    } catch (err) {
      listEl.innerHTML = `
        <div class="history-empty" style="color:#ef4444;">
          Failed to load history: ${escapeHtml(err.message)}
        </div>
      `;
    }
  }

  function renderHistoryList(items, mode, filterQuery = '') {
    if (!cardEl) return;
    const listEl = cardEl.querySelector('#ai-dict-history-items-list');
    const countEl = cardEl.querySelector('#ai-dict-history-count');
    if (!listEl) return;

    const q = (filterQuery || '').toLowerCase().trim();
    const filtered = q
      ? items.filter(item => {
          const term = (item.term || item.terms || item.text || '').toLowerCase();
          const lang = (item.language || item.source_lang || item.target_lang || '').toLowerCase();
          return term.includes(q) || lang.includes(q);
        })
      : items;

    if (countEl) {
      countEl.textContent = `${filtered.length} of ${items.length} items`;
    }

    if (filtered.length === 0) {
      const emptyLabels = {
        search: 'words',
        explain: 'explanations',
        translation: 'translations',
        compare: 'comparisons',
        correction: 'corrections'
      };
      listEl.innerHTML = `
        <div class="history-empty">
          ${items.length === 0 ? `No saved ${emptyLabels[mode] || 'items'} in this profile yet.` : 'No matching history items found.'}
        </div>
      `;
      return;
    }

    const COLORS = {
      red: '#ef4444',
      orange: '#f97316',
      yellow: '#eab308',
      green: '#22c55e'
    };

    listEl.innerHTML = filtered.map(item => {
      const term = item.term || item.terms || item.text || '';
      let metaBadge = '';
      if (mode === 'search') {
        metaBadge = item.language ? `<span class="history-item-badge">${escapeHtml(item.language)}</span>` : '';
        if (item.lemma && item.lemma !== term) {
          metaBadge += `<span class="history-item-sub">(${escapeHtml(item.lemma)})</span>`;
        }
      } else if (mode === 'translation') {
        metaBadge = `<span class="history-item-badge">${escapeHtml(item.source_lang || 'Auto')} → ${escapeHtml(item.target_lang || 'EN')}</span>`;
      } else if (mode === 'explain') {
        metaBadge = `<span class="history-item-badge">Explain</span>`;
      } else if (mode === 'compare') {
        metaBadge = `<span class="history-item-badge">Compare</span>`;
      } else if (mode === 'correction') {
        const isOnly = item.mode_type === 'correction_only';
        metaBadge = `<span class="history-item-badge" style="${isOnly ? 'background:rgba(34,197,94,0.15); color:#22c55e;' : 'background:rgba(59,130,246,0.15); color:#3b82f6;'}">${isOnly ? 'Correct Only' : `${escapeHtml(item.source_lang || 'Auto')} → ${escapeHtml(item.target_lang || 'EN')}`}</span>`;
      }

      const colorDot = item.color ? `<span class="history-item-dot" style="background-color:${COLORS[item.color] || 'transparent'};"></span>` : '';
      const count = item.search_count || item.view_count || 1;

      return `
        <div class="history-item" data-id="${item.id}" data-term="${escapeHtml(term)}" data-mode="${mode}">
          <div class="history-item-main">
            <span class="history-item-term" title="${escapeHtml(term)}">${escapeHtml(term)}</span>
            <div class="history-item-tags">
              ${colorDot}
              ${metaBadge}
            </div>
          </div>
          <div class="history-item-meta">
            <span class="history-item-count">${count}x</span>
            <button type="button" class="history-item-del-btn" data-id="${item.id}" data-term="${escapeHtml(term)}" data-mode="${mode}" title="Delete from history">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="history-item-arrow"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.history-item-del-btn')) return;
        const term = el.dataset.term;
        const itemMode = el.dataset.mode || mode;
        closeHistoryPanel();
        openCardAtRect(null, term, itemMode);
      });
    });

    listEl.querySelectorAll('.history-item-del-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const delId = parseInt(btn.dataset.id, 10);
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

          if (cachedHistoryData[delMode]) {
            cachedHistoryData[delMode] = cachedHistoryData[delMode].filter(i => i.id !== delId);
          }

          const row = btn.closest('.history-item');
          if (row) {
            row.style.transition = 'all 0.2s ease';
            row.style.opacity = '0';
            row.style.transform = 'translateX(20px)';
            setTimeout(() => {
              row.remove();
              const remaining = listEl.querySelectorAll('.history-item').length;
              if (countEl && cachedHistoryData[delMode]) {
                countEl.textContent = `${remaining} of ${cachedHistoryData[delMode].length} items`;
              }
              if (remaining === 0) {
                renderHistoryList([], delMode);
              }
            }, 200);
          }
        } catch (err) {
          console.error('Failed to delete history item:', err);
          alert('Failed to delete: ' + err.message);
          btn.disabled = false;
          btn.style.opacity = '1';
        }
      });
    });
  }

  let iframeTimeoutId = null;

  function openExternalView(url, siteName, targetBtn = null) {
    if (!cardEl) return;
    const aiView = cardEl.querySelector('#ai-dict-ai-view');
    const externalView = cardEl.querySelector('#ai-dict-external-view');
    const titleEl = cardEl.querySelector('#ai-dict-external-title');
    const container = cardEl.querySelector('#ai-dict-iframe-container');
    const loader = cardEl.querySelector('#ai-dict-iframe-loader');
    const aiTabBtn = cardEl.querySelector('#ai-dict-tab-ai');
    const extTabBtns = cardEl.querySelectorAll('#ai-dict-external-tabs .card-tab-btn');

    if (!externalView || !container) return;

    let iframe = container.querySelector('#ai-dict-external-frame');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'ai-dict-external-frame';
      iframe.className = 'external-iframe';
      // Do NOT set allow-same-origin with allow-scripts to prevent browser security warnings and sandboxing escapes
      iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals');
      container.appendChild(iframe);
    }

    currentExternalUrl = url;
    if (titleEl) titleEl.textContent = siteName || 'External Dictionary';

    // Update active tab styling
    if (aiTabBtn) aiTabBtn.classList.remove('active');
    extTabBtns.forEach(btn => {
      btn.classList.toggle('active', btn === targetBtn || btn.dataset.name === siteName);
    });

    aiView.style.display = 'none';
    externalView.style.display = 'flex';

    if (iframeTimeoutId) {
      clearTimeout(iframeTimeoutId);
      iframeTimeoutId = null;
    }

    if (config.showExternalFallbackOverlay) {
      if (loader) {
        loader.style.setProperty('display', 'flex', 'important');
        loader.innerHTML = `
          <div class="spinner"></div>
          <span>Loading ${escapeHtml(siteName || 'dictionary')}...</span>
        `;
      }
      iframeTimeoutId = setTimeout(() => {
        if (loader) {
          loader.innerHTML = `
            <div style="font-size:12px; margin-bottom:8px; opacity:0.9;">If embedding is restricted by ${escapeHtml(siteName)}:</div>
            <button type="button" class="back-to-ai-btn" id="ai-dict-fallback-open-tab" style="padding:4px 10px; font-size:11.5px;">
              Open in Browser Tab ↗
            </button>
          `;
          const openBtn = loader.querySelector('#ai-dict-fallback-open-tab');
          if (openBtn) {
            openBtn.addEventListener('click', () => {
              safeSendMessage({ action: 'OPEN_EXTERNAL', url, inBackground: false });
            });
          }
        }
      }, 2500);
    } else {
      // Overlay aid is turned off by default!
      if (loader) {
        loader.style.setProperty('display', 'none', 'important');
        loader.innerHTML = '';
      }
    }

    iframe.src = url;

    iframe.onload = () => {
      if (iframeTimeoutId) clearTimeout(iframeTimeoutId);
      if (loader) loader.style.setProperty('display', 'none', 'important');
    };

    iframe.onerror = () => {
      if (iframeTimeoutId) clearTimeout(iframeTimeoutId);
      if (loader) loader.style.setProperty('display', 'none', 'important');
    };
  }

  function switchToAiTab() {
    if (!cardEl) return;
    const aiView = cardEl.querySelector('#ai-dict-ai-view');
    const externalView = cardEl.querySelector('#ai-dict-external-view');
    const iframe = cardEl.querySelector('#ai-dict-external-frame');
    const loader = cardEl.querySelector('#ai-dict-iframe-loader');
    const aiTabBtn = cardEl.querySelector('#ai-dict-tab-ai');
    const extTabBtns = cardEl.querySelectorAll('#ai-dict-external-tabs .card-tab-btn');

    if (iframeTimeoutId) {
      clearTimeout(iframeTimeoutId);
      iframeTimeoutId = null;
    }
    if (loader) {
      loader.style.setProperty('display', 'none', 'important');
      loader.innerHTML = '';
    }

    if (externalView) externalView.style.display = 'none';
    if (aiView) aiView.style.display = 'flex';
    if (iframe && iframe.parentNode) {
      iframe.src = 'about:blank';
      iframe.parentNode.removeChild(iframe);
    }

    if (aiTabBtn) aiTabBtn.classList.add('active');
    extTabBtns.forEach(btn => btn.classList.remove('active'));
  }

  async function performTabLookup(tab) {
    if (!tab || !tab.word) return;
    const thisToken = tab.token;
    const lookupWord = tab.word;

    try {
      let endpoint = '/api/search';
      let requestBody = {};
      const pid = config.activeProfileId || 1;
      const appSettings = config.appSettings || {};
      const getLang = (modeName, type) => {
        return appSettings[`${modeName}${type}_${pid}`] ||
               appSettings[`search${type}_${pid}`] ||
               appSettings[`SEARCH_${type === 'SourceLang' ? 'SOURCE' : 'TARGET'}_LANG`] ||
               '';
      };

      if (tab.mode === 'search') {
        endpoint = '/api/search';
        requestBody = {
          term: lookupWord,
          profile_id: pid,
          session_id: config.activeSessionId || undefined,
          source_language: getLang('search', 'SourceLang') || undefined,
          target_language: getLang('search', 'TargetLang') || undefined
        };
      } else if (tab.mode === 'explain') {
        endpoint = '/api/explains/search';
        requestBody = {
          text: lookupWord,
          profile_id: pid,
          session_id: config.activeSessionId || undefined,
          source_language: getLang('explain', 'SourceLang') || undefined,
          target_language: getLang('explain', 'TargetLang') || undefined
        };
      } else if (tab.mode === 'translation') {
        endpoint = '/api/translations/search';
        requestBody = {
          text: lookupWord,
          source_lang: getLang('translation', 'SourceLang') || '🌐 Auto',
          target_lang: getLang('translation', 'TargetLang') || '🇺🇸 EN',
          profile_id: pid,
          session_id: config.activeSessionId || undefined
        };
      } else if (tab.mode === 'compare') {
        endpoint = '/api/comparisons/search';
        requestBody = {
          terms: lookupWord,
          profile_id: pid,
          session_id: config.activeSessionId || undefined,
          source_language: getLang('compare', 'SourceLang') || undefined,
          target_language: getLang('compare', 'TargetLang') || undefined
        };
      } else if (tab.mode === 'correction') {
        endpoint = '/api/corrections/search';
        const modeType = appSettings[`correctionModeType_${pid}`] || 'both';
        requestBody = {
          text: lookupWord,
          source_lang: getLang('correction', 'SourceLang') || '🌐 Auto',
          target_lang: getLang('correction', 'TargetLang') || '🇺🇸 EN',
          mode_type: modeType,
          profile_id: pid,
          session_id: config.activeSessionId || undefined
        };
      } else if (tab.mode === 'simple_llm') {
        endpoint = '/api/simple-llm/lookup';
        requestBody = {
          text: lookupWord,
          source_lang: getLang('simple_llm', 'SourceLang') || getLang('search', 'SourceLang') || undefined,
          target_lang: getLang('simple_llm', 'TargetLang') || getLang('search', 'TargetLang') || undefined,
          model: config.simpleLlmModel || 'inclusionai/ling-3.0-flash',
          profile_id: pid,
          prompt_key: tab.promptKey || config.simpleLlmDefaultPrompt || 'quick_glance'
        };
      } else if (tab.mode === 'machine_translation') {
        // Inside Full LLM card, redirect machine_translation tabs to LLM translation mode
        tab.mode = 'translation';
        currentMode = 'translation';
        endpoint = '/api/translations/search';
        requestBody = {
          text: lookupWord,
          source_lang: getLang('translation', 'SourceLang') || '🌐 Auto',
          target_lang: getLang('translation', 'TargetLang') || '🇺🇸 EN',
          profile_id: pid,
          session_id: config.activeSessionId || undefined
        };
      }

      const res = await callBackend(endpoint, 'POST', requestBody);

      // Verify if tab is still active and token matches
      const targetTab = cardTabs.find(t => t.id === tab.id);
      if (!targetTab || targetTab.token !== thisToken || !isCardOpen || !cardEl) {
        return;
      }

      targetTab.isLoading = false;
      targetTab.data = res;
      targetTab.error = null;

      const item = res.word || res.explain || res.translation || res.comparison || res.correction || res.mt || res;
      if (item && (item.language || item.source_lang)) {
        targetTab.currentDetectedLanguage = item.language || item.source_lang;
      }

      if (targetTab.mode !== 'simple_llm') {
        cachedHistoryData[targetTab.mode] = null;
      }
      renderWordTabsBar();

      // If active tab is this tab, display result immediately
      if (activeCardTabId === targetTab.id) {
        currentWordData = item;
        currentDetectedLanguage = targetTab.currentDetectedLanguage || '';
        renderLookupResult(res, targetTab.word);
      }
    } catch (err) {
      const targetTab = cardTabs.find(t => t.id === tab.id);
      if (!targetTab || targetTab.token !== thisToken || !isCardOpen || !cardEl) {
        return;
      }
      targetTab.isLoading = false;
      targetTab.error = err;
      renderWordTabsBar();

      if (activeCardTabId === targetTab.id) {
        renderLookupError(err, targetTab.word);
      }
    }
  }

  function renderLookupError(err, lookupWord) {
    if (!cardEl) return;
    const bodyEl = cardEl.querySelector('#ai-dict-card-body');
    if (!bodyEl) return;
    const isContextInvalid = (err?.message || '').toLowerCase().includes('context invalidated');
    if (isContextInvalid) {
      bodyEl.innerHTML = `
        <div class="status-banner" style="background:#f59e0b20; color:#f59e0b; border:1px solid #f59e0b50; padding:12px; border-radius:8px;">
          <div style="font-weight:600; margin-bottom:4px;">🔄 Webpage Needs Refresh</div>
          <div style="font-size:12px; line-height:1.5; opacity:0.9;">
            The AI Dict extension was recently reloaded in your browser.<br>
            Please <strong>refresh this webpage (Ctrl+R / F5)</strong> to reconnect.
          </div>
        </div>
        <button class="chat-send-btn" id="ai-dict-reload-page-btn" style="margin-top:14px; background:#f59e0b; color:#1e1e2e; font-weight:600;">
          ↻ Refresh This Webpage
        </button>
      `;
      const reloadBtn = bodyEl.querySelector('#ai-dict-reload-page-btn');
      if (reloadBtn) reloadBtn.addEventListener('click', () => window.location.reload());
    } else {
      bodyEl.innerHTML = `
        <div class="status-banner error">
          <span>Failed to look up: ${escapeHtml(err?.message || 'Unknown error')}</span>
        </div>
        <div style="font-size:12px; opacity:0.8; margin-top:8px;">
          Make sure AI Dict is running locally (e.g. <code>ai_dict serve</code> at ${escapeHtml(config.serverUrl)}).
        </div>
        <button class="chat-send-btn" id="ai-dict-retry-btn" style="margin-top:12px;">Retry Lookup</button>
      `;
      const retryBtn = bodyEl.querySelector('#ai-dict-retry-btn');
      if (retryBtn) retryBtn.addEventListener('click', () => performLookup(lookupWord));
    }
  }

  function performLookup(wordToLookup, explicitMode = null) {
    const cleanWord = cleanSelectedText(wordToLookup || currentSelectionText);
    if (!cleanWord) return;
    currentSelectionText = cleanWord;

    const targetMode = explicitMode || currentMode;
    if (targetMode === 'machine_translation') {
      switchToSimpleMtMode(cleanWord, lastSelectionRect);
      return;
    }

    if (explicitMode) {
      currentMode = explicitMode;
      config.defaultMode = explicitMode;
      safeStorageSet({ defaultMode: explicitMode });
      const pills = cardEl?.querySelectorAll('.mode-pill');
      pills?.forEach(p => p.classList.toggle('active', p.dataset.mode === currentMode));
      const cardModeSelect = cardEl?.querySelector('#ai-dict-card-search-mode-select');
      if (cardModeSelect) cardModeSelect.value = currentMode;
      syncSearchPlaceholder(currentMode);
      syncCardLanguageRow();
    }

    let targetTab = cardTabs.find(t => t.id === activeCardTabId);
    if (!targetTab) {
      targetTab = {
        id: 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        word: cleanWord,
        mode: currentMode,
        token: ++activeLookupToken,
        isLoading: true,
        data: null,
        error: null,
        currentDetectedLanguage: '',
        activeView: 'ai',
        externalUrl: '',
        externalName: '',
        chatMessages: [],
        promptKey: config.simpleLlmActivePrompt || config.simpleLlmDefaultPrompt || 'quick_glance'
      };
      cardTabs = [targetTab];
      activeCardTabId = targetTab.id;
    } else {
      targetTab.word = cleanWord;
      targetTab.mode = currentMode;
      if (currentMode === 'simple_llm' && !targetTab.promptKey) {
        targetTab.promptKey = config.simpleLlmActivePrompt || config.simpleLlmDefaultPrompt || 'quick_glance';
      }
      targetTab.token = ++activeLookupToken;
      targetTab.isLoading = true;
      targetTab.data = null;
      targetTab.error = null;
    }

    switchToAiTab();
    const cardBody = cardEl?.querySelector('#ai-dict-card-body');
    if (cardBody) {
      cardBody.innerHTML = `
        <div class="loading-box">
          <div class="spinner"></div>
          <div style="font-size:12px; font-weight:600;">Generating & Saving to ${escapeHtml(config.activeProfileName || 'Profile')}...</div>
          <div style="font-size:11px; opacity:0.6; margin-top:4px;">"${escapeHtml(cleanWord.length > 50 ? cleanWord.slice(0, 50) + '...' : cleanWord)}"</div>
        </div>
      `;
    }
    const chatDrawer = cardEl?.querySelector('#ai-dict-chat-drawer');
    if (chatDrawer) chatDrawer.style.display = 'none';

    renderWordTabsBar();
    performTabLookup(targetTab);
  }

  async function moveWordMode(targetMode, term, itemId) {
    if (!cardEl) return;
    if (targetMode === 'machine_translation') {
      switchToSimpleMtMode(term || currentSelectionText, lastSelectionRect);
      return;
    }
    currentMode = targetMode;
    config.defaultMode = targetMode;
    safeStorageSet({ defaultMode: targetMode });
    switchToAiTab();
    const thisToken = ++activeLookupToken;
    const bodyEl = cardEl.querySelector('#ai-dict-card-body');
    const chatDrawer = cardEl.querySelector('#ai-dict-chat-drawer');
    const targetLabel = targetMode === 'search' ? 'Word' : targetMode === 'explain' ? 'Explain' : targetMode === 'correction' ? 'Correct' : targetMode === 'compare' ? 'Compare' : 'Translate';

    if (bodyEl) {
      bodyEl.innerHTML = `
        <div class="loading-box">
          <div class="spinner"></div>
          <div style="font-size:12px; font-weight:600;">Moving to ${targetLabel} & Regenerating...</div>
        </div>
      `;
    }
    if (chatDrawer) chatDrawer.style.display = 'none';

    try {
      const pid = config.activeProfileId || 1;
      const appSettings = config.appSettings || {};
      const getLang = (modeName, type) => {
        return appSettings[`${modeName}${type}_${pid}`] ||
               appSettings[`search${type}_${pid}`] ||
               appSettings[`SEARCH_${type === 'SourceLang' ? 'SOURCE' : 'TARGET'}_LANG`] ||
               '';
      };

      const res = await callBackend('/api/modes/move', 'POST', {
        from_mode: currentMode,
        to_mode: targetMode,
        item_id: itemId || undefined,
        term: term || currentSelectionText,
        profile_id: pid,
        source_lang: getLang(targetMode, 'SourceLang') || undefined,
        target_lang: getLang(targetMode, 'TargetLang') || undefined
      });

      if (thisToken !== activeLookupToken || !isCardOpen || !cardEl) return;

      // Update current mode and mode pills
      currentMode = targetMode;
      const pills = cardEl.querySelectorAll('.mode-pill');
      pills.forEach(p => p.classList.toggle('active', p.dataset.mode === currentMode));
      const cardModeSelect = cardEl.querySelector('#ai-dict-card-search-mode-select');
      if (cardModeSelect) cardModeSelect.value = currentMode;
      syncSearchPlaceholder(currentMode);
      syncCardLanguageRow();

      renderLookupResult(res, term || currentSelectionText);
    } catch (err) {
      if (thisToken !== activeLookupToken || !isCardOpen || !cardEl) return;
      if (bodyEl) {
        bodyEl.innerHTML = `
          <div class="status-banner error">
            <span>Failed to move mode: ${escapeHtml(err.message)}</span>
          </div>
          <div style="font-size:12px; opacity:0.8; margin-top:8px;">
            Make sure AI Dict is running locally (e.g. <code>ai_dict serve</code> at ${escapeHtml(config.serverUrl)}).
          </div>
          <button class="chat-send-btn" id="ai-dict-retry-btn" style="margin-top:12px;">Back to Lookup</button>
        `;
        const retryBtn = bodyEl.querySelector('#ai-dict-retry-btn');
        if (retryBtn) retryBtn.addEventListener('click', () => performLookup(term || currentSelectionText));
      }
    }
  }

  function renderLookupResult(data, termOverride) {
    if (!cardEl) return;
    const bodyEl = cardEl.querySelector('#ai-dict-card-body');
    const chatDrawer = cardEl.querySelector('#ai-dict-chat-drawer');
    if (!bodyEl) return;

    let item = null;
    let termTitle = termOverride || currentSelectionText;
    let language = '';
    let lemma = '';
    let explanationText = '';
    let colorTag = null;
    let itemId = null;

    const chats = Array.isArray(data.chats) ? data.chats : [];
    const assistantChat = chats.find(c => c.role === 'assistant') || chats[0];

    if (currentMode === 'search') {
      item = data.word || data;
      currentWordData = item;
      itemId = item.id;
      termTitle = item.term || termOverride || currentSelectionText;
      language = item.language || '';
      lemma = item.lemma || '';
      explanationText = assistantChat ? assistantChat.content : (item.explanation || '');
      colorTag = item.color || null;
      if (chatDrawer) chatDrawer.style.display = 'block';
    } else if (currentMode === 'explain') {
      item = data.explain || data;
      currentWordData = item;
      itemId = item.id;
      termTitle = item.text || termOverride || currentSelectionText;
      explanationText = assistantChat ? assistantChat.content : (item.response || item.explanation || '');
      colorTag = item.color || null;
      if (chatDrawer) chatDrawer.style.display = 'block';
    } else if (currentMode === 'translation') {
      item = data.translation || data;
      currentWordData = item;
      itemId = item.id;
      termTitle = item.text || termOverride || currentSelectionText;
      explanationText = assistantChat ? assistantChat.content : (item.explanation || '');
      colorTag = item.color || null;
      if (chatDrawer) chatDrawer.style.display = 'block';
    } else if (currentMode === 'compare') {
      item = data.comparison || data;
      currentWordData = item;
      itemId = item.id;
      termTitle = item.terms || termOverride || currentSelectionText;
      explanationText = assistantChat ? assistantChat.content : (item.explanation || '');
      colorTag = item.color || null;
      if (chatDrawer) chatDrawer.style.display = 'block';
    } else if (currentMode === 'correction') {
      item = data.correction || data;
      currentWordData = item;
      itemId = item.id;
      termTitle = item.text || termOverride || currentSelectionText;
      explanationText = assistantChat ? assistantChat.content : (item.explanation || '');
      colorTag = item.color || null;
      if (chatDrawer) chatDrawer.style.display = 'block';
    } else if (currentMode === 'simple_llm') {
      item = data.word || data;
      currentWordData = item;
      itemId = item.id || null;
      termTitle = item.term || data.term || termOverride || currentSelectionText;
      language = item.language || data.language || '';
      lemma = item.lemma || data.lemma || '';
      explanationText = assistantChat ? assistantChat.content : (data.content || item.explanation || '');
      colorTag = item.color || null;
      if (chatDrawer) chatDrawer.style.display = itemId ? 'block' : 'none';
    } else if (currentMode === 'machine_translation') {
      item = data.mt || data;
      currentWordData = item;
      itemId = null;
      termTitle = item.original_text || termOverride || currentSelectionText;
      explanationText = item.translated_text || '';
      language = item.source_lang || '';
      colorTag = null;
      if (chatDrawer) chatDrawer.style.display = 'none';
    }

    currentDetectedLanguage = language;

    const COLORS = [
      { id: 'red', hex: '#ef4444', label: 'Forgot' },
      { id: 'orange', hex: '#f97316', label: 'Hard' },
      { id: 'yellow', hex: '#eab308', label: 'Medium' },
      { id: 'green', hex: '#22c55e', label: 'Easy' }
    ];

    const colorDots = COLORS.map(c => `
      <div class="color-tag-dot ${colorTag === c.id ? 'active' : ''}" 
           style="background-color: ${c.hex};" 
           data-color="${c.id}" 
           title="Tag as ${c.label}"></div>
    `).join('');

    const profileLangSetting = config.appSettings?.[`searchSourceLang_${config.activeProfileId}`] || config.appSettings?.['SEARCH_SOURCE_LANG'];
    const resolvedSpeechLang = resolveSpeechLanguage(language, profileLangSetting, config.activeProfileName);

    const isUnsavedSimpleLlm = (currentMode === 'simple_llm' && !itemId && !data.saved);

    bodyEl.innerHTML = `
      ${isUnsavedSimpleLlm ? `
        <div class="status-banner simple-llm-banner" id="ai-dict-simple-llm-banner">
          <div class="simple-llm-banner-info">
            <span class="simple-llm-tag">⚡ Quick LLM</span>
            <span class="simple-llm-model-name">${escapeHtml(config.simpleLlmModel || 'inclusionai/ling-3.0-flash')}</span>
            <span class="simple-llm-unsaved-badge">• Not saved</span>
          </div>
          <button type="button" class="simple-llm-save-btn" id="ai-dict-simple-llm-save-btn" title="Save this lookup to ${escapeHtml(config.activeProfileName || 'Profile')}">
            💾 Save to Profile
          </button>
        </div>
      ` : `
        <div class="status-banner">
          <span>✓ Saved to <strong>${escapeHtml(config.activeProfileName || 'Profile')}</strong></span>
          <span style="opacity:0.85;">Viewed ${item?.view_count || 1}x • Searched ${item?.search_count || 1}x</span>
        </div>
      `}

      ${currentMode === 'simple_llm' ? `
        <div class="simple-llm-prompt-bar">
          <span class="simple-llm-prompt-label">Lens:</span>
          <select class="simple-llm-prompt-select" id="ai-dict-simple-llm-prompt-select" title="Switch prompt preset to re-analyze with different prompt">
            ${getActiveSimpleLlmPrompts().map(p => {
              const icon = p.icon || '⚡';
              const name = p.name ? (p.name.includes(icon) ? p.name : `${icon} ${p.name}`) : p.id;
              return `<option value="${escapeHtml(p.id)}" ${(cardTabs.find(t => t.id === activeCardTabId)?.promptKey || config.simpleLlmDefaultPrompt || 'quick_glance') === p.id ? 'selected' : ''}>${escapeHtml(name)}</option>`;
            }).join('')}
          </select>
          <button type="button" class="simple-llm-set-default-btn" id="ai-dict-simple-llm-set-default-btn" title="Set this prompt preset as your default for Quick LLM">
            ★ Set Default
          </button>
        </div>
      ` : ''}

      <div class="word-title-row">
        <div class="word-term" style="${termTitle.length > 50 ? 'font-size:16px !important;' : termTitle.length > 25 ? 'font-size:18px !important;' : ''}">
          <span id="ai-dict-term-title-text" title="${escapeHtml(termTitle)}">${escapeHtml(termTitle)}</span>
          ${currentMode === 'explain' && itemId ? `
            <button type="button" class="icon-btn" id="ai-dict-rename-explain-btn" title="Rename or shorten title (e.g. ABC do ...)" style="padding:2px 5px; opacity:0.6; font-size:11px; margin-left:2px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
          ` : ''}
          <div class="speech-controls-group" id="ai-dict-speech-group">
            <button type="button" class="speech-btn" id="ai-dict-speak-btn" title="Listen pronunciation (${escapeHtml(resolvedSpeechLang.label)})">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
              <span>Listen</span>
            </button>
            <button type="button" class="speech-menu-btn" id="ai-dict-speech-menu-btn" title="Pronunciation options">
              <span>▾</span>
            </button>
            <div class="speech-dropdown-menu" id="ai-dict-speech-menu">
              <div class="speech-menu-header">Pronunciation • ${escapeHtml(resolvedSpeechLang.label)}</div>
              <button type="button" class="speech-menu-opt" data-mode="pronounce">
                <span>🔊 Pronounce (${escapeHtml(resolvedSpeechLang.code)})</span>
                <span class="speech-badge">1.0x</span>
              </button>
              <button type="button" class="speech-menu-opt" data-mode="slow">
                <span>🐢 Slow Pronounce</span>
                <span class="speech-badge">0.65x</span>
              </button>
              <button type="button" class="speech-menu-opt" data-mode="stop" style="color:#ef4444;">
                <span>⏹ Stop Speech</span>
              </button>
            </div>
          </div>
        </div>

        <div class="color-tags" id="ai-dict-color-tags">
          ${colorDots}
        </div>
      </div>

      <div class="badges-row">
        ${language ? `<span class="badge lang">🌐 ${escapeHtml(language)}</span>` : ''}
        ${lemma && lemma !== termTitle ? `<span class="badge lemma">Lemma: ${escapeHtml(lemma)}</span>` : ''}
        ${currentMode === 'correction' ? (
          item?.mode_type === 'correction_only'
            ? `<span class="badge" style="background:rgba(34,197,94,0.15); color:#22c55e;">✍️ Correction Only</span>`
            : `<span class="badge" style="background:rgba(59,130,246,0.15); color:#3b82f6;">✍️ ${escapeHtml(item?.source_lang || 'Auto')} → ${escapeHtml(item?.target_lang || 'EN')}</span>`
        ) : ''}
        <div class="move-mode-container" style="margin-left:auto; display:flex; align-items:center; gap:4px; position:relative;">
          <button type="button" class="move-mode-dropdown-btn" id="ai-dict-move-mode-btn" title="Move to another mode & regenerate">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
            <span>Move Mode ▾</span>
          </button>
          <div class="move-mode-menu" id="ai-dict-move-mode-menu">
            ${currentMode !== 'machine_translation' ? `<button type="button" class="move-mode-opt" data-to="machine_translation">⚡ Move to Simple MT & Translate</button>` : ''}
            ${currentMode !== 'search' ? `<button type="button" class="move-mode-opt" data-to="search">🔍 Move to Word (LLM) & Regenerate</button>` : ''}
            ${currentMode !== 'explain' ? `<button type="button" class="move-mode-opt" data-to="explain">📖 Move to Explain & Regenerate</button>` : ''}
            ${currentMode !== 'translation' ? `<button type="button" class="move-mode-opt" data-to="translation">🌐 Move to Translate & Regenerate</button>` : ''}
            ${currentMode !== 'compare' ? `<button type="button" class="move-mode-opt" data-to="compare">⚖️ Move to Compare & Regenerate</button>` : ''}
            ${currentMode !== 'correction' ? `<button type="button" class="move-mode-opt" data-to="correction">✍️ Move to Correct & Regenerate</button>` : ''}
          </div>
          <button class="icon-btn" id="ai-dict-copy-btn" title="Copy explanation">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
          ${itemId ? `
          <button class="icon-btn danger-hover" id="ai-dict-delete-btn" title="Delete from history">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>` : ''}
        </div>
      </div>

      ${currentMode === 'machine_translation' ? `
        <div class="gt-dual-container" style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
          <!-- Source Box -->
          <div style="background:rgba(125,125,125,0.08); border:1px solid rgba(125,125,125,0.18); border-radius:12px; padding:12px 14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:11px; opacity:0.75;">
              <span style="font-weight:700; text-transform:uppercase;">${escapeHtml(item?.source_lang || 'Source')}</span>
              <span style="font-mono">${termTitle.length} chars</span>
            </div>
            <div style="font-size:14px; line-height:1.55; color:inherit; user-select:text; white-space:pre-wrap;">${escapeHtml(termTitle)}</div>
          </div>

          <!-- Translation Box -->
          <div style="background:rgba(59,130,246,0.09); border:1px solid rgba(59,130,246,0.25); border-radius:12px; padding:12px 14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-size:11px; font-weight:700; color:#3b82f6; text-transform:uppercase;">${escapeHtml(item?.target_lang || 'Translation')}</span>
              <div style="display:flex; align-items:center; gap:6px;">
                <button type="button" class="icon-btn" id="ai-dict-mt-regenerate-btn" title="Regenerate translation from source text" style="padding:2px 7px; border-radius:6px; font-size:11px; display:inline-flex; align-items:center; gap:4px; border:1px solid rgba(59,130,246,0.3); background:rgba(59,130,246,0.12); color:#3b82f6; cursor:pointer;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                  <span>Regenerate</span>
                </button>
                <span style="font-size:10px; background:rgba(59,130,246,0.2); color:#3b82f6; padding:2px 8px; border-radius:12px; font-weight:600; display:inline-flex; align-items:center; gap:4px;">
                  <span>⚡ Offline MT</span>
                  <span style="opacity:0.8;">• Standard 600M</span>
                </span>
              </div>
            </div>
            <textarea class="ai-dict-mt-edit-textarea" id="ai-dict-mt-edit-textarea" style="width:100%; min-height:75px; background:transparent; border:none; outline:none; font-size:15px; font-weight:500; line-height:1.6; color:inherit; resize:vertical; font-family:inherit; padding:0; box-sizing:border-box;" spellcheck="false" placeholder="Translation...">${escapeHtml(explanationText)}</textarea>
          </div>

          <!-- Return to LLM Mode Action Bar -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; padding-top:4px; gap:8px; flex-wrap:wrap;">
            <span style="font-size:11.5px; opacity:0.75; color:inherit;">
              Want full dictionary definition & grammar breakdown?
            </span>
            <div style="display:flex; align-items:center; gap:8px;">
              <button type="button" id="ai-dict-quick-llm-btn" style="display:inline-flex; align-items:center; gap:5px; padding:6px 12px; background:linear-gradient(135deg, rgba(245,158,11,0.14), rgba(217,119,6,0.18)); border:1px solid rgba(245,158,11,0.38); border-radius:10px; font-size:12px; font-weight:700; cursor:pointer; color:#f59e0b; transition:all 0.2s; box-shadow:0 1px 3px rgba(0,0,0,0.05);" title="Quick LLM: Run fast ephemeral Ling Flash lookup (No automatic save)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                <span>⚡ Quick LLM</span>
              </button>
              <button type="button" id="ai-dict-return-to-llm-btn" style="display:inline-flex; align-items:center; gap:6px; padding:6px 12px; background:linear-gradient(135deg, rgba(59,130,246,0.16), rgba(147,51,234,0.2)); border:1px solid rgba(147,51,234,0.4); border-radius:10px; font-size:12px; font-weight:700; cursor:pointer; color:#7c3aed; transition:all 0.2s; box-shadow:0 1px 3px rgba(0,0,0,0.05);" title="Switch to AI Dictionary (LLM) for detailed word definitions, examples, and etymology">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>
                <span>✨ Full LLM</span>
              </button>
            </div>
          </div>
        </div>
      ` : `
        <div class="markdown-content" id="ai-dict-markdown-view">
          ${parseMarkdownToHtml(explanationText)}
        </div>

        <div id="ai-dict-chat-history" style="margin-top:14px; display:flex; flex-direction:column; gap:8px;"></div>
      `}
    `;

    const quickLlmBtn = bodyEl.querySelector('#ai-dict-quick-llm-btn');
    if (quickLlmBtn) {
      quickLlmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        performLookup(termTitle, 'simple_llm');
      });
    }

    const returnToLlmBtn = bodyEl.querySelector('#ai-dict-return-to-llm-btn');
    if (returnToLlmBtn) {
      returnToLlmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        performLookup(termTitle, 'search');
      });
    }

    const simpleLlmSaveBtn = bodyEl.querySelector('#ai-dict-simple-llm-save-btn');
    if (simpleLlmSaveBtn) {
      simpleLlmSaveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        simpleLlmSaveBtn.disabled = true;
        simpleLlmSaveBtn.innerHTML = `<span>Saving...</span>`;
        try {
          const pid = config.activeProfileId || 1;
          const saveRes = await callBackend('/api/simple-llm/save', 'POST', {
            text: termTitle,
            content: explanationText,
            source_lang: language || undefined,
            target_lang: undefined,
            profile_id: pid,
            session_id: config.activeSessionId || undefined
          });
          simpleLlmSaveBtn.classList.add('saved');
          simpleLlmSaveBtn.innerHTML = `<span>✓ Saved</span>`;
          const bannerEl = bodyEl.querySelector('#ai-dict-simple-llm-banner');
          if (bannerEl) {
            bannerEl.className = 'status-banner';
            bannerEl.innerHTML = `
              <span>✓ Saved to <strong>${escapeHtml(config.activeProfileName || 'Profile')}</strong></span>
              <span style="opacity:0.85;">${saveRes.mode === 'search' ? 'Word' : 'Explain'} entry created</span>
            `;
          }
          if (saveRes.id) {
            itemId = saveRes.id;
            if (currentWordData) currentWordData.id = saveRes.id;
            if (chatDrawer) chatDrawer.style.display = 'block';
          }
          cachedHistoryData.search = null;
          cachedHistoryData.explain = null;
          showToast(`Saved to ${config.activeProfileName || 'Profile'}!`);
        } catch (err) {
          simpleLlmSaveBtn.disabled = false;
          simpleLlmSaveBtn.innerHTML = `<span>Retry Save</span>`;
          alert(`Failed to save: ${err.message}`);
        }
      });
    }

    const simpleLlmPromptSelect = bodyEl.querySelector('#ai-dict-simple-llm-prompt-select');
    if (simpleLlmPromptSelect) {
      simpleLlmPromptSelect.addEventListener('change', async (e) => {
        const newPromptKey = e.target.value;
        const currentActiveTab = cardTabs.find(t => t.id === activeCardTabId);
        if (currentActiveTab) {
          currentActiveTab.promptKey = newPromptKey;
          config.simpleLlmActivePrompt = newPromptKey;
          safeStorageSet({ simpleLlmActivePrompt: newPromptKey });
          currentActiveTab.isLoading = true;
          currentActiveTab.token = ++activeLookupToken;
          bodyEl.innerHTML = `
            <div class="loading-box">
              <div class="spinner"></div>
              <div style="font-size:12px; font-weight:600;">Re-analyzing with ${escapeHtml(getActiveSimpleLlmPrompts().find(p => p.id === newPromptKey)?.name || newPromptKey)}...</div>
              <div style="font-size:11px; opacity:0.6; margin-top:4px;">"${escapeHtml(termTitle)}"</div>
            </div>
          `;
          performTabLookup(currentActiveTab);
        }
      });
    }

    const simpleLlmSetDefaultBtn = bodyEl.querySelector('#ai-dict-simple-llm-set-default-btn');
    if (simpleLlmSetDefaultBtn && simpleLlmPromptSelect) {
      simpleLlmSetDefaultBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const curVal = simpleLlmPromptSelect.value || 'quick_glance';
        config.simpleLlmDefaultPrompt = curVal;
        config.simpleLlmActivePrompt = curVal;
        await safeStorageSet({ simpleLlmDefaultPrompt: curVal, simpleLlmActivePrompt: curVal });
        simpleLlmSetDefaultBtn.textContent = '✓ Default Saved';
        setTimeout(() => {
          if (simpleLlmSetDefaultBtn) simpleLlmSetDefaultBtn.textContent = '★ Set Default';
        }, 1500);
      });
    }

    const mtRegenBtn = bodyEl.querySelector('#ai-dict-mt-regenerate-btn');
    if (mtRegenBtn) {
      mtRegenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        performLookup(termTitle, 'machine_translation');
      });
    }

    const mtEditTextarea = bodyEl.querySelector('#ai-dict-mt-edit-textarea');
    if (mtEditTextarea) {
      let mtDebounce = null;
      mtEditTextarea.addEventListener('input', () => {
        const val = mtEditTextarea.value;
        explanationText = val;
        if (currentWordData) currentWordData.translated_text = val;
        if (item?.id) {
          if (mtDebounce) clearTimeout(mtDebounce);
          mtDebounce = setTimeout(() => {
            callBackend(`/api/mt/records/${item.id}/translation`, 'PATCH', { translated_text: val }).catch(() => {});
          }, 500);
        }
      });
    }

    // Render any previous follow-up chats if available
    const chatHistoryEl = bodyEl.querySelector('#ai-dict-chat-history');
    if (chatHistoryEl && chats.length > 1) {
      const firstAssistantIdx = chats.findIndex(c => c.role === 'assistant');
      chats.forEach((c, idx) => {
        if (idx === firstAssistantIdx) return;
        appendChatMessage(chatHistoryEl, c.role, c.content);
      });
    }

    // Audio Speech buttons
    const speakBtn = bodyEl.querySelector('#ai-dict-speak-btn');
    const speechMenuBtn = bodyEl.querySelector('#ai-dict-speech-menu-btn');
    const speechMenu = bodyEl.querySelector('#ai-dict-speech-menu');

    if (speakBtn) {
      speakBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        speakWord(termTitle, 'pronounce', language, speakBtn);
      });
    }

    if (speechMenuBtn && speechMenu) {
      speechMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        speechMenu.classList.toggle('open');
      });

      speechMenu.querySelectorAll('.speech-menu-opt').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          speechMenu.classList.remove('open');
          const mode = opt.dataset.mode;
          if (mode === 'stop') {
            stopSpeech();
          } else {
            speakWord(termTitle, mode, language, speakBtn);
          }
        });
      });
    }

    cardEl.addEventListener('click', (e) => {
      if (speechMenu && !e.target.closest('#ai-dict-speech-group')) {
        speechMenu.classList.remove('open');
      }
    });

    // Move Mode button & menu
    const moveModeBtn = bodyEl.querySelector('#ai-dict-move-mode-btn');
    const moveModeMenu = bodyEl.querySelector('#ai-dict-move-mode-menu');
    if (moveModeBtn && moveModeMenu) {
      moveModeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moveModeMenu.classList.toggle('open');
      });

      cardEl.addEventListener('click', (e) => {
        if (!e.target.closest('#ai-dict-move-mode-btn')) {
          moveModeMenu.classList.remove('open');
        }
      });

      document.addEventListener('click', () => {
        if (moveModeMenu) moveModeMenu.classList.remove('open');
      });

      moveModeMenu.querySelectorAll('.move-mode-opt').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          moveModeMenu.classList.remove('open');
          const targetMode = opt.dataset.to;
          moveWordMode(targetMode, termTitle, itemId);
        });
      });
    }

    // Rename button for explain mode
    const renameExplainBtn = bodyEl.querySelector('#ai-dict-rename-explain-btn');
    if (renameExplainBtn && itemId) {
      renameExplainBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const currentTitle = termTitle;
        const newTitle = prompt('Rename or shorten explanation title (e.g. ABC do ...):', currentTitle);
        if (newTitle === null) return;
        const trimmed = newTitle.trim();
        if (!trimmed || trimmed === currentTitle) return;

        try {
          await callBackend(`/api/explains/${itemId}/rename`, 'PATCH', { term: trimmed });
          termTitle = trimmed;
          const titleTextEl = bodyEl.querySelector('#ai-dict-term-title-text');
          if (titleTextEl) {
            titleTextEl.textContent = trimmed;
            titleTextEl.title = trimmed;
          }
          const activeTab = cardTabs.find(t => t.id === activeCardTabId);
          if (activeTab) {
            activeTab.word = trimmed;
            renderWordTabsBar();
          }
          if (cachedHistoryData.explain) {
            const histItem = cachedHistoryData.explain.find(i => i.id === itemId);
            if (histItem) histItem.text = trimmed;
          }
        } catch (err) {
          alert('Failed to rename: ' + err.message);
        }
      });
    }

    // Copy button
    const copyBtn = bodyEl.querySelector('#ai-dict-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(explanationText);
        copyBtn.style.color = '#22c55e';
        setTimeout(() => copyBtn.style.color = '', 1500);
      });
    }

    // Delete button
    const deleteBtn = bodyEl.querySelector('#ai-dict-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!itemId) return;
        if (!confirm(`Delete "${termTitle}" from history?`)) return;

        deleteBtn.disabled = true;
        deleteBtn.style.opacity = '0.4';

        try {
          let delEndpoint = `/api/words/${itemId}`;
          if (currentMode === 'explain') delEndpoint = `/api/explains/${itemId}`;
          else if (currentMode === 'translation') delEndpoint = `/api/translations/${itemId}`;
          else if (currentMode === 'compare') delEndpoint = `/api/comparisons/${itemId}`;
          else if (currentMode === 'correction') delEndpoint = `/api/corrections/${itemId}`;

          await callBackend(delEndpoint, 'DELETE');

          if (cachedHistoryData[currentMode]) {
            cachedHistoryData[currentMode] = cachedHistoryData[currentMode].filter(i => i.id !== itemId);
          }

          const statusBanner = bodyEl.querySelector('.status-banner');
          if (statusBanner) {
            statusBanner.style.backgroundColor = '#ef4444';
            statusBanner.style.color = '#ffffff';
            statusBanner.innerHTML = `<span>🗑️ Deleted "${escapeHtml(termTitle)}" from history</span>`;
          }

          setTimeout(() => {
            if (cardTabs.length > 1) {
              closeWordTab(activeCardTabId);
            } else if (config.persistentWindow) {
              openPersistentEmptyCard(currentMode);
            } else {
              closeCard();
            }
          }, 650);
        } catch (err) {
          console.error('Failed to delete word:', err);
          alert('Failed to delete: ' + err.message);
          deleteBtn.disabled = false;
          deleteBtn.style.opacity = '1';
        }
      });
    }

    // Color tagging
    const colorDotsEls = bodyEl.querySelectorAll('.color-tag-dot');
    colorDotsEls.forEach(dot => {
      dot.addEventListener('click', async () => {
        const selectedColor = dot.dataset.color;
        const newColor = colorTag === selectedColor ? null : selectedColor;
        colorTag = newColor;

        colorDotsEls.forEach(d => d.classList.toggle('active', d.dataset.color === newColor));

        if (itemId) {
          try {
            let colorEndpoint = `/api/words/${itemId}/color`;
            if (currentMode === 'explain') colorEndpoint = `/api/explains/${itemId}/color`;
            else if (currentMode === 'translation') colorEndpoint = `/api/translations/${itemId}/color`;
            else if (currentMode === 'compare') colorEndpoint = `/api/comparisons/${itemId}/color`;
            else if (currentMode === 'correction') colorEndpoint = `/api/corrections/${itemId}/color`;
            await callBackend(colorEndpoint, 'PATCH', { color: newColor });
            cachedHistoryData[currentMode] = null;
          } catch (e) {
            console.error('Failed to update color:', e);
          }
        }
      });
    });

    // Render Top External Tabs (Definer Tab feature)
    renderExternalTabs(termTitle, language);
  }

  function appendChatMessage(container, role, content) {
    const msg = document.createElement('div');
    if (role === 'user') {
      msg.className = 'chat-bubble-user';
      msg.style.cssText = 'align-self: flex-end; background: #3b82f6; color: #ffffff; padding: 6px 11px; border-radius: 9px; font-size: 12.5px; max-width: 85%; margin-top: 4px;';
      msg.textContent = content;
    } else {
      msg.className = 'chat-bubble-assistant';
      msg.style.cssText = 'align-self: flex-start; background: rgba(125,125,125,0.15); padding: 7px 12px; border-radius: 9px; font-size: 12.5px; max-width: 95%; margin-top: 4px; line-height: 1.5;';
      msg.innerHTML = parseMarkdownToHtml(content);
    }
    container.appendChild(msg);
  }

  function renderExternalTabs(term, lang) {
    if (!cardEl) return;
    const container = cardEl.querySelector('#ai-dict-external-tabs');
    if (!container) return;

    const sites = config.externalSites || [];
    if (!sites || sites.length === 0) {
      container.innerHTML = '';
      return;
    }

    const matchingSites = sites.filter(s => matchLanguage(lang, s.language));
    const sitesToUse = matchingSites.length > 0 ? matchingSites : sites;

    container.innerHTML = sitesToUse.map(s => {
      const url = s.url_template.replace(/\{\{str\}\}|\{word\}|\{query\}/g, encodeURIComponent(term));
      return `
        <button type="button" class="card-tab-btn" data-url="${escapeHtml(url)}" data-name="${escapeHtml(s.name)}" title="Open ${escapeHtml(s.name)} in tab">
          ${s.icon_url ? `<img src="${escapeHtml(s.icon_url)}" class="tab-icon-img"/>` : '<span class="tab-icon">📖</span>'}
          <span>${escapeHtml(s.name)}</span>
        </button>
      `;
    }).join('');

    // Image load error handling without inline CSP issues
    container.querySelectorAll('img.tab-icon-img').forEach(img => {
      img.addEventListener('error', () => {
        img.style.display = 'none';
      });
    });

    // Clicking an external tab switches directly to that dictionary view
    container.querySelectorAll('.card-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const url = btn.dataset.url;
        const name = btn.dataset.name;
        openExternalView(url, name, btn);
      });
    });
  }

  async function handleFollowUpChat(e) {
    e.preventDefault();
    const input = cardEl.querySelector('#ai-dict-chat-input');
    const text = input ? input.value.trim() : '';
    if (!text || !currentWordData || !currentWordData.id) return;

    input.value = '';
    const chatHistoryEl = cardEl.querySelector('#ai-dict-chat-history');

    // User message
    appendChatMessage(chatHistoryEl, 'user', text);

    // AI thinking placeholder
    const aiMsg = document.createElement('div');
    aiMsg.style.cssText = 'align-self: flex-start; background: rgba(125,125,125,0.15); padding: 7px 12px; border-radius: 9px; font-size: 12.5px; max-width: 95%; margin-top: 4px;';
    aiMsg.textContent = 'Thinking...';
    chatHistoryEl.appendChild(aiMsg);

    try {
      let endpoint = '/api/chat';
      let payload = { word_id: currentWordData.id, content: text };

      if (currentMode === 'explain') {
        endpoint = '/api/explains/chat';
        payload = { explain_id: currentWordData.id, content: text };
      } else if (currentMode === 'translation') {
        endpoint = '/api/translations/chat';
        payload = { translation_id: currentWordData.id, content: text };
      } else if (currentMode === 'compare') {
        endpoint = '/api/comparisons/chat';
        payload = { comparison_id: currentWordData.id, content: text };
      } else if (currentMode === 'correction') {
        endpoint = '/api/corrections/chat';
        payload = { correction_id: currentWordData.id, content: text };
      }

      const res = await callBackend(endpoint, 'POST', payload);
      const reply = res.content || res.reply || res.response || (typeof res === 'string' ? res : JSON.stringify(res));
      aiMsg.innerHTML = parseMarkdownToHtml(reply);
    } catch (err) {
      aiMsg.textContent = `Error: ${err.message}`;
      aiMsg.style.color = '#ef4444';
    }

    const cardBody = cardEl.querySelector('#ai-dict-card-body');
    if (cardBody) cardBody.scrollTop = cardBody.scrollHeight;
  }

  // Speech Engine & Multi-language Spelling
  const SPEECH_LANG_MAPPINGS = [
    { patterns: ['de', 'ger', 'deutsch', 'allemand', 'tedesco', '🇩🇪', '🇦🇹', '🇨🇭'], code: 'de-DE', label: 'German' },
    { patterns: ['en', 'eng', 'english', 'englisch', 'anglais', 'ingles', '🇺🇸', '🇬🇧', '🇨🇦', '🇦🇺'], code: 'en-US', label: 'English' },
    { patterns: ['fr', 'fre', 'fra', 'french', 'französisch', 'français', 'francais', '🇫🇷'], code: 'fr-FR', label: 'French' },
    { patterns: ['es', 'spa', 'spanish', 'spanisch', 'español', 'espanol', '🇪🇸', '🇲🇽'], code: 'es-ES', label: 'Spanish' },
    { patterns: ['it', 'ita', 'italian', 'italienisch', 'italiano', '🇮🇹'], code: 'it-IT', label: 'Italian' },
    { patterns: ['pt', 'por', 'portuguese', 'portugiesisch', 'português', 'portugues', '🇵🇹', '🇧🇷'], code: 'pt-PT', label: 'Portuguese' },
    { patterns: ['ru', 'rus', 'russian', 'russisch', 'русский', '🇷🇺'], code: 'ru-RU', label: 'Russian' },
    { patterns: ['zh', 'chi', 'zho', 'chinese', 'chinesisch', '中文', '汉语', '漢語', '🇨🇳', '🇹🇼'], code: 'zh-CN', label: 'Chinese' },
    { patterns: ['ja', 'jpn', 'jp', 'japanese', 'japanisch', '日本語', '🇯🇵'], code: 'ja-JP', label: 'Japanese' },
    { patterns: ['ko', 'kor', 'korean', 'koreanisch', '한국어', '🇰🇷'], code: 'ko-KR', label: 'Korean' },
    { patterns: ['vi', 'vie', 'vietnamese', 'vietnamesisch', 'tiếng việt', 'tieng viet', '🇻🇳'], code: 'vi-VN', label: 'Vietnamese' },
    { patterns: ['nl', 'dut', 'nld', 'dutch', 'niederländisch', 'nederlands', '🇳🇱'], code: 'nl-NL', label: 'Dutch' },
    { patterns: ['pl', 'pol', 'polish', 'polnisch', 'polski', '🇵🇱'], code: 'pl-PL', label: 'Polish' },
    { patterns: ['tr', 'tur', 'turkish', 'türkisch', 'türkçe', 'turkce', '🇹🇷'], code: 'tr-TR', label: 'Turkish' },
    { patterns: ['ar', 'ara', 'arabic', 'arabisch', 'العربية', '🇸🇦', '🇪🇬'], code: 'ar-SA', label: 'Arabic' },
    { patterns: ['sv', 'swe', 'swedish', 'schwedisch', 'svenska', '🇸🇪'], code: 'sv-SE', label: 'Swedish' },
    { patterns: ['no', 'nor', 'norwegian', 'norwegisch', 'norsk', '🇳🇴'], code: 'no-NO', label: 'Norwegian' },
    { patterns: ['da', 'dan', 'danish', 'dänisch', 'dansk', '🇩🇰'], code: 'da-DK', label: 'Danish' },
    { patterns: ['fi', 'fin', 'finnish', 'finnisch', 'suomi', '🇫🇮'], code: 'fi-FI', label: 'Finnish' },
    { patterns: ['cs', 'cze', 'ces', 'czech', 'tschechisch', 'čeština', 'cestina', '🇨🇿'], code: 'cs-CZ', label: 'Czech' },
    { patterns: ['el', 'gre', 'ell', 'greek', 'griechisch', 'ελληνικά', '🇬🇷'], code: 'el-GR', label: 'Greek' },
    { patterns: ['hi', 'hin', 'hindi', 'हिन्दी', '🇮🇳'], code: 'hi-IN', label: 'Hindi' },
    { patterns: ['th', 'tha', 'thai', 'ไทย', '🇹🇭'], code: 'th-TH', label: 'Thai' },
    { patterns: ['la', 'lat', 'latin', 'latein', 'latina'], code: 'la', label: 'Latin' }
  ];

  function resolveSpeechLanguage(wordLang, profileLang, profileName) {
    const candidates = [wordLang, profileLang, profileName].filter(Boolean);
    for (const candidate of candidates) {
      const s = String(candidate).toLowerCase().trim();
      if (!s || s === 'auto' || s.includes('🌐') || s === 'unknown') continue;
      for (const m of SPEECH_LANG_MAPPINGS) {
        if (m.patterns.some(p => s.includes(p))) {
          return { code: m.code, label: m.label };
        }
      }
    }
    return { code: 'en-US', label: 'English' };
  }

  let audioContext = null;
  let activeAudioSource = null;
  let activeSpeechAudio = null;

  function getAudioContext() {
    if (!audioContext && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioContext = new AudioCtx();
      }
    }
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }
    return audioContext;
  }

  function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  async function playAudioBase64(base64Data, rate = 1.0, onEnd = null) {
    stopSpeech();
    try {
      const ctx = getAudioContext();
      if (ctx) {
        const buffer = base64ToArrayBuffer(base64Data);
        const audioBuffer = await ctx.decodeAudioData(buffer);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = rate || 1.0;
        source.connect(ctx.destination);
        
        activeAudioSource = source;
        source.onended = () => {
          if (activeAudioSource === source) {
            activeAudioSource = null;
          }
          if (onEnd) onEnd();
        };
        source.start(0);
        return true;
      }
    } catch (err) {
      console.warn('AudioContext playback error, falling back to HTML5 Audio:', err);
    }

    // Fallback to HTML5 Audio if Web Audio API failed
    try {
      const audio = new Audio(`data:audio/mpeg;base64,${base64Data}`);
      activeSpeechAudio = audio;
      audio.playbackRate = rate || 1.0;
      audio.onended = () => {
        activeSpeechAudio = null;
        if (onEnd) onEnd();
      };
      audio.onerror = () => {
        activeSpeechAudio = null;
        if (onEnd) onEnd();
      };
      await audio.play();
      return true;
    } catch (e) {
      console.warn('HTML5 Audio fallback error:', e);
      if (onEnd) onEnd();
      return false;
    }
  }

  function stopSpeech() {
    if (activeAudioSource) {
      try {
        activeAudioSource.stop();
        activeAudioSource.disconnect();
      } catch (e) {}
      activeAudioSource = null;
    }
    if (activeSpeechAudio) {
      try {
        activeSpeechAudio.pause();
        activeSpeechAudio.currentTime = 0;
      } catch (e) {}
      activeSpeechAudio = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
    if (cardEl) {
      cardEl.querySelectorAll('.speech-playing').forEach(el => el.classList.remove('speech-playing'));
    }
  }

  function speakWord(word, mode = 'pronounce', targetLang = null, targetBtn = null) {
    stopSpeech();
    if (!word || !word.trim()) return;

    const profileLang = config.appSettings?.[`searchSourceLang_${config.activeProfileId}`] || config.appSettings?.['SEARCH_SOURCE_LANG'];
    const resolved = resolveSpeechLanguage(targetLang, profileLang, config.activeProfileName);
    const langCode = resolved.code;
    const textToSpeak = word.trim();
    const rate = mode === 'slow' ? 0.65 : 1.0;

    if (targetBtn) {
      targetBtn.classList.add('speech-playing');
    }

    const onEnd = () => {
      if (targetBtn) targetBtn.classList.remove('speech-playing');
    };

    // 1. Primary: Use background service worker GET_TTS_AUDIO + Web Audio API
    // This is 100% reliable in Brave (bypasses Brave Shields & CSP) and Firefox (no speech-dispatcher needed)
    if (isExtensionValid()) {
      safeSendMessage({
        action: 'GET_TTS_AUDIO',
        text: textToSpeak,
        lang: langCode
      }, async (resp) => {
        if (resp && resp.success && resp.data && resp.data.audio_base64) {
          const played = await playAudioBase64(resp.data.audio_base64, rate, onEnd);
          if (played) return;
        }
        fallbackSpeechSynthesis(textToSpeak, langCode, rate, onEnd);
      });
      return;
    }

    // 2. Fallback to SpeechSynthesis if extension context is unavailable
    fallbackSpeechSynthesis(textToSpeak, langCode, rate, onEnd);
  }

  function fallbackSpeechSynthesis(textToSpeak, langCode, rate, onEnd) {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.lang = langCode;
        utterance.rate = rate;
        utterance.pitch = 1.0;

        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          const langPrefix = langCode.slice(0, 2).toLowerCase();
          const bestVoice = voices.find(v => v.lang.toLowerCase() === langCode.toLowerCase()) ||
                            voices.find(v => v.lang.toLowerCase().startsWith(langPrefix));
          if (bestVoice) {
            utterance.voice = bestVoice;
          }
        }

        utterance.onend = onEnd;
        utterance.onerror = () => {
          onEnd();
          playFallbackAudio(textToSpeak, langCode, onEnd);
        };

        window.speechSynthesis.speak(utterance);
        return;
      } catch (e) {
        console.warn('SpeechSynthesis error:', e);
      }
    }

    playFallbackAudio(textToSpeak, langCode, onEnd);
  }

  function playFallbackAudio(text, lang, onEnd) {
    try {
      const langCode = (lang || 'en-US').slice(0, 2).toLowerCase();
      const encoded = encodeURIComponent(text.slice(0, 100));
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${langCode}&q=${encoded}`;
      const audio = new Audio(url);
      activeSpeechAudio = audio;
      audio.onended = () => {
        activeSpeechAudio = null;
        if (onEnd) onEnd();
      };
      audio.onerror = () => {
        activeSpeechAudio = null;
        if (onEnd) onEnd();
      };
      audio.play().catch(() => {
        activeSpeechAudio = null;
        if (onEnd) onEnd();
      });
    } catch (e) {
      if (onEnd) onEnd();
    }
  }

  // Backend API caller through background script
  function callBackend(endpoint, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
      if (!isExtensionValid()) {
        reject(new Error('Extension context invalidated. Please reload the webpage.'));
        return;
      }
      safeSendMessage({
        action: 'API_CALL',
        endpoint: endpoint,
        method: method,
        body: body
      }, (response) => {
        if (!response || !response.success) {
          reject(new Error(response?.error || 'Unknown network error'));
          return;
        }
        resolve(response.data);
      });
    });
  }

  // =========================================================================
  // SECONDARY WINDOW (Quick Lookup for words inside Persistent Window)
  // =========================================================================

  function extractWordAroundOffset(text, offset) {
    if (!text || offset < 0 || offset > text.length) return '';
    let start = offset;
    let end = offset;
    while (start > 0 && /[\p{L}\p{N}_\-]/u.test(text[start - 1])) {
      start--;
    }
    while (end < text.length && /[\p{L}\p{N}_\-]/u.test(text[end])) {
      end++;
    }
    return text.slice(start, end).trim();
  }

  function handleCardInnerSelection(e) {
    if (!config.persistentWindow || !cardEl) return;

    let text = '';
    let rect = null;

    // 1. Try shadowRoot.getSelection() or window.getSelection()
    let sel = null;
    if (shadowRoot && typeof shadowRoot.getSelection === 'function') {
      try { sel = shadowRoot.getSelection(); } catch (err) {}
    }
    if (!sel || !sel.toString().trim()) {
      try { sel = window.getSelection(); } catch (err) {}
    }

    if (sel && sel.toString().trim()) {
      const raw = sel.toString().trim();
      const cleaned = cleanSelectedText(raw);
      if (cleaned && cleaned.length > 0 && cleaned.length <= 150) {
        text = cleaned;
        if (sel.rangeCount > 0) {
          try {
            const r = sel.getRangeAt(0).getBoundingClientRect();
            if (r.width > 0 || r.height > 0) {
              rect = r;
            }
          } catch (err) {}
        }
      }
    }

    // 2. Fallback caretRangeFromPoint if selection was collapsed
    if (!text && document.caretRangeFromPoint) {
      try {
        const caret = document.caretRangeFromPoint(e.clientX, e.clientY);
        if (caret && caret.startContainer && caret.startContainer.nodeType === Node.TEXT_NODE) {
          const fullText = caret.startContainer.textContent || '';
          const offset = caret.startOffset;
          const extracted = extractWordAroundOffset(fullText, offset);
          const cleaned = cleanSelectedText(extracted);
          if (cleaned && cleaned.length > 0 && cleaned.length <= 150) {
            text = cleaned;
            const r = caret.getBoundingClientRect();
            if (r.width > 0 || r.height > 0) {
              rect = r;
            }
          }
        }
      } catch (err) {}
    }

    if (!text) return;

    // Avoid searching if selected text is same as current main term
    if (currentSelectionText && text.toLowerCase() === currentSelectionText.toLowerCase()) {
      return;
    }

    if (!rect || (rect.width === 0 && rect.height === 0)) {
      rect = {
        left: e.clientX,
        right: e.clientX,
        top: e.clientY,
        bottom: e.clientY,
        width: 0,
        height: 0
      };
    }

    openSecondaryCard(rect, text);
  }

  function setupPersistentCardWordSelection(el) {
    if (!el) return;

    // Double-click on words in persistent card body
    el.addEventListener('dblclick', (e) => {
      if (!config.persistentWindow) return;

      // Ignore interactive controls, buttons, selects, search bar, header, history panel, chat drawer, word tabs bar
      if (e.target.closest('input, textarea, select, button, #ai-dict-drag-header, #ai-dict-word-tabs-bar, #ai-dict-card-search-bar, #ai-dict-chat-drawer, #ai-dict-history-panel, .move-mode-menu, .speech-dropdown-menu')) {
        return;
      }

      const body = e.target.closest('#ai-dict-card-body, #ai-dict-chat-messages');
      if (!body) return;

      // Ignore title row and action bars
      if (e.target.closest('.word-term, .speech-controls-group, .color-tags, .move-mode-container')) {
        return;
      }

      if (cardMouseUpTimer) {
        clearTimeout(cardMouseUpTimer);
        cardMouseUpTimer = null;
      }

      setTimeout(() => {
        handleCardInnerSelection(e);
      }, 20);
    });

    // Mouseup drag-selection in persistent card body
    el.addEventListener('mouseup', (e) => {
      if (!config.persistentWindow) return;

      if (e.target.closest('input, textarea, select, button, #ai-dict-drag-header, #ai-dict-word-tabs-bar, #ai-dict-card-search-bar, #ai-dict-chat-drawer, #ai-dict-history-panel, .move-mode-menu, .speech-dropdown-menu')) {
        return;
      }

      const body = e.target.closest('#ai-dict-card-body, #ai-dict-chat-messages');
      if (!body) return;

      if (e.target.closest('.word-term, .speech-controls-group, .color-tags, .move-mode-container')) {
        return;
      }

      if (e.detail >= 2) return;

      if (cardMouseUpTimer) {
        clearTimeout(cardMouseUpTimer);
        cardMouseUpTimer = null;
      }

      cardMouseUpTimer = setTimeout(() => {
        cardMouseUpTimer = null;
        handleCardInnerSelection(e);
      }, 160);
    });
  }

  function calculateSecondaryCardPosition(rect, secWidth = 400, secHeight = 360) {
    const padding = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x, y;
    const mainRect = cardEl ? cardEl.getBoundingClientRect() : null;

    if (mainRect) {
      // 1. Try placing to the right of the persistent card
      if (mainRect.right + secWidth + padding <= vw) {
        x = mainRect.right + padding;
        y = Math.max(padding, Math.min(rect.top, vh - secHeight - padding));
      } 
      // 2. Try placing to the left of the persistent card
      else if (mainRect.left - secWidth - padding >= 0) {
        x = mainRect.left - secWidth - padding;
        y = Math.max(padding, Math.min(rect.top, vh - secHeight - padding));
      } 
      // 3. Fallback: float near selection rect
      else {
        x = rect.right + padding;
        if (x + secWidth > vw - padding) {
          x = rect.left - secWidth - padding;
        }
        if (x < padding) {
          x = Math.max(padding, (vw - secWidth) / 2);
        }
        y = rect.bottom + 8;
        if (y + secHeight > vh - padding) {
          y = Math.max(padding, rect.top - secHeight - 8);
        }
      }
    } else {
      x = rect.right + padding;
      if (x + secWidth > vw - padding) x = vw - secWidth - padding;
      y = Math.max(padding, Math.min(rect.top, vh - secHeight - padding));
    }

    x = Math.max(padding, Math.min(x, vw - secWidth - padding));
    y = Math.max(padding, Math.min(y, vh - secHeight - padding));

    return { x: Math.round(x), y: Math.round(y), width: secWidth, maxHeight: secHeight };
  }

  function closeSecondaryCard() {
    secondaryLookupToken++;
    stopSpeech();
    if (secondaryCardEl && secondaryCardEl.parentNode) {
      secondaryCardEl.parentNode.removeChild(secondaryCardEl);
      secondaryCardEl = null;
    }
    isSecondaryCardOpen = false;
  }

  async function openSecondaryCard(rect, word) {
    closeSecondaryCard();
    syncHostContainerParent();
    if (!shadowRoot || !word) return;

    isSecondaryCardOpen = true;
    const thisToken = ++secondaryLookupToken;

    const pos = calculateSecondaryCardPosition(rect, 400, 420);

    secondaryCardEl = document.createElement('div');
    secondaryCardEl.className = `ai-dict-secondary-card theme-${config.theme || 'tokyonight'}`;
    secondaryCardEl.style.left = `${pos.x}px`;
    secondaryCardEl.style.top = `${pos.y}px`;
    secondaryCardEl.style.width = `${pos.width}px`;
    secondaryCardEl.style.maxHeight = `${pos.maxHeight}px`;

    secondaryCardEl.innerHTML = `
      <div class="secondary-card-header" id="ai-dict-sec-drag-header">
        <div class="secondary-header-left">
          <div class="secondary-drag-grip" title="Drag to move">
            <svg width="10" height="12" viewBox="0 0 12 16" fill="currentColor">
              <circle cx="3" cy="3" r="1.5"></circle>
              <circle cx="9" cy="3" r="1.5"></circle>
              <circle cx="3" cy="8" r="1.5"></circle>
              <circle cx="9" cy="8" r="1.5"></circle>
              <circle cx="3" cy="13" r="1.5"></circle>
              <circle cx="9" cy="13" r="1.5"></circle>
            </svg>
          </div>
          <span class="secondary-title-badge">✦ Quick Lookup</span>
          <span class="secondary-profile-badge">${escapeHtml(config.activeProfileName || 'Profile')}</span>
          <span class="secondary-term-preview" title="${escapeHtml(word)}">${escapeHtml(word)}</span>
        </div>
        <div class="secondary-header-actions">
          <button type="button" class="secondary-action-btn promote-btn" id="ai-dict-sec-to-main-btn" title="Open as main word in persistent window">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </button>
          <button type="button" class="secondary-action-btn delete-btn" id="ai-dict-sec-del-btn" title="Delete from history" style="display:none;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
          <button type="button" class="secondary-action-btn close-btn" id="ai-dict-sec-close-btn" title="Close (or click outside / Esc)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <div class="secondary-card-body" id="ai-dict-sec-body">
        <div class="loading-box" style="padding: 24px 16px;">
          <div class="spinner"></div>
          <div style="font-size:12px; font-weight:600; margin-top:8px;">Looking up "${escapeHtml(word)}"...</div>
        </div>
      </div>
    `;

    // Make secondary card draggable by its header
    setupDraggable(secondaryCardEl, secondaryCardEl.querySelector('#ai-dict-sec-drag-header'));

    // Header buttons
    const closeBtn = secondaryCardEl.querySelector('#ai-dict-sec-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeSecondaryCard();
      });
    }

    const promoteBtn = secondaryCardEl.querySelector('#ai-dict-sec-to-main-btn');
    if (promoteBtn) {
      promoteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeSecondaryCard();
        openCardAtRect(null, word, 'search');
      });
    }

    shadowRoot.appendChild(secondaryCardEl);

    try {
      const pid = config.activeProfileId || 1;
      const appSettings = config.appSettings || {};
      const srcLang = appSettings[`searchSourceLang_${pid}`] || appSettings['SEARCH_SOURCE_LANG'] || '';
      const tgtLang = appSettings[`searchTargetLang_${pid}`] || appSettings['SEARCH_TARGET_LANG'] || '';

      const res = await callBackend('/api/search', 'POST', {
        term: word,
        profile_id: pid,
        session_id: config.activeSessionId || undefined,
        source_language: srcLang || undefined,
        target_language: tgtLang || undefined
      });

      if (thisToken !== secondaryLookupToken || !isSecondaryCardOpen || !secondaryCardEl) {
        return;
      }

      renderSecondaryResult(res, word);
    } catch (err) {
      if (thisToken !== secondaryLookupToken || !isSecondaryCardOpen || !secondaryCardEl) return;
      const bodyEl = secondaryCardEl.querySelector('#ai-dict-sec-body');
      if (bodyEl) {
        bodyEl.innerHTML = `
          <div class="status-banner error" style="margin: 8px 0;">
            <span>Failed to look up: ${escapeHtml(err.message)}</span>
          </div>
          <div style="font-size:11.5px; opacity:0.8; margin-top:4px;">
            Make sure AI Dict backend is running locally.
          </div>
        `;
      }
    }
  }

  function renderSecondaryResult(data, termQuery) {
    if (!secondaryCardEl) return;
    const bodyEl = secondaryCardEl.querySelector('#ai-dict-sec-body');
    if (!bodyEl) return;

    const item = data.word || data;
    const termTitle = item.term || termQuery;
    const language = item.language || '';
    const lemma = item.lemma || '';
    const chats = Array.isArray(data.chats) ? data.chats : [];
    const assistantChat = chats.find(c => c.role === 'assistant') || chats[0];
    const explanationText = assistantChat ? assistantChat.content : (item.explanation || '');

    const profileLangSetting = config.appSettings?.[`searchSourceLang_${config.activeProfileId}`] || config.appSettings?.['SEARCH_SOURCE_LANG'];
    const resolvedSpeechLang = resolveSpeechLanguage(language, profileLangSetting, config.activeProfileName);

    bodyEl.innerHTML = `
      <div class="secondary-term-row">
        <div class="secondary-term-title">
          <span>${escapeHtml(termTitle)}</span>
          <button type="button" class="speech-btn secondary-listen-btn" id="ai-dict-sec-listen-btn" title="Listen pronunciation (${escapeHtml(resolvedSpeechLang.label)})">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
            <span>Listen</span>
          </button>
        </div>
        <button type="button" class="secondary-load-main-link" id="ai-dict-sec-promote-link" title="Load as main word into persistent window">
          <span>↗ Open in Main</span>
        </button>
      </div>

      <div class="secondary-badges-row">
        ${language ? `<span class="badge lang">🌐 ${escapeHtml(language)}</span>` : ''}
        ${lemma && lemma !== termTitle ? `<span class="badge lemma">Lemma: ${escapeHtml(lemma)}</span>` : ''}
        <span style="font-size:11px; opacity:0.65; margin-left:auto;">${item?.search_count ? `Searched ${item.search_count}x` : ''}</span>
      </div>

      <div class="markdown-content secondary-markdown-view">
        ${parseMarkdownToHtml(explanationText)}
      </div>

      <div class="secondary-footer">
        <span>Saved to <strong>${escapeHtml(config.activeProfileName || 'Profile')}</strong></span>
        <span>Viewed ${item?.view_count || 1}x</span>
      </div>
    `;

    // Listen pronunciation
    const listenBtn = bodyEl.querySelector('#ai-dict-sec-listen-btn');
    if (listenBtn) {
      listenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        speakWord(termTitle, 'pronounce', language, listenBtn);
      });
    }

    // Load into main window link
    const promoteLink = bodyEl.querySelector('#ai-dict-sec-promote-link');
    if (promoteLink) {
      promoteLink.addEventListener('click', (e) => {
        e.stopPropagation();
        closeSecondaryCard();
        openCardAtRect(null, termTitle, 'search');
      });
    }

    // Delete button in secondary card header
    const secDelBtn = secondaryCardEl.querySelector('#ai-dict-sec-del-btn');
    if (secDelBtn) {
      if (item?.id) {
        secDelBtn.style.display = 'inline-flex';
        secDelBtn.onclick = async (e) => {
          e.stopPropagation();
          if (!confirm(`Delete "${termTitle}" from history?`)) return;
          secDelBtn.disabled = true;
          try {
            await callBackend(`/api/words/${item.id}`, 'DELETE');
            if (cachedHistoryData['search']) {
              cachedHistoryData['search'] = cachedHistoryData['search'].filter(i => i.id !== item.id);
            }
            closeSecondaryCard();
          } catch (err) {
            alert('Failed to delete: ' + err.message);
            secDelBtn.disabled = false;
          }
        };
      } else {
        secDelBtn.style.display = 'none';
      }
    }
  }

  // Dragging support - Pointer Events with Pointer Capture & Capture-phase window release
  function setupDraggable(element, customHeader = null) {
    const header = customHeader || element.querySelector('#ai-dict-drag-header') || element.querySelector('.secondary-card-header');
    if (!header || header.dataset.draggableBound === 'true') return;
    header.dataset.draggableBound = 'true';

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let activePointerId = null;

    const onPointerDown = (e) => {
      // Only drag on primary click (left mouse button or touch)
      if (e.button !== undefined && e.button !== 0) return;

      // Don't drag if clicking interactive buttons, selects, inputs, or menus
      if (e.target.closest('button, select, input, textarea, a, .simple-mt-lang-capsule, .simple-mt-lang-group, .pause-menu, .speech-dropdown-menu, .move-mode-menu, .secondary-action-btn, .secondary-load-main-link')) {
        return;
      }

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      // CRITICAL: Use getBoundingClientRect() because element is position: fixed.
      const rect = element.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      element.classList.add('ai-dict-dragging');
      document.body.style.userSelect = 'none';

      // Capture pointer so pointerup and pointermove are guaranteed to reach the header
      activePointerId = e.pointerId;
      if (activePointerId !== undefined && header.setPointerCapture) {
        try {
          header.setPointerCapture(activePointerId);
        } catch (err) {}
      }

      // Add direct listeners on header
      header.addEventListener('pointermove', onPointerMove, { passive: false });
      header.addEventListener('pointerup', onPointerUp, { passive: false });
      header.addEventListener('pointercancel', onPointerUp, { passive: false });
      header.addEventListener('lostpointercapture', onPointerUp, { passive: false });

      // Window and document listeners in CAPTURE phase: guarantees un-grasp even if
      // mouse is released over containerEl (which calls stopPropagation) or host iframes!
      window.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
      window.addEventListener('pointerup', onPointerUp, { capture: true, passive: false });
      window.addEventListener('pointercancel', onPointerUp, { capture: true, passive: false });
      window.addEventListener('mousemove', onPointerMove, { capture: true, passive: false });
      window.addEventListener('mouseup', onPointerUp, { capture: true, passive: false });
      document.addEventListener('mouseup', onPointerUp, { capture: true, passive: false });
      window.addEventListener('blur', onPointerUp);

      e.preventDefault();
    };

    function onPointerMove(e) {
      if (!isDragging) return;
      e.preventDefault();
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const newLeft = Math.max(5, Math.min(window.innerWidth - element.offsetWidth - 5, initialLeft + dx));
      const newTop = Math.max(5, Math.min(window.innerHeight - element.offsetHeight - 5, initialTop + dy));

      element.style.left = `${Math.round(newLeft)}px`;
      element.style.top = `${Math.round(newTop)}px`;
    }

    function onPointerUp(e) {
      if (!isDragging) return;
      isDragging = false;
      element.classList.remove('ai-dict-dragging');
      document.body.style.userSelect = '';

      if (activePointerId !== null && header.releasePointerCapture) {
        try {
          if (header.hasPointerCapture && header.hasPointerCapture(activePointerId)) {
            header.releasePointerCapture(activePointerId);
          }
        } catch (err) {}
      }
      activePointerId = null;

      header.removeEventListener('pointermove', onPointerMove);
      header.removeEventListener('pointerup', onPointerUp);
      header.removeEventListener('pointercancel', onPointerUp);
      header.removeEventListener('lostpointercapture', onPointerUp);

      window.removeEventListener('pointermove', onPointerMove, { capture: true });
      window.removeEventListener('pointerup', onPointerUp, { capture: true });
      window.removeEventListener('pointercancel', onPointerUp, { capture: true });
      window.removeEventListener('mousemove', onPointerMove, { capture: true });
      window.removeEventListener('mouseup', onPointerUp, { capture: true });
      document.removeEventListener('mouseup', onPointerUp, { capture: true });
      window.removeEventListener('blur', onPointerUp);
    }

    header.addEventListener('pointerdown', onPointerDown);
    header.addEventListener('mousedown', onPointerDown);
    header.addEventListener('dragstart', (e) => e.preventDefault());
  }

  // Resizing support + REMEMBER SIZE IN CHROME STORAGE
  function setupResizable(element) {
    const cornerHandle = element.querySelector('#ai-dict-resize-corner');
    const rightHandle = element.querySelector('#ai-dict-resize-r');
    const bottomHandle = element.querySelector('#ai-dict-resize-b');

    setupHandle(cornerHandle, true, true);
    setupHandle(rightHandle, true, false);
    setupHandle(bottomHandle, false, true);

    function setupHandle(handle, resizeW, resizeH) {
      if (!handle || handle.dataset.resizableBound === 'true') return;
      handle.dataset.resizableBound = 'true';

      let isResizing = false;
      let startX = 0;
      let startY = 0;
      let startW = 0;
      let startH = 0;
      let startLeft = 0;
      let startTop = 0;

      const onResizeDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startW = element.offsetWidth;
        startH = element.offsetHeight;
        const rect = element.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;

        window.addEventListener('mousemove', onResizeMove, { capture: true, passive: false });
        window.addEventListener('mouseup', onResizeUp, { capture: true, passive: false });
        window.addEventListener('pointermove', onResizeMove, { capture: true, passive: false });
        window.addEventListener('pointerup', onResizeUp, { capture: true, passive: false });
        window.addEventListener('blur', onResizeUp);

        e.preventDefault();
        e.stopPropagation();
      };

      function onResizeMove(e) {
        if (!isResizing) return;
        e.preventDefault();
        if (resizeW) {
          const newW = Math.max(300, Math.min(window.innerWidth - startLeft - 8, startW + (e.clientX - startX)));
          element.style.width = `${Math.round(newW)}px`;
        }
        if (resizeH) {
          const newH = Math.max(200, Math.min(window.innerHeight - startTop - 8, startH + (e.clientY - startY)));
          element.style.height = `${Math.round(newH)}px`;
        }
      }

      function onResizeUp() {
        if (!isResizing) return;
        isResizing = false;
        window.removeEventListener('mousemove', onResizeMove, { capture: true });
        window.removeEventListener('mouseup', onResizeUp, { capture: true });
        window.removeEventListener('pointermove', onResizeMove, { capture: true });
        window.removeEventListener('pointerup', onResizeUp, { capture: true });
        window.removeEventListener('blur', onResizeUp);

        // Remember size in chrome storage!
        const savedW = element.offsetWidth;
        const savedH = element.offsetHeight;
        if (element.classList.contains('simple-mt-card')) {
          config.simpleMtWidth = savedW;
          config.simpleMtHeight = savedH;
          safeStorageSet({ simpleMtWidth: savedW, simpleMtHeight: savedH });
        } else {
          config.cardWidth = savedW;
          config.cardHeight = savedH;
          safeStorageSet({ cardWidth: savedW, cardHeight: savedH });
        }
      }

      handle.addEventListener('mousedown', onResizeDown);
      handle.addEventListener('pointerdown', onResizeDown);
    }
  }

  // Language matching helper for external sites
  function matchLanguage(aiLanguage, templateLanguage) {
    if (!templateLanguage) return true;
    const tpl = templateLanguage.toLowerCase().trim();
    if (tpl === 'all' || !tpl) return true;
    if (!aiLanguage) return false;

    const ai = aiLanguage.toLowerCase().trim();
    const tpls = tpl.split(',').map(s => s.trim());
    if (tpls.includes('all')) return true;
    if (tpls.some(t => ai.includes(t) || t.includes(ai))) return true;

    const map = {
      en: ['english', 'en', 'eng'],
      de: ['german', 'deutsch', 'de', 'ger'],
      vi: ['vietnamese', 'vi', 'vie'],
      fr: ['french', 'français', 'fr', 'fra'],
      es: ['spanish', 'español', 'es', 'spa'],
      ja: ['japanese', 'ja', 'jpn'],
      zh: ['chinese', 'zh', 'zho', 'chi']
    };

    for (const [code, aliases] of Object.entries(map)) {
      if (aliases.some(a => ai.includes(a))) {
        if (tpls.some(t => aliases.includes(t) || t === code)) {
          return true;
        }
      }
    }
    return false;
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

  // Safe, structured markdown to HTML parser
  function parseMarkdownToHtml(md) {
    if (!md) return '';

    const lines = String(md).split('\n');
    let html = '';
    let inList = false;
    let listType = 'ul';
    let inCodeBlock = false;
    let codeBlockContent = '';
    let codeBlockLang = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code blocks ```
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          if (codeBlockLang === 'mermaid') {
            const rawChart = codeBlockContent.trimEnd();
            html += `<div class="ai-dict-mermaid-card">
              <div class="ai-dict-mermaid-header">
                <span class="ai-dict-mermaid-title">📊 Mermaid Diagram</span>
                <button type="button" class="ai-dict-mermaid-copy-btn" data-code="${escapeHtml(rawChart)}" title="Copy diagram code">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  <span>Copy Code</span>
                </button>
              </div>
              <pre class="ai-dict-mermaid-pre"><code>${escapeHtml(rawChart)}</code></pre>
            </div>`;
          } else {
            html += `<pre><code>${escapeHtml(codeBlockContent.trimEnd())}</code></pre>`;
          }
          codeBlockContent = '';
          codeBlockLang = '';
          inCodeBlock = false;
        } else {
          if (inList) { html += `</${listType}>`; inList = false; }
          inCodeBlock = true;
          codeBlockContent = '';
          codeBlockLang = line.trim().slice(3).trim().toLowerCase();
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent += line + '\n';
        continue;
      }

      const trimmed = line.trim();

      // Blank line
      if (!trimmed) {
        if (inList) { html += `</${listType}>`; inList = false; }
        continue;
      }

      // Table parsing
      if (trimmed.includes('|') && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
        if (inList) { html += `</${listType}>`; inList = false; }
        const headerCells = parseTableCells(lines[i]);
        const alignments = getTableAlignments(lines[i + 1]);
        i += 1; // Skip delimiter row

        let tableHtml = '<div class="table-container"><table><thead><tr>';
        for (let col = 0; col < headerCells.length; col++) {
          const align = alignments[col] ? ` style="text-align: ${alignments[col]};"` : '';
          tableHtml += `<th${align}>${formatInline(headerCells[col])}</th>`;
        }
        tableHtml += '</tr></thead><tbody>';

        while (i + 1 < lines.length && lines[i + 1].trim().includes('|') && !isTableDelimiter(lines[i + 1])) {
          i += 1;
          const rowCells = parseTableCells(lines[i]);
          tableHtml += '<tr>';
          for (let col = 0; col < headerCells.length; col++) {
            const align = alignments[col] ? ` style="text-align: ${alignments[col]};"` : '';
            const val = rowCells[col] !== undefined ? rowCells[col] : '';
            tableHtml += `<td${align}>${formatInline(val)}</td>`;
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
        html += `<h6>${formatInline(trimmed.slice(7))}</h6>`;
        continue;
      }
      if (trimmed.startsWith('##### ')) {
        if (inList) { html += `</${listType}>`; inList = false; }
        html += `<h5>${formatInline(trimmed.slice(6))}</h5>`;
        continue;
      }
      if (trimmed.startsWith('#### ')) {
        if (inList) { html += `</${listType}>`; inList = false; }
        html += `<h4>${formatInline(trimmed.slice(5))}</h4>`;
        continue;
      }
      if (trimmed.startsWith('### ')) {
        if (inList) { html += `</${listType}>`; inList = false; }
        html += `<h3>${formatInline(trimmed.slice(4))}</h3>`;
        continue;
      }
      if (trimmed.startsWith('## ')) {
        if (inList) { html += `</${listType}>`; inList = false; }
        html += `<h2>${formatInline(trimmed.slice(3))}</h2>`;
        continue;
      }
      if (trimmed.startsWith('# ')) {
        if (inList) { html += `</${listType}>`; inList = false; }
        html += `<h1>${formatInline(trimmed.slice(2))}</h1>`;
        continue;
      }

      // Unordered list item
      const ulMatch = line.match(/^(\s*)([\*\-]\s+)(.*)$/);
      if (ulMatch) {
        if (!inList || listType !== 'ul') {
          if (inList) html += `</${listType}>`;
          html += '<ul>';
          inList = true;
          listType = 'ul';
        }
        html += `<li>${formatInline(ulMatch[3])}</li>`;
        continue;
      }

      // Ordered list item
      const olMatch = line.match(/^(\s*)(\d+[\.\)]\s+)(.*)$/);
      if (olMatch) {
        if (!inList || listType !== 'ol') {
          if (inList) html += `</${listType}>`;
          html += '<ol>';
          inList = true;
          listType = 'ol';
        }
        html += `<li>${formatInline(olMatch[3])}</li>`;
        continue;
      }

      // Normal paragraph line
      if (inList) {
        html += `</${listType}>`;
        inList = false;
      }

      html += `<p>${formatInline(trimmed)}</p>`;
    }

    if (inList) html += `</${listType}>`;
    if (inCodeBlock) html += `<pre><code>${escapeHtml(codeBlockContent.trimEnd())}</code></pre>`;

    return html;
  }

  function formatInline(str) {
    if (!str) return '';
    let text = escapeHtml(str);
    // Inline code `code`
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold ***text***
    text = text.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    // Bold **text**
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic *text*
    text = text.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
    // Italic _text_
    text = text.replace(/(^|\s)_([^_]+)_($|\s)/g, '$1<em>$2</em>$3');
    return text;
  }

})();
