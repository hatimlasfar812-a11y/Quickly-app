import { db } from "./firebase.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const input = document.getElementById("searchInput");
const resultsEl = document.getElementById("searchResults");
const countEl = document.getElementById("searchCount");
const chips = document.querySelectorAll(".search-chip");

let allItems = [];
let activeFilter = "all";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Ignore les établissements désactivés
function isVisible(data) {
  if (data.active === false) return false;
  const status = String(data.status || "").toLowerCase();
  return !["inactive", "disabled", "hidden", "deleted"].includes(status);
}

async function loadData() {
  try {
    const [restSnap, storeSnap] = await Promise.all([
      getDocs(collection(db, "restaurants")),
      getDocs(collection(db, "stores"))
    ]);
    
    const items = [];
    
    restSnap.forEach(d => {
      const data = d.data();
      if (!isVisible(data)) return;
      items.push({
        id: d.id,
        type: "restaurant",
        name: data.name || "Restaurant",
        sub: data.categoryName || "Restaurant",
        image: data.image || data.logo || "",
        keywords: Array.isArray(data.searchKeywords) ? data.searchKeywords : [],
        link: `restaurant.html?id=${encodeURIComponent(d.id)}`
      });
    });
    
    storeSnap.forEach(d => {
      const data = d.data();
      if (!isVisible(data)) return;
      items.push({
        id: d.id,
        type: "store",
        name: data.name || "Magasin",
        sub: data.categoryType || data.category || "Magasin",
        image: data.image || data.logo || "",
        keywords: [],
        link: `shops.html?id=${encodeURIComponent(d.id)}`
      });
    });
    
    allItems = items;
    render();
  } catch (err) {
    console.error("Search load error:", err);
    resultsEl.innerHTML = `
      <div class="search-state">
        <i class="fa-solid fa-triangle-exclamation"></i>
        Impossible de charger les données. Vérifiez votre connexion et réessayez.
      </div>`;
  }
}

function render() {
  const text = input.value.trim().toLowerCase();
  
  const filtered = allItems.filter(item => {
    if (activeFilter !== "all" && item.type !== activeFilter) return false;
    if (!text) return true;
    return (
      item.name.toLowerCase().includes(text) ||
      item.sub.toLowerCase().includes(text) ||
      item.keywords.some(k => String(k).toLowerCase().includes(text))
    );
  });
  
  countEl.textContent = `${filtered.length} résultat${filtered.length > 1 ? "s" : ""}`;
  
  if (filtered.length === 0) {
    resultsEl.innerHTML = `
      <div class="search-state">
        <i class="fa-solid fa-magnifying-glass"></i>
        Aucun résultat pour votre recherche.
      </div>`;
    return;
  }
  
  resultsEl.innerHTML = filtered.map(item => `
    <a class="result-row" href="${item.link}">
      <img src="${escapeHtml(item.image)}" alt="" loading="lazy"
           onerror="this.style.visibility='hidden'">
      <div class="result-info">
        <h4>${escapeHtml(item.name)}</h4>
        <p>${escapeHtml(item.sub)}</p>
      </div>
      <span class="result-type">${item.type === "restaurant" ? "Restaurant" : "Magasin"}</span>
    </a>
  `).join("");
}

input.addEventListener("input", render);

chips.forEach(chip => {
  chip.addEventListener("click", () => {
    chips.forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    activeFilter = chip.dataset.filter;
    render();
  });
});

// Terme venant de la page d'accueil (search.html?q=...)
const initialQuery = new URLSearchParams(location.search).get("q");
if (initialQuery) input.value = initialQuery;

loadData();