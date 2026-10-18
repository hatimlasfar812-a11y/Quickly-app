import {
  fetchHypermarkets,
  resolveStoreConfig,
  escapeHtml,
  normalizeText,
  safeImageUrl,
  PLACEHOLDER_IMG,
  bindCartBadge,
  refreshIcons
} from "./hypermarket-core.js";

const grid = document.getElementById("storesGrid");
const searchInput = document.getElementById("searchInput");
const countInfo = document.getElementById("countInfo");

let stores = [];

// bouton retour : historique si possible, sinon accueil
document.getElementById("backBtn").addEventListener("click", e => {
  if (history.length > 1) {
    e.preventDefault();
    history.back();
  }
});

bindCartBadge(document.getElementById("cartBadge"));

// ---------- affichage ----------
function deliveryLabel(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "number") return `${value} min`;
  return String(value);
}

function cardHtml(h) {
  const cfg = resolveStoreConfig(h);
  const href = cfg ? cfg.page : "";
  const logo = safeImageUrl(h.image) || PLACEHOLDER_IMG;
  const place = [h.city, h.address].filter(Boolean).join(" · ");
  const delivery = deliveryLabel(h.deliveryTime);
  
  const inner = `
    <div class="cover">
      <img src="${escapeHtml(logo)}" alt="Logo ${escapeHtml(h.name)}" loading="lazy">
    </div>
    <div class="body">
      <h3>${escapeHtml(h.name || "Supermarché")}</h3>
      ${place ? `<div class="meta"><i data-lucide="map-pin"></i><span>${escapeHtml(place)}</span></div>` : ""}
      ${delivery ? `<div class="meta"><i data-lucide="clock"></i><span>Livraison ${escapeHtml(delivery)}</span></div>` : ""}
      <div class="tags">
        <span class="tag">Supermarché</span>
        ${cfg ? `<span class="tag open">Disponible</span>` : `<span class="tag soon">Bientôt</span>`}
      </div>
      ${cfg ? `<div class="go"><span>Voir les produits</span><i data-lucide="chevron-right"></i></div>` : ""}
    </div>`;
  
  return cfg ?
    `<a class="store-card" href="${escapeHtml(href)}">${inner}</a>` :
    `<div class="store-card is-soon" aria-disabled="true">${inner}</div>`;
}

function render() {
  const q = normalizeText(searchInput.value);
  
  const list = stores
    .filter(h => !q || normalizeText(`${h.name} ${h.city} ${h.chain}`).includes(q))
    .sort((a, b) => {
      const pa = resolveStoreConfig(a) ? 0 : 1;
      const pb = resolveStoreConfig(b) ? 0 : 1;
      return pa - pb || String(a.name).localeCompare(String(b.name), "fr");
    });
  
  countInfo.textContent = stores.length ?
    `${list.length} magasin${list.length > 1 ? "s" : ""}` :
    "";
  
  if (!list.length) {
    grid.innerHTML = `
      <div class="state" style="grid-column:1/-1">
        <i data-lucide="store"></i>
        <h3>${stores.length ? "Aucun résultat" : "Aucun supermarché disponible"}</h3>
        <p>${stores.length ? "Essayez un autre nom." : "Revenez bientôt, de nouveaux magasins arrivent."}</p>
      </div>`;
  } else {
    grid.innerHTML = list.map(cardHtml).join("");
  }
  refreshIcons();
}

function showError() {
  grid.innerHTML = `
    <div class="state" style="grid-column:1/-1">
      <i data-lucide="circle-alert"></i>
      <h3>Chargement impossible</h3>
      <p>Vérifiez votre connexion puis réessayez.</p>
      <button class="btn" id="retryBtn" type="button">Réessayer</button>
    </div>`;
  refreshIcons();
  document.getElementById("retryBtn").onclick = load;
}

async function load() {
  grid.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;
  try {
    stores = await fetchHypermarkets();
    render();
  } catch (err) {
    console.error("[groceries] chargement impossible :", err);
    showError();
  }
}

// ---------- erreurs d'image : logo de remplacement ----------
grid.addEventListener("error", e => {
  const img = e.target;
  if (img.tagName === "IMG" && !img.dataset.fallback) {
    img.dataset.fallback = "1";
    img.src = PLACEHOLDER_IMG;
  }
}, true);

let timer;
searchInput.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(render, 150);
});

refreshIcons();
load();