import {
  CART_EVENT,
  getCart,
  getCartCount,
  getCartSubtotal,
  getVendors,
  keepOnlyVendor,
  clearCart,
  increaseQuantity,
  decreaseQuantity,
  removeFromCart
} from "./cart.js";

// ---------- اللغات ----------
const I18N = {
  en: {
    title: "Your Cart",
    empty: "Your cart is empty",
    emptyHint: "Add something delicious to get started.",
    browse: "Browse restaurants",
    clear: "Clear",
    clearConfirm: "Remove all items from your cart?",
    subtotal: "Subtotal",
    feesNote: "Delivery and service fees are added at checkout.",
    checkout: "Go to checkout",
    sauce: "Sauce",
    extras: "Extras",
    without: "Without",
    remove: "Remove",
    item: "item",
    items: "items",
    conflictTitle: "Items from different restaurants",
    conflictText: "You can order from one restaurant at a time. Choose which one to keep:",
    keep: "Keep",
    restaurant: "Restaurant",
    currency: "DH"
  },
  ar: {
    title: "سلتك",
    empty: "سلتك فارغة",
    emptyHint: "أضف شيئًا لذيذًا لتبدأ.",
    browse: "تصفح المطاعم",
    clear: "تفريغ",
    clearConfirm: "هل تريد حذف كل المنتجات من السلة؟",
    subtotal: "المجموع الفرعي",
    feesNote: "تُضاف رسوم التوصيل والخدمة عند إتمام الطلب.",
    checkout: "إتمام الطلب",
    sauce: "الصلصة",
    extras: "الإضافات",
    without: "بدون",
    remove: "حذف",
    item: "منتج",
    items: "منتجات",
    conflictTitle: "منتجات من مطاعم مختلفة",
    conflictText: "يمكنك الطلب من مطعم واحد فقط في كل مرة. اختر المطعم الذي تريد الإبقاء عليه:",
    keep: "إبقاء",
    restaurant: "مطعم",
    currency: "د.م"
  },
  fr: {
    title: "Votre panier",
    empty: "Votre panier est vide",
    emptyHint: "Ajoutez quelque chose de délicieux pour commencer.",
    browse: "Voir les restaurants",
    clear: "Vider",
    clearConfirm: "Supprimer tous les articles du panier ?",
    subtotal: "Sous-total",
    feesNote: "Les frais de livraison et de service sont ajoutés à la commande.",
    checkout: "Passer la commande",
    sauce: "Sauce",
    extras: "Suppléments",
    without: "Sans",
    remove: "Supprimer",
    item: "article",
    items: "articles",
    conflictTitle: "Articles de restaurants différents",
    conflictText: "Vous ne pouvez commander que dans un restaurant à la fois. Choisissez celui à garder :",
    keep: "Garder",
    restaurant: "Restaurant",
    currency: "DH"
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

// ---------- أدوات ----------
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

function optionNames(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .map(v => (typeof v === "object" && v !== null ? v.name : v))
    .filter(Boolean)
    .map(String);
}

const FALLBACK_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='90' height='90'><rect width='90' height='90' fill='#f1f2f6'/><text x='45' y='56' font-size='34' text-anchor='middle'>🍽️</text></svg>`
  );

// ---------- عناصر الصفحة ----------
const $ = id => document.getElementById(id);

const cartItemsEl = $("cartItems");
const cartTotalEl = $("cartTotal");
const itemCountEl = $("itemCount");
const checkoutBtn = $("checkoutBtn");
const clearBtn = $("clearBtn");
const footer = $("cartFooter");
const conflictBox = $("vendorConflict");
const backBtn = document.querySelector(".back-btn");

$("pageTitle").textContent = t.title;
$("clearLabel").textContent = t.clear;
$("subtotalLabel").textContent = t.subtotal;
$("feesNote").textContent = t.feesNote;
checkoutBtn.textContent = t.checkout;
document.title = t.title + " · Quickly";

// ---------- العرض ----------
function renderConflict(vendors) {
  if (vendors.length <= 1) {
    conflictBox.hidden = true;
    conflictBox.innerHTML = "";
    return;
  }
  
  conflictBox.hidden = false;
  conflictBox.innerHTML = `
    <div class="conflict-title"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(t.conflictTitle)}</div>
    <p>${esc(t.conflictText)}</p>
    <div class="conflict-actions">
      ${vendors.map(v => `
        <button class="keep-btn" data-vendor="${esc(v.id)}">
          ${esc(t.keep)} ${esc(v.name || t.restaurant)}
        </button>`).join("")}
    </div>`;
}

function render() {
  const cart = getCart();
  const vendors = getVendors();
  
  // عنوان المطعم + زر الرجوع
  const first = cart[0];
  $("vendorName").textContent = vendors.length === 1 ? (first.restaurantName || "") : "";
  
  const vendorId = first?.restaurantId || localStorage.getItem("restaurantId");
  backBtn.href = vendorId ?
    `restaurant.html?id=${encodeURIComponent(vendorId)}` :
    "food.html";
  
  // سلة فارغة
  if (cart.length === 0) {
    cartItemsEl.innerHTML = `
      <div class="empty">
        <div class="empty-icon"><i class="fa-solid fa-basket-shopping"></i></div>
        <h3>${esc(t.empty)}</h3>
        <p>${esc(t.emptyHint)}</p>
        <a href="food.html" class="empty-btn">${esc(t.browse)}</a>
      </div>`;
    footer.hidden = true;
    clearBtn.hidden = true;
    conflictBox.hidden = true;
    document.body.classList.add("is-empty");
    return;
  }
  
  document.body.classList.remove("is-empty");
  footer.hidden = false;
  clearBtn.hidden = false;
  
  renderConflict(vendors);
  
  cartItemsEl.innerHTML = cart.map((item, index) => {
    const sauces = optionNames(item.sauce);
    const extras = Array.isArray(item.extras) ? item.extras : [];
    const without = optionNames(item.without);
    
    const extrasText = extras
      .map(e => (typeof e === "object" && e !== null ?
        `${e.name}${e.price ? ` (+${e.price} ${t.currency})` : ""}` :
        String(e)))
      .join(", ");
    
    return `
      <article class="cart-item">
        <img src="${esc(item.image || FALLBACK_IMG)}" class="cart-image" alt="" loading="lazy"
             onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">

        <div class="cart-info">
          <div class="cart-top">
            <h3>${esc(item.name)}</h3>
            <button class="delete-item" data-index="${index}" aria-label="${esc(t.remove)}">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>

          ${sauces.length ? `<p class="opt"><strong>${esc(t.sauce)}:</strong> ${esc(sauces.join(", "))}</p>` : ""}
          ${extrasText ? `<p class="opt"><strong>${esc(t.extras)}:</strong> ${esc(extrasText)}</p>` : ""}
          ${without.length ? `<p class="opt"><strong>${esc(t.without)}:</strong> ${esc(without.join(", "))}</p>` : ""}

          <div class="cart-bottom">
            <span class="price">${money(item.price * item.quantity)}</span>

            <div class="qty-box">
              <button class="minus" data-index="${index}" aria-label="−">−</button>
              <span>${item.quantity}</span>
              <button class="plus" data-index="${index}" aria-label="+">+</button>
            </div>
          </div>
        </div>
      </article>`;
  }).join("");
  
  const count = getCartCount();
  itemCountEl.textContent = `${count} ${count === 1 ? t.item : t.items}`;
  cartTotalEl.textContent = money(getCartSubtotal());
  
  // لا يمكن المتابعة وفي السلة أكثر من مطعم
  checkoutBtn.disabled = vendors.length > 1;
}

// ---------- الأحداث ----------
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  
  const index = Number(btn.dataset.index);
  
  if (btn.classList.contains("plus")) increaseQuantity(index);
  else if (btn.classList.contains("minus")) decreaseQuantity(index);
  else if (btn.classList.contains("delete-item")) removeFromCart(index);
  else if (btn.classList.contains("keep-btn")) keepOnlyVendor(btn.dataset.vendor);
});

clearBtn.addEventListener("click", () => {
  if (confirm(t.clearConfirm)) clearCart();
});

checkoutBtn.addEventListener("click", () => {
  if (getCart().length === 0 || checkoutBtn.disabled) return;
  location.href = "checkout.html";
});

// أي تغيير في السلة (هنا أو في تبويب آخر) يعيد الرسم تلقائيًا
window.addEventListener(CART_EVENT, render);

// عند الرجوع بزر الرجوع في المتصفح (bfcache)
window.addEventListener("pageshow", (e) => { if (e.persisted) location.reload(); });

render();