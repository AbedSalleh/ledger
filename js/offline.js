// ============================================================
// JambuOffline — offline cache + write queue
// Caches last-loaded sheet data per ledger and queues sales/
// expense entries made offline; queued items remember which
// ledger they belong to and only flush into that ledger.
// ============================================================

const JambuOffline = (() => {
  const CACHE_PREFIX = 'jambu_cache_';
  const QUEUE_KEY = 'jambu_sync_queue';

  function $(id) { return document.getElementById(id); }

  function getQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch (e) { return []; }
  }
  function setQueue(q) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    updateBadge();
  }
  function updateBadge() {
    const b = $('sync-badge');
    if (!b) return;
    const n = getQueue().length;
    if (n > 0) {
      b.textContent = `${n} pending sync`;
      b.classList.remove('hidden');
    } else {
      b.classList.add('hidden');
    }
  }

  return {
    cache(key, rows) {
      try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(rows)); } catch (e) { /* storage full — ignore */ }
    },

    getCached(key) {
      try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + key)) || []; } catch (e) { return []; }
    },

    enqueue(kind, payload, sheetId) {
      const q = getQueue();
      q.push({ kind, payload, sheetId: sheetId || null, queuedAt: new Date().toISOString() });
      setQueue(q);
    },

    pendingCount() { return getQueue().length; },

    updateBadge,

    // Replays queued writes for the CURRENTLY ACTIVE ledger; items for other
    // ledgers stay queued until that ledger is active. Stops on first failure.
    async flush() {
      const q = getQueue();
      if (!q.length) return 0;
      const remaining = [];
      let done = 0;
      let failed = false;
      for (const item of q) {
        if (failed) { remaining.push(item); continue; }
        const cur = (typeof JambuSheets !== 'undefined') ? JambuSheets.getSpreadsheetId() : null;
        if (item.sheetId && cur && item.sheetId !== cur) { remaining.push(item); continue; }
        try {
          if (item.kind === 'sale') await JambuSheets.appendSalesRow(item.payload);
          else if (item.kind === 'expense') await JambuSheets.appendExpenseRow(item.payload);
          done++;
        } catch (e) {
          console.warn('[JambuOffline] Flush stopped:', e.message);
          remaining.push(item);
          failed = true;
        }
      }
      setQueue(remaining);
      return done;
    },

    init() {
      updateBadge();
      window.addEventListener('online', async () => {
        const n = await this.flush();
        if (n > 0) {
          if (typeof JambuApp !== 'undefined') JambuApp.showToast(`Back online — synced ${n} entr${n === 1 ? 'y' : 'ies'}.`, 'success');
          if (typeof JambuDashboard !== 'undefined') JambuDashboard.load();
        }
      });
      setTimeout(async () => {
        if (navigator.onLine && getQueue().length && typeof JambuSheets !== 'undefined' && JambuSheets.getSpreadsheetId()) {
          const n = await this.flush();
          if (n > 0 && typeof JambuApp !== 'undefined') {
            JambuApp.showToast(`Synced ${n} offline entr${n === 1 ? 'y' : 'ies'}.`, 'success');
            if (typeof JambuDashboard !== 'undefined') JambuDashboard.load();
          }
        }
      }, 4000);
    },
  };
})();
