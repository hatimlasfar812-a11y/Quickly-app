// =====================================================
// hypermarket-core.js
// Logique commune à toutes les pages "supermarché"
// (groceries.js, carrefour.js, et plus tard bim.js, marjane.js...)
//
// Pour ajouter un magasin : ajouter une entrée dans STORES
// puis copier carrefour.html/js/css en changeant la config.
// =====================================================

import { db } from "./firebase.js";

import {
  collection,
  getDocs,
  query,
  where,
  limit,
  startAfter
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import {
  addToCart,
  getCart,
  getCartCount,
  increaseQuantity,
  decreaseQuantity,
  clearCart,
  CART_EVENT
} from "./cart.js";

// =====================================================
// 1) CONFIGURATION DES MAGASINS
// =====================================================
//  chain            : valeur du champ "chain" dans la collection hypermarkets
//  productStoreName : valeur EXACTE du champ "store" dans hypermarket_products
//  page             : page dédiée du magasin
//  eurToMad         : taux de change si les prix scrapés sont en euros
//                     (laisser null tant que le taux n'est pas décidé)
//  applyMarkup      : true = applique hypermarkets/{id}.priceMarkup (%)
//                     ATTENTION : ne l'activer que si le scraper n'a pas
//                     déjà ajouté la marge dans le champ price.
export const STORES = {
  carrefour: {
    chain: "carrefour",
    productStoreName: "Carrefour",
    page: "carrefour.html",
    eurToMad: null,
    applyMarkup: false
  }
  // bim: {
  //   chain: "bim",
  //   productStoreName: "BIM",
  //   page: "bim.html",
  //   eurToMad: null,
  //   applyMarkup: false
  // }
};

export const PAGE_SIZE = 48;   // produits lus par requête (1 lecture = 1 produit)
export const HARD_CAP = 2000;  // garde-fou : jamais plus de 2000 produits chargés

// =====================================================
// 2) TEXTES (français) — centralisés pour une traduction future
// =====================================================
export const TEXT = {
  add: "Ajouter",
  added: "Ajouté au panier",
  cartError: "Impossible d'ajouter ce produit.",
  priceUnavailable: "Prix indisponible",
  unavailable: "Indisponible",
  cartConflict:
    "Votre panier contient des articles de « {current} ».\nLe vider pour commander chez « {next} » ?",
  loadError: "Impossible de charger les données. Vérifiez votre connexion.",
  retry: "Réessayer"
};

// =====================================================
// 3) OUTILS GÉNÉRAUX
// =====================================================
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// minuscules, sans accents, œ -> oe : pour la recherche et la classification
export function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/[’`]/g, "'")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return (Number.isInteger(n) ? String(n) : n.toFixed(2)) + " DH";
}

// n'accepte que http(s) ou un chemin relatif (bloque javascript:, data:...)
export function safeImageUrl(url) {
  const s = String(url ?? "").trim();
  if (!s) return "";
  
  let finalUrl = s;
  if (/^https?:\/\//i.test(s) || s.startsWith("//")) {
    finalUrl = s.startsWith("//") ? "https:" + s : s;
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    return "";
  }
  
  // 🚀 حماية الصور باش تبان ديما
  if (
    finalUrl.includes("carrefour.ma") ||
    finalUrl.includes("carrefour.fr") ||
    finalUrl.includes("glovo.dhmedia.io") ||
    finalUrl.includes("images.deliveryhero.io")
  ) {
    return `https://wsrv.nl/?url=${encodeURIComponent(finalUrl)}`;
  }
  
  return finalUrl;
}
// image de secours (SVG intégré : aucune dépendance externe)
export const PLACEHOLDER_IMG =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">` +
    `<rect width="200" height="200" fill="#EEF2F7"/>` +
    `<g fill="none" stroke="#9AA7B8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M62 80h76l8 80H54z"/><path d="M80 80a20 20 0 0 1 40 0"/></g></svg>`
  );

export function refreshIcons() {
  if (window.lucide?.createIcons) {
    try { window.lucide.createIcons(); } catch (_) { /* ignore */ }
  }
}

export function showToast(message, type = "success") {
  let host = document.getElementById("toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    host.className = "toast-host";
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }

  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  host.appendChild(el);

  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 300);
  }, 2200);
}

// =====================================================
// 4) PRIX : "2,75€" -> nombre + devise  (puis conversion en DH)
// =====================================================

// "1.234,56" / "1,234.56" / "2,75" / "1 234" -> nombre
function normalizeNumberString(s) {
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    const dec = lastComma > lastDot ? "," : ".";
    const thou = dec === "," ? "." : ",";
    return s.split(thou).join("").replace(dec, ".");
  }

  const sep = lastComma > -1 ? "," : lastDot > -1 ? "." : null;
  if (!sep) return s;

  const parts = s.split(sep);
  const last = parts[parts.length - 1];

  // un seul séparateur suivi de 1 ou 2 chiffres = décimale
  if (parts.length === 2 && last.length <= 2) return parts[0] + "." + last;

  // sinon c'est un séparateur de milliers
  return parts.join("");
}

// retourne { amount, currency } ou null ; currency = "EUR" | "MAD" | null
export function parsePrice(raw) {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? { amount: raw, currency: null } : null;
  }
  if (typeof raw !== "string") return null;

  const text = raw.replace(/\u00a0/g, " ").trim();
  if (!text) return null;

  let currency = null;
  if (/€|\beuros?\b|\beur\b/i.test(text)) currency = "EUR";
  else if (/\bdh\b|\bmad\b|د\.?\s?م|درهم/i.test(text)) currency = "MAD";

  const match = text.match(/\d[\d\s.,]*/);
  if (!match) return null;

  const cleaned = match[0].replace(/\s/g, "").replace(/[.,]+$/, "");
  const amount = Number(normalizeNumberString(cleaned));

  return Number.isFinite(amount) && amount >= 0 ? { amount, currency } : null;
}

// Convertit en DH. Retourne null si le prix n'est pas fiable :
// un prix en € SANS taux de change n'est jamais affiché comme des DH.
export function toMad(parsed, ctx) {
  if (!parsed) return null;

  let value = parsed.amount;

  if (parsed.currency === "EUR") {
    const rate = Number(ctx.eurToMad);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    value *= rate;
  }

  if (ctx.applyMarkup) {
    const markup = Number(ctx.priceMarkup);
    if (Number.isFinite(markup) && markup > 0) value *= 1 + markup / 100;
  }

  value = Math.round(value * 100) / 100;
  return value > 0 ? value : null;
}

// =====================================================
// 5) CATÉGORIES (classification par mots-clés)
// =====================================================
// L'ordre du tableau = ordre d'affichage dans la barre latérale.
export const CATEGORIES = [
  { key: "frais", label: "Produits frais", icon: "apple",
    kw: ["fruit", "fruits", "legume", "legumes", "banane", "pomme", "orange", "citron", "fraise", "raisin",
         "tomate", "pomme de terre", "carotte", "oignon", "salade", "concombre", "courgette", "poivron",
         "poulet", "viande", "boeuf", "agneau", "veau", "dinde", "hache", "saucisse", "merguez",
         "poisson", "crevette", "charcuterie", "jambon", "pain", "baguette", "croissant", "patisserie",
         "فواكه", "خضر", "دجاج", "لحم", "سمك", "خبز"] },
  { key: "laitiers", label: "Laitiers & Œufs", icon: "milk",
    kw: ["lait", "yaourt", "yogourt", "yoghurt", "fromage", "beurre", "creme fraiche", "creme", "raibi",
         "lben", "jben", "petit suisse", "danone", "oeuf", "oeufs", "kiri", "vache qui rit",
         "emmental", "mozzarella", "حليب", "لبن", "جبن", "زبدة", "بيض", "رايب"] },
  { key: "epicerie_salee", label: "Épicerie salée", icon: "wheat",
    kw: ["pate", "pates", "spaghetti", "macaroni", "riz", "semoule", "couscous", "farine", "huile",
         "vinaigre", "sel", "poivre", "epice", "epices", "cumin", "paprika", "curcuma", "conserve",
         "conserves", "thon", "sardines", "concentre de tomate", "sauce", "mais", "pois chiche",
         "pois chiches", "lentille", "lentilles", "haricot", "haricots", "olive", "olives", "cornichon",
         "moutarde", "mayonnaise", "ketchup", "harissa", "bouillon", "soupe", "chips", "cacahuete",
         "amande", "noix", "fruits secs", "فرينة", "زيت", "أرز", "رز", "عدس", "حمص", "معكرونة",
         "سميد", "كسكس", "ملح", "توابل", "معلبات"] },
  { key: "epicerie_sucree", label: "Épicerie sucrée", icon: "cookie",
    kw: ["sucre", "chocolat", "biscuit", "biscuits", "gateau", "gateaux", "bonbon", "bonbons", "confiture",
         "miel", "nutella", "cereale", "cereales", "corn flakes", "pate a tartiner", "chewing gum",
         "caramel", "vanille", "levure chimique", "madeleine", "cake", "dessert", "compote",
         "سكر", "شوكولاتة", "بسكويت", "حلوى", "مربى", "عسل"] },
  { key: "boissons", label: "Boissons", icon: "cup-soda",
    kw: ["eau", "eau minerale", "jus", "soda", "limonade", "boisson", "boissons", "cafe", "the", "infusion",
         "sirop", "energy", "red bull", "coca", "coca cola", "fanta", "sprite", "pepsi", "oulmes",
         "sidi ali", "sidi harazem", "ain saiss", "nectar", "lipton", "schweppes", "hawai",
         "ماء", "عصير", "مشروب", "قهوة", "شاي"] },
  { key: "hygiene", label: "Hygiène & Beauté", icon: "sparkles",
    kw: ["shampoing", "shampooing", "gel douche", "savon", "dentifrice", "brosse a dents", "deodorant",
         "parfum", "eau de toilette", "eau de cologne", "eau de parfum", "creme visage", "rasoir",
         "mousse a raser", "serviette hygienique", "serviettes hygieniques", "tampon", "papier toilette",
         "papier hygienique", "mouchoir", "mouchoirs", "coton", "maquillage", "vernis", "lotion",
         "hygiene", "beaute", "شامبو", "صابون", "معجون", "مزيل"] },
  { key: "maison", label: "Maison & Entretien", icon: "house",
    kw: ["lessive", "javel", "eau de javel", "vaisselle", "nettoyant", "detergent", "adoucissant",
         "eponge", "sac poubelle", "poubelle", "desodorisant", "insecticide", "balai", "serpillere",
         "essuie tout", "papier alu", "aluminium", "film alimentaire", "ampoule", "pile", "piles",
         "bougie", "entretien", "منظف", "جافيل", "اسفنج"] },
  { key: "bebe", label: "Bébé", icon: "baby",
    kw: ["bebe", "couche", "couches", "lingette", "lingettes", "biberon", "lait infantile",
         "lait 1er age", "lait 2eme age", "lait de croissance", "gallia", "guigoz", "bledina",
         "petit pot", "petits pots", "pampers", "حفاظات", "رضيع"] },
  { key: "animaux", label: "Animaux", icon: "paw-print",
    kw: ["chien", "chat", "croquette", "croquettes", "patee", "litiere", "animal", "animaux",
         "friskies", "whiskas", "pedigree", "كلب", "قط"] },
  { key: "surgeles", label: "Surgelés", icon: "snowflake",
    kw: ["surgele", "surgeles", "glace", "glaces", "congele", "nuggets", "مجمد", "مثلجات"] },
  { key: "autres", label: "Autres", icon: "package", kw: [] }
];

// ordre de priorité quand un nom correspond à plusieurs catégories
const PRIORITY = [
  "bebe", "animaux", "surgeles", "maison", "hygiene", "boissons",
  "laitiers", "epicerie_sucree", "epicerie_salee", "frais"
];

// anciennes catégories de la page admin -> nos catégories
const ADMIN_KEY_MAP = {
  beverages: "boissons",
  dairy: "laitiers",
  bakery: "frais",
  meat: "frais",
  fruits: "frais",
  cleaning: "maison",
  hygiene: "hygiene",
  other: "autres"
};

const CATEGORY_KEYS = new Set(CATEGORIES.map(c => c.key));

// mots entiers uniquement ("laitue" ne doit pas être classée comme "lait")
const MATCHERS = Object.fromEntries(
  CATEGORIES.map(c => [
    c.key,
    c.kw.map(word => {
      const w = normalizeText(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^\\p{L}\\p{N}])${w}(s|x)?($|[^\\p{L}\\p{N}])`, "u");
    })
  ])
);

export function classifyText(text) {
  const t = normalizeText(text);
  if (!t) return "autres";
  for (const key of PRIORITY) {
    if (MATCHERS[key].some(re => re.test(t))) return key;
  }
  return "autres";
}

export function categoryInfo(key) {
  return CATEGORIES.find(c => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
}

function resolveCategory(data, ctx) {
  const raw = data.category ?? data.categorie ?? "";

  if (raw) {
    const norm = normalizeText(raw).replace(/[ &-]+/g, "_");
    if (CATEGORY_KEYS.has(norm)) return norm;

    // mapping défini dans l'admin (hypermarkets.categoryMapping)
    const mapped = ctx.categoryMapping?.[raw];
    if (mapped && ADMIN_KEY_MAP[mapped]) return ADMIN_KEY_MAP[mapped];
    if (ADMIN_KEY_MAP[norm]) return ADMIN_KEY_MAP[norm];

    const byCategory = classifyText(raw);
    if (byCategory !== "autres") return byCategory;
  }

  return classifyText(data.name ?? data.title ?? "");
}

// =====================================================
// 6) PRODUITS : normalisation d'un document Firestore
// =====================================================
export function normalizeProduct(id, data, ctx) {
  const name = String(data.name ?? data.title ?? "").trim();
  if (!name) return null; // produit sans nom : ignoré

  // prix déjà en DH (champs numériques) sinon on analyse le texte de "price"
  let price = null;
  for (const field of ["priceMAD", "finalPrice"]) {
    const n = Number(data[field]);
    if (Number.isFinite(n) && n > 0) { price = Math.round(n * 100) / 100; break; }
  }
  if (price === null) price = toMad(parsePrice(data.price), ctx);

  const unit = String(data.unit ?? data.weight ?? data.size ?? data.format ?? "").trim();

  return {
    id,
    name,
    unit,
    price,                       // nombre en DH, ou null si non fiable
    priceRaw: data.price ?? null,
    image: safeImageUrl(data.image ?? data.imageUrl ?? data.img ?? data.thumbnail),
    category: resolveCategory(data, ctx),
    orderable: price !== null,
    searchText: normalizeText(`${name} ${unit}`)
  };
}

// =====================================================
// 7) FIRESTORE
// =====================================================

// Liste des magasins actifs (petite collection : quelques documents)
export async function fetchHypermarkets() {
  const snap = await getDocs(collection(db, "hypermarkets"));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(h => !h.status || h.status === "active");
}

export function resolveStoreConfig(hypermarket) {
  const chain = normalizeText(hypermarket?.chain);
  if (chain && STORES[chain]) return STORES[chain];

  const name = normalizeText(hypermarket?.name);
  return Object.values(STORES).find(s => normalizeText(s.productStoreName) === name) || null;
}

export async function findHypermarket(storeConfig) {
  const list = await fetchHypermarkets();
  const chain = normalizeText(storeConfig.chain);
  const name = normalizeText(storeConfig.productStoreName);
  return (
    list.find(h => normalizeText(h.chain) === chain) ||
    list.find(h => normalizeText(h.name) === name) ||
    null
  );
}

// Une page de produits approuvés.
// Deux filtres d'égalité + ordre par défaut (ID du document) :
// pas d'index composite nécessaire. Si Firestore en réclame un,
// le message d'erreur contient un lien de création en un clic.
export async function fetchApprovedPage(storeName, { pageSize = PAGE_SIZE, after = null } = {}) {
  const constraints = [
    where("store", "==", storeName),
    where("status", "==", "approved")
  ];
  if (after) constraints.push(startAfter(after));
  constraints.push(limit(pageSize));

  const snap = await getDocs(query(collection(db, "hypermarket_products"), ...constraints));

  return {
    docs: snap.docs,
    last: snap.docs.length ? snap.docs[snap.docs.length - 1] : null,
    hasMore: snap.docs.length === pageSize
  };
}

// =====================================================
// 8) PANIER (adaptateur vers cart.js)
// =====================================================
export function toCartItem(product, vendor) {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    image: product.image,
    unit: product.unit,
    restaurantId: vendor.id,          // même champ que les restaurants : checkout.js le lit
    restaurantName: vendor.name,
    restaurantLogo: vendor.logo,
    vendorType: "store",
    vendorUrl: vendor.page,
    sauce: "",
    extras: [],
    without: [],
    quantity: 1
  };
}

export function findCartLine(productId, vendorId) {
  return getCart().findIndex(i => i.id === productId && i.restaurantId === vendorId);
}

export function cartQuantities(vendorId) {
  const map = new Map();
  getCart().forEach(i => {
    if (i.restaurantId === vendorId) map.set(i.id, i.quantity);
  });
  return map;
}

// retourne "added" | "cancelled" | "error"
export function addProductToCart(product, vendor) {
  const other = getCart().find(i => i.restaurantId && i.restaurantId !== vendor.id);

  if (other) {
    const message = TEXT.cartConflict
      .replace("{current}", other.restaurantName || "un autre magasin")
      .replace("{next}", vendor.name);
    if (!window.confirm(message)) return "cancelled";
    clearCart();
  }

  return addToCart(toCartItem(product, vendor)) === false ? "error" : "added";
}

export function changeQuantity(productId, vendorId, delta) {
  const index = findCartLine(productId, vendorId);
  if (index < 0) return;
  if (delta > 0) increaseQuantity(index);
  else decreaseQuantity(index);
}

// badge du panier dans l'en-tête
export function bindCartBadge(el) {
  const update = () => {
    const n = getCartCount();
    el.textContent = n > 99 ? "99+" : String(n);
    el.hidden = n === 0;
  };
  update();
  window.addEventListener(CART_EVENT, update);
  window.addEventListener("storage", update);
  window.addEventListener("pageshow", update);
  return update;
}