// In-memory cache for instant lookups (no async delay)
let blockedCache = [];

// Load cache from storage
async function loadCache() {
  const { blockedSites } = await chrome.storage.local.get("blockedSites");
  blockedCache = blockedSites || [];
}

// Initialize
chrome.runtime.onInstalled.addListener(async () => {
  const { blockedSites } = await chrome.storage.local.get("blockedSites");
  if (!blockedSites) {
    await chrome.storage.local.set({ blockedSites: ["ultimatesurferprotector.com"] });
  }
  await loadCache();

  chrome.contextMenus.create({
    id: "block-this-site",
    title: "Block this site",
    contexts: ["all"],
  });
  chrome.contextMenus.create({
    id: "unblock-this-site",
    title: "Unblock this site",
    contexts: ["all"],
  });
});

// Reload cache on startup and whenever storage changes
chrome.runtime.onStartup.addListener(loadCache);
chrome.storage.onChanged.addListener((changes) => {
  if (changes.blockedSites) {
    blockedCache = changes.blockedSites.newValue || [];
  }
});

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Synchronous check against in-memory cache - no async delay
function isBlockedSync(url) {
  const domain = getDomain(url);
  if (!domain) return false;
  return blockedCache.some(
    (blocked) => domain === blocked || domain.endsWith("." + blocked)
  );
}

function killTab(tabId) {
  chrome.tabs.remove(tabId).catch(() => {});
}

// Use declarativeNetRequest to block at the network level
async function updateBlockRules() {
  await loadCache();

  // Remove all existing dynamic rules
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map((r) => r.id);

  // Create a block rule for each domain
  const addRules = blockedCache.map((domain, i) => ({
    id: i + 1,
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter: `||${domain}`,
      resourceTypes: [
        "main_frame", "sub_frame", "stylesheet", "script", "image",
        "font", "object", "xmlhttprequest", "ping", "media",
        "websocket", "webtransport", "webbundle", "other"
      ],
    },
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules: addRules,
  });
}

// Update rules on install/startup and storage changes
chrome.runtime.onInstalled.addListener(updateBlockRules);
chrome.runtime.onStartup.addListener(updateBlockRules);
chrome.storage.onChanged.addListener((changes) => {
  if (changes.blockedSites) updateBlockRules();
});

// Still catch tabs as backup - but now synchronous
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0 && isBlockedSync(details.url)) {
    killTab(details.tabId);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  const url = tab.pendingUrl || tab.url;
  if (url && isBlockedSync(url)) {
    killTab(tab.id);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.pendingUrl || tab.url;
  if (url && isBlockedSync(url)) {
    killTab(tabId);
  }
});

// Context menu handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const domain = getDomain(tab.url);
  if (!domain) return;

  const { blockedSites } = await chrome.storage.local.get("blockedSites");
  const sites = blockedSites || [];

  if (info.menuItemId === "block-this-site") {
    if (!sites.includes(domain)) {
      sites.push(domain);
      await chrome.storage.local.set({ blockedSites: sites });
      killTab(tab.id);
    }
  } else if (info.menuItemId === "unblock-this-site") {
    const filtered = sites.filter((s) => s !== domain);
    await chrome.storage.local.set({ blockedSites: filtered });
  }
});

// Initial cache load
loadCache();
