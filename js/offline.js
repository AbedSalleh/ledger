// ============================================================
// JambuOffline — offline cache + write queue
// Caches the last-loaded sheet data so the dashboard renders
// without a connection, and queues sales/expense entries made
// offline, flushing them to Google Sheets when back online.
// Exposes a global `JambuOffline` object.
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

    enqueue(kind, payload) {
      const q = getQueue();
      q.push({ kind, payload, queuedAt: new Date().toISOString() });
      setQueue(q);
    },

    pendingCount() { return getQueue().length; },

    updateBadge,

    // Replays queued writes in order; stops at the first failure so
    // nothing is lost or duplicated.
    async flush() {
      let q = getQueue();
      let done = 0;
      while (q.length) {
        const item = q[0];
        try {
          if (item.kind === 'sale') await JambuSheets.appendSalesRow(item.payload);
          else if (item.kind === 'expense') await JambuSheets.appendExpenseRow(item.payload);
          q = getQueue();
          q.shift();
          setQueue(q);
          done++;
        } catch (e) {
          console.warn('[JambuOffline] Flush stopped:', e.message);
          break;
        }
      }
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
      // Try a flush shortly after boot too, in case entries were queued last session.
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
