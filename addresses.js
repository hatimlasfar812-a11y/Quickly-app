/* =====================================================
   QUICKLY — My Addresses
   Full CRUD + Map (Leaflet + OSM France) + GPS + Default
===================================================== */

import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  getDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

console.log("🚀 addresses.js بدأ");

/* ===== ICONS ===== */
function refreshIcons() {
  if (window.lucide?.createIcons) {
    try { window.lucide.createIcons(); } catch (e) {}
  }
}

/* ===== STATE ===== */
let currentUser = null;
let addresses = [];
let unsubscribeAddresses = null;
let mapInstance = null;
let mapMarker = null;
let currentLat = 34.6814;
let currentLng = -1.9086;
let selectedType = "home";
let editingId = null;
let pendingDeleteId = null;
let pendingDeleteCallback = null;

const OUJDA_CENTER = [34.6814, -1.9086];

/* ===== DOM ===== */
const list = document.getElementById("addressesList");
const addBtn = document.getElementById("addAddressBtn");
const modal = document.getElementById("addressModal");
const modalTitle = document.getElementById("modalTitle");
const addressInput = document.getElementById("addressInput");
const detailsInput = document.getElementById("detailsInput");
const phoneInput = document.getElementById("phoneInput");
const defaultToggle = document.getElementById("defaultToggle");
const saveBtn = document.getElementById("saveAddressBtn");
const gpsBtn = document.getElementById("gpsBtn");
const statsBar = document.getElementById("statsBar");
const totalCountEl = document.getElementById("totalCount");
const defaultCountEl = document.getElementById("defaultCount");


/* ===== TOAST ===== */
function showToast(msg, type = "success", icon = "check") {
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


/* ===== CONFIRM MODAL ===== */
window.closeConfirmModal = function () {
  document.getElementById("confirmModal")?.classList.add("hidden");
  pendingDeleteId = null;
  pendingDeleteCallback = null;
};

function openConfirmModal(title, msg, callback) {
  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmMsg").textContent = msg;
  pendingDeleteCallback = callback;
  const m = document.getElementById("confirmModal");
  m.classList.remove("hidden");
  setTimeout(refreshIcons, 50);
}

document.getElementById("confirmActionBtn")?.addEventListener("click", async () => {
  if (pendingDeleteCallback) {
    const cb = pendingDeleteCallback;
    pendingDeleteCallback = null;
    await cb();
  }
  closeConfirmModal();
});


/* ===== AUTH ===== */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    location.href = "login.html";
    return;
  }
  currentUser = user;
  console.log("👤 User:", user.uid);
  listenAddresses();
});


/* ===== LOAD (real-time) ===== */
function listenAddresses() {
  if (unsubscribeAddresses) unsubscribeAddresses();

  const q = query(collection(db, "users", currentUser.uid, "addresses"));

  unsubscribeAddresses = onSnapshot(q, (snapshot) => {
    addresses = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    // Sort: default first, then by createdAt desc
    addresses.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      const ta = a.createdAt?.toMillis?.() || 0;
      const tb = b.createdAt?.toMillis?.() || 0;
      return tb - ta;
    });
    console.log("📍 Addresses:", addresses.length);
    renderAddresses();
    updateStats();
  }, (err) => {
    console.error("Listen error:", err);
    list.innerHTML = `
      <div class="empty-state">
        <i data-lucide="triangle-alert"></i>
        <h3>خطأ في التحميل</h3>
        <p>${err.message}</p>
      </div>`;
    refreshIcons();
  });
}


/* ===== STATS ===== */
function updateStats() {
  totalCountEl.textContent = addresses.length;
  defaultCountEl.textContent = addresses.filter(a => a.isDefault).length;
}


/* ===== RENDER ===== */
function typeLabel(type) {
  const map = { home: "المنزل", work: "العمل", other: "آخر" };
  return map[type] || "عنوان";
}

function typeIcon(type) {
  const map = { home: "home", work: "briefcase", other: "map-pin" };
  return map[type] || "map-pin";
}

function renderAddresses() {
  if (!addresses.length) {
    list.innerHTML = `
      <div class="empty-state">
        <i data-lucide="map-pin-off"></i>
        <h3>لا توجد عناوين بعد</h3>
        <p>أضف عنوانك الأول لتسهيل عملية التوصيل</p>
      </div>`;
    refreshIcons();
    return;
  }

  list.innerHTML = addresses.map((a, idx) => `
    <div class="address-card ${a.isDefault ? 'is-default' : ''}" style="animation-delay: ${idx * 0.05}s">
      <div class="address-card-header">
        <div class="address-type">
          <div class="type-icon">
            <i data-lucide="${typeIcon(a.type || 'other')}"></i>
          </div>
          <div class="type-info">
            <h3>${escapeHtml(a.title || typeLabel(a.type))}</h3>
            <span>${typeLabel(a.type || 'other')}</span>
          </div>
        </div>
        ${a.isDefault ? `
          <span class="default-badge">
            <i data-lucide="star"></i>
            افتراضي
          </span>` : ""}
      </div>

      <div class="address-body">
        <div class="address-main">
          <i data-lucide="map-pin"></i>
          <span>${escapeHtml(a.address || "")}</span>
        </div>
        ${a.details ? `
          <div class="address-details">
            <i data-lucide="info"></i>
            <span>${escapeHtml(a.details)}</span>
          </div>` : ""}
        ${a.phone ? `
          <div class="address-phone">
            <i data-lucide="phone"></i>
            <span dir="ltr">${escapeHtml(a.phone)}</span>
          </div>` : ""}
      </div>

      <div class="address-actions">
        ${!a.isDefault ? `
          <button class="action-default" onclick="setDefaultAddress('${a.id}')">
            <i data-lucide="star"></i>
            افتراضي
          </button>` : `
          <button class="action-default" disabled>
            <i data-lucide="check-circle-2"></i>
            افتراضي
          </button>`}
        <button class="action-edit" onclick="editAddress('${a.id}')">
          <i data-lucide="pencil"></i>
          تعديل
        </button>
        <button class="action-delete" onclick="deleteAddress('${a.id}')">
          <i data-lucide="trash-2"></i>
          حذف
        </button>
      </div>
    </div>
  `).join("");

  refreshIcons();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


/* ===== MODAL OPEN / CLOSE ===== */
window.openAddressModal = function () {
  document.getElementById("addressModal").classList.remove("hidden");
  document.body.style.overflow = "hidden";

  // Init map after modal is visible
  setTimeout(() => {
    initMap();
    if (mapInstance) {
      setTimeout(() => {
        try { mapInstance.invalidateSize(); } catch (e) {}
      }, 200);
    }
  }, 250);

  refreshIcons();
};

window.closeAddressModal = function () {
  document.getElementById("addressModal").classList.add("hidden");
  document.body.style.overflow = "";
  editingId = null;
  resetForm();
};


/* ===== RESET FORM ===== */
function resetForm() {
  addressInput.value = "";
  detailsInput.value = "";
  phoneInput.value = "";
  defaultToggle.checked = false;
  selectedType = "home";
  currentLat = OUJDA_CENTER[0];
  currentLng = OUJDA_CENTER[1];

  document.querySelectorAll(".type-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.type === "home");
  });

  if (mapMarker) {
    mapMarker.setLatLng(OUJDA_CENTER);
  }
  if (mapInstance) {
    mapInstance.setView(OUJDA_CENTER, 14);
  }
}


/* ===== MAP ===== */
function initMap() {
  const container = document.getElementById("mapPicker");
  if (!container) return;

  if (mapInstance) {
    // Reuse existing
    setTimeout(() => {
      try { mapInstance.invalidateSize(); } catch (e) {}
    }, 200);
    return;
  }

  if (typeof L === "undefined") {
    console.warn("Leaflet not loaded");
    return;
  }

  try {
    mapInstance = L.map("mapPicker", {
      center: OUJDA_CENTER,
      zoom: 14,
      zoomControl: true,
      attributionControl: true
    });

    // OSM France — same as admin
    L.tileLayer("https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap France",
      subdomains: "abc",
      maxZoom: 19,
      crossOrigin: true
    }).addTo(mapInstance);

    // Custom marker icon
    const customIcon = L.divIcon({
      className: "custom-marker",
      html: `<div class="custom-marker-pin"></div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 40]
    });

    // Create draggable marker
    mapMarker = L.marker(OUJDA_CENTER, {
      icon: customIcon,
      draggable: true,
      autoPan: true
    }).addTo(mapInstance);

    // Update lat/lng on drag
    mapMarker.on("dragend", () => {
      const pos = mapMarker.getLatLng();
      currentLat = pos.lat;
      currentLng = pos.lng;
      console.log("📍 New:", currentLat, currentLng);
    });

    // Update on click
    mapInstance.on("click", (e) => {
      currentLat = e.latlng.lat;
      currentLng = e.latlng.lng;
      mapMarker.setLatLng([currentLat, currentLng]);
    });

    console.log("✅ Map initialized");

    // Force size after init
    setTimeout(() => {
      try { mapInstance.invalidateSize(); } catch (e) {}
    }, 400);
    setTimeout(() => {
      try { mapInstance.invalidateSize(); } catch (e) {}
    }, 800);

  } catch (err) {
    console.error("Map init error:", err);
  }
}


/* ===== GPS BUTTON ===== */
gpsBtn?.addEventListener("click", () => {
  if (!navigator.geolocation) {
    return showToast("متصفحك لا يدعم تحديد الموقع", "error", "alert-circle");
  }

  gpsBtn.classList.add("loading");

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      currentLat = pos.coords.latitude;
      currentLng = pos.coords.longitude;

      if (mapInstance && mapMarker) {
        mapInstance.setView([currentLat, currentLng], 16);
        mapMarker.setLatLng([currentLat, currentLng]);
      }
      gpsBtn.classList.remove("loading");
      showToast("تم تحديد موقعك", "success", "check-circle-2");
    },
    (err) => {
      gpsBtn.classList.remove("loading");
      const msgs = {
        1: "تم رفض إذن الموقع",
        2: "الموقع غير متاح",
        3: "انتهت المهلة"
      };
      showToast(msgs[err.code] || "فشل تحديد الموقع", "error", "alert-circle");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
});


/* ===== TYPE TABS ===== */
document.querySelectorAll(".type-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".type-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    selectedType = tab.dataset.type;
  });
});


/* ===== OPEN ADD ===== */
addBtn?.addEventListener("click", () => {
  editingId = null;
  modalTitle.textContent = "إضافة عنوان جديد";
  resetForm();
  window.openAddressModal();
});


/* ===== EDIT ADDRESS ===== */
window.editAddress = function (id) {
  const addr = addresses.find(a => a.id === id);
  if (!addr) return;

  editingId = id;
  modalTitle.textContent = "تعديل العنوان";

  addressInput.value = addr.address || "";
  detailsInput.value = addr.details || "";
  phoneInput.value = addr.phone || "";
  defaultToggle.checked = addr.isDefault === true;

  selectedType = addr.type || "home";
  document.querySelectorAll(".type-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.type === selectedType);
  });

  if (addr.lat && addr.lng) {
    currentLat = addr.lat;
    currentLng = addr.lng;
  }

  window.openAddressModal();

  // Set marker after map init
  setTimeout(() => {
    if (mapInstance && mapMarker) {
      mapInstance.setView([currentLat, currentLng], 15);
      mapMarker.setLatLng([currentLat, currentLng]);
      setTimeout(() => {
        try { mapInstance.invalidateSize(); } catch (e) {}
      }, 300);
    }
  }, 500);
};


/* ===== DELETE ADDRESS ===== */
window.deleteAddress = function (id) {
  const addr = addresses.find(a => a.id === id);
  if (!addr) return;

  openConfirmModal(
    "حذف العنوان",
    `هل أنت متأكد من حذف "${addr.address}"؟`,
    async () => {
      try {
        await deleteDoc(doc(db, "users", currentUser.uid, "addresses", id));
        showToast("تم حذف العنوان", "success", "check");
        
        // If was default, clear from localStorage
        if (addr.isDefault) {
          localStorage.removeItem("selectedAddress");
          localStorage.removeItem("latitude");
          localStorage.removeItem("longitude");
        }
      } catch (err) {
        console.error(err);
        showToast("فشل الحذف", "error", "alert-circle");
      }
    }
  );
};


/* ===== SET DEFAULT ===== */
window.setDefaultAddress = async function (id) {
  const addr = addresses.find(a => a.id === id);
  if (!addr) return;

  try {
    const batch = writeBatch(db);
    // Unset all defaults
    addresses.forEach(a => {
      if (a.isDefault) {
        batch.update(doc(db, "users", currentUser.uid, "addresses", a.id), {
          isDefault: false
        });
      }
    });
    // Set new default
    batch.update(doc(db, "users", currentUser.uid, "addresses", id), {
      isDefault: true,
      updatedAt: serverTimestamp()
    });
    await batch.commit();

    // Save to localStorage for main page
    localStorage.setItem("selectedAddress", addr.address || "");
    if (addr.lat && addr.lng) {
      localStorage.setItem("latitude", String(addr.lat));
      localStorage.setItem("longitude", String(addr.lng));
    }

    showToast("تم تعيين العنوان الافتراضي", "success", "star");
  } catch (err) {
    console.error(err);
    showToast("فشل التعيين", "error", "alert-circle");
  }
};


/* ===== SAVE ADDRESS ===== */
saveBtn?.addEventListener("click", async () => {
  const address = addressInput.value.trim();
  if (!address) {
    addressInput.focus();
    return showToast("أدخل العنوان", "error", "alert-circle");
  }

  if (!currentUser) return;

  const data = {
    title: typeLabel(selectedType),
    address,
    details: detailsInput.value.trim(),
    phone: phoneInput.value.trim(),
    type: selectedType,
    lat: currentLat,
    lng: currentLng,
    isDefault: defaultToggle.checked,
    updatedAt: serverTimestamp()
  };

  // Disable button
  const originalHtml = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = `<i data-lucide="loader"></i><span>جاري الحفظ...</span>`;
  refreshIcons();

  try {
    if (editingId) {
      // Update
      await updateDoc(
        doc(db, "users", currentUser.uid, "addresses", editingId),
        data
      );
      
      // If now default, unset others
      if (data.isDefault) {
        const batch = writeBatch(db);
        addresses.forEach(a => {
          if (a.id !== editingId && a.isDefault) {
            batch.update(doc(db, "users", currentUser.uid, "addresses", a.id), {
              isDefault: false
            });
          }
        });
        await batch.commit();
      }
      
      showToast("تم تحديث العنوان", "success", "check-circle-2");
    } else {
      // Create
      data.createdAt = serverTimestamp();

      // If this is first address, make it default
      if (addresses.length === 0) {
        data.isDefault = true;
        defaultToggle.checked = true;
      }

      const ref = await addDoc(
        collection(db, "users", currentUser.uid, "addresses"),
        data
      );

      // If default, unset others
      if (data.isDefault) {
        const batch = writeBatch(db);
        addresses.forEach(a => {
          if (a.isDefault) {
            batch.update(doc(db, "users", currentUser.uid, "addresses", a.id), {
              isDefault: false
            });
          }
        });
        await batch.commit();
      }

      showToast("تم إضافة العنوان", "success", "check-circle-2");
    }

    // If default, save to localStorage
    if (data.isDefault) {
      localStorage.setItem("selectedAddress", address);
      localStorage.setItem("latitude", String(currentLat));
      localStorage.setItem("longitude", String(currentLng));
    }

    closeAddressModal();
  } catch (err) {
    console.error(err);
    showToast("فشل الحفظ: " + err.message, "error", "alert-circle");
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalHtml;
    refreshIcons();
  }
});
/* =====================================================
   ADDRESS SEARCH — Nominatim (OpenStreetMap)
===================================================== */
const searchInput = document.getElementById("addressSearchInput");
const searchGoBtn = document.getElementById("searchGoBtn");
const suggestionsBox = document.getElementById("searchSuggestions");

let searchDebounce = null;

async function searchAddress(query) {
  if (!query || query.length < 3) return;
  
  try {
    const url = `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(query + ", Oujda, Morocco")}` +
      `&format=json&limit=6&accept-language=ar,fr`;
    
    const response = await fetch(url, {
      headers: { "User-Agent": "Quickly-Delivery-App" }
    });
    
    if (!response.ok) throw new Error("Search failed");
    
    const results = await response.json();
    
    if (!results.length) {
      suggestionsBox.innerHTML = `
        <div class="suggestion-item" style="cursor:default;">
          <i data-lucide="search-x"></i>
          <span>لا توجد نتائج. جرّب اسماً آخر.</span>
        </div>`;
      suggestionsBox.classList.remove("hidden");
      refreshIcons();
      return;
    }
    
    suggestionsBox.innerHTML = results.map(r => `
      <div class="suggestion-item" data-lat="${r.lat}" data-lng="${r.lon}">
        <i data-lucide="map-pin"></i>
        <span>${escapeHtml(r.display_name)}</span>
      </div>
    `).join("");
    suggestionsBox.classList.remove("hidden");
    refreshIcons();
    
    // Handle click
    suggestionsBox.querySelectorAll(".suggestion-item[data-lat]").forEach(item => {
      item.addEventListener("click", () => {
        const lat = parseFloat(item.dataset.lat);
        const lng = parseFloat(item.dataset.lng);
        const addressText = item.querySelector("span")?.textContent || "";
        
        currentLat = lat;
        currentLng = lng;
        
        if (mapInstance && mapMarker) {
          mapInstance.setView([lat, lng], 16);
          mapMarker.setLatLng([lat, lng]);
        }
        
        // Auto-fill address
        addressInput.value = addressText.split(",").slice(0, 3).join(", ");
        
        suggestionsBox.classList.add("hidden");
        searchInput.value = "";
        showToast("تم تحديد الموقع", "success", "check-circle-2");
      });
    });
    
  } catch (err) {
    console.error("Search error:", err);
    suggestionsBox.innerHTML = `
      <div class="suggestion-item" style="cursor:default;">
        <i data-lucide="triangle-alert"></i>
        <span>فشل البحث. تحقق من الإنترنت.</span>
      </div>`;
    suggestionsBox.classList.remove("hidden");
    refreshIcons();
  }
}

// Debounced input
searchInput?.addEventListener("input", (e) => {
  clearTimeout(searchDebounce);
  const q = e.target.value.trim();
  if (q.length < 3) {
    suggestionsBox.classList.add("hidden");
    return;
  }
  searchDebounce = setTimeout(() => searchAddress(q), 500);
});

// Enter key
searchInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    clearTimeout(searchDebounce);
    searchAddress(e.target.value.trim());
  }
});

// Go button
searchGoBtn?.addEventListener("click", () => {
  const q = searchInput.value.trim();
  if (q.length < 3) {
    return showToast("اكتب 3 أحرف على الأقل", "error", "alert-circle");
  }
  searchAddress(q);
});

// Close suggestions on outside click
document.addEventListener("click", (e) => {
  if (!searchInput?.contains(e.target) && !suggestionsBox?.contains(e.target) && !searchGoBtn?.contains(e.target)) {
    suggestionsBox?.classList.add("hidden");
  }
});

/* ===== BOOT ===== */
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 DOM ready");
  refreshIcons();
  setTimeout(refreshIcons, 300);
});

console.log("✅ addresses.js جاهز");