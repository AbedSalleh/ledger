// ============================================================
// JambuApp — Main application controller
// (Jambu* is a legacy internal namespace — not user-visible.)
// ============================================================

const CONFIG = {
  CLIENT_ID: '905579408027-vbfp6i4asha3g4eeoros34605u92gos0.apps.googleusercontent.com',
  API_KEY: 'YOUR_API_KEY',
};

const JambuApp = (() => {
  let currentView = 'dashboard';
  let isInitialized = false;
  let categories = [];        // [{name, type:'COGS'|'OPEX', color}]
  let editState = null;       // { kind:'sale'|'expense', timestamp } when editing a record
  let editingCat = null;      // original name of the category being edited, or null
  let selectedColor = '#6B7280';

  const PRESET_COLORS = [
    '#EF4444', '#F97316', '#F59E0B', '#EAB308',
    '#84CC16', '#10B981', '#14B8A6', '#06B6D4',
    '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280',
  ];

  function $(id) { return document.getElementById(id); }

  function typeLabel(catType) {
    return catType === 'OPEX' ? 'Indirect (OPEX)' : 'Direct (COGS)';
  }

  return {
    async init() {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const salesDate = $('sales-date');
      const expenseDate = $('expense-date');
      if (salesDate) salesDate.value = today;
      if (expenseDate) expenseDate.value = today;

      if (typeof JambuOffline !== 'undefined') JambuOffline.init();

      JambuAuth.init(CONFIG.CLIENT_ID, async (signedIn, user) => {
        if (signedIn) {
          this._showApp(user);
          try {
            await JambuSheets.initLedger();
            this._refreshLedgerTitle();
            await this.loadCategories();
            await JambuDashboard.load();
            this.populateVendorSuggestions();
            isInitialized = true;
            if (typeof JambuShare !== 'undefined') JambuShare.applyRole(JambuShare.getRole());
          } catch (e) {
            console.error('Init error:', e);
            this.showToast('Failed to initialize ledger. Please try again.', 'error');
          }
        } else {
          this._showLogin();
        }
      });

      // Auto-classify COGS/OPEX from the chosen category.
      const categorySelect = $('expense-category');
      const typeSelect = $('expense-type');
      if (categorySelect && typeSelect) {
        categorySelect.addEventListener('change', () => {
          const cat = categories.find(c => c.name === categorySelect.value);
          if (cat) typeSelect.value = typeLabel(cat.type);
        });
      }
    },

    // ---- Multi-ledger (businesses) ----
    _refreshLedgerTitle() {
      const name = JambuSheets.getActiveLedgerName();
      const el = $('ledger-title');
      if (el) el.textContent = name;
      document.title = `${name} — Ledger`;
    },

    openLedgers() {
      const m = $('ledger-modal');
      if (!m) return;
      this.renderLedgerList();
      const inp = $('new-ledger-name');
      if (inp) inp.value = '';
      m.classList.remove('hidden');
      m.classList.add('flex');
    },

    closeLedgers() {
      const m = $('ledger-modal');
      if (!m) return;
      m.classList.add('hidden');
      m.classList.remove('flex');
    },

    renderLedgerList() {
      const list = $('ledger-list');
      if (!list) return;
      list.innerHTML = '';
      const active = JambuSheets.getSpreadsheetId();
      const ledgers = JambuSheets.getLedgers();
      if (!ledgers.length) {
        list.innerHTML = '<p class="text-xs text-gray-400 italic">No businesses yet — add one below.</p>';
        return;
      }
      ledgers.forEach(l => {
        const isActive = l.id === active;
        const row = document.createElement('div');
        row.className = `flex items-center gap-2 p-2.5 rounded-xl border transition-all ${isActive ? 'border-brand-600 bg-slate-50' : 'border-slate-200 hover:bg-slate-50 cursor-pointer'}`;
        const dot = document.createElement('span');
        dot.className = `w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-emerald-500' : 'bg-slate-300'}`;
        const name = document.createElement('span');
        name.className = 'flex-1 truncate text-sm font-semibold text-gray-800';
        name.textContent = l.name;
        row.appendChild(dot);
        row.appendChild(name);
        if (isActive) {
          const tag = document.createElement('span');
          tag.className = 'text-[10px] font-bold uppercase text-emerald-600';
          tag.textContent = 'Active';
          row.appendChild(tag);
        }
        const rn = document.createElement('button');
        rn.className = 'p-1.5 rounded-lg text-gray-300 hover:text-brand-600 hover:bg-brand-50 active:scale-90 transition-all flex-shrink-0';
        rn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>';
        rn.title = `Rename ${l.name}`;
        rn.onclick = (e) => { e.stopPropagation(); this.renameLedger(l.id); };
        row.appendChild(rn);
        if (!isActive) row.onclick = () => this.switchLedger(l.id);
        list.appendChild(row);
      });
    },

    async switchLedger(id) {
      if (id === JambuSheets.getSpreadsheetId()) { this.closeLedgers(); return; }
      try {
        this.showToast('Switching business...', 'info');
        await JambuSheets.setActiveLedger(id);
        this._refreshLedgerTitle();
        this.closeLedgers();
        await this.loadCategories();
        await JambuDashboard.load();
        this.populateVendorSuggestions();
        this.showToast(`Switched to ${JambuSheets.getActiveLedgerName()}`, 'success');
      } catch (e) {
        console.error('Switch ledger error:', e);
        this.showToast('Failed to switch business', 'error');
      }
    },

    async addLedger() {
      const inp = $('new-ledger-name');
      const name = (inp ? inp.value : '').trim();
      if (!name) { this.showToast('Enter a business name', 'error'); return; }
      const btn = $('btn-add-ledger');
      if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }
      try {
        const id = await JambuSheets.createLedger(name);
        if (inp) inp.value = '';
        await this.switchLedger(id);
      } catch (e) {
        console.error('Add ledger error:', e);
        this.showToast('Failed to create business', 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Add'; }
      }
    },

    async renameLedger(id) {
      const l = JambuSheets.getLedgers().find(x => x.id === id);
      if (!l) return;
      const nn = prompt('Rename business:', l.name);
      if (!nn || !nn.trim() || nn.trim() === l.name) return;
      try {
        await JambuSheets.renameLedger(id, nn.trim());
        this.renderLedgerList();
        this._refreshLedgerTitle();
        this.showToast('Business renamed', 'success');
      } catch (e) {
        console.error('Rename ledger error:', e);
        this.showToast('Failed to rename', 'error');
      }
    },

    // ---- Categories ----
    async loadCategories() {
      try {
        categories = await JambuSheets.getCategories();
      } catch (e) {
        console.warn('Could not load categories, using defaults:', e);
        categories = JambuSheets.getDefaultCategories();
      }
      this._populateCategorySelect();
      const colorMap = {};
      categories.forEach(c => { colorMap[c.name] = c.color; });
      if (typeof JambuDashboard !== 'undefined' && JambuDashboard.setCategoryColors) {
        JambuDashboard.setCategoryColors(colorMap);
      }
    },

    _populateCategorySelect() {
      const sel = $('expense-category');
      if (!sel) return;
      const current = sel.value;
      sel.innerHTML = '<option value="" disabled selected>Select category...</option>';
      categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        sel.appendChild(opt);
      });
      if (current && categories.some(c => c.name === current)) sel.value = current;
    },

    _renderPalette() {
      const pal = $('cat-color-palette');
      if (!pal) return;
      pal.innerHTML = '';
      PRESET_COLORS.forEach(c => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', `Color ${c}`);
        b.style.cssText = `width:24px;height:24px;border-radius:50%;background:${c};border:2px solid ${c.toLowerCase() === (selectedColor || '').toLowerCase() ? '#0F172A' : 'transparent'};box-shadow:0 0 0 1px rgba(0,0,0,0.08);`;
        b.onclick = () => {
          selectedColor = c;
          const inp = $('new-cat-color');
          if (inp) inp.value = c;
          this._renderPalette();
        };
        pal.appendChild(b);
      });
    },

    setCustomColor(v) {
      selectedColor = v;
      this._renderPalette();
    },

    _resetCatForm() {
      editingCat = null;
      const nameEl = $('new-cat-name');
      if (nameEl) nameEl.value = '';
      const btn = $('btn-add-cat');
      if (btn) btn.textContent = 'Add';
    },

    startEditCategory(name) {
      const c = categories.find(x => x.name === name);
      if (!c) return;
      editingCat = name;
      const nameEl = $('new-cat-name');
      const typeEl = $('new-cat-type');
      const colorEl = $('new-cat-color');
      if (nameEl) nameEl.value = c.name;
      if (typeEl) typeEl.value = c.type;
      selectedColor = c.color;
      if (colorEl) colorEl.value = c.color;
      this._renderPalette();
      const btn = $('btn-add-cat');
      if (btn) btn.textContent = 'Save';
      if (nameEl) nameEl.focus();
    },

    renderCategoryManager() {
      const list = $('category-list');
      if (!list) return;
      list.innerHTML = '';
      if (!categories.length) {
        list.innerHTML = '<p class="text-xs text-gray-400 italic">No categories yet — add one below.</p>';
        return;
      }
      categories.forEach(c => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-2 text-sm';
        row.innerHTML = `
          <span style="width:10px;height:10px;border-radius:50%;background:${c.color};display:inline-block;flex-shrink:0;"></span>
          <span class="flex-1 truncate text-gray-700">${c.name}</span>
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${c.type === 'COGS' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}">${c.type}</span>
        `;
        const edit = document.createElement('button');
        edit.className = 'p-1 rounded text-gray-300 hover:text-brand-600 hover:bg-brand-50 active:scale-90 transition-all';
        edit.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>';
        edit.title = `Edit ${c.name}`;
        edit.onclick = () => this.startEditCategory(c.name);
        const del = document.createElement('button');
        del.className = 'p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 active:scale-90 transition-all';
        del.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>';
        del.title = `Remove ${c.name}`;
        del.onclick = () => this.deleteCategory(c.name);
        row.appendChild(edit);
        row.appendChild(del);
        list.appendChild(row);
      });
    },

    // Handles both adding a new category and saving an edit of an existing one.
    async addCategory() {
      const nameEl = $('new-cat-name');
      const typeEl = $('new-cat-type');
      const name = (nameEl ? nameEl.value : '').trim();
      const type = (typeEl ? typeEl.value : 'COGS');
      const color = selectedColor || '#6B7280';
      if (!name) { this.showToast('Enter a category name', 'error'); return; }

      if (editingCat) {
        const idx = categories.findIndex(c => c.name === editingCat);
        if (idx === -1) { this._resetCatForm(); return; }
        const dup = categories.some((c, i) => i !== idx && c.name.toLowerCase() === name.toLowerCase());
        if (dup) { this.showToast('That category name already exists', 'error'); return; }
        const oldName = editingCat;
        const prev = categories[idx];
        categories[idx] = { name, type, color };
        try {
          await JambuSheets.setCategories(categories);
          if (oldName !== name && confirm(`Also update existing records from "${oldName}" to "${name}"?`)) {
            try {
              const n = await JambuSheets.renameCategoryInExpenses(oldName, name);
              this.showToast(`Category saved — ${n} record(s) updated.`, 'success');
            } catch (e2) {
              console.error('Rename records error:', e2);
              this.showToast('Category saved, but records could not be updated.', 'error');
            }
          } else {
            this.showToast('Category saved', 'success');
          }
          this._resetCatForm();
          await this.loadCategories();
          this.renderCategoryManager();
          if (currentView === 'dashboard') JambuDashboard.load();
        } catch (e) {
          console.error('Edit category error:', e);
          categories[idx] = prev;
          this.showToast('Failed to save category', 'error');
        }
        return;
      }

      if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        this.showToast('That category already exists', 'error'); return;
      }
      categories.push({ name, type, color });
      try {
        await JambuSheets.setCategories(categories);
        this._resetCatForm();
        await this.loadCategories();
        this.renderCategoryManager();
        this.showToast('Category added', 'success');
      } catch (e) {
        console.error('Add category error:', e);
        categories = categories.filter(c => c.name !== name);
        this.showToast('Failed to add category', 'error');
      }
    },

    async deleteCategory(name) {
      if (!confirm(`Remove category "${name}"? Existing records keep their category label.`)) return;
      if (editingCat === name) this._resetCatForm();
      const prev = categories.slice();
      categories = categories.filter(c => c.name !== name);
      try {
        await JambuSheets.setCategories(categories);
        await this.loadCategories();
        this.renderCategoryManager();
        this.showToast('Category removed', 'success');
      } catch (e) {
        console.error('Delete category error:', e);
        categories = prev;
        this.showToast('Failed to remove category', 'error');
      }
    },

    signIn() { JambuAuth.signIn(); },

    signOut() {
      JambuAuth.signOut();
      isInitialized = false;
      this._showLogin();
    },

    openShare() { if (typeof JambuShare !== 'undefined') JambuShare.openModal(); },

    _showApp(user) {
      const login = $('login-screen');
      const app = $('app-screen');
      if (login) login.style.display = 'none';
      if (app) app.style.display = 'block';
      if (user) {
        const avatar = $('user-avatar');
        if (avatar && user.picture) { avatar.src = user.picture; avatar.style.display = 'block'; }
      }
    },

    _showLogin() {
      const login = $('login-screen');
      const app = $('app-screen');
      if (login) login.style.display = 'flex';
      if (app) app.style.display = 'none';
    },

    switchView(viewName) {
      currentView = viewName;
      // Leaving/entering a form cancels any in-progress record edit.
      editState = null;
      const bs = $('btn-save-sales'); if (bs) bs.textContent = 'Save Sales';
      const be = $('btn-save-expense'); if (be) be.textContent = 'Save Expense';

      ['dashboard', 'sales', 'expenses', 'inventory'].forEach(v => {
        const el = $('view-' + v);
        const nav = $('nav-' + v);
        if (!el || !nav) return;
        if (v === viewName) {
          el.classList.remove('hidden');
          el.classList.remove('animate-fadeIn');
          void el.offsetWidth;
          el.classList.add('animate-fadeIn');
          nav.classList.add('active', 'text-brand-600');
          nav.classList.remove('text-gray-400');
        } else {
          el.classList.add('hidden');
          nav.classList.remove('active', 'text-brand-600');
          nav.classList.add('text-gray-400');
        }
      });
      if (viewName === 'dashboard' && isInitialized) JambuDashboard.load();
      else if (viewName === 'inventory' && isInitialized) JambuInventory.load();
    },

    // ---- Edit an existing transaction (called from dashboard) ----
    editTransaction(kind, raw, timestamp) {
      if (kind === 'sale') {
        this.switchView('sales');
        if ($('sales-date')) $('sales-date').value = raw[0] || '';
        if ($('sales-cash')) $('sales-cash').value = raw[1] || '';
        if ($('sales-qr')) $('sales-qr').value = raw[2] || '';
        if ($('sales-notes')) $('sales-notes').value = raw[4] || '';
        editState = { kind: 'sale', timestamp };
        const b = $('btn-save-sales'); if (b) b.textContent = 'Update Sales';
      } else {
        this.switchView('expenses');
        const isNew = raw.length > 5; // 8-col schema vs legacy
        if ($('expense-date')) $('expense-date').value = raw[0] || '';
        if ($('expense-category')) $('expense-category').value = raw[1] || '';
        if ($('expense-amount')) $('expense-amount').value = raw[2] || '';
        if ($('expense-type')) $('expense-type').value = raw[3] || 'Direct (COGS)';
        if ($('expense-vendor')) $('expense-vendor').value = (raw[4] && raw[4] !== 'General') ? raw[4] : '';
        if ($('expense-status')) $('expense-status').value = raw[5] || 'Paid';
        if ($('expense-notes')) $('expense-notes').value = isNew ? (raw[6] || '') : (raw[3] || '');
        editState = { kind: 'expense', timestamp };
        const b = $('btn-save-expense'); if (b) b.textContent = 'Update Expense';
      }
      this.showToast('Editing entry — change the fields and save', 'info');
    },

    async saveSales() {
      const date = ($('sales-date') || {}).value;
      const cash = ($('sales-cash') || {}).value;
      const qr = ($('sales-qr') || {}).value;
      const notes = ($('sales-notes') || {}).value || '';

      if (!date) { this.showToast('Please select a date', 'error'); return; }

      const cashVal = parseFloat(cash) || 0;
      const qrVal = parseFloat(qr) || 0;

      if (cashVal === 0 && qrVal === 0) {
        this.showToast('Please enter at least one revenue amount', 'error');
        return;
      }
      if (cashVal < 0 || qrVal < 0) { this.showToast('Amounts cannot be negative', 'error'); return; }

      const editing = editState && editState.kind === 'sale' ? editState : null;
      const btn = $('btn-save-sales');
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = editing ? 'Updating...' : 'Saving...';
      try {
        if (editing) {
          await JambuSheets.updateSalesRow(editing.timestamp, { date, cash: cashVal, qr: qrVal, notes });
          this.showToast('Sales entry updated.', 'success');
        } else {
          const result = await JambuSheets.appendSalesRow({ date, cash: cashVal, qr: qrVal, notes });
          if (result && result.queued) this.showToast('No connection — saved offline, will sync later.', 'info');
          else this.showToast('Sales recorded successfully.', 'success');
        }
        editState = null;
        const salesCash = $('sales-cash');
        const salesQR = $('sales-qr');
        const salesNotes = $('sales-notes');
        if (salesCash) salesCash.value = '';
        if (salesQR) salesQR.value = '';
        if (salesNotes) salesNotes.value = '';
        btn.classList.add('animate-pulse-success');
        setTimeout(() => btn.classList.remove('animate-pulse-success'), 600);
        if (editing) JambuDashboard.load();
      } catch (e) {
        console.error('Save sales error:', e);
        this.showToast('Failed to save. Please try again.', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save Sales';
      }
    },

    async saveExpense() {
      const date = ($('expense-date') || {}).value;
      const category = ($('expense-category') || {}).value;
      const amount = ($('expense-amount') || {}).value;
      const type = ($('expense-type') || {}).value || 'Direct (COGS)';
      const vendor = (($('expense-vendor') || {}).value || '').trim() || 'General';
      const status = ($('expense-status') || {}).value || 'Paid';
      const notes = ($('expense-notes') || {}).value || '';

      if (!date) { this.showToast('Please select a date', 'error'); return; }
      if (!category) { this.showToast('Please select a category', 'error'); return; }
      if (!amount) { this.showToast('Please enter an amount', 'error'); return; }
      const amountVal = parseFloat(amount);
      if (isNaN(amountVal) || amountVal <= 0) { this.showToast('Please enter a valid positive amount', 'error'); return; }

      const editing = editState && editState.kind === 'expense' ? editState : null;
      const btn = $('btn-save-expense');
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = editing ? 'Updating...' : 'Saving...';
      try {
        let queued = false;
        if (editing) {
          await JambuSheets.updateExpenseRow(editing.timestamp, { date, category, amount: amountVal, type, vendor, status, notes });
          this.showToast('Expense entry updated.', 'success');
        } else {
          const result = await JambuSheets.appendExpenseRow({ date, category, amount: amountVal, type, vendor, status, notes });
          queued = !!(result && result.queued);
          if (queued) this.showToast('No connection — saved offline, will sync later.', 'info');
          else this.showToast('Expense logged successfully.', 'success');
        }
        editState = null;
        const expenseAmt = $('expense-amount');
        const expenseNotes = $('expense-notes');
        const expenseVendor = $('expense-vendor');
        if (expenseAmt) expenseAmt.value = '';
        if (expenseNotes) expenseNotes.value = '';
        if (expenseVendor) expenseVendor.value = '';
        if (!queued) {
          await JambuDashboard.load();
          this.populateVendorSuggestions();
        }
        btn.classList.add('animate-pulse-success');
        setTimeout(() => btn.classList.remove('animate-pulse-success'), 600);
      } catch (e) {
        console.error('Save expense error:', e);
        this.showToast('Failed to save. Please try again.', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save Expense';
      }
    },

    // ---- Export & summary ----
    async exportCSV() {
      try {
        const [sales, expenses] = await Promise.all([JambuSheets.getSalesData(), JambuSheets.getExpensesData()]);
        const esc = (v) => {
          v = String(v ?? '');
          return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
        };
        let csv = 'SALES\nDate,Cash (RM),QR (RM),Total (RM),Notes,Timestamp\n';
        (sales || []).forEach(r => { csv += [r[0], r[1], r[2], r[3], r[4], r[5]].map(esc).join(',') + '\n'; });
        csv += '\nEXPENSES\nDate,Category,Amount (RM),Type,Vendor,Status,Notes,Timestamp\n';
        (expenses || []).forEach(r => { csv += [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]].map(esc).join(',') + '\n'; });
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const slug = JambuSheets.getActiveLedgerName().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'ledger';
        a.download = `${slug}_export.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
        this.showToast('CSV exported', 'success');
      } catch (e) {
        console.error('Export error:', e);
        this.showToast('Export failed', 'error');
      }
    },

    async updateSummary() {
      const btn = $('btn-update-summary');
      if (btn) { btn.disabled = true; }
      try {
        const n = await JambuSheets.updateMonthlySummary();
        this.showToast(`Monthly summary updated (${n} month${n === 1 ? '' : 's'}).`, 'success');
      } catch (e) {
        console.error('Summary error:', e);
        this.showToast('Failed to update summary', 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    },

    async openSettings() {
      const modal = $('settings-modal');
      if (!modal) return;
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      this._resetCatForm();
      this._renderPalette();
      this.renderCategoryManager();
      try {
        const target = await JambuSheets.getTargetProfit();
        const input = $('settings-target');
        if (input) input.value = target || 2000;
      } catch (e) {
        const input = $('settings-target');
        if (input) input.value = 2000;
      }
    },

    closeSettings() {
      const modal = $('settings-modal');
      if (!modal) return;
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      this._resetCatForm();
    },

    async saveSettings() {
      const input = $('settings-target');
      const target = parseFloat((input || {}).value);
      if (!target || target <= 0) { this.showToast('Please enter a valid target amount', 'error'); return; }
      try {
        await JambuSheets.setTargetProfit(target);
        JambuDashboard.setTarget(target);
        this.closeSettings();
        this.showToast('Target updated successfully.', 'success');
        if (currentView === 'dashboard') JambuDashboard.load();
      } catch (e) {
        console.error('Save settings error:', e);
        this.showToast('Failed to save settings', 'error');
      }
    },

    showToast(message, type = 'info') {
      const container = $('toast-container');
      if (!container) { console.warn('Toast container not found'); return; }
      const toast = document.createElement('div');
      const bgColor = type === 'success' ? 'bg-emerald-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';
      toast.className = `${bgColor} text-white px-6 py-3 rounded-xl shadow-lg text-sm font-medium toast-enter mb-2`;
      toast.style.cssText = 'pointer-events:auto; max-width:90vw; word-break:break-word;';
      toast.textContent = message;
      container.appendChild(toast);
      setTimeout(() => {
        toast.classList.remove('toast-enter');
        toast.classList.add('toast-exit');
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
      }, 3000);
    },

    async populateVendorSuggestions() {
      try {
        const expenses = await JambuSheets.getExpensesData();
        const vendors = new Set();
        expenses.forEach(row => {
          if (row.length >= 5 && row[4] && row[4] !== 'General') vendors.add(row[4].trim());
        });
        const datalist = $('vendor-suggestions');
        if (datalist) {
          datalist.innerHTML = '';
          Array.from(vendors).sort().forEach(vendor => {
            const option = document.createElement('option');
            option.value = vendor;
            datalist.appendChild(option);
          });
        }
      } catch (e) {
        console.warn('Could not populate vendor suggestions:', e);
      }
    }
  };
})();

document.addEventListener('DOMContentLoaded', () => JambuApp.init());
