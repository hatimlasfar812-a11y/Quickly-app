// =====================================================
// carrefour.js — page magasin
// Toute la logique réutilisable est dans hypermarket-core.js.
// Pour BIM / Marjane : copier ce fichier, changer STORES.xxx.
// =====================================================

import {
  STORES,
  TEXT,
  PAGE_SIZE,
  HARD_CAP,
  CATEGORIES,
  escapeHtml,
  normalizeText,
  formatMoney,
  safeImageUrl,
  PLACEHOLDER_IMG,
  normalizeProduct,
  findHypermarket,
  fetchApprovedPage,
  addProductToCart,
  changeQuantity,
  cartQuantities,
  bindCartBadge,
  refreshIcons,
  showToast
} from "./hypermarket-core.js";

import { CART_EVENT } from "./cart.js";

const CONFIG = STORES.carrefour;
const $ = id => document.getElementById(id);

const grid = $("grid");

const state = {
  vendor: {
    id: CONFIG.chain,
    name: CONFIG.productStoreName,
    logo: "",
    page: CONFIG.page
  },
  hypermarket: null,
  ctx: { eurToMad: CONFIG.eurToMad, applyMarkup: CONFIG.applyMarkup },
  products: [],
  byId: new Map(),
  cursor: null,
  hasMore: false,
  loading: false,
  category: "all",
  query: "",
  sort: "default",
  noRateCount: 0
};

// =====================================================
// Données
// =====================================================
function buildContext(hypermarket) {
  // taux € -> DH : document Firestore d'abord, sinon valeur du fichier de config
  const eurToMad = Number(hypermarket?.eurToMad) > 0 ? Number(hypermarket.eurToMad) : CONFIG.eurToMad;

  return {
    eurToMad,
    applyMarkup: CONFIG.applyMarkup === true,
    priceMarkup: hypermarket?.priceMarkup,
    categoryMapping: hypermarket?.categoryMapping
  };
}

function ingest(page) {
  for (const snap of page.docs) {
    if (state.byId.has(snap.id)) continue;

    const product = normalizeProduct(snap.id, snap.data(), state.ctx);
    if (!product) continue;

    if (!product.orderable) state.noRateCount++;
    state.products.push(product);
    state.byId.set(product.id, product);
  }
  state.cursor = page.last || state.cursor;
  state.hasMore = page.hasMore;
}

async function loadMore() {
  if (state.loading || !state.hasMore || state.products.length >= HARD_CAP) return;

  state.loading = true;
  setLoadingMore(true);

  try {
    ingest(await fetchApprovedPage(CONFIG.productStoreName, { after: state.cursor }));
  } catch (err) {
    console.error("[carrefour] chargement impossible :", err);
    showToast(TEXT.loadError, "error");
  } finally {
    state.loading = false;
    setLoadingMore(false);
    renderAll();
  }
}

// recherche globale : charge tout le reste (action volontaire, plafonnée)
async function loadAll() {
  const btn = $("notice").querySelector("button");
  if (btn) { btn.disabled = true; btn.textContent = "Chargement…"; }

  while (state.hasMore && state.products.length < HARD_CAP) {
    const before = state.products.length;
    await loadMore();
    if (state.products.length === before) break; // erreur : on s'arrête
  }
}

// =====================================================
// Bannière du magasin
// =====================================================
function deliveryLabel(value) {
  if (value === undefined || value === null || value === "") return "";
  return typeof value === "number" ? `${value} min` : String(value);
}

function applyVendor(h) {
  state.vendor = {
    id: h?.id || CONFIG.chain,
    name: h?.name || CONFIG.productStoreName,
    logo: safeImageUrl(h?.image),
    page: CONFIG.page
  };

  document.title = `${state.vendor.name} - Quickly`;
  $("storeName").textContent = state.vendor.name;
  $("searchInput").placeholder = `Rechercher un produit dans ${state.vendor.name}…`;
  $("storeTagline").textContent = h?.tagline || h?.description || "Vos courses livrées chez vous";

  // logo (ou initiale si absent / cassé)
  const logo = $("bannerLogo");
  const initial = $("bannerInitial");
  initial.textContent = state.vendor.name.charAt(0).toUpperCase();

  if (state.vendor.logo) {
    logo.src = state.vendor.logo;
    logo.alt = `Logo ${state.vendor.name}`;
    logo.hidden = false;
    initial.hidden = true;
    logo.onerror = () => { logo.hidden = true; initial.hidden = false; };
  }

  // image de fond (optionnelle)
  const cover = safeImageUrl(h?.cover || h?.banner || h?.coverImage);
  if (cover) {
    $("banner").style.backgroundImage =
      `linear-gradient(135deg, rgba(8,70,130,.85), rgba(8,120,209,.55)), url("${cover.replace(/"/g, "%22")}")`;
  }

  // puces : uniquement les infos réellement présentes dans Firestore
  const chips = [];
  const delivery = deliveryLabel(h?.deliveryTime);
  if (delivery) chips.push(["clock", `Livraison ${delivery}`]);
  if (Number.isFinite(Number(h?.deliveryFee)) && h?.deliveryFee !== "" && h?.deliveryFee !== null && h?.deliveryFee !== undefined) {
    chips.push(["truck", `Frais : ${formatMoney(h.deliveryFee)}`]);
  }
  if (Number(h?.rating) > 0) chips.push(["star", `${Number(h.rating).toFixed(1)}`]);
  if (h?.city) chips.push(["map-pin", h.city]);

  $("storeChips").innerHTML = chips
    .map(([icon, text]) => `<li><i data-lucide="${icon}"></i>${escapeHtml(text)}</li>`)
    .join("");

  refreshIcons();
}

// =====================================================
// Catégories
// =====================================================
function renderCategories() {
  const counts = new Map();
  state.products.forEach(p => counts.set(p.category, (counts.get(p.category) || 0) + 1));

  const items = [{ key: "all", label: "Toutes les catégories", icon: "layout-grid" }]
    .concat(CATEGORIES.filter(c => counts.get(c.key) > 0));

  // la catégorie active doit toujours exister
  if (!items.some(i => i.key === state.category)) state.category = "all";

  $("cats").innerHTML = items.map(c => `
    <button type="button" class="cat-btn" data-cat="${c.key}"
            aria-current="${c.key === state.category}">
      <i data-lucide="${c.icon}"></i><span>${escapeHtml(c.label)}</span>
    </button>`).join("");

  refreshIcons();
}

// =====================================================
// Filtrage + tri (côté navigateur)
// =====================================================
function visibleProducts() {
  const tokens = normalizeText(state.query).split(" ").filter(Boolean);

  const list = state.products.filter(p =>
    (state.category === "all" || p.category === state.category) &&
    tokens.every(t => p.searchText.includes(t))
  );

  const byPrice = dir => (a, b) => {
    if (a.price === null && b.price === null) return 0;
    if (a.price === null) return 1;      // sans prix : toujours à la fin
    if (b.price === null) return -1;
    return dir * (a.price - b.price);
  };

  if (state.sort === "price-asc") list.sort(byPrice(1));
  else if (state.sort === "price-desc") list.sort(byPrice(-1));
  else if (state.sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return list;
}

// =====================================================
// Affichage
// =====================================================
function actionsHtml(product, quantity) {
  if (!product.orderable) {
    return `<button type="button" class="add" disabled>${escapeHtml(TEXT.unavailable)}</button>`;
  }
  if (quantity > 0) {
    return `
      <div class="stepper" role="group" aria-label="Quantité">
        <button type="button" data-action="dec" aria-label="Retirer un">−</button>
        <span>${quantity}</span>
        <button type="button" data-action="inc" aria-label="Ajouter un">+</button>
      </div>`;
  }
  return `<button type="button" class="add" data-action="add"><span aria-hidden="true">+</span> ${escapeHtml(TEXT.add)}</button>`;
}

function cardHtml(product, quantity) {
  const img = product.image || PLACEHOLDER_IMG;
  return `
    <article class="card" data-id="${escapeHtml(product.id)}" data-qty="${quantity}">
      <div class="media">
        <img src="${escapeHtml(img)}" alt="${escapeHtml(product.name)}"
             loading="lazy" decoding="async" ${product.image ? "" : 'class="is-placeholder"'}>
      </div>
      <div class="info">
        <h3 class="name">${escapeHtml(product.name)}</h3>
        <p class="unit">${escapeHtml(product.unit)}</p>
      </div>
      <div class="buy">
        ${product.orderable
          ? `<span class="price">${escapeHtml(formatMoney(product.price))}</span>`
          : `<span class="price na">${escapeHtml(TEXT.priceUnavailable)}</span>`}
        <div class="actions">${actionsHtml(product, quantity)}</div>
      </div>
    </article>`;
}

function skeletons(n = 8) {
  grid.innerHTML = Array.from({ length: n }, () => `<div class="sk"></div>`).join("");
}

function emptyState(icon, title, text, withReset = false) {
  grid.innerHTML = `
    <div class="state">
      <i data-lucide="${icon}"></i>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
      ${withReset ? `<button type="button" class="btn" id="resetFilters">Voir tous les produits</button>` : ""}
    </div>`;
  refreshIcons();
  $("resetFilters")?.addEventListener("click", resetFilters);
}

function resetFilters() {
  state.query = "";
  state.category = "all";
  $("searchInput").value = "";
  $("clearSearch").hidden = true;
  renderAll();
}

function renderNotice(filtered) {
  const notice = $("notice");
  const partial = state.hasMore && (state.query || state.category !== "all");

  if (!partial) { notice.hidden = true; return; }

  const canLoad = state.products.length < HARD_CAP;
  notice.hidden = false;
  notice.innerHTML = `
    <span>Résultats parmi les ${state.products.length} produits déjà chargés.</span>
    ${canLoad ? `<button type="button" id="loadAllBtn">Chercher dans tout le catalogue</button>` : ""}`;
  $("loadAllBtn")?.addEventListener("click", loadAll);
}

function renderGrid() {
  const list = visibleProducts();
  const quantities = cartQuantities(state.vendor.id);

  // texte du compteur
  $("resultInfo").textContent = list.length
    ? `${list.length} produit${list.length > 1 ? "s" : ""}${state.hasMore ? "+" : ""}`
    : "";

  renderNotice(list);

  if (!state.products.length) {
    emptyState("package-open", "Aucun produit disponible",
      "Les produits de ce magasin arrivent bientôt. Revenez dans quelques instants.");
  } else if (!list.length) {
    emptyState("search-x",
      state.query ? `Aucun résultat pour « ${state.query} »` : "Aucun produit dans cette catégorie",
      "Essayez un autre mot ou une autre catégorie.", true);
  } else {
    grid.innerHTML = list.map(p => cardHtml(p, quantities.get(p.id) || 0)).join("");
  }

  $("moreBox").hidden = !(state.hasMore && state.products.length < HARD_CAP);
}

function renderAll() {
  renderCategories();
  renderGrid();
}

function setLoadingMore(on) {
  const btn = $("loadMore");
  btn.disabled = on;
  btn.textContent = on ? "Chargement…" : "Charger plus de produits";
}

// met à jour les boutons Ajouter / quantité sans reconstruire la grille
function syncCardStates() {
  const quantities = cartQuantities(state.vendor.id);

  grid.querySelectorAll(".card").forEach(card => {
    const qty = quantities.get(card.dataset.id) || 0;
    if (Number(card.dataset.qty) === qty) return;

    const product = state.byId.get(card.dataset.id);
    if (!product) return;

    card.dataset.qty = qty;
    card.querySelector(".actions").innerHTML = actionsHtml(product, qty);
  });
}

function showError() {
  $("moreBox").hidden = true;
  $("notice").hidden = true;
  grid.innerHTML = `
    <div class="state">
      <i data-lucide="circle-alert"></i>
      <h3>Chargement impossible</h3>
      <p>${escapeHtml(TEXT.loadError)}</p>
      <button type="button" class="btn" id="retryBtn">${escapeHtml(TEXT.retry)}</button>
    </div>`;
  refreshIcons();
  $("retryBtn").addEventListener("click", init);
}

// =====================================================
// Événements
// =====================================================
grid.addEventListener("click", e => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const card = btn.closest(".card");
  const product = card && state.byId.get(card.dataset.id);
  if (!product) return;

  const action = btn.dataset.action;

  if (action === "add") {
    if (!product.orderable) return;
    const result = addProductToCart(product, state.vendor);
    if (result === "added") showToast(TEXT.added, "success");
    else if (result === "error") showToast(TEXT.cartError, "error");
  } else if (action === "inc") {
    changeQuantity(product.id, state.vendor.id, +1);
  } else if (action === "dec") {
    changeQuantity(product.id, state.vendor.id, -1);
  }
});

// image cassée -> image de remplacement
grid.addEventListener("error", e => {
  const img = e.target;
  if (img.tagName === "IMG" && !img.dataset.fallback) {
    img.dataset.fallback = "1";
    img.src = PLACEHOLDER_IMG;
    img.classList.add("is-placeholder");
  }
}, true);

$("cats").addEventListener("click", e => {
  const btn = e.target.closest("[data-cat]");
  if (!btn) return;
  state.category = btn.dataset.cat;
  renderAll();
  btn.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
});

// recherche (avec temporisation pour ne pas recalculer à chaque lettre)
let searchTimer;
$("searchInput").addEventListener("input", e => {
  $("clearSearch").hidden = !e.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = e.target.value.trim();
    renderAll();
  }, 180);
});

$("searchForm").addEventListener("submit", e => {
  e.preventDefault();
  $("searchInput").blur();
});

$("clearSearch").addEventListener("click", () => {
  $("searchInput").value = "";
  $("clearSearch").hidden = true;
  state.query = "";
  renderAll();
  $("searchInput").focus();
});

$("sortSelect").addEventListener("change", e => {
  state.sort = e.target.value;
  renderGrid();
});

$("loadMore").addEventListener("click", loadMore);

$("backBtn").addEventListener("click", e => {
  if (document.referrer && history.length > 1) {
    e.preventDefault();
    history.back();
  }
});

window.addEventListener(CART_EVENT, syncCardStates);
window.addEventListener("storage", syncCardStates);
window.addEventListener("pageshow", syncCardStates);

// =====================================================
// Démarrage
// =====================================================
async function init() {
  state.products = [];
  state.byId.clear();
  state.cursor = null;
  state.noRateCount = 0;

  skeletons();
  $("notice").hidden = true;
  $("moreBox").hidden = true;

  try {
    const [hypermarket, page] = await Promise.all([
      findHypermarket(CONFIG).catch(err => {
        console.warn("[carrefour] document magasin introuvable :", err);
        return null;
      }),
      fetchApprovedPage(CONFIG.productStoreName, { pageSize: PAGE_SIZE })
    ]);

    state.hypermarket = hypermarket;
    state.ctx = buildContext(hypermarket);
    applyVendor(hypermarket);
    ingest(page);

    if (state.noRateCount > 0) {
      console.warn(
        `[Quickly] ${state.noRateCount} produit(s) ont un prix en € sans taux de change : ` +
        `ils sont affichés « Prix indisponible » et ne peuvent pas être commandés. ` +
        `Renseignez le champ "eurToMad" (nombre) dans hypermarkets/${state.vendor.id} ` +
        `ou STORES.carrefour.eurToMad dans hypermarket-core.js.`
      );
    }

    renderAll();
  } catch (err) {
    console.error("[carrefour] chargement impossible :", err);
    showError();
  }
}

bindCartBadge($("cartBadge"));
refreshIcons();
init();