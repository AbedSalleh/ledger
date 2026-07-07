// ============================================================
// JambuApp — Main application controller
// ============================================================

const CONFIG = {
  CLIENT_ID: '905579408027-vbfp6i4asha3g4eeoros34605u92gos0.apps.googleusercontent.com',
  API_KEY: 'YOUR_API_KEY',
};

const JambuApp = (() => {
  let currentView = 'dashboard';
  let isInitialized = false;
  let categories = [];        // [{name, type:'COGS'|'OPEX', color}]
  let editState = null;       // { kind:'sale'|'expense', timestamp } when editing

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

      JambuAuth.init(CONFIG.CLIENT_ID, async (signedIn, user) => {
        if (signedIn) {
          this._showApp(user);
          try {
            await JambuSheets.initLedger();
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

    // ---- Categories ----
    async loadCategories() {
      try {
        categories = await JambuSheets.getCategories();
      } catch (e) {
        console.warn('Could not load categories, using defaults:', e);
        categories = JambuSheets.getDefaultCategories();
      }
      this._populateCategorySelect();
      // Feed colors to the dashboard breakdown.
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
        const del = document.createElement('button');
        del.className = 'p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 active:scale-90 transition-all';
        del.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>';
        del.title = `Remove ${c.name}`;
        del.onclick = () => this.deleteCategory(c.name);
        row.appendChild(del);
        list.appendChild(row);
      });
    },

    async addCategory() {
      const nameEl = $('new-cat-name');
      const typeEl = $('new-cat-type');
      const colorEl = $('new-cat-color');
      const name = (nameEl ? nameEl.value : '').trim();
      const type = (typeEl ? typeEl.value : 'COGS');
      const color = (colorEl ? colorEl.value : '#6B7280');
      if (!name) { this.showToast('Enter a category name', 'error'); return; }
      if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        this.showToast('That category already exists', 'error'); return;
      }
      categories.push({ name, type, color });
      try {
        await JambuSheets.setCategories(categories);
        this._populateCategorySelect();
        this.renderCategoryManager();
        this.loadCategories();
        if (nameEl) nameEl.value = '';
        this.showToast('Category added', 'success');
      } catch (e) {
        console.error('Add category error:', e);
        categories = categories.filter(c => c.name !== name);
        this.showToast('Failed to add category', 'error');
      }
    },

    async deleteCategory(name) {
      if (!confirm(`Remove category "${name}"? Existing records keep their category label.`)) return;
      const prev = categories.slice();
      categories = categories.filter(c => c.name !== name);
      try {
        await JambuSheets.setCategories(categories);
        this._populateCategorySelect();
        this.renderCategoryManager();
        this.loadCategories();
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
      // Leaving/entering a form cancels any in-progress edit.
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
          await JambuSheets.appendSalesRow({ date, cash: cashVal, qr: qrVal, notes });
          this.showToast('Sales recorded successfully.', 'success');
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
        if (editing) {
          await JambuSheets.updateExpenseRow(editing.timestamp, { date, category, amount: amountVal, type, vendor, status, notes });
          this.showToast('Expense entry updated.', 'success');
        } else {
          await JambuSheets.appendExpenseRow({ date, category, amount: amountVal, type, vendor, status, notes });
          this.showToast('Expense logged successfully.', 'success');
        }
        editState = null;
        const expenseAmt = $('expense-amount');
        const expenseNotes = $('expense-notes');
        const expenseVendor = $('expense-vendor');
        if (expenseAmt) expenseAmt.value = '';
        if (expenseNotes) expenseNotes.value = '';
        if (expenseVendor) expenseVendor.value = '';
        await JambuDashboard.load();
        this.populateVendorSuggestions();
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

    async openSettings() {
      const modal = $('settings-modal');
      if (!modal) return;
      modal.classList.remove('hidden');
      modal.classList.add('flex');
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
