import { DB, Budgets, Transactions, Accounts, Categories } from "../db.js";
import { formatAmount, parseAmount, monthYearLabel, addMonths } from "../format.js";
import * as Calc from "../calculator.js";
import { icon, renderIcons } from "../components/icon.js";
import { openFormSheet, openSheetCustom, confirmDialog, openActionSheet, openPickerSheet } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import { escapeHtml } from "../util.js";
import { Notifications } from "../notifications.js";

let referenceDate = new Date();

const ALERT_LABEL = { soon: "Budget presque atteint", over: "Budget dépassé" };

// ============ Gestion des budgets ============
export function openBudgetsManager() {
  let bodyRef = null;
  const unsubscribe = DB.onChange(() => { if (bodyRef) render(bodyRef); });

  openSheetCustom({
    title: "Budgets",
    leading: { label: "Fermer" },
    trailing: { label: "Ajouter", onClick: () => openAddEditBudget({}) },
    onClose: unsubscribe,
    build: (body) => { bodyRef = body; render(body); },
  });
}

/**
 * Vérifie les budgets du mois en cours et déclenche une notification pour ceux qui viennent
 * d'atteindre 70% (soon) ou de dépasser (over) leur montant, une seule fois par palier
 * (`notifiedLevel`). Sans effet si les notifications ne sont pas activées.
 */
export function checkBudgetNotifications() {
  if (!Notifications.isEnabled()) return;
  const now = new Date();
  const budgets = Budgets.forMonth(now.getMonth() + 1, now.getFullYear());
  const transactions = Transactions.all();
  const currency = Accounts.all()[0]?.currency || "fcfa";

  for (const budget of budgets) {
    const spent = Calc.spentOnBudget(budget, transactions);
    const level = Calc.budgetAlertLevel(spent, budget.amount);
    if (!level || budget.notifiedLevel === level) continue;
    Notifications.notify(`${ALERT_LABEL[level]} : ${budget.name}`, {
      body: `${formatAmount(spent, currency)} dépensés sur ${formatAmount(budget.amount, currency)}.`,
      tag: `budget-${budget.id}-${level}`,
      icon: "icons/icon-192.png",
    });
    Budgets.update(budget.id, { notifiedLevel: level });
  }
}

export function render(container) {
  const month = referenceDate.getMonth() + 1;
  const year = referenceDate.getFullYear();
  const budgets = Budgets.forMonth(month, year);
  const transactions = Transactions.all();
  const primaryCurrency = Accounts.all()[0]?.currency || "fcfa";

  container.innerHTML = `
    <div class="view">
      <div class="month-selector">
        <button class="icon-btn" id="budget-prev">${icon("chevron-left")}</button>
        <span class="month-selector__label">${monthYearLabel(referenceDate)}</span>
        <button class="icon-btn" id="budget-next">${icon("chevron-right")}</button>
      </div>
      <div id="budget-list" style="display:flex;flex-direction:column;gap:14px;"></div>
    </div>
  `;

  container.querySelector("#budget-prev").addEventListener("click", () => { referenceDate = addMonths(referenceDate, -1); render(container); renderIcons(container); });
  container.querySelector("#budget-next").addEventListener("click", () => { referenceDate = addMonths(referenceDate, 1); render(container); renderIcons(container); });

  const listEl = container.querySelector("#budget-list");
  if (budgets.length === 0) {
    const prevDate = addMonths(referenceDate, -1);
    const prevBudgets = Budgets.forMonth(prevDate.getMonth() + 1, prevDate.getFullYear());
    listEl.innerHTML = `
      <div class="card">
        <div class="empty-state">
          ${icon("pie-chart")}
          <h3>Aucun budget</h3>
          <p>Définissez un budget mensuel par catégorie pour mieux maîtriser vos dépenses.</p>
          <button class="btn btn--primary" id="budget-empty-add">Créer un budget</button>
          ${prevBudgets.length > 0 ? `<button class="btn btn--secondary mt-16" id="budget-empty-carry">Reconduire les budgets ${elidedDe(monthYearLabel(prevDate).toLowerCase())} (${prevBudgets.length})</button>` : ""}
        </div>
      </div>
    `;
    listEl.querySelector("#budget-empty-add").addEventListener("click", () => openAddEditBudget({ month, year }));
    const carryBtn = listEl.querySelector("#budget-empty-carry");
    if (carryBtn) {
      carryBtn.addEventListener("click", () => {
        for (const b of prevBudgets) {
          Budgets.create({ name: b.name, amount: b.amount, categoryId: b.categoryId, month, year });
        }
        showToast(`${prevBudgets.length} budget${prevBudgets.length > 1 ? "s" : ""} reconduit${prevBudgets.length > 1 ? "s" : ""}`);
      });
    }
  } else {
    listEl.innerHTML = budgets.map((b) => renderBudgetCard(b, transactions, primaryCurrency)).join("");
    listEl.querySelectorAll("[data-budget-id]").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("[data-more-id]")) return;
        openAddEditBudget({ budget: Budgets.get(card.dataset.budgetId), month, year });
      });
    });
    listEl.querySelectorAll("[data-more-id]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.moreId;
        openActionSheet({
          actions: [
            { label: "Modifier", icon: "pencil", onClick: () => openAddEditBudget({ budget: Budgets.get(id), month, year }) },
            { label: "Supprimer", icon: "trash-2", destructive: true, onClick: () => confirmDeleteBudget(id) },
          ],
        });
      });
    });
  }
}

/** Aperçu des budgets du mois en cours, utilisé dans la feuille "Objectifs & Budgets" de
 * l'accueil (indépendant de la navigation par mois de l'onglet Budgets). */
export function renderBudgetsPreviewSection(container, { onSeeAll } = {}) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const budgets = Budgets.forMonth(month, year);
  const transactions = Transactions.all();
  const primaryCurrency = Accounts.all()[0]?.currency || "fcfa";

  container.innerHTML = `
    <div class="section-header">
      <p class="section-title">Budgets</p>
      <span style="display:flex;align-items:center;gap:14px;">
        <button class="link-btn" id="gbp-add">Ajouter</button>
        ${onSeeAll ? `<button class="link-btn" id="gbp-see-all">Voir tout</button>` : ""}
      </span>
    </div>
    <div id="gbp-list" style="display:flex;flex-direction:column;gap:14px;"></div>
  `;

  container.querySelector("#gbp-add").addEventListener("click", () => openAddEditBudget({ month, year }));
  if (onSeeAll) container.querySelector("#gbp-see-all").addEventListener("click", onSeeAll);

  const listEl = container.querySelector("#gbp-list");
  if (budgets.length === 0) {
    listEl.innerHTML = `<div class="card"><div class="empty-state">${icon("pie-chart")}<h3>Aucun budget</h3><p>Définissez un budget mensuel par catégorie pour mieux maîtriser vos dépenses.</p></div></div>`;
  } else {
    listEl.innerHTML = budgets.map((b) => renderBudgetCard(b, transactions, primaryCurrency)).join("");
    listEl.querySelectorAll("[data-budget-id]").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("[data-more-id]")) return;
        openAddEditBudget({ budget: Budgets.get(card.dataset.budgetId), month, year });
      });
    });
    listEl.querySelectorAll("[data-more-id]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.moreId;
        openActionSheet({
          actions: [
            { label: "Modifier", icon: "pencil", onClick: () => openAddEditBudget({ budget: Budgets.get(id), month, year }) },
            { label: "Supprimer", icon: "trash-2", destructive: true, onClick: () => confirmDeleteBudget(id) },
          ],
        });
      });
    });
  }
  renderIcons(container);
}

function renderBudgetCard(budget, transactions, currency) {
  const category = budget.categoryId ? Categories.get(budget.categoryId) : null;
  const spent = Calc.spentOnBudget(budget, transactions);
  const progress = Calc.progress(spent, budget.amount);
  const isOver = spent > budget.amount;
  const isNear = !isOver && progress >= 0.7;
  const color = isOver ? "var(--red)" : isNear ? "var(--orange)" : "var(--green)";

  return `
  <div class="card budget-card" data-budget-id="${budget.id}" style="cursor:pointer;">
    <div class="budget-card__header">
      <span class="budget-card__name">${category ? icon(category.icon) : ""}${escapeHtml(budget.name)}</span>
      <span style="display:flex;align-items:center;gap:6px;">
        <span class="budget-card__percent" style="color:${color}">${Math.round(progress * 100)}%</span>
        <button class="icon-btn" data-more-id="${budget.id}">${icon("more-vertical")}</button>
      </span>
    </div>
    <div class="progress"><div class="progress__bar" style="width:${progress * 100}%;background:${color};"></div></div>
    <div class="budget-card__amounts">
      <span>Dépensé : ${formatAmount(spent, currency)}</span>
      <span>Budget : ${formatAmount(budget.amount, currency)}</span>
    </div>
    ${isOver ? `<div class="budget-card__warning" style="color:var(--red);">${icon("alert-triangle")}Budget dépassé de ${formatAmount(spent - budget.amount, currency)}</div>` : ""}
    ${isNear ? `<div class="budget-card__warning" style="color:var(--orange);">${icon("alert-circle")}Budget presque atteint</div>` : ""}
  </div>`;
}

function confirmDeleteBudget(id) {
  confirmDialog({
    title: "Supprimer ce budget ?",
    message: "Cette action est irréversible.",
    onConfirm: () => {
      Budgets.remove(id);
      showToast("Budget supprimé");
    },
  });
}

export function openAddEditBudget({ budget, month, year }) {
  const m = budget?.month ?? month ?? referenceDate.getMonth() + 1;
  const y = budget?.year ?? year ?? referenceDate.getFullYear();
  let selectedCategoryId = budget?.categoryId ?? null;
  let nameManuallyEdited = !!budget;

  openFormSheet({
    title: budget ? "Modifier le budget" : "Nouveau budget",
    build(body) {
      const monthDate = new Date(y, m - 1, 1);
      body.innerHTML = `
        <div class="form-section">
          <p class="form-section__label">Budget</p>
          <div class="form-group">
            <div class="form-row" id="f-category-row" style="cursor:pointer;">
              <span class="form-row__label">Catégorie</span>
              <span style="display:flex;align-items:center;gap:6px;color:var(--text-secondary);min-width:0;">
                <span id="f-category-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Choisir une catégorie</span>
                <span class="form-row__chevron">${icon("chevron-down")}</span>
              </span>
            </div>
            <div class="form-row"><input id="f-name" type="text" placeholder="Nom du budget" value="${budget ? escapeHtml(budget.name) : ""}" style="text-align:left;" /></div>
            <div class="form-row"><span class="form-row__label">Montant</span><input id="f-amount" type="text" inputmode="decimal" placeholder="0" value="${budget ? String(budget.amount) : ""}" /></div>
          </div>
          <p class="form-section__footer">Ce budget s'applique au mois de ${monthYearLabel(monthDate).toLowerCase()}.</p>
        </div>
      `;

      const expenseCategories = Categories.byType("expense");
      function updateCategoryLabel() {
        const cat = selectedCategoryId ? Categories.get(selectedCategoryId) : null;
        body.querySelector("#f-category-label").textContent = cat ? cat.name : "Choisir une catégorie";
      }
      updateCategoryLabel();
      body.querySelector("#f-category-row").addEventListener("click", () => {
        openPickerSheet({
          title: "Catégorie",
          selectedValue: selectedCategoryId,
          options: expenseCategories.map((c) => ({ value: c.id, label: c.name, icon: c.icon, color: c.colorHex })),
          onSelect: (value) => {
            selectedCategoryId = value;
            updateCategoryLabel();
            const nameInput = body.querySelector("#f-name");
            if (!nameManuallyEdited) {
              const cat = selectedCategoryId ? Categories.get(selectedCategoryId) : null;
              nameInput.value = cat?.name || "";
            }
          },
        });
      });
      body.querySelector("#f-name").addEventListener("input", () => (nameManuallyEdited = true));
    },
    onSave(sheetApi) {
      sheetApi.clearError();
      const name = document.getElementById("f-name").value.trim();
      if (!name) return sheetApi.showError("Le nom du budget est requis.");
      const amount = parseAmount(document.getElementById("f-amount").value);
      if (amount === null || amount <= 0) return sheetApi.showError("Veuillez saisir un montant valide, supérieur à zéro.");
      if (!selectedCategoryId) return sheetApi.showError("Veuillez choisir une catégorie.");

      const duplicate = Budgets.all().some((b) => b.categoryId === selectedCategoryId && b.month === m && b.year === y && b.id !== budget?.id);
      if (duplicate) return sheetApi.showError("Un budget existe déjà pour cette catégorie ce mois-ci.");

      if (budget) Budgets.update(budget.id, { name, amount, categoryId: selectedCategoryId });
      else Budgets.create({ name, amount, categoryId: selectedCategoryId, month: m, year: y });

      showToast(budget ? "Budget modifié" : "Budget créé");
      sheetApi.close();
    },
  });
}

/** "de {mois}" ou "d'{mois}" selon l'élision (ex. "d'août", "de septembre"). */
function elidedDe(monthLabel) {
  return /^[aeiouéèêàâî]/i.test(monthLabel) ? `d'${monthLabel}` : `de ${monthLabel}`;
}
