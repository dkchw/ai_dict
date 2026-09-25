// AI Dict - Background Service Worker (Manifest V3)

const DEFAULT_SETTINGS = {
  serverUrl: 'http://127.0.0.1:4321',
  activeProfileId: 1,
  activeProfileName: 'Default',
  activeSessionId: '',
  triggerMode: 'bubble', // 'bubble', 'auto', 'dblclick', 'key'
  doubleClickLookup: true, // Default: true - double-click word to query directly without icon
  isPaused: false,
  pauseUntil: 0,
  modifierKey: 'none',   // 'none', 'alt', 'ctrl', 'shift', 'meta'
  theme: 'tokyonight',   // 'tokyonight', 'dark', 'light'
  defaultMode: 'machine_translation', // 'machine_translation' (offline MT default), 'search', 'explain', 'translation', 'compare', 'correction'
  cardWidth: 560,
  cardHeight: 640,
  simpleMtWidth: 480,
  simpleMtHeight: 380,
  autoDetectSentence: true,
  cardPlacement: 'auto', // 'auto', 'side', 'below', 'above'
  openExternalInTab: true,
  showExternalFallbackOverlay: false, // Default: false - turn off iframe restriction warning overlay
  defaultPersistentWindow: false, // Default: false - persistent floating window is tab-dependent
  persistentNewTabOnLoading: false, // Default: false - open new tab in persistent window if previous word still loading
  blacklist: ['docs.google.com', 'sheets.google.com'],
  externalSites: []
};

// Tab-dependent persistent window tracking (Set of active tab IDs)
const persistentTabIds = new Set();

// Restore from chrome.storage.session if available
if (chrome.storage?.session) {
  try {
    chrome.storage.session.get(['persistentTabIds'], (res) => {
      if (Array.isArray(res?.persistentTabIds)) {
        res.persistentTabIds.forEach(id => persistentTabIds.add(id));
      }
    });
  } catch (e) {}
}

function syncPersistentTabsToSession() {
  if (chrome.storage?.session) {
    try {
      chrome.storage.session.set({ persistentTabIds: Array.from(persistentTabIds) }).catch(() => {});
    } catch (e) {}
  }
}

// Clean up when tabs close
chrome.tabs.onRemoved.addListener((tabId) => {
  if (persistentTabIds.has(tabId)) {
    persistentTabIds.delete(tabId);
    syncPersistentTabsToSession();
  }
});

// Initialize settings and context menu on installation
chrome.runtime.onInstalled.addListener(async () => {
  // Clear any legacy global persistentWindow key so it never leaks across tabs
  chrome.storage.local.remove(['persistentWindow']).catch(() => {});

  const current = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const toSet = {};
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (current[k] === undefined) {
      toSet[k] = v;
    }
  }
  // Ensure default action is MT translate
  if (!current.defaultMode || current.defaultMode === 'search') {
    toSet.defaultMode = 'machine_translation';
  }
  if (Object.keys(toSet).length > 0) {
    await chrome.storage.local.set(toSet);
  }

  // Setup context menu
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'ai-dict-lookup',
      title: "Look up '%s' in AI Dict",
      contexts: ['selection']
    });
  });

  // Re-inject content.js into existing tabs on reload/install
  if (chrome.scripting) {
    try {
      const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
      for (const tab of tabs) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        }).catch(() => {});
      }
    } catch (e) {}
  }
});

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'ai-dict-lookup' && tab?.id) {
    const text = (info.selectionText || '').trim();
    if (text) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'TRIGGER_LOOKUP',
        text: text
      }).catch(err => {
        console.warn('Could not send message to tab:', err);
      });
    }
  }
});

// Proxy API requests to avoid CORS / Mixed Content issues
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'API_CALL') {
    handleApiCall(request)
      .then(res => sendResponse({ success: true, data: res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Asynchronous response
  }

  if (request.action === 'OPEN_APP') {
    chrome.storage.local.get(['serverUrl'], (items) => {
      const base = (items.serverUrl || DEFAULT_SETTINGS.serverUrl).replace(/\/+$/, '');
      const path = request.path ? (request.path.startsWith('/') ? request.path : '/' + request.path) : '';
      const url = `${base}${path}`;
      chrome.tabs.create({ url });
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'GET_TTS_AUDIO') {
    handleTtsAudio(request)
      .then(res => sendResponse({ success: true, data: res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'OPEN_EXTERNAL') {
    if (request.url) {
      chrome.tabs.create({ url: request.url, active: !request.inBackground });
      sendResponse({ success: true });
    }
    return true;
  }

  if (request.action === 'GET_TAB_PERSISTENT') {
    const tabId = request.tabId || sender.tab?.id;
    const isPersistent = tabId ? persistentTabIds.has(tabId) : false;
    sendResponse({ success: true, persistent: isPersistent });
    return true;
  }

  if (request.action === 'SET_TAB_PERSISTENT') {
    const tabId = request.tabId || sender.tab?.id;
    if (tabId) {
      if (request.persistent) {
        persistentTabIds.add(tabId);
      } else {
        persistentTabIds.delete(tabId);
      }
      syncPersistentTabsToSession();
      sendResponse({ success: true, persistent: persistentTabIds.has(tabId) });
    } else {
      sendResponse({ success: false });
    }
    return true;
  }

  if (request.action === 'TOGGLE_TAB_PERSISTENT') {
    const tabId = request.tabId || sender.tab?.id;
    if (tabId) {
      const newState = !persistentTabIds.has(tabId);
      if (newState) {
        persistentTabIds.add(tabId);
      } else {
        persistentTabIds.delete(tabId);
      }
      syncPersistentTabsToSession();
      chrome.tabs.sendMessage(tabId, { action: 'SET_PERSISTENT_STATE', persistent: newState }).catch(() => {});
      sendResponse({ success: true, persistent: newState });
    } else {
      sendResponse({ success: false });
    }
    return true;
  }
});

async function handleApiCall({ endpoint, method = 'GET', body = null }) {
  const { serverUrl } = await chrome.storage.local.get(['serverUrl']);
  const base = (serverUrl || DEFAULT_SETTINGS.serverUrl).replace(/\/+$/, '');
  const url = `${base}${endpoint}`;

  const options = {
    method: method.toUpperCase(),
    headers: {
      'Accept': 'application/json'
    }
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      const text = await res.text();
      let errorMsg = text;
      try {
        const json = JSON.parse(text);
        if (json.detail) errorMsg = json.detail;
      } catch (e) {}
      throw new Error(`[${res.status}] ${errorMsg}`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await res.json();
    }
    return await res.text();
  } catch (err) {
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      throw new Error(`Cannot connect to AI Dict at ${base}. Make sure the app is running (ai_dict serve).`);
    }
    throw err;
  }
}

async function handleTtsAudio({ text, lang = 'en' }) {
  const cleanText = (text || '').trim();
  if (!cleanText) throw new Error('Text is empty');
  let cleanLang = (lang || 'en').trim().toLowerCase();
  if (cleanLang.includes('-') && !cleanLang.startsWith('zh')) {
    cleanLang = cleanLang.split('-')[0];
  }
  if (!cleanLang || cleanLang === 'auto' || cleanLang === 'unknown') {
    cleanLang = 'en';
  }

  // 1. Try local backend first (if running with /api/tts)
  try {
    const { serverUrl } = await chrome.storage.local.get(['serverUrl']);
    const base = (serverUrl || DEFAULT_SETTINGS.serverUrl).replace(/\/+$/, '');
    const backendRes = await fetch(`${base}/api/tts?format=base64&text=${encodeURIComponent(cleanText.slice(0, 200))}&lang=${encodeURIComponent(cleanLang)}`);
    if (backendRes.ok) {
      const contentType = backendRes.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await backendRes.json();
        if (json.audio_base64) {
          return json;
        }
      }
    }
  } catch (e) {}

  // 2. Direct fetch from Google TTS via background service worker (Bypasses page CSP and Brave Shields)
  const encoded = encodeURIComponent(cleanText.slice(0, 200));
  const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${cleanLang}&q=${encoded}`;
  const resp = await fetch(ttsUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://translate.google.com/'
    }
  });

  if (!resp.ok) {
    throw new Error(`TTS audio fetch returned HTTP ${resp.status}`);
  }

  const arrayBuf = await resp.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 = btoa(binary);
  return { audio_base64: b64, mime_type: 'audio/mpeg', lang: cleanLang };
}

function updateBadge(isPaused) {
  if (isPaused) {
    chrome.action.setBadgeText({ text: '⏸' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    chrome.action.setTitle({ title: 'AI Dict (Paused - Click to resume)' });
  } else {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: 'AI Dict' });
  }
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.isPaused) {
    updateBadge(changes.isPaused.newValue === true);
  }
});

chrome.storage.local.get(['isPaused', 'pauseUntil'], (items) => {
  if (items.isPaused) {
    if (items.pauseUntil && items.pauseUntil > 0 && Date.now() >= items.pauseUntil) {
      chrome.storage.local.set({ isPaused: false, pauseUntil: 0 });
      updateBadge(false);
    } else {
      updateBadge(true);
    }
  } else {
    updateBadge(false);
  }
});

// Periodic check for pause expiry
setInterval(() => {
  chrome.storage.local.get(['isPaused', 'pauseUntil'], (items) => {
    if (items.isPaused && items.pauseUntil && items.pauseUntil > 0 && Date.now() >= items.pauseUntil) {
      chrome.storage.local.set({ isPaused: false, pauseUntil: 0 });
      updateBadge(false);
    }
  });
}, 30000);

// Keyboard commands listener
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle_card') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs && tabs[0];
      if (activeTab && activeTab.id && activeTab.url && !activeTab.url.startsWith('chrome://') && !activeTab.url.startsWith('edge://') && !activeTab.url.startsWith('about:')) {
        chrome.tabs.sendMessage(activeTab.id, { action: 'TOGGLE_CARD' }, () => {
          if (chrome.runtime.lastError && chrome.scripting) {
            chrome.scripting.executeScript({
              target: { tabId: activeTab.id },
              files: ['content.js']
            }, () => {
              setTimeout(() => {
                chrome.tabs.sendMessage(activeTab.id, { action: 'TOGGLE_CARD' });
              }, 100);
            });
          }
        });
      }
    });
  }
});
