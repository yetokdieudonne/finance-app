import { DB, Categories } from "../db.js";
import { icon, CATEGORY_ICONS, PALETTE, renderIcons } from "../components/icon.js";
import { openFormSheet, openSheetCustom, confirmDialog, openActionSheet } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import { escapeHtml } from "../util.js";

export function openCategoriesManager() {
  let bodyRef = null;
  const unsubscribe = DB.onChange(() => { if (bodyRef) renderList(bodyRef); });

  openSheetCustom({
    title: "Catégories",
    leading: { label: "Fermer" },
    onClose: unsubscribe,
    build: (body) => { bodyRef = body; renderList(body); },
  });

  function renderList(body) {
    const expense = Categories.byType("expense");
    const income = Categories.byType("income");

    body.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
        <button class="btn btn--secondary" id="cat-add-btn">${icon("plus")}Ajouter une catégorie</button>
      </div>
      <div class="form-section">
        <p class="form-section__label">Dépenses</p>
        <div class="form-group" id="cat-expense-list"></div>
      </div>
      <div class="form-section">
        <p class="form-section__label">Revenus</p>
        <div class="form-group" id="cat-income-list"></div>
      </div>
    `;

    fillGroup(body.querySelector("#cat-expense-list"), expense);
    fillGroup(body.querySelector("#cat-income-list"), income);
    body.querySelector("#cat-add-btn").addEventListener("click", () => openAddEditCategory({}));
    renderIcons(body);
  }

  function fillGroup(el, categories) {
    if (categories.length === 0) {
      el.innerHTML = `<div class="form-row"><span class="form-row__label" style="color:var(--text-secondary);">Aucune catégorie</span></div>`;
      return;
    }
    el.innerHTML = categories
      .map(
        (c) => `
      <div class="form-row" data-cat-id="${c.id}" style="cursor:pointer;">
        <span class="form-row__label" style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
          <span class="account-card__icon" style="width:32px;height:32px;background:${c.colorHex}33;color:${c.colorHex};flex-shrink:0;">${icon(c.icon)}</span>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(c.name)}</span>
        </span>
        ${c.isDefault ? `<span style="font-size:11px;color:var(--text-tertiary);flex-shrink:0;">Par défaut</span>` : ""}
        <button class="icon-btn" data-more-id="${c.id}" style="flex-shrink:0;">${icon("more-vertical")}</button>
      </div>`
      )
      .join("");

    el.querySelectorAll("[data-cat-id]").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-more-id]")) return;
        openAddEditCategory({ category: Categories.get(row.dataset.catId) });
      });
    });
    el.querySelectorAll("[data-more-id]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.moreId;
        openActionSheet({
          actions: [
            { label: "Modifier", icon: "pencil", onClick: () => openAddEditCategory({ category: Categories.get(id) }) },
            { label: "Supprimer", icon: "trash-2", destructive: true, onClick: () => confirmDeleteCategory(id) },
          ],
        });
      });
    });
  }
}

function confirmDeleteCategory(id) {
  confirmDialog({
    title: "Supprimer cette catégorie ?",
    message: "Les transactions et budgets utilisant cette catégorie ne seront pas supprimés, mais n'auront plus de catégorie associée.",
    onConfirm: () => {
      Categories.remove(id);
      showToast("Catégorie supprimée");
    },
  });
}

export function openAddEditCategory({ category }) {
  let type = category?.type || "expense";
  let selectedIcon = category?.icon || CATEGORY_ICONS[0];
  let color = category?.colorHex || PALETTE[0];

  openFormSheet({
    title: category ? "Modifier la catégorie" : "Nouvelle catégorie",
    build(body) {
      body.innerHTML = `
        <div class="form-section">
          <p class="form-section__label">Informations</p>
          <div class="form-group">
            <div class="form-row"><input id="f-name" type="text" placeholder="Nom de la catégorie" value="${category ? escapeHtml(category.name) : ""}" style="text-align:left;" /></div>
          </div>
          <div class="type-toggle mt-16" id="f-type" ${category ? 'style="opacity:.5;pointer-events:none;"' : ""}>
            <button data-value="expense">Dépense</button>
            <button data-value="income">Revenu</button>
          </div>
        </div>
        <div class="form-section">
          <p class="form-section__label">Icône</p>
          <div class="form-group"><div class="icon-grid" id="f-icons"></div></div>
        </div>
        <div class="form-section">
          <p class="form-section__label">Couleur</p>
          <div class="form-group"><div class="color-grid" id="f-colors"></div></div>
        </div>
      `;

      const typeToggle = body.querySelector("#f-type");
      function refreshTypeToggle() {
        typeToggle.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.value === type));
      }
      refreshTypeToggle();
      typeToggle.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { type = b.dataset.value; refreshTypeToggle(); }));

      const iconsEl = body.querySelector("#f-icons");
      function renderIconGrid() {
        iconsEl.innerHTML = CATEGORY_ICONS.map(
          (name) => `<button class="icon-swatch ${name === selectedIcon ? "is-selected" : ""}" style="--sel-color:${color};color:${name === selectedIcon ? color : "var(--text-secondary)"}" data-icon="${name}">${icon(name)}</button>`
        ).join("");
        iconsEl.querySelectorAll("[data-icon]").forEach((btn) => btn.addEventListener("click", () => { selectedIcon = btn.dataset.icon; renderIconGrid(); }));
        renderIcons(iconsEl);
      }
      renderIconGrid();

      const colorsEl = body.querySelector("#f-colors");
      function renderColorGrid() {
        colorsEl.innerHTML = PALETTE.map((hex) => `<button class="color-swatch ${hex === color ? "is-selected" : ""}" style="background:${hex}" data-color="${hex}"></button>`).join("");
        colorsEl.querySelectorAll("[data-color]").forEach((btn) => btn.addEventListener("click", () => { color = btn.dataset.color; renderColorGrid(); renderIconGrid(); }));
      }
      renderColorGrid();
    },
    onSave(sheetApi) {
      sheetApi.clearError();
      const name = document.getElementById("f-name").value.trim();
      if (!name) return sheetApi.showError("Le nom de la catégorie est requis.");

      if (category) {
        Categories.update(category.id, { name, icon: selectedIcon, colorHex: color });
      } else {
        Categories.create({ name, icon: selectedIcon, type, colorHex: color, isDefault: false });
      }
      showToast(category ? "Catégorie modifiée" : "Catégorie créée");
      sheetApi.close();
    },
  });
}
