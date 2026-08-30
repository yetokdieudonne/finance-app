// Clavier de code PIN (4 chiffres) : utilisé pour déverrouiller l'app et pour définir un
// nouveau code depuis les Paramètres (saisie puis confirmation).
import { Security } from "../security.js";
import { renderIcons } from "../components/icon.js";

const PIN_LENGTH = 4;

export function openPinPad({ mode, onSuccess, onCancel, title }) {
  const overlay = document.createElement("div");
  overlay.className = "lock-screen";
  overlay.style.zIndex = "110";
  document.getElementById("modal-root").appendChild(overlay);

  let step = mode === "create" ? "enter" : "verify"; // enter -> confirm (mode create)
  let firstPin = "";
  let currentPin = "";

  function render() {
    const heading =
      mode === "create"
        ? step === "enter" ? "Choisissez un code" : "Confirmez le code"
        : title || "Entrez votre code";

    overlay.innerHTML = `
      <div class="lock-screen__content">
        ${mode === "create" ? `<button class="btn btn--ghost" id="pin-cancel" style="align-self:flex-start;">Annuler</button>` : ""}
        <div class="lock-screen__icon"><i data-lucide="lock"></i></div>
        <h1>${heading}</h1>
        <p id="pin-error" class="lock-screen__error" hidden></p>
        <div class="pin-dots">${Array.from({ length: PIN_LENGTH }).map((_, i) => `<div class="pin-dot ${i < currentPin.length ? "is-filled" : ""}"></div>`).join("")}</div>
        <div class="pin-pad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-digit="${n}">${n}</button>`).join("")}
          <div class="pin-pad__empty"></div>
          <button data-digit="0">0</button>
          <button data-action="back"><i data-lucide="delete"></i></button>
        </div>
      </div>
    `;
    overlay.querySelectorAll("[data-digit]").forEach((btn) => {
      btn.addEventListener("click", () => appendDigit(btn.dataset.digit));
    });
    overlay.querySelector('[data-action="back"]').addEventListener("click", backspace);
    const cancelBtn = overlay.querySelector("#pin-cancel");
    if (cancelBtn) cancelBtn.addEventListener("click", () => { overlay.remove(); if (onCancel) onCancel(); });
    renderIcons(overlay);
  }

  function showError(message) {
    const el = overlay.querySelector("#pin-error");
    el.textContent = message;
    el.hidden = false;
  }

  async function appendDigit(digit) {
    if (currentPin.length >= PIN_LENGTH) return;
    currentPin += digit;
    render();
    if (currentPin.length === PIN_LENGTH) {
      await handleComplete();
    }
  }

  function backspace() {
    currentPin = currentPin.slice(0, -1);
    render();
  }

  async function handleComplete() {
    if (mode === "verify") {
      const ok = await Security.verifyPin(currentPin);
      if (ok) {
        overlay.remove();
        onSuccess();
      } else {
        currentPin = "";
        render();
        showError("Code incorrect. Réessayez.");
      }
      return;
    }

    // mode === "create"
    if (step === "enter") {
      firstPin = currentPin;
      currentPin = "";
      step = "confirm";
      render();
    } else {
      if (currentPin === firstPin) {
        await Security.setPin(currentPin);
        overlay.remove();
        onSuccess();
      } else {
        currentPin = "";
        firstPin = "";
        step = "enter";
        render();
        showError("Les codes ne correspondent pas. Recommencez.");
      }
    }
  }

  render();
  return { close: () => overlay.remove() };
}
