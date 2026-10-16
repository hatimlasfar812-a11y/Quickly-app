// =====================================================
// cart.js  —  منطق السلة (مصدر واحد للحقيقة)
// المفتاح الوحيد في localStorage: "cart"
// =====================================================

const STORAGE_KEY = "cart";
const MAX_QTY = 99;

// حدث يُطلق كلما تغيرت السلة (في هذه الصفحة أو في تبويب آخر)
export const CART_EVENT = "cart:changed";

// ---------- تحميل آمن ----------
function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  
  const price = Number(raw.price);
  const quantity = Math.floor(Number(raw.quantity));
  
  if (!raw.id || !raw.name) return null;
  if (!Number.isFinite(price) || price < 0) return null;
  
  return {
    ...raw,
    price,
    quantity: Number.isFinite(quantity) && quantity > 0 ?
      Math.min(quantity, MAX_QTY) :
      1
  };
}

function loadCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeItem).filter(Boolean);
  } catch {
    return [];
  }
}

export let cart = loadCart();

// ---------- حفظ ----------
function saveCart() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  } catch (err) {
    console.error("Cart save failed:", err);
  }
  window.dispatchEvent(new CustomEvent(CART_EVENT));
}

// مزامنة بين التبويبات
window.addEventListener("storage", (e) => {
  if (e.key !== STORAGE_KEY) return;
  cart = loadCart();
  window.dispatchEvent(new CustomEvent(CART_EVENT));
});

// ---------- مفتاح تمييز العنصر (نفس المنتج بخيارات مختلفة = عنصر مختلف) ----------
function names(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .map(v => (typeof v === "object" && v !== null ? v.name : v))
    .filter(Boolean)
    .map(String)
    .sort();
}

function itemKey(item) {
  return JSON.stringify({
    id: item.id,
    restaurantId: item.restaurantId || "",
    sauce: names(item.sauce),
    extras: names(item.extras),
    without: names(item.without),
    specs: item.selectedSpecs || null
  });
}

// ---------- العمليات الأساسية ----------
export function getCart() {
  return cart;
}

export function addToCart(product) {
  const incoming = normalizeItem({ ...product, quantity: 1 });
  if (!incoming) {
    console.error("addToCart: invalid product", product);
    return false;
  }
  
  const key = itemKey(incoming);
  const existing = cart.find(item => itemKey(item) === key);
  
  if (existing) {
    existing.quantity = Math.min(existing.quantity + 1, MAX_QTY);
  } else {
    cart.push(incoming);
  }
  
  saveCart();
  return true;
}

export function increaseQuantity(index) {
  const item = cart[index];
  if (!item) return;
  item.quantity = Math.min(item.quantity + 1, MAX_QTY);
  saveCart();
}

export function decreaseQuantity(index) {
  const item = cart[index];
  if (!item) return;
  item.quantity--;
  if (item.quantity <= 0) cart.splice(index, 1);
  saveCart();
}

export function removeFromCart(index) {
  if (!cart[index]) return;
  cart.splice(index, 1);
  saveCart();
}

export function clearCart() {
  cart = [];
  saveCart();
}

// ---------- أدوات إضافية ----------
export function getCartCount() {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

export function getCartSubtotal() {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

// المطاعم/المتاجر الموجودة في السلة (للتحقق من قاعدة "مطعم واحد في الطلب")
export function getVendors() {
  const map = new Map();
  cart.forEach(item => {
    const id = item.restaurantId || "";
    if (!map.has(id)) {
      map.set(id, {
        id,
        name: item.restaurantName || "",
        logo: item.restaurantLogo || ""
      });
    }
  });
  return [...map.values()];
}

export function keepOnlyVendor(vendorId) {
  cart = cart.filter(item => (item.restaurantId || "") === vendorId);
  saveCart();
}