import { DB, Debts, Accounts, Categories, Transactions } from "../db.js";
import { formatAmount, formatCompactAmount, parseAmount, mediumDateString, dateInputValue, fromDateInputValue, CURRENCIES } from "../format.js";
import * as Calc from "../calculator.js";
import { icon, renderIcons } from "../components/icon.js";
import { openFormSheet, openSheetCustom, confirmDialog, openActionSheet, openPickerSheet } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import { escapeHtml } from "../util.js";
import { Notifications } from "../notifications.js";

const STATUS_LABEL = { settled: "Réglée", overdue: "En retard", open: "En cours" };
const TYPE_LABEL = { owedToMe: "On me doit", iOwe: "Je dois" };

function personTitle(debt) {
  return debt.type === "owedToMe" ? `${debt.personName} vous doit` : `Vous devez à ${debt.personName}`;
}

/**
 * Vérifie les dettes en retard et déclenche une notification une seule fois par dette
 * (`notifiedOverdue`, remis à zéro si l'échéance est modifiée). Sans effet si les
 * notifications ne sont pas activées.
 */
export function checkDebtNotifications() {
  if (!Notifications.isEnabled()) return;
  const currency = Accounts.all()[0]?.currency || "fcfa";

  for (const debt of Debts.all()) {
    const { status } = Calc.debtStatus(debt);
    if (status !== "overdue" || debt.notifiedOverdue) continue;
    const remaining = Math.max(debt.remainingAmount, 0);
    const title = debt.type === "owedToMe" ? `Créance en retard : ${debt.personName}` : `Dette en retard : ${debt.personName}`;
    const body = debt.type === "owedToMe"
      ? `${debt.personName} vous doit toujours ${formatAmount(remaining, currency)}.`
      : `Vous devez toujours ${formatAmount(remaining, currency)} à ${debt.personName}.`;
    Notifications.notify(title, { body, tag: `debt-${debt.id}`, icon: "icons/icon-192.png" });
    Debts.update(debt.id, { notifiedOverdue: true });
  }
}

// ============ Gestion des dettes ============
export function openDebtsManager() {
  let bodyRef = null;
  const unsubscribe = DB.onChange(() => { if (bodyRef) renderList(bodyRef); });

  openSheetCustom({
    title: "Dettes",
    leading: { label: "Fermer" },
    onClose: unsubscribe,
    build: (body) => { bodyRef = body; renderList(body); },
  });

  function renderGroup(items, currency) {
    if (items.length === 0) {
      return `<div class="form-row"><span class="form-row__label" style="color:var(--text-secondary);">Aucune</span></div>`;
    }
    return items
      .map((d) => {
        const { status } = Calc.debtStatus(d);
        return `
      <div class="form-row" data-debt-id="${d.id}" style="cursor:pointer;">
        <span class="form-row__label" style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
          <span class="account-card__icon" style="width:34px;height:34px;background:${d.type === "owedToMe" ? "var(--green)" : "var(--red)"}22;color:${d.type === "owedToMe" ? "var(--green)" : "var(--red)"};flex-shrink:0;">${icon("user-round")}</span>
          <span style="min-width:0;overflow:hidden;">
            <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(d.personName)}</div>
            <div style="font-size:12px;color:var(--text-secondary);">${formatCompactAmount(Math.max(d.remainingAmount, 0), currency)}${d.dueDate ? " · " + mediumDateString(d.dueDate) : ""}</div>
          </span>
        </span>
        <span class="status-pill status-pill--${status === "overdue" ? "overdue" : status === "settled" ? "paid" : "ok"}">${STATUS_LABEL[status]}</span>
        <button class="icon-btn" data-more-id="${d.id}" style="flex-shrink:0;">${icon("more-vertical")}</button>
      </div>`;
      })
      .join("");
  }

  function renderList(body) {
    const owedToMe = Debts.byType("owedToMe");
    const iOwe = Debts.byType("iOwe");
    const currency = Accounts.all()[0]?.currency || "fcfa";

    body.innerHTML = `
      <div class="summary-grid" style="margin-bottom:16px;">
        <div class="card">
          <div class="summary-card__label">${icon("arrow-down-circle")}On vous doit</div>
          <div class="summary-card__value text-green">${formatCompactAmount(Calc.totalOwedToMe(Debts.all()), currency)}</div>
        </div>
        <div class="card">
          <div class="summary-card__label">${icon("arrow-up-circle")}Vous devez</div>
          <div class="summary-card__value text-red">${formatCompactAmount(Calc.totalIOwe(Debts.all()), currency)}</div>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
        <button class="btn btn--secondary" id="debt-add-btn">${icon("plus")}Ajouter une dette</button>
      </div>

      <div class="form-section">
        <p class="form-section__label">On me doit</p>
        <div class="form-group" id="debt-owedtome-list">${renderGroup(owedToMe, currency)}</div>
      </div>
      <div class="form-section">
        <p class="form-section__label">Je dois</p>
        <div class="form-group" id="debt-iowe-list">${renderGroup(iOwe, currency)}</div>
      </div>
    `;

    body.querySelectorAll("[data-debt-id]").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-more-id]")) return;
        openDebtDetail(row.dataset.debtId);
      });
    });
    body.querySelectorAll("[data-more-id]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.moreId;
        openActionSheet({
          actions: [
            { label: "Ajouter un remboursement", icon: "plus-circle", onClick: () => openRepaymentForm({ debt: Debts.get(id) }) },
            { label: "Modifier", icon: "pencil", onClick: () => openAddEditDebt({ debt: Debts.get(id) }) },
            { label: "Supprimer", icon: "trash-2", destructive: true, onClick: () => confirmDeleteDebt(id) },
          ],
        });
      });
    });

    body.querySelector("#debt-add-btn").addEventListener("click", () => openAddEditDebt({}));
    renderIcons(body);
  }
}

function confirmDeleteDebt(id) {
  confirmDialog({
    title: "Supprimer cette dette ?",
    message: "L'historique des remboursements sera perdu. Cette action est irréversible.",
    onConfirm: () => {
      Debts.remove(id);
      showToast("Dette supprimée");
    },
  });
}

// ============ Détail d'une dette ============
export function openDebtDetail(debtId) {
  let bodyRef = null;
  const unsubscribe = DB.onChange(() => { if (bodyRef) renderDetail(bodyRef); });

  const sheetApi = openSheetCustom({
    title: Debts.get(debtId)?.personName || "Dette",
    leading: { label: "Fermer" },
    trailing: { label: "Modifier", onClick: () => openAddEditDebt({ debt: Debts.get(debtId) }) },
    onClose: unsubscribe,
    build: (body) => { bodyRef = body; renderDetail(body); },
  });

  function renderDetail(body) {
    const debt = Debts.get(debtId);
    if (!debt) { sheetApi.close(); return; }
    const currency = Accounts.all()[0]?.currency || "fcfa";
    const { status } = Calc.debtStatus(debt);
    const repayments = [...(debt.repayments || [])].sort((a, b) => new Date(b.date) - new Date(a.date));

    body.innerHTML = `
      <div class="text-center" style="margin-bottom:16px;">
        <p style="color:var(--text-secondary);margin:0 0 4px;">${escapeHtml(personTitle(debt))}</p>
        <p class="amount-display">${formatCompactAmount(Math.max(debt.remainingAmount, 0), currency)}</p>
        <p style="color:var(--text-secondary);margin:4px 0 0;">sur ${formatAmount(debt.amount, currency)}${debt.dueDate ? ` · échéance le ${mediumDateString(debt.dueDate)}` : ""}</p>
        <span class="status-pill status-pill--${status === "overdue" ? "overdue" : status === "settled" ? "paid" : "ok"}" style="display:inline-block;margin-top:10px;">${STATUS_LABEL[status]}</span>
        ${debt.reason ? `<p style="color:var(--text-secondary);margin-top:10px;font-size:14px;">${escapeHtml(debt.reason)}</p>` : ""}
      </div>

      ${status !== "settled" ? `
      <div style="display:flex;gap:10px;margin-bottom:20px;">
        <button class="btn btn--primary" style="flex:1;" id="debt-add-repayment">${icon("plus")}Remboursement</button>
        <button class="btn btn--secondary" style="flex:1;" id="debt-mark-settled">${icon("check-circle")}Marquer réglée</button>
      </div>` : ""}

      <p class="section-title">Historique</p>
      <div class="card" id="debt-history" style="padding:0 16px;"></div>
    `;

    const historyEl = body.querySelector("#debt-history");
    if (repayments.length === 0) {
      historyEl.style.padding = "0";
      historyEl.innerHTML = `<div class="empty-state">${icon("inbox")}<h3>Aucun remboursement</h3><p>Enregistrez un remboursement dès qu'un montant est versé.</p></div>`;
    } else {
      historyEl.innerHTML = repayments
        .map((r, i) => `
        <div class="tx-row" data-repayment-id="${r.id}" style="${i < repayments.length - 1 ? "border-bottom:1px solid var(--separator);" : ""}">
          <span class="tx-row__icon" style="background:var(--accent)2e;color:var(--accent);">${icon("arrow-left-right")}</span>
          <span class="tx-row__body">
            <div class="tx-row__title">Remboursement${r.note ? " · " + escapeHtml(r.note) : ""}</div>
            <div class="tx-row__meta">${r.accountId ? escapeHtml(Accounts.get(r.accountId)?.name || "") : "Sans compte"}</div>
          </span>
          <span class="tx-row__amounts">
            <div class="tx-row__amount text-accent">${formatAmount(r.amount, currency)}</div>
            <div class="tx-row__date">${mediumDateString(r.date)}</div>
          </span>
          <button class="icon-btn" data-more-repayment="${r.id}" style="margin-left:4px;">${icon("more-vertical")}</button>
        </div>`)
        .join("");

      historyEl.querySelectorAll("[data-more-repayment]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const repaymentId = btn.dataset.moreRepayment;
          openActionSheet({
            actions: [
              { label: "Modifier", icon: "pencil", onClick: () => openEditRepayment({ debt, repayment: debt.repayments.find((r) => r.id === repaymentId) }) },
              { label: "Supprimer", icon: "trash-2", destructive: true, onClick: () => confirmDeleteRepayment(debt.id, repaymentId) },
            ],
          });
        });
      });
    }

    const addBtn = body.querySelector("#debt-add-repayment");
    if (addBtn) addBtn.addEventListener("click", () => openRepaymentForm({ debt }));
    const settleBtn = body.querySelector("#debt-mark-settled");
    if (settleBtn) {
      settleBtn.addEventListener("click", () => {
        confirmDialog({
          title: "Marquer cette dette comme réglée ?",
          message: "Le solde restant sera mis à zéro. Utilisez plutôt « Remboursement » si vous voulez enregistrer un montant précis et son compte.",
          confirmLabel: "Marquer réglée",
          destructive: false,
          onConfirm: () => {
            Debts.markSettled(debt.id);
            showToast("Dette marquée comme réglée");
          },
        });
      });
    }

    renderIcons(body);
  }
}

function confirmDeleteRepayment(debtId, repaymentId) {
  confirmDialog({
    title: "Supprimer ce remboursement ?",
    message: "S'il était lié à un compte, la transaction correspondante sera aussi supprimée. Cette action est irréversible.",
    onConfirm: () => {
      Debts.removeRepayment(debtId, repaymentId);
      showToast("Remboursement supprimé");
    },
  });
}

function openEditRepayment({ debt, repayment }) {
  if (!repayment) return;
  openFormSheet({
    title: "Modifier le remboursement",
    build(body) {
      body.innerHTML = `
        <div class="amount-input-wrap">
          <input id="f-amount" type="text" inputmode="decimal" placeholder="0" value="${repayment.amount}" />
          <span class="amount-input-wrap__currency">${CURRENCIES[Accounts.all()[0]?.currency || "fcfa"].symbol}</span>
        </div>
        <div class="form-section">
          <div class="form-group"><div class="form-row"><textarea id="f-note" rows="2" placeholder="Note (optionnel)">${escapeHtml(repayment.note || "")}</textarea></div></div>
        </div>
        <p class="form-section__footer">Le compte associé ne peut pas être changé ici : supprimez et recréez le remboursement pour cela.</p>
      `;
    },
    onSave(sheetApi) {
      sheetApi.clearError();
      const amount = parseAmount(document.getElementById("f-amount").value);
      if (amount === null || amount <= 0) return sheetApi.showError("Veuillez saisir un montant valide, supérieur à zéro.");
      const note = document.getElementById("f-note").value.trim();

      Debts.updateRepayment(debt.id, repayment.id, { amount, note });
      if (repayment.transactionId) Transactions.update(repayment.transactionId, { amount, note });

      showToast("Remboursement modifié");
      sheetApi.close();
    },
  });
}

// ============ Créer / modifier une dette ============
export function openAddEditDebt({ debt, defaultType = "owedToMe" }) {
  const accounts = Accounts.all();
  let type = debt?.type || defaultType;
  let selectedAccountId = null;

  openFormSheet({
    title: debt ? "Modifier la dette" : "Nouvelle dette",
    build(body) {
      body.innerHTML = `
        <div class="type-toggle" id="f-type" style="margin-bottom:16px;">
          <button data-value="owedToMe">On me doit</button>
          <button data-value="iOwe">Je dois</button>
        </div>

        <div class="form-section">
          <p class="form-section__label">Détails</p>
          <div class="form-group">
            <div class="form-row"><input id="f-person" type="text" placeholder="Nom de la personne" value="${debt ? escapeHtml(debt.personName) : ""}" style="text-align:left;" /></div>
            <div class="form-row"><span class="form-row__label">Montant</span><input id="f-amount" type="text" inputmode="decimal" placeholder="0" value="${debt ? String(debt.amount) : ""}" /></div>
            <div class="form-row"><span class="form-row__label">Échéance (optionnel)</span><input id="f-date" type="date" value="${debt?.dueDate ? dateInputValue(debt.dueDate) : ""}" /></div>
            ${!debt ? `
            <div class="form-row" id="f-account-row" style="cursor:pointer;">
              <span class="form-row__label">Compte concerné (optionnel)</span>
              <span style="display:flex;align-items:center;gap:6px;color:var(--text-secondary);min-width:0;">
                <span id="f-account-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Aucun</span>
                <span class="form-row__chevron">${icon("chevron-down")}</span>
              </span>
            </div>` : ""}
          </div>
          ${!debt ? `<p class="form-section__footer" id="f-account-hint"></p>` : ""}
        </div>

        <div class="form-section">
          <p class="form-section__label">Raison (optionnel)</p>
          <div class="form-group"><div class="form-row"><textarea id="f-reason" rows="2" placeholder="Ex. Prêt pour réparation moto">${debt ? escapeHtml(debt.reason || "") : ""}</textarea></div></div>
        </div>
      `;

      const typeToggle = body.querySelector("#f-type");
      function refreshTypeToggle() {
        typeToggle.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.value === type));
        const hint = body.querySelector("#f-account-hint");
        if (hint) {
          hint.textContent = type === "owedToMe"
            ? "Si vous sélectionnez un compte, on considère que vous prêtez cet argent maintenant : le montant en sera déduit."
            : "Si vous sélectionnez un compte, on considère que vous empruntez cet argent maintenant : le montant lui sera crédité.";
        }
      }
      refreshTypeToggle();
      if (debt) {
        typeToggle.style.opacity = "0.5";
        typeToggle.style.pointerEvents = "none";
      } else {
        typeToggle.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { type = b.dataset.value; refreshTypeToggle(); }));
      }

      const accountRow = body.querySelector("#f-account-row");
      if (accountRow) {
        const accountLabel = body.querySelector("#f-account-label");
        accountRow.addEventListener("click", () => {
          openPickerSheet({
            title: "Compte",
            selectedValue: selectedAccountId,
            options: [{ value: null, label: "Aucun" }, ...accounts.map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.colorHex }))],
            onSelect: (value) => {
              selectedAccountId = value;
              accountLabel.textContent = value ? Accounts.get(value)?.name : "Aucun";
            },
          });
        });
      }
    },
    onSave(sheetApi) {
      sheetApi.clearError();
      const personName = document.getElementById("f-person").value.trim();
      if (!personName) return sheetApi.showError("Le nom de la personne est requis.");
      const amount = parseAmount(document.getElementById("f-amount").value);
      if (amount === null || amount <= 0) return sheetApi.showError("Veuillez saisir un montant valide, supérieur à zéro.");
      const dateRaw = document.getElementById("f-date").value;
      const dueDate = dateRaw ? fromDateInputValue(dateRaw).toISOString() : null;
      const reason = document.getElementById("f-reason").value.trim();

      if (debt) {
        // Si l'échéance change, on redonne une chance de notifier (utile si elle était déjà
        // passée : repousser la date doit pouvoir re-déclencher une alerte plus tard).
        const dueDateChanged = dueDate !== (debt.dueDate || null);
        Debts.update(debt.id, { personName, amount, dueDate, reason, ...(dueDateChanged ? { notifiedOverdue: false } : {}) });
        showToast("Dette modifiée");
        sheetApi.close();
        return;
      }

      let transactionId = null;
      if (selectedAccountId) {
        const category = ensureDebtCategory(type === "owedToMe" ? "expense" : "income");
        const transaction = Transactions.create({
          amount,
          type: type === "owedToMe" ? "expense" : "income",
          title: type === "owedToMe" ? `Prêt à ${personName}` : `Emprunt de ${personName}`,
          note: reason,
          date: new Date().toISOString(),
          categoryId: category.id,
          accountId: selectedAccountId,
        });
        transactionId = transaction.id;
      }

      Debts.create({ personName, type, amount, dueDate, reason, initialAccountId: selectedAccountId, initialTransactionId: transactionId });
      showToast("Dette créée");
      sheetApi.close();
    },
  });
}

// ============ Remboursement ============
function openRepaymentForm({ debt }) {
  const accounts = Accounts.all();
  let selectedAccountId = null;

  openFormSheet({
    title: `Remboursement — ${debt.personName}`,
    saveLabel: "Enregistrer",
    build(body) {
      body.innerHTML = `
        <div class="amount-input-wrap">
          <input id="f-amount" type="text" inputmode="decimal" placeholder="0" />
          <span class="amount-input-wrap__currency">${CURRENCIES[accounts[0]?.currency || "fcfa"].symbol}</span>
        </div>
        <p style="text-align:center;color:var(--text-secondary);font-size:14px;margin:-14px 0 22px;">Montant dû : ${formatAmount(Math.max(debt.remainingAmount, 0), accounts[0]?.currency || "fcfa")}</p>
        <div class="form-section">
          <div class="form-group">
            <div class="form-row" id="f-account-row" style="cursor:pointer;">
              <span class="form-row__label">${debt.type === "owedToMe" ? "Créditer le compte" : "Déduire du compte"} (optionnel)</span>
              <span style="display:flex;align-items:center;gap:6px;color:var(--text-secondary);min-width:0;">
                <span id="f-account-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Aucun</span>
                <span class="form-row__chevron">${icon("chevron-down")}</span>
              </span>
            </div>
          </div>
          <p class="form-section__footer">${debt.type === "owedToMe" ? "Si vous sélectionnez un compte, le montant lui sera crédité (la personne vous rembourse)." : "Si vous sélectionnez un compte, le montant en sera déduit (vous remboursez la personne)."}</p>
        </div>
        <div class="form-section">
          <div class="form-group"><div class="form-row"><textarea id="f-note" rows="2" placeholder="Note (optionnel)"></textarea></div></div>
        </div>
      `;

      const accountLabel = body.querySelector("#f-account-label");
      body.querySelector("#f-account-row").addEventListener("click", () => {
        openPickerSheet({
          title: "Compte",
          selectedValue: selectedAccountId,
          options: [{ value: null, label: "Aucun" }, ...accounts.map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.colorHex }))],
          onSelect: (value) => {
            selectedAccountId = value;
            accountLabel.textContent = value ? Accounts.get(value)?.name : "Aucun";
          },
        });
      });

      setTimeout(() => body.querySelector("#f-amount")?.focus(), 250);
    },
    onSave(sheetApi) {
      sheetApi.clearError();
      const amount = parseAmount(document.getElementById("f-amount").value);
      if (amount === null || amount <= 0) return sheetApi.showError("Veuillez saisir un montant valide, supérieur à zéro.");
      const note = document.getElementById("f-note").value.trim();

      let transactionId = null;
      if (selectedAccountId) {
        const isIncome = debt.type === "owedToMe"; // on me rembourse => argent entrant
        const category = ensureDebtCategory(isIncome ? "income" : "expense");
        const transaction = Transactions.create({
          amount,
          type: isIncome ? "income" : "expense",
          title: isIncome ? `Remboursement de ${debt.personName}` : `Remboursement à ${debt.personName}`,
          note,
          date: new Date().toISOString(),
          categoryId: category.id,
          accountId: selectedAccountId,
        });
        transactionId = transaction.id;
      }

      Debts.addRepayment(debt.id, { amount, accountId: selectedAccountId, note, transactionId });
      showToast("Remboursement enregistré");
      sheetApi.close();
    },
  });
}

function ensureDebtCategory(type) {
  const name = "Prêts & Dettes";
  const existing = Categories.all().find((c) => c.name === name && c.type === type);
  if (existing) return existing;
  return Categories.create({ name, icon: "users", type, colorHex: "#5856D6", isDefault: true });
}
