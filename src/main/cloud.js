'use strict';
// Optional account + cloud sync, backed by Supabase (free tier is plenty).
// The project URL and public "anon" key go in src/shared/cloud.json; until they
// are filled in, the account feature simply shows as "not set up yet".
// Talks to Supabase's REST endpoints directly with fetch — no SDK.

const TIMEOUT = 15000;

class CloudError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

async function req(method, url, { headers = {}, body } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!res.ok) {
      const msg = (data && (data.error_description || data.msg || data.message || data.error)) || `HTTP ${res.status}`;
      let code = 'server';
      if (res.status === 400 && /invalid login|invalid_grant|credentials/i.test(String(msg))) code = 'badLogin';
      else if (/not confirmed|email_not_confirmed/i.test(String(msg))) code = 'notConfirmed';
      else if (/already registered|already exists|user_already_exists/i.test(String(msg))) code = 'exists';
      else if (/password/i.test(String(msg)) && res.status === 422) code = 'weakPassword';
      else if (res.status === 401 || res.status === 403) code = 'auth';
      else if (res.status === 429) code = 'rateLimit';
      throw new CloudError(code, String(msg));
    }
    return data;
  } catch (e) {
    if (e instanceof CloudError) throw e;
    throw new CloudError(e.name === 'AbortError' ? 'timeout' : 'network', e.message);
  } finally {
    clearTimeout(timer);
  }
}

class CloudClient {
  /** conf: {url, anonKey}; store: {load() → session|null, save(session|null)} */
  constructor(conf, store) {
    this.url = String((conf && conf.url) || '').replace(/\/+$/, '');
    this.key = (conf && conf.anonKey) || '';
    this.store = store;
    this.session = store.load();
  }

  enabled() { return Boolean(this.url && this.key); }

  signedIn() { return Boolean(this.session && this.session.refresh_token); }

  email() { return this.session && this.session.user ? this.session.user.email : null; }

  userId() { return this.session && this.session.user ? this.session.user.id : null; }

  _keep(data) {
    if (!data || !data.access_token) return;
    this.session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      user: { id: data.user && data.user.id, email: data.user && data.user.email },
    };
    this.store.save(this.session);
  }

  async signUp(email, password) {
    if (!this.enabled()) throw new CloudError('notConfigured');
    const data = await req('POST', `${this.url}/auth/v1/signup`, { headers: { apikey: this.key }, body: { email, password } });
    if (data && data.access_token) { this._keep(data); return { signedIn: true }; }
    return { signedIn: false, needsConfirm: true };
  }

  async signIn(email, password) {
    if (!this.enabled()) throw new CloudError('notConfigured');
    const data = await req('POST', `${this.url}/auth/v1/token?grant_type=password`, { headers: { apikey: this.key }, body: { email, password } });
    this._keep(data);
    return { signedIn: true };
  }

  async resetPassword(email) {
    if (!this.enabled()) throw new CloudError('notConfigured');
    await req('POST', `${this.url}/auth/v1/recover`, { headers: { apikey: this.key }, body: { email } });
    return { ok: true };
  }

  async token() {
    if (!this.signedIn()) throw new CloudError('auth');
    if (this.session.expires_at - 60 > Date.now() / 1000) return this.session.access_token;
    try {
      const data = await req('POST', `${this.url}/auth/v1/token?grant_type=refresh_token`, { headers: { apikey: this.key }, body: { refresh_token: this.session.refresh_token } });
      this._keep(data);
      return this.session.access_token;
    } catch (e) {
      if (e.code === 'auth' || e.code === 'badLogin' || e.code === 'server') this.signOut();
      throw e;
    }
  }

  signOut() {
    this.session = null;
    this.store.save(null);
  }

  async pull() {
    const tok = await this.token();
    const rows = await req('GET', `${this.url}/rest/v1/halyra_sync?select=data,device,updated_at&user_id=eq.${encodeURIComponent(this.userId())}`, { headers: { apikey: this.key, authorization: `Bearer ${tok}` } });
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }

  async push(data, device) {
    const tok = await this.token();
    await req('POST', `${this.url}/rest/v1/halyra_sync?on_conflict=user_id`, {
      headers: { apikey: this.key, authorization: `Bearer ${tok}`, prefer: 'resolution=merge-duplicates,return=minimal' },
      body: [{ user_id: this.userId(), data, device, updated_at: new Date().toISOString() }],
    });
    return true;
  }
}

module.exports = { CloudClient, CloudError };
