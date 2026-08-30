// Système de feuilles modales (sheets), dialogues de confirmation et menus d'action.
// Chaque appel ajoute ses propres nœuds DOM dans #modal-root : plusieurs modales peuvent donc
// s'empiler naturellement (l'ordre du DOM détermine l'ordre d'affichage).
import { renderIcons, icon } from "./icon.js";

const root = () => document.getElementById("modal-root");

function makeBackdrop(onDismiss) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.addEventListener("click", onDismiss);
  return backdrop;
}

// ============ Pages ============
// Écrans de contenu (gestionnaires, détails, formulaires) : empilés plein écran avec un
// glissement depuis la droite et une navigation retour, plutôt que des feuilles qui remontent
// du bas — ça se comporte comme de vraies pages d'application. Les menus d'action, sélecteurs
// et confirmations restent volontairement des feuilles/dialogues (des choix ponctuels, pas des
// écrans). `openFormSheet` et `openSheetCustom` s'appuient toutes les deux sur `pushPage`.
const pageStack = [];

function pushPage({ headerHTML }) {
  const page = document.createElement("div");
  page.className = "page";
  page.innerHTML = `
    <div class="page__header">${headerHTML}</div>
    <div class="page__body"></div>
  `;
  root().append(page);
  pageStack.push(page);

  const headerEl = page.querySelector(".page__header");
  const bodyEl = page.querySelector(".page__body");

  function close() {
    page.classList.remove("is-open");
    const idx = pageStack.indexOf(page);
    if (idx !== -1) pageStack.splice(idx, 1);
    setTimeout(() => page.remove(), 280);
  }

  requestAnimationFrame(() => page.classList.add("is-open"));

  return { page, headerEl, bodyEl, close };
}

/**
 * Ouvre une page de type formulaire, avec en-tête (Annuler / Titre / Enregistrer) et un corps
 * défilable. `build(bodyEl, api)` remplit le corps ; `onSave(api)` est appelé au clic sur
 * "Enregistrer" (ou le libellé fourni).
 */
export function openFormSheet({
  title,
  cancelLabel = "Annuler",
  saveLabel = "Enregistrer",
  onCancel,
  onSave,
  build,
}) {
  const { page, headerEl, bodyEl, close } = pushPage({
    headerHTML: `
      <button class="page__back" data-action="cancel">${cancelLabel}</button>
      <div class="page__title">${title}</div>
      <button class="page__action" data-action="save">${saveLabel}</button>
    `,
  });

  const saveBtn = headerEl.querySelector('[data-action="save"]');
  const cancelBtn = headerEl.querySelector('[data-action="cancel"]');

  const api = {
    close,
    setSaveEnabled(enabled) {
      saveBtn.disabled = !enabled;
    },
    setSaveLabel(label) {
      saveBtn.textContent = label;
    },
    showError(message) {
      let errEl = bodyEl.querySelector(".error-text");
      if (!errEl) {
        errEl = document.createElement("p");
        errEl.className = "error-text";
        bodyEl.appendChild(errEl);
      }
      errEl.textContent = message;
    },
    clearError() {
      const errEl = bodyEl.querySelector(".error-text");
      if (errEl) errEl.remove();
    },
  };

  cancelBtn.addEventListener("click", () => {
    close();
    if (onCancel) onCancel();
  });
  saveBtn.addEventListener("click", () => onSave(api));

  build(bodyEl, api);
  renderIcons(page);

  return api;
}

/** Page libre (pas de header formulaire standard) : détail de compte, filtres... */
export function openSheetCustom({ title, leading, trailing, build, onClose }) {
  const isDefaultLeading = !leading?.label || leading.label === "Fermer";
  const { page, headerEl, bodyEl, close } = pushPage({
    headerHTML: `
      <button class="page__back" data-action="leading">${icon("chevron-left")}${isDefaultLeading ? "" : `<span>${leading.label}</span>`}</button>
      <div class="page__title">${title}</div>
      <button class="page__action" data-action="trailing" ${trailing?.label ? "" : 'style="visibility:hidden;"'}>${trailing?.label ?? ""}</button>
    `,
  });

  function closeAndNotify() {
    close();
    if (onClose) onClose();
  }

  headerEl.querySelector('[data-action="leading"]').addEventListener("click", () => {
    closeAndNotify();
    if (leading?.onClick) leading.onClick();
  });
  const trailingBtn = headerEl.querySelector('[data-action="trailing"]');
  trailingBtn.addEventListener("click", () => {
    if (trailing?.onClick) trailing.onClick({ close: closeAndNotify });
  });

  const api = { close: closeAndNotify, bodyEl };
  build(bodyEl, api);
  renderIcons(page);

  return api;
}

/** Menu latéral de navigation, glissant depuis la gauche (comptes, catégories, paramètres...). */
export function openDrawer({ build, onClose }) {
  const backdrop = makeBackdrop(() => close());
  const drawer = document.createElement("div");
  drawer.className = "drawer";
  root().append(backdrop, drawer);

  function close() {
    drawer.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    setTimeout(() => {
      drawer.remove();
      backdrop.remove();
    }, 220);
    if (onClose) onClose();
  }

  const api = { close };
  build(drawer, api);
  renderIcons(drawer);

  requestAnimationFrame(() => {
    backdrop.classList.add("is-open");
    drawer.classList.add("is-open");
  });

  return api;
}

export function confirmDialog({ title, message, confirmLabel = "Supprimer", cancelLabel = "Annuler", destructive = true, onConfirm }) {
  const backdrop = makeBackdrop(() => close());
  const dialog = document.createElement("div");
  dialog.className = "dialog";
  dialog.innerHTML = `
    <h3>${title}</h3>
    <p>${message}</p>
    <div class="dialog__actions">
      <button class="btn ${destructive ? "btn--danger" : "btn--primary"}" data-action="confirm">${confirmLabel}</button>
      <button class="btn btn--secondary" data-action="cancel">${cancelLabel}</button>
    </div>
  `;
  root().append(backdrop, dialog);

  function close() {
    dialog.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    setTimeout(() => { dialog.remove(); backdrop.remove(); }, 180);
  }

  dialog.querySelector('[data-action="cancel"]').addEventListener("click", close);
  dialog.querySelector('[data-action="confirm"]').addEventListener("click", () => {
    close();
    onConfirm();
  });

  requestAnimationFrame(() => {
    backdrop.classList.add("is-open");
    dialog.classList.add("is-open");
  });
}

export function openActionSheet({ title, actions }) {
  const backdrop = makeBackdrop(() => close());
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  const rows = actions
    .map(
      (a, i) => `<button class="form-row" data-idx="${i}" style="${a.destructive ? "color:var(--red)" : ""}">
        <span class="form-row__label" style="display:flex;align-items:center;gap:10px;${a.destructive ? "color:var(--red)" : ""}">${a.icon ? icon(a.icon) : ""}${a.label}</span>
      </button>`
    )
    .join("");
  sheet.innerHTML = `
    <div class="sheet__grabber"></div>
    ${title ? `<div class="sheet__header" style="border-bottom:none;justify-content:center;"><div class="sheet__title">${title}</div></div>` : ""}
    <div class="sheet__body form-group" style="padding-top:0;">${rows}</div>
  `;
  root().append(backdrop, sheet);

  function close() {
    sheet.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    setTimeout(() => { sheet.remove(); backdrop.remove(); }, 220);
  }

  sheet.querySelectorAll("[data-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = actions[Number(btn.dataset.idx)];
      close();
      action.onClick();
    });
  });

  renderIcons(sheet);
  requestAnimationFrame(() => {
    backdrop.classList.add("is-open");
    sheet.classList.add("is-open");
  });

  return { close };
}

/**
 * Feuille de sélection (remplace les <select> natifs, dont le rendu du menu déroulant est
 * incohérent et trop étroit sur mobile). `options`: [{ value, label, icon?, color? }].
 * Un tap sur une option la sélectionne et referme la feuille.
 */
export function openPickerSheet({ title, options, selectedValue, onSelect }) {
  const backdrop = makeBackdrop(() => close());
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  const rows = options
    .map((opt, i) => {
      const leading = opt.icon
        ? `<span class="icon-swatch" style="width:30px;height:30px;flex-shrink:0;background:${opt.color || "#8E8E93"}33;color:${opt.color || "var(--text-secondary)"}">${icon(opt.icon)}</span>`
        : opt.color
        ? `<span class="chart-legend__dot" style="background:${opt.color};width:10px;height:10px;flex-shrink:0;"></span>`
        : "";
      return `
      <button class="form-row" data-idx="${i}">
        <span class="form-row__label" style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;">
          ${leading}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${opt.label}</span>
        </span>
        ${opt.value === selectedValue ? `<span style="color:var(--accent);flex-shrink:0;">${icon("check")}</span>` : ""}
      </button>`;
    })
    .join("");
  sheet.innerHTML = `
    <div class="sheet__grabber"></div>
    <div class="sheet__header" style="justify-content:center;border-bottom:1px solid var(--separator);">
      <div class="sheet__title">${title}</div>
    </div>
    <div class="sheet__body form-group" style="padding-top:0;max-height:60vh;overflow-y:auto;">${rows || `<div class="form-row"><span class="form-row__label" style="color:var(--text-secondary);">Aucune option disponible</span></div>`}</div>
  `;
  root().append(backdrop, sheet);

  function close() {
    sheet.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    setTimeout(() => { sheet.remove(); backdrop.remove(); }, 220);
  }

  sheet.querySelectorAll("[data-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const opt = options[Number(btn.dataset.idx)];
      close();
      onSelect(opt.value);
    });
  });

  renderIcons(sheet);
  requestAnimationFrame(() => {
    backdrop.classList.add("is-open");
    sheet.classList.add("is-open");
  });

  return { close };
}

/** Visualiseur plein écran pour une photo de reçu attachée à une transaction. */
export function openPhotoViewer(dataUrl) {
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop is-open";
  overlay.style.zIndex = "90";
  overlay.style.display = "flex";
  overlay.style.flexDirection = "column";
  overlay.innerHTML = `
    <div style="display:flex;justify-content:flex-end;padding:calc(env(safe-area-inset-top,0px) + 12px) 16px 12px;">
      <button data-action="close" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.15);color:white;display:flex;align-items:center;justify-content:center;">${icon("x")}</button>
    </div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:0 12px 12px;overflow:auto;">
      <img src="${dataUrl}" style="max-width:100%;max-height:100%;border-radius:12px;object-fit:contain;" />
    </div>
  `;
  document.getElementById("modal-root").appendChild(overlay);
  function close() {
    overlay.remove();
  }
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('[data-action="close"]').addEventListener("click", close);
  renderIcons(overlay);
  return { close };
}
