// ============================================================
// JambuStatement — Printable Financial Report Generator
// Compiles the active business's sales & expenses into a P&L.
// ============================================================

const JambuStatement = (() => {

  function $(id) { return document.getElementById(id); }

  function formatRM(amount) {
    return 'RM ' + Number(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const parsed = parseDateTimezoneSafe(dateStr);
    if (!parsed) return dateStr;
    return `${parsed.year}-${String(parsed.month + 1).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`;
  }

  return {
    async generate() {
      let month = new Date().getMonth();
      let year = new Date().getFullYear();
      if (typeof JambuDashboard !== 'undefined') {
        month = JambuDashboard.getCurrentMonth();
        year = JambuDashboard.getCurrentYear();
      }

      const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      $('stmt-period-label').textContent = `${MONTH_NAMES[month]} ${year}`;

      // Statement header carries the active business's name.
      const bizName = (typeof JambuSheets !== 'undefined') ? JambuSheets.getActiveLedgerName() : 'Ledger';
      const nameEl = $('stmt-biz-name');
      if (nameEl) nameEl.textContent = bizName;

      if (typeof JambuApp !== 'undefined') JambuApp.showToast('Compiling statement...', 'info');

      try {
        const [salesRows, expenseRows] = await Promise.all([
          JambuSheets.getSalesData(),
          JambuSheets.getExpensesData()
        ]);

        const monthlySales = (salesRows || []).filter(row => {
          const parsed = parseDateTimezoneSafe(row[0]);
          return parsed && parsed.month === month && parsed.year === year;
        });
        const monthlyExpenses = (expenseRows || []).filter(row => {
          const parsed = parseDateTimezoneSafe(row[0]);
          return parsed && parsed.month === month && parsed.year === year;
        });

        let cashSales = 0, qrSales = 0;
        monthlySales.forEach(row => {
          cashSales += parseFloat(row[1]) || 0;
          qrSales += parseFloat(row[2]) || 0;
        });
        const totalRevenue = cashSales + qrSales;
        $('stmt-revenue-cash').textContent = formatRM(cashSales);
        $('stmt-revenue-qr').textContent = formatRM(qrSales);
        $('stmt-revenue-total').textContent = formatRM(totalRevenue);

        let totalCOGS = 0, totalOPEX = 0;
        const cogsBreakdown = {}, opexBreakdown = {};
        monthlyExpenses.forEach(row => {
          const cat = row[1] || 'Others';
          const amt = parseFloat(row[2]) || 0;
          let type = row[3];
          if (row.length <= 5 || !type) type = 'Indirect (OPEX)'; // legacy rows without a type
          if (type === 'Direct (COGS)') {
            totalCOGS += amt;
            cogsBreakdown[cat] = (cogsBreakdown[cat] || 0) + amt;
          } else {
            totalOPEX += amt;
            opexBreakdown[cat] = (opexBreakdown[cat] || 0) + amt;
          }
        });

        $('stmt-cogs-total').textContent = formatRM(totalCOGS);
        $('stmt-opex-total').textContent = formatRM(totalOPEX);

        const cogsContainer = $('stmt-cogs-breakdown');
        cogsContainer.innerHTML = '';
        if (Object.keys(cogsBreakdown).length === 0) {
          cogsContainer.innerHTML = '<div class="flex justify-between italic"><span>No COGS recorded</span><span>RM 0.00</span></div>';
        } else {
          Object.entries(cogsBreakdown).forEach(([cat, val]) => {
            const row = document.createElement('div');
            row.className = 'flex justify-between';
            row.innerHTML = `<span>${cat}</span><span>${formatRM(val)}</span>`;
            cogsContainer.appendChild(row);
          });
        }

        const opexContainer = $('stmt-opex-breakdown');
        opexContainer.innerHTML = '';
        if (Object.keys(opexBreakdown).length === 0) {
          opexContainer.innerHTML = '<div class="flex justify-between italic"><span>No Operating Expenses recorded</span><span>RM 0.00</span></div>';
        } else {
          Object.entries(opexBreakdown).forEach(([cat, val]) => {
            const row = document.createElement('div');
            row.className = 'flex justify-between';
            row.innerHTML = `<span>${cat}</span><span>${formatRM(val)}</span>`;
            opexContainer.appendChild(row);
          });
        }

        const grossProfit = totalRevenue - totalCOGS;
        const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
        const netProfit = grossProfit - totalOPEX;
        $('stmt-gross-profit').textContent = formatRM(grossProfit);
        $('stmt-gross-margin').textContent = grossMargin.toFixed(1) + '%';
        const netProfitEl = $('stmt-net-profit');
        netProfitEl.textContent = formatRM(netProfit);
        netProfitEl.className = netProfit < 0 ? 'double-underline text-red-700' : 'double-underline text-emerald-800';

        const ledgerEntries = [];
        monthlySales.forEach(row => {
          const total = (parseFloat(row[1]) || 0) + (parseFloat(row[2]) || 0);
          if (total === 0) return;
          ledgerEntries.push({ date: row[0], type: 'Sale', category: 'Sales Revenue', ref: row[4] ? `Sales notes: ${row[4]}` : 'Daily sales record', amount: total });
        });
        monthlyExpenses.forEach(row => {
          let refVal = 'General';
          if (row.length > 5) {
            refVal = row[4] || 'General';
            if (row[6]) refVal += ` (${row[6]})`;
          } else {
            refVal = row[3] || 'General';
          }
          ledgerEntries.push({ date: row[0], type: 'Expense', category: row[1] || 'Expense', ref: refVal, amount: -(parseFloat(row[2]) || 0) });
        });
        ledgerEntries.sort((a, b) => a.date.localeCompare(b.date));

        const ledgerBody = $('stmt-ledger-rows');
        ledgerBody.innerHTML = '';
        if (ledgerEntries.length === 0) {
          ledgerBody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-gray-400 italic">No transactions recorded for this period.</td></tr>';
        } else {
          ledgerEntries.forEach(entry => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-gray-50';
            const isSale = entry.type === 'Sale';
            const typeBadge = isSale
              ? '<span class="px-1.5 py-0.5 rounded font-bold text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100">SALE</span>'
              : '<span class="px-1.5 py-0.5 rounded font-bold text-[10px] bg-red-50 text-red-700 border border-red-100">EXPENSE</span>';
            const amtClass = isSale ? 'text-emerald-700 font-semibold' : 'text-red-600';
            const amtSign = isSale ? '+' : '';
            tr.innerHTML = `
              <td class="py-2.5 pr-2 font-medium text-gray-900 whitespace-nowrap">${formatDate(entry.date)}</td>
              <td class="py-2.5 px-2">${typeBadge}</td>
              <td class="py-2.5 px-2 font-medium">${entry.category}</td>
              <td class="py-2.5 px-2 text-gray-500 truncate max-w-[150px]" title="${entry.ref}">${entry.ref}</td>
              <td class="py-2.5 pl-2 text-right font-semibold ${amtClass}">${amtSign}${formatRM(entry.amount)}</td>
            `;
            ledgerBody.appendChild(tr);
          });
        }

        const now = new Date();
        $('stmt-gen-timestamp').textContent = now.getFullYear() + '-' +
          String(now.getMonth() + 1).padStart(2, '0') + '-' +
          String(now.getDate()).padStart(2, '0') + ' ' +
          String(now.getHours()).padStart(2, '0') + ':' +
          String(now.getMinutes()).padStart(2, '0');

        $('login-screen').style.display = 'none';
        $('app-screen').style.display = 'none';
        $('view-statement').style.display = 'block';
      } catch (err) {
        console.error('Error generating statement:', err);
        if (typeof JambuApp !== 'undefined') JambuApp.showToast('Failed to generate statement.', 'error');
      }
    },

    close() {
      $('view-statement').style.display = 'none';
      const login = $('login-screen');
      const app = $('app-screen');
      if (login) login.style.display = 'none';
      if (app) app.style.display = 'block';
      if (typeof JambuApp !== 'undefined') JambuApp.switchView('dashboard');
    },

    print() { window.print(); }
  };
})();
