/**
 * @fileoverview Google OAuth 2.0 authentication module for Jambu Batu Ledger.
 * Handles sign-in/sign-out, token management, and user profile retrieval
 * using Google Identity Services (GIS) and the Google API Client Library (gapi).
 *
 * Exposes a global `JambuAuth` object.
 */

const JambuAuth = (() => {
  let tokenClient = null;
  let gapiInited = false;
  let gisInited = false;
  let onAuthChangeCallback = null;
  let savedClientId = null;
  let sessionRestored = false;
  let currentUser = null;

  const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets',
  ].join(' ');

  const DISCOVERY_DOCS = [
    'https://sheets.googleapis.com/$discovery/rest?version=v4',
    'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
  ];

  const MAX_REFRESH_RETRIES = 2;

  async function _fetchUserInfo(accessToken) {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`UserInfo request failed with status ${res.status}`);
      const info = await res.json();
      return { name: info.name || 'User', email: info.email || '', picture: info.picture || '' };
    } catch (err) {
      console.warn('[JambuAuth] Could not fetch user info:', err);
      return { name: 'User', email: '', picture: '' };
    }
  }

  function _requestTokenAsync(opts) {
    return new Promise((resolve, reject) => {
      const origCb = tokenClient.callback;
      tokenClient.callback = (tokenResponse) => {
        tokenClient.callback = origCb;
        if (tokenResponse.error !== undefined) {
          reject(new Error(`Token error: ${tokenResponse.error}`));
        } else {
          resolve(tokenResponse);
        }
      };
      tokenClient.error_callback = (err) => {
        tokenClient.callback = origCb;
        reject(new Error(err.type || 'Token request failed'));
      };
      tokenClient.requestAccessToken(opts);
    });
  }

  function _initTokenClient() {
    if (!savedClientId || !gisInited || tokenClient) return;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: savedClientId,
      scope: SCOPES,
      callback: async (tokenResponse) => {
        if (tokenResponse.error !== undefined) {
          console.error('[JambuAuth] Token callback error:', tokenResponse);
          if (onAuthChangeCallback) onAuthChangeCallback(false, null);
          return;
        }
        gapi.client.setToken(tokenResponse);
        currentUser = await _fetchUserInfo(tokenResponse.access_token);
        const expiresAt = Date.now() + (parseInt(tokenResponse.expires_in, 10) || 3600) * 1000;
        localStorage.setItem('jambu_ledger_token', JSON.stringify({
          token: tokenResponse,
          expiresAt: expiresAt,
          user: currentUser
        }));
        if (onAuthChangeCallback) onAuthChangeCallback(true, currentUser);
      },
    });
    console.info('[JambuAuth] Token client initialised.');
  }

  function _tryRestoreSession() {
    if (!gapiInited || !gisInited || !savedClientId || sessionRestored) return;
    try {
      const savedSession = localStorage.getItem('jambu_ledger_token');
      if (savedSession) {
        const { token, expiresAt, user } = JSON.parse(savedSession);
        if (expiresAt > Date.now()) {
          console.info('[JambuAuth] Restored active session from localStorage.');
          gapi.client.setToken(token);
          currentUser = user;
          sessionRestored = true;
          setTimeout(() => {
            if (onAuthChangeCallback) onAuthChangeCallback(true, currentUser);
          }, 50);
        } else {
          localStorage.removeItem('jambu_ledger_token');
        }
      }
    } catch (e) {
      console.warn('[JambuAuth] Failed to restore session:', e);
    }
  }

  return {
    handleGapiLoad() {
      gapi.load('client', async () => {
        try {
          await gapi.client.init({ discoveryDocs: DISCOVERY_DOCS });
          gapiInited = true;
          console.info('[JambuAuth] gapi client initialised.');
          this._maybeReady();
        } catch (err) {
          console.error('[JambuAuth] gapi client init failed:', err);
        }
      });
    },

    handleGisLoad() {
      gisInited = true;
      console.info('[JambuAuth] GIS library loaded.');
      _initTokenClient();
      this._maybeReady();
    },

    init(clientId, onAuthChange) {
      if (!clientId) {
        console.error('[JambuAuth] init() called without a clientId.');
        return;
      }
      savedClientId = clientId;
      onAuthChangeCallback = onAuthChange;
      if (gisInited) {
        _initTokenClient();
      } else {
        console.info('[JambuAuth] Saved client ID. Awaiting GIS script load to initialise token client.');
      }
      _tryRestoreSession();
    },

    signIn() {
      if (!gapiInited || !gisInited) {
        console.warn('[JambuAuth] Google APIs not yet loaded. Cannot sign in.');
        return;
      }
      if (!tokenClient) {
        console.error('[JambuAuth] Auth not initialised. Call init() first.');
        return;
      }
      const existingToken = gapi.client.getToken();
      if (existingToken === null) {
        tokenClient.requestAccessToken({ prompt: 'select_account' });
      } else {
        tokenClient.requestAccessToken({ prompt: '' });
      }
    },

    signOut() {
      const token = gapi.client.getToken();
      if (token !== null) {
        try {
          google.accounts.oauth2.revoke(token.access_token, () => {
            console.info('[JambuAuth] Token revoked.');
          });
        } catch (err) {
          console.warn('[JambuAuth] Token revocation failed (non-critical):', err);
        }
        gapi.client.setToken(null);
      }
      localStorage.removeItem('jambu_ledger_token');
      currentUser = null;
      if (onAuthChangeCallback) onAuthChangeCallback(false, null);
    },

    isSignedIn() {
      try { return gapi.client.getToken() !== null; } catch { return false; }
    },

    getUser() { return currentUser; },

    async ensureToken(retryCount = 0) {
      const token = gapi.client.getToken();
      if (token && token.access_token) {
        try {
          const res = await fetch(
            'https://www.googleapis.com/oauth2/v3/tokeninfo?' +
              new URLSearchParams({ access_token: token.access_token }),
          );
          if (res.ok) return token.access_token;
        } catch { /* fall through */ }
      }
      if (retryCount >= MAX_REFRESH_RETRIES) {
        throw new Error('[JambuAuth] Unable to obtain a valid token after retries.');
      }
      if (!tokenClient) {
        throw new Error('[JambuAuth] Auth not initialised. Call init() first.');
      }
      try {
        const tokenResponse = await _requestTokenAsync({ prompt: '' });
        gapi.client.setToken(tokenResponse);
        currentUser = await _fetchUserInfo(tokenResponse.access_token);
        const expiresAt = Date.now() + (parseInt(tokenResponse.expires_in, 10) || 3600) * 1000;
        localStorage.setItem('jambu_ledger_token', JSON.stringify({
          token: tokenResponse,
          expiresAt: expiresAt,
          user: currentUser
        }));
        if (onAuthChangeCallback) onAuthChangeCallback(true, currentUser);
        return tokenResponse.access_token;
      } catch (err) {
        console.warn(`[JambuAuth] Token refresh attempt ${retryCount + 1} failed:`, err);
        return this.ensureToken(retryCount + 1);
      }
    },

    async withTokenRefresh(apiCall) {
      try {
        return await apiCall();
      } catch (err) {
        const status = err?.result?.error?.code || err?.status;
        if (status === 401) {
          console.info('[JambuAuth] 401 received – refreshing token and retrying…');
          await this.ensureToken();
          return await apiCall();
        }
        throw err;
      }
    },

    _maybeReady() {
      if (gapiInited && gisInited) {
        console.info('[JambuAuth] Both gapi and GIS ready.');
        _tryRestoreSession();
      }
    },
  };
})();
