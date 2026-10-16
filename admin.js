/* ═══════════════════════════════════════════════════════
   ONE CALL ADMIN v9.0 — مع Auto-Dispatch + Earnings
   + خريطة شاملة (سائقين + مطاعم + متاجر)
   + دورة حياة الطلب الكاملة
═══════════════════════════════════════════════════════ */

console.log("🚀 admin.js v9.0 بدأ");

setTimeout(() => {
    const loader = document.getElementById("appLoader");
    const unauth = document.getElementById("unauthorizedScreen");
    if (loader && !loader.classList.contains("hidden")) {
        loader.classList.add("hidden");
        if (unauth) unauth.classList.remove("hidden");
    }
}, 5000);

import { db, auth } from "./firebase.js";
import {
    onAuthStateChanged, signInWithEmailAndPassword, signOut,
    createUserWithEmailAndPassword, getAuth, updateProfile
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
    doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
    collection, query, orderBy, limit, where, onSnapshot,
    serverTimestamp, writeBatch, increment
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import {
    initializeApp as initializeSecondaryApp, deleteApp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

console.log("✅ Imports جاهزة");


/* ═══ CONFIG ═══ */
const firebaseConfig = {
    apiKey: "AIzaSyAIVM0mpmmPUlTipfa6H7dA0G1UUnuaelY",
    authDomain: "quickly-5856d.firebaseapp.com",
    projectId: "quickly-5856d",
    storageBucket: "quickly-5856d.firebasestorage.app",
    messagingSenderId: "589837703010",
    appId: "1:589837703010:web:99d18d82236eee45e9be3b"
};

// ⚙️ إعدادات العمل
const BUSINESS_CONFIG = {
    driverCommission: 20,        // د.م لكل توصيل للسائق
    driverCommissionPercent: 0,  // أو نسبة % من رسوم التوصيل (0 = استخدم الثابت)
    maxAssignDistanceKm: 15,     // أقصى مسافة للتعيين التلقائي
    driverLocationFreshnessMs: 5 * 60 * 1000 // 5 دقائق
};

let secondaryAppInstance = null;
let secondaryAuthInstance = null;
function getSecondaryAuth() {
    if (!secondaryAuthInstance) {
        secondaryAppInstance = initializeSecondaryApp(firebaseConfig, "secondary-" + Date.now());
        secondaryAuthInstance = getAuth(secondaryAppInstance);
    }
    return secondaryAuthInstance;
}
async function cleanupSecondaryApp() {
    try {
        if (secondaryAppInstance) {
            await deleteApp(secondaryAppInstance);
            secondaryAppInstance = null;
            secondaryAuthInstance = null;
        }
    } catch (e) {}
}


/* ═══ STATE ═══ */
const stateCache = {
    zones: [], coupons: [], offers: [], banners: [],
    driverReviews: [], driverEarnings: [],
    restaurants: [], stores: [], orders: [], drivers: [],
    hypermarkets: [], hyperProducts: [], syncLogs: [],
    menuProducts: [], storeProducts: [], auditLogs: [],
    mapInstance: null, mapMarkers: { drivers: {}, restaurants: {}, stores: {}, hypermarkets: {} },
    shopsCategory: "all",
    driversSearch: "", driversStatus: "all", driversVerification: "all",
    hyperProductsSearch: "",
    ordersSearch: "", ordersStatus: "all",
    ordersPage: 1, ordersPerPage: 15,
    lastOrderCount: 0
};

let activeUnsubscribers = [];
let ordersChartInstance = null;
let pendingConfirmAction = null;
let currentStoreSection = "shops";

const DRIVER_STATUS = {
    ONLINE_AVAILABLE: "online_available",
    ONLINE_BUSY: "online_busy",
    OFFLINE: "offline",
    ON_BREAK: "on_break",
    SUSPENDED: "suspended",
    PENDING_VERIFICATION: "pending_verification"
};

const HYPER_CHAINS = {
    carrefour: { name: "Carrefour", color: "#0057B8", icon: "🛒" },
    marjane: { name: "Marjane", color: "#E30613", icon: "🏪" },
    bim: { name: "BIM", color: "#0066CC", icon: "🔵" },
    labelvie: { name: "Label Vie", color: "#00A651", icon: "🌿" },
    aswak: { name: "Aswak Assalam", color: "#F7941D", icon: "🏬" },
    atimab: { name: "Atacadao", color: "#E2231A", icon: "🛍️" },
    custom: { name: "مخصص", color: "#64748B", icon: "⚙️" }
};

const PRODUCT_CATEGORIES = [
    { value: "beverages", label: "مشروبات" },
    { value: "dairy", label: "حليب" },
    { value: "bakery", label: "مخبوزات" },
    { value: "meat", label: "لحوم" },
    { value: "fruits", label: "فواكه" },
    { value: "cleaning", label: "تنظيف" },
    { value: "hygiene", label: "عناية" },
    { value: "other", label: "أخرى" }
];


/* ═══ LUCIDE ═══ */
function refreshIcons() {
    if (window.lucide?.createIcons) {
        try { window.lucide.createIcons(); } catch (e) {}
    }
}
window.refreshIcons = refreshIcons;


/* ═══ HELPERS ═══ */
function setText(id, t) { const el = document.getElementById(id); if (el) el.textContent = t; }
function setValue(id, v) { const el = document.getElementById(id); if (el) el.value = v ?? ""; }
function hidePreview(id) { const el = document.getElementById(id); if (el) el.classList.add("hidden"); }
function showPreview(id, src) { const el = document.getElementById(id); if (el) { el.src = src; el.classList.remove("hidden"); } }
function setElementWidth(id, w) { const el = document.getElementById(id); if (el) el.style.width = w; }

function safe(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function safeAttr(s) { return safe(s); }
function escapeJs(str) {
    if (!str) return "";
    return String(str).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

function statusBadge(status) {
    const map = {
        active: ['status-active', 'نشط'],
        delivered: ['status-active', 'مكتمل'],
        online: ['status-active', 'متصل'],
        pending: ['status-pending', 'معلق'],
        confirmed: ['status-preparing', 'مؤكد'],
        preparing: ['status-preparing', 'قيد التحضير'],
        ready: ['status-busy', 'جاهز'],
        assigned: ['status-preparing', 'معين'],
        accepted: ['status-preparing', 'مقبول'],
        picked_up: ['status-busy', 'مستلم'],
        on_the_way: ['status-busy', 'في الطريق'],
        cancelled: ['status-cancelled', 'ملغي'],
        rejected: ['status-cancelled', 'مرفوض'],
        offline: ['status-inactive', 'غير متصل']
    };
    const [cls, label] = map[status] || ['status-pending', status || 'جديد'];
    return `<span class="badge ${cls}">${label}</span>`;
}

function driverStatusBadge(status) {
    const map = {
        online_available: ['status-active', 'متاح'],
        online_busy: ['status-busy', 'مشغول'],
        offline: ['status-inactive', 'غير متصل'],
        on_break: ['status-pending', 'استراحة'],
        suspended: ['status-cancelled', 'موقوف'],
        pending_verification: ['status-pending', 'قيد التحقق']
    };
    const [cls, label] = map[status] || ['status-inactive', status];
    return `<span class="badge ${cls}">${label}</span>`;
}

function vehicleLabel(v) {
    const map = { moto: "موتو", scooter: "سكوتر", car: "سيارة", bike: "دراجة", van: "شاحنة" };
    return map[v] || safe(v || "—");
}

function formatRelativeTime(date) {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return "الآن";
    if (diff < 3600) return Math.floor(diff / 60) + " د";
    if (diff < 86400) return Math.floor(diff / 3600) + " س";
    return Math.floor(diff / 86400) + " ي";
}

/* Haversine - حساب المسافة بالكيلومترات */
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


/* ═══ MODALS ═══ */
window.openModal = function (id) {
    document.getElementById(id)?.classList.remove("hidden");
    setTimeout(refreshIcons, 50);
};
window.closeModal = function (id) {
    document.getElementById(id)?.classList.add("hidden");
};
window.openConfirmModal = function (title, msg, cb) {
    setText("confirmModalTitle", title);
    setText("confirmModalMsg", msg);
    pendingConfirmAction = cb;
    openModal("confirmModal");
};


/* ═══ TOAST + SOUND ═══ */
window.showToast = function (message, type = "success") {
    let cont = document.getElementById("toastContainer");
    if (!cont) {
        cont = document.createElement("div");
        cont.id = "toastContainer";
        cont.className = "toast-container";
        document.body.appendChild(cont);
    }
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    cont.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, 3500);
};

function playOrderSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 1000;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    } catch (e) {}
}


/* ═══ FILE UPLOAD ═══ */
window.handleFileUpload = function (event, targetInputId, previewId) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 700 * 1024) {
        showToast("الصورة > 700KB", "error");
        event.target.value = "";
        return;
    }
    if (!file.type.startsWith("image/")) {
        showToast("ليس صورة", "error");
        return;
    }
    const reader = new FileReader();
    reader.onload = e => {
        const base64 = e.target.result;
        const input = document.getElementById(targetInputId);
        if (input) input.value = base64;
        showPreview(previewId, base64);
        showToast("تم الرفع", "success");
    };
    reader.readAsDataURL(file);
};

window.getCurrentLocation = function (latId, lngId) {
    if (!navigator.geolocation) {
        return showToast("متصفحك لا يدعم تحديد الموقع", "error");
    }
    showToast("📍 جاري تحديد الموقع...", "info");
    navigator.geolocation.getCurrentPosition(
        pos => {
            setValue(latId, pos.coords.latitude.toFixed(6));
            setValue(lngId, pos.coords.longitude.toFixed(6));
            showToast("✅ تم التحديد", "success");
        },
        err => showToast("فشل: " + err.message, "error"),
        { enableHighAccuracy: true, timeout: 10000 }
    );
};


/* ═══ NAVIGATION ═══ */
window.switchTab = function (tabName) {
    console.log("📑 Tab:", tabName);
    document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(el => el.classList.remove("active"));

    const navItem = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
    const pane = document.getElementById(`tab-${tabName}`);
    if (navItem) navItem.classList.add("active");
    if (pane) pane.classList.add("active");

    const breadcrumb = document.getElementById("breadcrumb");
    if (breadcrumb && navItem) {
        const iconEl = navItem.querySelector("[data-lucide]");
        const iconName = iconEl?.getAttribute("data-lucide") || "layout-dashboard";
        const label = navItem.querySelector("span")?.textContent || "";
        breadcrumb.innerHTML = `<i data-lucide="${iconName}"></i><span>${label}</span>`;
        refreshIcons();
    }

    if (tabName === "driver-map") {
        setTimeout(() => {
            initDriversMap();
            if (stateCache.mapInstance) {
                try { stateCache.mapInstance.invalidateSize(); } catch(e) {}
            }
        }, 350);
    }
};

function setupNavigation() {
    document.querySelectorAll(".nav-item").forEach(item => {
        item.addEventListener("click", () => {
            switchTab(item.dataset.tab);
            document.getElementById("sidebar")?.classList.remove("open");
            document.getElementById("sidebarOverlay")?.classList.remove("show");
        });
    });
    document.getElementById("mobileToggle")?.addEventListener("click", () => {
        document.getElementById("sidebar")?.classList.toggle("open");
        document.getElementById("sidebarOverlay")?.classList.toggle("show");
    });
    document.getElementById("sidebarOverlay")?.addEventListener("click", () => {
        document.getElementById("sidebar")?.classList.remove("open");
        document.getElementById("sidebarOverlay")?.classList.remove("show");
    });
    if (localStorage.getItem("adminTheme") === "dark") document.body.classList.add("dark-mode");
    document.getElementById("darkModeToggle")?.addEventListener("click", () => {
        document.body.classList.toggle("dark-mode");
        localStorage.setItem("adminTheme", document.body.classList.contains("dark-mode") ? "dark" : "light");
        refreshIcons();
    });
}


/* ═══ CATEGORY TABS ═══ */
function setupCategoryTabs() {
    document.querySelectorAll(".cat-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".cat-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            stateCache.shopsCategory = tab.dataset.cat;
            renderShopsTable();
        });
    });
}


/* ═══ AUTH ═══ */
function initAuth() {
    onAuthStateChanged(auth, async (user) => {
        const loader = document.getElementById("appLoader");
        const adminApp = document.getElementById("adminApp");
        const unauthorized = document.getElementById("unauthorizedScreen");

        try {
            if (!user) {
                loader?.classList.add("hidden");
                unauthorized?.classList.remove("hidden");
                adminApp?.classList.add("hidden");
                stopRealtimeListeners();
                refreshIcons();
                return;
            }
            const userSnap = await getDoc(doc(db, "users", user.uid));
            if (!userSnap.exists() || userSnap.data().role !== "admin") {
                await signOut(auth);
                return;
            }
            const userData = userSnap.data();
            const nameEl = document.getElementById("adminNameDisplay");
            const emailEl = document.getElementById("adminEmailDisplay");
            if (nameEl) nameEl.textContent = userData.name || user.email;
            if (emailEl) emailEl.textContent = user.email;

            loader?.classList.add("hidden");
            unauthorized?.classList.add("hidden");
            adminApp?.classList.remove("hidden");

            refreshIcons();
            showToast("مرحبا " + (userData.name || ""), "success");
            initRealtimeListeners();
            loadServicesSettings();
        } catch (err) {
            console.error(err);
            loader?.classList.add("hidden");
            unauthorized?.classList.remove("hidden");
            adminApp?.classList.add("hidden");
        }
    });

    document.getElementById("adminLoginForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const errorBox = document.getElementById("loginError");
        errorBox?.classList.add("hidden");
        try {
            await signInWithEmailAndPassword(auth,
                document.getElementById("loginEmail").value.trim(),
                document.getElementById("loginPassword").value);
        } catch (err) {
            if (errorBox) {
                errorBox.textContent = "البريد أو كلمة المرور غير صحيحة";
                errorBox.classList.remove("hidden");
            }
        }
    });

    document.getElementById("logoutBtn")?.addEventListener("click", async () => {
        try { await signOut(auth); showToast("تم الخروج", "success"); } catch (e) {}
    });
}


/* ═══ REALTIME LISTENERS ═══ */
function initRealtimeListeners() {
    stopRealtimeListeners();
    console.log("🔴 تفعيل المستمعين...");

    try {
        activeUnsubscribers.push(onSnapshot(collection(db, "restaurants"), snap => {
            stateCache.restaurants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            console.log("🍽️ مطاعم:", stateCache.restaurants.length);
            renderRestaurantsTable();
            updateDashboardMetrics();
            updateMapMarkers();
            setText("badgeRestaurants", stateCache.restaurants.length);
        }, err => console.warn("Restaurants:", err.message)));

        activeUnsubscribers.push(onSnapshot(collection(db, "stores"), snap => {
            stateCache.stores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            console.log("🛍️ متاجر:", stateCache.stores.length);
            renderShopsTable();
            renderParaTable();
            updateDashboardMetrics();
            updateMapMarkers();
            const shops = stateCache.stores.filter(s => s.section === "shops" || !s.section);
            setText("badgeShops", shops.length);
        }, err => console.warn("Stores:", err.message)));

        activeUnsubscribers.push(onSnapshot(
            query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(200)),
            snap => {
                const newOrders = snap.docs.map(d => {
                    const data = d.data();
                    // "Pending" / "pending" / "PENDING" -> toujours "pending"
                    return { id: d.id, ...data, status: String(data.status || "pending").trim().toLowerCase() };
                });
                // 🔔 إشعار عند طلب جديد
                if (stateCache.lastOrderCount > 0 && newOrders.length > stateCache.lastOrderCount) {
                    const newest = newOrders[0];
                    showToast(`🔔 طلب جديد من ${newest.customerName || "عميل"}`, "info");
                    playOrderSound();
                }
                stateCache.lastOrderCount = newOrders.length;
                stateCache.orders = newOrders;
                console.log("📋 طلبات:", stateCache.orders.length);
                updateDashboardMetrics();
                updateRecentOrdersTable();
                renderOrdersTable();
                updatePendingOrdersBadge();
            }, err => console.warn("Orders:", err.message)));

        activeUnsubscribers.push(onSnapshot(collection(db, "drivers"), snap => {
            stateCache.drivers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            console.log("🏍️ سائقون:", stateCache.drivers.length);
            renderDriversTable();
            updateDriverStats();
            updateDashboardMetrics();
            populateAuthDriverDropdown();
            updateMapMarkers();
        }, err => console.warn("Drivers:", err.message)));

        activeUnsubscribers.push(onSnapshot(collection(db, "hypermarkets"), snap => {
            stateCache.hypermarkets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderHypermarkets();
            updateHyperStats();
            updateMapMarkers();
        }, err => console.warn("Hypermarkets:", err.message)));

        activeUnsubscribers.push(onSnapshot(
            query(collection(db, "driver_earnings"), orderBy("createdAt", "desc"), limit(300)),
            snap => {
                stateCache.driverEarnings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            }, err => {}));

        activeUnsubscribers.push(onSnapshot(
            query(collection(db, "hypermarket_products"), orderBy("updatedAt", "desc"), limit(300)),
            snap => {
                stateCache.hyperProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                renderHyperProductsTable();
                updateHyperStats();
            }, err => {}));

        activeUnsubscribers.push(onSnapshot(
            query(collection(db, "sync_logs"), orderBy("createdAt", "desc"), limit(50)),
            snap => {
                stateCache.syncLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                renderSyncLogs();
            }, err => {}));

        activeUnsubscribers.push(onSnapshot(
            query(collection(db, "admin_audit"), orderBy("createdAt", "desc"), limit(100)),
            snap => {
                stateCache.auditLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                renderAuditTable();
            }, err => {}));

        activeUnsubscribers.push(onSnapshot(collection(db, "zones"), snap => {
            stateCache.zones = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderZonesTable();
        }, err => {}));

        activeUnsubscribers.push(onSnapshot(collection(db, "coupons"), snap => {
            stateCache.coupons = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderCouponsTable();
        }, err => {}));

        activeUnsubscribers.push(onSnapshot(collection(db, "offers"), snap => {
            stateCache.offers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderOffersTable();
            populateOfferRestaurantsDropdown();
        }, err => {}));

        activeUnsubscribers.push(onSnapshot(collection(db, "banners"), snap => {
            stateCache.banners = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderBannersTable();
        }, err => {}));

        activeUnsubscribers.push(onSnapshot(
            query(collection(db, "driver_reviews"), orderBy("createdAt", "desc"), limit(200)),
            snap => {
                stateCache.driverReviews = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                renderReviewsTable();
            }, err => {}));

        console.log("✅ كل المستمعين جاهزون");
    } catch (err) {
        console.error("❌ خطأ:", err);
    }
}

function stopRealtimeListeners() {
    activeUnsubscribers.forEach(u => { try { u(); } catch {} });
    activeUnsubscribers = [];
}

function updatePendingOrdersBadge() {
    const pending = stateCache.orders.filter(o => o.status === "pending" || o.status === "confirmed").length;
    const badge = document.getElementById("pendingOrdersBadge");
    if (badge) {
        badge.textContent = pending;
        badge.classList.toggle("hidden", pending === 0);
    }
}


/* ═══ DASHBOARD ═══ */
function updateDashboardMetrics() {
    setText("statTotalRestaurants", stateCache.restaurants.length);
    const activeShops = stateCache.stores.filter(s => (s.section === "shops" || !s.section) && s.status === "active").length;
    setText("statActiveStores", activeShops + stateCache.hypermarkets.length);
    setText("statOnlineDrivers", stateCache.drivers.filter(d => d.status === "online").length);

    const now = new Date();
    const todayOrders = stateCache.orders.filter(o => {
        if (!o.createdAt?.toDate) return false;
        const d = o.createdAt.toDate();
        return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    setText("statTodayOrders", todayOrders.length);
    const activeStatuses = ["pending", "confirmed", "preparing", "ready", "assigned", "accepted", "picked_up", "on_the_way"];
    setText("statActiveOrders", stateCache.orders.filter(o => activeStatuses.includes(o.status)).length);

    const todaySales = todayOrders.reduce((s, o) => s + Number(o.totalAmount ?? o.total ?? 0), 0);
    setText("statTodaySales", todaySales.toFixed(2) + " د.م");
    setText("repOrdersToday", todayOrders.length);
    setText("repSalesToday", todaySales.toFixed(2) + " د.م");

    const monthSales = stateCache.orders.reduce((s, o) => {
        if (!o.createdAt?.toDate) return s;
        const d = o.createdAt.toDate();
        if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear())
            return s + Number(o.totalAmount ?? o.total ?? 0);
        return s;
    }, 0);
    setText("repSalesMonth", monthSales.toFixed(2) + " د.م");

    const total = stateCache.orders.length || 1;
    const completed = stateCache.orders.filter(o => o.status === "delivered").length;
    const pending = stateCache.orders.filter(o => activeStatuses.includes(o.status)).length;
    const cancelled = stateCache.orders.filter(o => o.status === "cancelled" || o.status === "rejected").length;
    const c = Math.round(completed / total * 100);
    const p = Math.round(pending / total * 100);
    const x = Math.round(cancelled / total * 100);
    setElementWidth("repCompletedBar", c + "%"); setText("repCompletedPercent", c + "%");
    setElementWidth("repPendingBar", p + "%"); setText("repPendingPercent", p + "%");
    setElementWidth("repCancelledBar", x + "%"); setText("repCancelledPercent", x + "%");

    updateMiniChart(todayOrders);
}

function updateRecentOrdersTable() {
    const table = document.getElementById("dashRecentOrdersTable");
    if (!table) return;
    const recent = stateCache.orders.slice(0, 6);
    if (!recent.length) {
        table.innerHTML = `<tr><td colspan="5" class="text-center empty-state"><p>لا توجد طلبات.</p></td></tr>`;
        return;
    }
    table.innerHTML = recent.map(o => `
        <tr>
            <td><span class="order-id">#${o.id.substring(0, 6)}</span></td>
            <td>${safe(o.customerName || "عميل")}</td>
            <td>${safe(o.restaurantName || o.storeName || "متجر")}</td>
            <td><strong>${Number(o.totalAmount ?? o.total ?? 0).toFixed(2)} د.م</strong></td>
            <td>${statusBadge(o.status)}</td>
        </tr>
    `).join("");
}

function updateMiniChart(todayOrders) {
    const canvas = document.getElementById("ordersMiniChart");
    if (!canvas || typeof Chart === "undefined") return;
    const hours = Array(24).fill(0);
    todayOrders.forEach(o => {
        if (o.createdAt?.toDate) hours[o.createdAt.toDate().getHours()]++;
    });
    if (ordersChartInstance) ordersChartInstance.destroy();
    ordersChartInstance = new Chart(canvas, {
        type: "line",
        data: {
            labels: Array.from({ length: 24 }, (_, i) => i + "h"),
            datasets: [{
                label: "الطلبات", data: hours,
                borderColor: "#FF7A00",
                backgroundColor: "rgba(255, 122, 0, 0.1)",
                fill: true, tension: 0.4, borderWidth: 3, pointRadius: 0
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } },
                x: { ticks: { maxTicksLimit: 8, font: { size: 10 } } }
            }
        }
    });
}

window.refreshDashboard = function () {
    updateDashboardMetrics();
    updateRecentOrdersTable();
    showToast("تم التحديث", "success");
};


/* ═══ RESTAURANTS ═══ */
function renderRestaurantsTable() {
    const tbody = document.getElementById("restaurantsTableBody");
    if (!tbody) return;
    const search = document.getElementById("searchRestaurantInput")?.value.toLowerCase().trim() || "";
    let list = stateCache.restaurants;
    if (search) list = list.filter(r => (r.name || "").toLowerCase().includes(search));

    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center empty-state"><p>لا توجد مطاعم.</p></td></tr>`;
        return;
    }
    tbody.innerHTML = list.map(r => {
        const open = r.isOpen !== false;
        const hasLoc = r.location?.lat && r.location?.lng;
        return `
            <tr>
                <td>
                    <div class="driver-cell">
                        <img src="${safeAttr(r.image || 'https://via.placeholder.com/40')}" class="img-thumb" onerror="this.src='https://via.placeholder.com/40'">
                        <div>
                            <strong>${safe(r.name || "—")}</strong>
                            ${!hasLoc ? '<br><small style="color:#F59E0B;font-size:10px;">📍 بدون موقع</small>' : ''}
                        </div>
                    </div>
                </td>
                <td>${safe(r.categoryName || r.cuisine || r.category || "مطعم")}</td>
                <td>${safe(r.phone || "-")}</td>
                <td>${safe(r.deliveryTime || "30 min")}</td>
                <td>${hasLoc ? '<span class="badge status-active">متوفر</span>' : '<span class="badge status-pending">مفقود</span>'}</td>
                <td>
                    <button class="badge restaurant-status-btn ${open ? "status-open" : "status-closed"}" onclick="toggleRestaurantStatus('${r.id}', ${open})">
                        ${open ? "مفتوح" : "مغلق"}
                    </button>
                </td>
                <td>
                    <button class="btn-sm btn-primary" onclick="openMenuManager('${r.id}', '${escapeJs(r.name || "")}')"><i data-lucide="list"></i></button>
                    <button class="btn-sm btn-secondary" onclick="openEditRestaurantModal('${r.id}')"><i data-lucide="pen"></i></button>
                    <button class="btn-sm btn-danger" onclick="deleteRestaurant('${r.id}')"><i data-lucide="trash-2"></i></button>
                </td>
            </tr>`;
    }).join("");
    refreshIcons();
}

window.openAddRestaurantModal = function () {
    document.getElementById("restaurantForm")?.reset();
    document.getElementById("restFormId").value = "";
    document.getElementById("restModalTitle").textContent = "إضافة مطعم جديد";
    document.getElementById("restFormIsOpen").checked = true;
    hidePreview("restImgPreview");
    openModal("restaurantModal");
};

window.openEditRestaurantModal = function (id) {
    const r = stateCache.restaurants.find(x => x.id === id);
    if (!r) return;
    setValue("restFormId", r.id);
    setValue("restFormName", r.name);
    setValue("restFormCuisine", r.category || r.cuisine || "");
    setValue("restFormCategoryName", r.categoryName || "");
    setValue("restFormTime", r.deliveryTime || "");
    setValue("restFormFee", r.deliveryFee === "Free" ? 0 : r.deliveryFee ?? 10);
    setValue("restFormImage", r.image || "");
    setValue("restFormPhone", r.phone || "");
    setValue("restFormLat", r.location?.lat || "");
    setValue("restFormLng", r.location?.lng || "");
    document.getElementById("restFormFreeDelivery").checked = r.freeDelivery === true;
    document.getElementById("restFormTodayOffer").checked = r.todayOffer === true;
    document.getElementById("restFormIsOpen").checked = r.isOpen !== false;
    if (r.image) showPreview("restImgPreview", r.image);
    document.getElementById("restModalTitle").textContent = "تعديل المطعم";
    openModal("restaurantModal");
};

window.deleteRestaurant = function (id) {
    openConfirmModal("حذف المطعم", "سيتم الحذف مع المنيو", async () => {
        try {
            const snap = await getDocs(collection(db, "restaurants", id, "menu"));
            const batch = writeBatch(db);
            snap.forEach(m => batch.delete(m.ref));
            await batch.commit();
            await deleteDoc(doc(db, "restaurants", id));
            showToast("تم", "success");
        } catch { showToast("فشل", "error"); }
    });
};

window.toggleRestaurantStatus = async function (id, cur) {
    try {
        await updateDoc(doc(db, "restaurants", id), { isOpen: !cur, updatedAt: serverTimestamp() });
        showToast(!cur ? "فُتح" : "أُغلق", "success");
    } catch { showToast("فشل", "error"); }
};


/* ═══ MENU ═══ */
window.openMenuManager = async function (restId, restName) {
    setText("menuModalTitle", "المنيو: " + restName);
    setText("menuModalSub", "إضافة وتعديل وحذف الوجبات");
    document.getElementById("menuProductForm")?.reset();
    document.getElementById("menuProdRestId").value = restId;
    document.getElementById("menuProdId").value = "";
    hidePreview("menuImgPreview");
    openModal("menuModal");
    await loadRestaurantMenu(restId);
};

async function loadRestaurantMenu(restId) {
    const tbody = document.getElementById("menuProductsTableBody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" class="text-center">جاري التحميل...</td></tr>`;
    try {
        const snap = await getDocs(collection(db, "restaurants", restId, "menu"));
        stateCache.menuProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (!stateCache.menuProducts.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center empty-state"><p>لا توجد وجبات.</p></td></tr>`;
            return;
        }
        tbody.innerHTML = stateCache.menuProducts.map(p => `
            <tr>
                <td><img src="${safeAttr(p.image || 'https://via.placeholder.com/40')}" class="img-thumb"></td>
                <td><strong>${safe(p.name)}</strong></td>
                <td>${Number(p.price || 0).toFixed(2)} د.م</td>
                <td>
                    <button class="btn-sm btn-secondary" onclick="editMenuProduct('${restId}', '${p.id}')"><i data-lucide="pen"></i></button>
                    <button class="btn-sm btn-danger" onclick="deleteMenuProduct('${restId}', '${p.id}')"><i data-lucide="trash-2"></i></button>
                </td>
            </tr>`).join("");
        refreshIcons();
    } catch { tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">فشل</td></tr>`; }
}

window.editMenuProduct = function (restId, pid) {
    const p = stateCache.menuProducts.find(x => x.id === pid);
    if (!p) return;
    setValue("menuProdId", p.id);
    setValue("menuProdRestId", restId);
    setValue("menuProdName", p.name || "");
    setValue("menuProdPrice", p.price || 0);
    setValue("menuProdCat", p.category || "");
    setValue("menuProdImage", p.image || "");
    setValue("menuProdDesc", p.description || "");
    if (p.image) showPreview("menuImgPreview", p.image);
    showToast("جاهز للتعديل", "info");
};

window.deleteMenuProduct = function (restId, pid) {
    openConfirmModal("حذف الوجبة", "تأكيد؟", async () => {
        try {
            await deleteDoc(doc(db, "restaurants", restId, "menu", pid));
            showToast("تم", "success");
            await loadRestaurantMenu(restId);
        } catch { showToast("فشل", "error"); }
    });
};


/* ═══ SHOPS ═══ */
function renderShopsTable() {
    const tbody = document.getElementById("shopsTableBody");
    if (!tbody) return;
    const shopCats = ["Fashion", "Electronics", "Perfume", "Accessories", "Home", "Sports", "Gifts", "Other"];
    let stores = stateCache.stores.filter(s => {
        const cat = s.categoryType || s.category || "";
        const sec = s.section || "";
        return sec === "shops" || shopCats.includes(cat) || (!sec && shopCats.includes(cat));
    });
    if (stateCache.shopsCategory !== "all") {
        stores = stores.filter(s => (s.categoryType || "") === stateCache.shopsCategory);
    }
    if (!stores.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center empty-state"><p>لا توجد متاجر.</p></td></tr>`;
        return;
    }
    tbody.innerHTML = stores.map(s => {
        const hasLoc = s.location?.lat && s.location?.lng;
        return `
            <tr>
                <td>
                    <div class="driver-cell">
                        <img src="${safeAttr(s.image)}" class="img-thumb" onerror="this.src='https://via.placeholder.com/40'">
                        <div>
                            <strong>${safe(s.name)}</strong>
                            ${!hasLoc ? '<br><small style="color:#F59E0B;font-size:10px;">📍 بدون موقع</small>' : ''}
                        </div>
                    </div>
                </td>
                <td><span class="badge badge-gray">${safe(s.categoryType || s.section || "عام")}</span></td>
                <td>${safe(s.phone || "-")}</td>
                <td>${statusBadge(s.status || "active")}</td>
                <td>
                    <button class="btn-sm btn-primary" onclick="openStoreProductsManager('${s.id}', '${escapeJs(s.name || "")}')"><i data-lucide="boxes"></i></button>
                    <button class="btn-sm btn-danger" onclick="deleteStore('${s.id}')"><i data-lucide="trash-2"></i></button>
                </td>
            </tr>`;
    }).join("");
    refreshIcons();
}

function renderParaTable() {
    const tbody = document.getElementById("paraTableBody");
    if (!tbody) return;
    const stores = stateCache.stores.filter(s => s.section === "parapharmacy");
    if (!stores.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center empty-state"><p>لا توجد متاجر.</p></td></tr>`;
        return;
    }
    tbody.innerHTML = stores.map(s => `
        <tr>
            <td>
                <div class="driver-cell">
                    <img src="${safeAttr(s.image)}" class="img-thumb">
                    <div><strong>${safe(s.name)}</strong></div>
                </div>
            </td>
            <td><span class="badge badge-gray">${safe(s.categoryType || "عناية")}</span></td>
            <td>${safe(s.phone || "-")}</td>
            <td>${statusBadge(s.status || "active")}</td>
            <td>
                <button class="btn-sm btn-primary" onclick="openStoreProductsManager('${s.id}', '${escapeJs(s.name || "")}')"><i data-lucide="boxes"></i></button>
                <button class="btn-sm btn-danger" onclick="deleteStore('${s.id}')"><i data-lucide="trash-2"></i></button>
            </td>
        </tr>
    `).join("");
    refreshIcons();
}

window.openAddStoreModal = function (section) {
    currentStoreSection = section || "shops";
    document.getElementById("storeForm")?.reset();
    document.getElementById("storeModalTitle").textContent = "إضافة متجر";
    hidePreview("storeImgPreview");
    openModal("storeModal");
};

window.deleteStore = function (id) {
    openConfirmModal("حذف المتجر", "سيتم الحذف مع منتجاته", async () => {
        try {
            const prods = await getDocs(collection(db, "stores", id, "products"));
            const batch = writeBatch(db);
            prods.forEach(p => batch.delete(p.ref));
            await batch.commit();
            await deleteDoc(doc(db, "stores", id));
            showToast("تم", "success");
        } catch { showToast("فشل", "error"); }
    });
};


/* ═══ STORE PRODUCTS ═══ */
window.openStoreProductsManager = async function (storeId, storeName) {
    setText("storeProductsModalTitle", "منتجات: " + storeName);
    setText("storeProductsModalSub", "إدارة المنتجات");
    document.getElementById("storeProductForm")?.reset();
    document.getElementById("storeProdStoreId").value = storeId;
    document.getElementById("storeProdId").value = "";
    hidePreview("storeProdImgPreview");
    openModal("storeProductsModal");
    await loadStoreProducts(storeId);
};

async function loadStoreProducts(storeId) {
    const tbody = document.getElementById("storeProductsTableBody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" class="text-center">جاري التحميل...</td></tr>`;
    try {
        const snap = await getDocs(collection(db, "stores", storeId, "products"));
        stateCache.storeProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (!stateCache.storeProducts.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center empty-state"><p>لا توجد منتجات.</p></td></tr>`;
            return;
        }
        tbody.innerHTML = stateCache.storeProducts.map(p => `
            <tr>
                <td><img src="${safeAttr(p.image)}" class="img-thumb"></td>
                <td><strong>${safe(p.name)}</strong></td>
                <td>${Number(p.price || 0).toFixed(2)} د.م</td>
                <td>
                    <button class="btn-sm btn-secondary" onclick="editStoreProduct('${storeId}', '${p.id}')"><i data-lucide="pen"></i></button>
                    <button class="btn-sm btn-danger" onclick="deleteStoreProduct('${storeId}', '${p.id}')"><i data-lucide="trash-2"></i></button>
                </td>
            </tr>`).join("");
        refreshIcons();
    } catch { tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">فشل</td></tr>`; }
}

window.editStoreProduct = function (storeId, pid) {
    const p = stateCache.storeProducts.find(x => x.id === pid);
    if (!p) return;
    setValue("storeProdId", p.id);
    setValue("storeProdName", p.name || "");
    setValue("storeProdPrice", p.price || 0);
    setValue("storeProdCat", p.category || "");
    setValue("storeProdImage", p.image || "");
    setValue("storeProdDesc", p.description || "");
    if (p.image) showPreview("storeProdImgPreview", p.image);
    showToast("جاهز", "info");
};

window.deleteStoreProduct = function (storeId, pid) {
    openConfirmModal("حذف المنتج", "تأكيد؟", async () => {
        try {
            await deleteDoc(doc(db, "stores", storeId, "products", pid));
            showToast("تم", "success");
            await loadStoreProducts(storeId);
        } catch { showToast("فشل", "error"); }
    });
};


/* ═══ DRIVERS ═══ */
function computeDriverLiveStatus(driver) {
    const adminStatus = driver.adminStatus || "active";
    if (adminStatus === "banned") return DRIVER_STATUS.SUSPENDED;
    if (adminStatus === "suspended_temp") {
        const until = driver.suspendedUntil?.toDate?.();
        if (!until || until > new Date()) return DRIVER_STATUS.SUSPENDED;
    }
    if (driver.verificationStatus === "pending") return DRIVER_STATUS.PENDING_VERIFICATION;

    const online = driver.status === "online";
    const lastHeartbeat = driver.lastHeartbeat?.toDate?.();
    const stale = !lastHeartbeat || (Date.now() - lastHeartbeat.getTime() > 120000);

    if (!online || stale) return DRIVER_STATUS.OFFLINE;
    if (driver.onBreak === true) return DRIVER_STATUS.ON_BREAK;
    if (driver.currentOrderId) return DRIVER_STATUS.ONLINE_BUSY;
    return DRIVER_STATUS.ONLINE_AVAILABLE;
}

function updateDriverStats() {
    const drivers = stateCache.drivers;
    const stats = { total: drivers.length, online: 0, available: 0, busy: 0, offline: 0, suspended: 0 };
    drivers.forEach(d => {
        const s = computeDriverLiveStatus(d);
        if (s === DRIVER_STATUS.ONLINE_AVAILABLE) { stats.online++; stats.available++; }
        else if (s === DRIVER_STATUS.ONLINE_BUSY) { stats.online++; stats.busy++; }
        else if (s === DRIVER_STATUS.OFFLINE) stats.offline++;
        else if (s === DRIVER_STATUS.ON_BREAK) stats.online++;
        else if (s === DRIVER_STATUS.SUSPENDED) stats.suspended++;
    });
    setText("drvStatTotal", stats.total);
    setText("drvStatOnline", stats.online);
    setText("drvStatAvailable", stats.available);
    setText("drvStatBusy", stats.busy);
    setText("drvStatOffline", stats.offline);
    setText("drvStatSuspended", stats.suspended);
}

function getFilteredDrivers() {
    let list = [...stateCache.drivers];
    if (stateCache.driversSearch) {
        const q = stateCache.driversSearch.toLowerCase();
        list = list.filter(d =>
            (d.name || "").toLowerCase().includes(q) ||
            (d.phone || "").includes(q) ||
            (d.driverId || "").toLowerCase().includes(q));
    }
    if (stateCache.driversStatus !== "all") list = list.filter(d => computeDriverLiveStatus(d) === stateCache.driversStatus);
    if (stateCache.driversVerification !== "all") list = list.filter(d => (d.verificationStatus || "pending") === stateCache.driversVerification);
    return list;
}

function renderDriversTable() {
    const tbody = document.getElementById("driversTableBody");
    if (!tbody) return;
    const list = getFilteredDrivers();
    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center empty-state"><p>لا يوجد سائقون.</p></td></tr>`;
        refreshIcons();
        return;
    }

    tbody.innerHTML = list.map(d => {
        const liveStatus = computeDriverLiveStatus(d);
        const ratingAvg = d.rating?.average || 0;
        const ratingCount = d.rating?.count || 0;
        const verif = d.verificationStatus || "pending";
        const verifBadge = verif === "verified" ? '<span class="badge status-active">موثق</span>' :
                          verif === "rejected" ? '<span class="badge status-cancelled">مرفوض</span>' :
                          '<span class="badge status-pending">قيد المراجعة</span>';
        const hasLoc = d.location?.lat && d.location?.lng;
        return `
            <tr>
                <td>
                    <div class="driver-cell">
                        <img src="${safeAttr(d.image || 'https://via.placeholder.com/40')}" class="img-thumb" onerror="this.src='https://via.placeholder.com/40'">
                        <div>
                            <strong>${safe(d.name || "—")}</strong>
                            ${!hasLoc ? '<br><small style="color:#F59E0B;font-size:10px;">📍 بدون موقع</small>' : ''}
                        </div>
                    </div>
                </td>
                <td><span class="order-id">${safe(d.driverId || "—")}</span></td>
                <td>${safe(d.phone || "-")}</td>
                <td>${vehicleLabel(d.vehicle)}</td>
                <td>${driverStatusBadge(liveStatus)}</td>
                <td>${verifBadge}</td>
                <td>${ratingCount > 0 ? `<span class="rating-display">⭐ ${ratingAvg.toFixed(1)}</span>` : '<small>—</small>'}</td>
                <td>
                    <button class="btn-sm btn-primary" onclick="openDriverControlModal('${d.id}')"><i data-lucide="gavel"></i></button>
                    <button class="btn-sm btn-secondary" onclick="openEditDriverModal('${d.id}')"><i data-lucide="pen"></i></button>
                    <button class="btn-sm btn-danger" onclick="deleteDriver('${d.id}')"><i data-lucide="trash-2"></i></button>
                </td>
            </tr>`;
    }).join("");
    refreshIcons();
}

async function generateUniqueDriverId() {
    const existing = new Set(stateCache.drivers.map(d => d.driverId));
    for (let i = 0; i < 30; i++) {
        const num = Math.floor(10000 + Math.random() * 90000);
        const id = `OC-D-${num}`;
        if (!existing.has(id)) return id;
    }
    throw new Error("تعذر توليد ID");
}

window.regenerateDriverId = async function () {
    try {
        setValue("driverFormId", await generateUniqueDriverId());
        showToast("تم", "success");
    } catch (e) { showToast(e.message, "error"); }
};

window.openAddDriverModal = async function () {
    document.getElementById("driverForm")?.reset();
    document.getElementById("driverFormFirebaseId").value = "";
    document.getElementById("driverModalTitleText").textContent = "إضافة سائق";
    try { setValue("driverFormId", await generateUniqueDriverId()); } catch {}
    document.getElementById("driverFormAdminStatus").value = "active";
    document.getElementById("driverFormVerification").value = "pending";
    hidePreview("driverImgPreview");
    hidePreview("driverCinPreview");
    openModal("driverModal");
};

window.openEditDriverModal = function (id) {
    const d = stateCache.drivers.find(x => x.id === id);
    if (!d) return;
    document.getElementById("driverModalTitleText").textContent = "تعديل السائق";
    setValue("driverFormFirebaseId", d.id);
    setValue("driverFormId", d.driverId || "");
    setValue("driverFormName", d.name || "");
    setValue("driverFormPhone", d.phone || "");
    setValue("driverFormEmail", d.email || "");
    setValue("driverFormVehicle", d.vehicle || "moto");
    setValue("driverFormPlate", d.plate || "");
    setValue("driverFormAdminStatus", d.adminStatus || "active");
    setValue("driverFormVerification", d.verificationStatus || "pending");
    setValue("driverFormImage", d.image || "");
    setValue("driverFormCinImage", d.cinImage || "");
    setValue("driverFormAdminNotes", d.adminNotes || "");
    if (d.image) showPreview("driverImgPreview", d.image);
    if (d.cinImage) showPreview("driverCinPreview", d.cinImage);
    openModal("driverModal");
};

window.openDriverControlModal = function (id) {
    const d = stateCache.drivers.find(x => x.id === id);
    if (!d) return;
    setValue("ctrlDriverFirebaseId", d.id);
    setText("ctrlDriverNameTitle", d.name);
    setValue("ctrlDriverAdminStatus", d.adminStatus || "active");
    setValue("ctrlDriverReason", d.adminNotes || "");
    toggleSuspensionField(d.adminStatus || "active");
    openModal("driverControlModal");
};

window.toggleSuspensionField = function (status) {
    const grp = document.getElementById("suspensionDurationGroup");
    if (grp) grp.style.display = status === "suspended_temp" ? "block" : "none";
};

window.deleteDriver = function (id) {
    openConfirmModal("حذف السائق", "سيتم الحذف", async () => {
        try {
            await deleteDoc(doc(db, "drivers", id));
            showToast("تم", "success");
        } catch { showToast("فشل", "error"); }
    });
};

function generateTempPassword(length = 10) {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let pwd = "";
    for (let i = 0; i < length; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    return pwd;
}

window.regenerateTempPassword = () => setValue("createAuthPassword", generateTempPassword());

window.copyToClipboard = function (text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => showToast("تم النسخ", "success"));
};

window.openCreateAuthModal = function () {
    const sel = document.getElementById("createAuthDriverSelect");
    if (sel) {
        const noAuth = stateCache.drivers.filter(d => !d.uid);
        sel.innerHTML = `<option value="">-- اختر (${noAuth.length} بدون حساب) --</option>` +
            noAuth.map(d => `<option value="${d.id}">${safe(d.name)} - ${safe(d.driverId)}</option>`).join("");
    }
    setValue("createAuthEmail", "");
    setValue("createAuthDriverId", "");
    setValue("createAuthDriverDocId", "");
    setValue("createAuthPassword", generateTempPassword());
    openModal("createAuthModal");
};

function populateAuthDriverDropdown() {
    const sel = document.getElementById("createAuthDriverSelect");
    if (!sel) return;
    const current = sel.value;
    const noAuth = stateCache.drivers.filter(d => !d.uid);
    sel.innerHTML = `<option value="">-- اختر (${noAuth.length} بدون حساب) --</option>` +
        noAuth.map(d => `<option value="${d.id}">${safe(d.name)} - ${safe(d.driverId)}</option>`).join("");
    if (current) sel.value = current;
}

document.addEventListener("change", (e) => {
    if (e.target.id === "createAuthDriverSelect") {
        const driverId = e.target.value;
        const d = stateCache.drivers.find(x => x.id === driverId);
        setValue("createAuthDriverDocId", driverId);
        setValue("createAuthDriverId", d?.driverId || "");
        setValue("createAuthEmail", d?.email || "");
    }
});

async function createDriverAuthAccount(driverDocId, driverId, password, email) {
    const secondaryAuth = getSecondaryAuth();
    const generatedEmail = email || `${driverId.toLowerCase()}@drivers.onecall.app`;
    const cred = await createUserWithEmailAndPassword(secondaryAuth, generatedEmail, password);
    const uid = cred.user.uid;
    try { await updateProfile(cred.user, { displayName: driverId }); } catch {}
    try { await signOut(secondaryAuth); } catch {}

    const driver = stateCache.drivers.find(d => d.id === driverDocId);
    await setDoc(doc(db, "users", uid), {
        name: driver?.name || "سائق",
        email: generatedEmail,
        role: "driver",
        driverDocId, driverId,
        mustChangePassword: true,
        createdAt: serverTimestamp()
    });
    await updateDoc(doc(db, "drivers", driverDocId), {
        uid, email: generatedEmail,
        authCreatedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    return { uid, email: generatedEmail };
}


/* ═══════════════════════════════════════════════════════
   🗺️ MAP — خريطة شاملة (سائقين + مطاعم + متاجر)
═══════════════════════════════════════════════════════ */
function initDriversMap() {
    const container = document.getElementById("driversMap");
    if (!container) return;

    if (stateCache.mapInstance) {
        setTimeout(() => {
            try { stateCache.mapInstance.invalidateSize(); } catch(e) {}
        }, 300);
        updateMapMarkers();
        return;
    }

    if (typeof L === "undefined") {
        container.innerHTML = '<div style="padding:40px;text-align:center;color:#888;">⏳ تحميل المكتبة...</div>';
        return;
    }

    try {
        stateCache.mapInstance = L.map("driversMap", {
            center: [34.6814, -1.9086],
            zoom: 14,
            zoomControl: false,
            rotate: true,
            touchRotate: true,
            rotateControl: { closeOnZeroBearing: false },
            bearing: 0,
            shiftKeyRotate: true,
            dragging: true,
            touchZoom: true,
            scrollWheelZoom: true,
            doubleClickZoom: true,
            boxZoom: true,
            keyboard: true
        });

        // طبقات
        const osmFrance = L.tileLayer("https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png", {
            attribution: '&copy; OpenStreetMap France',
            subdomains: "abc", maxZoom: 19, crossOrigin: true
        });
        const esriTopo = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", {
            attribution: '&copy; Esri', maxZoom: 19
        });
        const esriSat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
            attribution: '&copy; Esri', maxZoom: 19
        });

        osmFrance.addTo(stateCache.mapInstance);

        L.control.layers({
            "🗺️ خريطة الشوارع": osmFrance,
            "🏔️ تضاريس": esriTopo,
            "🛰️ فضائية": esriSat
        }, null, { position: "topright", collapsed: true }).addTo(stateCache.mapInstance);

        L.control.scale({ position: "bottomleft", imperial: false, maxWidth: 150 }).addTo(stateCache.mapInstance);
        L.control.zoom({ position: "topright" }).addTo(stateCache.mapInstance);

        // زر Fullscreen
        const FullscreenControl = L.Control.extend({
            options: { position: "topleft" },
            onAdd: function () {
                const btn = L.DomUtil.create("div", "leaflet-control-fullscreen");
                btn.innerHTML = "⛶";
                btn.title = "ملء الشاشة";
                L.DomEvent.on(btn, "click", function (e) {
                    L.DomEvent.stopPropagation(e);
                    const elem = document.getElementById("driversMap");
                    if (elem.requestFullscreen) elem.requestFullscreen();
                    else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
                });
                return btn;
            }
        });
        stateCache.mapInstance.addControl(new FullscreenControl());

        setTimeout(() => { try { stateCache.mapInstance.invalidateSize(); } catch(e) {} }, 500);
        setTimeout(() => { try { stateCache.mapInstance.invalidateSize(); } catch(e) {} }, 1200);

        console.log("✅ الخريطة جاهزة");
        updateMapMarkers();

    } catch (err) {
        console.error("❌ Map error:", err);
    }
}

function updateMapMarkers() {
    if (!stateCache.mapInstance || typeof L === "undefined") return;

    // مسح كل العلامات القديمة
    Object.values(stateCache.mapMarkers).forEach(group => {
        Object.values(group).forEach(m => {
            try { stateCache.mapInstance.removeLayer(m); } catch(e) {}
        });
    });
    stateCache.mapMarkers = { drivers: {}, restaurants: {}, stores: {}, hypermarkets: {} };

    const now = Date.now();
    let counts = { drivers: 0, restaurants: 0, stores: 0, hypermarkets: 0 };

    // 🍽️ المطاعم
    stateCache.restaurants.forEach(r => {
        if (!r.location?.lat || !r.location?.lng) return;
        const icon = L.divIcon({
            className: "map-marker-restaurant",
            html: `<div style="
                width: 38px; height: 38px; border-radius: 50%;
                background: #FF7A00; border: 3px solid #fff;
                box-shadow: 0 3px 10px rgba(0,0,0,0.3);
                display: flex; align-items: center; justify-content: center;
                color: #fff; font-size: 18px;
            ">🍽️</div>`,
            iconSize: [38, 38], iconAnchor: [19, 19]
        });

        const open = r.isOpen !== false;
        const marker = L.marker([r.location.lat, r.location.lng], { icon })
            .addTo(stateCache.mapInstance)
            .bindPopup(`
                <div style="font-family:inherit; direction:rtl; padding:6px; min-width:180px;">
                    <strong style="font-size:14px;">🍽️ ${safe(r.name)}</strong><br>
                    <small>${safe(r.phone || "-")}</small><br>
                    <span class="badge ${open ? "status-open" : "status-closed"}" style="padding:2px 8px; border-radius:10px; font-size:11px; margin-top:6px; display:inline-block;">
                        ${open ? "مفتوح" : "مغلق"}
                    </span>
                </div>
            `);

        stateCache.mapMarkers.restaurants[r.id] = marker;
        counts.restaurants++;
    });

    // 🛍️ المتاجر
    stateCache.stores.forEach(s => {
        if (!s.location?.lat || !s.location?.lng) return;
        const icon = L.divIcon({
            className: "map-marker-store",
            html: `<div style="
                width: 36px; height: 36px; border-radius: 50%;
                background: #3B82F6; border: 3px solid #fff;
                box-shadow: 0 3px 10px rgba(0,0,0,0.3);
                display: flex; align-items: center; justify-content: center;
                color: #fff; font-size: 16px;
            ">🛍️</div>`,
            iconSize: [36, 36], iconAnchor: [18, 18]
        });

        const marker = L.marker([s.location.lat, s.location.lng], { icon })
            .addTo(stateCache.mapInstance)
            .bindPopup(`
                <div style="font-family:inherit; direction:rtl; padding:6px;">
                    <strong>🛍️ ${safe(s.name)}</strong><br>
                    <small>${safe(s.phone || "-")}</small>
                </div>
            `);

        stateCache.mapMarkers.stores[s.id] = marker;
        counts.stores++;
    });

    // 🏬 الهايبرماركت
    stateCache.hypermarkets.forEach(h => {
        if (!h.location?.lat || !h.location?.lng) return;
        const icon = L.divIcon({
            className: "map-marker-hyper",
            html: `<div style="
                width: 40px; height: 40px; border-radius: 50%;
                background: #10B981; border: 3px solid #fff;
                box-shadow: 0 3px 10px rgba(0,0,0,0.3);
                display: flex; align-items: center; justify-content: center;
                color: #fff; font-size: 18px;
            ">🏬</div>`,
            iconSize: [40, 40], iconAnchor: [20, 20]
        });

        const marker = L.marker([h.location.lat, h.location.lng], { icon })
            .addTo(stateCache.mapInstance)
            .bindPopup(`
                <div style="font-family:inherit; direction:rtl; padding:6px;">
                    <strong>🏬 ${safe(h.name)}</strong>
                </div>
            `);

        stateCache.mapMarkers.hypermarkets[h.id] = marker;
        counts.hypermarkets++;
    });

    // 🏍️ السائقين (فقط من لديهم موقع حديث)
    stateCache.drivers.forEach(d => {
        const loc = d.location;
        if (!loc || typeof loc.lat !== "number") return;

        const updatedAt = d.locationUpdatedAt?.toDate?.();
        if (!updatedAt || (now - updatedAt.getTime()) > BUSINESS_CONFIG.driverLocationFreshnessMs) return;

        const status = computeDriverLiveStatus(d);
        const color = status === "online_available" ? "#10B981" :
                     status === "online_busy" ? "#F59E0B" :
                     status === "on_break" ? "#FF7A00" : "#64748B";

        const icon = L.divIcon({
            className: "driver-marker-icon",
            html: `<div style="
                width: 38px; height: 38px; border-radius: 50%;
                background: ${color}; border: 3px solid #fff;
                box-shadow: 0 4px 14px rgba(0,0,0,0.35);
                display: flex; align-items: center; justify-content: center;
                color: #fff; font-size: 17px;
                animation: pulseMarker 2s infinite;
            ">🏍️</div>`,
            iconSize: [38, 38], iconAnchor: [19, 19]
        });

        const marker = L.marker([loc.lat, loc.lng], { icon })
            .addTo(stateCache.mapInstance)
            .bindPopup(`
                <div style="font-family:inherit; direction:rtl; padding:6px;">
                    <strong>🏍️ ${safe(d.name)}</strong><br>
                    <small>${safe(d.driverId)}</small><br>
                    <span style="color:${color}; font-weight:bold;">●</span>
                    <span>${status === "online_available" ? "متاح" : status === "online_busy" ? "مشغول" : status === "on_break" ? "استراحة" : "غير متصل"}</span>
                </div>
            `);

        marker.on("click", () => {
            stateCache.mapInstance.flyTo([loc.lat, loc.lng], 16, { duration: 1.2 });
        });

        stateCache.mapMarkers.drivers[d.id] = marker;
        counts.drivers++;
    });

    console.log("📍 Markers:", counts);
}


/* ═══════════════════════════════════════════════════════
   🎯 AUTO-DISPATCH — التعيين التلقائي
═══════════════════════════════════════════════════════ */
function findClosestDriver(restaurantLat, restaurantLng) {
    const maxKm = BUSINESS_CONFIG.maxAssignDistanceKm;
    const now = Date.now();

    const available = stateCache.drivers.filter(d => {
        const status = computeDriverLiveStatus(d);
        if (status !== DRIVER_STATUS.ONLINE_AVAILABLE) return false;
        if (!d.location?.lat || !d.location?.lng) return false;
        const updatedAt = d.locationUpdatedAt?.toDate?.();
        if (!updatedAt || (now - updatedAt.getTime()) > BUSINESS_CONFIG.driverLocationFreshnessMs) return false;
        return true;
    });

    if (!available.length) return { driver: null, reason: "لا يوجد سائقون متاحون الآن" };

    const withDist = available.map(d => ({
        driver: d,
        distance: calculateDistance(restaurantLat, restaurantLng, d.location.lat, d.location.lng)
    }));

    const withinRange = withDist.filter(x => x.distance <= maxKm);
    if (!withinRange.length) {
        return { driver: null, reason: `لا يوجد سائقون في نطاق ${maxKm} كم` };
    }

    withinRange.sort((a, b) => {
        const distDiff = a.distance - b.distance;
        if (Math.abs(distDiff) < 1) {
            return (b.driver.rating?.average || 0) - (a.driver.rating?.average || 0);
        }
        return distDiff;
    });

    return {
        driver: withinRange[0].driver,
        distance: withinRange[0].distance
    };
}

async function autoAssignOrder(orderId) {
    const order = stateCache.orders.find(o => o.id === orderId);
    if (!order) return { success: false, reason: "الطلب غير موجود" };
    if (order.driverId) return { success: false, reason: "الطلب معين بالفعل" };

    const restaurant = stateCache.restaurants.find(r =>
        r.id === order.restaurantId ||
        r.name === (order.restaurantName || order.storeName)
    );

    if (!restaurant) return { success: false, reason: "المطعم غير موجود" };
    if (!restaurant.location?.lat || !restaurant.location?.lng) {
        return { success: false, reason: `المطعم "${restaurant.name}" لا يملك موقع` };
    }

    const result = findClosestDriver(restaurant.location.lat, restaurant.location.lng);
    if (!result.driver) return { success: false, reason: result.reason };

    try {
        await updateDoc(doc(db, "orders", orderId), {
            driverId: result.driver.id,
            driverName: result.driver.name,
            driverPhone: result.driver.phone || "",
            status: "assigned",
            assignedAt: serverTimestamp(),
            assignedBy: "auto",
            updatedAt: serverTimestamp()
        });

        await updateDoc(doc(db, "drivers", result.driver.id), {
            currentOrderId: orderId,
            updatedAt: serverTimestamp()
        });

        return { success: true, driver: result.driver, distance: result.distance };
    } catch (err) {
        return { success: false, reason: "فشل: " + err.message };
    }
}

window.autoAssignAllPending = async function () {
    const pendingOrders = stateCache.orders.filter(o =>
        (o.status === "pending" || o.status === "confirmed" || o.status === "ready") && !o.driverId
    );

    if (!pendingOrders.length) return showToast("لا توجد طلبات معلقة", "info");

    if (!confirm(`سيتم تعيين ${pendingOrders.length} طلب تلقائياً. متابعة؟`)) return;

    let assigned = 0, failed = 0;
    const failures = [];

    for (const order of pendingOrders) {
        const result = await autoAssignOrder(order.id);
        if (result.success) {
            assigned++;
            console.log(`✅ ${order.id.substring(0,6)} → ${result.driver.name} (${result.distance.toFixed(2)} كم)`);
        } else {
            failed++;
            failures.push(`#${order.id.substring(0,6)}: ${result.reason}`);
        }
    }

    if (assigned > 0) {
        showToast(`✅ تم تعيين ${assigned} طلب${failed ? ` (فشل ${failed})` : ""}`, "success");
    } else {
        showToast(`❌ فشل. السبب: ${failures[0] || "غير معروف"}`, "error");
    }

    if (failures.length) console.warn("Failures:", failures);
};

window.assignOrderAuto = async function (orderId) {
    showToast("🎯 البحث عن أقرب سائق...", "info");
    const result = await autoAssignOrder(orderId);
    if (result.success) {
        showToast(`✅ تم تعيين ${result.driver.name} (${result.distance.toFixed(1)} كم)`, "success");
    } else {
        showToast(`❌ ${result.reason}`, "error");
    }
};


/* ═══════════════════════════════════════════════════════
   💰 DRIVER EARNINGS — أرباح السائقين
═══════════════════════════════════════════════════════ */
async function recordDriverEarning(order) {
    if (!order.driverId) return;
    if (order.earningRecorded) return;

    const amount = BUSINESS_CONFIG.driverCommission;
    try {
        await addDoc(collection(db, "driver_earnings"), {
            orderId: order.id,
            driverId: order.driverId,
            driverName: order.driverName || "",
            amount: amount,
            type: "delivery",
            status: "pending",
            createdAt: serverTimestamp()
        });

        await updateDoc(doc(db, "orders", order.id), {
            earningRecorded: true,
            earningAmount: amount
        });

        await updateDoc(doc(db, "drivers", order.driverId), {
            completedOrdersCount: increment(1),
            totalEarnings: increment(amount)
        });

        console.log(`💰 أرباح ${order.driverName}: ${amount} د.م`);
    } catch (err) {
        console.error("Earning record failed:", err);
    }
}


/* ═══ HYPERMARKETS ═══ */
window.openAddHypermarketModal = function () {
    document.getElementById("hypermarketForm")?.reset();
    document.getElementById("hyperId").value = "";
    document.getElementById("hyperModalTitle").textContent = "إضافة هايبرماركت";
    document.getElementById("categoryMappingList").innerHTML = "";
    addMappingRow();
    hidePreview("hyperImgPreview");
    openModal("hypermarketModal");
};

window.onChainChange = function (chain) {
    const info = HYPER_CHAINS[chain];
    if (!info) return;
    const nameInput = document.getElementById("hyperName");
    if (!nameInput.value) nameInput.value = info.name;
};

window.addMappingRow = function (source = "", target = "other") {
    const list = document.getElementById("categoryMappingList");
    if (!list) return;
    const row = document.createElement("div");
    row.className = "mapping-row";
    row.innerHTML = `
        <input type="text" placeholder="تصنيف المصدر" class="source-cat" value="${safeAttr(source)}">
        <select class="target-cat">
            ${PRODUCT_CATEGORIES.map(c => `<option value="${c.value}" ${c.value === target ? "selected" : ""}>${c.label}</option>`).join("")}
        </select>
        <button type="button" class="btn-icon danger" onclick="this.parentElement.remove()"><i data-lucide="x"></i></button>
    `;
    list.appendChild(row);
    refreshIcons();
};

function renderHypermarkets() {
    const grid = document.getElementById("hyperGrid");
    if (!grid) return;
    if (!stateCache.hypermarkets.length) {
        grid.innerHTML = `<div class="empty-state-card"><i data-lucide="store"></i><h3>لا توجد هايبرماركت</h3></div>`;
        refreshIcons();
        return;
    }
    grid.innerHTML = stateCache.hypermarkets.map(h => {
        const info = HYPER_CHAINS[h.chain] || HYPER_CHAINS.custom;
        const lastSync = h.lastSync?.toDate ? formatRelativeTime(h.lastSync.toDate()) : "لم تتم";
        return `
            <div class="hyper-card">
                <div class="hyper-cover">
                    ${h.image ? `<img src="${safeAttr(h.image)}" onerror="this.style.display='none'">` : `<div style="font-size:50px;">${info.icon}</div>`}
                    <div class="hyper-chain-logo" style="color:${info.color};">${info.icon} ${safe(info.name)}</div>
                </div>
                <div class="hyper-body">
                    <h3>${safe(h.name)}</h3>
                    <p class="sub">${safe(h.city || "المغرب")}</p>
                    <div class="hyper-stats">
                        <div class="hyper-stat-item"><strong>${h.productsCount || 0}</strong><span>منتج</span></div>
                        <div class="hyper-stat-item"><strong>+${h.priceMarkup || 0}%</strong><span>هامش</span></div>
                    </div>
                    <p style="font-size:11px; color:#888; margin:6px 0;">آخر مزامنة: ${lastSync}</p>
                    <div class="hyper-actions">
                        <button class="btn-danger btn-sm" onclick="deleteHypermarket('${h.id}')"><i data-lucide="trash-2"></i></button>
                    </div>
                </div>
            </div>`;
    }).join("");
    refreshIcons();
}

window.deleteHypermarket = function (id) {
    openConfirmModal("حذف", "تأكيد؟", async () => {
        try {
            const prods = await getDocs(query(collection(db, "hypermarket_products"), where("hypermarketId", "==", id)));
            const batch = writeBatch(db);
            prods.forEach(p => batch.delete(p.ref));
            await batch.commit();
            await deleteDoc(doc(db, "hypermarkets", id));
            showToast("تم", "success");
        } catch { showToast("فشل", "error"); }
    });
};

function renderHyperProductsTable() {
    const tbody = document.getElementById("hyperProductsTableBody");
    if (!tbody) return;
    const q = (stateCache.hyperProductsSearch || "").toLowerCase();
    let list = stateCache.hyperProducts;
    if (q) list = list.filter(p => (p.name || "").toLowerCase().includes(q));
    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center empty-state"><p>لا توجد منتجات</p></td></tr>`;
        return;
    }
    tbody.innerHTML = list.slice(0, 100).map(p => {
        const chain = HYPER_CHAINS[p.chain] || HYPER_CHAINS.custom;
        const finalPrice = Number(p.finalPrice || 0);
        return `
            <tr>
                <td>
                    <div class="driver-cell">
                        <img src="${safeAttr(p.image || 'https://via.placeholder.com/40')}" class="img-thumb" onerror="this.src='https://via.placeholder.com/40'">
                        <div><strong style="font-size:12px;">${safe((p.name || "").substring(0, 40))}</strong></div>
                    </div>
                </td>
                <td><span class="badge badge-gray">${chain.icon} ${safe(chain.name)}</span></td>
                <td><small>${safe(p.barcode || "-")}</small></td>
                <td>${finalPrice.toFixed(2)} د.م</td>
                <td><span class="badge status-active">متوفر</span></td>
                <td></td>
            </tr>`;
    }).join("");
}

function updateHyperStats() {
    setText("hyperChainsCount", stateCache.hypermarkets.length);
    const total = stateCache.hypermarkets.reduce((s, h) => s + Number(h.productsCount || 0), 0);
    setText("hyperProductsTotal", total);
    const last = stateCache.hypermarkets.map(h => h.lastSync?.toDate?.()).filter(Boolean).sort((a, b) => b - a)[0];
    setText("hyperLastSync", last ? formatRelativeTime(last) : "—");
}

window.openSyncSettingsModal = function () { openModal("syncSettingsModal"); };

function renderSyncLogs() {
    const tbody = document.getElementById("syncLogTableBody");
    if (!tbody) return;
    if (!stateCache.syncLogs.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center empty-state"><p>لا توجد عمليات</p></td></tr>`;
        return;
    }
    tbody.innerHTML = stateCache.syncLogs.map(l => {
        const chain = HYPER_CHAINS[l.chain] || HYPER_CHAINS.custom;
        const sb = l.status === "success" ? '<span class="badge status-active">نجح</span>' :
                   l.status === "error" ? '<span class="badge status-cancelled">فشل</span>' :
                   '<span class="badge status-pending">جاري</span>';
        return `
            <tr>
                <td><small>${l.createdAt?.toDate ? l.createdAt.toDate().toLocaleString("ar-MA") : "-"}</small></td>
                <td>${chain.icon} ${safe(l.hypermarketName || chain.name)}</td>
                <td>${sb}</td>
                <td><strong>${l.productsCount || 0}</strong></td>
                <td>${l.duration ? (l.duration / 1000).toFixed(1) + "s" : "-"}</td>
                <td><small>${safe(l.details || l.error || "-")}</small></td>
            </tr>`;
    }).join("");
}

window.openSyncLogModal = function () {
    renderSyncLogs();
    openModal("syncLogModal");
};


/* ═══ SERVICES (تفعيل / إيقاف الأقسام) ═══ */
const SERVICE_TOGGLES = {
    package: "toggleServicePackage",
    groceries: "toggleServiceGroceries",
    parapharmacy: "toggleServicePara"
};
const servicesState = { package: true, groceries: true, parapharmacy: true };

async function loadServicesSettings() {
    try {
        const snap = await getDoc(doc(db, "settings", "services"));
        if (snap.exists()) Object.assign(servicesState, snap.data());
    } catch (err) {
        console.warn("Services settings:", err.message);
    }
    // مفعّل افتراضياً إذا لم يُحفظ شيء بعد
    Object.entries(SERVICE_TOGGLES).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.checked = servicesState[key] !== false;
    });
}

window.toggleServiceStatus = async function (serviceKey, isEnabled) {
    try {
        servicesState[serviceKey] = isEnabled;
        await setDoc(doc(db, "settings", "services"), { [serviceKey]: isEnabled }, { merge: true });
        showToast(isEnabled ? "تم تفعيل الخدمة" : "تم إيقاف الخدمة", "success");
    } catch (err) {
        console.error(err);
        // نرجع المفتاح لحالته السابقة
        servicesState[serviceKey] = !isEnabled;
        const el = document.getElementById(SERVICE_TOGGLES[serviceKey]);
        if (el) el.checked = !isEnabled;
        showToast("فشل تحديث الخدمة", "error");
    }
};


/* ═══ ORDERS ═══ */
function renderOrdersTable() {
    const tbody = document.getElementById("ordersTableBody");
    if (!tbody) return;

    let list = stateCache.orders;
    if (stateCache.ordersStatus !== "all") list = list.filter(o => o.status === stateCache.ordersStatus);
    if (stateCache.ordersSearch) {
        const q = stateCache.ordersSearch;
        list = list.filter(o =>
            o.id.toLowerCase().includes(q) ||
            (o.customerName || "").toLowerCase().includes(q) ||
            (o.restaurantName || o.storeName || "").toLowerCase().includes(q));
    }

    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / stateCache.ordersPerPage));
    const safePage = Math.min(stateCache.ordersPage, pages);
    stateCache.ordersPage = safePage;
    const start = (safePage - 1) * stateCache.ordersPerPage;
    const pageList = list.slice(start, start + stateCache.ordersPerPage);

    if (!pageList.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center empty-state"><p>لا توجد طلبات</p></td></tr>`;
    } else {
        tbody.innerHTML = pageList.map(o => `
            <tr>
                <td><span class="order-id">#${o.id.substring(0, 6)}</span></td>
                <td>${safe(o.customerName || "عميل")}</td>
                <td>${safe(o.restaurantName || o.storeName || "متجر")}</td>
                <td>${safe(o.driverName || "—")}</td>
                <td><strong>${Number(o.totalAmount ?? o.total ?? 0).toFixed(2)} د.م</strong></td>
                <td>
                    <select onchange="updateOrderStatus('${o.id}', this.value)" class="status-select status-${o.status}">
                        <option value="pending" ${o.status === "pending" ? "selected" : ""}>معلق</option>
                        <option value="confirmed" ${o.status === "confirmed" ? "selected" : ""}>مؤكد</option>
                        <option value="preparing" ${o.status === "preparing" ? "selected" : ""}>قيد التحضير</option>
                        <option value="ready" ${o.status === "ready" ? "selected" : ""}>جاهز</option>
                        <option value="assigned" ${o.status === "assigned" ? "selected" : ""}>معين</option>
                        <option value="accepted" ${o.status === "accepted" ? "selected" : ""}>مقبول</option>
                        <option value="picked_up" ${o.status === "picked_up" ? "selected" : ""}>مستلم</option>
                        <option value="on_the_way" ${o.status === "on_the_way" ? "selected" : ""}>في الطريق</option>
                        <option value="delivered" ${o.status === "delivered" ? "selected" : ""}>مكتمل</option>
                        <option value="cancelled" ${o.status === "cancelled" ? "selected" : ""}>ملغي</option>
                    </select>
                </td>
                <td><small>${o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString("ar-MA") : "-"}</small></td>
                <td>
                    <button class="btn-sm btn-outline" onclick="openOrderDetails('${o.id}')"><i data-lucide="eye"></i></button>
                    ${!o.driverId ? `<button class="btn-sm btn-primary" onclick="assignOrderAuto('${o.id}')" title="تعيين تلقائي" style="background:linear-gradient(135deg,#10B981,#059669);color:#fff;border:none;"><i data-lucide="zap"></i></button>` : ""}
                </td>
            </tr>`).join("");
    }

    const pag = document.getElementById("ordersPagination");
    if (pag) pag.innerHTML = `
        <button class="btn-sm btn-outline" ${safePage <= 1 ? "disabled" : ""} onclick="goOrdersPage(${safePage - 1})">‹</button>
        <span>صفحة ${safePage} من ${pages} (${total})</span>
        <button class="btn-sm btn-outline" ${safePage >= pages ? "disabled" : ""} onclick="goOrdersPage(${safePage + 1})">›</button>
    `;
    refreshIcons();
}

window.goOrdersPage = function (p) { stateCache.ordersPage = p; renderOrdersTable(); };

window.updateOrderStatus = async function (id, status) {
    try {
        const order = stateCache.orders.find(o => o.id === id);

        // نفس الحالة: لا نفعل شيئاً (يمنع تسجيل أرباح السائق مرتين)
        if (order && order.status === status) return;
        // طلب منتهٍ لا يمكن تغييره
        if (order && ["delivered", "cancelled"].includes(order.status)) {
            showToast("لا يمكن تغيير حالة طلب منتهٍ", "error");
            renderOrdersTable();
            return;
        }
        await updateDoc(doc(db, "orders", id), { status, updatedAt: serverTimestamp() });

        // إذا أصبح delivered: سجّل الأرباح + حرر السائق
        if (status === "delivered" && order) {
            await recordDriverEarning({ ...order, status: "delivered" });
            if (order.driverId) {
                await updateDoc(doc(db, "drivers", order.driverId), {
                    currentOrderId: null,
                    status: "online",
                    updatedAt: serverTimestamp()
                });
            }
        }

        showToast("تم", "success");
    } catch (err) {
        console.error(err);
        showToast("فشل", "error");
    }
};

window.openOrderDetails = function (id) {
    const o = stateCache.orders.find(x => x.id === id);
    if (!o) return;
    document.getElementById("ordModalTitle").textContent = "الطلب #" + id.substring(0, 6);
    const items = (o.items || []).map(i => `
        <div class="order-item-row">
            <span>${safe(i.name || "منتج")} × ${i.quantity || 1}</span>
            <strong>${Number(i.price || 0).toFixed(2)} د.م</strong>
        </div>
    `).join("") || "<p style='padding:10px;color:#888;'>لا تفاصيل</p>";

    document.getElementById("ordModalContent").innerHTML = `
        <div class="order-details-grid">
            <div class="detail-row"><span>العميل:</span><strong>${safe(o.customerName || "عميل")}</strong></div>
            <div class="detail-row"><span>الهاتف:</span><strong>${safe(o.customerPhone || "-")}</strong></div>
            <div class="detail-row"><span>العنوان:</span><strong>${safe(o.address || o.deliveryAddress || "-")}</strong></div>
            <div class="detail-row"><span>المتجر:</span><strong>${safe(o.restaurantName || o.storeName || "-")}</strong></div>
            <div class="detail-row"><span>السائق:</span><strong>${safe(o.driverName || "—")}</strong></div>
            <div class="detail-row"><span>الحالة:</span>${statusBadge(o.status)}</div>
            <div class="detail-row"><span>الدفع:</span><strong>${safe(o.paymentMethod || "نقدي")}</strong></div>
            <div class="detail-row"><span>التاريخ:</span><strong>${o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString("ar-MA") : "-"}</strong></div>
        </div>
        <h4 class="mt-2">المنتجات:</h4>
        <div class="order-items-list">${items}</div>
        <div class="order-total"><span>الإجمالي:</span><strong>${Number(o.totalAmount ?? o.total ?? 0).toFixed(2)} د.م</strong></div>
    `;
    openModal("orderDetailsModal");
};

window.exportOrdersCSV = function () {
    const rows = [["الرقم", "العميل", "المتجر", "السائق", "المبلغ", "الحالة", "التاريخ"]];
    stateCache.orders.forEach(o => rows.push([
        o.id.substring(0, 8),
        o.customerName || "عميل",
        o.restaurantName || o.storeName || "-",
        o.driverName || "-",
        Number(o.totalAmount ?? o.total ?? 0).toFixed(2),
        o.status || "-",
        o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString("ar-MA") : "-"
    ]));
    const csv = "\uFEFF" + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "orders_" + new Date().toISOString().slice(0, 10) + ".csv";
    link.click();
    showToast("تم التصدير", "success");
};


/* ═══ AUDIT ═══ */
function renderAuditTable() {
    const tbody = document.getElementById("auditTableBody");
    if (!tbody) return;
    if (!stateCache.auditLogs.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center empty-state"><p>لا توجد سجلات</p></td></tr>`;
        return;
    }
    tbody.innerHTML = stateCache.auditLogs.map(l => `
        <tr>
            <td><small>${l.createdAt?.toDate ? l.createdAt.toDate().toLocaleString("ar-MA") : "-"}</small></td>
            <td>${safe(l.adminName)}</td>
            <td>${safe(l.action)}</td>
            <td><span class="order-id">${safe(l.targetId?.substring(0, 10) || "-")}</span></td>
        </tr>
    `).join("");
}


/* ═══ ZONES ═══ */
function renderZonesTable() {
    const tbody = document.getElementById("zonesTableBody");
    if (!tbody) return;
    if (!stateCache.zones.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center empty-state"><p>لا توجد مناطق</p></td></tr>`;
        return;
    }
    tbody.innerHTML = stateCache.zones.map(z => `
        <tr>
            <td><strong>${safe(z.name)}</strong></td>
            <td>${safe(z.city || "-")}</td>
            <td>${Number(z.deliveryFee || 0).toFixed(2)} د.م</td>
            <td><button class="btn-sm btn-danger" onclick="deleteZone('${z.id}')"><i data-lucide="trash-2"></i></button></td>
        </tr>
    `).join("");
    refreshIcons();
}

window.openZoneModal = function () {
    document.getElementById("zoneForm")?.reset();
    openModal("zoneModal");
};

window.deleteZone = function (id) {
    openConfirmModal("حذف المنطقة", "تأكيد؟", async () => {
        try { await deleteDoc(doc(db, "zones", id)); showToast("تم", "success"); } catch { showToast("فشل", "error"); }
    });
};


/* ═══ COUPONS ═══ */
function renderCouponsTable() {
    const tbody = document.getElementById("couponsTableBody");
    if (!tbody) return;
    if (!stateCache.coupons.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center empty-state"><p>لا توجد كوبونات</p></td></tr>`;
        return;
    }
    tbody.innerHTML = stateCache.coupons.map(c => `
        <tr>
            <td><strong>${safe(c.code)}</strong></td>
            <td>${c.value}%</td>
            <td>${c.usedCount || 0}</td>
            <td><button class="btn-sm btn-danger" onclick="deleteCoupon('${c.id}')"><i data-lucide="trash-2"></i></button></td>
        </tr>
    `).join("");
    refreshIcons();
}

window.openCouponModal = function () {
    document.getElementById("couponForm")?.reset();
    openModal("couponModal");
};

window.deleteCoupon = async function (id) {
    try { await deleteDoc(doc(db, "coupons", id)); showToast("تم", "success"); } catch { showToast("فشل", "error"); }
};


/* ═══ OFFERS ═══ */
function populateOfferRestaurantsDropdown() {
    const sel = document.getElementById("offerRestSelect");
    if (!sel) return;
    sel.innerHTML = stateCache.restaurants.map(r => `<option value="${r.id}">${safe(r.name)}</option>`).join("");
}

function renderOffersTable() {
    const tbody = document.getElementById("offersTableBody");
    if (!tbody) return;
    if (!stateCache.offers.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center empty-state"><p>لا توجد عروض</p></td></tr>`;
        return;
    }
    tbody.innerHTML = stateCache.offers.map(o => `
        <tr>
            <td><img src="${safeAttr(o.image)}" class="img-thumb" onerror="this.src='https://via.placeholder.com/40'"></td>
            <td><strong>${safe(o.title)}</strong></td>
            <td>${safe(o.restaurantName || "-")}</td>
            <td>${Number(o.discountValue || 0).toFixed(2)} د.م</td>
            <td><button class="btn-sm btn-danger" onclick="deleteOffer('${o.id}')"><i data-lucide="trash-2"></i></button></td>
        </tr>
    `).join("");
    refreshIcons();
}

window.openOfferModal = function () {
    document.getElementById("offerForm")?.reset();
    hidePreview("offerImgPreview");
    openModal("offerModal");
};

window.deleteOffer = async function (id) {
    try { await deleteDoc(doc(db, "offers", id)); showToast("تم", "success"); } catch { showToast("فشل", "error"); }
};


/* ═══ BANNERS ═══ */
function renderBannersTable() {
    const tbody = document.getElementById("bannersTableBody");
    if (!tbody) return;
    if (!stateCache.banners.length) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center empty-state"><p>لا توجد بانرات</p></td></tr>`;
        return;
    }
    tbody.innerHTML = stateCache.banners.map(b => `
        <tr>
            <td><img src="${safeAttr(b.image)}" class="img-thumb" onerror="this.src='https://via.placeholder.com/40'"></td>
            <td><strong>${safe(b.title)}</strong></td>
            <td><button class="btn-sm btn-danger" onclick="deleteBanner('${b.id}')"><i data-lucide="trash-2"></i></button></td>
        </tr>
    `).join("");
    refreshIcons();
}

window.openBannerModal = function () {
    document.getElementById("bannerForm")?.reset();
    hidePreview("bannerImgPreview");
    openModal("bannerModal");
};

window.deleteBanner = async function (id) {
    try { await deleteDoc(doc(db, "banners", id)); showToast("تم", "success"); } catch { showToast("فشل", "error"); }
};


/* ═══ REVIEWS ═══ */
function renderReviewsTable() {
    const tbody = document.getElementById("reviewsTableBody");
    if (!tbody) return;
    if (!stateCache.driverReviews.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center empty-state"><p>لا توجد تقييمات</p></td></tr>`;
        return;
    }
    tbody.innerHTML = stateCache.driverReviews.map(r => {
        const driver = stateCache.drivers.find(d => d.id === r.driverId);
        return `
            <tr>
                <td><small>${r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString("ar-MA") : "-"}</small></td>
                <td>${safe(driver?.name || "-")}</td>
                <td>${safe(r.customerName || "عميل")}</td>
                <td><span class="rating-display">⭐ ${r.rating} / 5</span></td>
                <td><small>${safe((r.feedback || "").substring(0, 50))}</small></td>
            </tr>`;
    }).join("");
}


/* ═══ FORMS ═══ */
function setupForms() {
    console.log("📝 تفعيل Forms");

    // Restaurant
    document.getElementById("restaurantForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = document.getElementById("restFormId").value.trim();
        const freeDelivery = document.getElementById("restFormFreeDelivery").checked;
        const data = {
            name: document.getElementById("restFormName").value.trim(),
            category: document.getElementById("restFormCuisine").value.trim(),
            cuisine: document.getElementById("restFormCuisine").value.trim(),
            categoryName: document.getElementById("restFormCategoryName").value.trim() || document.getElementById("restFormCuisine").value.trim(),
            phone: document.getElementById("restFormPhone").value.trim(),
            deliveryTime: document.getElementById("restFormTime").value.trim() || "30 min",
            deliveryFee: freeDelivery ? "Free" : Number(document.getElementById("restFormFee").value),
            freeDelivery,
            todayOffer: document.getElementById("restFormTodayOffer").checked,
            isOpen: document.getElementById("restFormIsOpen").checked,
            image: document.getElementById("restFormImage").value.trim(),
            location: {
                lat: Number(document.getElementById("restFormLat")?.value) || null,
                lng: Number(document.getElementById("restFormLng")?.value) || null
            },
            updatedAt: serverTimestamp()
        };
        try {
            if (id) {
                await updateDoc(doc(db, "restaurants", id), data);
                showToast("تم التحديث", "success");
            } else {
                data.createdAt = serverTimestamp();
                data.ratingStats = { average: 0, count: 0 };
                await addDoc(collection(db, "restaurants"), data);
                showToast("تمت الإضافة", "success");
            }
            closeModal("restaurantModal");
        } catch { showToast("فشل", "error"); }
    });

    // Menu
    document.getElementById("menuProductForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const restId = document.getElementById("menuProdRestId").value;
        const pid = document.getElementById("menuProdId").value.trim();
        if (!restId) return showToast("لم يُحدد المطعم", "error");
        const data = {
            name: document.getElementById("menuProdName").value.trim(),
            price: Number(document.getElementById("menuProdPrice").value),
            category: document.getElementById("menuProdCat").value.trim(),
            image: document.getElementById("menuProdImage").value.trim(),
            description: document.getElementById("menuProdDesc").value.trim(),
            available: true,
            updatedAt: serverTimestamp()
        };
        try {
            if (pid) await updateDoc(doc(db, "restaurants", restId, "menu", pid), data);
            else { data.createdAt = serverTimestamp(); await addDoc(collection(db, "restaurants", restId, "menu"), data); }
            showToast("تم", "success");
            e.target.reset();
            document.getElementById("menuProdRestId").value = restId;
            document.getElementById("menuProdId").value = "";
            hidePreview("menuImgPreview");
            await loadRestaurantMenu(restId);
        } catch { showToast("فشل", "error"); }
    });

    // Store
    document.getElementById("storeForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
            await addDoc(collection(db, "stores"), {
                name: document.getElementById("storeFormName").value.trim(),
                phone: document.getElementById("storeFormPhone").value.trim(),
                image: document.getElementById("storeFormImage").value.trim(),
                categoryType: document.getElementById("storeFormCategory").value,
                section: currentStoreSection,
                status: "active",
                location: {
                    lat: Number(document.getElementById("storeFormLat")?.value) || null,
                    lng: Number(document.getElementById("storeFormLng")?.value) || null
                },
                createdAt: serverTimestamp()
            });
            showToast("تم", "success");
            closeModal("storeModal");
        } catch { showToast("فشل", "error"); }
    });

    // Store product
    document.getElementById("storeProductForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const storeId = document.getElementById("storeProdStoreId").value;
        const pid = document.getElementById("storeProdId").value.trim();
        if (!storeId) return showToast("لم يُحدد المتجر", "error");
        const data = {
            name: document.getElementById("storeProdName").value.trim(),
            price: Number(document.getElementById("storeProdPrice").value),
            category: document.getElementById("storeProdCat").value.trim() || "عام",
            image: document.getElementById("storeProdImage").value.trim(),
            description: document.getElementById("storeProdDesc").value.trim(),
            available: true,
            updatedAt: serverTimestamp()
        };
        try {
            if (pid) await updateDoc(doc(db, "stores", storeId, "products", pid), data);
            else { data.createdAt = serverTimestamp(); await addDoc(collection(db, "stores", storeId, "products"), data); }
            showToast("تم", "success");
            e.target.reset();
            document.getElementById("storeProdStoreId").value = storeId;
            document.getElementById("storeProdId").value = "";
            hidePreview("storeProdImgPreview");
            await loadStoreProducts(storeId);
        } catch { showToast("فشل", "error"); }
    });

    // Driver
    document.getElementById("driverForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fid = document.getElementById("driverFormFirebaseId").value.trim();
        const driverId = document.getElementById("driverFormId").value.trim();
        let phone = document.getElementById("driverFormPhone").value.trim().replace(/\s+/g, "");
        if (phone.startsWith("0")) phone = "+212" + phone.substring(1);
        else if (!phone.startsWith("+212")) phone = "+212" + phone;

        const duplicate = stateCache.drivers.find(d => d.driverId === driverId && d.id !== fid);
        if (duplicate) return showToast("Driver ID مستخدم!", "error");

        const data = {
            driverId,
            name: document.getElementById("driverFormName").value.trim(),
            phone,
            email: document.getElementById("driverFormEmail").value.trim(),
            vehicle: document.getElementById("driverFormVehicle").value,
            plate: document.getElementById("driverFormPlate").value.trim(),
            adminStatus: document.getElementById("driverFormAdminStatus").value,
            verificationStatus: document.getElementById("driverFormVerification").value,
            image: document.getElementById("driverFormImage").value.trim(),
            cinImage: document.getElementById("driverFormCinImage").value.trim(),
            adminNotes: document.getElementById("driverFormAdminNotes").value.trim(),
            updatedAt: serverTimestamp()
        };
        try {
            if (fid) {
                await updateDoc(doc(db, "drivers", fid), data);
                showToast("تم التحديث", "success");
            } else {
                data.createdAt = serverTimestamp();
                data.status = "offline";
                data.completedOrdersCount = 0;
                data.totalEarnings = 0;
                data.rating = { average: 0, count: 0 };
                await addDoc(collection(db, "drivers"), data);
                showToast("أضيف", "success");
            }
            closeModal("driverModal");
        } catch { showToast("فشل", "error"); }
    });

    // Driver control
    document.getElementById("driverControlForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fid = document.getElementById("ctrlDriverFirebaseId").value;
        const adminStatus = document.getElementById("ctrlDriverAdminStatus").value;
        const duration = document.getElementById("ctrlDriverSuspendDuration").value;
        const reason = document.getElementById("ctrlDriverReason").value.trim();
        const payload = { adminStatus, adminNotes: reason, updatedAt: serverTimestamp() };
        if (adminStatus === "suspended_temp")
            payload.suspendedUntil = new Date(Date.now() + Number(duration) * 3600 * 1000);
        else payload.suspendedUntil = null;
        if (adminStatus === "suspended_temp" || adminStatus === "banned") {
            payload.status = "offline";
            payload.currentOrderId = null;
        }
        try {
            await updateDoc(doc(db, "drivers", fid), payload);
            showToast("تم", "success");
            closeModal("driverControlModal");
        } catch { showToast("فشل", "error"); }
    });

    // Create auth
    document.getElementById("createAuthForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const driverDocId = document.getElementById("createAuthDriverDocId").value;
        const driverId = document.getElementById("createAuthDriverId").value;
        const password = document.getElementById("createAuthPassword").value;
        const email = document.getElementById("createAuthEmail").value.trim();
        if (!driverDocId || !driverId) return showToast("اختر سائق", "error");
        if (password.length < 8) return showToast("كلمة المرور قصيرة", "error");

        const btn = e.target.querySelector('button[type="submit"]');
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = "جاري الإنشاء...";

        try {
            const result = await createDriverAuthAccount(driverDocId, driverId, password, email);
            const credText = "Driver ID: " + driverId + "\nEmail: " + result.email + "\nPassword: " + password;
            document.getElementById("reviewDetailsContent").innerHTML = `
                <div class="alert alert-success"><div><strong>تم!</strong></div></div>
                <div style="background:#f5f5f5; padding:14px; border-radius:10px; font-family:monospace; font-size:13px; line-height:1.8;">
                    <div><strong>Driver ID:</strong> ${safe(driverId)}</div>
                    <div><strong>Email:</strong> ${safe(result.email)}</div>
                    <div><strong>Password:</strong> ${safe(password)}</div>
                </div>
                <button class="btn-primary w-100 mt-2" onclick="copyToClipboard('${credText.replace(/'/g, "\\'")}')"><i data-lucide="copy"></i> نسخ</button>
            `;
            openModal("reviewDetailsModal");
            closeModal("createAuthModal");
            showToast("تم", "success");
            refreshIcons();
        } catch (err) {
            console.error(err);
            let msg = "فشل";
            if (err.code === "auth/email-already-in-use") msg = "البريد مستخدم";
            else if (err.code === "auth/weak-password") msg = "كلمة المرور ضعيفة";
            showToast(msg, "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = original;
            await cleanupSecondaryApp();
        }
    });

    // Hypermarket
    document.getElementById("hypermarketForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = document.getElementById("hyperId").value;
        const mapping = {};
        document.querySelectorAll("#categoryMappingList .mapping-row").forEach(row => {
            const src = row.querySelector(".source-cat")?.value.trim();
            const tgt = row.querySelector(".target-cat")?.value;
            if (src && tgt) mapping[src] = tgt;
        });
        const data = {
            chain: document.getElementById("hyperChainSelect").value,
            name: document.getElementById("hyperName").value.trim(),
            phone: document.getElementById("hyperPhone").value.trim(),
            city: document.getElementById("hyperCity").value.trim(),
            address: document.getElementById("hyperAddress").value.trim(),
            image: document.getElementById("hyperImage").value.trim(),
            section: "groceries",
            isHypermarket: true,
            sourceUrl: document.getElementById("hyperSourceUrl").value.trim(),
            syncFrequency: document.getElementById("hyperSyncFrequency").value,
            priceMarkup: Number(document.getElementById("hyperPriceMarkup").value || 0),
            currency: "MAD",
            syncEnabled: document.getElementById("hyperSyncEnabled").value === "true",
            categoryMapping: mapping,
            status: "active",
            updatedAt: serverTimestamp()
        };
        try {
            if (id) { await updateDoc(doc(db, "hypermarkets", id), data); showToast("تم التحديث", "success"); }
            else { data.createdAt = serverTimestamp(); data.productsCount = 0; await addDoc(collection(db, "hypermarkets"), data); showToast("تمت الإضافة", "success"); }
            closeModal("hypermarketModal");
        } catch { showToast("فشل", "error"); }
    });

    // Confirm
    document.getElementById("confirmModalActionBtn")?.addEventListener("click", async () => {
        if (!pendingConfirmAction) return;
        const cb = pendingConfirmAction;
        pendingConfirmAction = null;
        try { await cb(); } catch { showToast("فشل", "error"); }
        closeModal("confirmModal");
    });

    // Searches
    document.getElementById("searchRestaurantInput")?.addEventListener("input", renderRestaurantsTable);
    document.getElementById("searchDriverInput")?.addEventListener("input", e => {
        stateCache.driversSearch = e.target.value.toLowerCase().trim();
        renderDriversTable();
    });
    document.getElementById("filterDriverStatus")?.addEventListener("change", e => {
        stateCache.driversStatus = e.target.value;
        renderDriversTable();
    });
    document.getElementById("filterDriverVerification")?.addEventListener("change", e => {
        stateCache.driversVerification = e.target.value;
        renderDriversTable();
    });
    document.getElementById("searchHyperProduct")?.addEventListener("input", e => {
        stateCache.hyperProductsSearch = e.target.value.toLowerCase().trim();
        renderHyperProductsTable();
    });
    document.getElementById("searchOrderInput")?.addEventListener("input", e => {
        stateCache.ordersSearch = e.target.value.toLowerCase().trim();
        stateCache.ordersPage = 1;
        renderOrdersTable();
    });
    document.getElementById("filterOrderStatus")?.addEventListener("change", e => {
        stateCache.ordersStatus = e.target.value;
        stateCache.ordersPage = 1;
        renderOrdersTable();
    });
}


/* ═══ FORM HANDLERS (Zones/Coupons/Offers/Banners) ═══ */
document.getElementById("zoneForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
        await addDoc(collection(db, "zones"), {
            name: document.getElementById("zoneName").value.trim(),
            city: document.getElementById("zoneCity").value.trim(),
            deliveryFee: Number(document.getElementById("zoneFee").value || 0),
            active: true,
            createdAt: serverTimestamp()
        });
        showToast("تم", "success");
        closeModal("zoneModal");
        e.target.reset();
    } catch { showToast("فشل", "error"); }
});

document.getElementById("couponForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
        await addDoc(collection(db, "coupons"), {
            code: document.getElementById("couponCode").value.trim().toUpperCase(),
            value: Number(document.getElementById("couponValue").value),
            usedCount: 0, active: true, createdAt: serverTimestamp()
        });
        showToast("تم", "success");
        closeModal("couponModal");
        e.target.reset();
    } catch { showToast("فشل", "error"); }
});

document.getElementById("offerForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const rid = document.getElementById("offerRestSelect").value;
    const rest = stateCache.restaurants.find(r => r.id === rid);
    try {
        await addDoc(collection(db, "offers"), {
            title: document.getElementById("offerTitle").value.trim(),
            restaurantId: rid,
            restaurantName: rest?.name || "",
            discountValue: Number(document.getElementById("offerDiscount").value),
            image: document.getElementById("offerImage").value.trim(),
            active: true,
            createdAt: serverTimestamp()
        });
        showToast("تم", "success");
        closeModal("offerModal");
        e.target.reset();
    } catch { showToast("فشل", "error"); }
});

document.getElementById("bannerForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
        await addDoc(collection(db, "banners"), {
            title: document.getElementById("bannerTitle").value.trim(),
            subtitle: document.getElementById("bannerSub").value.trim(),
            image: document.getElementById("bannerImage").value.trim(),
            active: true,
            createdAt: serverTimestamp()
        });
        showToast("تم", "success");
        closeModal("bannerModal");
        e.target.reset();
    } catch { showToast("فشل", "error"); }
});

/* ═══════════════════════════════════════════════════════
   💰 EARNINGS SYSTEM — النظام المالي
═══════════════════════════════════════════════════════ */

// إعدادات الدفع
const PAYMENT_CONFIG = {
    basePerDelivery: 10,        // د.م لكل توصيل
    bonus10Deliveries: 30,      // مكافأة 10+ توصيلات/يوم
    bonus20Deliveries: 100,     // مكافأة 20+ توصيلات/يوم
    bonusRating: 50,            // مكافأة تقييم 4.8+
    latePenalty: 5,             // خصم تأخير
    cancelPenalty: 10           // خصم إلغاء
};

function getPeriodStart(period) {
    const now = new Date();
    if (period === "today") {
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    if (period === "week") {
        const day = now.getDay();
        const diff = now.getDate() - day;
        return new Date(now.getFullYear(), now.getMonth(), diff);
    }
    if (period === "month") {
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return new Date(0); // all time
}

// حساب أرباح السائق
function calculateDriverEarnings(driverId, period = "all") {
    const periodStart = getPeriodStart(period);

    const earnings = stateCache.driverEarnings.filter(e => {
        if (e.driverId !== driverId) return false;
        const createdAt = e.createdAt?.toDate?.();
        if (!createdAt || createdAt < periodStart) return false;
        return true;
    });

    const total = earnings.reduce((s, e) => s + Number(e.amount || 0), 0);
    const paid = earnings.filter(e => e.status === "paid").reduce((s, e) => s + Number(e.amount || 0), 0);
    const pending = total - paid;

    return {
        deliveries: earnings.length,
        total: total,
        paid: paid,
        pending: pending,
        earnings: earnings
    };
}

window.renderEarnings = function () {
    const tbody = document.getElementById("earningsTableBody");
    if (!tbody) return;

    const search = document.getElementById("searchEarningsInput")?.value.toLowerCase().trim() || "";
    const period = document.getElementById("filterEarningsPeriod")?.value || "all";

    let drivers = stateCache.drivers.filter(d => {
        if (!search) return true;
        return (d.name || "").toLowerCase().includes(search) ||
               (d.driverId || "").toLowerCase().includes(search);
    });

    // احسب الأرباح لكل سائق
    const driversWithEarnings = drivers.map(d => ({
        driver: d,
        ...calculateDriverEarnings(d.id, period)
    })).filter(x => x.deliveries > 0 || x.driver.uid);

    if (!driversWithEarnings.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center empty-state"><p>لا توجد بيانات أرباح</p></td></tr>`;
        updateEarningsStats();
        return;
    }

    tbody.innerHTML = driversWithEarnings.map(({ driver, deliveries, total, paid, pending }) => {
        const lastEarning = stateCache.driverEarnings
            .filter(e => e.driverId === driver.id && e.status === "paid")
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))[0];

        return `
            <tr>
                <td>
                    <div class="driver-cell">
                        <img src="${safeAttr(driver.image || 'https://via.placeholder.com/40')}" class="img-thumb" onerror="this.src='https://via.placeholder.com/40'">
                        <div><strong>${safe(driver.name)}</strong></div>
                    </div>
                </td>
                <td><span class="order-id">${safe(driver.driverId)}</span></td>
                <td><strong>${deliveries}</strong></td>
                <td>${total.toFixed(2)} د.م</td>
                <td style="color:var(--success);">${paid.toFixed(2)} د.م</td>
                <td style="color:${pending > 0 ? 'var(--warning)' : 'var(--text-muted)'}; font-weight:900;">
                    ${pending.toFixed(2)} د.م
                </td>
                <td><small>${lastEarning?.createdAt?.toDate ? formatRelativeTime(lastEarning.createdAt.toDate()) : "—"}</small></td>
                <td>
                    <button class="btn-sm btn-primary" onclick="openPaymentForDriver('${driver.id}')" title="دفع">
                        <i data-lucide="banknote"></i>
                    </button>
                    <button class="btn-sm btn-secondary" onclick="openDriverDetails('${driver.id}')" title="تفاصيل">
                        <i data-lucide="eye"></i>
                    </button>
                </td>
            </tr>`;
    }).join("");

    refreshIcons();
    updateEarningsStats();
};

function updateEarningsStats() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthEarnings = stateCache.driverEarnings.filter(e => {
        const createdAt = e.createdAt?.toDate?.();
        return createdAt && createdAt >= monthStart;
    });

    const totalMonth = monthEarnings.reduce((s, e) => s + Number(e.amount || 0), 0);
    const paid = monthEarnings.filter(e => e.status === "paid").reduce((s, e) => s + Number(e.amount || 0), 0);
    const pending = totalMonth - paid;

    setText("earnStatTotalMonth", totalMonth.toFixed(2) + " د.م");
    setText("earnStatPaid", paid.toFixed(2) + " د.م");
    setText("earnStatPending", pending.toFixed(2) + " د.م");
    setText("earnStatCount", monthEarnings.filter(e => e.status === "paid").length);
}

// عرض سجل الدفعات
function renderPaymentHistory() {
    const tbody = document.getElementById("paymentsHistoryBody");
    if (!tbody) return;

    const payments = stateCache.driverEarnings
        .filter(e => e.status === "paid" && e.paymentId)
        .sort((a, b) => (b.paidAt?.toMillis?.() || 0) - (a.paidAt?.toMillis?.() || 0))
        .slice(0, 50);

    if (!payments.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center empty-state"><p>لا توجد دفعات</p></td></tr>`;
        return;
    }

    tbody.innerHTML = payments.map(p => `
        <tr>
            <td><small>${p.paidAt?.toDate ? p.paidAt.toDate().toLocaleString("ar-MA") : "-"}</small></td>
            <td>${safe(p.driverName)}</td>
            <td><strong style="color:var(--success);">${Number(p.amount || 0).toFixed(2)} د.م</strong></td>
            <td><span class="badge badge-gray">${safe(p.period || "all")}</span></td>
            <td>${p.paymentMethod === "cash" ? "💵 نقدي" : p.paymentMethod === "bank" ? "🏦 تحويل" : "📱 محفظة"}</td>
            <td><small>${safe(p.paidBy || "Admin")}</small></td>
            <td><small>${safe(p.notes || "-")}</small></td>
        </tr>
    `).join("");
}

// فتح modal الدفع
window.openPaymentModal = function () {
    const sel = document.getElementById("payDriverSelect");
    if (sel) {
        sel.innerHTML = `<option value="">-- اختر سائق --</option>` +
            stateCache.drivers.map(d => `<option value="${d.id}">${safe(d.name)} - ${safe(d.driverId)}</option>`).join("");
    }
    document.getElementById("paySummaryBox").innerHTML = `
        <i data-lucide="info"></i>
        <div><strong>اختر سائقاً لعرض المستحقات</strong></div>`;
    setValue("payAmount", "");
    setValue("payNotes", "");
    setValue("payReference", "");
    openModal("paymentModal");
};

window.openPaymentForDriver = function (driverId) {
    openPaymentModal();
    setValue("payDriverSelect", driverId);
    updatePaymentSummary();
};

window.updatePaymentSummary = updatePaymentSummary;
function updatePaymentSummary() {
    const driverId = document.getElementById("payDriverSelect").value;
    const period = document.getElementById("payPeriod").value;
    const box = document.getElementById("paySummaryBox");
    if (!box) return;

    if (!driverId) {
        box.innerHTML = `<i data-lucide="info"></i><div>اختر سائقاً أولاً</div>`;
        refreshIcons();
        return;
    }

    const summary = calculateDriverEarnings(driverId, period);
    const driver = stateCache.drivers.find(d => d.id === driverId);

    box.className = "alert alert-success";
    box.innerHTML = `
        <i data-lucide="check-circle"></i>
        <div style="width:100%;">
            <strong>${safe(driver?.name)}</strong><br>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-top:8px;">
                <div><small>التوصيلات:</small><br><strong>${summary.deliveries}</strong></div>
                <div><small>الإجمالي:</small><br><strong>${summary.total.toFixed(2)}</strong></div>
                <div><small>المتبقي:</small><br><strong style="color:var(--warning);">${summary.pending.toFixed(2)} د.م</strong></div>
            </div>
        </div>
    `;
    refreshIcons();

    // املأ المبلغ تلقائياً
    setValue("payAmount", summary.pending.toFixed(2));
}

// تسجيل دفعة
document.getElementById("paymentForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const driverId = document.getElementById("payDriverSelect").value;
    const period = document.getElementById("payPeriod").value;
    const amount = Number(document.getElementById("payAmount").value);
    const method = document.getElementById("payMethod").value;
    const reference = document.getElementById("payReference").value.trim();
    const notes = document.getElementById("payNotes").value.trim();

    if (!driverId) return showToast("اختر سائقاً", "error");
    if (amount <= 0) return showToast("المبلغ يجب أن يكون أكبر من 0", "error");

    const driver = stateCache.drivers.find(d => d.id === driverId);
    const summary = calculateDriverEarnings(driverId, period);

    if (amount > summary.pending + 0.01) {
        if (!confirm(`المبلغ (${amount}) أكبر من المستحق (${summary.pending.toFixed(2)}). متابعة؟`)) return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "جاري التسجيل...";

    try {
        const periodStart = getPeriodStart(period);

        // ابحث عن كل الأرباح المعلقة
        const pendingEarnings = stateCache.driverEarnings.filter(eg => {
            if (eg.driverId !== driverId) return false;
            if (eg.status === "paid") return false;
            const createdAt = eg.createdAt?.toDate?.();
            if (!createdAt || createdAt < periodStart) return false;
            return true;
        });

        const batch = writeBatch(db);
        const paymentId = "PAY-" + Date.now();
        let remaining = amount;

        // حدّث كل earning
        for (const eg of pendingEarnings) {
            const egAmount = Number(eg.amount || 0);
            if (remaining >= egAmount) {
                batch.update(doc(db, "driver_earnings", eg.id), {
                    status: "paid",
                    paymentId: paymentId,
                    paidAt: serverTimestamp(),
                    paidBy: stateCache.adminName || "Admin",
                    paymentMethod: method,
                    period: period,
                    notes: notes
                });
                remaining -= egAmount;
            }
            if (remaining <= 0) break;
        }

        await batch.commit();

        // سجل الدفعة
        await addDoc(collection(db, "admin_audit"), {
            adminName: stateCache.adminName,
            adminEmail: stateCache.adminEmail,
            action: "driver_payment",
            targetType: "driver",
            targetId: driverId,
            details: { amount, method, period, reference, notes, driverName: driver?.name },
            createdAt: serverTimestamp()
        });

        showToast(`✅ تم تسجيل دفعة ${amount.toFixed(2)} د.م لـ ${driver?.name}`, "success");
        closeModal("paymentModal");
        renderEarnings();
        renderPaymentHistory();
    } catch (err) {
        console.error(err);
        showToast("فشل: " + err.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
    }
});

// ربط الأحداث
document.getElementById("payDriverSelect")?.addEventListener("change", updatePaymentSummary);
document.getElementById("payPeriod")?.addEventListener("change", updatePaymentSummary);
document.getElementById("searchEarningsInput")?.addEventListener("input", renderEarnings);
document.getElementById("filterEarningsPeriod")?.addEventListener("change", renderEarnings);
document.getElementById("filterEarningsStatus")?.addEventListener("change", renderEarnings);

// تصدير CSV
window.exportEarningsCSV = function () {
    const rows = [["السائق", "Driver ID", "التوصيلات", "الإجمالي", "المدفوع", "المتبقي", "الفترة"]];

    stateCache.drivers.forEach(d => {
        const summary = calculateDriverEarnings(d.id, "all");
        if (summary.deliveries === 0) return;
        rows.push([
            d.name || "",
            d.driverId || "",
            summary.deliveries,
            summary.total.toFixed(2),
            summary.paid.toFixed(2),
            summary.pending.toFixed(2),
            "كل الفترات"
        ]);
    });

    const csv = "\uFEFF" + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "earnings_" + new Date().toISOString().slice(0, 10) + ".csv";
    link.click();
    showToast("تم التصدير", "success");
};


/* ═══════════════════════════════════════════════════════
   👤 DRIVER DETAILS MODAL
═══════════════════════════════════════════════════════ */
window.openDriverDetails = function (driverId) {
    const driver = stateCache.drivers.find(d => d.id === driverId);
    if (!driver) return;

    const earnings = calculateDriverEarnings(driverId, "all");
    const reviews = stateCache.driverReviews.filter(r => r.driverId === driverId);
    const orders = stateCache.orders.filter(o => o.driverId === driverId);
    const completedOrders = orders.filter(o => o.status === "delivered");

    setText("ddTitle", driver.name || "سائق");
    setText("ddId", `${driver.driverId} • ${driver.phone || ""}`);

    const avgRating = reviews.length
        ? (reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / reviews.length).toFixed(2)
        : "—";

    document.getElementById("ddContent").innerHTML = `
        <!-- Header -->
        <div style="display:flex; gap:14px; align-items:center; padding:16px; background:var(--bg-body); border-radius:12px; margin-bottom:16px;">
            <img src="${safeAttr(driver.image || 'https://via.placeholder.com/80')}" style="width:80px;height:80px;border-radius:50%;border:4px solid var(--primary);object-fit:cover;">
            <div style="flex:1;">
                <h3 style="margin-bottom:4px;">${safe(driver.name)}</h3>
                <p style="color:var(--text-muted); font-size:13px;">${safe(driver.driverId)} • ${safe(driver.phone)}</p>
                <p style="margin-top:6px;">${driverStatusBadge(computeDriverLiveStatus(driver))}</p>
            </div>
        </div>

        <!-- Stats Grid -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; margin-bottom:16px;">
            <div style="background:var(--bg-body); padding:14px; border-radius:10px; text-align:center;">
                <div style="font-size:11px; color:var(--text-muted); font-weight:800; text-transform:uppercase;">التوصيلات</div>
                <div style="font-size:22px; font-weight:900; color:var(--primary);">${completedOrders.length}</div>
            </div>
            <div style="background:var(--bg-body); padding:14px; border-radius:10px; text-align:center;">
                <div style="font-size:11px; color:var(--text-muted); font-weight:800; text-transform:uppercase;">التقييم</div>
                <div style="font-size:22px; font-weight:900; color:#F59E0B;">⭐ ${avgRating}</div>
            </div>
            <div style="background:var(--bg-body); padding:14px; border-radius:10px; text-align:center;">
                <div style="font-size:11px; color:var(--text-muted); font-weight:800; text-transform:uppercase;">الإجمالي</div>
                <div style="font-size:22px; font-weight:900; color:var(--success);">${earnings.total.toFixed(0)}</div>
                <div style="font-size:10px; color:var(--text-muted);">د.م</div>
            </div>
            <div style="background:var(--bg-body); padding:14px; border-radius:10px; text-align:center;">
                <div style="font-size:11px; color:var(--text-muted); font-weight:800; text-transform:uppercase;">المتبقي</div>
                <div style="font-size:22px; font-weight:900; color:var(--warning);">${earnings.pending.toFixed(0)}</div>
                <div style="font-size:10px; color:var(--text-muted);">د.م</div>
            </div>
        </div>

        <!-- Info -->
        <div class="order-details-grid" style="margin-bottom:16px;">
            <div class="detail-row"><span>البريد:</span><strong>${safe(driver.email || "—")}</strong></div>
            <div class="detail-row"><span>المركبة:</span><strong>${vehicleLabel(driver.vehicle)}</strong></div>
            <div class="detail-row"><span>اللوحة:</span><strong>${safe(driver.plate || "—")}</strong></div>
            <div class="detail-row"><span>التوثيق:</span><strong>${driver.verificationStatus === "verified" ? "✅ موثق" : "⏳"}</strong></div>
            <div class="detail-row"><span>آخر نشاط:</span><strong>${driver.lastHeartbeat?.toDate ? formatRelativeTime(driver.lastHeartbeat.toDate()) : "—"}</strong></div>
            <div class="detail-row"><span>عدد التقييمات:</span><strong>${reviews.length}</strong></div>
        </div>

        <!-- Documents -->
        ${driver.cinImage || driver.image ? `
            <h4 style="margin-bottom:8px;">📄 الوثائق</h4>
            <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:10px; margin-bottom:16px;">
                ${driver.image ? `<a href="${safeAttr(driver.image)}" target="_blank" style="text-decoration:none; background:var(--bg-body); padding:10px; border-radius:10px; text-align:center;">
                    <img src="${safeAttr(driver.image)}" style="width:100%; height:80px; object-fit:cover; border-radius:6px;">
                    <div style="font-size:11px; margin-top:4px; color:var(--text-muted); font-weight:700;">الصورة</div>
                </a>` : ""}
                ${driver.cinImage ? `<a href="${safeAttr(driver.cinImage)}" target="_blank" style="text-decoration:none; background:var(--bg-body); padding:10px; border-radius:10px; text-align:center;">
                    <img src="${safeAttr(driver.cinImage)}" style="width:100%; height:80px; object-fit:cover; border-radius:6px;">
                    <div style="font-size:11px; margin-top:4px; color:var(--text-muted); font-weight:700;">CIN</div>
                </a>` : ""}
            </div>
        ` : ""}

        <!-- Recent Orders -->
        <h4 style="margin-bottom:8px;">📋 آخر 10 طلبات</h4>
        <div style="background:var(--bg-body); border-radius:10px; padding:12px; max-height:250px; overflow-y:auto; margin-bottom:16px;">
            ${completedOrders.slice(0, 10).map(o => `
                <div style="display:flex; justify-content:space-between; padding:8px 4px; border-bottom:1px solid var(--border-light); font-size:13px;">
                    <span><span class="order-id">#${o.id.substring(0,6)}</span> ${safe(o.customerName || "عميل")}</span>
                    <strong>${Number(o.totalAmount ?? o.total ?? 0).toFixed(2)} د.م</strong>
                </div>
            `).join("") || "<p style='text-align:center; color:#888; padding:20px;'>لا توجد طلبات</p>"}
        </div>

        <!-- Recent Reviews -->
        <h4 style="margin-bottom:8px;">⭐ آخر التقييمات</h4>
        <div style="background:var(--bg-body); border-radius:10px; padding:12px; max-height:200px; overflow-y:auto;">
            ${reviews.slice(0, 5).map(r => `
                <div style="padding:8px; border-bottom:1px solid var(--border-light);">
                    <div style="display:flex; justify-content:space-between; font-size:13px;">
                        <strong>${safe(r.customerName || "عميل")}</strong>
                        <span>${"⭐".repeat(r.rating)}</span>
                    </div>
                    ${r.feedback ? `<p style="font-size:12px; color:var(--text-muted); margin-top:4px;">${safe(r.feedback)}</p>` : ""}
                </div>
            `).join("") || "<p style='text-align:center; color:#888; padding:20px;'>لا توجد تقييمات</p>"}
        </div>
    `;

    openModal("driverDetailsModal");
};


/* ═══════════════════════════════════════════════════════
   📊 ANALYTICS
═══════════════════════════════════════════════════════ */
window.renderAnalytics = function () {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthOrders = stateCache.orders.filter(o => {
        const d = o.createdAt?.toDate?.();
        return d && d >= monthStart;
    });

    // Completion rate
    const completed = monthOrders.filter(o => o.status === "delivered").length;
    const total = monthOrders.length || 1;
    setText("anaCompletionRate", Math.round(completed / total * 100) + "%");

    // Avg order value
    const avgValue = monthOrders.reduce((s, o) => s + Number(o.totalAmount ?? o.total ?? 0), 0) / total;
    setText("anaAvgOrderValue", avgValue.toFixed(2) + " د.م");

    // Avg delivery time
    const deliveredOrders = monthOrders.filter(o => o.status === "delivered" && o.deliveredAt?.toDate && o.createdAt?.toDate);
    const avgTime = deliveredOrders.length
        ? deliveredOrders.reduce((s, o) => s + (o.deliveredAt.toDate() - o.createdAt.toDate()), 0) / deliveredOrders.length / 60000
        : 0;
    setText("anaAvgDeliveryTime", Math.round(avgTime) + " د");

    // Repeat rate
    const customerCounts = {};
    stateCache.orders.forEach(o => {
        if (o.customerPhone) customerCounts[o.customerPhone] = (customerCounts[o.customerPhone] || 0) + 1;
    });
    const totalCustomers = Object.keys(customerCounts).length || 1;
    const repeatCustomers = Object.values(customerCounts).filter(c => c > 1).length;
    setText("anaRepeatRate", Math.round(repeatCustomers / totalCustomers * 100) + "%");

    // Week chart
    const weekCanvas = document.getElementById("analyticsWeekChart");
    if (weekCanvas && typeof Chart !== "undefined") {
        const days = [];
        const counts = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            days.push(d.toLocaleDateString("ar-MA", { weekday: "short" }));
            counts.push(stateCache.orders.filter(o => {
                const od = o.createdAt?.toDate?.();
                return od && od.getDate() === d.getDate() && od.getMonth() === d.getMonth();
            }).length);
        }

        if (window.analyticsChart) window.analyticsChart.destroy();
        window.analyticsChart = new Chart(weekCanvas, {
            type: "bar",
            data: {
                labels: days,
                datasets: [{
                    label: "الطلبات",
                    data: counts,
                    backgroundColor: "#FF7A00",
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        });
    }

    // Top drivers
    const driverStats = stateCache.drivers.map(d => ({
        driver: d,
        deliveries: stateCache.orders.filter(o => o.driverId === d.id && o.status === "delivered").length,
        earnings: stateCache.driverEarnings.filter(e => e.driverId === d.id).reduce((s, e) => s + Number(e.amount || 0), 0)
    })).filter(x => x.deliveries > 0).sort((a, b) => b.deliveries - a.deliveries).slice(0, 5);

    const topList = document.getElementById("topDriversList");
    if (topList) {
        topList.innerHTML = driverStats.map((x, i) => `
            <div style="display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid var(--border-light);">
                <div style="font-size:20px; width:30px;">${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "#" + (i+1)}</div>
                <img src="${safeAttr(x.driver.image || 'https://via.placeholder.com/36')}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">
                <div style="flex:1;">
                    <strong style="font-size:13px;">${safe(x.driver.name)}</strong><br>
                    <small style="color:var(--text-muted);">${x.deliveries} توصيل • ${x.earnings.toFixed(0)} د.م</small>
                </div>
            </div>
        `).join("") || "<p style='text-align:center; color:#888; padding:20px;'>لا توجد بيانات</p>";
    }

    // Top restaurants
    const restStats = stateCache.restaurants.map(r => ({
        rest: r,
        orders: stateCache.orders.filter(o => (o.restaurantName === r.name) && o.status === "delivered").length,
        revenue: stateCache.orders.filter(o => o.restaurantName === r.name && o.status === "delivered").reduce((s, o) => s + Number(o.totalAmount ?? 0), 0),
        rating: r.ratingStats?.average || 0
    })).filter(x => x.orders > 0).sort((a, b) => b.orders - a.orders).slice(0, 10);

    const restBody = document.getElementById("topRestaurantsBody");
    if (restBody) {
        restBody.innerHTML = restStats.map((x, i) => `
            <tr>
                <td><strong>#${i+1}</strong></td>
                <td>${safe(x.rest.name)}</td>
                <td><strong>${x.orders}</strong></td>
                <td>${x.revenue.toFixed(2)} د.م</td>
                <td>⭐ ${x.rating.toFixed(1)}</td>
            </tr>
        `).join("") || `<tr><td colspan="5" class="text-center empty-state"><p>لا توجد بيانات</p></td></tr>`;
    }
};


/* ═══════════════════════════════════════════════════════
   HOOK INTO switchTab
═══════════════════════════════════════════════════════ */
const _originalSwitchTab = window.switchTab;
window.switchTab = function (tabName) {
    _originalSwitchTab(tabName);
    if (tabName === "earnings") {
        setTimeout(() => { renderEarnings(); renderPaymentHistory(); }, 100);
    }
    if (tabName === "analytics") {
        setTimeout(renderAnalytics, 200);
    }
};
/* ═══ BOOT ═══ */
document.addEventListener("DOMContentLoaded", () => {
    console.log("🚀 DOM ready");
    refreshIcons();
    setTimeout(refreshIcons, 300);

    setupNavigation();
    setupCategoryTabs();
    setupForms();
    initAuth();

    console.log("✅ admin.js v9.0 جاهز — Auto-Dispatch + Map + Earnings");
});