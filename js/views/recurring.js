import { DB, RecurringExpenses, Categories, Accounts, Transactions } from "../db.js";
import { formatAmount, parseAmount } from "../format.js";
import * as Calc from "../calculator.js";
import { icon, renderIcons } from "../components/icon.js";
import { openFormSheet, openSheetCustom, confirmDialog, openActionSheet, openPickerSheet } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import { escapeHtml } from "../util.js";
import { Notifications } from "../notifications.js";

const STATUS_LABEL = { paid: "Réglée", soon: "Bientôt", overdue: "En retard", ok: "" };

function dueLabel(daysUntilDue) {
  if (daysUntilDue === 0) return "Aujourd'hui";
  if (daysUntilDue === 1) return "Demain";
  if (daysUntilDue > 1) return `Dans ${daysUntilDue} jours`;
  return `En retard de ${Math.abs(daysUntilDue)} jour${Math.abs(daysUntilDue) > 1 ? "s" : ""}`;
}

function isIncome(item) {
  return (item.type || "expense") === "income";
}

function payLabel(item) {
  return isIncome(item) ? "Marquer reçu" : "Marquer payée";
}

/** Section "Échéances à venir" du Dashboard : n'affiche que les charges/revenus à surveiller
 * (proches de l'échéance ou en retard) — invisible si aucune alerte n'est active. */
export function renderDueChargesSection(container) {
  const currency = Accounts.all()[0]?.currency || "fcfa";
  const due = Calc.dueRecurringExpenses(RecurringExpenses.all());

  if (due.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <div>
      <p class="section-title">Échéances à venir</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${due.map(({ charge, daysUntilDue, status }) => chargeAlertRow(charge, daysUntilDue, status, currency)).join("")}
      </div>
    </div>
  `;

  container.querySelectorAll("[data-charge-id]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("[data-pay-id]")) return;
      openAddEditRecurring({ charge: RecurringExpenses.get(row.dataset.chargeId) });
    });
  });
  container.querySelectorAll("[data-pay-id]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      markAsSettled(btn.dataset.payId);
    });
  });
  renderIcons(container);
}

function chargeAlertRow(charge, daysUntilDue, status, currency) {
  const category = charge.categoryId ? Categories.get(charge.categoryId) : null;
  const income = isIncome(charge);
  const color = income ? "var(--accent)" : status === "overdue" ? "var(--red)" : "var(--orange)";
  return `
  <div class="charge-alert charge-alert--${income ? "soon" : status}" data-charge-id="${charge.id}" style="cursor:pointer;">
    <span class="charge-alert__icon" style="background:${(category?.colorHex || "#8E8E93")}2e;color:${category?.colorHex || "var(--text-secondary)"}">${icon(category?.icon || (income ? "arrow-down-circle" : "repeat"))}</span>
    <span class="charge-alert__body">
      <div class="charge-alert__name">${escapeHtml(charge.name)}</div>
      <div class="charge-alert__meta" style="color:${color}">${dueLabel(daysUntilDue)} · ${formatAmount(charge.amount, currency)}</div>
    </span>
    <button class="charge-alert__pay-btn" data-pay-id="${charge.id}" style="${income ? "background:var(--green);" : ""}">${payLabel(charge)}</button>
  </div>`;
}

function markAsSettled(id) {
  const charge = RecurringExpenses.get(id);
  if (!charge) return;
  if (!charge.accountId) {
    showToast("Choisissez d'abord un compte pour cette transaction récurrente.");
    openAddEditRecurring({ charge });
    return;
  }
  const income = isIncome(charge);
  const { periodKey } = Calc.recurringExpenseStatus(charge);
  const transaction = Transactions.create({
    amount: charge.amount,
    type: income ? "income" : "expense",
    title: charge.name,
    note: income ? "Revenu récurrent" : "Charge fixe",
    date: new Date().toISOString(),
    categoryId: charge.categoryId,
    accountId: charge.accountId,
  });
  RecurringExpenses.update(id, { lastPaidPeriod: periodKey, lastPaidTransactionId: transaction.id });
  showToast(income ? "Revenu enregistré" : "Charge marquée comme payée");
}

/**
 * Vérifie les charges/revenus récurrents dus et déclenche une notification navigateur pour
 * ceux qui viennent d'entrer en alerte (une seule fois par échéance, via `lastNotifiedPeriod`).
 * Sans effet si les notifications ne sont pas activées dans les Paramètres.
 */
export function checkDueNotifications() {
  if (!Notifications.isEnabled()) return;
  const due = Calc.dueRecurringExpenses(RecurringExpenses.all());
  for (const { charge, daysUntilDue, status, periodKey } of due) {
    if (charge.lastNotifiedPeriod === periodKey) continue;
    const income = isIncome(charge);
    const amountText = formatAmount(charge.amount, Accounts.all()[0]?.currency || "fcfa");
    const title = income ? `Revenu à venir : ${charge.name}` : `Charge à payer : ${charge.name}`;
    const body = status === "overdue"
      ? `${amountText} — échéance dépassée de ${Math.abs(daysUntilDue)} jour(s).`
      : `${amountText} — ${dueLabel(daysUntilDue).toLowerCase()}.`;
    Notifications.notify(title, { body, tag: `recurring-${charge.id}-${periodKey}`, icon: "icons/icon-192.png" });
    RecurringExpenses.update(charge.id, { lastNotifiedPeriod: periodKey });
  }
}

// ============ Gestion des transactions récurrentes ============
export function openRecurringManager() {
  let bodyRef = null;
  const unsubscribe = DB.onChange(() => { if (bodyRef) renderList(bodyRef); });

  openSheetCustom({
    title: "Transactions récurrentes",
    leading: { label: "Fermer" },
    onClose: unsubscribe,
    build: (body) => { bodyRef = body; renderList(body); },
  });

  function renderGroup(items, currency) {
    if (items.length === 0) {
      return `<div class="form-row"><span class="form-row__label" style="color:var(--text-secondary);">Aucune</span></div>`;
    }
    return items
      .map((c) => {
        const category = c.categoryId ? Categories.get(c.categoryId) : null;
        const { status } = Calc.recurringExpenseStatus(c);
        return `
      <div class="form-row" data-rec-id="${c.id}" style="cursor:pointer;">
        <span class="form-row__label" style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
          <span class="account-card__icon" style="width:34px;height:34px;background:${(category?.colorHex || "#8E8E93")}33;color:${category?.colorHex || "var(--text-secondary)"};flex-shrink:0;">${icon(category?.icon || "repeat")}</span>
          <span style="min-width:0;overflow:hidden;">
            <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(c.name)}</div>
            <div style="font-size:12px;color:var(--text-secondary);">Le ${c.dueDay} de chaque mois · ${formatAmount(c.amount, currency)}</div>
          </span>
        </span>
        ${status !== "ok" ? `<span class="status-pill status-pill--${status}">${STATUS_LABEL[status]}</span>` : ""}
        <button class="icon-btn" data-more-id="${c.id}" style="flex-shrink:0;">${icon("more-vertical")}</button>
      </div>`;
      })
      .join("");
  }

  function renderList(body) {
    const expenses = RecurringExpenses.byType("expense");
    const incomes = RecurringExpenses.byType("income");
    const currency = Accounts.all()[0]?.currency || "fcfa";

    body.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
        <button class="btn btn--secondary" id="rec-add-btn">${icon("plus")}Ajouter</button>
      </div>
      ${expenses.length === 0 && incomes.length === 0
        ? `<div class="empty-state">${icon("repeat")}<h3>Aucune transaction récurrente</h3><p>Ajoutez vos charges fixes (loyer, internet...) ou vos revenus récurrents (salaire...) pour ne plus en manquer l'échéance.</p></div>`
        : `
        <div class="form-section">
          <p class="form-section__label">Charges fixes</p>
          <div class="form-group" id="rec-expense-list">${renderGroup(expenses, currency)}</div>
        </div>
        <div class="form-section">
          <p class="form-section__label">Revenus récurrents</p>
          <div class="form-group" id="rec-income-list">${renderGroup(incomes, currency)}</div>
        </div>
        <p class="form-section__footer">Une alerte apparaît sur l'accueil (et en notification si activée dans les Paramètres) quelques jours avant l'échéance. Pour corriger un règlement erroné, supprimez la transaction correspondante dans l'onglet Transactions : l'échéance redeviendra due.</p>
      `}
    `;

    body.querySelectorAll("[data-rec-id]").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-more-id]")) return;
        openAddEditRecurring({ charge: RecurringExpenses.get(row.dataset.recId) });
      });
    });
    body.querySelectorAll("[data-more-id]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.moreId;
        const item = RecurringExpenses.get(id);
        openActionSheet({
          actions: [
            { label: payLabel(item), icon: "check-circle", onClick: () => markAsSettled(id) },
            { label: "Modifier", icon: "pencil", onClick: () => openAddEditRecurring({ charge: RecurringExpenses.get(id) }) },
            { label: "Supprimer", icon: "trash-2", destructive: true, onClick: () => confirmDeleteRecurring(id) },
          ],
        });
      });
    });

    body.querySelector("#rec-add-btn").addEventListener("click", () => openAddEditRecurring({}));
    renderIcons(body);
  }
}

function confirmDeleteRecurring(id) {
  confirmDialog({
    title: "Supprimer cette transaction récurrente ?",
    message: "Les transactions déjà enregistrées ne seront pas supprimées.",
    onConfirm: () => {
      RecurringExpenses.remove(id);
      showToast("Supprimée");
    },
  });
}

export function openAddEditRecurring({ charge }) {
  const accounts = Accounts.all();
  let type = charge?.type || "expense";
  let selectedCategoryId = charge?.categoryId ?? null;
  let selectedAccountId = charge?.accountId ?? accounts[0]?.id ?? null;

  openFormSheet({
    title: charge ? "Modifier" : "Nouvelle transaction récurrente",
    build(body) {
      body.innerHTML = `
        <div class="type-toggle" id="f-type" style="margin-bottom:16px;">
          <button data-value="expense">Charge fixe</button>
          <button data-value="income">Revenu récurrent</button>
        </div>

        <div class="form-section">
          <p class="form-section__label">Détails</p>
          <div class="form-group">
            <div class="form-row"><input id="f-name" type="text" placeholder="Nom (ex. Loyer, Salaire)" value="${charge ? escapeHtml(charge.name) : ""}" style="text-align:left;" /></div>
            <div class="form-row"><span class="form-row__label">Montant</span><input id="f-amount" type="text" inputmode="decimal" placeholder="0" value="${charge ? String(charge.amount) : ""}" /></div>
            <div class="form-row" id="f-category-row" style="cursor:pointer;">
              <span class="form-row__label">Catégorie</span>
              <span style="display:flex;align-items:center;gap:6px;color:var(--text-secondary);min-width:0;">
                <span id="f-category-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Aucune</span>
                <span class="form-row__chevron">${icon("chevron-down")}</span>
              </span>
            </div>
            <div class="form-row" id="f-account-row" style="cursor:pointer;">
              <span class="form-row__label">Compte</span>
              <span style="display:flex;align-items:center;gap:6px;color:var(--text-secondary);min-width:0;">
                <span id="f-account-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
                <span class="form-row__chevron">${icon("chevron-down")}</span>
              </span>
            </div>
          </div>
        </div>

        <div class="form-section">
          <p class="form-section__label">Échéance</p>
          <div class="form-group">
            <div class="form-row">
              <span class="form-row__label">Jour du mois</span>
              <input id="f-dueday" type="number" min="1" max="31" inputmode="numeric" value="${charge?.dueDay ?? 5}" style="max-width:80px;" />
            </div>
            <div class="form-row">
              <span class="form-row__label">Alerte avant échéance</span>
              <input id="f-reminder" type="number" min="0" max="30" inputmode="numeric" value="${charge?.reminderDays ?? 3}" style="max-width:80px;" />
              <span style="color:var(--text-secondary);font-size:14px;">jours</span>
            </div>
          </div>
          <p class="form-section__footer">Ex. : jour 5, alerte 3 jours avant — un signal apparaîtra sur l'accueil à partir du jour 2.</p>
        </div>
      `;

      const typeToggle = body.querySelector("#f-type");
      function refreshTypeToggle() {
        typeToggle.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.value === type));
      }
      refreshTypeToggle();
      typeToggle.querySelectorAll("button").forEach((b) =>
        b.addEventListener("click", () => {
          if (charge) return; // le type ne se change pas après création (comme pour les catégories)
          type = b.dataset.value;
          selectedCategoryId = null;
          refreshTypeToggle();
          updateCategoryLabel();
        })
      );
      if (charge) {
        typeToggle.style.opacity = "0.5";
        typeToggle.style.pointerEvents = "none";
      }

      const categoryLabel = body.querySelector("#f-category-label");
      function updateCategoryLabel() {
        const cat = selectedCategoryId ? Categories.get(selectedCategoryId) : null;
        categoryLabel.textContent = cat ? cat.name : "Aucune";
      }
      updateCategoryLabel();
      body.querySelector("#f-category-row").addEventListener("click", () => {
        openPickerSheet({
          title: "Catégorie",
          selectedValue: selectedCategoryId,
          options: [{ value: null, label: "Aucune" }, ...Categories.byType(type).map((c) => ({ value: c.id, label: c.name, icon: c.icon, color: c.colorHex }))],
          onSelect: (value) => { selectedCategoryId = value; updateCategoryLabel(); },
        });
      });

      const accountLabel = body.querySelector("#f-account-label");
      function updateAccountLabel() {
        accountLabel.textContent = Accounts.get(selectedAccountId)?.name || "Aucun compte";
      }
      updateAccountLabel();
      body.querySelector("#f-account-row").addEventListener("click", () => {
        if (accounts.length === 0) return;
        openPickerSheet({
          title: "Compte",
          selectedValue: selectedAccountId,
          options: accounts.map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.colorHex })),
          onSelect: (value) => { selectedAccountId = value; updateAccountLabel(); },
        });
      });
    },
    onSave(sheetApi) {
      sheetApi.clearError();
      const name = document.getElementById("f-name").value.trim();
      if (!name) return sheetApi.showError("Le nom est requis.");
      const amount = parseAmount(document.getElementById("f-amount").value);
      if (amount === null || amount <= 0) return sheetApi.showError("Veuillez saisir un montant valide, supérieur à zéro.");
      const day = parseInt(document.getElementById("f-dueday").value, 10);
      if (!Number.isFinite(day) || day < 1 || day > 31) return sheetApi.showError("Le jour du mois doit être compris entre 1 et 31.");
      const reminder = parseInt(document.getElementById("f-reminder").value, 10);

      const payload = {
        name,
        amount,
        type,
        categoryId: selectedCategoryId,
        accountId: selectedAccountId,
        dueDay: day,
        reminderDays: Number.isFinite(reminder) ? Math.max(0, reminder) : 3,
      };

      if (charge) RecurringExpenses.update(charge.id, payload);
      else RecurringExpenses.create(payload);

      showToast(charge ? "Modifiée" : "Créée");
      sheetApi.close();
    },
  });
}
