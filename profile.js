import { db, auth } from "./firebase.js";
import { getCart } from "./cart.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// =========================================
// TRANSLATIONS
// =========================================
const translations = {
  fr: {
    page_title: "Quickly - Mon compte",
    profile_title: "Mon Profil",
    loading: "Chargement du compte…",
    member_badge: "Membre Quickly",
    my_info: "Mes Informations",
    my_orders: "Mes Commandes",
    track_order: "Suivi de commande",
    my_addresses: "Mes Adresses",
    rewards_title: "Mes Points & Fidélité",
    support: "Support & Aide",
    privacy_policy: "Politique de Confidentialité",
    logout: "Déconnexion",
    nav_home: "Accueil",
    nav_explore: "Explorer",
    nav_cart: "Panier",
    nav_profile: "Profil",
    edit_info_title: "Modifier mes informations",
    full_name: "Nom complet",
    phone: "Téléphone",
    save_changes: "Enregistrer les modifications",
    saving: "Enregistrement…",
    back: "Retour",
    close: "Fermer",
    saved: "Profil mis à jour avec succès",
    save_error: "Erreur lors de la mise à jour",
    invalid_name: "Veuillez saisir votre nom (2 caractères minimum)",
    invalid_phone: "Numéro de téléphone invalide (ex : 06XXXXXXXX)",
    no_active_order: "Aucune commande en cours",
    soon: "Bientôt disponible",
    logout_confirm: "Voulez-vous vraiment vous déconnecter ?",
    default_name: "Client Quickly"
  },
  ar: {
    page_title: "Quickly - حسابي",
    profile_title: "الملف الشخصي",
    loading: "جاري تحميل الحساب…",
    member_badge: "عضو Quickly",
    my_info: "معلوماتي الشخصية",
    my_orders: "طلباتي",
    track_order: "تتبع الطلب",
    my_addresses: "عناويني",
    rewards_title: "النقاط والمكافآت",
    support: "الدعم والمساعدة",
    privacy_policy: "سياسة الخصوصية",
    logout: "تسجيل الخروج",
    nav_home: "الرئيسية",
    nav_explore: "استكشاف",
    nav_cart: "السلة",
    nav_profile: "حسابي",
    edit_info_title: "تعديل معلوماتي",
    full_name: "الاسم الكامل",
    phone: "رقم الهاتف",
    save_changes: "حفظ التعديلات",
    saving: "جاري الحفظ…",
    back: "رجوع",
    close: "إغلاق",
    saved: "تم تحديث الملف الشخصي بنجاح",
    save_error: "حدث خطأ أثناء التحديث",
    invalid_name: "يرجى إدخال الاسم (حرفان على الأقل)",
    invalid_phone: "رقم الهاتف غير صالح (مثال: 06XXXXXXXX)",
    no_active_order: "لا يوجد طلب نشط حاليًا",
    soon: "قريبًا",
    logout_confirm: "هل تريد فعلًا تسجيل الخروج؟",
    default_name: "عميل Quickly"
  },
  en: {
    page_title: "Quickly - My Account",
    profile_title: "My Profile",
    loading: "Loading your account…",
    member_badge: "Quickly Member",
    my_info: "My Information",
    my_orders: "My Orders",
    track_order: "Track Order",
    my_addresses: "My Addresses",
    rewards_title: "Rewards & Points",
    support: "Support & Help",
    privacy_policy: "Privacy Policy",
    logout: "Logout",
    nav_home: "Home",
    nav_explore: "Explore",
    nav_cart: "Cart",
    nav_profile: "Profile",
    edit_info_title: "Edit my information",
    full_name: "Full name",
    phone: "Phone number",
    save_changes: "Save changes",
    saving: "Saving…",
    back: "Back",
    close: "Close",
    saved: "Profile updated successfully",
    save_error: "Could not update your profile",
    invalid_name: "Please enter your name (2 characters minimum)",
    invalid_phone: "Invalid phone number (e.g. 06XXXXXXXX)",
    no_active_order: "You have no active order",
    soon: "Coming soon",
    logout_confirm: "Do you really want to log out?",
    default_name: "Quickly Customer"
  }
};

function getLang() {
  let stored = "";
  try {
    stored = (
      localStorage.getItem("quickly_lang") ||
      localStorage.getItem("lang") ||
      localStorage.getItem("language") ||
      ""
    ).toLowerCase();
  } catch (_) { /* التخزين غير متاح */ }

  return translations[stored] ? stored : "ar";
}

const lang = getLang();
const dict = translations[lang];
const t = key => dict[key] ?? translations.en[key] ?? key;

function applyLanguage() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach(el => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });

  const root = document.getElementById("htmlRoot");
  root.setAttribute("lang", lang);
  root.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
  document.title = t("page_title");
}

// الوضع الليلي
try {
  if (localStorage.getItem("quickly_theme") === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  }
} catch (_) { /* التخزين غير متاح */ }

// الأيقونات (Lucide)
function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

applyLanguage();
refreshIcons();

// =========================================
// HELPERS
// =========================================
const $ = id => document.getElementById(id);

const PHONE_REGEX = /^(?:\+212|00212|0)[5-7]\d{8}$/; // أرقام مغربية

function toast(message, type = "info") {
  const container = $("toastContainer");
  if (!container) return;

  const icons = { success: "circle-check", error: "circle-alert", info: "info" };

  const el = document.createElement("div");
  el.className = `toast ${type}`;

  const icon = document.createElement("i");
  icon.setAttribute("data-lucide", icons[type] || icons.info);

  const text = document.createElement("span");
  text.textContent = message;

  el.append(icon, text);
  container.appendChild(el);
  refreshIcons();

  setTimeout(() => {
    el.style.transition = "opacity .25s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 260);
  }, 2800);
}

// صورة رمزية من أول حرف (بدون الاعتماد على خدمة خارجية)
function initialAvatar(name) {
  const letter = (String(name).trim()[0] || "Q").toUpperCase();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">` +
    `<rect width="120" height="120" fill="#0878D1"/>` +
    `<text x="50%" y="50%" dy=".35em" text-anchor="middle" fill="#fff" ` +
    `font-family="Arial,sans-serif" font-size="56" font-weight="700">${letter.replace(/[<>&"]/g, "")}</text>` +
    `</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function hideLoader() {
  const loader = $("customerLoader");
  if (!loader || loader.dataset.hiding) return;
  loader.dataset.hiding = "1";
  loader.style.opacity = "0";
  setTimeout(() => loader.remove(), 350);
}

// لو تعطل تحميل Firebase لا نترك الزبون أمام شاشة تحميل للأبد
setTimeout(hideLoader, 6000);

// =========================================
// USER STATE + RENDER
// =========================================
let currentProfile = { name: "", phone: "", avatar: "" };

function renderUser(user) {
  const name = currentProfile.name || user.displayName || t("default_name");

  $("userName").textContent = name;
  $("userEmail").textContent = user.email || user.phoneNumber || "—";

  const avatar = $("userAvatarImg");
  avatar.onerror = () => { avatar.onerror = null; avatar.src = initialAvatar(name); };
  avatar.src = currentProfile.avatar || initialAvatar(name);
}

async function loadProfile(user) {
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      const data = snap.data();
      currentProfile = {
        name: data.fullName || data.name || user.displayName || "",
        phone: data.phone || "",
        avatar: data.avatar || ""
      };
    } else {
      currentProfile.name = user.displayName || "";
    }
  } catch (err) {
    console.error("Error fetching user profile:", err);
  }
  renderUser(user);
}

// =========================================
// ACTIVE ORDERS (زر تتبع الطلب)
// =========================================
const FINISHED = new Set(["delivered", "completed", "cancelled", "canceled"]);
const isActiveOrder = order => !FINISHED.has(String(order.status || "").trim().toLowerCase());

let activeOrders = [];
let unsubscribeOrders = null;

function updateOrderBadge() {
  const badge = $("activeOrderBadge");
  if (!badge) return;

  badge.textContent = activeOrders.length;
  badge.classList.toggle("hidden", activeOrders.length === 0);
  badge.classList.toggle("pulse-badge", activeOrders.length > 0);
}

function watchActiveOrders(user) {
  // بدون orderBy كي لا نحتاج فهرسًا مركبًا في Firestore؛ الترتيب يتم هنا
  const q = query(collection(db, "orders"), where("uid", "==", user.uid));

  unsubscribeOrders = onSnapshot(
    q,
    snapshot => {
      activeOrders = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(isActiveOrder)
        .sort((a, b) =>
          (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
        );
      updateOrderBadge();
    },
    err => console.error("Orders listener error:", err)
  );
}

$("trackOrderBtn").onclick = () => {
  if (activeOrders.length === 0) {
    toast(t("no_active_order"), "info");
  } else if (activeOrders.length === 1) {
    location.href = `track-order.html?id=${encodeURIComponent(activeOrders[0].id)}`;
  } else {
    location.href = "my-orders.html"; // أكثر من طلب: يختار الزبون
  }
};

// =========================================
// AUTH
// =========================================
onAuthStateChanged(auth, async user => {
  if (unsubscribeOrders) { unsubscribeOrders(); unsubscribeOrders = null; }

  if (!user) {
    location.replace("login.html");
    return;
  }

  renderUser(user);
  watchActiveOrders(user);
  await loadProfile(user);
  hideLoader();
});

// =========================================
// EDIT MODAL
// =========================================
const infoModal = $("infoModal");

function openModal() {
  $("editFullName").value = currentProfile.name || auth.currentUser?.displayName || "";
  $("editPhone").value = currentProfile.phone || "";
  infoModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setTimeout(() => $("editFullName").focus(), 50);
}

function closeModal() {
  infoModal.classList.add("hidden");
  document.body.style.overflow = "";
}

$("openInfoModal").onclick = openModal;
$("closeInfoModal").onclick = closeModal;

infoModal.addEventListener("click", e => {
  if (e.target === infoModal) closeModal();
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !infoModal.classList.contains("hidden")) closeModal();
});

$("updateProfileForm").onsubmit = async e => {
  e.preventDefault();

  const user = auth.currentUser;
  if (!user) return;

  const name = $("editFullName").value.trim();
  const phone = $("editPhone").value.replace(/[\s.-]/g, "");

  if (name.length < 2) {
    toast(t("invalid_name"), "error");
    $("editFullName").focus();
    return;
  }

  if (!PHONE_REGEX.test(phone)) {
    toast(t("invalid_phone"), "error");
    $("editPhone").focus();
    return;
  }

  const saveBtn = $("saveProfileBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = t("saving");

  try {
    // setDoc + merge: يعمل حتى لو لم تكن وثيقة المستخدم موجودة بعد
    // نحفظ name و fullName معًا لأن صفحة الدفع تقرأ name
    await setDoc(
      doc(db, "users", user.uid),
      { uid: user.uid, name, fullName: name, phone, updatedAt: serverTimestamp() },
      { merge: true }
    );

    currentProfile.name = name;
    currentProfile.phone = phone;
    renderUser(user);

    closeModal();
    toast(t("saved"), "success");
  } catch (err) {
    console.error("Error updating profile:", err);
    toast(t("save_error"), "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = t("save_changes");
  }
};

// =========================================
// صفحات لم تُنشأ بعد
// =========================================
document.querySelectorAll("[data-soon]").forEach(link => {
  link.addEventListener("click", e => {
    e.preventDefault();
    toast(t("soon"), "info");
  });
});

// =========================================
// LOGOUT
// =========================================
$("logoutBtn").onclick = async () => {
  if (!confirm(t("logout_confirm"))) return;

  try {
    await signOut(auth);
    location.href = "index.html";
  } catch (err) {
    console.error("Logout error:", err);
    toast(t("save_error"), "error");
  }
};

// =========================================
// CART BADGE (شريط التنقل السفلي)
// =========================================
function updateCartBadge() {
  const badge = $("cartBadgeCount");
  if (!badge) return;

  let count = 0;
  try {
    count = getCart().reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  } catch (_) { /* السلة غير متاحة */ }

  badge.textContent = count;
  badge.style.display = count > 0 ? "inline-block" : "none";
}

updateCartBadge();
window.addEventListener("cart:changed", updateCartBadge);
window.addEventListener("storage", updateCartBadge);
window.addEventListener("pageshow", updateCartBadge);