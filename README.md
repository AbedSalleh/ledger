# 📒 Ledger

**A zero-cost, mobile-first web app for tracking sales, expenses, and profit — for every business you run.**

One app, many businesses. Each business gets its own ledger (a Google Sheets file in **your** Google Drive) — no servers, no subscriptions, no fees. Open the app on your phone, log today's sales, and watch your profits grow.

**Live app:** https://abedsalleh.github.io/ledger/

---

## ✨ Features

- 🏪 **Multi-Business** — Keep any number of businesses in one app; tap the title to switch, rename, or add one. Each business has its own ledger, categories, inventory, and target
- 📊 **Live Dashboard** — Revenue, expenses, COGS/OPEX split, payables, and net profit with a monthly target progress bar
- 📈 **Net Trend** — 7-day / 30-day bar chart of daily net profit, with best/worst day
- 📅 **Daily Breakdown** — Revenue, expenses, and net gain/loss for any single day; swipe left/right (or use arrows) to move day by day
- 💰 **Sales & Expense Tracking** — Record cash + QR sales and categorized expenses in seconds; every record can be **edited or deleted** later
- 🏷️ **Custom Categories** — Add, rename, recolor, and remove expense categories per business (COGS or OPEX), with a color palette
- 📦 **Inventory** — Track stock with low-stock alerts
- 👥 **Sharing & Roles** — Share a business with a worker by email: *Cashier* (enter sales/expenses/stock), *View only*, or *Full access*
- 📴 **Offline Mode** — The app loads and shows your data without a connection; entries made offline queue up and sync automatically when you're back online
- 📄 **Printable Statement** — Formal monthly Profit & Loss statement, ready to print or save as PDF
- 📤 **Monthly Summary & CSV Export** — One tap fills the `Monthly_Summary` sheet tab; export all records as CSV for your accountant
- 📱 **PWA** — Add to Home Screen for an app-like experience
- 🔒 **Your Data, Your Drive** — Everything lives in Google Sheets files in *your* Google Drive
- 🆓 **100% Free** — No server costs, no database fees, no subscriptions

---

## 🚀 Setup Guide (one-time, ~10 minutes)

You need a **Google account** and a modern browser.

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. **Select a project** → **New Project** → name it (e.g., `Ledger`) → **Create**

> 💡 **No billing is required.** The free tier covers everything this app needs.

### Step 2: Enable the Required APIs

In **APIs & Services → Library**, enable both:

- **Google Sheets API**
- **Google Drive API**

### Step 3: Configure the OAuth Consent Screen

1. **APIs & Services → OAuth consent screen** → **External** → **Create**
2. Fill in the app name (e.g., `Ledger`) and your email addresses
3. On the **Scopes** page, add:
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/spreadsheets`
4. On the **Test users** page, add your own email (and any worker emails that will sign in)

> ⚠️ While the app is in "Testing" mode, only listed test users can sign in. Fine for personal/small-team use.

### Step 4: Create OAuth Credentials

1. **APIs & Services → Credentials** → **Create Credentials** → **OAuth client ID**
2. Application type: **Web application**
3. Under **Authorized JavaScript origins**, add the origin you'll serve from — the bare origin, no path or trailing slash:
   - `https://<your-username>.github.io` (for GitHub Pages)
   - `http://localhost:5500` / `http://localhost:3000` (for local development)
4. **Create**, then 📋 copy the **Client ID**

### Step 5: Configure the App

In `js/app.js`, set your Client ID:

```javascript
const CONFIG = {
  CLIENT_ID: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
  ...
};
```

### Step 6: Host It

- **GitHub Pages** *(recommended)*: push this repo, then **Settings → Pages → Deploy from a branch → `main` / root**. Live at `https://<username>.github.io/<repo>/`
- **Locally**: `npx serve .` or VS Code Live Server

> 🚫 The app must be served over HTTP/HTTPS — opening `index.html` as a `file://` URL will not work with Google OAuth.

---

## 📖 Usage

### First Launch

1. Open the app → **Sign in with Google** → authorize
2. Your first business ledger (**My Business Ledger**) is created automatically in your Drive — tap the title to rename it

### Businesses

- **Tap the app title** (with the ▾) to open **My Businesses**
- Tap a business to switch to it — dashboard, categories, and inventory all follow
- ✏️ renames a business (renames the Drive spreadsheet too)
- Type a name + **Add** to create a new business

### Daily Workflow

1. **Sales** tab — enter today's cash and QR totals → **Save**
2. **Expenses** tab — pick a category, amount, vendor, paid/unpaid → **Save**
3. **Dashboard** — check the month, the trend, and the daily breakdown
4. Made a mistake? Tap ✏️ on any transaction in the history to edit it in place, or 🗑️ to delete

### Sharing With a Worker

1. Tap the **share icon** in the header
2. Enter the worker's Google email and pick a level:
   - **Cashier** — can add sales, expenses & stock (settings/statement hidden)
   - **View only** — read-only, enforced by Google Drive
   - **Full access** — everything
3. Send them the generated link. They sign in with **their own** Google account and land in *your* business's ledger
4. Have them **Add to Home Screen** while on that link so their icon always opens it

> ⚠️ Honest note: the *Cashier* limitation is a convenience (hidden UI), not a hard security boundary — a technically savvy cashier could still edit the sheet directly. *View only* **is** hard-enforced by Google.

### Settings (⚙️)

- Monthly profit target
- **Expense Categories** — add / edit / recolor / remove (per business)
- **Update Monthly Summary** — writes per-month totals to the `Monthly_Summary` sheet tab
- **Export CSV** — downloads all sales + expenses

---

## 🔒 Data Security

| Concern | Answer |
|---------|--------|
| Where is my data stored? | In Google Sheets files in **your** Google Drive (one per business) |
| Can anyone else see it? | Only people **you** explicitly share a business with |
| Does the app send data to a server? | **No.** The app runs entirely in your browser |
| What permissions does it use? | `drive.file` — the app can only access files **it creates**, plus `spreadsheets` for shared ledgers opened by ID |
| Is my Google password stored? | **No.** Authentication uses Google's official sign-in flow |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JavaScript (no build step) |
| Styling | Tailwind CSS utilities + custom theme |
| Auth | Google Identity Services (OAuth 2.0) |
| Backend | Google Sheets API v4 + Drive API v3 (serverless) |
| Storage | Google Drive (user's own account) |
| Offline | Service worker (app shell) + localStorage cache & sync queue |
| Hosting | Any static host (GitHub Pages, Netlify, etc.) |

---

## 📁 Project Structure

```
ledger/
├── index.html          # All views and modals
├── manifest.json       # PWA manifest
├── sw.js               # Service worker (offline app shell)
├── icon.svg            # App icon
├── css/
│   └── style.css       # Custom styles, animations, theme
└── js/
    ├── auth.js         # Google Identity Services wrapper
    ├── sheets.js       # Sheets/Drive CRUD + multi-ledger management
    ├── share.js        # Sharing + role restrictions
    ├── offline.js      # Offline cache + write queue
    ├── dashboard.js    # Dashboard, net trend, daily breakdown
    ├── inventory.js    # Stock management
    ├── statement.js    # Printable P&L statement
    ├── test.js         # Built-in stress test
    └── app.js          # Main controller (CONFIG.CLIENT_ID lives here)
```

---

## 🐛 Troubleshooting

### "Sign in" button does nothing
- Set `CLIENT_ID` in `js/app.js`; serve over HTTP (not `file://`); check the console

### `Error 401: invalid_client`
- The Client ID isn't a valid **Web application** OAuth client that **you** own — create your own in Step 4 (don't reuse an ID from someone else's project)

### "Access blocked: This app's request is invalid"
- Your page's origin isn't in **Authorized JavaScript origins**. Add the exact bare origin (e.g., `https://username.github.io` — no path)

### "This app is not verified"
- Normal in "Testing" mode. **Advanced → Go to (unsafe)**, or add the signer as a test user

### Old version still showing after an update
- The service worker caches the app — do a hard refresh (Ctrl/Cmd+Shift+R) once

### Worker sees an empty ledger
- They opened the plain URL instead of the **share link** (`?sheet=...`). The plain link always opens their own ledgers

---

## 📄 License

MIT License — free for personal and commercial use.

---

<p align="center">
  Made for small business owners everywhere 🧾
</p>
