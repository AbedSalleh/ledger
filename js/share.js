// ============================================================
// JambuShare — In-app sharing of the ledger spreadsheet
// Grants Drive access to a specific email and builds a link
// that carries the spreadsheet ID (link-only mode).
//
// Access levels:
//   full    → Drive 'writer', no UI restrictions (owner)
//   cashier → Drive 'writer', UI hides settings/statement/share
//   viewer  → Drive 'reader', read-only (enforced by Google)
//
// NOTE: 'cashier' restrictions are UI-level only — a Drive
// 'writer' technically has full edit rights to the sheet.
// Only 'viewer' (Drive reader) is a hard security boundary.
//
// Exposes a global `JambuShare` object.
// ============================================================

const JambuShare = (() => {
  function $(id) { return document.getElementById(id); }

  const LEVELS = {
    full:    { drive: 'writer', label: 'Full access' },
    cashier: { drive: 'writer', label: 'Cashier' },
    viewer:  { drive: 'reader', label: 'View only' },
  };

  function _params() { return new URLSearchParams(window.location.search); }

  return {
    /** Spreadsheet ID passed via the shared link, or null. */
    getSharedSheetId() {
      const v = _params().get('sheet');
      return v && v.trim() ? v.trim() : null;
    },

    /** Access role from the link; defaults to 'full' (owner). */
    getRole() {
      const r = _params().get('role');
      return (r && LEVELS[r]) ? r : 'full';
    },

    openModal() {
      const m = $('share-modal');
      if (!m) return;
      const email = $('share-email'); if (email) email.value = '';
      const result = $('share-result'); if (result) result.classList.add('hidden');
      const link = $('share-link'); if (link) link.value = '';
      m.classList.remove('hidden');
      m.classList.add('flex');
    },

    closeModal() {
      const m = $('share-modal');
      if (!m) return;
      m.classList.add('hidden');
      m.classList.remove('flex');
    },

    async share() {
      const email = (($('share-email') || {}).value || '').trim();
      const level = ($('share-level') || {}).value || 'cashier';

      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        JambuApp.showToast('Enter a valid email address', 'error');
        return;
      }
      const sheetId = JambuSheets.getSpreadsheetId();
      if (!sheetId) {
        JambuApp.showToast('Ledger not ready yet', 'error');
        return;
      }

      const driveRole = (LEVELS[level] || LEVELS.cashier).drive;
      const btn = $('btn-do-share');
      if (btn) { btn.disabled = true; var orig = btn.textContent; btn.textContent = 'Sharing...'; }

      try {
        await JambuAuth.withTokenRefresh(() => gapi.client.drive.permissions.create({
          fileId: sheetId,
          sendNotificationEmail: true,
          resource: { type: 'user', role: driveRole, emailAddress: email },
        }));

        const base = window.location.origin + window.location.pathname;
        const shareLink = `${base}?sheet=${encodeURIComponent(sheetId)}&role=${encodeURIComponent(level)}`;
        const linkInput = $('share-link');
        if (linkInput) linkInput.value = shareLink;
        const result = $('share-result');
        if (result) result.classList.remove('hidden');

        JambuApp.showToast(`Access granted to ${email}`, 'success');
      } catch (e) {
        console.error('[JambuShare] share failed:', e);
        JambuApp.showToast('Failed to share. Check the email and try again.', 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = orig || 'Grant Access'; }
      }
    },

    copyLink() {
      const inp = $('share-link');
      if (!inp || !inp.value) return;
      inp.focus();
      inp.select();
      inp.setSelectionRange(0, 99999);
      const done = () => JambuApp.showToast('Link copied', 'success');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(inp.value).then(done).catch(() => { try { document.execCommand('copy'); done(); } catch (e) {} });
      } else {
        try { document.execCommand('copy'); done(); } catch (e) {}
      }
    },

    /** Apply UI restrictions for the active role after sign-in. */
    applyRole(role) {
      const hide = (id) => { const el = $(id); if (el) el.style.display = 'none'; };

      if (role === 'cashier') {
        hide('btn-settings');
        hide('btn-generate-statement');
        hide('btn-share');
      } else if (role === 'viewer') {
        hide('btn-settings');
        hide('btn-share');
        hide('btn-add-inventory');
        hide('nav-sales');
        hide('nav-expenses');
        if (typeof JambuApp !== 'undefined') JambuApp.switchView('dashboard');
      }

      if (role !== 'full') {
        const banner = $('role-banner');
        if (banner) {
          banner.textContent = (LEVELS[role] || {}).label || role;
          banner.classList.remove('hidden');
        }
      }
    },
  };
})();
