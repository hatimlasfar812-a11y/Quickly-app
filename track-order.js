/* =====================================================
   QUICKLY — Track Order
   Statut réel + Carte (restaurant / client / livreur)
===================================================== */

import { db, auth } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

/* ===== CONSTANTES (estimation basée sur la vraie distance) ===== */
const SPEED_KMH = 22;          // vitesse moyenne d'un livreur en ville
const ROAD_FACTOR = 1.3;       // la route est plus longue que la ligne droite
const PREP_MINUTES = 15;       // temps de préparation par défaut
const PICKUP_BUFFER = 5;       // temps pour que le livreur récupère la commande
const STALE_SECONDS = 120;     // on ignore une position plus vieille que 2 min
const OVERDUE_MINUTES = 120;   // au-delà: on n'affiche plus d'estimation

/* ===== STATE ===== */
let orderId = null;
let orderData = null;
let currentUser = null;

let unsubscribeOrder = null;
let unsubscribeDriver = null;
let trackedDriverId = null;
let driverProfile = null;
let locFromOrder = null;
let locFromDoc = null;
let driverLoc = null;
let etaTimer = null;
let selectedRating = 0;
let started = false;

let place = null;          // restaurant / boutique
let placeKey = "";

let map = null;
let customerMarker = null;
let placeMarker = null;
let driverMarker = null;
let fitSig = "";

/* ===== DOM ===== */
const $ = id => document.getElementById(id);

const loader = $("appLoader");
const mainHeader = $("mainHeader");
const mapEl = $("map");
const bottomSheet = $("bottomSheet");
const errorState = $("errorState");
const recenterBtn = $("recenterBtn");

/* ===== ICONS ===== */
function refreshIcons() {
  if (window.lucide?.createIcons) {
    try { window.lucide.createIcons(); } catch (_) { /* ignore */ }
  }
}

/* ===== TOAST ===== */
function showToast(message, type = "success") {
  const container = $("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const icon = document.createElement("i");
  icon.setAttribute("data-lucide", type === "success" ? "circle-check" : "circle-alert");

  const text = document.createElement("span");
  text.textContent = message;

  toast.append(icon, text);
  container.appendChild(toast);
  refreshIcons();

  setTimeout(() => {
    toast.style.transition = "opacity .3s";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ===== HELPERS ===== */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function formatTime(date) {
  if (!date) return "";
  return date.toLocaleTimeString("ar-MA", { hour: "2-digit", minute: "2-digit" });
}

function validCoords(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0);
}

// distance en km (formule de Haversine) entre deux points {lat,lng}
function distanceKm(a, b) {
  const R = 6371, rad = x => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatKm(km) {
  return km < 1 ? Math.max(50, Math.round(km * 1000 / 10) * 10) + " م" : km.toFixed(1) + " كم";
}

function travelMinutes(km) {
  return Math.ceil((km * ROAD_FACTOR / SPEED_KMH) * 60) + 1;
}

// يحوّل 06XXXXXXXX إلى صيغة دولية مناسبة لروابط واتساب
function toIntlPhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = "212" + digits.slice(1);
  return digits;
}

/* ===== STATUS CONFIG ===== */
const STATUS_ALIASES = {
  pending: "pending", new: "pending",
  confirmed: "confirmed",
  preparing: "preparing",
  ready: "ready",
  assigned: "assigned", "driver assigned": "assigned", driver_assigned: "assigned",
  accepted: "accepted",
  picked_up: "picked_up", "picked up": "picked_up",
  on_the_way: "on_the_way", "on the way": "on_the_way", ontheway: "on_the_way", onway: "on_the_way",
  delivered: "delivered", completed: "delivered",
  cancelled: "cancelled", canceled: "cancelled",
  rejected: "rejected"
};

function normalizeStatus(raw) {
  return STATUS_ALIASES[String(raw || "").trim().toLowerCase()] || "pending";
}

const STATUS_CONFIG = {
  pending:    { title: "تم استلام طلبك",            subtitle: "جاري تأكيد الطلب",            badge: "قيد المراجعة", step: 0 },
  confirmed:  { title: "تم تأكيد طلبك",            subtitle: "المطعم سيبدأ التحضير قريباً", badge: "مؤكد",         step: 1 },
  preparing:  { title: "جاري التحضير",             subtitle: "المطعم يحضر طلبك الآن",       badge: "قيد التحضير",  step: 1 },
  ready:      { title: "الطلب جاهز",               subtitle: "في انتظار السائق",            badge: "جاهز",         step: 2 },
  assigned:   { title: "تم تعيين السائق",          subtitle: "سيتوجه للمطعم قريباً",        badge: "معيّن",        step: 2 },
  accepted:   { title: "السائق في الطريق للمطعم",  subtitle: "سيستلم طلبك قريباً",          badge: "في الطريق",    step: 2 },
  picked_up:  { title: "تم استلام طلبك",           subtitle: "السائق في الطريق إليك",       badge: "مع السائق",    step: 3 },
  on_the_way: { title: "السائق في الطريق إليك",    subtitle: "يصل خلال دقائق",              badge: "في الطريق",    step: 3 },
  delivered:  { title: "تم التسليم بنجاح",         subtitle: "بالهناء والشفاء!",            badge: "مكتمل",        step: 4 },
  cancelled:  { title: "تم إلغاء الطلب",           subtitle: "نأسف لذلك",                   badge: "ملغي",         step: -1 },
  rejected:   { title: "تم رفض الطلب",             subtitle: "المطعم غير قادر على التحضير", badge: "مرفوض",        step: -1 }
};

const TIMELINE_STEPS = [
  { key: "pending",    title: "تم استلام الطلب", icon: "clipboard-check", fields: ["createdAt"] },
  { key: "preparing",  title: "جاري التحضير",    icon: "chef-hat",        fields: ["preparingAt", "confirmedAt"] },
  { key: "on_the_way", title: "في الطريق",       icon: "bike",            fields: ["on_the_wayAt", "onTheWayAt", "pickedUpAt", "picked_upAt"] },
  { key: "delivered",  title: "تم التسليم",      icon: "house",           fields: ["deliveredAt"] }
];

// الحالات التي يكون فيها السائق مرتبطاً فعلاً بهذا الطلب
const DRIVER_STATUSES = ["assigned", "accepted", "picked_up", "on_the_way"];
const TO_CUSTOMER_STATUSES = ["picked_up", "on_the_way"];

const isTerminal = status => ["delivered", "cancelled", "rejected"].includes(status);
const getStatus = () => normalizeStatus(orderData?.status);
const getConfig = () => STATUS_CONFIG[getStatus()];

function driverIsOnThisOrder() {
  return !!(orderData?.driverId || orderData?.driverName) &&
    DRIVER_STATUSES.includes(getStatus());
}

/* ===== COORDS ===== */
function getCustomerCoords() {
  const lat = Number(orderData?.latitude ?? orderData?.customerLat ?? orderData?.location?.lat ?? orderData?.location?.latitude);
  const lng = Number(orderData?.longitude ?? orderData?.customerLng ?? orderData?.location?.lng ?? orderData?.location?.longitude);
  return validCoords(lat, lng) ? { lat, lng } : null;
}

function getPlaceCoords() {
  return place && validCoords(place.lat, place.lng) ? { lat: place.lat, lng: place.lng } : null;
}

/* ===== RESTAURANT / STORE (من قاعدة البيانات الحقيقية) ===== */
async function loadPlace() {
  const id = orderData.storeId || orderData.restaurantId;
  if (!id) return;

  const col = orderData.storeId ? "stores" : "restaurants";
  const key = col + "/" + id;
  if (key === placeKey) return;
  placeKey = key;

  try {
    const snap = await getDoc(doc(db, col, id));
    if (!snap.exists()) { place = null; renderPlace(); return; }

    const p = snap.data();
    place = {
      name: p.name || "",
      lat: Number(p.lat ?? p.latitude),
      lng: Number(p.lng ?? p.longitude),
      deliveryTime: p.deliveryTime || ""
    };
  } catch (err) {
    console.warn("Place load:", err);
    place = null;
  }

  renderHeader();
  renderPlace();
  ensureMap();
  renderETA();
}

/* ===== ETA (حساب حقيقي من المسافة) ===== */
function parseMinutes(text, fallback) {
  const nums = String(text || "").match(/\d+/g);
  return nums ? Math.max(...nums.map(Number)) : fallback;
}

function calculateETA() {
  const status = getStatus();
  if (isTerminal(status)) return { minutes: 0, progress: 100, note: "" };

  const customer = getCustomerCoords();
  const placePt = getPlaceCoords();
  const created = toDate(orderData.createdAt);
  const elapsed = created ? (Date.now() - created.getTime()) / 60000 : 0;

  if (elapsed > OVERDUE_MINUTES) {
    return { minutes: null, progress: 95, note: "الطلب يستغرق وقتاً أطول من المعتاد، تواصل مع الدعم" };
  }

  let remaining = null;
  let note = "";

  if (driverLoc && customer && TO_CUSTOMER_STATUSES.includes(status)) {
    // السائق يحمل الطلب: المسافة الحقيقية بينه وبين العميل
    const km = distanceKm(driverLoc, customer);
    remaining = travelMinutes(km);
    note = "السائق يبعد عنك " + formatKm(km);
  } else if (placePt && customer) {
    const km = distanceKm(placePt, customer);
    const travel = travelMinutes(km);
    const before = ["pending", "confirmed", "preparing"].includes(status);
    const wait = before ? Math.max(PREP_MINUTES - elapsed, 0) + PICKUP_BUFFER : PICKUP_BUFFER;
    remaining = Math.ceil(wait + travel);
    note = "المسافة بين المطعم وعنوانك " + formatKm(km);
  } else {
    const total = parseMinutes(place?.deliveryTime, 0);
    if (total > 0) remaining = Math.ceil(total - elapsed);
  }

  if (remaining === null || remaining <= 0) {
    return { minutes: null, progress: 95, note };
  }

  remaining = Math.max(2, remaining);
  const progress = Math.min(95, Math.round((elapsed / (elapsed + remaining)) * 100));
  return { minutes: remaining, progress, note };
}

/* ===== RENDER ===== */
function renderHeader() {
  const cfg = getConfig();
  const status = getStatus();

  $("restaurantName").textContent =
    place?.name || orderData.restaurantName || orderData.storeName || "المطعم";
  $("orderStatus").textContent = cfg.subtitle;
  $("orderNumber").textContent = "#" + String(orderData.orderNumber || orderData.id).substring(0, 8).toUpperCase();
  $("statusBadgeText").textContent = cfg.badge;

  const badge = $("statusBadge");
  badge.classList.toggle("is-delivered", status === "delivered");
  badge.classList.toggle("is-cancelled", status === "cancelled" || status === "rejected");
}

function renderETA() {
  if (!orderData) return;
  const { minutes, progress, note } = calculateETA();

  $("etaMinutes").textContent = minutes === null ? "—" : minutes;
  $("etaUnit").classList.toggle("hidden", minutes === null);
  $("etaFill").style.width = progress + "%";

  const noteEl = $("etaNote");
  noteEl.textContent = note;
  noteEl.classList.toggle("hidden", !note);
}

function stepSubtitle(step, state) {
  const date = step.fields.map(f => toDate(orderData[f])).find(Boolean);
  const time = formatTime(date);

  if (state === "completed") return time ? "تم في " + time : "تم";
  if (state === "active") return time ? "بدأ في " + time : "الآن";
  return "قيد الانتظار";
}

function renderTimeline() {
  const currentStep = getConfig().step;

  $("timeline").innerHTML = TIMELINE_STEPS.map((step, i) => {
    const state = currentStep > i ? "completed" : currentStep === i ? "active" : "";

    return `
      <div class="step ${state}">
        <div class="step-circle">
          <i data-lucide="${state === "completed" ? "check" : step.icon}"></i>
        </div>
        <div class="step-body">
          <span>${escapeHtml(step.title)}</span>
          <small>${escapeHtml(stepSubtitle(step, state))}</small>
        </div>
      </div>`;
  }).join("");
}

function renderStatusBlocks() {
  const status = getStatus();
  const cancelled = status === "cancelled" || status === "rejected";

  $("cancelledBox").classList.toggle("hidden", !cancelled);
  if (cancelled) $("cancelledTitle").textContent = getConfig().title;

  $("timeline").classList.toggle("hidden", cancelled);
  $("etaCard").classList.toggle("hidden", cancelled || status === "delivered");
}

function renderDriver() {
  const card = $("driverCard");

  // السائق لا يظهر إلا إذا كان الطلب فعلاً معه
  if (!driverIsOnThisOrder()) {
    card.classList.add("hidden");
    return;
  }

  card.classList.remove("hidden");
  $("driverName").textContent = orderData.driverName || driverProfile?.name || "السائق";

  const phone = toIntlPhone(orderData.driverPhone || driverProfile?.phone);
  const call = $("callBtn");
  const wa = $("whatsappBtn");

  if (phone) {
    call.href = "tel:+" + phone;
    wa.href = "https://wa.me/" + phone;
    call.classList.remove("disabled");
    wa.classList.remove("disabled");
  } else {
    call.removeAttribute("href");
    wa.removeAttribute("href");
    call.classList.add("disabled");
    wa.classList.add("disabled");
  }

  const rating = Number(orderData.driverRating ?? driverProfile?.rating);
  $("ratingChip").classList.toggle("hidden", !Number.isFinite(rating) || rating <= 0);
  if (Number.isFinite(rating) && rating > 0) $("driverRating").textContent = rating.toFixed(1);

  const vehicle = driverProfile?.vehicle || orderData.driverVehicle || "";
  $("driverVehicle").textContent = vehicle;
  $("driverVehicle").classList.toggle("hidden", !vehicle);
}

function renderPlace() {
  const card = $("placeCard");
  const name = place?.name || orderData.restaurantName || orderData.storeName;

  if (!name) { card.classList.add("hidden"); return; }

  card.classList.remove("hidden");
  $("placeName").textContent = name;

  const link = $("placeLink");
  const pt = getPlaceCoords();
  if (pt) {
    link.href = `https://www.google.com/maps?q=${pt.lat},${pt.lng}`;
    link.classList.remove("hidden");
  } else {
    link.removeAttribute("href");
    link.classList.add("hidden");
  }
}

function renderAddress() {
  $("deliveryAddress").textContent =
    orderData.address || orderData.deliveryAddress || orderData.customerAddress || "—";
}

function renderDelivered() {
  const delivered = getStatus() === "delivered";
  $("deliveredActions").classList.toggle("hidden", !delivered);

  if (!delivered) return;

  $("rateBtn").classList.toggle("hidden", !!orderData.reviewed);
  triggerConfetti();
}

/* ===== CONFETTI ===== */
function triggerConfetti() {
  const key = "confettiShown_" + orderId;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch (_) { /* ignore */ }

  const colors = ["#0878D1", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];
  const cont = $("confettiContainer");

  for (let i = 0; i < 60; i++) {
    const c = document.createElement("div");
    c.className = "confetti";
    c.style.left = Math.random() * 100 + "%";
    c.style.top = "-10px";
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDelay = Math.random() * 0.5 + "s";
    c.style.animationDuration = (2 + Math.random() * 1.5) + "s";
    cont.appendChild(c);
    setTimeout(() => c.remove(), 4500);
  }
}

/* ===== MAP ===== */
function pinIcon(cls, emoji) {
  return L.divIcon({
    className: "",
    html: `<div class="${cls}"><span>${emoji}</span></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 44]
  });
}

function upsertMarker(marker, pt, makeIcon, popupHtml, z = 0) {
  if (!pt) {
    if (marker) map.removeLayer(marker);
    return null;
  }
  if (!marker) {
    return L.marker([pt.lat, pt.lng], { icon: makeIcon(), zIndexOffset: z })
      .addTo(map).bindPopup(popupHtml);
  }
  marker.setLatLng([pt.lat, pt.lng]);
  return marker;
}

function allPoints() {
  return [getCustomerCoords(), getPlaceCoords(), driverLoc].filter(Boolean);
}

// يعرض كل النقاط فوق الورقة السفلية (لا تغطيها)
function fitAll(animate = true) {
  if (!map) return;
  const pts = allPoints();
  if (!pts.length) return;

  const sheetH = Math.min(bottomSheet.offsetHeight || 0, window.innerHeight * 0.6);
  map.invalidateSize();
  map.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lng])), {
    paddingTopLeft: [50, 30],
    paddingBottomRight: [50, sheetH + 20],
    maxZoom: 16,
    animate
  });
}

function ensureMap() {
  const pts = allPoints();

  // لا خريطة بدون أي نقطة حقيقية (لا مواقع وهمية)
  if (!pts.length || typeof L === "undefined") {
    mapEl.classList.add("hidden");
    recenterBtn.classList.add("hidden");
    document.body.classList.add("no-map");
    return;
  }

  mapEl.classList.remove("hidden");
  recenterBtn.classList.remove("hidden");
  document.body.classList.remove("no-map");

  if (!map) {
    map = L.map("map", { zoomControl: false, attributionControl: true })
      .setView([pts[0].lat, pts[0].lng], 15);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19
    }).addTo(map);

    L.control.zoom({ position: "topright" }).addTo(map);
  }

  customerMarker = upsertMarker(customerMarker, getCustomerCoords(),
    () => pinIcon("marker-home-pin", "🏠"), "🏠 موقع التوصيل");

  placeMarker = upsertMarker(placeMarker, getPlaceCoords(),
    () => pinIcon("marker-rest-pin", "🍽️"),
    "🍽️ " + escapeHtml(place?.name || orderData?.restaurantName || "المطعم"));

  driverMarker = upsertMarker(driverMarker, driverLoc,
    () => pinIcon("marker-driver-pin", "🏍️"), "🏍️ السائق", 1000);

  // نعيد ضبط العرض فقط عند ظهور/اختفاء نقطة (وليس مع كل حركة للسائق)
  const sig = [getCustomerCoords(), getPlaceCoords(), driverLoc].map(p => (p ? 1 : 0)).join("");
  if (sig !== fitSig) {
    const first = fitSig === "";
    fitSig = sig;
    setTimeout(() => fitAll(!first), 200);
  }
}

recenterBtn.addEventListener("click", () => fitAll(true));
window.addEventListener("resize", () => { if (map) map.invalidateSize(); });

/* ===== DRIVER TRACKING ===== */
// موقع صالح فقط إذا كان حديثاً (أقل من دقيقتين)
function parseLoc(obj, atValue) {
  if (!obj) return null;
  const lat = Number(obj.lat ?? obj.latitude);
  const lng = Number(obj.lng ?? obj.longitude ?? obj.lon);
  if (!validCoords(lat, lng)) return null;

  const at = toDate(atValue ?? obj.updatedAt);
  if (at && (Date.now() - at.getTime()) / 1000 > STALE_SECONDS) return null;

  return { lat, lng, at };
}

function refreshDriverLoc() {
  const a = locFromOrder, b = locFromDoc;
  if (a && b) driverLoc = a.at && b.at && b.at > a.at ? b : a;
  else driverLoc = a || b || null;
}

function stopDriverTracking() {
  if (unsubscribeDriver) { unsubscribeDriver(); unsubscribeDriver = null; }
  trackedDriverId = null;
  driverProfile = null;
  locFromOrder = null;
  locFromDoc = null;
  driverLoc = null;
}

// يُستدعى مع كل تحديث للطلب: يتتبع السائق فقط عندما يكون الطلب معه
function ensureDriverTracking() {
  const driverId = orderData.driverId || null;
  const live = driverId && driverIsOnThisOrder();

  if (!live) {
    if (trackedDriverId || driverLoc) stopDriverTracking();
    return;
  }

  // موقع السائق المنسوخ داخل وثيقة الطلب نفسه (الأفضل أمنياً)
  locFromOrder = parseLoc(orderData.driverLocation, orderData.driverLocationUpdatedAt);
  refreshDriverLoc();

  if (driverId === trackedDriverId) return;

  stopDriverTracking();
  trackedDriverId = driverId;
  locFromOrder = parseLoc(orderData.driverLocation, orderData.driverLocationUpdatedAt);
  refreshDriverLoc();

  unsubscribeDriver = onSnapshot(
    doc(db, "drivers", driverId),
    snap => {
      if (!snap.exists()) return;
      const d = snap.data();

      driverProfile = {
        name: d.name || d.fullName || "",
        phone: d.phone || "",
        rating: d.rating,
        vehicle: d.vehicle || d.vehicleType || ""
      };

      // إذا كان السائق منشغلاً بطلب آخر فلا نعرض موقعه
      const busyElsewhere = d.currentOrderId && d.currentOrderId !== orderId;

      locFromDoc = busyElsewhere
        ? null
        : parseLoc(d.location || { lat: d.latitude, lng: d.longitude }, d.locationUpdatedAt);

      refreshDriverLoc();
      renderDriver();
      ensureMap();
      renderETA();
    },
    err => console.warn("Driver listener:", err.code || err)
  );
}

/* ===== RENDER ALL ===== */
function renderAll() {
  if (!orderData) return;

  ensureDriverTracking();
  loadPlace();

  renderHeader();
  renderStatusBlocks();
  renderTimeline();
  renderDriver();
  renderPlace();
  renderAddress();
  renderDelivered();
  ensureMap();
  renderETA();

  loader.classList.add("hidden");
  errorState.classList.add("hidden");
  mainHeader.classList.remove("hidden");
  bottomSheet.classList.remove("hidden");

  refreshIcons();
}

function showError() {
  stopDriverTracking();
  loader.classList.add("hidden");
  mainHeader.classList.add("hidden");
  bottomSheet.classList.add("hidden");
  mapEl.classList.add("hidden");
  recenterBtn.classList.add("hidden");
  errorState.classList.remove("hidden");
  refreshIcons();
}

/* ===== LISTEN TO ORDER ===== */
function startListening() {
  if (started) return;
  started = true;

  const params = new URLSearchParams(location.search);
  orderId = params.get("id") || params.get("orderId") || localStorage.getItem("lastOrderId");

  if (!orderId) {
    showError();
    return;
  }

  unsubscribeOrder = onSnapshot(
    doc(db, "orders", orderId),
    snap => {
      if (!snap.exists()) {
        showError();
        return;
      }

      const data = { id: snap.id, ...snap.data() };

      // الطلب يخص صاحبه فقط
      if (data.uid && currentUser && data.uid !== currentUser.uid) {
        showError();
        return;
      }

      orderData = data;
      renderAll();
    },
    err => {
      console.error("Order listener:", err);
      showError();
    }
  );

  // كل 30 ثانية: نتخلص من المواقع القديمة ونعيد حساب الوقت
  etaTimer = setInterval(() => {
    if (!orderData) return;
    if (isTerminal(getStatus())) { clearInterval(etaTimer); return; }

    if (trackedDriverId) {
      locFromOrder = parseLoc(orderData.driverLocation, orderData.driverLocationUpdatedAt);
      if (locFromDoc?.at && (Date.now() - locFromDoc.at.getTime()) / 1000 > STALE_SECONDS) locFromDoc = null;
      refreshDriverLoc();
      ensureMap();
    }
    renderETA();
  }, 30000);
}

// نبدأ الاستماع بعد اكتمال تسجيل الدخول (وإلا ترفضه قواعد Firestore)
onAuthStateChanged(auth, user => {
  currentUser = user;

  if (!user) {
    location.replace("login.html");
    return;
  }

  startListening();
});

window.addEventListener("pagehide", () => {
  if (unsubscribeOrder) unsubscribeOrder();
  if (unsubscribeDriver) unsubscribeDriver();
  if (etaTimer) clearInterval(etaTimer);
});

/* ===== BACK + SHEET ===== */
$("backBtn").addEventListener("click", () => {
  if (history.length > 1) history.back();
  else location.href = "my-orders.html";
});

const handle = $("sheetHandle");
const toggleSheet = () => bottomSheet.classList.toggle("expanded");
handle.addEventListener("click", toggleSheet);
handle.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSheet(); }
});

/* ===== RATING ===== */
const ratingLabels = ["", "سيء جداً", "سيء", "مقبول", "جيد", "ممتاز"];

function resetRatingForm() {
  selectedRating = 0;
  document.querySelectorAll(".star-btn").forEach(b => b.classList.remove("active"));
  $("ratingLabel").textContent = "اختر تقييماً";
  $("ratingLabel").classList.remove("has-value");
  $("ratingComment").value = "";
}

function openRatingModal() {
  if (orderData?.reviewed) {
    showToast("تم التقييم مسبقاً", "error");
    return;
  }
  $("ratingModal").classList.remove("hidden");
  refreshIcons();
}

function closeRatingModal() {
  $("ratingModal").classList.add("hidden");
  resetRatingForm();
}

document.querySelectorAll(".star-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedRating = parseInt(btn.dataset.value, 10);
    document.querySelectorAll(".star-btn").forEach(b => {
      b.classList.toggle("active", parseInt(b.dataset.value, 10) <= selectedRating);
    });
    $("ratingLabel").textContent = ratingLabels[selectedRating] || "اختر تقييماً";
    $("ratingLabel").classList.toggle("has-value", selectedRating > 0);
  });
});

$("rateBtn").addEventListener("click", openRatingModal);
document.querySelectorAll("[data-close-rating]").forEach(el => el.addEventListener("click", closeRatingModal));

$("ratingModal").addEventListener("click", e => {
  if (e.target === $("ratingModal")) closeRatingModal();
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("ratingModal").classList.contains("hidden")) closeRatingModal();
});

$("submitRatingBtn").addEventListener("click", async () => {
  if (selectedRating === 0) {
    showToast("اختر عدد النجوم", "error");
    return;
  }
  if (!currentUser || !orderData) return;

  const btn = $("submitRatingBtn");
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader"></i><span>جاري الإرسال...</span>`;
  refreshIcons();

  try {
    // معرّف الوثيقة = رقم الطلب: لا يمكن تقييم الطلب مرتين
    await setDoc(doc(db, "driver_reviews", orderId), {
      orderId: orderData.id,
      restaurantId: orderData.restaurantId || null,
      driverId: orderData.driverId || null,
      driverName: orderData.driverName || "",
      customerId: currentUser.uid,
      customerName: orderData.customerName || "عميل",
      rating: selectedRating,
      feedback: $("ratingComment").value.trim(),
      createdAt: serverTimestamp(),
      verified: true
    });

    try {
      await updateDoc(doc(db, "orders", orderId), {
        reviewed: true,
        reviewedAt: serverTimestamp()
      });
    } catch (err) {
      console.warn("Could not flag order as reviewed:", err);
    }

    closeRatingModal();
    $("rateBtn").classList.add("hidden");
    showToast("شكراً لتقييمك! ⭐");

  } catch (err) {
    console.error(err);
    showToast("فشل الإرسال، حاول مرة أخرى", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    refreshIcons();
  }
});

/* ===== BOOT ===== */
refreshIcons();