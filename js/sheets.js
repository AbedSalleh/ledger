/**
 * @fileoverview Google Sheets / Drive CRUD module for the Ledger app.
 * Manages MULTIPLE ledgers: every spreadsheet this app created in the
 * user's Drive is one business ledger. Handles discovery, creation,
 * renaming, switching, and all read/write operations against the ledger
 * tabs (Daily_Sales, Expenses, Inventory, Monthly_Summary, Settings).
 *
 * Exposes a global `JambuSheets` object. (The Jambu* prefix is a legacy
 * internal namespace — not user-visible.)
 */

const JambuSheets = (() => {
  let spreadsheetId = null;
  let ledgers = []; // [{id, name}] — all app-created ledgers in the user's Drive
  const ACTIVE_KEY = 'jambu_active_ledger';
  const DEFAULT_LEDGER_NAME = 'My Business Ledger';
  const DEFAULT_TARGET_PROFIT = 2000;

  // Seed categories for a brand-new ledger. After creation the list lives in
  // that ledger's Settings tab (key: 'categories') and is fully user-editable,
  // so every business can have its own categories.
  const DEFAULT_CATEGORIES = [
    { name: 'Raw Materials', type: 'COGS', color: '#EF4444' },
    { name: 'Supplies',      type: 'COGS', color: '#F59E0B' },
    { name: 'Packaging',     type: 'COGS', color: '#10B981' },
    { name: 'Rent/Stall',    type: 'OPEX', color: '#3B82F6' },
    { name: 'Transport',     type: 'OPEX', color: '#EC4899' },
    { name: 'Others',        type: 'OPEX', color: '#6B7280' },
  ];

  const TABS = {
    DAILY_SALES: 'Daily_Sales',
    EXPENSES: 'Expenses',
    INVENTORY: 'Inventory',
    MONTHLY_SUMMARY: 'Monthly_Summary',
    SETTINGS: 'Settings',
  };

  const HEADERS = {
    [TABS.DAILY_SALES]: ['Date','Cash Revenue (RM)','QR/DuitNow Revenue (RM)','Total Revenue (RM)','Notes','Timestamp'],
    [TABS.EXPENSES]: ['Date','Category','Amount (RM)','Type','Vendor','Status','Notes','Timestamp'],
    [TABS.INVENTORY]: ['Item Name','Quantity','Unit','Min Alert Quantity','Notes','Timestamp'],
    [TABS.MONTHLY_SUMMARY]: ['Auto-generated summary — do not edit manually'],
    [TABS.SETTINGS]: { headers: ['Key', 'Value'], defaults: [['target_profit', String(DEFAULT_TARGET_PROFIT)]] },
  };

  async function _call(label, apiCall) {
    try {
      if (typeof JambuAuth !== 'undefined' && JambuAuth.withTokenRefresh) {
        return await JambuAuth.withTokenRefresh(apiCall);
      }
      return await apiCall();
    } catch (err) {
      const msg = err?.result?.error?.message || err?.message || String(err);
      console.error(`[JambuSheets] ${label} failed:`, msg);
      throw new Error(`${label}: ${msg}`);
    }
  }

  function _requireInit() {
    if (!spreadsheetId) {
      throw new Error('[JambuSheets] No active ledger. Call initLedger() first.');
    }
  }

  // "YYYY-MM" key for grouping rows by month (timezone-safe for ISO dates).
  function _monthKey(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const y = dateStr.includes('-') ? d.getUTCFullYear() : d.getFullYear();
    const m = dateStr.includes('-') ? d.getUTCMonth() : d.getMonth();
    return `${y}-${String(m + 1).padStart(2, '0')}`;
  }

  async function _repairColumnAlignments() {
    _requireInit();
    console.info('[JambuSheets] Running auto-repair check for column alignments...');

    try {
      const expResponse = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${TABS.EXPENSES}!A2:P`,
      });
      const expRows = expResponse.result.values || [];
      let expUpdated = false;
      const expBatchUpdates = [];
      for (let i = 0; i < expRows.length; i++) {
        const row = expRows[i];
        const rowNum = i + 2;
        const hasDataInH = row.length > 7 && row[7];
        const isEmptyBeforeH = row.slice(0, 7).every(val => !val);
        if (hasDataInH && isEmptyBeforeH) {
          const shiftedData = row.slice(7);
          const correctedRow = [...shiftedData];
          while (correctedRow.length < 8) correctedRow.push('');
          expBatchUpdates.push({ range: `${TABS.EXPENSES}!A${rowNum}:H${rowNum}`, values: [correctedRow] });
          const clearLength = row.length - 8;
          if (clearLength > 0) {
            expBatchUpdates.push({
              range: `${TABS.EXPENSES}!I${rowNum}:${String.fromCharCode(73 + clearLength - 1)}${rowNum}`,
              values: [Array(clearLength).fill('')],
            });
          }
          expUpdated = true;
        }
      }
      if (expUpdated && expBatchUpdates.length > 0) {
        await gapi.client.sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          resource: { valueInputOption: 'USER_ENTERED', data: expBatchUpdates },
        });
        console.info('[JambuSheets] Expenses alignment repair complete.');
      }
    } catch (err) { console.error('[JambuSheets] Expenses repair failed:', err); }

    try {
      const salesResponse = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${TABS.DAILY_SALES}!A2:L`,
      });
      const salesRows = salesResponse.result.values || [];
      let salesUpdated = false;
      const salesBatchUpdates = [];
      for (let i = 0; i < salesRows.length; i++) {
        const row = salesRows[i];
        const rowNum = i + 2;
        const hasDataInF = row.length > 5 && row[5];
        const isEmptyBeforeF = row.slice(0, 5).every(val => !val);
        if (hasDataInF && isEmptyBeforeF) {
          const correctedRow = [...row.slice(5)];
          while (correctedRow.length < 6) correctedRow.push('');
          salesBatchUpdates.push({ range: `${TABS.DAILY_SALES}!A${rowNum}:F${rowNum}`, values: [correctedRow] });
          const clearLength = row.length - 6;
          if (clearLength > 0) {
            salesBatchUpdates.push({
              range: `${TABS.DAILY_SALES}!G${rowNum}:${String.fromCharCode(71 + clearLength - 1)}${rowNum}`,
              values: [Array(clearLength).fill('')],
            });
          }
          salesUpdated = true;
        }
      }
      if (salesUpdated && salesBatchUpdates.length > 0) {
        await gapi.client.sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          resource: { valueInputOption: 'USER_ENTERED', data: salesBatchUpdates },
        });
        console.info('[JambuSheets] Daily_Sales alignment repair complete.');
      }
    } catch (err) { console.error('[JambuSheets] Daily_Sales repair failed:', err); }

    try {
      const invResponse = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${TABS.INVENTORY}!A2:L`,
      });
      const invRows = invResponse.result.values || [];
      let invUpdated = false;
      const invBatchUpdates = [];
      for (let i = 0; i < invRows.length; i++) {
        const row = invRows[i];
        const rowNum = i + 2;
        const hasDataInF = row.length > 5 && row[5];
        const isEmptyBeforeF = row.slice(0, 5).every(val => !val);
        if (hasDataInF && isEmptyBeforeF) {
          const correctedRow = [...row.slice(5)];
          while (correctedRow.length < 6) correctedRow.push('');
          invBatchUpdates.push({ range: `${TABS.INVENTORY}!A${rowNum}:F${rowNum}`, values: [correctedRow] });
          const clearLength = row.length - 6;
          if (clearLength > 0) {
            invBatchUpdates.push({
              range: `${TABS.INVENTORY}!G${rowNum}:${String.fromCharCode(71 + clearLength - 1)}${rowNum}`,
              values: [Array(clearLength).fill('')],
            });
          }
          invUpdated = true;
        }
      }
      if (invUpdated && invBatchUpdates.length > 0) {
        await gapi.client.sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          resource: { valueInputOption: 'USER_ENTERED', data: invBatchUpdates },
        });
        console.info('[JambuSheets] Inventory alignment repair complete.');
      }
    } catch (err) { console.error('[JambuSheets] Inventory repair failed:', err); }
  }

  async function _findSheetRowByTimestamp(tabName, timestamp) {
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A:H`,
    });
    const rows = response.result.values || [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length && row[row.length - 1] === timestamp) return i + 1; // 1-based sheet row
    }
    return -1;
  }

  return {
    getSpreadsheetId() { return spreadsheetId; },
    getDefaultCategories() { return DEFAULT_CATEGORIES.slice(); },

    // ---- Multi-ledger management ----
    getLedgers() { return ledgers.slice(); },

    getActiveLedgerName() {
      const l = ledgers.find(x => x.id === spreadsheetId);
      return l ? l.name : 'Ledger';
    },

    // With the drive.file scope, files.list only returns spreadsheets this
    // app created — so every result is one of the user's business ledgers.
    async listLedgers() {
      return _call('List ledgers', async () => {
        const response = await gapi.client.drive.files.list({
          q: `mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
          fields: 'files(id, name)',
          orderBy: 'name',
          spaces: 'drive',
        });
        ledgers = (response.result.files || []).map(f => ({ id: f.id, name: f.name }));
        return ledgers.slice();
      });
    },

    async setActiveLedger(id) {
      const hit = ledgers.find(l => l.id === id);
      if (!hit) throw new Error('[JambuSheets] Unknown ledger id.');
      spreadsheetId = id;
      try { localStorage.setItem(ACTIVE_KEY, id); } catch (e) { /* ignore */ }
      await this._ensureInventoryTabExists();
      try { await _repairColumnAlignments(); } catch (e) { console.warn('[JambuSheets] Repair skipped:', e.message); }
      return id;
    },

    async createLedger(name) {
      const title = (name || '').trim() || DEFAULT_LEDGER_NAME;
      const id = await this._createLedger(title);
      ledgers.push({ id, name: title });
      ledgers.sort((a, b) => a.name.localeCompare(b.name));
      return id;
    },

    async renameLedger(id, newName) {
      const title = (newName || '').trim();
      if (!title) throw new Error('[JambuSheets] renameLedger: name required.');
      return _call('Rename ledger', async () => {
        await gapi.client.drive.files.update({ fileId: id, resource: { name: title } });
        const l = ledgers.find(x => x.id === id);
        if (l) l.name = title;
        return true;
      });
    },

    async initLedger() {
      // A shared link always wins — it points at someone else's ledger by id.
      const sharedId = (typeof JambuShare !== 'undefined') ? JambuShare.getSharedSheetId() : null;
      if (sharedId) {
        spreadsheetId = sharedId;
        ledgers = [{ id: sharedId, name: 'Shared Ledger' }];
        console.info(`[JambuSheets] Using shared ledger from link: ${spreadsheetId}`);
        try { await this._ensureInventoryTabExists(); } catch (e) { console.warn('[JambuSheets] Skipped inventory tab check (read-only?):', e.message); }
        try { await _repairColumnAlignments(); } catch (e) { console.warn('[JambuSheets] Skipped repair (read-only?):', e.message); }
        return spreadsheetId;
      }

      await this.listLedgers();
      if (!ledgers.length) {
        // First run: create the user's first business ledger.
        const id = await this._createLedger(DEFAULT_LEDGER_NAME);
        ledgers = [{ id, name: DEFAULT_LEDGER_NAME }];
        spreadsheetId = id;
        console.info(`[JambuSheets] Created first ledger: ${id}`);
      } else {
        let saved = null;
        try { saved = localStorage.getItem(ACTIVE_KEY); } catch (e) { /* ignore */ }
        const hit = ledgers.find(l => l.id === saved);
        spreadsheetId = (hit || ledgers[0]).id;
        console.info(`[JambuSheets] Active ledger: ${this.getActiveLedgerName()} (${spreadsheetId})`);
        await this._ensureInventoryTabExists();
      }
      try { localStorage.setItem(ACTIVE_KEY, spreadsheetId); } catch (e) { /* ignore */ }
      await _repairColumnAlignments();
      return spreadsheetId;
    },

    async _createLedger(title) {
      return _call('Create ledger', async () => {
        const createResponse = await gapi.client.sheets.spreadsheets.create({
          resource: {
            properties: { title },
            sheets: [
              { properties: { title: TABS.DAILY_SALES, index: 0 } },
              { properties: { title: TABS.EXPENSES, index: 1 } },
              { properties: { title: TABS.INVENTORY, index: 2 } },
              { properties: { title: TABS.MONTHLY_SUMMARY, index: 3 } },
              { properties: { title: TABS.SETTINGS, index: 4 } },
            ],
          },
        });
        const id = createResponse.result.spreadsheetId;
        const settingsValues = [
          HEADERS[TABS.SETTINGS].headers,
          ...HEADERS[TABS.SETTINGS].defaults,
          ['categories', JSON.stringify(DEFAULT_CATEGORIES)],
        ];
        await gapi.client.sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: id,
          resource: {
            valueInputOption: 'RAW',
            data: [
              { range: `${TABS.DAILY_SALES}!A1:F1`, values: [HEADERS[TABS.DAILY_SALES]] },
              { range: `${TABS.EXPENSES}!A1:H1`, values: [HEADERS[TABS.EXPENSES]] },
              { range: `${TABS.INVENTORY}!A1:F1`, values: [HEADERS[TABS.INVENTORY]] },
              { range: `${TABS.MONTHLY_SUMMARY}!A1`, values: [HEADERS[TABS.MONTHLY_SUMMARY]] },
              { range: `${TABS.SETTINGS}!A1:B${settingsValues.length}`, values: settingsValues },
            ],
          },
        });
        return id;
      });
    },

    async _ensureInventoryTabExists() {
      _requireInit();
      return _call('Ensure inventory tab exists', async () => {
        const metadata = await gapi.client.sheets.spreadsheets.get({ spreadsheetId });
        const sheets = metadata.result.sheets || [];
        const hasInventory = sheets.some(s => s.properties.title === TABS.INVENTORY);
        if (!hasInventory) {
          console.info(`[JambuSheets] Upgrading ledger: adding ${TABS.INVENTORY} tab.`);
          await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: { requests: [{ addSheet: { properties: { title: TABS.INVENTORY } } }] }
          });
          await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${TABS.INVENTORY}!A1:F1`,
            valueInputOption: 'RAW',
            resource: { values: [HEADERS[TABS.INVENTORY]] },
          });
        }
      });
    },

    // ---- Categories (stored per-ledger in its Settings tab) ----
    async getCategories() {
      _requireInit();
      let raw = null;
      try { raw = await this.getSetting('categories', null); } catch (e) { /* ignore */ }
      if (raw) {
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length) return arr;
        } catch (e) { console.warn('[JambuSheets] Bad categories JSON, using defaults.'); }
      }
      try { await this.setCategories(DEFAULT_CATEGORIES); } catch (e) { /* read-only share, ignore */ }
      return DEFAULT_CATEGORIES.slice();
    },

    async setCategories(list) {
      _requireInit();
      return this.setSetting('categories', JSON.stringify(list || []));
    },

    async renameCategoryInExpenses(oldName, newName) {
      _requireInit();
      if (!oldName || !newName) throw new Error('[JambuSheets] renameCategoryInExpenses: both names required.');
      return _call('Rename category in records', async () => {
        const resp = await gapi.client.sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${TABS.EXPENSES}!B2:B`,
        });
        const rows = resp.result.values || [];
        const data = [];
        rows.forEach((r, i) => {
          if (r[0] === oldName) data.push({ range: `${TABS.EXPENSES}!B${i + 2}`, values: [[newName]] });
        });
        if (data.length) {
          await gapi.client.sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            resource: { valueInputOption: 'RAW', data },
          });
        }
        return data.length;
      });
    },

    // ---- Monthly summary ----
    async updateMonthlySummary() {
      _requireInit();
      const [sales, expenses] = await Promise.all([this.getSalesData(), this.getExpensesData()]);
      const months = {};
      (sales || []).forEach(r => {
        const k = _monthKey(r[0]);
        if (!k) return;
        months[k] = months[k] || { rev: 0, cogs: 0, opex: 0 };
        months[k].rev += (parseFloat(r[1]) || 0) + (parseFloat(r[2]) || 0);
      });
      (expenses || []).forEach(r => {
        const k = _monthKey(r[0]);
        if (!k) return;
        months[k] = months[k] || { rev: 0, cogs: 0, opex: 0 };
        const amt = parseFloat(r[2]) || 0;
        if ((r[3] || '') === 'Direct (COGS)') months[k].cogs += amt; else months[k].opex += amt;
      });
      const keys = Object.keys(months).sort();
      const rows = [['Month', 'Revenue (RM)', 'COGS (RM)', 'OPEX (RM)', 'Net Profit (RM)', 'Gross Margin %']];
      keys.forEach(k => {
        const m = months[k];
        const net = m.rev - m.cogs - m.opex;
        const margin = m.rev > 0 ? (((m.rev - m.cogs) / m.rev) * 100).toFixed(1) : '0.0';
        rows.push([k, m.rev.toFixed(2), m.cogs.toFixed(2), m.opex.toFixed(2), net.toFixed(2), margin]);
      });
      return _call('Update monthly summary', async () => {
        await gapi.client.sheets.spreadsheets.values.clear({ spreadsheetId, range: `${TABS.MONTHLY_SUMMARY}!A:F` });
        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${TABS.MONTHLY_SUMMARY}!A1`,
          valueInputOption: 'RAW',
          resource: { values: rows },
        });
        return rows.length - 1;
      });
    },

    async appendSalesRow({ date, cash = 0, qr = 0, notes = '' }) {
      _requireInit();
      if (!date) throw new Error('[JambuSheets] appendSalesRow: "date" is required.');
      if (typeof JambuOffline !== 'undefined' && !navigator.onLine) {
        JambuOffline.enqueue('sale', { date, cash, qr, notes }, spreadsheetId);
        return { queued: true };
      }
      return _call('Append sales row', async () => {
        const rowNum = await this._getNextRow(TABS.DAILY_SALES);
        const values = [[date, cash, qr, `=B${rowNum}+C${rowNum}`, notes, new Date().toISOString()]];
        const response = await gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${TABS.DAILY_SALES}!A:A`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          resource: { values },
        });
        return response.result;
      });
    },

    async updateSalesRow(timestamp, { date, cash = 0, qr = 0, notes = '' }) {
      _requireInit();
      if (!timestamp) throw new Error('[JambuSheets] updateSalesRow: timestamp required.');
      return _call('Update sales row', async () => {
        const rowNum = await _findSheetRowByTimestamp(TABS.DAILY_SALES, timestamp);
        if (rowNum === -1) throw new Error('Original sales entry not found.');
        const values = [[date, cash, qr, `=B${rowNum}+C${rowNum}`, notes, timestamp]];
        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${TABS.DAILY_SALES}!A${rowNum}:F${rowNum}`,
          valueInputOption: 'USER_ENTERED',
          resource: { values },
        });
        return true;
      });
    },

    async getSalesData() {
      _requireInit();
      try {
        const rows = await _call('Get sales data', async () => {
          const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${TABS.DAILY_SALES}!A2:F`,
          });
          return response.result.values || [];
        });
        if (typeof JambuOffline !== 'undefined') JambuOffline.cache(`sales_${spreadsheetId}`, rows);
        return rows;
      } catch (e) {
        if (typeof JambuOffline !== 'undefined') {
          console.warn('[JambuSheets] Offline fallback for sales data.');
          return JambuOffline.getCached(`sales_${spreadsheetId}`);
        }
        throw e;
      }
    },

    async appendExpenseRow({ date, category, amount = 0, type = 'Direct (COGS)', vendor = 'General', status = 'Paid', notes = '' }) {
      _requireInit();
      if (!date) throw new Error('[JambuSheets] appendExpenseRow: "date" is required.');
      if (!category) throw new Error('[JambuSheets] appendExpenseRow: "category" is required.');
      if (typeof JambuOffline !== 'undefined' && !navigator.onLine) {
        JambuOffline.enqueue('expense', { date, category, amount, type, vendor, status, notes }, spreadsheetId);
        return { queued: true };
      }
      return _call('Append expense row', async () => {
        const values = [[date, category, amount, type, vendor, status, notes, new Date().toISOString()]];
        const response = await gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${TABS.EXPENSES}!A:A`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          resource: { values },
        });
        return response.result;
      });
    },

    async updateExpenseRow(timestamp, { date, category, amount = 0, type = 'Direct (COGS)', vendor = 'General', status = 'Paid', notes = '' }) {
      _requireInit();
      if (!timestamp) throw new Error('[JambuSheets] updateExpenseRow: timestamp required.');
      return _call('Update expense row', async () => {
        const rowNum = await _findSheetRowByTimestamp(TABS.EXPENSES, timestamp);
        if (rowNum === -1) throw new Error('Original expense entry not found.');
        const values = [[date, category, amount, type, vendor, status, notes, timestamp]];
        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${TABS.EXPENSES}!A${rowNum}:H${rowNum}`,
          valueInputOption: 'USER_ENTERED',
          resource: { values },
        });
        return true;
      });
    },

    async getExpensesData() {
      _requireInit();
      try {
        const rows = await _call('Get expenses data', async () => {
          const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${TABS.EXPENSES}!A2:H`,
          });
          return response.result.values || [];
        });
        if (typeof JambuOffline !== 'undefined') JambuOffline.cache(`expenses_${spreadsheetId}`, rows);
        return rows;
      } catch (e) {
        if (typeof JambuOffline !== 'undefined') {
          console.warn('[JambuSheets] Offline fallback for expenses data.');
          return JambuOffline.getCached(`expenses_${spreadsheetId}`);
        }
        throw e;
      }
    },

    async getTargetProfit() {
      _requireInit();
      try {
        return await _call('Get target profit', async () => {
          const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${TABS.SETTINGS}!B2`,
          });
          const val = response.result.values;
          if (val && val[0] && val[0][0]) {
            const parsed = parseFloat(val[0][0]);
            return Number.isFinite(parsed) ? parsed : DEFAULT_TARGET_PROFIT;
          }
          return DEFAULT_TARGET_PROFIT;
        });
      } catch (err) {
        console.warn('[JambuSheets] getTargetProfit fallback:', err.message);
        return DEFAULT_TARGET_PROFIT;
      }
    },

    async setTargetProfit(amount) {
      _requireInit();
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
        throw new Error('[JambuSheets] setTargetProfit: amount must be a non-negative number.');
      }
      return this.setSetting('target_profit', amount);
    },

    async getSetting(key, defaultValue = null) {
      _requireInit();
      return _call('Get setting', async () => {
        const response = await gapi.client.sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${TABS.SETTINGS}!A2:B`,
        });
        const rows = response.result.values || [];
        for (const row of rows) {
          if (row[0] === key) return row[1] ?? defaultValue;
        }
        return defaultValue;
      });
    },

    async setSetting(key, value) {
      _requireInit();
      return _call('Set setting', async () => {
        const response = await gapi.client.sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${TABS.SETTINGS}!A2:B`,
        });
        const rows = response.result.values || [];
        let targetRow = -1;
        for (let i = 0; i < rows.length; i++) {
          if (rows[i][0] === key) { targetRow = i + 2; break; }
        }
        if (targetRow > 0) {
          const updateResponse = await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${TABS.SETTINGS}!A${targetRow}:B${targetRow}`,
            valueInputOption: 'RAW',
            resource: { values: [[key, String(value)]] },
          });
          return updateResponse.result;
        } else {
          const appendResponse = await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `${TABS.SETTINGS}!A:A`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: { values: [[key, String(value)]] },
          });
          return appendResponse.result;
        }
      });
    },

    async _getNextRow(sheetName) {
      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:A`,
      });
      return (response.result.values || []).length + 1;
    },

    // Bug fix #3: match timestamp in its specific column only, not row.includes()
    async deleteRowByTimestamp(tabName, timestamp) {
      _requireInit();
      if (!tabName || !timestamp) {
        throw new Error('[JambuSheets] deleteRowByTimestamp: tabName and timestamp are required.');
      }
      return _call('Delete row by timestamp', async () => {
        const response = await gapi.client.sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${tabName}!A:H`,
        });
        const rows = response.result.values || [];
        let foundIndex = -1;
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const lastVal = row[row.length - 1];
          if (lastVal === timestamp) { foundIndex = i; break; }
        }
        if (foundIndex === -1) {
          console.warn(`[JambuSheets] Row with timestamp ${timestamp} not found in ${tabName}.`);
          return false;
        }
        const metadata = await gapi.client.sheets.spreadsheets.get({ spreadsheetId });
        const sheet = (metadata.result.sheets || []).find(s => s.properties.title === tabName);
        if (!sheet) throw new Error(`Sheet ${tabName} not found.`);
        await gapi.client.sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          resource: {
            requests: [{
              deleteDimension: {
                range: { sheetId: sheet.properties.sheetId, dimension: 'ROWS', startIndex: foundIndex, endIndex: foundIndex + 1 },
              },
            }],
          },
        });
        return true;
      });
    },

    async getInventoryData() {
      _requireInit();
      try {
        const rows = await _call('Get inventory data', async () => {
          const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${TABS.INVENTORY}!A2:F`,
          });
          return response.result.values || [];
        });
        if (typeof JambuOffline !== 'undefined') JambuOffline.cache(`inventory_${spreadsheetId}`, rows);
        return rows;
      } catch (e) {
        if (typeof JambuOffline !== 'undefined') {
          console.warn('[JambuSheets] Offline fallback for inventory data.');
          return JambuOffline.getCached(`inventory_${spreadsheetId}`);
        }
        throw e;
      }
    },

    async saveInventoryItem({ originalName, name, quantity, unit, minAlert, notes = '' }) {
      _requireInit();
      if (!name) throw new Error('[JambuSheets] saveInventoryItem: "name" is required.');
      return _call('Save inventory item', async () => {
        const rows = await this.getInventoryData();
        const searchName = originalName || name;
        let foundIndex = -1;
        for (let i = 0; i < rows.length; i++) {
          if (rows[i][0] && rows[i][0].toLowerCase() === searchName.toLowerCase()) { foundIndex = i; break; }
        }
        const values = [[name, quantity, unit, minAlert, notes, new Date().toISOString()]];
        if (foundIndex !== -1) {
          const rowNum = foundIndex + 2;
          await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${TABS.INVENTORY}!A${rowNum}:F${rowNum}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values },
          });
        } else {
          if (!originalName) {
            const nameExists = rows.some(r => r[0] && r[0].toLowerCase() === name.toLowerCase());
            if (nameExists) throw new Error(`An item named "${name}" already exists.`);
          }
          await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `${TABS.INVENTORY}!A:A`,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: { values },
          });
        }
      });
    },

    async updateInventoryQuantity(name, newQuantity) {
      _requireInit();
      if (!name) throw new Error('[JambuSheets] updateInventoryQuantity: "name" is required.');
      return _call('Update inventory quantity', async () => {
        const rows = await this.getInventoryData();
        let foundIndex = -1;
        for (let i = 0; i < rows.length; i++) {
          if (rows[i][0] && rows[i][0].toLowerCase() === name.toLowerCase()) { foundIndex = i; break; }
        }
        if (foundIndex === -1) throw new Error(`Inventory item "${name}" not found.`);
        const rowNum = foundIndex + 2;
        await gapi.client.sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          resource: {
            valueInputOption: 'USER_ENTERED',
            data: [
              { range: `${TABS.INVENTORY}!B${rowNum}`, values: [[newQuantity]] },
              { range: `${TABS.INVENTORY}!F${rowNum}`, values: [[new Date().toISOString()]] },
            ],
          },
        });
      });
    },

    async deleteInventoryItem(name) {
      _requireInit();
      if (!name) throw new Error('[JambuSheets] deleteInventoryItem: "name" is required.');
      return _call('Delete inventory item', async () => {
        const rows = await this.getInventoryData();
        let foundIndex = -1;
        for (let i = 0; i < rows.length; i++) {
          if (rows[i][0] && rows[i][0].toLowerCase() === name.toLowerCase()) { foundIndex = i; break; }
        }
        if (foundIndex === -1) {
          console.warn(`[JambuSheets] Inventory item "${name}" not found.`);
          return false;
        }
        const sheetIndex = foundIndex + 1;
        const metadata = await gapi.client.sheets.spreadsheets.get({ spreadsheetId });
        const sheet = (metadata.result.sheets || []).find(s => s.properties.title === TABS.INVENTORY);
        if (!sheet) throw new Error(`Sheet ${TABS.INVENTORY} not found.`);
        await gapi.client.sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          resource: {
            requests: [{
              deleteDimension: {
                range: { sheetId: sheet.properties.sheetId, dimension: 'ROWS', startIndex: sheetIndex, endIndex: sheetIndex + 1 },
              },
            }],
          },
        });
        return true;
      });
    },

    getSpreadsheetUrl() {
      if (!spreadsheetId) return null;
      return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    },
  };
})();
