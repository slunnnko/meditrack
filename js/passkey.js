// ── Passkey — WebAuthn PRF extension helpers ──
//
// Uses the "prf" extension to derive a stable 32-byte secret from a passkey
// without ever exposing the private key. The same (credential, prfSalt) pair
// always yields the same secret, so we can use it as a KEK for the master key.

import { fromB64, toB64, fromB64url, toB64url } from './crypto.js';

/**
 * Feature-detect WebAuthn + platform authenticator availability.
 */
export function isWebAuthnSupported() {
  return typeof window !== 'undefined'
    && !!window.PublicKeyCredential
    && typeof navigator.credentials?.create === 'function'
    && typeof navigator.credentials?.get === 'function';
}

/**
 * Is a platform authenticator (Touch ID / Windows Hello / Android) available?
 */
export async function isPlatformAuthenticatorAvailable() {
  if (!isWebAuthnSupported()) return false;
  try {
    return !!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch (_) {
    return false;
  }
}

function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

/**
 * Register a new passkey with PRF enabled.
 * Immediately authenticates to obtain the PRF secret — two touches, one setup.
 *
 * Returns { credentialId, prfSalt, prfSecret } on success, or null if PRF is
 * not supported by the authenticator.
 */
export async function registerPasskeyWithPrf({ rpId, rpName, userName }) {
  if (!isWebAuthnSupported()) throw new Error('WebAuthn not supported');

  const prfSalt = randomBytes(32);
  const userId = randomBytes(16);

  const createOptions = {
    publicKey: {
      rp: { id: rpId, name: rpName },
      user: {
        id: userId,
        name: userName,
        displayName: userName,
      },
      challenge: randomBytes(32),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },    // ES256
        { type: 'public-key', alg: -257 },  // RS256
      ],
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
      timeout: 60000,
      extensions: {
        prf: { eval: { first: prfSalt } },
      },
    },
  };

  const cred = await navigator.credentials.create(createOptions);
  if (!cred) throw new Error('Passkey registration cancelled');

  const ext = cred.getClientExtensionResults?.() || {};
  const prfExt = ext.prf || {};

  if (prfExt.enabled === false) {
    // Authenticator doesn't support PRF — roll back by surfacing null.
    // (The credential exists but is useless for our purposes.)
    return null;
  }

  const credentialId = new Uint8Array(cred.rawId);

  // Some browsers (Safari) return prf.results.first already on create.
  let prfSecret = prfExt.results?.first ? new Uint8Array(prfExt.results.first) : null;

  // Otherwise, do an authenticate round-trip to obtain it.
  if (!prfSecret) {
    prfSecret = await getPrfSecret({ credentialId, prfSalt, rpId });
  }

  if (!prfSecret) return null;

  return { credentialId, prfSalt, prfSecret };
}

/**
 * Authenticate with an existing passkey and return the PRF secret.
 * Throws if cancelled or if PRF result is missing.
 */
export async function getPrfSecret({ credentialId, prfSalt, rpId }) {
  if (!isWebAuthnSupported()) throw new Error('WebAuthn not supported');

  const allowCredentials = credentialId
    ? [{ type: 'public-key', id: credentialId }]
    : undefined;

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId,
      allowCredentials,
      userVerification: 'required',
      timeout: 60000,
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });

  if (!assertion) throw new Error('Passkey authentication cancelled');

  const ext = assertion.getClientExtensionResults?.() || {};
  const first = ext.prf?.results?.first;
  if (!first) throw new Error('PRF extension did not return a result');

  return new Uint8Array(first);
}

// ── Serialization helpers for credentialId <-> string ──
export function credentialIdToString(bytes) {
  return toB64url(bytes);
}

export function credentialIdFromString(str) {
  return fromB64url(str);
}

export function prfSaltFromString(str) {
  return fromB64(str);
}
