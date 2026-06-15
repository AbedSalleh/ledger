/**
 * @fileoverview Google Sheets / Drive CRUD module for Jambu Batu Ledger.
 * Handles spreadsheet discovery, creation, and all read/write operations
 * against the four ledger tabs (Daily_Sales, Expenses, Inventory, Settings).
 *
 * Depends on:
 *   - `gapi.client.sheets` and `gapi.client.drive` being initialised (via auth.js).
 *   - `JambuAuth.withTokenRefresh()` for automatic 401 handling.
 *
 * Exposes a global `JambuSheets` object.
 */

const JambuSheets = (() => {
  let spreadsheetId = null;
  const SPREADSHEET_NAME = 'Jambu_Batu_Ledger';
  const DEFAULT_TARGET_PROFIT = 2000;

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
      throw new Error('[JambuSheets] Spreadsheet not initialised. Call initLedger() first.');
    }
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

  return {
    getSpreadsheetId() { return spreadsheetId; },

    async initLedger() {
      // If a shared link supplied a spreadsheet ID, use that ledger directly
      // (works via the 'spreadsheets' scope even though drive.file wouldn't list it).
      const sharedId = (typeof JambuShare !== 'undefined') ? JambuShare.getSharedSheetId() : null;
      if (sharedId) {
        spreadsheetId = sharedId;
        console.info(`[JambuSheets] Using shared ledger from link: ${spreadsheetId}`);
        // Best-effort maintenance — a view-only (Drive reader) user cannot write,
        // so these are wrapped to fail gracefully.
        try { await this._ensureInventoryTabExists(); } catch (e) { console.warn('[JambuSheets] Skipped inventory tab check (read-only?):', e.message); }
        try { await _repairColumnAlignments(); } catch (e) { console.warn('[JambuSheets] Skipped repair (read-only?):', e.message); }
        return spreadsheetId;
      }

      const files = await this._findLedger();
      if (files && files.length > 0) {
        spreadsheetId = files[0].id;
        console.info(`[JambuSheets] Found existing ledger: ${spreadsheetId}`);
        await this._ensureInventoryTabExists();
      } else {
        spreadsheetId = await this._createLedger();
        console.info(`[JambuSheets] Created new ledger: ${spreadsheetId}`);
      }
      await _repairColumnAlignments();
      return spreadsheetId;
    },

    async _findLedger() {
      return _call('Find ledger', async () => {
        const response = await gapi.client.drive.files.list({
          q: `name='${SPREADSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
          fields: 'files(id, name)',
          spaces: 'drive',
        });
        return response.result.files || [];
      });
    },

    async _createLedger() {
      return _call('Create ledger', async () => {
        const createResponse = await gapi.client.sheets.spreadsheets.create({
          resource: {
            properties: { title: SPREADSHEET_NAME },
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
        const settingsValues = [HEADERS[TABS.SETTINGS].headers, ...HEADERS[TABS.SETTINGS].defaults];
        await gapi.client.sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: id,
          resource: {
            valueInputOption: 'RAW',
            data: [
              { range: `${TABS.DAILY_SALES}!A1:F1`, values: [HEADERS[TABS.DAILY_SALES]] },
              { range: `${TABS.EXPENSES}!A1:H1`, values: [HEADERS[TABS.EXPENSES]] },
              { range: `${TABS.INVENTORY}!A1:F1`, values: [HEADERS[TABS.INVENTORY]] },
              { range: `${TABS.MONTHLY_SUMMARY}!A1`, values: [HEADERS[TABS.MONTHLY_SUMMARY]] },
              { range: `${TABS.SETTINGS}!A1:B${1 + settingsValues.length - 1}`, values: settingsValues },
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

    async appendSalesRow({ date, cash = 0, qr = 0, notes = '' }) {
      _requireInit();
      if (!date) throw new Error('[JambuSheets] appendSalesRow: "date" is required.');
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

    async getSalesData() {
      _requireInit();
      return _call('Get sales data', async () => {
        const response = await gapi.client.sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${TABS.DAILY_SALES}!A2:F`,
        });
        return response.result.values || [];
      });
    },

    async appendExpenseRow({ date, category, amount = 0, type = 'Direct (COGS)', vendor = 'General', status = 'Paid', notes = '' }) {
      _requireInit();
      if (!date) throw new Error('[JambuSheets] appendExpenseRow: "date" is required.');
      if (!category) throw new Error('[JambuSheets] appendExpenseRow: "category" is required.');
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

    async getExpensesData() {
      _requireInit();
      return _call('Get expenses data', async () => {
        const response = await gapi.client.sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${TABS.EXPENSES}!A2:H`,
        });
        return response.result.values || [];
      });
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
      return _call('Set target profit', async () => {
        const response = await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${TABS.SETTINGS}!B2`,
          valueInputOption: 'RAW',
          resource: { values: [[amount]] },
        });
        return response.result;
      });
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
            resource: { values: [[key, value]] },
          });
          return updateResponse.result;
        } else {
          const appendResponse = await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `${TABS.SETTINGS}!A:A`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: { values: [[key, value]] },
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
          // Timestamp is always the last populated column (index 5 for sales, 7 for expenses)
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
      return _call('Get inventory data', async () => {
        const response = await gapi.client.sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${TABS.INVENTORY}!A2:F`,
        });
        return response.result.values || [];
      });
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
