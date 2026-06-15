const JambuTest = (() => {
  function $(id) { return document.getElementById(id); }

  return {
    async runStressTest() {
      const modal = $('test-modal');
      const logArea = $('test-log');
      const closeBtn = $('btn-close-test');
      if (!modal || !logArea) { alert('Stress test modal elements not found!'); return; }
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      if (closeBtn) closeBtn.disabled = true;
      logArea.innerHTML = '';
      function log(msg) {
        logArea.innerHTML += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
        logArea.scrollTop = logArea.scrollHeight;
      }
      log('Starting system stress test (5 iterations)...');
      const salesToDelete = [];
      const expensesToDelete = [];
      const inventoryToDelete = [];
      let originalTarget = 2000;
      try {
        log('Reading original Settings target profit...');
        originalTarget = await JambuSheets.getTargetProfit();
        log(`Original target profit is RM ${originalTarget}`);
      } catch (e) {
        log(`Warning: could not read original target profit: ${e.message}`);
      }
      try {
        for (let i = 1; i <= 5; i++) {
          log(`\n--- Iteration ${i}/5 ---`);
          log(`[Sale] Appending sales row...`);
          const saleCash = Math.floor(Math.random() * 500) + 100;
          const saleQr = Math.floor(Math.random() * 300) + 50;
          await JambuSheets.appendSalesRow({ date: '2026-06-09', cash: saleCash, qr: saleQr, notes: `Stress Test Iteration ${i}` });
          log(`[Sale] Appended sale row successfully.`);
          log(`[Expense] Appending expense row...`);
          await JambuSheets.appendExpenseRow({
            date: '2026-06-09',
            category: 'Seedlings/Soil',
            amount: Math.floor(Math.random() * 100) + 10,
            type: 'Direct (COGS)',
            vendor: `Vendor-${i}`,
            status: 'Paid',
            notes: `Stress Test Iteration ${i}`
          });
          log(`[Expense] Appended expense row successfully.`);
          const itemName = `Test-Item-${i}`;
          log(`[Inventory] Saving inventory item...`);
          await JambuSheets.saveInventoryItem({ name: itemName, quantity: 10 + i, unit: 'kg', minAlert: 5, notes: `Stress test item ${i}` });
          inventoryToDelete.push(itemName);
          log(`[Inventory] Saved "${itemName}" successfully.`);
          const newQty = 15 + i;
          await JambuSheets.updateInventoryQuantity(itemName, newQty);
          log(`[Inventory] Updated quantity to ${newQty}.`);
          await JambuSheets.setTargetProfit(2000 + i * 100);
          log(`[Setting] Updated target profit to ${2000 + i * 100}.`);
        }
        log(`\n--- Verification ---`);
        await JambuDashboard.load();
        log(`Dashboard metrics loaded successfully.`);
        log(`\n--- Cleaning Up Test Data ---`);
        const allSales = await JambuSheets.getSalesData();
        allSales.forEach(row => {
          if (row.length >= 6 && row[4] && row[4].startsWith('Stress Test Iteration')) salesToDelete.push(row[5]);
        });
        const allExpenses = await JambuSheets.getExpensesData();
        allExpenses.forEach(row => {
          if (row.length >= 8 && row[6] && row[6].startsWith('Stress Test Iteration')) expensesToDelete.push(row[7]);
        });
        log(`Found ${salesToDelete.length} sales and ${expensesToDelete.length} expenses to delete.`);
        for (const ts of salesToDelete) await JambuSheets.deleteRowByTimestamp('Daily_Sales', ts);
        for (const ts of expensesToDelete) await JambuSheets.deleteRowByTimestamp('Expenses', ts);
        for (const name of inventoryToDelete) await JambuSheets.deleteInventoryItem(name);
        await JambuSheets.setTargetProfit(originalTarget);
        JambuDashboard.setTarget(originalTarget);
        await JambuDashboard.load();
        log(`\nSTRESS TEST SUCCESSFUL! All 5 iterations passed.`);
      } catch (err) {
        log(`\nSTRESS TEST FAILED! Error: ${err.message}`);
      } finally {
        if (closeBtn) closeBtn.disabled = false;
      }
    }
  };
})();
