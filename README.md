# 🛡️ Site Blocker

A lightweight browser extension that blocks unwanted websites at the network level. Blocked sites never load — tabs are killed instantly before any content appears.

Built to stop annoying popup/redirect sites (like those spawned by torrent sites) from disrupting your workflow.

## Features

- **Instant blocking** — blocked domains are intercepted at the network level before the page loads
- **Right-click to block** — right-click on any page and select "Block this site" to add it to your blocklist
- **Right-click to unblock** — remove a site just as easily
- **Popup manager** — click the extension icon to view, add, or remove blocked sites
- **Tab auto-close** — if a blocked site tries to open in a new tab, the tab is killed immediately
- **Subdomain matching** — blocking `example.com` also blocks `ads.example.com`, `tracker.example.com`, etc.

## Installation

### Chrome / Edge (Manifest V3)

1. Download or clone this repository
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge)
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the `chrome/` folder

### Firefox (Manifest V2)

1. Download or clone this repository
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on**
4. Select any file inside the `firefox/` folder (e.g. `manifest.json`)

> **Note:** Temporary add-ons are removed when Firefox restarts. For permanent installation, the extension needs to be signed via [addons.mozilla.org](https://addons.mozilla.org) or installed in Firefox Developer/Nightly with `xpinstall.signatures.required` set to `false` in `about:config`.

## Usage

### Block a site

**Option 1:** Right-click anywhere on the page you want to block → select **"Block this site"**. The tab closes immediately and the domain is added to your blocklist.

**Option 2:** Click the extension icon → type a domain (e.g. `example.com`) → click **Block**.

### Unblock a site

**Option 1:** Right-click on any page → select **"Unblock this site"** (removes the current page's domain from the blocklist).

**Option 2:** Click the extension icon → click the **×** next to the domain you want to unblock.

### What happens when a blocked site tries to open?

The request is cancelled at the network level and the tab is closed automatically. You won't see a flash of the page or a redirect — it just doesn't open.

## How It Works

### Chrome / Edge

Uses the `declarativeNetRequest` API to set up dynamic blocking rules at the network level. This is the same API used by modern ad blockers like uBlock Origin. An in-memory cache of blocked domains ensures that tab-level checks (via `webNavigation` and `tabs` listeners) are synchronous with no async delay.

### Firefox

Uses the `webRequest.onBeforeRequest` API with the `blocking` flag to synchronously cancel requests to blocked domains before they reach the browser. Backup listeners on `webNavigation` and `tabs` events provide additional coverage.

## Default Blocklist

The extension comes with one site pre-blocked:

- `ultimatesurferprotector.com`

You can add or remove sites at any time through the right-click menu or the popup interface.

## Project Structure

```
site-blocker/
├── chrome/                  # Chrome/Edge extension (Manifest V3)
│   ├── manifest.json
│   ├── background.js        # Service worker with declarativeNetRequest
│   ├── popup.html           # Blocklist manager UI
│   ├── popup.js
│   ├── blocked.html         # (unused in current version - tabs auto-close)
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
├── firefox/                 # Firefox extension (Manifest V2)
│   ├── manifest.json
│   ├── background.js        # Background script with webRequest blocking
│   ├── popup.html
│   ├── popup.js
│   ├── blocked.html
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
└── README.md
```

## Permissions

| Permission | Why it's needed |
|---|---|
| `storage` | Persist the blocklist across sessions |
| `contextMenus` | Right-click "Block/Unblock this site" |
| `tabs` | Detect and close tabs navigating to blocked sites |
| `webNavigation` | Intercept navigations before they complete |
| `declarativeNetRequest` (Chrome) | Block requests at the network level |
| `webRequest` + `webRequestBlocking` (Firefox) | Block requests at the network level |
| `<all_urls>` | Monitor all URLs to check against the blocklist |

## Privacy

This extension runs entirely locally. No data is sent anywhere. Your blocklist is stored in your browser's local extension storage and never leaves your device.

## License

MIT

## Author

[ArrCee76](https://github.com/ArrCee76)
