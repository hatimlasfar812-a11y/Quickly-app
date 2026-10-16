import { db } from "./firebase.js";
import { addToCart, getCart } from "./cart.js";
import { resolveOptionGroups, groupLabel } from "./menu-options.js";

import {
  collection,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// =====================
// اللغات
// =====================

const I18N = {
  en: {
    addToCart: "Add to cart",
    added: "Added to cart",
    required: "Required",
    chooseRequired: "Please choose: {group}",
    none: "None",
    noSauce: "No sauce",
    close: "Close",
    noMenu: "No menu found.",
    notFound: "Restaurant not found.",
    error: "Something went wrong. Please try again.",
    currency: "DH"
  },
  fr: {
    addToCart: "Ajouter au panier",
    added: "Ajouté au panier",
    required: "Obligatoire",
    chooseRequired: "Veuillez choisir : {group}",
    none: "Aucun",
    noSauce: "Sans sauce",
    close: "Fermer",
    noMenu: "Aucun menu trouvé.",
    notFound: "Restaurant introuvable.",
    error: "Une erreur est survenue. Réessayez.",
    currency: "DH"
  },
  ar: {
    addToCart: "أضف إلى السلة",
    added: "تمت الإضافة إلى السلة",
    required: "مطلوب",
    chooseRequired: "يرجى الاختيار: {group}",
    none: "بدون",
    noSauce: "بدون صلصة",
    close: "إغلاق",
    noMenu: "لا توجد قائمة طعام.",
    notFound: "المطعم غير موجود.",
    error: "حدث خطأ، حاول مرة أخرى.",
    currency: "د.م"
  }
};

function getLang() {
  const l = (localStorage.getItem("lang") || localStorage.getItem("language") || "en").toLowerCase();
  return I18N[l] ? l : "en";
}

const lang = getLang();
const t = I18N[lang];

document.documentElement.lang = lang;
document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

// =====================
// أدوات
// =====================

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(value) {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toFixed(2) + " " + t.currency;
}

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
  }, 1800);
}

// =====================
// URL + عناصر الصفحة
// =====================

const params = new URLSearchParams(window.location.search);
const restaurantId = params.get("id");

const productModal = document.getElementById("productModal");
const productContent = productModal ? productModal.querySelector("#productContent") : null;
const menuContainer = document.getElementById("restaurantMenu");
const categoriesContainer = document.getElementById("restaurantCategories");

if (!productModal || !productContent) {
  console.error("Product modal not found");
}

// =====================
// البيانات
// =====================

let restaurant = {};
let products = [];

async function loadMenu() {
  if (!restaurantId) {
    menuContainer.innerHTML = `<p style="padding:20px">${esc(t.notFound)}</p>`;
    return;
  }

  localStorage.setItem("restaurantId", restaurantId);

  const restaurantDoc = await getDoc(doc(db, "restaurants", restaurantId));
  restaurant = restaurantDoc.exists() ? restaurantDoc.data() : {};

  const snapshot = await getDocs(collection(db, "restaurants", restaurantId, "menu"));

  products = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

  createCategories();
  renderProducts(products);
}

// =====================
// الأقسام
// =====================

const OFFERS = "🔥 العروض";

function isOffer(p) {
  return p.hasDiscount || p.discountPrice || p.isOffer ||
    p.category === "offers" || p.category === OFFERS || p.category === "العروض";
}

function createCategories() {
  categoriesContainer.innerHTML = "";

  const rawCategories = [...new Set(products.map(p => p.category))]
    .filter(c => c && c !== "offers" && c !== "العروض" && c !== OFFERS);

  const categories = ["All", OFFERS, ...rawCategories];

  categories.forEach(category => {
    const btn = document.createElement("button");
    btn.className = "category-btn";
    btn.textContent = category;

    if (category === OFFERS) {
      btn.style.color = "#ff4757";
      btn.style.fontWeight = "bold";
    }

    btn.onclick = () => {
      document.querySelectorAll(".category-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      if (category === "All") renderProducts(products);
      else if (category === OFFERS) renderProducts(products.filter(isOffer));
      else renderProducts(products.filter(p => p.category === category));
    };

    categoriesContainer.appendChild(btn);
  });

  categoriesContainer.firstElementChild?.classList.add("active");
}

// =====================
// عرض المنتجات
// =====================

function renderProducts(list) {
  if (!list.length) {
    menuContainer.innerHTML = `<p style="padding:20px">${esc(t.noMenu)}</p>`;
    return;
  }

  menuContainer.innerHTML = list.map(item => `
    <div class="menu-card" data-id="${esc(item.id)}">
      <div class="food-info">
        <h3>${esc(item.name)}</h3>
        <p>${esc(item.description || "")}</p>
        <h4>${money(item.price)}</h4>
      </div>
      ${item.image ? `
      <div class="food-image">
        <img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy">
        <button class="product-plus" aria-label="${esc(t.addToCart)}">+</button>
      </div>` : `
      <div class="food-image no-image">
        <button class="product-plus" aria-label="${esc(t.addToCart)}">+</button>
      </div>`}
    </div>
  `).join("");
}

// =====================
// الخيارات
// =====================

const optionDocCache = new Map();

async function fetchOptionDoc(type) {
  if (optionDocCache.has(type)) return optionDocCache.get(type);

  const snap = await getDoc(doc(db, "menuOptions", type));
  const data = snap.exists() ? snap.data() : null;

  optionDocCache.set(type, data);
  return data;
}

function optionRow(group, index, option, inputType) {
  const price = Number(option.price) || 0;
  return `
    <label class="option-item">
      <input type="${inputType}" name="g${index}" value="${esc(option.name)}" data-price="${price}">
      <span class="opt-name">${esc(option.name)}</span>
      ${price > 0 ? `<span class="opt-price">+${esc(money(price))}</span>` : ""}
    </label>`;
}

function groupHtml(group, index) {
  const label = groupLabel(group, lang);
  const isSingle = group.type === "single";

  let rows = "";

  // مجموعة اختيار واحد اختيارية: نضيف خيار "بدون"
  if (isSingle && !group.required) {
    const noneText = group.key === "sauces" ? t.noSauce : t.none;
    rows += `
      <label class="option-item">
        <input type="radio" name="g${index}" value="" data-price="0" checked>
        <span class="opt-name">${esc(noneText)}</span>
      </label>`;
  }

  rows += group.options
    .map(o => optionRow(group, index, o, isSingle ? "radio" : "checkbox"))
    .join("");

  return `
    <details class="option-group" data-index="${index}" open>
      <summary>
        <span class="g-title">${esc(label)}</span>
        ${group.required ? `<span class="g-badge">${esc(t.required)}</span>` : ""}
      </summary>
      <div class="g-options">${rows}</div>
    </details>`;
}

// يقرأ اختيارات الزبون من النافذة المفتوحة فقط
function collectSelection(groups) {
  let sauce = "";
  let optionsPrice = 0;
  const extras = [];
  const without = [];
  const missing = [];

  groups.forEach((group, index) => {
    const picked = [...productContent.querySelectorAll(`input[name="g${index}"]:checked`)]
      .filter(el => el.value !== "")
      .map(el => ({ name: el.value, price: Number(el.dataset.price) || 0 }));

    if (group.required && !picked.length) {
      missing.push({ index, label: groupLabel(group, lang) });
    }

    optionsPrice += picked.reduce((sum, p) => sum + p.price, 0);

    if (group.key === "without") {
      without.push(...picked.map(p => p.name));
    } else if (group.key === "sauces" && group.type === "single") {
      sauce = picked[0]?.name || "";
    } else {
      // with / extras / أي مجموعة أخرى
      extras.push(...picked.map(p => ({ ...p, group: group.key })));
    }
  });

  return { sauce, extras, without, optionsPrice, missing };
}

function cartPayload(product, selection) {
  return {
    id: product.id,
    name: product.name,
    image: product.image || "",
    restaurantId,
    restaurantName: restaurant?.name || "",
    restaurantLogo: restaurant?.logo || "",
    vendorType: "restaurant",
    price: Number(product.price) + selection.optionsPrice,
    sauce: selection.sauce,
    extras: selection.extras,
    without: selection.without,
    quantity: 1
  };
}

function closeSheet() {
  productModal.style.display = "none";
  productContent.innerHTML = "";
  document.body.style.overflow = "";
}

function openSheet(product, groups) {
  productContent.innerHTML = `
    <button class="sheet-close" type="button" aria-label="${esc(t.close)}">×</button>
    <h2>${esc(product.name)}</h2>
    <p>${esc(product.description || "")}</p>

    <div class="option-groups">
      ${groups.map(groupHtml).join("")}
    </div>

    <div class="sheet-footer">
      <button id="addToCart" type="button">
        <span>${esc(t.addToCart)}</span>
        <span id="sheetTotal"></span>
      </button>
    </div>
  `;

  const totalEl = productContent.querySelector("#sheetTotal");
  const addBtn = productContent.querySelector("#addToCart");

  const refreshTotal = () => {
    const { optionsPrice } = collectSelection(groups);
    totalEl.textContent = money(Number(product.price) + optionsPrice);
  };

  refreshTotal();

  productContent.onchange = e => {
    if (e.target.matches("input")) {
      e.target.closest(".option-group")?.classList.remove("has-error");
      refreshTotal();
    }
  };

  productContent.querySelector(".sheet-close").onclick = closeSheet;

  addBtn.onclick = () => {
    const selection = collectSelection(groups);

    if (selection.missing.length) {
      const first = selection.missing[0];
      const el = productContent.querySelector(`.option-group[data-index="${first.index}"]`);
      selection.missing.forEach(m => {
        productContent
          .querySelector(`.option-group[data-index="${m.index}"]`)
          ?.classList.add("has-error");
      });
      if (el) {
        el.open = true;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      toast(t.chooseRequired.replace("{group}", first.label));
      return;
    }

    const ok = addToCart(cartPayload(product, selection));
    if (ok === false) {
      toast(t.error);
      return;
    }

    updateCartBadge();
    closeSheet();
    toast(t.added);
  };

  productModal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

// =====================
// الضغط على منتج
// =====================

let busy = false;

document.addEventListener("click", async (e) => {
  const card = e.target.closest(".menu-card");
  if (!card || busy) return;

  const product = products.find(p => p.id === card.dataset.id);
  if (!product) return;

  if (!Number.isFinite(Number(product.price))) {
    toast(t.error);
    return;
  }

  busy = true;
  try {
    const resolved = await resolveOptionGroups(product, fetchOptionDoc);

    if (!resolved || !resolved.groups.length) {
      // منتج بدون خيارات: إضافة مباشرة
      const ok = addToCart(cartPayload(product, {
        sauce: "", extras: [], without: [], optionsPrice: 0
      }));
      if (ok === false) {
        toast(t.error);
      } else {
        updateCartBadge();
        toast(t.added);
      }
      return;
    }

    openSheet(product, resolved.groups);
  } catch (err) {
    console.error(err);
    toast(t.error);
  } finally {
    busy = false;
  }
});

// إغلاق النافذة: الضغط خارجها أو زر Escape
if (productModal) {
  productModal.addEventListener("click", (e) => {
    if (e.target === productModal) closeSheet();
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && productModal?.style.display === "flex") closeSheet();
});

// =====================
// عدّاد السلة
// =====================

function updateCartBadge() {
  const totalItems = getCart().reduce((sum, item) => sum + item.quantity, 0);

  const cartBadge = document.getElementById("cartBadge");
  if (!cartBadge) return;

  cartBadge.textContent = totalItems;
  cartBadge.style.display = totalItems > 0 ? "flex" : "none";
}

window.addEventListener("cart:changed", updateCartBadge);
window.addEventListener("pageshow", updateCartBadge);

document.getElementById("cartFab")?.addEventListener("click", () => {
  window.location.href = "cart.html";
});

// =====================
// البداية
// =====================

loadMenu()
  .then(updateCartBadge)
  .catch(err => {
    console.error(err);
    menuContainer.innerHTML = `<p style="padding:20px">${esc(t.error)}</p>`;
  });