import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { isFavorite, toggleFavorite } from "./favorites.js";
import { getCartCount, CART_EVENT } from "./cart.js";

/* =====================================================
   THEME (même clé que la page d'accueil)
===================================================== */
if ((localStorage.getItem("quickly_theme") || "light") === "dark") {
  document.documentElement.setAttribute("data-theme", "dark");
}

/* =====================================================
   CONSTANTS
===================================================== */
const TOP_RATING = 4.5;   // "Mieux notés" = 4.5 et plus
const NEAR_KM = 7;        // "Près de vous" = dans un rayon de 7 km
const DEBOUNCE_MS = 150;

const FALLBACK_IMG = "data:image/svg+xml;utf8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240"><rect width="400" height="240" fill="#cfe5f8"/><text x="200" y="140" font-size="72" text-anchor="middle">🍽️</text></svg>'
);

/* =====================================================
   TRANSLATIONS (FR / AR / EN)
===================================================== */
const translations = {
  fr: {
    search_placeholder: "Rechercher un restaurant, un plat...",
    food_headline: "Envie d'un délicieux repas ? 🍕",
    food_sub: "Choisissez parmi les meilleurs restaurants de votre ville.",
    deliver_to: "Livrer à",
    restaurants_offers: "Restaurants & Offres",
    found: "{n} trouvé(s)",
    chip_all: "Tout",
    chip_top: "Mieux notés",
    chip_offers: "Offres",
    chip_near: "Près de vous",
    chip_free: "Livraison gratuite",
    chip_open: "Ouverts",
    sort_recommended: "Recommandés",
    sort_rating: "Mieux notés",
    sort_fast: "Plus rapides",
    sort_near: "Plus proches",
    sort_cheap: "Livraison moins chère",
    open: "Ouvert",
    closed: "Fermé",
    free_delivery: "Livraison gratuite",
    delivery_fee: "Livraison",
    offer_today: "Offre du jour",
    new_badge: "Nouveau",
    no_results: "Aucun restaurant trouvé",
    no_results_sub: "Essayez de modifier vos filtres ou votre recherche.",
    reset: "Réinitialiser",
    geo_unsupported: "Géolocalisation non supportée.",
    geo_denied: "Impossible d'obtenir votre position.",
    pick_point: "Veuillez sélectionner un point sur la carte.",
    nav_home: "Accueil",
    nav_explore: "Explorer",
    nav_cart: "Panier",
    nav_profile: "Profil",
    our_services: "Nos services",
    quick_nav: "Navigation rapide",
    cat_food: "Food & Restaurants",
    cat_groceries: "Groceries & Courses",
    cat_shops: "Shops & Boutiques",
    cat_package: "Package & Colis",
    cat_para: "Parapharmacie",
    cat_extra: "Fleurs & Extra",
    delivery_address: "Adresse de livraison",
    gps_current: "Position GPS actuelle",
    gps_sub: "Localiser automatiquement mon appareil",
    map_select: "Sélectionner sur la carte",
    map_sub: "Choisir l'emplacement manuellement",
    confirm_loc: "Valider cet emplacement",
    close: "Fermer",
    current_pos: "Position actuelle",
    chosen_pos: "Emplacement choisi"
  },
  ar: {
    search_placeholder: "ابحث عن مطعم أو وجبة...",
    food_headline: "هل تشتهي وجبة لذيذة؟ 🍕",
    food_sub: "اختر من أفضل مطاعم مدينتك.",
    deliver_to: "التوصيل إلى",
    restaurants_offers: "المطاعم والعروض",
    found: "{n} نتيجة",
    chip_all: "الكل",
    chip_top: "الأعلى تقييماً",
    chip_offers: "العروض",
    chip_near: "قريب منك",
    chip_free: "توصيل مجاني",
    chip_open: "مفتوح الآن",
    sort_recommended: "موصى به",
    sort_rating: "الأعلى تقييماً",
    sort_fast: "الأسرع",
    sort_near: "الأقرب",
    sort_cheap: "الأرخص توصيلاً",
    open: "مفتوح",
    closed: "مغلق",
    free_delivery: "توصيل مجاني",
    delivery_fee: "التوصيل",
    offer_today: "عرض اليوم",
    new_badge: "جديد",
    no_results: "لم نجد أي مطعم",
    no_results_sub: "جرّب تعديل الفلاتر أو البحث.",
    reset: "إعادة ضبط",
    geo_unsupported: "تحديد الموقع غير مدعوم.",
    geo_denied: "تعذّر الحصول على موقعك.",
    pick_point: "الرجاء اختيار نقطة على الخريطة.",
    nav_home: "الرئيسية",
    nav_explore: "استكشاف",
    nav_cart: "السلة",
    nav_profile: "الملف الشخصي",
    our_services: "خدماتنا",
    quick_nav: "تنقل سريع",
    cat_food: "الطعام والمطاعم",
    cat_groceries: "المؤونة والمشتريات",
    cat_shops: "المتاجر",
    cat_package: "الطرود",
    cat_para: "الصيدلية",
    cat_extra: "الورود وأخرى",
    delivery_address: "عنوان التوصيل",
    gps_current: "الموقع الحالي GPS",
    gps_sub: "تحديد موقع جهازي تلقائياً",
    map_select: "اختر على الخريطة",
    map_sub: "اختيار الموقع يدوياً",
    confirm_loc: "تأكيد الموقع",
    close: "إغلاق",
    current_pos: "الموقع الحالي",
    chosen_pos: "الموقع المختار"
  },
  en: {
    search_placeholder: "Search for a restaurant, dish...",
    food_headline: "Craving a delicious meal? 🍕",
    food_sub: "Pick from the best restaurants in your city.",
    deliver_to: "Deliver to",
    restaurants_offers: "Restaurants & Offers",
    found: "{n} found",
    chip_all: "All",
    chip_top: "Top rated",
    chip_offers: "Offers",
    chip_near: "Near you",
    chip_free: "Free delivery",
    chip_open: "Open now",
    sort_recommended: "Recommended",
    sort_rating: "Top rated",
    sort_fast: "Fastest",
    sort_near: "Nearest",
    sort_cheap: "Cheapest delivery",
    open: "Open",
    closed: "Closed",
    free_delivery: "Free delivery",
    delivery_fee: "Delivery",
    offer_today: "Today's offer",
    new_badge: "New",
    no_results: "No restaurants found",
    no_results_sub: "Try changing your filters or search.",
    reset: "Reset",
    geo_unsupported: "Geolocation not supported.",
    geo_denied: "Couldn't get your location.",
    pick_point: "Please select a point on the map.",
    nav_home: "Home",
    nav_explore: "Explore",
    nav_cart: "Cart",
    nav_profile: "Profile",
    our_services: "Our Services",
    quick_nav: "Quick navigation",
    cat_food: "Food & Restaurants",
    cat_groceries: "Groceries & Courses",
    cat_shops: "Shops & Boutiques",
    cat_package: "Package & Parcels",
    cat_para: "Parapharmacy",
    cat_extra: "Flowers & Extra",
    delivery_address: "Delivery Address",
    gps_current: "Current GPS Position",
    gps_sub: "Locate my device automatically",
    map_select: "Select on Map",
    map_sub: "Choose the location manually",
    confirm_loc: "Confirm Location",
    close: "Close",
    current_pos: "Current position",
    chosen_pos: "Chosen location"
  }
};

const lang = localStorage.getItem("quickly_lang") || "fr";
const t = key => translations[lang]?.[key] ?? translations.fr[key] ?? key;

function applyGlobalLanguage() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const v = translations[lang]?.[el.getAttribute("data-i18n")];
    if (v) el.textContent = v;
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const v = translations[lang]?.[el.getAttribute("data-i18n-placeholder")];
    if (v) el.placeholder = v;
  });
  const root = document.getElementById("htmlRoot");
  root.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
  root.setAttribute("lang", lang);
}
applyGlobalLanguage();

/* =====================================================
   HELPERS
===================================================== */
const $ = id => document.getElementById(id);

const esc = s => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

const norm = s => String(s ?? "").toLowerCase().trim();

function validCoords(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

function distanceKm(a, b) {
  const R = 6371, rad = x => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatDistance(km) {
  return km < 1 ? Math.max(50, Math.round(km * 100) * 10) + " m" : km.toFixed(1) + " km";
}

function formatTime(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return /^\d+$/.test(s) ? s + " min" : s;
}

function minutesOf(v) {
  const nums = String(v ?? "").match(/\d+/g);
  return nums ? Math.min(...nums.map(Number)) : Infinity;
}

let toastTimer;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2800);
}

/* =====================================================
   STATE
===================================================== */
const state = {
  restaurants: [],
  offers: new Map(),        // restaurantId -> titre de l'offre
  categories: [],           // [{ slug, name }]
  selectedCats: new Set(),  // slugs
  filters: new Set(),       // top | offers | near | free | open
  sort: "recommended",
  search: "",
  userPos: null,            // { lat, lng }
  loaded: false
};

// Position déjà connue (choisie dans l'app)
{
  const lat = Number(localStorage.getItem("latitude"));
  const lng = Number(localStorage.getItem("longitude"));
  if (validCoords(lat, lng)) state.userPos = { lat, lng };
}

const CHIPS = [
  { key: "all",    icon: "fa-layer-group",         label: "chip_all" },
  { key: "top",    icon: "fa-star",                label: "chip_top" },
  { key: "offers", icon: "fa-tag",                 label: "chip_offers" },
  { key: "near",   icon: "fa-location-crosshairs", label: "chip_near" },
  { key: "free",   icon: "fa-motorcycle",          label: "chip_free" },
  { key: "open",   icon: "fa-door-open",           label: "chip_open" }
];

const PREDICATES = {
  top:    r => r.rating !== null && r.rating >= TOP_RATING,
  offers: r => r.hasOffer,
  free:   r => r.free,
  open:   r => r.isOpen,
  near:   r => r.distance !== null && r.distance <= NEAR_KM
};

const SORTS = ["recommended", "rating", "fast", "near", "cheap"];

/* =====================================================
   DATA → VIEW MODEL
===================================================== */
const SPLIT_CATS = /[•·,.&/|+]/;

function enrich(raw) {
  const rating = Number(raw.rating);
  const feeRaw = raw.deliveryFee;
  const feeNum = feeRaw === "" || feeRaw == null ? NaN : Number(feeRaw);
  const free = raw.freeDelivery === true ||
    String(feeRaw).toLowerCase() === "free" || feeNum === 0;

  const offer = state.offers.get(raw.id) || (raw.todayOffer === true ? t("offer_today") : "");

  const lat = Number(raw.lat ?? raw.latitude);
  const lng = Number(raw.lng ?? raw.longitude);
  const coords = validCoords(lat, lng) ? { lat, lng } : null;

  const tokens = new Set();
  (Array.isArray(raw.foodCategories) ? raw.foodCategories : []).forEach(c => tokens.add(norm(c)));
  [raw.category, raw.cuisine, raw.categoryName].forEach(v => {
    if (!v) return;
    tokens.add(norm(v));
    String(v).split(SPLIT_CATS).forEach(p => p.trim() && tokens.add(norm(p)));
  });

  return {
    id: raw.id,
    name: raw.name || "",
    image: raw.image || "",
    logo: raw.logo || "",
    categoryName: raw.categoryName || raw.category || "",
    keywords: Array.isArray(raw.searchKeywords) ? raw.searchKeywords : [],
    rating: Number.isFinite(rating) && rating > 0 ? rating : null,
    isOpen: raw.isOpen !== false,
    free,
    fee: Number.isFinite(feeNum) ? feeNum : null,
    offer,
    hasOffer: !!offer,
    time: formatTime(raw.deliveryTime),
    minutes: minutesOf(raw.deliveryTime),
    distance: coords && state.userPos ? distanceKm(state.userPos, coords) : null,
    tokens
  };
}

/* =====================================================
   FILTER + SORT
===================================================== */
function matchesSearch(r, text) {
  if (!text) return true;
  return norm(r.name).includes(text) ||
    norm(r.categoryName).includes(text) ||
    r.keywords.some(k => norm(k).includes(text));
}

function matchesCategories(r) {
  if (!state.selectedCats.size) return true;
  return state.categories.some(c =>
    state.selectedCats.has(c.slug) &&
    (r.tokens.has(norm(c.slug)) || r.tokens.has(norm(c.name))));
}

const num = (v, fallback) => (v === null || v === undefined ? fallback : v);

function compare(a, b) {
  const byName = () => a.name.localeCompare(b.name);
  switch (state.sort) {
    case "rating": return num(b.rating, -1) - num(a.rating, -1) || byName();
    case "fast":   return a.minutes - b.minutes || byName();
    case "near":   return num(a.distance, Infinity) - num(b.distance, Infinity) || byName();
    case "cheap": {
      const fa = a.free ? 0 : num(a.fee, Infinity);
      const fb = b.free ? 0 : num(b.fee, Infinity);
      return fa - fb || byName();
    }
    default:
      return (b.isOpen - a.isOpen) ||
        (b.hasOffer - a.hasOffer) ||
        (num(b.rating, 0) - num(a.rating, 0)) || byName();
  }
}

/* =====================================================
   RENDER
===================================================== */
const restaurantsContainer = $("restaurantsContainer");
const foodCategories = $("foodCategories");

function renderChips(counts) {
  $("filterChips").innerHTML = CHIPS.map(c => {
    const active = c.key === "all" ? state.filters.size === 0 : state.filters.has(c.key);
    const count = c.key === "all" ? null : counts[c.key];
    const empty = count === 0 ? " is-empty" : "";
    return `
      <button class="chip${active ? " active" : ""}${empty}" data-chip="${c.key}" type="button" aria-pressed="${active}">
        <i class="fa-solid ${c.icon}"></i>
        <span>${esc(t(c.label))}</span>
        ${count === null || count === undefined ? "" : `<span class="chip-count">${count}</span>`}
      </button>`;
  }).join("");
}

function renderSort() {
  const sel = $("sortSelect");
  sel.innerHTML = SORTS.map(s =>
    `<option value="${s}">${esc(t("sort_" + s))}</option>`).join("");
  sel.value = state.sort;
}

function cardHtml(r, index) {
  const fav = isFavorite(r.id);

  const badges = [
    r.hasOffer ? `<span class="r-badge offer"><i class="fa-solid fa-tag"></i><span>${esc(r.offer)}</span></span>` : "",
    r.free ? `<span class="r-badge free"><i class="fa-solid fa-motorcycle"></i><span>${esc(t("free_delivery"))}</span></span>` : ""
  ].join("");

  const rating = r.rating !== null
    ? `<span class="r-rating"><i class="fa-solid fa-star"></i>${r.rating.toFixed(1)}</span>`
    : `<span class="r-rating is-new">${esc(t("new_badge"))}</span>`;

  const feeTxt = r.free
    ? `<span class="free-txt"><i class="fa-solid fa-motorcycle"></i>${esc(t("free_delivery"))}</span>`
    : r.fee !== null
      ? `<span><i class="fa-solid fa-motorcycle"></i>${r.fee} DH</span>`
      : "";

  const dist = r.distance !== null
    ? `<span><i class="fa-solid fa-location-dot"></i>${formatDistance(r.distance)}</span>` : "";

  return `
    <article class="r-card${r.isOpen ? "" : " is-closed"}" data-id="${esc(r.id)}" tabindex="0" role="link" aria-label="${esc(r.name)}" style="animation-delay:${Math.min(index, 8) * 40}ms">
      <div class="r-media">
        <img class="r-img" loading="lazy" src="${esc(r.image || FALLBACK_IMG)}" alt="${esc(r.name)}">
        <div class="r-shade"></div>
        ${badges ? `<div class="r-badges">${badges}</div>` : ""}
        <button class="r-fav${fav ? " is-fav" : ""}" data-fav="${esc(r.id)}" type="button" aria-label="Favori">
          <i class="fa-${fav ? "solid" : "regular"} fa-heart"></i>
        </button>
        ${r.time ? `<span class="r-time"><i class="fa-regular fa-clock"></i>${esc(r.time)}</span>` : ""}
        ${r.isOpen ? "" : `<div class="r-closed"><span>${esc(t("closed"))}</span></div>`}
        ${r.logo ? `<img class="r-logo" loading="lazy" src="${esc(r.logo)}" alt="">` : ""}
      </div>
      <div class="r-body${r.logo ? " has-logo" : ""}">
        <div class="r-title-row">
          <h3>${esc(r.name)}</h3>
          ${rating}
        </div>
        ${r.categoryName ? `<p class="r-cats">${esc(r.categoryName)}</p>` : ""}
        <div class="r-meta">
          ${feeTxt}
          ${dist}
          <span class="r-status ${r.isOpen ? "open" : "closed"}">${esc(t(r.isOpen ? "open" : "closed"))}</span>
        </div>
      </div>
    </article>`;
}

function renderSkeleton() {
  foodCategories.innerHTML = Array.from({ length: 6 }, () => `<div class="cat-skeleton skel"></div>`).join("");
  restaurantsContainer.innerHTML = Array.from({ length: 3 }, () => `
    <div class="r-skeleton">
      <div class="sk-img skel"></div>
      <div class="sk-body">
        <div class="sk-line w60 skel"></div>
        <div class="sk-line w40 skel"></div>
        <div class="sk-line skel"></div>
      </div>
    </div>`).join("");
}

function render() {
  if (!state.loaded) return;

  const text = norm(state.search);
  const all = state.restaurants.map(enrich);
  const base = all.filter(r => matchesSearch(r, text) && matchesCategories(r));

  const counts = {};
  Object.keys(PREDICATES).forEach(k => { counts[k] = base.filter(PREDICATES[k]).length; });
  if (!state.userPos) counts.near = null;
  renderChips(counts);

  let list = base;
  state.filters.forEach(k => { list = list.filter(PREDICATES[k]); });
  list = [...list].sort(compare);

  $("restaurantsCountBadge").textContent = t("found").replace("{n}", list.length);
  $("sortSelect").value = state.sort;

  if (!list.length) {
    restaurantsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-ico"><i class="fa-solid fa-bowl-food"></i></div>
        <h3>${esc(t("no_results"))}</h3>
        <p>${esc(t("no_results_sub"))}</p>
        <button type="button" data-reset>${esc(t("reset"))}</button>
      </div>`;
    return;
  }

  restaurantsContainer.innerHTML = list.map(cardHtml).join("");
}

function syncCategoryUi() {
  document.querySelectorAll(".food-category").forEach(el =>
    el.classList.toggle("active", state.selectedCats.has(el.dataset.category)));
}

function resetAll() {
  state.filters.clear();
  state.selectedCats.clear();
  state.search = "";
  state.sort = "recommended";
  $("searchInput").value = "";
  $("searchClearBtn").classList.add("hidden");
  syncCategoryUi();
  render();
}

/* =====================================================
   GEOLOCATION (pour "Près de vous" / "Plus proches")
===================================================== */
function requestPosition() {
  return new Promise(resolve => {
    if (state.userPos) return resolve(true);
    if (!navigator.geolocation) { toast(t("geo_unsupported")); return resolve(false); }

    navigator.geolocation.getCurrentPosition(
      pos => {
        state.userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        resolve(true);
      },
      () => { toast(t("geo_denied")); resolve(false); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  });
}

/* =====================================================
   EVENTS: chips / sort / cards
===================================================== */
$("filterChips").addEventListener("click", async e => {
  const btn = e.target.closest("[data-chip]");
  if (!btn) return;
  const key = btn.dataset.chip;

  if (key === "all") {
    state.filters.clear();
  } else if (state.filters.has(key)) {
    state.filters.delete(key);
  } else {
    if (key === "near" && !state.userPos) {
      btn.classList.add("is-loading");
      const ok = await requestPosition();
      if (!ok) { render(); return; }
    }
    state.filters.add(key);
  }
  render();
});

$("sortSelect").addEventListener("change", async e => {
  const value = e.target.value;
  if (value === "near" && !state.userPos) {
    const ok = await requestPosition();
    if (!ok) { $("sortSelect").value = state.sort; return; }
  }
  state.sort = value;
  render();
});

restaurantsContainer.addEventListener("click", e => {
  if (e.target.closest("[data-reset]")) { resetAll(); return; }

  const favBtn = e.target.closest("[data-fav]");
  if (favBtn) {
    e.stopPropagation();
    const on = toggleFavorite(favBtn.dataset.fav);
    favBtn.classList.toggle("is-fav", on);
    favBtn.querySelector("i").className = `fa-${on ? "solid" : "regular"} fa-heart`;
    favBtn.classList.remove("pop");
    void favBtn.offsetWidth;
    favBtn.classList.add("pop");
    return;
  }

  const card = e.target.closest(".r-card");
  if (card) window.location.href = `restaurant.html?id=${encodeURIComponent(card.dataset.id)}`;
});

restaurantsContainer.addEventListener("keydown", e => {
  if (e.key !== "Enter" || e.target.closest("[data-fav]")) return;
  const card = e.target.closest(".r-card");
  if (card) window.location.href = `restaurant.html?id=${encodeURIComponent(card.dataset.id)}`;
});

// صورة مكسورة → صورة بديلة (بدون أي inline handler)
document.addEventListener("error", e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (img.classList.contains("r-logo")) { img.style.display = "none"; return; }
  if (img.dataset.fb === "1") return;
  if (img.closest(".r-media, .food-category, .s-item-row")) {
    img.dataset.fb = "1";
    img.src = FALLBACK_IMG;
  }
}, true);

// ظل خفيف عندما يلتصق شريط الفلاتر بأعلى الصفحة
{
  const bar = $("filtersBar");
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      bar.classList.toggle("is-stuck", bar.getBoundingClientRect().top <= 0);
      ticking = false;
    });
  }, { passive: true });
}

/* =====================================================
   SEARCH + SUGGESTIONS
===================================================== */
const searchInput = $("searchInput");
const searchSuggestions = $("searchSuggestions");
const searchClearBtn = $("searchClearBtn");
let debounceTimer;

function showSuggestions(text) {
  const matches = state.restaurants.map(enrich)
    .filter(r => norm(r.name).includes(text)).slice(0, 5);

  if (!matches.length) { searchSuggestions.classList.add("hidden"); return; }

  searchSuggestions.innerHTML = matches.map(r => `
    <div class="s-item-row" data-name="${esc(r.name)}">
      <img src="${esc(r.image || FALLBACK_IMG)}" alt="">
      <span>${esc(r.name)}</span>
      <small>${esc(r.categoryName)}</small>
    </div>`).join("");
  searchSuggestions.classList.remove("hidden");
}

searchInput.addEventListener("input", e => {
  clearTimeout(debounceTimer);
  const value = e.target.value;
  searchClearBtn.classList.toggle("hidden", !value);

  debounceTimer = setTimeout(() => {
    state.search = value.trim();
    render();
    if (state.search) showSuggestions(norm(state.search));
    else searchSuggestions.classList.add("hidden");
  }, DEBOUNCE_MS);
});

searchInput.addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); runSearch(); }
});

function runSearch() {
  state.search = searchInput.value.trim();
  searchSuggestions.classList.add("hidden");
  searchInput.blur();
  render();
  document.querySelector(".restaurants-section").scrollIntoView({ behavior: "smooth", block: "start" });
}

$("searchActionBtn").addEventListener("click", runSearch);

searchClearBtn.addEventListener("click", () => {
  searchInput.value = "";
  state.search = "";
  searchClearBtn.classList.add("hidden");
  searchSuggestions.classList.add("hidden");
  render();
  searchInput.focus();
});

searchSuggestions.addEventListener("click", e => {
  const row = e.target.closest(".s-item-row");
  if (!row) return;
  searchInput.value = row.dataset.name;
  state.search = row.dataset.name;
  searchClearBtn.classList.remove("hidden");
  searchSuggestions.classList.add("hidden");
  render();
});

document.addEventListener("click", e => {
  if (!searchInput.contains(e.target) && !searchSuggestions.contains(e.target)) {
    searchSuggestions.classList.add("hidden");
  }
});

/* =====================================================
   DRAWER
===================================================== */
const sideDrawer = $("sideDrawer");
const drawerOverlay = $("drawerOverlay");

function openDrawer() { sideDrawer.classList.add("open"); drawerOverlay.classList.remove("hidden"); }
function closeDrawer() { sideDrawer.classList.remove("open"); drawerOverlay.classList.add("hidden"); }

$("menuToggleBtn").onclick = openDrawer;
$("closeDrawerBtn").onclick = closeDrawer;
drawerOverlay.onclick = closeDrawer;
document.addEventListener("keydown", e => { if (e.key === "Escape") { closeDrawer(); closeModal(); } });

/* =====================================================
   LOAD DATA (Firestore)
===================================================== */
async function loadCategories() {
  try {
    const snapshot = await getDocs(query(collection(db, "foodCategories"), orderBy("order")));
    state.categories = [];

    snapshot.forEach(docSnap => {
      const item = docSnap.data();
      if (item.active === false) return;
      state.categories.push({ slug: String(item.slug || docSnap.id), name: item.name || "", image: item.image || "" });
    });

    foodCategories.innerHTML = state.categories.map(c => `
      <button class="food-category" type="button" data-category="${esc(c.slug)}">
        <img loading="lazy" src="${esc(c.image || FALLBACK_IMG)}" alt="">
        <span>${esc(c.name)}</span>
      </button>`).join("");
  } catch (err) {
    console.error("Error loading categories:", err);
    foodCategories.innerHTML = "";
  }
}

foodCategories.addEventListener("click", e => {
  const el = e.target.closest(".food-category");
  if (!el) return;
  const slug = el.dataset.category;
  if (state.selectedCats.has(slug)) state.selectedCats.delete(slug);
  else state.selectedCats.add(slug);
  syncCategoryUi();
  render();
});

async function loadOffers() {
  try {
    const snapshot = await getDocs(collection(db, "offers"));
    state.offers.clear();
    snapshot.forEach(d => {
      const o = d.data();
      if (o.active === false || !o.restaurantId || state.offers.has(o.restaurantId)) return;
      state.offers.set(o.restaurantId, o.title || t("offer_today"));
    });
  } catch (err) {
    console.warn("Offers not loaded:", err);
  }
}

async function loadRestaurants() {
  try {
    const snapshot = await getDocs(collection(db, "restaurants"));
    state.restaurants = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("Error fetching restaurants:", err);
    state.restaurants = [];
  }
}

/* =====================================================
   LOCATION MODAL & MAP
===================================================== */
const currentLocation = $("currentLocation");
const locationModal = $("locationModal");
const locationOverlay = $("locationOverlay");
const mapContainer = $("mapContainer");

const savedAddress = localStorage.getItem("deliveryAddress") || localStorage.getItem("selectedAddress");
if (savedAddress) currentLocation.textContent = savedAddress;

$("locationBtn").onclick = () => {
  locationModal.classList.add("show");
  locationOverlay.classList.add("show");
};

function closeModal() {
  locationModal.classList.remove("show");
  locationOverlay.classList.remove("show");
  mapContainer.classList.remove("show");
}

$("closeLocationModal").onclick = closeModal;
locationOverlay.onclick = closeModal;

// يحفظ الموقع المختار (نفس مفاتيح صفحة الدفع) ويعيد حساب المسافات
function applyLocation(lat, lng, placeName) {
  const label = `📍 ${placeName}`;
  currentLocation.textContent = label;
  localStorage.setItem("deliveryAddress", label);
  localStorage.setItem("selectedAddress", label);
  localStorage.setItem("latitude", String(lat));
  localStorage.setItem("longitude", String(lng));
  state.userPos = { lat, lng };
  closeModal();
  render();
}

async function reverseGeocode(lat, lng, fallbackName) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
    const data = await res.json();
    const a = data.address || {};
    return a.road || a.suburb || a.city || fallbackName;
  } catch {
    return fallbackName;
  }
}

let map = null, marker = null, selectedLat = null, selectedLng = null;

$("currentLocationBtn").onclick = () => {
  if (!navigator.geolocation) return toast(t("geo_unsupported"));
  navigator.geolocation.getCurrentPosition(
    async pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      applyLocation(lat, lng, await reverseGeocode(lat, lng, t("current_pos")));
    },
    () => toast(t("geo_denied")),
    { timeout: 10000 }
  );
};

$("mapLocationBtn").onclick = () => {
  mapContainer.classList.add("show");

  if (!map) {
    const start = state.userPos || { lat: 34.68139, lng: -1.90858 };
    map = L.map("map").setView([start.lat, start.lng], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);

    marker = L.marker([start.lat, start.lng], { draggable: true }).addTo(map);

    map.on("click", e => {
      marker.setLatLng(e.latlng);
      selectedLat = e.latlng.lat; selectedLng = e.latlng.lng;
    });
    marker.on("dragend", () => {
      const p = marker.getLatLng();
      selectedLat = p.lat; selectedLng = p.lng;
    });
  }
  setTimeout(() => map && map.invalidateSize(), 300);
};

$("confirmLocation").onclick = async () => {
  if (selectedLat === null) return toast(t("pick_point"));
  applyLocation(selectedLat, selectedLng, await reverseGeocode(selectedLat, selectedLng, t("chosen_pos")));
};

/* =====================================================
   PROFILE BUTTON + CART BADGE
===================================================== */
const profileBtn = $("profileBtn");
profileBtn.onclick = () => { window.location.href = "profile.html"; };

onAuthStateChanged(auth, user => {
  profileBtn.innerHTML = user && user.photoURL
    ? `<img src="${esc(user.photoURL)}" alt="">`
    : `<i class="fa-regular fa-user"></i>`;
});

function updateCartBadge() {
  const el = $("cartBadgeCount");
  let n = 0;
  try { n = getCartCount(); } catch (_) { /* ignore */ }
  el.textContent = n > 99 ? "99+" : n;
  el.style.display = n > 0 ? "flex" : "none";
}
window.addEventListener(CART_EVENT, updateCartBadge);
window.addEventListener("storage", updateCartBadge);

/* =====================================================
   INIT
===================================================== */
async function applyUrlParams() {
  const params = new URLSearchParams(location.search);

  const cat = params.get("category");
  if (cat && cat !== "all") {
    const found = state.categories.find(c => norm(c.slug) === norm(cat));
    if (found) state.selectedCats.add(found.slug);
  }

  const filter = params.get("filter");
  if (filter && PREDICATES[filter]) {
    if (filter !== "near" || await requestPosition()) state.filters.add(filter);
  }

  // روابط نافذة الفلاتر في الصفحة الرئيسية: ?sort=rating | ?sort=fast
  const sort = params.get("sort");
  if (sort === "rating") state.filters.add("top");
  if (sort === "fast") state.sort = "fast";
  if (sort === "near" && await requestPosition()) state.sort = "near";
}

async function init() {
  renderSkeleton();
  renderSort();
  renderChips({});
  updateCartBadge();

  await Promise.all([loadCategories(), loadOffers(), loadRestaurants()]);
  await applyUrlParams();

  state.loaded = true;
  syncCategoryUi();
  render();
}

init();