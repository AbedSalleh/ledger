---
name: stall-ledger-app
description: >-
  Scaffold a complete mobile-first stall financial-tracking web app (daily
  sales, expenses, COGS/OPEX P&L, inventory, printable statement, Google
  Sheets backend, OAuth login, in-app sharing, PWA) themed for ANY kind of
  stall or small business the owner chooses — e.g. fried chicken, guava,
  nasi lemak, roti canai, bubble tea, flower shop. Use when the user wants
  to create a new ledger/bookkeeping app for a stall or small business, or
  to re-theme the existing ledger app to a different trade. The owner picks
  the theme; this skill derives the branding, categories, colors and code
  and generates all files.
---

# Stall Ledger App generator

This skill builds a new stall-finance app by cloning the **proven ledger
engine already in this repository** and re-theming it for whatever stall the
owner wants. The engine (auth, Google Sheets CRUD, dashboard, inventory,
statement, sharing, PWA) is trade-agnostic — only branding, expense
categories, colors and a few text strings change between themes.

Do **not** rewrite the engine from scratch. Copy it and substitute.

## Reference implementation (the base to copy)

The canonical, bug-fixed source lives in this repo at the project root:

```
index.html
manifest.json
icon.svg
css/style.css
js/auth.js        # <Prefix>Auth   — Google OAuth (GIS) + token/session
js/sheets.js      # <Prefix>Sheets — Drive/Sheets CRUD, shared-ledger loader
js/share.js       # <Prefix>Share  — in-app sharing + role restrictions
js/dashboard.js   # <Prefix>Dashboard — metrics, category bars, recent tx
js/inventory.js   # <Prefix>Inventory — stock CRUD
js/statement.js   # <Prefix>Statement — printable P&L
js/test.js        # <Prefix>Test — self-test
js/app.js         # <Prefix>App — controller, CONFIG.CLIENT_ID, boot
```

If these files are not present in the working tree, read them from the
`jambu-batu` branch of `AbedSalleh/ayam-goreng-ledger` (the most complete
version, which includes the bug fixes, sharing, roles and PWA manifest) and
use that as the base. The bug fixes below are already applied there — keep
them:

1. Dashboard recent-transactions respect the selected month
   (`_renderRecent(monthlySales, monthlyExpenses)`).
2. Sales validation runs on **parsed** floats (`cashVal === 0 && qrVal === 0`),
   not raw strings.
3. `deleteRowByTimestamp` matches the **last column** only
   (`row[row.length - 1] === timestamp`), not `row.includes(timestamp)`.

## Step 1 — Interview the owner

Ask (batch the questions, suggest sensible defaults):

1. **What does the stall sell?** (e.g. “roti canai”, “nasi lemak”, “bubble
   tea”, “flowers”). This drives the whole theme.
2. **App name** — default `“<Trade> Ledger”` (e.g. “Roti Canai Ledger”).
3. **Direct cost (COGS) categories** — the raw materials/ingredients that go
   directly into the product. Propose 3–5 based on the trade and let them
   confirm/edit.
4. **Currency** — default `RM` (the engine uses `RM`; change the `formatRM`
   prefix in `dashboard.js`, `statement.js` if different).
5. **Accent color** (optional) — default slate/teal as in the base.

Then derive the parameter set and **show it to the owner for confirmation**
before generating.

## Step 2 — Derive the parameter set

| Token | Meaning | Example (roti canai) |
|---|---|---|
| `APP_NAME` | Display name | `Roti Canai Ledger` |
| `STALL_DESC` | Short descriptor | `roti canai stall` |
| `PREFIX` | PascalCase JS global prefix (replaces `Ayam`/`Jambu`) | `Roti` |
| `SPREADSHEET_NAME` | Drive file name (underscores) | `Roti_Canai_Ledger` |
| `STORAGE_KEY` | localStorage token key | `roti_ledger_token` |
| `DIRECT_CATEGORIES` | COGS list (array) | `['Flour','Ghee/Oil','Dhal/Curry','Packaging']` |
| `ALL_CATEGORIES` | COGS + OPEX (`Rent/Stall`,`Transport`,`Others`) | … |
| `CATEGORY_COLORS` | hex per category | see base palette |
| `COGS_HINT` | text in expense-type option | `Direct (COGS) — Flour, ghee, dhal, packaging` |
| `PLACEHOLDERS` | example notes/vendor strings | trade-appropriate |
| `ACCENT` | optional brand color | `#0F172A` |

The `PREFIX` must be a valid JS identifier and unique — it replaces every
`Ayam`/`Jambu` occurrence to form `RotiApp`, `RotiAuth`, `RotiSheets`,
`RotiDashboard`, `RotiInventory`, `RotiStatement`, `RotiTest`, `RotiShare`.

## Step 3 — Generate the files

Copy each reference file and apply substitutions:

**All `js/*.js`**
- Replace the global prefix `Ayam` (or `Jambu`) → `PREFIX` everywhere
  (object names, internal references, `[Ayam…]` log prefixes, comments).

**`js/app.js`**
- `CONFIG.CLIENT_ID` → set to the placeholder
  `'YOUR_CLIENT_ID.apps.googleusercontent.com'` (the owner supplies their own
  — see Step 4). Never hardcode someone else’s client ID.
- `directCategories` array → `DIRECT_CATEGORIES`.

**`js/sheets.js`**
- `SPREADSHEET_NAME` → `SPREADSHEET_NAME`.
- Legacy `directCategories` fallback (if present) → `DIRECT_CATEGORIES`.

**`js/auth.js`**
- localStorage key `*_ledger_token` → `STORAGE_KEY` (every occurrence).

**`js/dashboard.js`**
- `CATEGORY_COLORS` map → keys = `ALL_CATEGORIES`, values = `CATEGORY_COLORS`.
- `directCategories` fallback → `DIRECT_CATEGORIES`.

**`js/statement.js`**
- legacy `directCategories` fallback → `DIRECT_CATEGORIES`.

**`js/test.js`**
- sample `expenseCategory` → any item from `DIRECT_CATEGORIES`.

**`index.html`**
- `<title>`, meta description, login `<h1>`/subtitle, header `<h2>`,
  statement header → `APP_NAME` / `STALL_DESC`.
- Expense category `<option>`s → `ALL_CATEGORIES`.
- Expense-type COGS option text → `COGS_HINT`.
- Sales/expense/vendor placeholders → `PLACEHOLDERS`.
- All `onclick="AyamApp.…"` and other globals → `PREFIX`.
- Script `onload` handlers → `PREFIX`Auth.
- `apple-mobile-web-app-title` → short app name.

**`manifest.json`**
- `name`, `short_name`, `description` → themed.

**`css/style.css`**
- Header comment → `APP_NAME`. If `ACCENT` chosen, adjust the gradient/
  brand variables accordingly (and the Tailwind `brand` palette block inside
  `index.html`’s `<script>tailwind.config…`).

**`icon.svg`** — optionally recolor / restyle to suit the trade.

### Integrity checks before finishing
- Grep the output for any leftover `Ayam` or `Jambu` — there must be none.
- Confirm every `<Prefix>X` global referenced in `index.html` exists in JS.
- Keep the three bug fixes intact.
- `CONFIG.CLIENT_ID` is the placeholder, not a real ID.

## Step 4 — Tell the owner the setup steps

The app needs the owner’s **own** Google OAuth client (the code ships with a
placeholder):

1. Google Cloud Console → new/existing project.
2. Enable **Google Sheets API** and **Google Drive API**.
3. Configure the **OAuth consent screen** (External; add themselves as a test
   user).
4. **Credentials → Create → OAuth client ID → Web application**.
5. Add the hosting origin to **Authorized JavaScript origins** (e.g.
   `https://<user>.github.io`). Use the bare origin — no path, no trailing slash.
6. Put the client ID into `CONFIG.CLIENT_ID` in `js/app.js`.

Hosting (GitHub Pages): push the files to a repo/branch, then Settings →
Pages → Deploy from a branch → root. Live at `https://<user>.github.io/<repo>/`.

## Notes / gotchas (carry forward)
- `invalid_client` from Google = the client ID isn’t a valid web client the
  user owns, **or** the page is served from `file://`/an unregistered origin.
  Not an app bug.
- Each themed app uses its **own** `SPREADSHEET_NAME`, so multiple ledgers
  coexist in one Drive without touching each other.
- Sharing: `viewer` = Drive reader (hard-enforced); `cashier` = Drive writer
  + UI hiding only (convenience, not a security boundary). Make this clear.
- Link-only sharing: the worker must open the `?sheet=<id>&role=<role>` link
  (bookmark / Add to Home Screen) — the plain link gives them their own ledger.
