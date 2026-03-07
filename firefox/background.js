// In-memory cache for instant lookups
let blockedCache = [];

// Load cache from storage
async function loadCache() {
  const result = await browser.storage.local.get("blockedSites");
  blockedCache = result.blockedSites || [];
  updateWebRequestFilter();
}

// Initialize
browser.runtime.onInstalled.addListener(async () => {
  const result = await browser.storage.local.get("blockedSites");
  if (!result.blockedSites) {
    await browser.storage.local.set({
      blockedSites: ["ultimatesurferprotector.com"],
    });
  }
  await loadCache();

  browser.contextMenus.create({
    id: "block-this-site",
    title: "Block this site",
    contexts: ["all"],
  });
  browser.contextMenus.create({
    id: "unblock-this-site",
    title: "Unblock this site",
    contexts: ["all"],
  });
});

browser.runtime.onStartup.addListener(loadCache);
browser.storage.onChanged.addListener((changes) => {
  if (changes.blockedSites) {
    blockedCache = changes.blockedSites.newValue || [];
    updateWebRequestFilter();
  }
});

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isBlockedSync(url) {
  const domain = getDomain(url);
  if (!domain) return false;
  return blockedCache.some(
    (blocked) => domain === blocked || domain.endsWith("." + blocked)
  );
}

function killTab(tabId) {
  browser.tabs.remove(tabId).catch(() => {});
}

// Build URL patterns for webRequest filter
function buildPatterns() {
  if (blockedCache.length === 0) return ["<all_urls>"];
  const patterns = [];
  blockedCache.forEach((domain) => {
    patterns.push(`*://${domain}/*`);
    patterns.push(`*://*.${domain}/*`);
  });
  return patterns;
}

// Track the current listener so we can remove/re-add it
let currentListener = null;

function updateWebRequestFilter() {
  // Remove existing listener if any
  if (currentListener) {
    browser.webRequest.onBeforeRequest.removeListener(currentListener);
    currentListener = null;
  }

  if (blockedCache.length === 0) return;

  // Create new blocking listener
  currentListener = function (details) {
    if (isBlockedSync(details.url)) {
      // Close the tab if it's a main frame request
      if (details.type === "main_frame" && details.tabId > 0) {
        killTab(details.tabId);
      }
      return { cancel: true };
    }
    return {};
  };

  browser.webRequest.onBeforeRequest.addListener(
    currentListener,
    { urls: buildPatterns() },
    ["blocking"]
  );
}

// Backup: catch new tabs
browser.tabs.onCreated.addListener((tab) => {
  const url = tab.url;
  if (url && isBlockedSync(url)) {
    killTab(tab.id);
  }
});

// Backup: catch navigations
browser.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0 && isBlockedSync(details.url)) {
    killTab(details.tabId);
  }
});

// Context menu handler
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  const domain = getDomain(tab.url);
  if (!domain) return;

  const result = await browser.storage.local.get("blockedSites");
  const sites = result.blockedSites || [];

  if (info.menuItemId === "block-this-site") {
    if (!sites.includes(domain)) {
      sites.push(domain);
      await browser.storage.local.set({ blockedSites: sites });
      killTab(tab.id);
    }
  } else if (info.menuItemId === "unblock-this-site") {
    const filtered = sites.filter((s) => s !== domain);
    await browser.storage.local.set({ blockedSites: filtered });
  }
});

// Initial load
loadCache();
