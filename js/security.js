// Protection de l'application par code PIN et/ou authentification biométrique de la
// plateforme (Face ID / Touch ID / Windows Hello...) via l'API WebAuthn du navigateur.
//
// Le PIN n'est jamais stocké en clair : seul un hachage SHA-256 (salé) est conservé.
// Aucune donnée financière n'est impliquée dans ce module — uniquement le verrou d'accès.

const KEY_LOCK_ENABLED = "finance.security.lockEnabled";
const KEY_PIN_HASH = "finance.security.pinHash";
const KEY_PIN_SALT = "finance.security.pinSalt";
const KEY_WEBAUTHN_CRED = "finance.security.webauthnCredentialId";
const KEY_AUTO_LOCK_DELAY = "finance.security.autoLockDelay"; // secondes, ou "never"

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const Security = {
  isLockEnabled() {
    return localStorage.getItem(KEY_LOCK_ENABLED) === "1";
  },
  setLockEnabled(enabled) {
    localStorage.setItem(KEY_LOCK_ENABLED, enabled ? "1" : "0");
  },

  hasPin() {
    return !!localStorage.getItem(KEY_PIN_HASH);
  },

  async setPin(pin) {
    const salt = bufToBase64(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await sha256Hex(salt + pin);
    localStorage.setItem(KEY_PIN_SALT, salt);
    localStorage.setItem(KEY_PIN_HASH, hash);
  },

  async verifyPin(pin) {
    const salt = localStorage.getItem(KEY_PIN_SALT) || "";
    const stored = localStorage.getItem(KEY_PIN_HASH);
    if (!stored) return false;
    const hash = await sha256Hex(salt + pin);
    return hash === stored;
  },

  clearPin() {
    localStorage.removeItem(KEY_PIN_HASH);
    localStorage.removeItem(KEY_PIN_SALT);
  },

  getAutoLockDelay() {
    return localStorage.getItem(KEY_AUTO_LOCK_DELAY) || "0";
  },
  setAutoLockDelay(value) {
    localStorage.setItem(KEY_AUTO_LOCK_DELAY, value);
  },

  hasWebAuthnCredential() {
    return !!localStorage.getItem(KEY_WEBAUTHN_CRED);
  },

  clearWebAuthnCredential() {
    localStorage.removeItem(KEY_WEBAUTHN_CRED);
  },

  async isBiometricAvailable() {
    if (!window.PublicKeyCredential || !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return false;
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  },

  // Enregistre un identifiant biométrique local (Face ID / Touch ID / Windows Hello selon
  // l'appareil). Aucune donnée n'est envoyée à un serveur : le challenge est purement local,
  // seul le succès de la cérémonie WebAuthn compte ici (application 100% locale, sans backend).
  async registerBiometric() {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "Finance" },
        user: { id: userId, name: "utilisateur-finance", displayName: "Utilisateur Finance" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
        timeout: 60000,
        attestation: "none",
      },
    });
    if (!credential) throw new Error("Échec de la création de l'identifiant biométrique.");
    localStorage.setItem(KEY_WEBAUTHN_CRED, bufToBase64(credential.rawId));
    return true;
  },

  async verifyBiometric() {
    const stored = localStorage.getItem(KEY_WEBAUTHN_CRED);
    if (!stored) return false;
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: base64ToBuf(stored), type: "public-key" }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!assertion;
  },
};
