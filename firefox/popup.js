const siteList = document.getElementById('siteList');
const emptyMsg = document.getElementById('emptyMsg');
const countEl = document.getElementById('count');
const domainInput = document.getElementById('domainInput');
const addBtn = document.getElementById('addBtn');
const builtinToggle = document.getElementById('builtinToggle');
const builtinStats = document.getElementById('builtinStats');
const updateBtn = document.getElementById('updateBtn');

function cleanDomain(input) {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '');
  d = d.replace(/^www\./, '');
  d = d.replace(/[\/\?#].*$/, '');
  return d;
}

// Load built-in list stats
function loadStats() {
  browser.runtime.sendMessage({ action: 'getStats' }, (response) => {
    if (!response) return;

    builtinToggle.checked = response.builtinEnabled;

    let statsText = response.builtinCount.toLocaleString() + ' domains';
    if (response.lastUpdate) {
      const date = new Date(response.lastUpdate);
      const days = Math.floor((Date.now() - response.lastUpdate) / (1000 * 60 * 60 * 24));
      if (days === 0) statsText += ' · updated today';
      else if (days === 1) statsText += ' · updated yesterday';
      else statsText += ' · updated ' + days + 'd ago';
    }
    builtinStats.textContent = statsText;
  });
}

// Toggle built-in list
builtinToggle.addEventListener('change', () => {
  browser.storage.local.set({ builtinEnabled: builtinToggle.checked });
  loadStats();
  loadSites();
});

// Update blocklist
updateBtn.addEventListener('click', () => {
  updateBtn.textContent = 'Updating...';
  updateBtn.disabled = true;

  browser.runtime.sendMessage({ action: 'updateBlocklist' }, (response) => {
    if (response && response.ok) {
      updateBtn.textContent = 'Done!';
      setTimeout(() => { updateBtn.textContent = 'Update now'; updateBtn.disabled = false; }, 2000);
    } else {
      updateBtn.textContent = 'Failed';
      setTimeout(() => { updateBtn.textContent = 'Update now'; updateBtn.disabled = false; }, 2000);
    }
    loadStats();
  });
});

async function loadSites() {
  const { blockedSites, builtinEnabled: enabled } = await browser.storage.local.get(['blockedSites', 'builtinEnabled']);
  const sites = blockedSites || [];
  const builtinOn = enabled !== false;

  // Count: manual + builtin if enabled
  browser.runtime.sendMessage({ action: 'getStats' }, (response) => {
    const builtinCount = (builtinOn && response) ? response.builtinCount : 0;
    countEl.textContent = (sites.length + builtinCount).toLocaleString();
  });

  siteList.innerHTML = '';

  if (sites.length === 0) {
    emptyMsg.style.display = 'block';
    return;
  }

  emptyMsg.style.display = 'none';

  sites
    .sort((a, b) => a.localeCompare(b))
    .forEach((domain) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="dot"></span>
        <span class="domain">${domain}</span>
        <button class="remove" data-domain="${domain}" title="Unblock">×</button>
      `;
      siteList.appendChild(li);
    });

  document.querySelectorAll('.remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.domain;
      const { blockedSites } = await browser.storage.local.get('blockedSites');
      const filtered = (blockedSites || []).filter(s => s !== domain);
      await browser.storage.local.set({ blockedSites: filtered });
      loadSites();
    });
  });
}

addBtn.addEventListener('click', async () => {
  const domain = cleanDomain(domainInput.value);
  if (!domain) return;

  const { blockedSites } = await browser.storage.local.get('blockedSites');
  const sites = blockedSites || [];

  if (!sites.includes(domain)) {
    sites.push(domain);
    await browser.storage.local.set({ blockedSites: sites });
  }

  domainInput.value = '';
  loadSites();
});

domainInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addBtn.click();
});

loadSites();
loadStats();
