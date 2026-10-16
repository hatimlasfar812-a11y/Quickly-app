# Changes made in the audit of Quickly V5

| File | Problem found | Fix |
|---|---|---|
| `checkout.js` | New orders were saved with status `Pending` (capital P) but the admin panel only understands `pending`: new orders had no selected status and did not match the filter or the "pending orders" counter. | Status is now `pending`. |
| `checkout.js` | Orders had no customer name/phone, so admin and drivers could not contact the customer. | `customerName` and `customerPhone` are copied from the customer's profile. |
| `admin.js` | Old orders with `Pending`/`PENDING` were mis-counted. | Statuses are normalised to lowercase when loaded. |
| `admin.js` | Re-selecting `delivered` could record the driver's earning twice; finished orders could be re-opened. | Same-status change is ignored; delivered/cancelled orders are locked. |
| `admin.js` | `toggleServiceStatus` was used by the *Status* tab but did not exist (switches did nothing). | Added `loadServicesSettings()` + `toggleServiceStatus()` saving to `settings/services`. |
| `admin.html` | 4 modals required by `admin.js` were missing (`driverDetailsModal`, `paymentModal`, `syncLogModal`, `syncSettingsModal`): the driver details button, driver payment button and sync log crashed. | Modals added; sync log/settings buttons added to the Groceries tab. |
| `admin.html`, `index.html`, `addresses.html`, `map.html` | `lucide@latest` loaded an unpinned third-party script (can break the site or be abused). | Pinned to `lucide@0.468.0`. |
| `order-details.js` | Timeline and colours expected `on the way`/`driver assigned` but the admin writes `on_the_way`/`assigned`/`picked_up`/`confirmed`/`ready`; cancelled orders were not handled. | All current statuses are handled, with French labels. |
| `my-orders.js` | Crashed if an order had no `total`; restaurant name inserted as raw HTML; raw English status shown. | Safe rendering, default total, readable status. |
| `firestore.rules` | Previous rules blocked `zones`, `admin_audit`, `driver_earnings`, `driver_reviews`, `hypermarkets`, `sync_logs`, `menuOptions`, `settings`; blocked customers from reading their driver while tracking; allowed customers to promote themselves to admin. | Complete rewrite covering every collection used by the code. |
| Repo files | No README, `.gitignore`. | Added `README.md`, `.gitignore`, `.nojekyll`, `.env.example`, `CHANGES.md`. |
