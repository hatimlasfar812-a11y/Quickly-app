import { db, auth } from "./firebase.js";
import {
  collection,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { getCartCount, CART_EVENT } from "./cart.js";

/* =========================================
   LUCIDE ICONS REFRESH
========================================= */
function refreshIcons() {
  if (window.lucide?.createIcons) {
    try { window.lucide.createIcons(); } catch (e) { console.warn("Lucide:", e); }
  }
}

// Render initial après DOM ready
document.addEventListener("DOMContentLoaded", () => {
  refreshIcons();
  setTimeout(refreshIcons, 200);
  setTimeout(refreshIcons, 800);
});

// Re-render après chaque openModal
const _origOpenModal = window.openModal;
window.openModal = function (id) {
  if (_origOpenModal) _origOpenModal(id);
  else document.getElementById(id)?.classList.remove("hidden");
  setTimeout(refreshIcons, 60);
};


// =========================================
// TRANSLATION DICTIONARY (FR, AR, EN)
// =========================================
const translations = {
  fr: {
    search_placeholder: "Rechercher restaurant, plat, produit…",
    rewards_title: "Récompenses",
    rewards_desc: "Gagnez des points & cadeaux",
    invite_title: "Parrainage",
    invite_desc: "Invitez & gagnez 30 MAD",
    cat_all: "Tous",
    cat_food: "Food",
    cat_groceries: "Groceries",
    cat_package: "Package",
    cat_shops: "Shops",
    cat_para: "Para",
    pop_restaurants: "Restaurants populaires",
    see_all: "Voir tout",
    special_offer: "Offre Limitée",
    order_now: "Commander maintenant",
    pop_categories: "Catégories populaires",
    nearby_restaurants: "Près de chez vous",
    our_services: "Nos services",
    explore: "Explorer",
    s_food: "Food",
    s_food_sub: "Plats & Repas",
    s_courses: "Courses",
    s_courses_sub: "Supermarchés",
    s_colis: "Colis",
    s_colis_sub: "Livraison express",
    s_flowers: "Fleurs",
    s_flowers_sub: "Pour vos proches",
    s_para: "Parapharmacie",
    s_para_sub: "Santé & beauté",
    s_shops: "Boutiques",
    s_shops_sub: "Mode & High-Tech",
    app_cta_desc: "Profitez d'une expérience encore plus rapide sur notre application mobile.",
    nav_home: "Accueil",
    nav_explore: "Explorer",
    nav_cart: "Panier",
    nav_profile: "Profil",
    settings_title: "Paramètres de l'application",
    lang_label: "Langue / اللغة",
    dark_mode: "Mode Sombre (Dark Mode)",
    profile_mgmt: "Gestion du Profil",
    loyalty_points: "Mes Points & Fidélité",
    dev_credit: "Développé avec excellence"
  },
  ar: {
    search_placeholder: "ابحث عن مطعم، وجبة، أو منتج...",
    rewards_title: "المكافآت",
    rewards_desc: "اربح نقاطاً وهدايا",
    invite_title: "دعوة الأصدقاء",
    invite_desc: "ادفع واربح 30 درهم",
    cat_all: "الكل",
    cat_food: "طعام",
    cat_groceries: "مؤونة",
    cat_package: "طرود",
    cat_shops: "متاجر",
    cat_para: "صيدلية",
    pop_restaurants: "المطاعم الشائعة",
    see_all: "عرض الكل",
    special_offer: "عرض محدود",
    order_now: "اطلب الآن",
    pop_categories: "التصنيفات الشائعة",
    nearby_restaurants: "بالقرب منك",
    our_services: "خدماتنا",
    explore: "استكشاف",
    s_food: "طعام",
    s_food_sub: "وجبات وأطباق",
    s_courses: "مشتريات",
    s_courses_sub: "محلات وسوبرماركت",
    s_colis: "طرود",
    s_colis_sub: "توصيل سريع",
    s_flowers: "زهور",
    s_flowers_sub: "لأحبائك",
    s_para: "صيدلية",
    s_para_sub: "صحة وجمال",
    s_shops: "متاجر",
    s_shops_sub: "أزياء وتقنية",
    app_cta_desc: "استمتع بتجربة أسرع بكثير عبر تطبيقنا الهاتفي.",
    nav_home: "الرئيسية",
    nav_explore: "استكشاف",
    nav_cart: "السلة",
    nav_profile: "الملف الشخصي",
    settings_title: "إعدادات التطبيق",
    lang_label: "اللغة / Langue",
    dark_mode: "الوضع المظلم (Dark Mode)",
    profile_mgmt: "إدارة الحساب",
    loyalty_points: "نقاط الولاء والمكافآت",
    dev_credit: "تم التطوير باحترافية"
  },
  en: {
    search_placeholder: "Search restaurant, dish, product...",
    rewards_title: "Rewards",
    rewards_desc: "Earn points & gifts",
    invite_title: "Referral",
    invite_desc: "Invite & get 30 MAD",
    cat_all: "All",
    cat_food: "Food",
    cat_groceries: "Groceries",
    cat_package: "Package",
    cat_shops: "Shops",
    cat_para: "Para",
    pop_restaurants: "Popular Restaurants",
    see_all: "See all",
    special_offer: "Limited Offer",
    order_now: "Order Now",
    pop_categories: "Popular Categories",
    nearby_restaurants: "Near You",
    our_services: "Our Services",
    explore: "Explore",
    s_food: "Food",
    s_food_sub: "Meals & Dishes",
    s_courses: "Groceries",
    s_courses_sub: "Supermarkets",
    s_colis: "Packages",
    s_colis_sub: "Express delivery",
    s_flowers: "Flowers",
    s_flowers_sub: "For loved ones",
    s_para: "Pharmacy",
    s_para_sub: "Health & beauty",
    s_shops: "Shops",
    s_shops_sub: "Fashion & Tech",
    app_cta_desc: "Enjoy an even faster experience on our mobile app.",
    nav_home: "Home",
    nav_explore: "Explore",
    nav_cart: "Cart",
    nav_profile: "Profile",
    settings_title: "App Settings",
    lang_label: "Language / اللغة",
    dark_mode: "Dark Mode",
    profile_mgmt: "Profile Management",
    loyalty_points: "Loyalty Points",
    dev_credit: "Developed with excellence"
  }
};

// Textes ajoutés pour la nouvelle page d'accueil
Object.assign(translations.fr, {
  chip_top: "Mieux notés", chip_offers: "Offres", chip_near: "Près de vous",
  chip_free: "Livraison gratuite", chip_open: "Ouverts",
  all_restaurants: "Tous les restaurants", deliver_to: "Livrer à",
  choose_address: "Choisir mon adresse", offers_today: "Offres du jour",
  closed: "Fermé", free: "Gratuite", soon: "Bientôt disponible",
  fast_delivery: "Livraison rapide", new: "Nouveau",
  no_results: "Aucun restaurant ne correspond.",
  loading_error: "Impossible de charger les données.", retry: "Réessayer",
  see_results: "Voir tous les résultats",
  near_fallback: "Position des restaurants non renseignée : tri par rapidité de livraison.",
  location_denied: "Position indisponible. Choisissez une adresse de livraison."
});
Object.assign(translations.ar, {
  chip_top: "الأعلى تقييماً", chip_offers: "العروض", chip_near: "قريب منك",
  chip_free: "توصيل مجاني", chip_open: "مفتوح الآن",
  all_restaurants: "كل المطاعم", deliver_to: "التوصيل إلى",
  choose_address: "اختر عنوانك", offers_today: "عروض اليوم",
  closed: "مغلق", free: "مجاني", soon: "قريباً",
  fast_delivery: "توصيل سريع", new: "جديد",
  no_results: "لا توجد نتائج مطابقة.",
  loading_error: "تعذر تحميل البيانات.", retry: "إعادة المحاولة",
  see_results: "عرض كل النتائج",
  near_fallback: "مواقع المطاعم غير مسجلة: الترتيب حسب سرعة التوصيل.",
  location_denied: "تعذر تحديد موقعك. اختر عنوان التوصيل."
});
Object.assign(translations.en, {
  chip_top: "Top rated", chip_offers: "Offers", chip_near: "Near you",
  chip_free: "Free delivery", chip_open: "Open now",
  all_restaurants: "All restaurants", deliver_to: "Deliver to",
  choose_address: "Choose your address", offers_today: "Today's offers",
  closed: "Closed", free: "Free", soon: "Coming soon",
  fast_delivery: "Fast delivery", new: "New",
  no_results: "No matching restaurants.",
  loading_error: "Could not load data.", retry: "Retry",
  see_results: "See all results",
  near_fallback: "Restaurant locations not set: sorted by delivery speed.",
  location_denied: "Location unavailable. Please choose a delivery address."
});

function applyLanguage(lang) {
  const dict = translations[lang] || translations.fr;
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) el.textContent = dict[key];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (dict[key]) el.placeholder = dict[key];
  });

  const root = document.getElementById("htmlRoot");
  if (lang === "ar") {
    root.setAttribute("dir", "rtl");
    root.setAttribute("lang", "ar");
  } else {
    root.setAttribute("dir", "ltr");
    root.setAttribute("lang", lang);
  }
}


// =========================================
// SIDE DRAWER LOGIC
// =========================================
const menuToggleBtn = document.getElementById("menuToggleBtn");
const sideDrawer = document.getElementById("sideDrawer");
const drawerOverlay = document.getElementById("drawerOverlay");
const closeDrawerBtn = document.getElementById("closeDrawerBtn");

function openDrawer() {
  if (sideDrawer && drawerOverlay) {
    sideDrawer.classList.add("open");
    drawerOverlay.classList.remove("hidden");
  }
}

function closeDrawer() {
  if (sideDrawer && drawerOverlay) {
    sideDrawer.classList.remove("open");
    drawerOverlay.classList.add("hidden");
  }
}

if (menuToggleBtn) menuToggleBtn.onclick = openDrawer;
if (closeDrawerBtn) closeDrawerBtn.onclick = closeDrawer;
if (drawerOverlay) drawerOverlay.onclick = closeDrawer;


// =========================================
// INITIALIZE SETTINGS & LANGUAGE
// =========================================
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeSettingsModal = document.getElementById("closeSettingsModal");
const darkModeToggle = document.getElementById("darkModeToggle");
const languageSelect = document.getElementById("languageSelect");

const filterBtn = document.getElementById("filterBtn");
const filterModal = document.getElementById("filterModal");
const closeFilterModal = document.getElementById("closeFilterModal");

if (settingsBtn && settingsModal) {
  settingsBtn.onclick = () => {
    settingsModal.classList.remove("hidden");
    setTimeout(refreshIcons, 60);
  };
  closeSettingsModal.onclick = () => settingsModal.classList.add("hidden");
}

if (filterBtn && filterModal) {
  filterBtn.onclick = () => {
    filterModal.classList.remove("hidden");
    setTimeout(refreshIcons, 60);
  };
  closeFilterModal.onclick = () => filterModal.classList.add("hidden");
}

// Theme Persistence
const savedTheme = localStorage.getItem("quickly_theme") || "light";
if (savedTheme === "dark") {
  document.documentElement.setAttribute("data-theme", "dark");
  if (darkModeToggle) darkModeToggle.checked = true;
}

if (darkModeToggle) {
  darkModeToggle.onchange = (e) => {
    if (e.target.checked) {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("quickly_theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("quickly_theme", "light");
    }
  };
}

// Language Persistence
const savedLang = localStorage.getItem("quickly_lang") || "fr";
if (languageSelect) {
  languageSelect.value = savedLang;
  applyLanguage(savedLang);
  languageSelect.onchange = (e) => {
    const newLang = e.target.value;
    localStorage.setItem("quickly_lang", newLang);
    applyLanguage(newLang);
  };
}


// =========================================
// OUTILS
// =========================================
function t(key) {
  const lang = localStorage.getItem("quickly_lang") || "fr";
  return (translations[lang] && translations[lang][key]) || translations.fr[key] || key;
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

let toastTimer;
function showToast(message) {
  let el = document.getElementById("homeToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "homeToast";
    el.className = "home-toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}


// =========================================
// ÉTAT
// =========================================
const state = {
  restaurants: [],
  offers: [],
  banners: [],
  filters: new Set(),
  userPos: null
};


// =========================================
// LOGIQUE MÉTIER (données réelles Firebase)
// =========================================
function isListed(r) {
  if (r.active === false) return false;
  const s = String(r.status || "").toLowerCase();
  return !["inactive", "disabled", "hidden", "deleted"].includes(s);
}

const isOpenNow = (r) => r.isOpen !== false;

function ratingOf(r) {
  const n = Number(r.rating);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isFree(r) {
  return r.freeDelivery === true
    || r.deliveryFee === "Free"
    || (r.deliveryFee !== undefined && r.deliveryFee !== "" && Number(r.deliveryFee) === 0);
}

function feeLabel(r) {
  if (isFree(r)) return t("free");
  const n = Number(r.deliveryFee);
  return Number.isFinite(n) && r.deliveryFee !== "" && r.deliveryFee != null ? `${n} DH` : "";
}

function etaMinutes(r) {
  const m = String(r.deliveryTime || "").match(/\d+/);
  return m ? Number(m[0]) : 999;
}

function coordsOf(r) {
  const lat = Number(r.lat ?? r.latitude ?? r.location?.lat ?? r.location?.latitude ?? r.coordinates?.lat);
  const lng = Number(r.lng ?? r.longitude ?? r.location?.lng ?? r.location?.longitude ?? r.coordinates?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null;
}

function distanceKm(a, b) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function distanceOf(r) {
  const c = coordsOf(r);
  return c && state.userPos ? distanceKm(state.userPos, c) : null;
}

function isOfferValid(o) {
  if (o.active === false) return false;
  const now = new Date();
  const start = toDate(o.startAt);
  const end = toDate(o.endAt);
  if (start && start > now) return false;
  if (end && end < now) return false;
  return true;
}

function offerFor(r) {
  return state.offers.find(o => o.restaurantId === r.id) || null;
}

function hasOffer(r) {
  return r.todayOffer === true || !!offerFor(r);
}

function readSavedPosition() {
  const lat = parseFloat(localStorage.getItem("latitude"));
  const lng = parseFloat(localStorage.getItem("longitude"));
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function askBrowserPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 300000 }
    );
  });
}


// =========================================
// BARRE D'ADRESSE (en-tête)
// =========================================
function renderLocationBar() {
  const el = document.getElementById("locationText");
  if (!el) return;
  const addr = localStorage.getItem("selectedAddress");
  el.textContent = addr || t("choose_address");
}


// =========================================
// BADGE PANIER
// =========================================
function updateCartBadge() {
  const badge = document.getElementById("cartBadgeCount");
  if (!badge) return;
  const count = getCartCount();
  badge.textContent = count > 99 ? "99+" : String(count);
  badge.style.display = count > 0 ? "flex" : "none";
}
window.addEventListener(CART_EVENT, updateCartBadge);


// =========================================
// CARTES
// =========================================
const PLACEHOLDER_BG = "background:linear-gradient(135deg,#dbeafe,#e2e8f0)";

function imgTag(src, alt) {
  if (!src) return "";
  return `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" onerror="this.style.visibility='hidden'">`;
}

function badgesHtml(r) {
  const parts = [];
  const offer = offerFor(r);
  if (offer || r.todayOffer === true) {
    parts.push(`<span class="mini-badge badge-offer"><i data-lucide="tag"></i> ${esc(offer?.title || t("chip_offers"))}</span>`);
  }
  if (isFree(r)) {
    parts.push(`<span class="mini-badge badge-free"><i data-lucide="bike"></i> ${esc(t("free"))}</span>`);
  }
  return parts.length ? `<div class="badge-stack">${parts.join("")}</div>` : "";
}

function metaLine(r) {
  const bits = [];
  const rt = ratingOf(r);
  bits.push(rt
    ? `<span class="meta-rating"><i data-lucide="star"></i> ${rt.toFixed(1)}</span>`
    : `<span class="meta-new">${esc(t("new"))}</span>`);

  if (r.deliveryTime) {
    bits.push(`<span><i data-lucide="clock"></i> ${esc(r.deliveryTime)}</span>`);
  }

  const fee = feeLabel(r);
  if (fee) {
    bits.push(`<span><i data-lucide="bike"></i> ${esc(fee)}</span>`);
  }

  const d = distanceOf(r);
  if (d !== null) {
    bits.push(`<span><i data-lucide="map-pin"></i> ${d < 1 ? Math.round(d * 1000) + " m" : d.toFixed(1) + " km"}</span>`);
  }

  return bits.join("");
}

function closedOverlay(r) {
  return isOpenNow(r) ? "" : `<div class="closed-overlay"><span>${esc(t("closed"))}</span></div>`;
}

function hCard(r) {
  return `
    <a href="restaurant.html?id=${encodeURIComponent(r.id)}" class="restaurant-link-card ${isOpenNow(r) ? "" : "is-closed"}">
      <div class="restaurant-card-box">
        <div class="card-image-wrap" style="${PLACEHOLDER_BG}">
          ${imgTag(r.image || r.logo, r.name)}
          ${badgesHtml(r)}
          ${closedOverlay(r)}
        </div>
        <div class="card-details-pad">
          <h4 class="card-title">${esc(r.name)}</h4>
          <p class="card-subtitle">${esc(r.categoryName || r.category || "")}</p>
          <div class="card-meta">${metaLine(r)}</div>
        </div>
      </div>
    </a>`;
}

function vCard(r) {
  const imgSrc = r.image || r.logo || "";
  const showLogo = r.logo && r.logo !== r.image;

  return `
    <a href="restaurant.html?id=${encodeURIComponent(r.id)}" class="rest-card-v ${isOpenNow(r) ? "" : "is-closed"}">
      <div class="rest-card-v-img" style="${PLACEHOLDER_BG}">
        ${imgTag(imgSrc, r.name)}
        ${badgesHtml(r)}
        ${closedOverlay(r)}
        ${showLogo ? `<div class="rest-logo-chip">${imgTag(r.logo, "")}</div>` : ""}
      </div>
      <div class="rest-card-v-body">
        <h4>${esc(r.name)}</h4>
        <p>${esc(r.categoryName || r.category || "Restaurant")}</p>
        <div class="card-meta">${metaLine(r)}</div>
      </div>
    </a>`;
}

function skeletons(n, cls) {
  return Array.from({ length: n }, () => `<div class="skeleton ${cls}"></div>`).join("");
}

function errorBox(id) {
  return `<div class="home-state">
    <i data-lucide="triangle-alert"></i>
    <p>${esc(t("loading_error"))}</p>
    <button class="retry-btn" data-retry="${id}">${esc(t("retry"))}</button>
  </div>`;
}


// =========================================
// RENDU DES SECTIONS
// =========================================
const popularEl = document.getElementById("restaurantsContainer");
const nearbyEl = document.getElementById("nearbyRestaurantsContainer");
const allListEl = document.getElementById("allRestaurantsList");
const filterNoteEl = document.getElementById("filterNote");
const nearbyTitleEl = document.getElementById("nearbyTitle");
const countBadgeEl = document.getElementById("allRestaurantsCount");

function renderPopular() {
  if (!popularEl) return;
  const list = [...state.restaurants]
    .filter(r => ratingOf(r) !== null)
    .sort((a, b) => ratingOf(b) - ratingOf(a))
    .slice(0, 10);
  const source = list.length ? list : state.restaurants.slice(0, 10);
  popularEl.innerHTML = source.length
    ? source.map(hCard).join("")
    : `<div class="home-state"><p>${esc(t("no_results"))}</p></div>`;
}

function renderNearby() {
  if (!nearbyEl) return;
  const withDistance = state.restaurants
    .map(r => ({ r, d: distanceOf(r) }))
    .filter(x => x.d !== null)
    .sort((a, b) => a.d - b.d);

  let list;
  if (withDistance.length) {
    list = withDistance.map(x => x.r).slice(0, 10);
    if (nearbyTitleEl) nearbyTitleEl.textContent = t("nearby_restaurants");
  } else {
    list = [...state.restaurants].filter(isOpenNow).sort((a, b) => etaMinutes(a) - etaMinutes(b)).slice(0, 10);
    if (nearbyTitleEl) nearbyTitleEl.textContent = t("fast_delivery");
  }
  nearbyEl.innerHTML = list.length
    ? list.map(hCard).join("")
    : `<div class="home-state"><p>${esc(t("no_results"))}</p></div>`;
}

function applyFilters() {
  let list = [...state.restaurants];
  const f = state.filters;

  if (f.has("top")) list = list.filter(r => (ratingOf(r) || 0) >= 4.5);
  if (f.has("offers")) list = list.filter(hasOffer);
  if (f.has("free")) list = list.filter(isFree);
  if (f.has("open")) list = list.filter(isOpenNow);

  let note = "";
  if (f.has("near")) {
    const anyCoords = list.some(r => distanceOf(r) !== null);
    if (anyCoords) {
      list = list
        .map(r => ({ r, d: distanceOf(r) }))
        .sort((a, b) => (a.d ?? 9999) - (b.d ?? 9999))
        .map(x => x.r);
    } else {
      list.sort((a, b) => etaMinutes(a) - etaMinutes(b));
      note = t("near_fallback");
    }
  } else if (f.has("top")) {
    list.sort((a, b) => (ratingOf(b) || 0) - (ratingOf(a) || 0));
  } else {
    list.sort((a, b) => Number(isOpenNow(b)) - Number(isOpenNow(a)));
  }

  return { list, note };
}


/* =====================================================
   RENDU DE LA LISTE — Horizontal Scroll
===================================================== */
function renderAllList() {
  if (!allListEl) return;

  const { list, note } = applyFilters();

  // ---- Count pill avec animation ----
  if (countBadgeEl) {
    countBadgeEl.textContent = String(list.length);
    countBadgeEl.classList.remove("bump");
    void countBadgeEl.offsetWidth;
    countBadgeEl.classList.add("bump");
    setTimeout(() => countBadgeEl.classList.remove("bump"), 400);
  }

  // ---- Note de filtre ----
  if (filterNoteEl) {
    if (note) {
      filterNoteEl.innerHTML = `<i data-lucide="info"></i><span>${esc(note)}</span>`;
      filterNoteEl.style.display = "flex";
    } else {
      filterNoteEl.style.display = "none";
    }
  }

  // ---- Rendu principal ----
  if (list.length === 0) {
    allListEl.innerHTML = `
      <div class="home-state" style="flex:0 0 100%; min-width:100%;">
        <i data-lucide="store"></i>
        <p style="font-weight:800; font-size:14px; margin-bottom:6px;">${esc(t("no_results"))}</p>
        <p style="font-size:12px; color:var(--text-secondary); margin-bottom:12px;">Essayez un autre filtre</p>
        <button class="retry-btn" onclick="document.getElementById('chipReset').click()">
          <i data-lucide="rotate-ccw"></i> Réinitialiser
        </button>
      </div>`;
  } else {
    allListEl.innerHTML = list.map(vCard).join("");
  }

  // ---- Met à jour les badges count dans les chips ----
  if (typeof updateChipCounts === "function") {
    setTimeout(updateChipCounts, 50);
  }

  // ---- Défilement horizontal : reset au début ----
  allListEl.scrollLeft = 0;
  allListEl.scrollTop = 0;

  // ---- Refresh icons ----
  setTimeout(refreshIcons, 30);
}

function renderChipsState() {
  document.querySelectorAll(".chip-filter").forEach(chip => {
    chip.classList.toggle("active", state.filters.has(chip.dataset.filter));
  });
}


// =========================================
// OFFRES
// =========================================
function renderOffers() {
  const showcase = document.getElementById("specialOfferSection");
  const offersSection = document.getElementById("offersSection");
  const offersEl = document.getElementById("offersContainer");

  const offers = state.offers
    .map(o => ({ o, r: state.restaurants.find(x => x.id === o.restaurantId) }))
    .filter(x => x.r);

  if (showcase) {
    if (offers.length) {
      const { o, r } = offers[0];
      const bg = document.getElementById("offerBgImg");
      const img = o.image || r.image;
      if (bg && img) bg.style.backgroundImage = `url("${String(img).replace(/"/g, "%22")}")`;
      const logo = document.getElementById("offerRestaurantLogo");
      if (logo) logo.src = r.logo || r.image || "";
      document.getElementById("offerTitle").textContent = o.title || "";
      document.getElementById("offerRestaurantName").textContent = r.name || "";
      const priceEl = document.getElementById("offerPrice");
      if (Number(o.discountValue) > 0) {
        priceEl.textContent = `${Number(o.discountValue)} DH`;
        priceEl.style.display = "";
      } else {
        priceEl.style.display = "none";
      }
      const go = () => { location.href = `restaurant.html?id=${encodeURIComponent(r.id)}`; };
      showcase.onclick = go;
      showcase.style.display = "";
    } else {
      showcase.style.display = "none";
    }
  }

  if (offersSection && offersEl) {
    if (offers.length > 1) {
      offersEl.innerHTML = offers.map(({ o, r }) => `
        <a href="restaurant.html?id=${encodeURIComponent(r.id)}" class="offer-mini-card">
          <div class="offer-mini-img" style="${PLACEHOLDER_BG}">${imgTag(o.image || r.image, o.title)}</div>
          <div class="offer-mini-body">
            <h5>${esc(o.title)}</h5>
            <p>${esc(r.name)}</p>
            ${Number(o.discountValue) > 0 ? `<span class="offer-mini-price">${Number(o.discountValue)} DH</span>` : ""}
          </div>
        </a>`).join("");
      offersSection.style.display = "";
    } else {
      offersSection.style.display = "none";
    }
  }
}


// =========================================
// BANNIÈRES
// =========================================
let bannerTimer = null;

function renderBanners() {
  const box = document.getElementById("promoSliderContainer");
  const track = document.getElementById("bannerSlidesWrapper");
  if (!box || !track) return;
  clearInterval(bannerTimer);

  if (!state.banners.length) {
    box.style.display = "none";
    return;
  }

  track.innerHTML = state.banners.map((b, i) => `
    <div class="banner-slide-item ${i === 0 ? "active" : ""}" data-index="${i}">
      ${b.image ? `<img class="banner-img-element banner-cover" src="${esc(b.image)}" alt="${esc(b.title)}" onerror="this.style.visibility='hidden'">` : ""}
      <div class="banner-text-overlay">
        <h3>${esc(b.title)}</h3>
        ${b.subtitle ? `<p>${esc(b.subtitle)}</p>` : ""}
      </div>
    </div>`).join("") +
    (state.banners.length > 1
      ? `<div class="banner-dots">${state.banners.map((_, i) => `<span class="${i === 0 ? "active" : ""}" data-dot="${i}"></span>`).join("")}</div>`
      : "");

  box.style.display = "";

  const slides = track.querySelectorAll(".banner-slide-item");
  const dots = track.querySelectorAll("[data-dot]");
  let current = 0;

  const show = (i) => {
    current = (i + slides.length) % slides.length;
    slides.forEach((s, idx) => s.classList.toggle("active", idx === current));
    dots.forEach((d, idx) => d.classList.toggle("active", idx === current));
  };

  slides.forEach((s, idx) => {
    s.onclick = () => bannerAction(state.banners[idx]);
  });
  dots.forEach((d) => {
    d.onclick = (e) => { e.stopPropagation(); show(Number(d.dataset.dot)); };
  });

  if (slides.length > 1) {
    bannerTimer = setInterval(() => { if (!document.hidden) show(current + 1); }, 4500);
  }
}

function bannerAction(b) {
  if (!b) return;
  if (b.link) {
    if (/^(https?:\/\/|[a-z0-9_\-./?=&%]+\.html)/i.test(b.link)) { location.href = b.link; }
    return;
  }
  if (b.restaurantId) { location.href = `restaurant.html?id=${encodeURIComponent(b.restaurantId)}`; return; }
  if (b.category) { location.href = `food.html?category=${encodeURIComponent(b.category)}`; }
}


// =========================================
// CATÉGORIES
// =========================================
const categoriesContainer = document.getElementById("categoriesContainer");

async function loadCategories() {
  if (!categoriesContainer) return;
  try {
    const snapshot = await getDocs(query(collection(db, "foodCategories"), orderBy("order")));

    let html = `
      <div class="category-mini-card" onclick="window.location.href='food.html?category=all'">
        <div style="background:#eaf3fc; width:44px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; margin-bottom:4px;">
          <i data-lucide="layout-grid" style="width:22px;height:22px;stroke:#0878D1;"></i>
        </div>
        <span>${esc(t("cat_all"))}</span>
      </div>`;

    snapshot.forEach((docSnap) => {
      const item = docSnap.data();
      if (item.active === false) return;
      const slug = item.slug || docSnap.id;
      html += `
        <div class="category-mini-card" onclick="window.location.href='food.html?category=${encodeURIComponent(slug)}'">
          ${imgTag(item.image, item.name)}
          <span>${esc(item.name)}</span>
        </div>`;
    });

    categoriesContainer.innerHTML = html;
    setTimeout(refreshIcons, 30);
  } catch (err) {
    console.error("Error loading categories:", err);
    categoriesContainer.innerHTML = errorBox("categories");
    setTimeout(refreshIcons, 30);
  }
}


// =========================================
// CHARGEMENT DES DONNÉES
// =========================================
async function loadRestaurantsAndOffers() {
  if (popularEl) popularEl.innerHTML = skeletons(3, "sk-h");
  if (nearbyEl) nearbyEl.innerHTML = skeletons(3, "sk-h");
  if (allListEl) allListEl.innerHTML = skeletons(3, "sk-v");

  try {
    const [restSnap, offerSnap] = await Promise.all([
      getDocs(collection(db, "restaurants")),
      getDocs(collection(db, "offers")).catch(() => null)
    ]);

    state.restaurants = restSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(isListed);

    state.offers = offerSnap
      ? offerSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(isOfferValid)
      : [];

    renderAll();
    updateChipCounts();
  } catch (err) {
    console.error("Error loading restaurants:", err);
    if (popularEl) popularEl.innerHTML = errorBox("restaurants");
    if (nearbyEl) nearbyEl.innerHTML = "";
    if (allListEl) allListEl.innerHTML = "";
  }
}

async function loadBanners() {
  try {
    const snap = await getDocs(collection(db, "banners"));
    const now = new Date();
    state.banners = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(b => {
        if (b.active === false) return false;
        const start = toDate(b.startAt);
        const end = toDate(b.endAt);
        if (start && start > now) return false;
        if (end && end < now) return false;
        return !!(b.image || b.title);
      })
      .sort((a, b) => {
        const oa = Number.isFinite(Number(a.order)) ? Number(a.order) : 9999;
        const ob = Number.isFinite(Number(b.order)) ? Number(b.order) : 9999;
        if (oa !== ob) return oa - ob;
        return (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0);
      });
    renderBanners();
  } catch (err) {
    console.error("Error loading banners:", err);
    const box = document.getElementById("promoSliderContainer");
    if (box) box.style.display = "none";
  }
}

function renderAll() {
  renderLocationBar();
  renderPopular();
  renderNearby();
  renderAllList();
  renderOffers();
  renderChipsState();
  setTimeout(refreshIcons, 40);
}


// =========================================
// FILTRES RAPIDES — Auto-scroll + Count + Reset
// =========================================
const chipsRow = document.getElementById("filterChipsRow");
const chipReset = document.getElementById("chipReset");

/* ---- Toast dédié au filtre ---- */
let filterToastTimer;
function showFilterToast(msg, icon = "check") {
  let el = document.getElementById("filterToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "filterToast";
    el.className = "filter-toast";
    document.body.appendChild(el);
  }
  el.innerHTML = `<i data-lucide="${icon}"></i><span>${msg}</span>`;
  el.classList.add("show");
  setTimeout(refreshIcons, 40);
  clearTimeout(filterToastTimer);
  filterToastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ---- Auto-scroll vers la section ---- */
function scrollToRestaurantsSection() {
  const section = document.getElementById("allRestaurantsSection");
  if (!section) return;

  const top = section.getBoundingClientRect().top + window.scrollY - 70;

  window.scrollTo({
    top: Math.max(0, top),
    behavior: "smooth"
  });

  setTimeout(() => {
    section.classList.remove("highlight-flash");
    void section.offsetWidth;
    section.classList.add("highlight-flash");
    setTimeout(() => section.classList.remove("highlight-flash"), 1300);
  }, 400);
}

/* ---- Mettre à jour les counts dans chaque chip ---- */
function updateChipCounts() {
  if (!chipsRow) return;
  const restaurants = state.restaurants;

  chipsRow.querySelectorAll(".chip-filter").forEach(chip => {
    const key = chip.dataset.filter;
    if (!key || key === "all" || key === "near") {
      const existing = chip.querySelector(".chip-count");
      if (existing) existing.remove();
      return;
    }

    let count = 0;
    if (key === "top") count = restaurants.filter(r => (ratingOf(r) || 0) >= 4.5).length;
    else if (key === "offers") count = restaurants.filter(hasOffer).length;
    else if (key === "free") count = restaurants.filter(isFree).length;
    else if (key === "open") count = restaurants.filter(isOpenNow).length;

    let badge = chip.querySelector(".chip-count");
    if (count > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "chip-count";
        chip.appendChild(badge);
      }
      badge.textContent = count;
    } else if (badge) {
      badge.remove();
    }
  });
}

/* ---- Activer un chip spécifique ---- */
function activateChip(filterKey, options = {}) {
  const { scroll = true, silent = false } = options;

  if (!chipsRow) return;

  chipsRow.querySelectorAll(".chip-filter").forEach(c => c.classList.remove("active"));

  const target = chipsRow.querySelector(`.chip-filter[data-filter="${filterKey}"]`);
  if (target) target.classList.add("active");

  state.filters.clear();
  if (filterKey !== "all") state.filters.add(filterKey);

  if (chipReset) {
    chipReset.classList.toggle("hidden", filterKey === "all");
  }

  renderAllList();

  if (!silent && filterKey !== "all") {
    const labels = {
      top: t("chip_top"),
      offers: t("chip_offers"),
      near: t("chip_near"),
      free: t("chip_free"),
      open: t("chip_open")
    };
    const count = state.restaurants.filter(r => {
      if (filterKey === "top") return (ratingOf(r) || 0) >= 4.5;
      if (filterKey === "offers") return hasOffer(r);
      if (filterKey === "free") return isFree(r);
      if (filterKey === "open") return isOpenNow(r);
      return true;
    }).length;

    showFilterToast(`${count} ${count === 1 ? "résultat" : "résultats"} · ${labels[filterKey] || ""}`, "check-circle");
  }

  if (scroll) {
    setTimeout(scrollToRestaurantsSection, 100);
  }
}

/* ---- Event Listeners ---- */
if (chipsRow) {
  chipsRow.querySelectorAll(".chip-filter").forEach(chip => {
    chip.addEventListener("click", async (e) => {
      e.preventDefault();
      const key = chip.dataset.filter;

      if (chip.id === "chipReset" || key === "all") {
        activateChip("all", { scroll: true, silent: true });
        showFilterToast("Filtres réinitialisés", "rotate-ccw");
        return;
      }

      if (chip.classList.contains("active") && key !== "all") {
        activateChip("all", { scroll: true, silent: true });
        return;
      }

      if (key === "near") {
        if (!state.userPos) {
          state.userPos = readSavedPosition();
          if (!state.userPos) {
            chip.classList.add("loading");
            state.userPos = await askBrowserPosition();
            chip.classList.remove("loading");
            if (!state.userPos) {
              showToast(t("location_denied"));
              return;
            }
          }
          renderNearby();
        }
      }

      await activateChip(key, { scroll: true });
    });
  });
}

/* ---- Sticky chips au scroll ---- */
if (chipsRow) {
  let lastScrollY = 0;
  const onScroll = () => {
    const rect = chipsRow.getBoundingClientRect();
    const shouldStick = rect.top <= 0;

    if (shouldStick && window.scrollY > lastScrollY) {
      chipsRow.classList.add("sticky");
    } else if (window.scrollY < lastScrollY - 20) {
      chipsRow.classList.remove("sticky");
    }
    lastScrollY = window.scrollY;
  };
  window.addEventListener("scroll", onScroll, { passive: true });
}


// =========================================
// RECHERCHE EN DIRECT
// =========================================
const searchInput = document.getElementById("searchInput");
const searchDropdown = document.getElementById("searchResultsDropdown");

if (searchInput && searchDropdown) {
  let debounceTimer;

  const runSearch = () => {
    const text = searchInput.value.trim().toLowerCase();
    if (!text) {
      searchDropdown.classList.add("hidden");
      searchDropdown.innerHTML = "";
      return;
    }

    const matches = state.restaurants.filter(r =>
      String(r.name || "").toLowerCase().includes(text) ||
      String(r.categoryName || "").toLowerCase().includes(text) ||
      (Array.isArray(r.searchKeywords) && r.searchKeywords.some(k => String(k).toLowerCase().includes(text)))
    ).slice(0, 6);

    let html = matches.map(r => `
      <a href="restaurant.html?id=${encodeURIComponent(r.id)}" class="search-result-row">
        ${imgTag(r.image || r.logo, r.name)}
        <div class="search-result-info">
          <h5>${esc(r.name)}</h5>
          <p>${esc(r.categoryName || "Restaurant")}${r.deliveryTime ? " • " + esc(r.deliveryTime) : ""}</p>
        </div>
      </a>`).join("");

    if (!html) {
      html = `<div style="padding:14px; text-align:center; font-size:12px; color:var(--text-secondary);">${esc(t("no_results"))}</div>`;
    }
    html += `<a href="search.html?q=${encodeURIComponent(searchInput.value.trim())}" class="search-see-all">${esc(t("see_results"))} <i data-lucide="arrow-right"></i></a>`;

    searchDropdown.innerHTML = html;
    searchDropdown.classList.remove("hidden");
    setTimeout(refreshIcons, 30);
  };

  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, 200);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && searchInput.value.trim()) {
      location.href = `search.html?q=${encodeURIComponent(searchInput.value.trim())}`;
    }
  });

  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
      searchDropdown.classList.add("hidden");
    }
  });
}


// =========================================
// SERVICES PAS ENCORE PRÊTS
// =========================================
document.querySelectorAll("[data-soon], #packageServiceBtn, #paraServiceBtn").forEach(el => {
  el.style.cursor = "pointer";
  el.addEventListener("click", () => showToast(t("soon")));
});

// Boutons "Réessayer"
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-retry]");
  if (!btn) return;
  if (btn.dataset.retry === "categories") loadCategories();
  else loadRestaurantsAndOffers();
});

// Changement de langue → re-rendu
if (languageSelect) {
  languageSelect.addEventListener("change", () => {
    renderAll();
    loadCategories();
  });
}


// =========================================
// INITIALISATION
// =========================================
function hideLoader() {
  const loader = document.getElementById("customerLoader");
  if (!loader) return;
  loader.style.opacity = "0";
  setTimeout(() => loader.remove(), 300);
}

document.addEventListener("DOMContentLoaded", async () => {
  refreshIcons();

  updateCartBadge();
  renderLocationBar();
  state.userPos = readSavedPosition();

  const safety = setTimeout(hideLoader, 4000);
  await Promise.all([loadCategories(), loadRestaurantsAndOffers(), loadBanners()]);
  clearTimeout(safety);
  hideLoader();

  setTimeout(refreshIcons, 100);
  setTimeout(refreshIcons, 500);
});
