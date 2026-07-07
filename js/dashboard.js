// ============================================================
// JambuDashboard — Dashboard data fetching & rendering
// ============================================================

const JambuDashboard = (() => {
  let currentMonth = new Date().getMonth();
  let currentYear = new Date().getFullYear();
  let targetProfit = 2000;
  let allTxEntries = [];
  let dynamicColors = {}; // category name -> color, supplied by JambuApp

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  // Fallback palette for categories with no stored color.
  const CATEGORY_COLORS = {
    'Fresh Guava': '#EF4444',
    'Fertilizer/Pesticide': '#F59E0B',
    'Seedlings/Soil': '#8B5CF6',
    'Rent/Stall': '#3B82F6',
    'Packaging': '#10B981',
    'Transport': '#EC4899',
    'Others': '#6B7280'
  };

  function colorFor(category) {
    return dynamicColors[category] || CATEGORY_COLORS[category] || CATEGORY_COLORS['Others'] || '#6B7280';
  }

  function formatRM(amount) {
    return 'RM ' + Number(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function animateNumber(el, end, duration = 600, isCurrency = true) {
    if (!el) return;
    const start = 0;
    const startTime = performance.now();
    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      el.textContent = isCurrency ? formatRM(current) : Math.round(current).toString();
      if (progress < 1) requestAnimationFrame(tick);
      else el.textContent = isCurrency ? formatRM(end) : Math.round(end).toString();
    }
    requestAnimationFrame(tick);
  }

  function animateBar(bar, pct, duration = 800) {
    if (!bar) return;
    bar.style.width = '0%';
    const startTime = performance.now();
    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      bar.style.width = (pct * eased).toFixed(1) + '%';
      if (progress < 1) requestAnimationFrame(tick);
      else bar.style.width = pct.toFixed(1) + '%';
    }
    requestAnimationFrame(tick);
  }

  function parseDateTimezoneSafe(dateStr) {
    if (!dateStr) return null;
    if (dateStr.includes('-')) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
    return null;
  }

  function filterByMonth(rows, dateColIndex) {
    return rows.filter(row => {
      if (!row[dateColIndex]) return false;
      const parsed = parseDateTimezoneSafe(row[dateColIndex]);
      return parsed && parsed.month === currentMonth && parsed.year === currentYear;
    });
  }

  function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const parsed = parseDateTimezoneSafe(dateStr);
    if (!parsed) return dateStr;
    return parsed.day + ' ' + MONTHS[parsed.month].slice(0, 3);
  }

  function $(id) { return document.getElementById(id); }

  return {
    getCurrentMonth() { return currentMonth; },
    getCurrentYear() { return currentYear; },
    setCategoryColors(map) { dynamicColors = map || {}; },

    async load() {
      const loading = $('dash-loading');
      if (loading) loading.classList.remove('hidden');
      try {
        const [salesRows, expenseRows, target, inventoryRows] = await Promise.all([
          JambuSheets.getSalesData(),
          JambuSheets.getExpensesData(),
          JambuSheets.getTargetProfit(),
          JambuSheets.getInventoryData().catch(e => { console.warn('Could not load inventory:', e); return []; })
        ]);
        targetProfit = target || 2000;

        const lowStockItems = [];
        (inventoryRows || []).forEach(row => {
          const name = row[0];
          const qty = parseFloat(row[1]) || 0;
          const minAlert = parseFloat(row[3]) || 0;
          const unit = row[2] || '';
          if (name && qty <= minAlert) lowStockItems.push(`${name} (${qty} ${unit})`);
        });
        const alertBanner = $('dash-stock-alert');
        const alertText = $('dash-stock-alert-text');
        if (alertBanner && alertText) {
          if (lowStockItems.length > 0) {
            alertText.textContent = `The following items are running low: ${lowStockItems.join(', ')}.`;
            alertBanner.classList.remove('hidden');
          } else {
            alertBanner.classList.add('hidden');
          }
        }

        const monthlySales = filterByMonth(salesRows || [], 0);
        const monthlyExpenses = filterByMonth(expenseRows || [], 0);

        let totalCash = 0, totalQR = 0, totalRevenue = 0, totalExpenses = 0, totalCOGS = 0, totalOPEX = 0, totalPayable = 0;
        monthlySales.forEach(row => {
          const cash = parseFloat(row[1]) || 0;
          const qr = parseFloat(row[2]) || 0;
          totalCash += cash;
          totalQR += qr;
          totalRevenue += cash + qr;
        });
        monthlyExpenses.forEach(row => {
          const amt = parseFloat(row[2]) || 0;
          totalExpenses += amt;
          let type = row[3];
          if (row.length <= 5 || !type) {
            const directCategories = ['Fresh Guava', 'Fertilizer/Pesticide', 'Seedlings/Soil', 'Packaging'];
            type = directCategories.includes(row[1]) ? 'Direct (COGS)' : 'Indirect (OPEX)';
          }
          if (type === 'Direct (COGS)') totalCOGS += amt; else totalOPEX += amt;
          const status = row.length > 5 ? row[5] : 'Paid';
          if (status === 'Unpaid') totalPayable += amt;
        });

        const grossProfit = totalRevenue - totalCOGS;
        const grossMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
        const netProfit = totalRevenue - totalExpenses;
        const progressPct = targetProfit > 0 ? Math.min(Math.max((netProfit / targetProfit) * 100, 0), 100) : 0;

        if (monthlySales.length === 0 && monthlyExpenses.length === 0) {
          this._renderEmptyState();
        } else {
          this._hideEmptyState();
          this._renderMetrics({ revenue: totalRevenue, cash: totalCash, qr: totalQR, expenses: totalExpenses, cogs: totalCOGS, opex: totalOPEX, grossProfit, grossMargin: grossMarginPct, payable: totalPayable, profit: netProfit, progressPct });
          this._renderCategories(monthlyExpenses, totalExpenses);
          // Bug fix #1: month-filtered arrays so Recent Transactions respect the selected month
          this._renderRecent(monthlySales, monthlyExpenses);
        }
      } catch (error) {
        console.error('Dashboard load error:', error);
      } finally {
        if (loading) loading.classList.add('hidden');
      }
    },

    _renderEmptyState() {
      const monthLabel = $('dash-month-label');
      if (monthLabel) monthLabel.textContent = MONTHS[currentMonth] + ' ' + currentYear;
      [$('dash-revenue'),$('dash-revenue-cash'),$('dash-revenue-qr'),$('dash-expenses'),$('dash-expenses-cogs'),$('dash-expenses-opex'),$('dash-gross-profit'),$('dash-gross-margin'),$('dash-payable'),$('dash-profit')].forEach(el => {
        if (el) el.textContent = el.id === 'dash-gross-margin' ? '0.0%' : formatRM(0);
      });
      const targetEl = $('dash-target');
      if (targetEl) targetEl.textContent = 'Target: ' + formatRM(targetProfit);
      const progressBar = $('dash-progress-bar');
      if (progressBar) progressBar.style.width = '0%';
      const progressPct = $('dash-progress-pct');
      if (progressPct) progressPct.textContent = '0%';
      const profitEl = $('dash-profit');
      if (profitEl) profitEl.style.color = '';
      const categoriesEl = $('dash-categories');
      if (categoriesEl) categoriesEl.innerHTML = '';
      const recentEl = $('dash-recent');
      if (recentEl) recentEl.innerHTML = `<div style="text-align:center;padding:2.5rem 1rem;opacity:0.7;"><p style="font-size:1.1rem;font-weight:600;color:#292524;">No data for this month yet</p><p style="font-size:0.9rem;color:#78716C;">Start by recording a sale!</p></div>`;
    },

    _hideEmptyState() {},

    _renderMetrics(metrics) {
      const monthLabel = $('dash-month-label');
      if (monthLabel) monthLabel.textContent = MONTHS[currentMonth] + ' ' + currentYear;
      animateNumber($('dash-revenue'), metrics.revenue);
      animateNumber($('dash-revenue-cash'), metrics.cash);
      animateNumber($('dash-revenue-qr'), metrics.qr);
      animateNumber($('dash-expenses'), metrics.expenses);
      animateNumber($('dash-expenses-cogs'), metrics.cogs);
      animateNumber($('dash-expenses-opex'), metrics.opex);
      animateNumber($('dash-gross-profit'), metrics.grossProfit);
      const marginEl = $('dash-gross-margin');
      if (marginEl) {
        animateNumber(marginEl, metrics.grossMargin, 800, false);
        setTimeout(() => { if (marginEl) marginEl.textContent = metrics.grossMargin.toFixed(1) + '%'; }, 850);
      }
      animateNumber($('dash-payable'), metrics.payable);
      animateNumber($('dash-profit'), metrics.profit);
      const targetEl = $('dash-target');
      if (targetEl) targetEl.textContent = 'Target: ' + formatRM(targetProfit);
      const progressBar = $('dash-progress-bar');
      const pct = metrics.progressPct;
      if (progressBar) {
        progressBar.style.background = pct >= 100 ? 'linear-gradient(90deg,#10B981,#34D399)' : pct >= 60 ? 'linear-gradient(90deg,#F59E0B,#FBBF24)' : 'linear-gradient(90deg,#EF4444,#F87171)';
        animateBar(progressBar, pct);
      }
      const progressPctEl = $('dash-progress-pct');
      if (progressPctEl) {
        animateNumber(progressPctEl, Math.round(pct), 800, false);
        setTimeout(() => { if (progressPctEl) progressPctEl.textContent = Math.round(pct) + '%'; }, 850);
      }
      const profitEl = $('dash-profit');
      if (profitEl) profitEl.style.color = metrics.profit >= 0 ? '#065F46' : '#991B1B';
    },

    _renderCategories(expenses, total) {
      const container = $('dash-categories');
      if (!container) return;
      container.innerHTML = '';
      if (!expenses.length || total === 0) {
        container.innerHTML = '<p style="text-align:center;padding:1rem;opacity:0.5;font-size:0.85rem;color:#78716C;">No expenses recorded this month</p>';
        return;
      }
      const grouped = {};
      expenses.forEach(row => {
        const cat = row[1] || 'Others';
        const amt = parseFloat(row[2]) || 0;
        grouped[cat] = (grouped[cat] || 0) + amt;
      });
      const sorted = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
      sorted.forEach(([category, amount], index) => {
        const pct = total > 0 ? (amount / total) * 100 : 0;
        const color = colorFor(category);
        const row = document.createElement('div');
        row.style.cssText = 'margin-bottom:0.75rem;';
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem;font-size:0.82rem;color:#57534E;';
        const catName = document.createElement('span');
        catName.style.cssText = 'display:flex;align-items:center;gap:0.4rem;font-weight:500;color:#292524;';
        const dot = document.createElement('span');
        dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;`;
        catName.appendChild(dot);
        catName.appendChild(document.createTextNode(category));
        const catAmt = document.createElement('span');
        catAmt.style.cssText = 'color:#78716C;font-variant-numeric:tabular-nums;';
        catAmt.textContent = formatRM(amount) + '  (' + pct.toFixed(0) + '%)';
        header.appendChild(catName);
        header.appendChild(catAmt);
        const track = document.createElement('div');
        track.style.cssText = 'width:100%;height:6px;background:rgba(0,0,0,0.06);border-radius:3px;overflow:hidden;';
        const fill = document.createElement('div');
        fill.style.cssText = `height:100%;border-radius:3px;background:${color};width:0%;transition:width 0.8s cubic-bezier(0.22,1,0.36,1);`;
        track.appendChild(fill);
        row.appendChild(header);
        row.appendChild(track);
        container.appendChild(row);
        setTimeout(() => { fill.style.width = pct + '%'; }, 100 + index * 80);
      });
    },

    _renderRecent(sales, expenses) {
      allTxEntries = [];
      (sales || []).forEach(row => {
        const cash = parseFloat(row[1]) || 0;
        const qr = parseFloat(row[2]) || 0;
        const total = cash + qr;
        if (total === 0) return;
        allTxEntries.push({ type: 'sale', date: row[0], amount: total, label: row[4] || 'Daily Sales', timestamp: row[5] || row[0], raw: row });
      });
      (expenses || []).forEach(row => {
        const amt = parseFloat(row[2]) || 0;
        if (amt === 0) return;
        let labelText = row[1] || 'Expense';
        let timestampVal = row[0];
        if (row.length <= 5) {
          timestampVal = row[4] || row[0];
          if (row[3]) labelText += ` (${row[3]})`;
        } else {
          timestampVal = row[7] || row[0];
          if (row[4] && row[4] !== 'General') labelText += ` - ${row[4]}`;
          if (row[5] === 'Unpaid') labelText += ' [UNPAID]';
        }
        allTxEntries.push({ type: 'expense', date: row[0], amount: amt, label: labelText, timestamp: timestampVal, raw: row });
      });
      this.filterRecent();
    },

    filterRecent() {
      const container = $('dash-recent');
      if (!container) return;
      const query = (($('tx-search') ? $('tx-search').value : '')).toLowerCase().trim();
      const type = $('tx-filter-type') ? $('tx-filter-type').value : 'all';
      const sortBy = $('tx-sort') ? $('tx-sort').value : 'time-desc';
      let filtered = allTxEntries;
      if (type !== 'all') filtered = filtered.filter(e => e.type === type);
      if (query) filtered = filtered.filter(e => e.label.toLowerCase().includes(query) || e.date.includes(query) || String(e.amount).includes(query));
      filtered.sort((a, b) => {
        if (sortBy === 'time-desc') return (new Date(b.timestamp).getTime() || 0) - (new Date(a.timestamp).getTime() || 0);
        if (sortBy === 'time-asc') return (new Date(a.timestamp).getTime() || 0) - (new Date(b.timestamp).getTime() || 0);
        if (sortBy === 'amount-desc') return b.amount - a.amount;
        if (sortBy === 'amount-asc') return a.amount - b.amount;
        return 0;
      });
      container.innerHTML = '';
      if (filtered.length === 0) {
        container.innerHTML = '<p style="text-align:center;padding:2.5rem 1rem;opacity:0.5;font-size:0.85rem;color:#78716C;">No transactions match search/filter.</p>';
        return;
      }
      filtered.forEach((entry, index) => {
        const isSale = entry.type === 'sale';
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;gap:0.75rem;padding:0.7rem 0;border-bottom:1px solid rgba(0,0,0,0.06);opacity:0;transform:translateY(8px);animation:dashFadeIn 0.35s ease forwards;animation-delay:${Math.min(index*0.03,0.5)}s;`;
        const icon = document.createElement('div');
        icon.style.cssText = `width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;flex-shrink:0;font-family:ui-monospace,monospace;background:${isSale?'rgba(13,148,136,0.1)':'rgba(225,29,72,0.1)'};color:${isSale?'#0d9488':'#e11d48'};border:1px solid ${isSale?'rgba(13,148,136,0.2)':'rgba(225,29,72,0.2)'};`;
        icon.textContent = isSale ? 'CR' : 'DR';
        const info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0;';
        const label = document.createElement('div');
        label.style.cssText = 'font-size:0.85rem;font-weight:500;color:#292524;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        label.textContent = entry.label;
        const dateLine = document.createElement('div');
        dateLine.style.cssText = 'font-size:0.75rem;color:#78716C;margin-top:1px;';
        dateLine.textContent = formatDateShort(entry.date);
        info.appendChild(label);
        info.appendChild(dateLine);
        const amtEl = document.createElement('div');
        amtEl.style.cssText = `font-size:0.9rem;font-weight:600;font-variant-numeric:tabular-nums;flex-shrink:0;color:${isSale?'#34D399':'#F87171'};`;
        amtEl.textContent = (isSale?'+':'-') + formatRM(entry.amount);

        const editBtn = document.createElement('button');
        editBtn.className = 'p-1.5 rounded-lg text-gray-300 hover:text-brand-600 hover:bg-brand-50 active:scale-90 transition-all ml-1 flex-shrink-0';
        editBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>';
        editBtn.title = 'Edit transaction';
        editBtn.onclick = () => {
          if (typeof JambuApp !== 'undefined') JambuApp.editTransaction(isSale ? 'sale' : 'expense', entry.raw, entry.timestamp);
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 active:scale-90 transition-all flex-shrink-0';
        deleteBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>`;
        deleteBtn.title = 'Delete transaction';
        deleteBtn.onclick = async () => {
          if (confirm(`Are you sure you want to delete this "${entry.label}" entry?`)) {
            deleteBtn.disabled = true;
            try {
              const tab = isSale ? 'Daily_Sales' : 'Expenses';
              const success = await JambuSheets.deleteRowByTimestamp(tab, entry.timestamp);
              if (success) {
                if (typeof JambuApp !== 'undefined') JambuApp.showToast('Transaction deleted successfully', 'success');
                await JambuDashboard.load();
                if (typeof JambuApp !== 'undefined') JambuApp.populateVendorSuggestions();
              } else {
                if (typeof JambuApp !== 'undefined') JambuApp.showToast('Failed to find transaction to delete', 'error');
              }
            } catch (err) {
              console.error('Delete error:', err);
              if (typeof JambuApp !== 'undefined') JambuApp.showToast('Error deleting transaction', 'error');
            } finally {
              deleteBtn.disabled = false;
            }
          }
        };
        row.appendChild(icon);
        row.appendChild(info);
        row.appendChild(amtEl);
        row.appendChild(editBtn);
        row.appendChild(deleteBtn);
        container.appendChild(row);
      });
      if (!document.getElementById('dash-anim-styles')) {
        const style = document.createElement('style');
        style.id = 'dash-anim-styles';
        style.textContent = '@keyframes dashFadeIn { to { opacity:1; transform:translateY(0); } }';
        document.head.appendChild(style);
      }
    },

    navigateMonth(delta) {
      currentMonth += delta;
      if (currentMonth > 11) { currentMonth = 0; currentYear++; }
      if (currentMonth < 0) { currentMonth = 11; currentYear--; }
      this.load();
    },

    setTarget(amount) { targetProfit = amount; }
  };
})();
