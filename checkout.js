import { auth, db } from "./firebase.js";
import { getCart, clearCart } from "./cart.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

/* =====================================================
   ÉLÉMENTS DE LA PAGE
===================================================== */
const orderItems = document.getElementById("orderItems");
const subtotalEl = document.getElementById("subtotal");
const totalPriceEl = document.getElementById("totalPrice");
const deliveryAddress = document.getElementById("deliveryAddress");
const placeOrderBtn = document.getElementById("placeOrder");
const changeAddressBtn = document.getElementById("changeAddress");
const backBtn = document.getElementById("backBtn");

const couponInput = document.getElementById("couponInput");
const applyCouponBtn = document.getElementById("applyCouponBtn");
const couponMessage = document.getElementById("couponMessage");
const discountRow = document.getElementById("discountRow");

if (backBtn) backBtn.onclick = () => history.back();
if (changeAddressBtn) changeAddressBtn.onclick = () => { location.href = "addresses.html"; };

/* =====================================================
   CONSTANTES
   (les frais seront bientôt lus depuis settings dans Firebase)
===================================================== */
const DELIVERY_FEE = 12;
const SERVICE_FEE = 2;
const PENDING_ORDER_KEY = "pendingOrderId";

/* =====================================================
   OUTILS
===================================================== */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(n) {
  return (Number(n) || 0).toFixed(2) + " DH";
}

/* =====================================================
   PANIER
===================================================== */
const cart = getCart() || [];
let subtotalValue = 0;

// Le panier ne doit contenir qu'un seul restaurant / magasin
const vendorIds = new Set(cart.map(i => i.restaurantId || "").filter(Boolean));
const hasMixedVendors = vendorIds.size > 1;

const savedAddress = localStorage.getItem("selectedAddress");
if (deliveryAddress) {
  deliveryAddress.textContent = savedAddress || "Veuillez choisir votre adresse de livraison";
}

if (orderItems) {
  if (cart.length === 0) {
    orderItems.innerHTML =
      `<p style="font-size:12px; color:var(--text-secondary); text-align:center;">Votre panier est vide.</p>`;
  } else {
    orderItems.innerHTML = cart.map(item => {
      const qty = Number(item.quantity) || 1;
      const price = Number(item.price) || 0;
      subtotalValue += price * qty;
      return `
        <div class="order-item-row">
          <div class="order-item-name">${qty} × ${escapeHtml(item.name || "Produit")}</div>
          <div class="order-item-price">${money(price * qty)}</div>
        </div>`;
    }).join("");
  }
}

function getTotal() {
  return Math.max(0, subtotalValue + DELIVERY_FEE + SERVICE_FEE);
}

function updateTotals() {
  if (subtotalEl) subtotalEl.textContent = money(subtotalValue);
  if (totalPriceEl) totalPriceEl.textContent = money(getTotal());
}
updateTotals();

/* =====================================================
   CODES PROMO
   Les anciens codes écrits dans le JavaScript ont été supprimés
   (n'importe qui pouvait les lire). La validation sécurisée
   des coupons sera ajoutée avec une Cloud Function.
===================================================== */
if (discountRow) discountRow.style.display = "none";

if (couponInput) {
  couponInput.disabled = true;
  couponInput.placeholder = "Codes promo bientôt disponibles";
}
if (applyCouponBtn) {
  applyCouponBtn.disabled = true;
  applyCouponBtn.style.opacity = "0.5";
}
if (couponMessage) {
  couponMessage.style.color = "#64748b";
  couponMessage.textContent = "Les codes promo seront bientôt disponibles.";
}

/* =====================================================
   AUTHENTIFICATION
===================================================== */
let currentUser = null;
onAuthStateChanged(auth, user => { currentUser = user; });

/* =====================================================
   COMMANDE
   - un identifiant de commande est créé UNE SEULE FOIS puis
     réutilisé en cas de nouvel essai : impossible de créer
     deux commandes en double-cliquant, en rechargeant la page
     ou après une coupure Internet.
===================================================== */
function getPendingOrderId() {
  let id = sessionStorage.getItem(PENDING_ORDER_KEY);
  if (!id) {
    id = doc(collection(db, "orders")).id;
    sessionStorage.setItem(PENDING_ORDER_KEY, id);
  }
  return id;
}

function finishOrder(orderId) {
  sessionStorage.removeItem(PENDING_ORDER_KEY);
  clearCart();
  localStorage.setItem("lastOrderId", orderId);
  location.href = "order-success.html";
}

function resetButton() {
  placeOrderBtn.disabled = false;
  placeOrderBtn.textContent = "Valider la commande";
}

let isSubmitting = false;

if (placeOrderBtn) {
  placeOrderBtn.onclick = async () => {
    if (isSubmitting) return;
    
    if (!currentUser) {
      alert("Veuillez vous connecter pour valider votre commande.");
      location.href = "profile.html";
      return;
    }
    if (cart.length === 0) {
      alert("Votre panier est vide.");
      return;
    }
    if (hasMixedVendors) {
      alert("Votre panier contient des produits de plusieurs établissements. Veuillez commander chez un seul établissement à la fois.");
      return;
    }
    if (!localStorage.getItem("selectedAddress")) {
      alert("Veuillez choisir une adresse de livraison.");
      return;
    }
    if (!navigator.onLine) {
      alert("Pas de connexion Internet. Vérifiez votre connexion puis réessayez.");
      return;
    }
    
    isSubmitting = true;
    placeOrderBtn.disabled = true;
    placeOrderBtn.textContent = "Validation en cours...";
    
    const orderId = getPendingOrderId();
    const orderRef = doc(db, "orders", orderId);
    
    // JSON.parse(JSON.stringify()) retire les valeurs "undefined" (refusées par Firestore)
    const cleanItems = JSON.parse(JSON.stringify(cart));
    
    // Nom et téléphone du client : indispensables pour que l'admin et le livreur puissent le contacter
    let profile = {};
    try {
      const userSnap = await getDoc(doc(db, "users", currentUser.uid));
      if (userSnap.exists()) profile = userSnap.data();
    } catch (_) { /* on continue sans profil */ }

    const orderData = {
      uid: currentUser.uid,
      customerName: profile.fullName || profile.name || currentUser.displayName || "",
      customerPhone: profile.phone || currentUser.phoneNumber || "",
      orderNumber: orderId.slice(0, 8).toUpperCase(),
      restaurantId: cart[0].restaurantId || "",
      restaurantName: cart[0].restaurantName || "Restaurant Quickly",
      restaurantLogo: cart[0].restaurantLogo || "",
      items: cleanItems,
      subtotal: subtotalValue,
      deliveryFee: DELIVERY_FEE,
      serviceFee: SERVICE_FEE,
      discount: 0,
      total: getTotal(),
      paymentMethod: "Cash sur livraison",
      status: "pending",
      address: localStorage.getItem("selectedAddress"),
      latitude: localStorage.getItem("latitude") || null,
      longitude: localStorage.getItem("longitude") || null,
      building: localStorage.getItem("building") || "",
      floor: localStorage.getItem("floor") || "",
      note: (document.getElementById("orderNote")?.value || "").slice(0, 500),
      createdAt: serverTimestamp()
    };
    
    try {
      await setDoc(orderRef, orderData);
      finishOrder(orderId);
    } catch (err) {
      console.error("Checkout Error:", err);
      
      // Si la commande existe déjà (premier envoi réussi mais réponse perdue),
      // on ne la recrée pas : on va directement à la confirmation.
      try {
        const existing = await getDoc(orderRef);
        if (existing.exists()) {
          finishOrder(orderId);
          return;
        }
      } catch (_) { /* ignore */ }
      
      if (err && err.code === "permission-denied") {
        alert("Impossible de valider la commande. Veuillez vous reconnecter puis réessayer.");
      } else {
        alert("Erreur lors de la validation de la commande. Veuillez réessayer.");
      }
      isSubmitting = false;
      resetButton();
    }
  };
}