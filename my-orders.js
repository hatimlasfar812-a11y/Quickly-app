import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  collection,
  query,
  where,
  orderBy,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// ---- Helpers (affichage sûr + statuts lisibles) ----
const STATUS_FR = {
  pending: "En attente", confirmed: "Confirmée", preparing: "En préparation", ready: "Prête",
  assigned: "Livreur assigné", accepted: "Livreur en route vers le restaurant",
  picked_up: "Récupérée par le livreur", on_the_way: "En route vers vous",
  delivered: "Livrée", cancelled: "Annulée", rejected: "Refusée"
};
function statusLabel(raw) {
  const key = String(raw || "pending").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return STATUS_FR[key] || String(raw || "");
}
function escHtml(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const ordersContainer =
  document.getElementById("ordersContainer");

onAuthStateChanged(auth, async (user) => {
  
  if (!user) {
    
    location.href = "login.html";
    return;
    
  }
  
 const q = query(
  collection(db, "orders"),
  where("uid", "==", user.uid)
);

let snapshot;

try {
  
  snapshot = await getDocs(q);
  
  console.log("User UID:", user.uid);
 
  
  snapshot.forEach(doc => {
    console.log(doc.id, doc.data());
  });
  
} catch (err) {
  
  console.error(err);
  return;
  
}

  ordersContainer.innerHTML = "";
  
  if (snapshot.empty) {
    
    ordersContainer.innerHTML = `

<div class="empty">

<h2>No Orders Yet</h2>

<p>Your orders will appear here.</p>

</div>

`;
    
    return;
    
  }
  
snapshot.forEach((doc) => {
  
  const order = doc.data();
  
  ordersContainer.innerHTML += `
    <div class="order-card" data-id="${doc.id}">
      <h2>${escHtml(order.restaurantName || "Restaurant")}</h2>
      <p>Total: ${Number(order.total || 0).toFixed(2)} DH</p>
      <p>Statut : ${escHtml(statusLabel(order.status))}</p>
    </div>
  `;
  
});
  
  document.querySelectorAll(".order-card")
    .forEach(card => {
      
      card.onclick = () => {
        
        location.href =
          `order-details.html?id=${card.dataset.id}`;
        
      };
      
    });
  
});