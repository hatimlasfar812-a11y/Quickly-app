import { db } from "./firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// Get Order ID from URL or LocalStorage
const urlParams = new URLSearchParams(window.location.search);
let orderId = urlParams.get("id") || localStorage.getItem("lastOrderId");

const backBtn = document.getElementById("backBtn");
const restaurantName = document.getElementById("restaurantName");
const orderNumber = document.getElementById("orderNumber");
const statusBadge = document.getElementById("orderStatus");
const deliveryAddress = document.getElementById("address");
const itemsContainer = document.getElementById("itemsContainer");
const paymentMethod = document.getElementById("paymentMethod");

const subtotal = document.getElementById("subtotal");
const deliveryFee = document.getElementById("deliveryFee");
const serviceFee = document.getElementById("serviceFee");
const totalPrice = document.getElementById("totalPrice");

if (backBtn) {
  backBtn.onclick = () => history.back();
}

async function loadOrder() {
  if (!orderId) {
    alert("Aucune commande trouvée.");
    return;
  }
  
  try {
    const snap = await getDoc(doc(db, "orders", orderId));
    
    if (!snap.exists()) {
      alert("Commande introuvable dans la base de données.");
      return;
    }
    
    const order = snap.data();
    
    // Restaurant & Order Number
    if (restaurantName) restaurantName.textContent = order.restaurantName || "Restaurant Quickly";
    if (orderNumber) orderNumber.textContent = "Commande #" + orderId.slice(0, 8).toUpperCase();
    
    const currentStatus = String(order.status || "pending").trim().toLowerCase().replace(/[_-]+/g, " ");
    if (statusBadge) {
      statusBadge.textContent = ({
        "pending": "En attente", "confirmed": "Confirmée", "preparing": "En préparation", "ready": "Prête",
        "assigned": "Livreur assigné", "driver assigned": "Livreur assigné", "accepted": "Livreur en route",
        "picked up": "Récupérée", "on the way": "En route", "delivered": "Livrée",
        "cancelled": "Annulée", "canceled": "Annulée", "rejected": "Refusée"
      })[currentStatus] || order.status || "Pending";
      
      // Status Badge Colors
      if (currentStatus === "pending" || currentStatus === "confirmed") {
        statusBadge.style.background = "#FFF3CD";
        statusBadge.style.color = "#B8860B";
      } else if (currentStatus === "preparing" || currentStatus === "ready") {
        statusBadge.style.background = "#E3F2FD";
        statusBadge.style.color = "#1565C0";
      } else if (["driver assigned", "assigned", "accepted"].includes(currentStatus)) {
        statusBadge.style.background = "#E8F5E9";
        statusBadge.style.color = "#2E7D32";
      } else if (["on the way", "picked up"].includes(currentStatus)) {
        statusBadge.style.background = "#D1ECF1";
        statusBadge.style.color = "#0C5460";
      } else if (currentStatus === "delivered") {
        statusBadge.style.background = "#D4EDDA";
        statusBadge.style.color = "#155724";
      }
    }
    
    if (statusBadge && ["cancelled", "canceled", "rejected"].includes(currentStatus)) {
      statusBadge.style.background = "#FDECEA";
      statusBadge.style.color = "#B71C1C";
    }

    // Timeline Steps Activation
    const timelineMap = {
      "pending": ["stepPlaced"],
      "confirmed": ["stepPlaced"],
      "preparing": ["stepPlaced", "stepPreparing"],
      "ready": ["stepPlaced", "stepPreparing"],
      "assigned": ["stepPlaced", "stepPreparing", "stepDriver"],
      "driver assigned": ["stepPlaced", "stepPreparing", "stepDriver"],
      "accepted": ["stepPlaced", "stepPreparing", "stepDriver"],
      "picked up": ["stepPlaced", "stepPreparing", "stepDriver", "stepWay"],
      "on the way": ["stepPlaced", "stepPreparing", "stepDriver", "stepWay"],
      "delivered": ["stepPlaced", "stepPreparing", "stepDriver", "stepWay", "stepDelivered"],
      "cancelled": [], "canceled": [], "rejected": []
    };
    
    document.querySelectorAll(".step").forEach(s => s.classList.remove("active"));
    const activeSteps = timelineMap[currentStatus] || ["stepPlaced"];
    activeSteps.forEach(stepId => {
      const el = document.getElementById(stepId);
      if (el) el.classList.add("active");
    });
    
    // Address Formatting
    if (deliveryAddress) {
      deliveryAddress.innerHTML = `
        📍 ${order.address || "Adresse non spécifiée"}<br>
        🏢 Immeuble / Bâtiment: ${order.building || "-"}<br>
        🏠 Étage / Appt: ${order.floor || "-"}<br>
        📝 Note: ${order.note || "Aucune note"}
      `;
    }
    
    // Items Rendering
    if (itemsContainer) {
      itemsContainer.innerHTML = "";
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          const itemTotal = (Number(item.price) || 0) * (Number(item.quantity) || 1);
          itemsContainer.innerHTML += `
            <div class="item">
              <div class="item-left">
                <span class="item-name">${item.quantity || 1} × ${item.name || "Plat"}</span>
              </div>
              <div class="item-price">
                ${itemTotal.toFixed(2)} DH
              </div>
            </div>
          `;
        });
      }
    }
    
    // Payment Method
    if (paymentMethod) {
      paymentMethod.textContent = order.paymentMethod || "Espèces à la livraison (COD)";
    }
    
    // Price Summary calculation
    const subVal = Number(order.subtotal) || 0;
    const delVal = Number(order.deliveryFee) || 0;
    const srvVal = Number(order.serviceFee) || 0;
    const totVal = Number(order.total) || (subVal + delVal + srvVal);
    
    if (subtotal) subtotal.textContent = subVal.toFixed(2) + " DH";
    if (deliveryFee) deliveryFee.textContent = delVal.toFixed(2) + " DH";
    if (serviceFee) serviceFee.textContent = srvVal.toFixed(2) + " DH";
    if (totalPrice) totalPrice.textContent = totVal.toFixed(2) + " DH";
    
  } catch (err) {
    console.error("Error loading order details:", err);
    alert("Erreur lors du chargement des détails de la commande.");
  }
}

loadOrder();
