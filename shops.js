/* =====================================================
   ONE CALL - UNIFIED SHOPS & DYNAMIC SPECIFICATIONS SCRIPT (shops.js)
===================================================== */

import { db, auth } from "./firebase.js";
import {
    collection,
    getDocs,
    doc,
    getDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

let currentStoreProducts = [];

document.addEventListener("DOMContentLoaded", async () => {
    initUserProfileListener();
    injectModalHTML(); // حقن نافذة اختيار المقاسات والألوان

    const urlParams = new URLSearchParams(window.location.search);
    const storeId = urlParams.get("id");

    if (storeId) {
        document.getElementById("shopsListView").classList.add("hidden-view");
        document.getElementById("storeDetailsView").classList.remove("hidden-view");
        await loadSingleStoreDetails(storeId);
    } else {
        document.getElementById("storeDetailsView").classList.add("hidden-view");
        document.getElementById("shopsListView").classList.remove("hidden-view");
        initStoresRealtimeListener();
        setupCategoryFilters();
        setupSearchInput();
    }
});

function initUserProfileListener() {
    const profileImgEl = document.getElementById("userProfileImg");
    const profileLinkEl = document.getElementById("userProfileLink");
    if (!profileImgEl) return;

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            profileImgEl.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.email || "U")}&background=FF6B00&color=fff`;
            if (profileLinkEl) profileLinkEl.href = "profile.html";
        } else {
            profileImgEl.src = "https://cdn-icons-png.flaticon.com/512/1144/1144760.png";
            if (profileLinkEl) profileLinkEl.href = "login.html";
        }
    });
}

/* =====================================================
   1. عرض قائمة المتاجر الرئيسية
===================================================== */
let allStoresData = [];

function initStoresRealtimeListener() {
    const gridContainer = document.getElementById("shopsGridContainer");
    const storesRef = collection(db, "stores");

    onSnapshot(storesRef, (snapshot) => {
        allStoresData = snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data()
        }));
        renderStoresGrid(allStoresData);
    }, (error) => {
        console.error("Error loading stores:", error);
        if (gridContainer) {
            gridContainer.innerHTML = `<div style="text-align:center; color:red; padding:20px;">فشل تحميل المتاجر.</div>`;
        }
    });
}

function renderStoresGrid(stores) {
    const gridContainer = document.getElementById("shopsGridContainer");
    if (!gridContainer) return;

    if (!stores.length) {
        gridContainer.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; grid-column: span 2;">
                <i class="fa-solid fa-store-slash" style="font-size: 40px; color: #94a3b8; margin-bottom: 10px;"></i>
                <p style="color: #64748b; font-weight: bold;">لا توجد متاجر مضافة حالياً.</p>
            </div>
        `;
        return;
    }

    gridContainer.innerHTML = stores.map(store => `
        <div class="shop-card" onclick="window.location.href='shops.html?id=${encodeURIComponent(store.id)}'" style="cursor: pointer; background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; margin-bottom: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
            <div class="shop-img-box" style="position:relative; width:100%; height:140px; background:#eee;">
                <img src="${escapeAttr(store.image || 'https://via.placeholder.com/300x150')}" alt="${escapeHtml(store.name)}" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='https://via.placeholder.com/300x150'">
                <div class="category-tag" style="position:absolute; top:10px; right:10px; background:rgba(0,0,0,0.6); color:#fff; padding:3px 8px; border-radius:6px; font-size:11px;">
                    <i class="fa-solid fa-bag-shopping"></i> ${escapeHtml(store.categoryType || store.category || 'متجر')}
                </div>
            </div>
            <div class="shop-info" style="padding:14px 12px; display:flex; flex-direction:column; gap:6px;">
                <h4 style="font-size:15px; font-weight:700; color:#1e293b; margin:0;">${escapeHtml(store.name || "متجر One Call")}</h4>
                <p class="shop-phone" style="font-size:12px; color:#64748b; margin:0;"><i class="fa-solid fa-location-dot" style="color:#FF7900;"></i> وجدة - هاتف: ${escapeHtml(store.phone || "متوفر")}</p>
                <div class="shop-meta-row" style="display:flex; justify-content:space-between; align-items:center; border-top:1px dashed #e2e8f0; padding-top:6px; margin-top:4px;">
                    <span class="rating" style="font-size:13px; font-weight:700; color:#1e293b;"><i class="fa-solid fa-star" style="color:#f59e0b;"></i> 4.8</span>
                    <span class="delivery-badge" style="font-size:11px; color:#e65100; background:#fff3e0; padding:2px 6px; border-radius:6px; font-weight:600;"><i class="fa-solid fa-motorcycle"></i> توصيل سريع</span>
                </div>
            </div>
        </div>
    `).join("");
}

/* =====================================================
   2. جلب تفاصيل متجر محدد ومنتجاته
===================================================== */
async function loadSingleStoreDetails(storeId) {
    const heroContainer = document.getElementById("storeHeroContainer");
    const gridContainer = document.getElementById("storeProductsGrid");

    try {
        const storeSnap = await getDoc(doc(db, "stores", storeId));
        
        if (!storeSnap.exists()) {
            heroContainer.innerHTML = `<div style="padding: 30px; text-align: center; color: #64748b;">هذا المتجر غير موجود أو تم حذفه.</div>`;
            gridContainer.innerHTML = "";
            return;
        }

        const store = storeSnap.data();

        heroContainer.innerHTML = `
            <img src="${escapeAttr(store.image || 'https://via.placeholder.com/600x200')}" style="width:100%; height:160px; object-fit:cover;" onerror="this.src='https://via.placeholder.com/600x200'">
            <div style="padding:16px;">
                <h2 style="font-size:18px; font-weight:700; color:#1e293b; margin:0;">${escapeHtml(store.name || "متجر One Call")}</h2>
                <p style="font-size:13px; color:#64748b; margin-top:6px;"><i class="fa-solid fa-location-dot" style="color:#FF7900;"></i> وجدة | هاتف: ${escapeHtml(store.phone || "متوفر")}</p>
                <span style="display:inline-block; margin-top:8px; background:#fff3e0; color:#e65100; padding:4px 10px; border-radius:6px; font-size:11px; font-weight:bold;">
                    <i class="fa-solid fa-tag"></i> ${escapeHtml(store.categoryType || store.category || "متجر")}
                </span>
            </div>
        `;

        const productsSnapshot = await getDocs(collection(db, "stores", storeId, "products"));
        currentStoreProducts = productsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        if (!currentStoreProducts.length) {
            gridContainer.innerHTML = `
                <div style="grid-column: span 2; text-align:center; padding:30px; background:#fff; border-radius:12px; border:1px dashed #cbd5e1;">
                    <i class="fa-solid fa-box-open" style="font-size:32px; color:#94a3b8; margin-bottom:8px;"></i>
                    <p style="color:#64748b; font-size:13px; font-weight:bold; margin:0;">لا توجد منتجات مضافة لهذا المتجر حالياً.</p>
                </div>
            `;
            return;
        }

        renderProductsGrid(currentStoreProducts);

    } catch (err) {
        console.error("Error loading store details:", err);
        heroContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: red;">فشل تحميل بيانات المتجر.</div>`;
        gridContainer.innerHTML = "";
    }
}

function renderProductsGrid(products) {
    const gridContainer = document.getElementById("storeProductsGrid");
    if (!gridContainer) return;

    gridContainer.innerHTML = products.map(p => {
        const specs = p.specifications || {};
        const sizesVal = specs.sizes || p.sizes || p.size;
        const colorsVal = specs.colors || p.colors || p.color;

        let specsBadges = [];
        if (sizesVal) specsBadges.push(`مقاس: ${escapeHtml(sizesVal)}`);
        if (colorsVal) specsBadges.push(`لون: ${escapeHtml(colorsVal)}`);

        const specsHtml = specsBadges.length 
            ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px;">${specsBadges.map(b => `<span class="spec-badge">${b}</span>`).join('')}</div>`
            : '';

        return `
            <div style="background:#fff; border-radius:12px; padding:10px; border:1px solid #e2e8f0; display:flex; flex-direction:column; justify-content:space-between; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
                <div>
                    <img src="${escapeAttr(p.image || 'https://via.placeholder.com/150')}" style="width:100%; height:110px; object-fit:cover; border-radius:8px;" onerror="this.src='https://via.placeholder.com/150'">
                    <h4 style="font-size:13px; font-weight:700; margin-top:8px; color:#1e293b;">${escapeHtml(p.name)}</h4>
                    <p style="font-size:11px; color:#64748b; margin-top:2px;">${escapeHtml(p.description || '')}</p>
                    ${specsHtml}
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; border-top:1px dashed #e2e8f0; padding-top:6px;">
                    <span style="font-size:13px; font-weight:700; color:#FF7900;">${Number(p.price || 0).toFixed(2)} د.م</span>
                    <button onclick="openProductOptionsModal('${p.id}')" style="background:#FF7900; color:#fff; border:none; width:28px; height:28px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center;" title="اختيار المقاس واللون">
                        <i class="fa-solid fa-cart-plus" style="font-size:12px;"></i>
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

/* =====================================================
   3. نافذة اختيار المقاسات والألوان المنبثقة للزبون
===================================================== */
function injectModalHTML() {
    if (document.getElementById("productOptionsModal")) return;

    const modalHTML = `
        <div id="productOptionsModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; align-items:center; justify-content:center; padding:16px;">
            <div style="background:#fff; width:100%; max-width:400px; border-radius:16px; padding:20px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); position:relative;">
                <button onclick="closeProductModal()" style="position:absolute; top:12px; left:12px; background:none; border:none; font-size:18px; color:#64748b; cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
                
                <h3 id="modalProductName" style="font-size:16px; font-weight:700; color:#1e293b; margin-bottom:4px;">اسم المنتج</h3>
                <p id="modalProductPrice" style="font-size:14px; font-weight:700; color:#FF7900; margin-bottom:16px;">0.00 د.م</p>
                
                <div id="modalSpecsContainer" style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;"></div>

                <button id="confirmAddToCartBtn" style="width:100%; background:#FF7900; color:#fff; border:none; padding:12px; border-radius:10px; font-weight:bold; font-size:14px; cursor:pointer;">
                    تأكيد وإضافة للسلة
                </button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

window.openProductOptionsModal = function(productId) {
    const product = currentStoreProducts.find(p => p.id === productId);
    if (!product) return;

    const modal = document.getElementById("productOptionsModal");
    document.getElementById("modalProductName").innerText = product.name || "منتج";
    document.getElementById("modalProductPrice").innerText = `${Number(product.price || 0).toFixed(2)} د.م`;

    const specsContainer = document.getElementById("modalSpecsContainer");
    specsContainer.innerHTML = "";

    const specs = product.specifications || {};
    const sizesData = specs.sizes || product.sizes || product.size;
    const colorsData = specs.colors || product.colors || product.color;

    let dynamicSelections = {};

    // 1. خيار المقاسات
    if (sizesData) {
        const sizesList = String(sizesData).split(",").map(s => s.trim());
        let html = `<div style="font-size:13px; font-weight:600; color:#475569;">اختر المقاس:</div><div style="display:flex; gap:6px; flex-wrap:wrap;">`;
        sizesList.forEach((sz, idx) => {
            if (idx === 0) dynamicSelections.size = sz;
            html += `<button type="button" class="spec-option-btn size-btn" data-type="size" data-val="${sz}" style="padding:8px 14px; border:1px solid ${idx === 0 ? '#FF7900' : '#cbd5e1'}; border-radius:8px; background:${idx === 0 ? '#FF7900' : '#f8fafc'}; color:${idx === 0 ? '#fff' : '#1e293b'}; font-size:12px; font-weight:bold; cursor:pointer;">${sz}</button>`;
        });
        html += `</div>`;
        specsContainer.insertAdjacentHTML('beforeend', html);
    }

    // 2. خيار الألوان
    if (colorsData) {
        const colorsList = String(colorsData).split(",").map(c => c.trim());
        let html = `<div style="font-size:13px; font-weight:600; color:#475569; margin-top:8px;">اختر اللون:</div><div style="display:flex; gap:6px; flex-wrap:wrap;">`;
        colorsList.forEach((cl, idx) => {
            if (idx === 0) dynamicSelections.color = cl;
            html += `<button type="button" class="spec-option-btn color-btn" data-type="color" data-val="${cl}" style="padding:8px 14px; border:1px solid ${idx === 0 ? '#FF7900' : '#cbd5e1'}; border-radius:8px; background:${idx === 0 ? '#FF7900' : '#f8fafc'}; color:${idx === 0 ? '#fff' : '#1e293b'}; font-size:12px; font-weight:bold; cursor:pointer;">${cl}</button>`;
        });
        html += `</div>`;
        specsContainer.insertAdjacentHTML('beforeend', html);
    }

    if (!sizesData && !colorsData) {
        specsContainer.innerHTML = `<p style="font-size:12px; color:#64748b; text-align:center;">هذا المنتج جاهز للإضافة مباشرة دون خيارات إضافية.</p>`;
    }

    // تفاعل أزرار الاختيار
    specsContainer.querySelectorAll(".spec-option-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const type = e.target.dataset.type;
            const val = e.target.dataset.val;
            dynamicSelections[type] = val;

            specsContainer.querySelectorAll(`.${type}-btn`).forEach(b => {
                b.style.background = "#f8fafc";
                b.style.color = "#1e293b";
                b.style.borderColor = "#cbd5e1";
            });
            e.target.style.background = "#FF7900";
            e.target.style.color = "#fff";
            e.target.style.borderColor = "#FF7900";
        });
    });

    const confirmBtn = document.getElementById("confirmAddToCartBtn");
    confirmBtn.onclick = function() {
        addToCartWithSpecs(product, dynamicSelections);
        closeProductModal();
    };

    modal.style.display = "flex";
};

window.closeProductModal = function() {
    const modal = document.getElementById("productOptionsModal");
    if (modal) modal.style.display = "none";
};

function addToCartWithSpecs(product, selections) {
    let cart = JSON.parse(localStorage.getItem("oneCallCart")) || [];
    
    const cartItem = {
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        selectedSpecs: selections, // حفظ المقاس واللون المختار
        quantity: 1
    };

    cart.push(cartItem);
    localStorage.setItem("oneCallCart", JSON.stringify(cart));
    alert(`تمت إضافة "${product.name}" بنجاح إلى السلة!`);
}

/* =====================================================
   4. الفلترة العامة والبحث للمتاجر
===================================================== */
function setupCategoryFilters() {
    const categoryBtns = document.querySelectorAll(".cat-pill");
    categoryBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            categoryBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const cat = btn.dataset.category || "all";
            
            if (cat === "all") {
                renderStoresGrid(allStoresData);
            } else {
                const filtered = allStoresData.filter(s => {
                    const storeCat = (s.categoryType || s.category || "").toLowerCase();
                    return storeCat === cat.toLowerCase();
                });
                renderStoresGrid(filtered);
            }
        });
    });
}


function setupSearchInput() {
    const searchInput = document.getElementById("shopSearchInput");
    if (!searchInput) return;
    searchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = allStoresData.filter(s => (s.name || "").toLowerCase().includes(query) || (s.phone || "").toLowerCase().includes(query));
        renderStoresGrid(filtered);
    });
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function escapeAttr(str) { return escapeHtml(str); }
