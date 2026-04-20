// ── Sync Unlock — orchestrates E2E encryption over Gist sync ──
//
// Holds the master key (MK) for the session, manages the unlock modal,
// and provides helpers for setup / passkey add / password change.
// The MK is cached in sessionStorage so page reloads within a tab stay
// unlocked; closing the tab forces re-unlock.

import {
  buildEnvelope, openEnvelope, addWrap, removeWrap, resealPayload,
  cacheMasterKey, loadCachedMasterKey, clearCachedMasterKey,
  fromB64, toB64url,
} from './crypto.js';
import {
  isWebAuthnSupported, registerPasskeyWithPrf, getPrfSecret,
  credentialIdFromString, prfSaltFromString,
} from './passkey.js';
import { t } from './i18n.js';

const RP_NAME = 'Meditrack';

let _mkBytes = null;
let _envelope = null;

// ── Session accessors ──
export function isUnlocked() {
  return !!_mkBytes;
}

export function getMkBytes() {
  return _mkBytes;
}

export function getEnvelope() {
  return _envelope;
}

export function setSession(envelope, mkBytes) {
  _envelope = envelope;
  _mkBytes = mkBytes;
  if (mkBytes) cacheMasterKey(mkBytes);
}

export function loadFromSessionCache() {
  const cached = loadCachedMasterKey();
  if (cached) _mkBytes = cached;
  return !!cached;
}

export function clearSession() {
  _mkBytes = null;
  _envelope = null;
  clearCachedMasterKey();
}

// ── Passkey auto-unlock attempt ──
async function tryPasskey(envelope) {
  if (!isWebAuthnSupported()) return null;
  const passkeyWrap = envelope.wraps.find(w => w.type === 'passkey');
  if (!passkeyWrap) return null;
  try {
    const prfSecret = await getPrfSecret({
      credentialId: credentialIdFromString(passkeyWrap.credentialId),
      prfSalt: prfSaltFromString(passkeyWrap.prfSalt),
      rpId: location.hostname,
    });
    const { plaintext, mkBytes } = await openEnvelope(envelope, { prfSecret });
    return { plaintext, mkBytes };
  } catch (_) {
    return null;
  }
}

// ── Modal plumbing ──
function showOverlay(innerHtml) {
  let overlay = document.getElementById('unlockOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'unlockOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:500;display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div style="width:100%;max-width:420px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px;">${innerHtml}</div>`;
  overlay.style.display = 'flex';
  return overlay;
}

function hideOverlay() {
  const overlay = document.getElementById('unlockOverlay');
  if (overlay) overlay.style.display = 'none';
}

function renderUnlockModal({ envelope, onPassword, onPasskey, onCancel, error }) {
  const hasPasskey = envelope.wraps.some(w => w.type === 'passkey');
  const hasPassword = envelope.wraps.some(w => w.type === 'password');
  const passkeySupported = isWebAuthnSupported();

  const html = `
    <h3 style="margin:0 0 12px;font-size:16px;color:var(--text-primary);">${t('unlock.title')}</h3>
    <p style="font-size:12px;color:var(--text-dim);margin-bottom:16px;">${t('unlock.desc')}</p>
    ${hasPasskey && passkeySupported ? `
      <button class="btn-s" id="btnUnlockPasskey" style="width:100%;margin-bottom:12px;border-color:var(--accent);color:var(--accent);">${t('unlock.usePasskey')}</button>
      <div style="text-align:center;font-size:11px;color:var(--text-dim);margin:8px 0;">${t('unlock.or')}</div>
    ` : ''}
    ${hasPassword ? `
      <div style="margin-bottom:12px;">
        <input type="password" id="unlockPassword" placeholder="${t('unlock.password')}" autocomplete="current-password"
          style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:14px;">
      </div>
      <button class="btn-s" id="btnUnlockPassword" style="width:100%;margin-bottom:8px;border-color:var(--success);color:var(--success);">${t('unlock.unlock')}</button>
    ` : ''}
    ${error ? `<div style="font-size:12px;color:var(--danger);margin-top:8px;">${error}</div>` : ''}
    <button class="btn-s" id="btnUnlockCancel" style="width:100%;margin-top:8px;">${t('unlock.cancel')}</button>
  `;

  showOverlay(html);

  const pwInput = document.getElementById('unlockPassword');
  if (pwInput) pwInput.focus();

  document.getElementById('btnUnlockPasskey')?.addEventListener('click', onPasskey);
  document.getElementById('btnUnlockPassword')?.addEventListener('click', () => {
    onPassword(document.getElementById('unlockPassword').value);
  });
  document.getElementById('btnUnlockCancel')?.addEventListener('click', onCancel);
  pwInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') onPassword(pwInput.value);
  });
}

/**
 * Attempt to unlock the given envelope.
 * First tries passkey (if present & supported). If that fails or is cancelled,
 * shows a password modal. Resolves with { plaintext, mkBytes }.
 * Rejects if the user cancels.
 */
export async function promptUnlock(envelope) {
  // Try passkey silently first if available and looks likely to succeed.
  // We gate this behind user gesture via the modal button to avoid popups on load.
  return new Promise((resolve, reject) => {
    const finish = (result, err) => {
      if (err) {
        renderUnlockModal({
          envelope,
          onPassword: tryPassword,
          onPasskey: tryPasskeyInteractive,
          onCancel: () => { hideOverlay(); reject(new Error('cancelled')); },
          error: err,
        });
      } else {
        hideOverlay();
        resolve(result);
      }
    };

    const tryPassword = async (password) => {
      if (!password) { finish(null, t('unlock.enterPassword')); return; }
      try {
        const out = await openEnvelope(envelope, { password });
        finish(out);
      } catch (_) {
        finish(null, t('unlock.wrongPassword'));
      }
    };

    const tryPasskeyInteractive = async () => {
      try {
        const out = await tryPasskey(envelope);
        if (out) finish(out);
        else finish(null, t('unlock.passkeyFailed'));
      } catch (_) {
        finish(null, t('unlock.passkeyFailed'));
      }
    };

    renderUnlockModal({
      envelope,
      onPassword: tryPassword,
      onPasskey: tryPasskeyInteractive,
      onCancel: () => { hideOverlay(); reject(new Error('cancelled')); },
    });
  });
}

/**
 * First-run setup wizard. Returns { envelope, mkBytes, plaintext }.
 * `plaintext` is the initial payload (entries + config) that the caller supplies.
 */
export function promptSetup({ plaintext }) {
  return new Promise((resolve, reject) => {
    const passkeySupported = isWebAuthnSupported();

    const html = `
      <h3 style="margin:0 0 12px;font-size:16px;color:var(--text-primary);">${t('setup.title')}</h3>
      <p style="font-size:12px;color:var(--text-dim);margin-bottom:16px;">${t('setup.desc')}</p>
      <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">${t('setup.password')}</label>
      <input type="password" id="setupPw1" autocomplete="new-password"
        style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:14px;margin-bottom:8px;">
      <input type="password" id="setupPw2" placeholder="${t('setup.passwordRepeat')}" autocomplete="new-password"
        style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:14px;margin-bottom:12px;">
      ${passkeySupported ? `
        <label style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <input type="checkbox" id="setupAddPasskey" checked>
          ${t('setup.addPasskey')}
        </label>
      ` : ''}
      <div id="setupError" style="font-size:12px;color:var(--danger);margin-bottom:8px;display:none;"></div>
      <button class="btn-s" id="btnSetupGo" style="width:100%;margin-bottom:8px;border-color:var(--success);color:var(--success);">${t('setup.enable')}</button>
      <button class="btn-s" id="btnSetupCancel" style="width:100%;">${t('unlock.cancel')}</button>
    `;
    showOverlay(html);

    const errEl = document.getElementById('setupError');
    const showErr = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; };

    document.getElementById('btnSetupCancel').onclick = () => {
      hideOverlay();
      reject(new Error('cancelled'));
    };

    document.getElementById('btnSetupGo').onclick = async () => {
      const pw1 = document.getElementById('setupPw1').value;
      const pw2 = document.getElementById('setupPw2').value;
      if (!pw1 || pw1.length < 8) { showErr(t('setup.weakPassword')); return; }
      if (pw1 !== pw2) { showErr(t('setup.passwordMismatch')); return; }

      const wantPasskey = passkeySupported && document.getElementById('setupAddPasskey')?.checked;

      let prfMaterial = null;
      if (wantPasskey) {
        try {
          prfMaterial = await registerPasskeyWithPrf({
            rpId: location.hostname,
            rpName: RP_NAME,
            userName: t('app.title'),
          });
          if (!prfMaterial) {
            showErr(t('setup.passkeyUnsupported'));
            // Continue without passkey rather than aborting.
          }
        } catch (e) {
          // If user cancels passkey creation, still allow password-only setup.
          console.warn('Passkey registration failed:', e);
        }
      }

      try {
        const mkBytes = crypto.getRandomValues(new Uint8Array(32));
        const envelope = await buildEnvelope({
          mkBytes,
          password: pw1,
          prfMaterial: prfMaterial && {
            credentialId: toB64url(prfMaterial.credentialId),
            prfSalt: prfMaterial.prfSalt,
            prfSecret: prfMaterial.prfSecret,
          },
          plaintext,
        });
        hideOverlay();
        resolve({ envelope, mkBytes, plaintext });
      } catch (e) {
        showErr(e.message || String(e));
      }
    };
  });
}

/**
 * Add a passkey to an existing envelope (requires current MK).
 */
export async function promptAddPasskey(envelope, mkBytes) {
  const prfMaterial = await registerPasskeyWithPrf({
    rpId: location.hostname,
    rpName: RP_NAME,
    userName: t('app.title'),
  });
  if (!prfMaterial) throw new Error(t('setup.passkeyUnsupported'));
  return addWrap(envelope, mkBytes, {
    prfMaterial: {
      credentialId: toB64url(prfMaterial.credentialId),
      prfSalt: prfMaterial.prfSalt,
      prfSecret: prfMaterial.prfSecret,
    },
  });
}

/**
 * Remove all passkey wraps from an envelope.
 */
export function removePasskeys(envelope) {
  return removeWrap(envelope, w => w.type === 'passkey');
}

/**
 * Replace the password wrap with a new one.
 */
export async function changePassword(envelope, mkBytes, newPassword) {
  return addWrap(envelope, mkBytes, { password: newPassword });
}

/**
 * Re-encrypt the payload portion of an envelope with the current MK.
 */
export async function reseal(envelope, mkBytes, plaintext) {
  return resealPayload(envelope, mkBytes, plaintext);
}
