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

  function $(id) { return document.getElementById(id); }

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
            await JambuDashboard.load();
            this.populateVendorSuggestions();
            isInitialized = true;
            // Apply UI restrictions if opened via a shared link with a role.
            if (typeof JambuShare !== 'undefined') JambuShare.applyRole(JambuShare.getRole());
          } catch (e) {
            console.error('Init error:', e);
            this.showToast('Failed to initialize ledger. Please try again.', 'error');
          }
        } else {
          this._showLogin();
        }
      });

      const categorySelect = $('expense-category');
      const typeSelect = $('expense-type');
      if (categorySelect && typeSelect) {
        categorySelect.addEventListener('change', () => {
          const directCategories = ['Fresh Guava', 'Fertilizer/Pesticide', 'Seedlings/Soil', 'Packaging'];
          typeSelect.value = directCategories.includes(categorySelect.value)
            ? 'Direct (COGS)'
            : 'Indirect (OPEX)';
        });
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

      const btn = $('btn-save-sales');
      if (!btn) return;
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = 'Saving...';
      try {
        await JambuSheets.appendSalesRow({ date, cash: cashVal, qr: qrVal, notes });
        this.showToast('Sales recorded successfully.', 'success');
        const salesCash = $('sales-cash');
        const salesQR = $('sales-qr');
        const salesNotes = $('sales-notes');
        if (salesCash) salesCash.value = '';
        if (salesQR) salesQR.value = '';
        if (salesNotes) salesNotes.value = '';
        btn.classList.add('animate-pulse-success');
        setTimeout(() => btn.classList.remove('animate-pulse-success'), 600);
      } catch (e) {
        console.error('Save sales error:', e);
        this.showToast('Failed to save. Please try again.', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = originalText || 'Save Sales';
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

      const btn = $('btn-save-expense');
      if (!btn) return;
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = 'Saving...';
      try {
        await JambuSheets.appendExpenseRow({ date, category, amount: amountVal, type, vendor, status, notes });
        this.showToast('Expense logged successfully.', 'success');
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
        btn.textContent = originalText || 'Save Expense';
      }
    },

    async openSettings() {
      const modal = $('settings-modal');
      if (!modal) return;
      modal.classList.remove('hidden');
      modal.classList.add('flex');
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
