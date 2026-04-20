// ── Crypto — WebCrypto envelope for Gist E2E encryption ──
//
// Envelope v1 format:
// {
//   v: 1,
//   alg: 'AES-GCM-256',
//   wraps: [
//     { type: 'passkey',  credentialId, prfSalt, wrapIv, wrapped },
//     { type: 'password', kdf: 'PBKDF2-SHA256', iterations, salt, wrapIv, wrapped }
//   ],
//   payloadIv, payload
// }
// Master key (MK) is 32 random bytes. Each wrap encrypts MK bytes with a KEK
// derived from that unlock method. Payload = AES-GCM(MK, JSON.stringify(plain)).

const PBKDF2_ITERATIONS = 600000;
const HKDF_INFO = new TextEncoder().encode('meditrack-prf-wrap-v1');
const HKDF_SALT = new TextEncoder().encode('meditrack-prf-salt-v1');

// ── Base64 ──
export function toB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function toB64url(bytes) {
  return toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(b64u) {
  let s = b64u.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return fromB64(s);
}

// ── Master key ──
export function generateMasterKeyBytes() {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function importMkForGcm(mkBytes) {
  return crypto.subtle.importKey('raw', mkBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

// ── Password KEK (PBKDF2 → AES-GCM) ──
export async function derivePasswordKek(password, salt, iterations = PBKDF2_ITERATIONS) {
  const pwKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    pwKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── PRF KEK (HKDF → AES-GCM) ──
export async function derivePrfKek(prfSecret) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    prfSecret,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: HKDF_INFO },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── Wrap / unwrap MK bytes with a KEK ──
async function wrapBytes(bytes, kek) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, bytes);
  return { iv: toB64(iv), wrapped: toB64(new Uint8Array(ct)) };
}

async function unwrapBytes(wrappedB64, ivB64, kek) {
  const ct = fromB64(wrappedB64);
  const iv = fromB64(ivB64);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, kek, ct);
  return new Uint8Array(pt);
}

// ── Payload encrypt / decrypt with MK ──
export async function encryptPayload(plainObj, mkBytes) {
  const mk = await importMkForGcm(mkBytes);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(plainObj));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, mk, data);
  return { payloadIv: toB64(iv), payload: toB64(new Uint8Array(ct)) };
}

export async function decryptPayload(payloadB64, ivB64, mkBytes) {
  const mk = await importMkForGcm(mkBytes);
  const ct = fromB64(payloadB64);
  const iv = fromB64(ivB64);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, mk, ct);
  return JSON.parse(new TextDecoder().decode(pt));
}

// ── Envelope build / open ──
/**
 * Build a full envelope. `prfMaterial` is optional: { credentialId, prfSalt, prfSecret }.
 * Returns an envelope object ready to JSON-stringify.
 */
export async function buildEnvelope({ mkBytes, password, prfMaterial, plaintext }) {
  const wraps = [];

  if (prfMaterial?.prfSecret) {
    const kek = await derivePrfKek(prfMaterial.prfSecret);
    const { iv, wrapped } = await wrapBytes(mkBytes, kek);
    wraps.push({
      type: 'passkey',
      credentialId: prfMaterial.credentialId,
      prfSalt: toB64(prfMaterial.prfSalt),
      wrapIv: iv,
      wrapped,
    });
  }

  if (password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kek = await derivePasswordKek(password, salt, PBKDF2_ITERATIONS);
    const { iv, wrapped } = await wrapBytes(mkBytes, kek);
    wraps.push({
      type: 'password',
      kdf: 'PBKDF2-SHA256',
      iterations: PBKDF2_ITERATIONS,
      salt: toB64(salt),
      wrapIv: iv,
      wrapped,
    });
  }

  if (wraps.length === 0) throw new Error('No unlock method provided');

  const { payloadIv, payload } = await encryptPayload(plaintext, mkBytes);

  return {
    v: 1,
    alg: 'AES-GCM-256',
    wraps,
    payloadIv,
    payload,
  };
}

/**
 * Open an envelope with any of the provided unlockers.
 * `unlockers`: { password?, prfSecret? } — first matching wrap wins.
 * Throws if no wrap can be opened.
 * Returns { plaintext, mkBytes, usedWrap }.
 */
export async function openEnvelope(envelope, unlockers) {
  if (envelope.v !== 1) throw new Error('Unsupported envelope version: ' + envelope.v);
  if (envelope.alg !== 'AES-GCM-256') throw new Error('Unsupported alg: ' + envelope.alg);

  let mkBytes = null;
  let usedWrap = null;

  for (const wrap of envelope.wraps) {
    try {
      if (wrap.type === 'password' && unlockers.password) {
        const salt = fromB64(wrap.salt);
        const kek = await derivePasswordKek(unlockers.password, salt, wrap.iterations || PBKDF2_ITERATIONS);
        mkBytes = await unwrapBytes(wrap.wrapped, wrap.wrapIv, kek);
        usedWrap = wrap;
        break;
      }
      if (wrap.type === 'passkey' && unlockers.prfSecret) {
        const kek = await derivePrfKek(unlockers.prfSecret);
        mkBytes = await unwrapBytes(wrap.wrapped, wrap.wrapIv, kek);
        usedWrap = wrap;
        break;
      }
    } catch (_) {
      // Wrong password / wrong PRF → tag mismatch. Try next wrap.
      mkBytes = null;
    }
  }

  if (!mkBytes) throw new Error('Unable to unlock envelope');

  const plaintext = await decryptPayload(envelope.payload, envelope.payloadIv, mkBytes);
  return { plaintext, mkBytes, usedWrap };
}

/**
 * Re-encrypt payload with existing MK bytes (no wrap changes).
 * Use when entries/config change but unlock methods stay the same.
 */
export async function resealPayload(envelope, mkBytes, plaintext) {
  const { payloadIv, payload } = await encryptPayload(plaintext, mkBytes);
  return { ...envelope, payloadIv, payload };
}

/**
 * Add or replace a wrap in an envelope. Existing MK stays the same.
 * `spec`: { password } or { prfMaterial: { credentialId, prfSalt, prfSecret } }
 */
export async function addWrap(envelope, mkBytes, spec) {
  const wraps = envelope.wraps.filter(w => {
    if (spec.password && w.type === 'password') return false;
    if (spec.prfMaterial && w.type === 'passkey' && w.credentialId === spec.prfMaterial.credentialId) return false;
    return true;
  });

  if (spec.password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kek = await derivePasswordKek(spec.password, salt, PBKDF2_ITERATIONS);
    const { iv, wrapped } = await wrapBytes(mkBytes, kek);
    wraps.push({
      type: 'password',
      kdf: 'PBKDF2-SHA256',
      iterations: PBKDF2_ITERATIONS,
      salt: toB64(salt),
      wrapIv: iv,
      wrapped,
    });
  }

  if (spec.prfMaterial?.prfSecret) {
    const kek = await derivePrfKek(spec.prfMaterial.prfSecret);
    const { iv, wrapped } = await wrapBytes(mkBytes, kek);
    wraps.push({
      type: 'passkey',
      credentialId: spec.prfMaterial.credentialId,
      prfSalt: toB64(spec.prfMaterial.prfSalt),
      wrapIv: iv,
      wrapped,
    });
  }

  return { ...envelope, wraps };
}

/**
 * Remove wraps matching a predicate.
 */
export function removeWrap(envelope, predicate) {
  return { ...envelope, wraps: envelope.wraps.filter(w => !predicate(w)) };
}

// ── Session key cache ──
const SESSION_MK_KEY = 'ct_mk';

export function cacheMasterKey(mkBytes) {
  try { sessionStorage.setItem(SESSION_MK_KEY, toB64(mkBytes)); } catch (_) {}
}

export function loadCachedMasterKey() {
  try {
    const v = sessionStorage.getItem(SESSION_MK_KEY);
    return v ? fromB64(v) : null;
  } catch (_) { return null; }
}

export function clearCachedMasterKey() {
  try { sessionStorage.removeItem(SESSION_MK_KEY); } catch (_) {}
}
