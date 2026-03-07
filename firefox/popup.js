const siteList = document.getElementById("siteList");
const emptyMsg = document.getElementById("emptyMsg");
const countEl = document.getElementById("count");
const domainInput = document.getElementById("domainInput");
const addBtn = document.getElementById("addBtn");

function cleanDomain(input) {
  let d = input.trim().toLowerCase();
  // Strip protocol
  d = d.replace(/^https?:\/\//, "");
  // Strip www
  d = d.replace(/^www\./, "");
  // Strip path/query
  d = d.replace(/[\/\?#].*$/, "");
  return d;
}

async function loadSites() {
  const { blockedSites } = await browser.storage.local.get("blockedSites");
  const sites = blockedSites || [];

  countEl.textContent = sites.length;
  siteList.innerHTML = "";

  if (sites.length === 0) {
    emptyMsg.style.display = "block";
    return;
  }

  emptyMsg.style.display = "none";

  sites
    .sort((a, b) => a.localeCompare(b))
    .forEach((domain) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span class="dot"></span>
        <span class="domain">${domain}</span>
        <button class="remove" data-domain="${domain}" title="Unblock">×</button>
      `;
      siteList.appendChild(li);
    });

  // Attach remove handlers
  document.querySelectorAll(".remove").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const domain = btn.dataset.domain;
      const { blockedSites } = await browser.storage.local.get("blockedSites");
      const filtered = (blockedSites || []).filter((s) => s !== domain);
      await browser.storage.local.set({ blockedSites: filtered });
      loadSites();
    });
  });
}

addBtn.addEventListener("click", async () => {
  const domain = cleanDomain(domainInput.value);
  if (!domain) return;

  const { blockedSites } = await browser.storage.local.get("blockedSites");
  const sites = blockedSites || [];

  if (!sites.includes(domain)) {
    sites.push(domain);
    await browser.storage.local.set({ blockedSites: sites });
  }

  domainInput.value = "";
  loadSites();
});

domainInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addBtn.click();
});

loadSites();
