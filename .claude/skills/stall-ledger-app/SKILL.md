---
name: stall-ledger-app
description: >-
  Scaffold a complete mobile-first stall financial-tracking web app (daily
  sales, expenses, COGS/OPEX P&L, inventory, printable statement, Google
  Sheets backend, OAuth login, in-app sharing, offline mode, PWA) themed for
  ANY kind of stall or small business the owner chooses — e.g. fried chicken,
  guava, nasi lemak, roti canai, bubble tea, flower shop. Use when the user
  wants to create a new ledger/bookkeeping app for a stall or small business,
  or to re-theme the existing ledger app to a different trade. The owner picks
  the theme; this skill derives the branding, categories, colors and code
  and generates all files.
---

# Stall Ledger App generator

This skill builds a new stall-finance app by cloning the **proven ledger
engine already in this repository** and re-theming it for whatever stall the
owner wants. The engine (auth, Google Sheets CRUD, dashboard, inventory,
statement, sharing, offline mode, PWA) is trade-agnostic — only branding,
expense categories, colors and a few text strings change between themes.

Do **not** rewrite the engine from scratch. Copy it and substitute.

## Reference implementation (the base to copy)

The canonical, bug-fixed source lives in this repo at the project root:

```
index.html
manifest.json
icon.svg
sw.js             # service worker — app-shell cache-first
css/style.css
js/auth.js        # <Prefix>Auth   — Google OAuth (GIS) + token/session
js/sheets.js      # <Prefix>Sheets — Drive/Sheets CRUD, categories, row updates, monthly summary
js/share.js       # <Prefix>Share  — in-app sharing + role restrictions
js/offline.js     # <Prefix>Offline — localStorage cache + offline write queue
js/dashboard.js   # <Prefix>Dashboard — metrics, net trend, daily breakdown, recent tx
js/inventory.js   # <Prefix>Inventory — stock CRUD
js/statement.js   # <Prefix>Statement — printable P&L
js/test.js        # <Prefix>Test — self-test
js/app.js         # <Prefix>App — controller, CONFIG.CLIENT_ID, boot, category manager, CSV export
```

If these files are not present in the working tree, read them from the
`jambu-batu` branch of `AbedSalleh/ayam-goreng-ledger` (the most complete
version). Use that as the base and keep all of it.

### Capabilities the base already has (preserve them)
1. **Bug fixes:** month-scoped recent transactions; sales validation on
   parsed floats; `deleteRowByTimestamp` matches the last column only.
2. **In-app sharing** with `viewer`/`cashier`/`full` roles (link-only) + PWA.
3. **User-editable categories** — stored in the Settings tab (key
   `categories`, JSON of `{name,type:'COGS'|'OPEX',color}`), managed from a
   Settings UI with a 12-color preset palette + custom color; existing
   categories can be renamed/retyped/recolored (pencil button), and a rename
   offers to propagate to existing records via `renameCategoryInExpenses`.
4. **Editable records** — each dashboard transaction has edit + delete;
   editing reopens the form and updates the row in place via
   `updateSalesRow` / `updateExpenseRow` (matched by timestamp).
5. **Daily Breakdown card** — revenue, expenses and net gain/loss for a
   single day plus that day's expense-category breakdown; day-by-day via
   arrows or left/right swipe (`navigateDay`/`renderDayBreakdown`).
6. **Net Trend card** — 7d/30d bar chart of daily net profit (green/red)
   with period total and best/worst day (`setTrendRange`/`renderTrend`).
7. **Offline mode** — `<Prefix>Offline` caches last-loaded sheet data
   (dashboard renders offline) and queues sales/expense writes made offline,
   auto-flushing on the `online` event with a "pending sync" header badge;
   `sw.js` makes the app shell itself load without network.
8. **Monthly summary + CSV export** — Settings buttons: "Update Monthly
   Summary" writes per-month aggregates to the Monthly_Summary tab
   (`updateMonthlySummary`); "Export CSV" downloads all sales + expenses.

## Step 1 — Interview the owner

Ask (batch the questions, suggest sensible defaults):

1. **What does the stall sell?** (drives the whole theme).
2. **App name** — default `“<Trade> Ledger”`.
3. **Direct cost (COGS) categories** — propose 3–5 for the trade; the owner
   can add/remove/edit more in-app later, so these are just seed defaults.
4. **Currency** — default `RM`.
5. **Accent color** (optional).

Show the derived parameter set for confirmation before generating.

## Step 2 — Derive the parameter set

| Token | Meaning | Example (roti canai) |
|---|---|---|
| `APP_NAME` | Display name | `Roti Canai Ledger` |
| `STALL_DESC` | Short descriptor | `roti canai stall` |
| `PREFIX` | PascalCase JS global prefix (replaces `Ayam`/`Jambu`) | `Roti` |
| `SPREADSHEET_NAME` | Drive file name (underscores) | `Roti_Canai_Ledger` |
| `STORAGE_KEY` | localStorage token key | `roti_ledger_token` |
| `STORAGE_PREFIX` | lowercase key prefix (cache/queue/SW) | `roti` |
| `DEFAULT_CATEGORIES` | seed list `{name,type,color}` | flour(COGS), ghee(COGS), rent(OPEX)… |
| `COGS_HINT` | text in the expense-type option | `Direct (COGS) — Flour, ghee, dhal…` |
| `PLACEHOLDERS` | example notes/vendor strings | trade-appropriate |
| `ACCENT` | optional brand color | `#0F172A` |

`PREFIX` must be a valid, unique JS identifier — it forms `RotiApp`,
`RotiAuth`, `RotiSheets`, `RotiDashboard`, `RotiInventory`, `RotiStatement`,
`RotiTest`, `RotiShare`, `RotiOffline`.

## Step 3 — Generate the files

Copy each reference file and apply substitutions:

**All `js/*.js`** — replace prefix `Ayam`/`Jambu` → `PREFIX` everywhere
(object names, references, `[Ayam…]` log tags, comments).

**`js/app.js`** — `CONFIG.CLIENT_ID` → placeholder
`'YOUR_CLIENT_ID.apps.googleusercontent.com'` (never hardcode a real ID);
CSV filename → `<storage_prefix>_ledger_export.csv`.

**`js/sheets.js`** — `SPREADSHEET_NAME` → token; `DEFAULT_CATEGORIES` const
→ the seed list (users edit it later in Settings).

**`js/auth.js`** — localStorage key `*_ledger_token` → `STORAGE_KEY`.

**`js/offline.js`** — `jambu_cache_`/`jambu_sync_queue` keys →
`<STORAGE_PREFIX>_cache_`/`<STORAGE_PREFIX>_sync_queue`.

**`sw.js`** — cache name `jambu-shell-v1` → `<storage_prefix>-shell-v1`.

**`js/dashboard.js`** — the `CATEGORY_COLORS` fallback map and the legacy
`directCategories` fallback → match the seed categories (only used for old
rows / offline color fallback; live colors come from stored categories).

**`js/statement.js`** — legacy `directCategories` fallback → seed COGS names.

**`js/test.js`** — sample `expenseCategory` → a seed COGS category.

**`index.html`** — title/meta/headings → `APP_NAME`/`STALL_DESC`; expense-type
COGS option text → `COGS_HINT`; placeholders → `PLACEHOLDERS`; all
`onclick`/script `onload` globals → `PREFIX`. Leave the category `<select>`
with only its disabled placeholder option (populated at runtime), and keep:
the Settings category-manager block (palette + edit), the Net Trend card,
the Daily Breakdown card (`#day-breakdown-card`), the `#sync-badge`, the
`js/offline.js` script tag, and the service-worker registration snippet.

**`manifest.json`** — `name`/`short_name`/`description` → themed.

**`css/style.css`** — header comment → `APP_NAME`; if `ACCENT` chosen, adjust
the gradient/brand vars (and the Tailwind `brand` palette in `index.html`).

**`icon.svg`** — optionally recolor / restyle for the trade.

### Integrity checks before finishing
- No leftover `Ayam`/`Jambu`/`jambu` anywhere (including localStorage keys
  and the SW cache name).
- Every `<Prefix>X` global referenced in `index.html` exists in JS.
- `CONFIG.CLIENT_ID` is the placeholder.
- All eight preserved capabilities above still wired up.

## Step 4 — Tell the owner the setup steps

1. Google Cloud Console → project.
2. Enable **Google Sheets API** + **Google Drive API**.
3. Configure **OAuth consent screen** (External; add self as test user).
4. **Credentials → OAuth client ID → Web application**.
5. Add the hosting origin (bare, e.g. `https://<user>.github.io`) to
   **Authorized JavaScript origins**.
6. Put the client ID into `CONFIG.CLIENT_ID` in `js/app.js`.

Hosting (GitHub Pages): push files, Settings → Pages → Deploy from a branch
→ root. Live at `https://<user>.github.io/<repo>/`.

## Notes / gotchas
- `invalid_client` = the client ID isn’t a valid web client the user owns,
  or the page is on `file://`/an unregistered origin. Not an app bug.
- Each themed app uses its own `SPREADSHEET_NAME`, so ledgers never collide.
- Sharing: `viewer` = Drive reader (hard-enforced); `cashier` = Drive writer
  + UI hiding only (convenience, not a security boundary). The category
  manager sits in Settings, so it is hidden from cashiers by design.
- Link-only sharing: the worker must open the `?sheet=<id>&role=<role>` link
  (bookmark / Add to Home Screen); the plain link gives them their own ledger.
- The service worker caches the app shell; after deploying changes, users may
  need a hard refresh (or bump the SW cache version) to pick up new code.
