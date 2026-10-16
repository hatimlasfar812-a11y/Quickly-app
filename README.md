# Quickly – Delivery Food & More

Delivery platform for **Oujda, Morocco**: food, shops, groceries and more.
Pure static website (HTML + CSS + JavaScript ES modules) with **Firebase** (Authentication + Cloud Firestore) as the backend.

> **ملخص بسيط (بالعربية):** الموقع ملفات ثابتة (HTML/CSS/JS) تُرفع على GitHub Pages، وكل البيانات والتسجيل في Firebase.
> لا يوجد سيرفر خاص. التفاصيل بالأسفل.

---

## 1. Project structure

| Files | Role |
|---|---|
| `index.html`, `script.js`, `home.css`, `style.css` | Home page (banners, offers, filters, restaurants list, search box) |
| `food.html/js/css`, `shops.html/js/css`, `search.html/js` | Food categories, shops, global search |
| `restaurant.html/js/css`, `menu.js`, `menu.css`, `menu-options.js` | Restaurant page and menu (products, options) |
| `cart.html`, `cart-page.js`, `cart.js`, `cart.css` | Shopping cart (stored in the browser `localStorage`) |
| `checkout.html/js/css`, `order-success.*` | Order confirmation and creation in Firestore |
| `my-orders.*`, `order-details.*`, `track-order.*` | Customer order list, details and live tracking |
| `login.*`, `profile.*`, `my-information.*`, `addresses.*`, `map.*` | Account, profile, saved addresses, map |
| `rewards.html`, `invite.html`, `favorites.js` | Loyalty points, invitations, favorites |
| `admin.html`, `admin.js`, `admin.css` | Admin dashboard (restaurants, stores, orders, drivers, offers, banners, coupons, zones, hypermarkets…) |
| `firebase.js` | Firebase initialisation (shared by all pages) |
| `firestore.rules` | **Firestore security rules** (must be published in the Firebase console) |
| `images/`, `*.png` | Logos and images |
| `privacy.html`, `terms.html` | Draft legal pages (have a lawyer review them before launch) |

Every page imports `firebase.js`, so there is only one place that knows the Firebase project (`quickly-5856d`).

## 2. Run it on your computer

ES modules do not work when you double-click an HTML file (`file://`). Use a tiny local server:

```bash
# from the project folder
python3 -m http.server 8000
# then open http://localhost:8000
```

On a phone, the SPCK Editor preview works the same way.

## 3. Firebase setup (one time)

1. **Authentication**: enable the sign-in methods you use (Google, phone, email/password) in *Firebase console → Authentication → Sign-in method*.
2. **Authorized domains**: in *Authentication → Settings → Authorized domains* add your GitHub Pages domain, e.g. `YOUR-USERNAME.github.io`. **Without this, login fails on the live site.**
3. **Firestore rules**: open *Firestore Database → Rules*, paste the content of `firestore.rules`, click **Publish**.
4. **First admin account**: sign in once on the website with the account you want as admin, then in *Firestore → `users` → your document* add the field `role` (string) = `admin`.
5. **Indexes**: if the browser console shows `The query requires an index`, click the link in the message; Firebase creates it for you.

There is **no `.env` file**: the Firebase *web* config in `firebase.js` is public by design (it only identifies the project). Real protection comes from the Firestore rules and Authentication. **Never** put a service-account JSON or admin password in this repository.

## 4. Deploy on GitHub Pages

1. Create a repository on github.com (public).
2. *Add file → Upload files*: upload **everything inside** the project folder (including the hidden file `.nojekyll` if your phone allows it; it is optional here).
3. *Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save*.
4. After ~1 minute the site is at `https://YOUR-USERNAME.github.io/REPOSITORY-NAME/`. All paths in the project are relative, so a sub-folder URL works.

What GitHub Pages hosts: all HTML/CSS/JS/images.
What stays external: **Firebase** (login + database). Anything that needs a server (e.g. the hypermarket product scraper, see below, or secure coupon validation) must run outside GitHub Pages.

## 5. Firestore collections used

`restaurants` (+ `menu` subcollection), `stores` (+ `products`), `foodCategories`, `menuOptions`, `offers`, `banners`, `settings` (doc `services`), `users` (+ `addresses`), `orders`, `pointTransactions`, `drivers`, `driver_reviews`, `driver_earnings`, `zones`, `coupons`, `hypermarkets`, `hypermarket_products`, `sync_logs`, `admin_audit`.

Order statuses (lowercase): `pending → confirmed → preparing → ready → assigned → accepted → picked_up → on_the_way → delivered`, or `cancelled` / `rejected`.

## 6. Known limitations (read before launching)

- **Prices are calculated in the browser** (cart + checkout) and stored in the order. A technical user could edit them. The real fix is a Cloud Function (needs the Firebase *Blaze* plan) that recomputes the total from Firestore.
- **Coupons are disabled in checkout** until server-side validation exists (the old hard-coded codes were removed because anyone could read them).
- **Delivery fee (12 DH) and service fee (2 DH)** are constants in `checkout.js`; the zone fees in the admin panel are not used by checkout yet.
- **Driver identity card images** are stored inside the `drivers` document. The tracking page needs to read the driver's name/phone, so any signed-in customer who knows a driver document id can read that whole document. Recommended: move `cinImage` to a separate admin-only collection.
- **Hypermarket scraping**: the admin panel only *displays* `hypermarkets`, `hypermarket_products` and `sync_logs`. The scraper itself is not part of this project and must run on a server/scheduler (Cloud Function, Cloud Run, VPS…) with Firebase Admin credentials kept secret.
- **Package delivery** has an admin switch but no customer page yet.
- Large images in `images/dashboard/*.png` (≈1.5 MB each) slow down mobile loading; compress them (e.g. squoosh.app) when possible.

## 7. Manual test checklist

1. Home page loads, banners/offers show (create them in the admin panel first), filters work.
2. Open a restaurant → menu loads → add products → cart totals are right (products + 12 DH delivery + 2 DH service).
3. Checkout → order appears in Firestore `orders` with `status = pending`, `customerName`, `customerPhone`.
4. Admin panel → *Orders* shows the order as **معلق**; changing the status updates the customer's *My orders* and *Track order* pages.
5. Double-click "Valider la commande": only **one** order is created.
6. Normal customer account cannot open `admin.html` content and cannot read other people's orders.
7. Switch a service off in admin → *Status* tab and check it is saved in `settings/services`.
8. Open the site on a phone (360 px wide) and check there is no horizontal scrolling.
