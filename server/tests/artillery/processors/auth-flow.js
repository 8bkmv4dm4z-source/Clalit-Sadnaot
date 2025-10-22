'use strict';

/**
 * Processor for Artillery:
 * - ensureEmail
 * - foldLoginTokens
 * - buildRegisterPayloadIfNoToken
 * - foldRetryTokens
 * - afterResponse (pretty flow logs)
 */

// --------- helpers ----------
function parseJSON(body) {
  try { return JSON.parse(String(body || '')); } catch { return {}; }
}

function tokenFromBody(body) {
  const o = parseJSON(body);
  return o.accessToken || o.token || o?.data?.accessToken || null;
}

function tokenFromSetCookieStr(raw) {
  if (!raw) return null;
  const s = Array.isArray(raw) ? raw.join('; ') : String(raw);
  const m =
    s.match(/(?:^|;\s*)accessToken=([^;]+)/i) ||
    s.match(/(?:^|;\s*)token=([^;]+)/i) ||
    s.match(/(?:^|;\s*)jwt=([^;]+)/i);
  return m ? m[1] : null;
}

// --------- step functions (called by YAML "function: <name>") ----------
function ensureEmail(context, events, done) {
  const v = context.vars;
  const email = (v.email || `u${Math.floor(Math.random() * 1e6)}@test.com`).toLowerCase();
  v.email = email;
  v.password = v.password || 'LoadTest@1234';
  return done();
}

// First login fold
function foldLoginTokens(context, events, done) {
  const v = context.vars;
  v.token = v.token || v.token_alt || v.token_data || null;
  v.needRegister = !v.token;
  v.needRetry    = !v.token;
  if (!v.token) console.log(`🔐 No token yet for ${v.email}`);
  return done();
}

// Prepare register payload only if we still have no token
function buildRegisterPayloadIfNoToken(context, events, done) {
  const v = context.vars;
  if (!v.needRegister) { v._regPayload = null; return done(); }

  const email = (v.email || `u${Date.now()}_${Math.floor(Math.random()*1e6)}@test.com`).toLowerCase();
  const local = email.includes('@') ? email.split('@')[0] : email;

  const rand7 = String(1000000 + Math.floor(Math.random() * 9000000));
const phone = `050${rand7}`; // 050-XXXXXXX

v._regPayload = {
  name: local,
  email,
  password: v.password || 'LoadTest@1234',
  idNumber: `${10000000 + Math.floor(Math.random() * 9000000)}`,
  birthDate: '1995-01-01',
  city: 'LoadCity',
  phone,
  canCharge: false,
  familyMembers: [],
  role: 'user',
};

  console.log(`🚀 Register payload:`, context.vars._regPayload);

  // keep the email consistent for the next login
  v.email = email;

  console.log(`🆕 Registering ${email}`);
  return done();
}

// Final fold after the second login (also look at Set-Cookie captured header)
function foldRetryTokens(context, events, done) {
  const v = context.vars;

  // consolidate from JSON captures
  v.token = v.token || v.token_alt || v.token_data || null;

  // also try parsing the Set-Cookie header captured in YAML as 'set_cookie'
  if (!v.token && v.set_cookie) {
    const fromCookie = tokenFromSetCookieStr(v.set_cookie);
    if (fromCookie) v.token = fromCookie;
  }

  v.needRetry = !v.token;

  if (v.token) console.log(`✅ Got token for ${v.email}`);
  else console.log(`❌ No token for ${v.email} — protected calls will be skipped`);

  return done();
}

// --------- nice logs on responses ----------
function afterResponse(req, res, context, ee, done) {
  try {
    const name  = req.name || req.url || '';
    const code  = res?.statusCode;
    const email = context?.vars?.email || '(no-email)';

    // sniff token from body or Set-Cookie on the fly
    if (!context.vars.token) {
      const bodyTok   = tokenFromBody(res?.body);
      const cookieTok = tokenFromSetCookieStr(res?.headers?.['set-cookie'] || res?.headers?.['Set-Cookie']);
      context.vars.token = context.vars.token || bodyTok || cookieTok || null;
    }

    // pretty flow logs
    if (/Login/i.test(name)) {
      if (code >= 200 && code < 300 && context.vars.token) {
        console.log(`👤 ${email}: logged in!!`);
      } else if (code >= 400) {
        console.log(`🛑 ${email}: login failed (${code})`);
      }
    }

    if (/Register/i.test(name)) {
      if (code >= 200 && code < 300) {
        console.log(`🆕 ${email}: registered`);
      } else if (code >= 400) {
        console.log(`🛑 ${email}: register failed (${code})`);
      }
    }

    if (/Workshops \(unauth probe\)/.test(name)) {
      if ([200,401,403].includes(code)) {
        console.log(`🧭 ${email}: navigated to /workshops (unauth -> ${code})`);
      }
    }

    if (/Workshops \(auth burst\)/.test(name) && code === 200) {
      console.log(`🧭 ${email}: navigated to /workshops (auth)`);
    }

    if (/Profile \(auth\)/.test(name) && code === 200) {
      console.log(`📇 ${email}: opened /profile`);
    }
  } catch {}
  return done();
}

module.exports = {
  ensureEmail,
  foldLoginTokens,
  buildRegisterPayloadIfNoToken,
  foldRetryTokens,
  afterResponse,
};
