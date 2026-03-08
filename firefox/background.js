// Site Blocker v2 (Firefox) — built-in blocklist from StevenBlack/hosts + manual blocks
// Uses webRequest blocking API (MV2) instead of declarativeNetRequest

const HOSTS_URL = 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts';
const MAX_BUILTIN = 4900;

// In-memory caches
let manualCache = [];
let builtinCache = [];
let builtinEnabled = true;

// --- Storage helpers ---

async function loadManual() {
  const result = await browser.storage.local.get('blockedSites');
  manualCache = result.blockedSites || [];
}

async function loadBuiltinState() {
  const result = await browser.storage.local.get('builtinEnabled');
  builtinEnabled = result.builtinEnabled !== false;
}

async function loadBuiltinDomains() {
  const result = await browser.storage.local.get('builtinDomains');
  builtinCache = result.builtinDomains || [];
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
      if (!line || line.startsWith('#') || line.startsWith(' ')) continue;

      const parts = line.trim().split(/\s+/);
      if (parts.length < 2 || parts[0] !== '0.0.0.0') continue;

      const domain = parts[1].toLowerCase();

      if (domain === '0.0.0.0' || domain === 'localhost' || domain === 'localhost.localdomain') continue;
      if (domain === 'local' || domain === 'broadcasthost') continue;
      if (!domain.includes('.')) continue;

      if (seen.has(domain)) continue;
      seen.add(domain);

      domains.push(domain);
      if (domains.length >= MAX_BUILTIN) break;
    }

    await browser.storage.local.set({
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

// --- Domain checking ---

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isBlocked(url) {
  const domain = getDomain(url);
  if (!domain) return false;

  const check = (blocked) => domain === blocked || domain.endsWith('.' + blocked);

  if (manualCache.some(check)) return true;
  if (builtinEnabled && builtinCache.some(check)) return true;
  return false;
}

function killTab(tabId) {
  browser.tabs.remove(tabId).catch(() => {});
}

// --- webRequest blocking ---

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (isBlocked(details.url)) {
      return { cancel: true };
    }
    return {};
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);

// --- Event listeners ---

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const result = await browser.storage.local.get('blockedSites');
    if (!result.blockedSites) {
      await browser.storage.local.set({ blockedSites: [] });
    }
    await browser.storage.local.set({ builtinEnabled: true });
  }

  await fetchBlocklist();

  browser.contextMenus.removeAll(() => {
    browser.contextMenus.create({
      id: 'block-this-site',
      title: 'Block this site',
      contexts: ['all']
    });
    browser.contextMenus.create({
      id: 'unblock-this-site',
      title: 'Unblock this site',
      contexts: ['all']
    });
  });

  browser.alarms.create('update-blocklist', { periodInMinutes: 10080 });
});

browser.runtime.onStartup.addListener(async () => {
  await loadManual();
  await loadBuiltinState();
  await loadBuiltinDomains();

  const result = await browser.storage.local.get('builtinLastUpdate');
  if (!result.builtinLastUpdate || Date.now() - result.builtinLastUpdate > 7 * 24 * 60 * 60 * 1000) {
    await fetchBlocklist();
  }
});

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'update-blocklist') {
    await fetchBlocklist();
  }
});

browser.storage.onChanged.addListener((changes) => {
  if (changes.blockedSites) {
    manualCache = changes.blockedSites.newValue || [];
  }
  if (changes.builtinEnabled) {
    builtinEnabled = changes.builtinEnabled.newValue !== false;
  }
});

// Tab killing as backup
browser.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0 && isBlocked(details.url)) {
    killTab(details.tabId);
  }
});

browser.tabs.onCreated.addListener((tab) => {
  const url = tab.pendingUrl || tab.url;
  if (url && isBlocked(url)) killTab(tab.id);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.pendingUrl || tab.url;
  if (url && isBlocked(url)) killTab(tabId);
});

// Context menu handler
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  const domain = getDomain(tab.url);
  if (!domain) return;

  const result = await browser.storage.local.get('blockedSites');
  const sites = result.blockedSites || [];

  if (info.menuItemId === 'block-this-site') {
    if (!sites.includes(domain)) {
      sites.push(domain);
      await browser.storage.local.set({ blockedSites: sites });
      killTab(tab.id);
    }
  } else if (info.menuItemId === 'unblock-this-site') {
    const filtered = sites.filter(s => s !== domain);
    await browser.storage.local.set({ blockedSites: filtered });
  }
});

// Message handler for popup
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'updateBlocklist') {
    fetchBlocklist().then(count => {
      sendResponse({ ok: true, count: count });
    }).catch(err => {
      sendResponse({ ok: false, error: err.message });
    });
    return true;
  }
  if (msg.action === 'getStats') {
    browser.storage.local.get(['builtinCount', 'builtinLastUpdate', 'builtinEnabled']).then(result => {
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
