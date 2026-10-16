
import { db } from "./firebase.js";

import {
    isFavorite,
    toggleFavorite
} from "./favorites.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// =========================
// URL
// =========================

const params = new URLSearchParams(window.location.search);
const restaurantId = params.get("id");
console.log("Restaurant ID =", restaurantId);

// =========================
// ELEMENTS
// =========================

const hero = document.getElementById("restaurantHero");
const info = document.getElementById("restaurantInfo");
const backBtn = document.getElementById("backBtn");

const favoriteBtn = document.getElementById("favoriteBtn");
const favoriteIcon = favoriteBtn.querySelector("i");
// =========================
// BACK
// =========================

backBtn.addEventListener("click", () => {
    
    window.location.href = "food.html";
    
});

// =========================
// LOAD RESTAURANT
// =========================

async function loadRestaurant() {
    
    if (!restaurantId) return;
    
    const restaurantRef = doc(db, "restaurants", restaurantId);
    
    const snapshot = await getDoc(restaurantRef);
    
   if (!snapshot.exists()) {
    
    info.innerHTML = "<h2>Restaurant not found</h2>";
    
    return;
    
}

    
    const item = snapshot.data();
    
    if (isFavorite(restaurantId)) {
    
    favoriteIcon.classList.remove("fa-regular");
    favoriteIcon.classList.add("fa-solid");
    favoriteIcon.style.color = "#FF3B30";
    
}

favoriteBtn.onclick = () => {
    
    const favorite = toggleFavorite(restaurantId);
    
    if (favorite) {
        
        favoriteIcon.classList.remove("fa-regular");
        favoriteIcon.classList.add("fa-solid");
        favoriteIcon.style.color = "#FF3B30";
        
    } else {
        
        favoriteIcon.classList.remove("fa-solid");
        favoriteIcon.classList.add("fa-regular");
        favoriteIcon.style.color = "";
        
    }
    
};

    

// =========================
// HERO
// =========================

hero.innerHTML = `

<div class="restaurant-cover">

    <img
        class="cover-image"
        src="${item.image}"
        alt="${item.name}">

    <div class="cover-overlay"></div>

</div>

`;

// =========================
// RESTAURANT INFO
// =========================

info.innerHTML = `

<div class="restaurant-logo-wrapper">

    <img
        class="restaurant-logo"
        src="${item.logo || item.image}"
        alt="${item.name}">

</div>

<div class="restaurant-info-card">

    <div class="restaurant-top">

        <div class="restaurant-main">

            <h1>${item.name}</h1>

            <div class="restaurant-rating">

                ⭐ ${item.rating}

                <span>•</span>

                ${item.category || "Restaurant"}

                <span>•</span>

                ${item.isOpen ? "🟢 Open" : "🔴 Closed"}

            </div>

            <div class="restaurant-meta">

                ⏱ ${item.deliveryTime}

                <span>•</span>

                🛵 ${item.deliveryFee}

                <span>•</span>

                📍 ${item.city}

            </div>

        </div>
<button class="info-btn">
    Info
</button>
     
    </div>

</div>

`;
}

loadRestaurant();