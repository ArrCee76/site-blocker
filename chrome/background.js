// Site Blocker v2 — built-in blocklist from StevenBlack/hosts + manual blocks

const HOSTS_URL = 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts';
const MAX_BUILTIN = 4900; // leave 100 slots for manual rules
const MANUAL_OFFSET = 4901; // manual rules start at this ID

// In-memory caches
let manualCache = [];
let builtinCache = [];
let builtinEnabled = true;

// --- Storage helpers ---

async function loadManual() {
  const { blockedSites } = await chrome.storage.local.get('blockedSites');
  manualCache = blockedSites || [];
}

async function loadBuiltinState() {
  const { builtinEnabled: enabled } = await chrome.storage.local.get('builtinEnabled');
  builtinEnabled = enabled !== false; // default true
}

async function loadBuiltinDomains() {
  const { builtinDomains } = await chrome.storage.local.get('builtinDomains');
  builtinCache = builtinDomains || [];
}

// --- Fetch and parse Steven Black hosts file ---

async function fetchBlocklist() {
  try {
    const res = await fetch(HOSTS_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();

    const domains = [];
    const seen = new Set();

    for (const line of text.split('\n')) {
      // Skip comments and blank lines
      if (!line || line.startsWith('#') || line.startsWith(' ')) continue;

      // Format: 0.0.0.0 domain.com
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2 || parts[0] !== '0.0.0.0') continue;

      const domain = parts[1].toLowerCase();

      // Skip localhost entries and invalid domains
      if (domain === '0.0.0.0' || domain === 'localhost' || domain === 'localhost.localdomain') continue;
      if (domain === 'local' || domain === 'broadcasthost') continue;
      if (!domain.includes('.')) continue;

      // Deduplicate
      if (seen.has(domain)) continue;
      seen.add(domain);

      domains.push(domain);
      if (domains.length >= MAX_BUILTIN) break;
    }

    // Store the domains
    await chrome.storage.local.set({
      builtinDomains: domains,
      builtinLastUpdate: Date.now(),
      builtinCount: domains.length
    });

    builtinCache = domains;
    console.log('Site Blocker: loaded ' + domains.length + ' domains from StevenBlack/hosts');
    return domains.length;
  } catch (err) {
    console.error('Site Blocker: failed to fetch blocklist:', err);
    return 0;
  }
}

// --- Declarative net request rules ---

async function updateAllRules() {
  await loadManual();
  await loadBuiltinState();
  await loadBuiltinDomains();

  // Remove all existing dynamic rules
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map(r => r.id);

  const addRules = [];
  const resourceTypes = [
    'main_frame', 'sub_frame', 'stylesheet', 'script', 'image',
    'font', 'object', 'xmlhttprequest', 'ping', 'media',
    'websocket', 'webtransport', 'webbundle', 'other'
  ];

  // Built-in rules (IDs 1 to MAX_BUILTIN)
  if (builtinEnabled) {
    builtinCache.forEach((domain, i) => {
      addRules.push({
        id: i + 1,
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: '||' + domain,
          resourceTypes: resourceTypes
        }
      });
    });
  }

  // Manual rules (IDs starting at MANUAL_OFFSET)
  manualCache.forEach((domain, i) => {
    addRules.push({
      id: MANUAL_OFFSET + i,
      priority: 2, // higher priority so manual always wins
      action: { type: 'block' },
      condition: {
        urlFilter: '||' + domain,
        resourceTypes: resourceTypes
      }
    });
  });

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules: addRules
  });

  console.log('Site Blocker: ' + addRules.length + ' rules active (' +
    (builtinEnabled ? builtinCache.length : 0) + ' built-in, ' +
    manualCache.length + ' manual)');
}

// --- Sync check for tab killing ---

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isBlockedSync(url) {
  const domain = getDomain(url);
  if (!domain) return false;

  const check = (blocked) => domain === blocked || domain.endsWith('.' + blocked);

  if (manualCache.some(check)) return true;
  if (builtinEnabled && builtinCache.some(check)) return true;
  return false;
}

function killTab(tabId) {
  chrome.tabs.remove(tabId).catch(() => {});
}

// --- Event listeners ---

chrome.runtime.onInstalled.addListener(async (details) => {
  // Initialize manual list if first install
  if (details.reason === 'install') {
    const { blockedSites } = await chrome.storage.local.get('blockedSites');
    if (!blockedSites) {
      await chrome.storage.local.set({ blockedSites: [] });
    }
    await chrome.storage.local.set({ builtinEnabled: true });
  }

  // Fetch blocklist on install or update
  await fetchBlocklist();
  await updateAllRules();

  // Set up context menus
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'block-this-site',
      title: 'Block this site',
      contexts: ['all']
    });
    chrome.contextMenus.create({
      id: 'unblock-this-site',
      title: 'Unblock this site',
      contexts: ['all']
    });
  });

  // Set up weekly update alarm
  chrome.alarms.create('update-blocklist', { periodInMinutes: 10080 }); // 7 days
});

chrome.runtime.onStartup.addListener(async () => {
  await loadManual();
  await loadBuiltinState();
  await loadBuiltinDomains();

  // Check if we need to update (older than 7 days)
  const { builtinLastUpdate } = await chrome.storage.local.get('builtinLastUpdate');
  if (!builtinLastUpdate || Date.now() - builtinLastUpdate > 7 * 24 * 60 * 60 * 1000) {
    await fetchBlocklist();
    await updateAllRules();
  }
});

// Weekly update
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'update-blocklist') {
    await fetchBlocklist();
    await updateAllRules();
  }
});

// Storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.blockedSites) {
    manualCache = changes.blockedSites.newValue || [];
    updateAllRules();
  }
  if (changes.builtinEnabled) {
    builtinEnabled = changes.builtinEnabled.newValue !== false;
    updateAllRules();
  }
});

// Tab killing as backup
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0 && isBlockedSync(details.url)) {
    killTab(details.tabId);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  const url = tab.pendingUrl || tab.url;
  if (url && isBlockedSync(url)) killTab(tab.id);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.pendingUrl || tab.url;
  if (url && isBlockedSync(url)) killTab(tabId);
});

// Context menu handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const domain = getDomain(tab.url);
  if (!domain) return;

  const { blockedSites } = await chrome.storage.local.get('blockedSites');
  const sites = blockedSites || [];

  if (info.menuItemId === 'block-this-site') {
    if (!sites.includes(domain)) {
      sites.push(domain);
      await chrome.storage.local.set({ blockedSites: sites });
      killTab(tab.id);
    }
  } else if (info.menuItemId === 'unblock-this-site') {
    const filtered = sites.filter(s => s !== domain);
    await chrome.storage.local.set({ blockedSites: filtered });
  }
});

// Message handler for popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'updateBlocklist') {
    fetchBlocklist().then(count => {
      updateAllRules();
      sendResponse({ ok: true, count: count });
    }).catch(err => {
      sendResponse({ ok: false, error: err.message });
    });
    return true;
  }
  if (msg.action === 'getStats') {
    chrome.storage.local.get(['builtinCount', 'builtinLastUpdate', 'builtinEnabled'], (result) => {
      sendResponse({
        builtinCount: result.builtinCount || 0,
        lastUpdate: result.builtinLastUpdate || null,
        builtinEnabled: result.builtinEnabled !== false
      });
    });
    return true;
  }
});

// Initial load
loadManual();
loadBuiltinState();
loadBuiltinDomains();
