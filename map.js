/* =====================================================
   QUICKLY — Map Page
   Choose Delivery Address + Nominatim + OSM France
===================================================== */

console.log("🗺️ map.js بدأ");

/* ===== ICONS ===== */
function refreshIcons() {
  if (window.lucide?.createIcons) {
    try { window.lucide.createIcons(); } catch (e) {}
  }
}

/* ===== CONSTANTS ===== */
const OUJDA_CENTER = [34.6814, -1.9086];
const OUJDA_ZOOM = 14;

/* ===== STATE ===== */
let mapInstance = null;
let mapMarker = null;
let currentLat = OUJDA_CENTER[0];
let currentLng = OUJDA_CENTER[1];
let currentAddress = "";
let searchDebounce = null;
let isInitialized = false;

/* ===== DOM ===== */
const address = document.getElementById("selectedAddress");
const gpsBtn = document.getElementById("gpsBtn");
const confirmBtn = document.getElementById("confirmBtn");
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
const searchClear = document.getElementById("searchClear");
const backBtn = document.getElementById("backBtn");
const sheet = document.getElementById("bottomSheet");
const sheetHandle = document.getElementById("sheetHandle");

/* ===== TOAST ===== */
function showToast(msg, type = "success", icon = "check-circle-2") {
  let cont = document.getElementById("toastContainer");
  if (!cont) {
    cont = document.createElement("div");
    cont.id = "toastContainer";
    cont.className = "toast-container";
    document.body.appendChild(cont);
  }
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i data-lucide="${icon}"></i><span>${msg}</span>`;
  cont.appendChild(toast);
  refreshIcons();
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ===== ESCAPE HTML ===== */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ===== CUSTOM MARKER ===== */
const customIcon = () => L.divIcon({
  className: "custom-marker",
  html: `<div class="custom-marker-pin"></div>`,
  iconSize: [44, 44],
  iconAnchor: [22, 44]
});

/* ===== INIT MAP ===== */
function initMap() {
  if (mapInstance) return;

  try {
    mapInstance = L.map("map", {
      zoomControl: false,
      attributionControl: true
    }).setView(OUJDA_CENTER, OUJDA_ZOOM);

    // OSM France (same as admin)
    L.tileLayer("https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap France",
      subdomains: "abc",
      maxZoom: 19,
      crossOrigin: true
    }).addTo(mapInstance);

    // Zoom control
    L.control.zoom({ position: "bottomright" }).addTo(mapInstance);

    // Click on map → move marker
    mapInstance.on("click", (e) => {
      moveMarker(e.latlng.lat, e.latlng.lng);
    });

    isInitialized = true;
    console.log("✅ Map initialized");

    // Force size after init
    setTimeout(() => {
      try { mapInstance.invalidateSize(); } catch (e) {}
    }, 300);
    setTimeout(() => {
      try { mapInstance.invalidateSize(); } catch (e) {}
    }, 800);

  } catch (err) {
    console.error("Map init error:", err);
    showToast("فشل تحميل الخريطة", "error", "alert-circle");
  }
}

/* ===== MOVE MARKER ===== */
function moveMarker(lat, lng) {
  currentLat = lat;
  currentLng = lng;

  if (mapMarker) {
    mapMarker.setLatLng([lat, lng]);
  } else {
    mapMarker = L.marker([lat, lng], {
      icon: customIcon(),
      draggable: true,
      autoPan: true
    }).addTo(mapInstance);

    mapMarker.on("dragend", () => {
      const pos = mapMarker.getLatLng();
      updateAddressFromCoords(pos.lat, pos.lng);
    });
  }

  mapInstance.setView([lat, lng], Math.max(mapInstance.getZoom(), 16));
  updateAddressFromCoords(lat, lng);
}

/* ===== REVERSE GEOCODING ===== */
async function updateAddressFromCoords(lat, lng) {
  address.textContent = "جاري تحديد العنوان...";

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?` +
      `format=json&lat=${lat}&lon=${lng}&accept-language=ar,fr`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Quickly-Delivery-App" }
    });

    if (!res.ok) throw new Error("Network error");

    const data = await res.json();
    const place = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    currentAddress = place;
    address.textContent = place;

    // Save to localStorage
    localStorage.setItem("selectedAddress", place);
    localStorage.setItem("latitude", String(lat));
    localStorage.setItem("longitude", String(lng));

  } catch (err) {
    console.error("Reverse geocoding:", err);
    const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    currentAddress = fallback;
    address.textContent = fallback;
    localStorage.setItem("selectedAddress", fallback);
    localStorage.setItem("latitude", String(lat));
    localStorage.setItem("longitude", String(lng));
  }
}

/* ===== GPS BUTTON ===== */
gpsBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    return showToast("متصفحك لا يدعم تحديد الموقع", "error", "alert-circle");
  }

  gpsBtn.classList.add("loading");
  showToast("جاري تحديد موقعك...", "success", "navigation");

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      gpsBtn.classList.remove("loading");
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      moveMarker(lat, lng);
      mapInstance.setView([lat, lng], 17);
      showToast("تم تحديد موقعك", "success", "check-circle-2");
    },
    (err) => {
      gpsBtn.classList.remove("loading");
      const msgs = {
        1: "تم رفض إذن الموقع. اسمح بالوصول أو ابحث يدوياً",
        2: "الموقع غير متاح حالياً",
        3: "انتهت المهلة. حاول مرة أخرى"
      };
      showToast(msgs[err.code] || "فشل تحديد الموقع", "error", "alert-circle");
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
});

/* ===== SEARCH (Nominatim) ===== */
async function searchAddress(query) {
  if (!query || query.length < 3) return;

  try {
    const url = `https://nominatim.openstreetmap.org/search?` +
      `format=json&q=${encodeURIComponent(query + ", Oujda, Morocco")}` +
      `&limit=6&accept-language=ar,fr`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Quickly-Delivery-App" }
    });

    if (!res.ok) throw new Error("Search failed");

    const data = await res.json();

    if (!data.length) {
      searchResults.innerHTML = `
        <div class="result-item empty">
          <i data-lucide="search-x"></i>
          <span>لا توجد نتائج. جرّب اسماً آخر.</span>
        </div>`;
      searchResults.classList.remove("hidden");
      refreshIcons();
      return;
    }

    searchResults.innerHTML = data.map(item => `
      <div class="result-item" data-lat="${item.lat}" data-lng="${item.lon}">
        <i data-lucide="map-pin"></i>
        <span>${escapeHtml(item.display_name)}</span>
      </div>
    `).join("");

    searchResults.classList.remove("hidden");
    refreshIcons();

  } catch (err) {
    console.error("Search error:", err);
    searchResults.innerHTML = `
      <div class="result-item empty">
        <i data-lucide="triangle-alert"></i>
        <span>فشل البحث. تحقق من الإنترنت.</span>
      </div>`;
    searchResults.classList.remove("hidden");
    refreshIcons();
  }
}

/* ===== SEARCH INPUT EVENTS ===== */
searchInput.addEventListener("input", (e) => {
  const q = e.target.value.trim();

  // Toggle clear button
  searchClear.classList.toggle("hidden", q.length === 0);

  clearTimeout(searchDebounce);

  if (q.length < 3) {
    searchResults.classList.add("hidden");
    return;
  }

  searchDebounce = setTimeout(() => searchAddress(q), 500);
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    clearTimeout(searchDebounce);
    const q = searchInput.value.trim();
    if (q.length >= 3) searchAddress(q);
  }
});

/* ===== SEARCH CLEAR ===== */
searchClear.addEventListener("click", () => {
  searchInput.value = "";
  searchClear.classList.add("hidden");
  searchResults.classList.add("hidden");
  searchInput.focus();
});

/* ===== SEARCH RESULT CLICK ===== */
searchResults.addEventListener("click", (e) => {
  const item = e.target.closest(".result-item[data-lat]");
  if (!item) return;

  const lat = parseFloat(item.dataset.lat);
  const lng = parseFloat(item.dataset.lng);
  const addressText = item.querySelector("span")?.textContent || "";

  if (mapInstance) {
    moveMarker(lat, lng);
    mapInstance.setView([lat, lng], 17);
  }

  searchInput.value = addressText.split(",").slice(0, 2).join(", ");
  searchResults.classList.add("hidden");
  searchClear.classList.remove("hidden");
  searchInput.blur();

  showToast("تم تحديد الموقع", "success", "check-circle-2");
});

/* ===== CLICK OUTSIDE SEARCH ===== */
document.addEventListener("click", (e) => {
  if (!searchInput.contains(e.target) &&
      !searchResults.contains(e.target)) {
    searchResults.classList.add("hidden");
  }
});

/* ===== BOTTOM SHEET ===== */
let sheetExpanded = false;

function toggleSheet() {
  sheetExpanded = !sheetExpanded;
  sheet.classList.toggle("expanded", sheetExpanded);
}

sheetHandle.addEventListener("click", toggleSheet);

// Touch swipe
let touchStartY = 0;

sheet.addEventListener("touchstart", (e) => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });

sheet.addEventListener("touchend", (e) => {
  const endY = e.changedTouches[0].clientY;
  const diff = touchStartY - endY;

  if (diff > 50) {
    sheet.classList.add("expanded");
    sheetExpanded = true;
  } else if (diff < -50) {
    sheet.classList.remove("expanded");
    sheetExpanded = false;
  }
});

/* ===== BACK BUTTON ===== */
backBtn.addEventListener("click", () => {
  if (history.length > 1) history.back();
  else location.href = "index.html";
});

/* ===== CONFIRM ADDRESS ===== */
confirmBtn.addEventListener("click", () => {
  if (!currentAddress) {
    return showToast("حدد موقعك أولاً", "error", "alert-circle");
  }

  // Save extra info
  const building = document.getElementById("building").value.trim();
  const floor = document.getElementById("floor").value.trim();
  const note = document.getElementById("note").value.trim();

  if (building) localStorage.setItem("building", building);
  else localStorage.removeItem("building");

  if (floor) localStorage.setItem("floor", floor);
  else localStorage.removeItem("floor");

  if (note) localStorage.setItem("note", note);
  else localStorage.removeItem("note");

  // Toast
  showToast("تم حفظ العنوان بنجاح", "success", "check-circle-2");

  // Loading on button
  const originalHtml = confirmBtn.innerHTML;
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = `<i data-lucide="loader"></i><span>جاري الحفظ...</span>`;
  refreshIcons();

  // Navigate back after short delay
  setTimeout(() => {
    // If opened from checkout → back to checkout
    // If opened standalone → back to home
    if (document.referrer.includes("checkout")) {
      location.href = "checkout.html";
    } else if (history.length > 1) {
      history.back();
    } else {
      location.href = "index.html";
    }
  }, 800);
});

/* ===== BOOT ===== */
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 DOM ready");
  refreshIcons();
  setTimeout(refreshIcons, 300);

  initMap();

  // Restore last selected address if exists
  const savedLat = parseFloat(localStorage.getItem("latitude"));
  const savedLng = parseFloat(localStorage.getItem("longitude"));
  const savedAddr = localStorage.getItem("selectedAddress");

  if (Number.isFinite(savedLat) && Number.isFinite(savedLng) && savedAddr) {
    // Wait for map to be ready
    setTimeout(() => {
      if (mapInstance) {
        moveMarker(savedLat, savedLng);
        mapInstance.setView([savedLat, savedLng], 16);
      }
      address.textContent = savedAddr;
    }, 500);
  } else {
    // Default: Try GPS (but don't force)
    address.textContent = "اضغط زر الموقع أو ابحث عن عنوانك";
  }

  // Extra inputs restore
  const building = localStorage.getItem("building");
  const floor = localStorage.getItem("floor");
  const note = localStorage.getItem("note");

  if (building) document.getElementById("building").value = building;
  if (floor) document.getElementById("floor").value = floor;
  if (note) document.getElementById("note").value = note;

  // Refresh icons after everything
  setTimeout(refreshIcons, 600);
  setTimeout(refreshIcons, 1200);
});

console.log("✅ map.js جاهز");