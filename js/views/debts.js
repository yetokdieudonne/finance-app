import { DB, Debts, Accounts, Categories, Transactions } from "../db.js";
import { formatAmount, formatCompactAmount, parseAmount, mediumDateString, timeString, dateInputValue, fromDateInputValue, CURRENCIES } from "../format.js";
import * as Calc from "../calculator.js";
import { icon, renderIcons } from "../components/icon.js";
import { openFormSheet, openSheetCustom, confirmDialog, openActionSheet, openPickerSheet, openPhotoViewer } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import { escapeHtml, compressImageFile } from "../util.js";
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

export function openDebtsManager() {
  let bodyRef = null;
  let activeTab = "owedToMe";
  let searchText = "";
  const unsubscribe = DB.onChange(() => { if (bodyRef) renderList(bodyRef); });

  openSheetCustom({
    title: "Dettes",
    leading: { label: "Fermer" },
    onClose: unsubscribe,
    build: (body) => { bodyRef = body; renderList(body); },
  });

  function renderList(body) {
    // Une dette réglée (solde à zéro) quitte la liste principale — elle reste consultable
    // depuis "Historique" plutôt que d'encombrer la liste des dettes en cours.
    const owedToMe = Debts.byType("owedToMe").filter((d) => d.remainingAmount > 0);
    const iOwe = Debts.byType("iOwe").filter((d) => d.remainingAmount > 0);
    const currency = Accounts.all()[0]?.currency || "fcfa";

    const prevSearchInput = body.querySelector("#debt-search");
    const hadFocus = document.activeElement === prevSearchInput;
    const cursorPos = hadFocus ? prevSearchInput.selectionStart : null;

    const q = searchText.trim().toLowerCase();
    const visible = (activeTab === "owedToMe" ? owedToMe : iOwe).filter(
      (d) => !q || d.personName.toLowerCase().includes(q)
    );

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

      <div style="display:flex;gap:10px;margin-bottom:12px;">
        <button class="btn btn--success" style="flex:1;" id="debt-add-owedtome">${icon("plus")}On me doit</button>
        <button class="btn btn--danger" style="flex:1;" id="debt-add-iowe">${icon("minus")}Je dois</button>
      </div>

      <div class="chip-row" id="debt-tabs" style="margin-bottom:10px;">
        <button class="chip ${activeTab === "owedToMe" ? "is-active" : ""}" data-tab="owedToMe">Ce qu'on me doit (${owedToMe.length})</button>
        <button class="chip ${activeTab === "iOwe" ? "is-active" : ""}" data-tab="iOwe">Ce que je dois (${iOwe.length})</button>
      </div>

      <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
        <button class="link-btn" id="debt-history-link">Historique</button>
      </div>

      <div class="search-bar" style="margin:0 0 14px;">
        <i data-lucide="search"></i>
        <input id="debt-search" type="search" placeholder="Rechercher une personne" value="${escapeHtml(searchText)}" />
      </div>

      <div class="form-group" id="debt-list">${renderGroup(visible, currency)}</div>
    `;

    body.querySelectorAll("#debt-tabs [data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTab = btn.dataset.tab;
        renderList(body);
      });
    });

    body.querySelector("#debt-history-link").addEventListener("click", () => openDebtHistory(activeTab));

    const searchInput = body.querySelector("#debt-search");
    searchInput.addEventListener("input", () => {
      searchText = searchInput.value;
      renderList(body);
    });
    if (hadFocus) {
      searchInput.focus();
      searchInput.setSelectionRange(cursorPos, cursorPos);
    }

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

    body.querySelector("#debt-add-owedtome").addEventListener("click", () => openAddEditDebt({ defaultType: "owedToMe" }));
    body.querySelector("#debt-add-iowe").addEventListener("click", () => openAddEditDebt({ defaultType: "iOwe" }));
    renderIcons(body);
  }
}

// ============ Historique des dettes réglées ============
function openDebtHistory(type) {
  let bodyRef = null;
  const unsubscribe = DB.onChange(() => { if (bodyRef) renderHistory(bodyRef); });

  openSheetCustom({
    title: type === "owedToMe" ? "Historique — Ce qu'on me doit" : "Historique — Ce que je dois",
    leading: { label: "Fermer" },
    onClose: unsubscribe,
    build: (body) => { bodyRef = body; renderHistory(body); },
  });

  function renderHistory(body) {
    const settled = Debts.byType(type).filter((d) => d.remainingAmount <= 0);
    const currency = Accounts.all()[0]?.currency || "fcfa";

    body.innerHTML = `
      <p style="color:var(--text-secondary);margin:0 0 20px;">Dettes entièrement réglées.</p>
      <div class="form-group">${renderGroup(settled, currency)}</div>
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
            { label: "Modifier", icon: "pencil", onClick: () => openAddEditDebt({ debt: Debts.get(id) }) },
            { label: "Supprimer", icon: "trash-2", destructive: true, onClick: () => confirmDeleteDebt(id) },
          ],
        });
      });
    });

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
    const movements = [
      ...(debt.repayments || []).map((r) => ({ ...r, kind: "repayment" })),
      ...(debt.charges || []).map((c) => ({ ...c, kind: "charge" })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    body.innerHTML = `
      <div class="text-center" style="margin-bottom:16px;">
        <p style="color:var(--text-secondary);margin:0 0 4px;">${escapeHtml(personTitle(debt))}</p>
        <p class="amount-display">${formatCompactAmount(Math.max(debt.remainingAmount, 0), currency)}</p>
        <p style="color:var(--text-secondary);margin:4px 0 0;">sur ${formatAmount(debt.amount, currency)}${debt.dueDate ? ` · échéance le ${mediumDateString(debt.dueDate)}` : ""}</p>
        <span class="status-pill status-pill--${status === "overdue" ? "overdue" : status === "settled" ? "paid" : "ok"}" style="display:inline-block;margin-top:10px;">${STATUS_LABEL[status]}</span>
        ${debt.reason ? `<p style="color:var(--text-secondary);margin-top:10px;font-size:14px;">${escapeHtml(debt.reason)}</p>` : ""}
        <p style="color:var(--text-tertiary);margin-top:8px;font-size:12.5px;">Créée le ${mediumDateString(debt.createdAt)} à ${timeString(debt.createdAt)}</p>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:20px;">
        <button class="btn btn--secondary btn--compact" style="flex:1;" id="debt-add-charge">${icon("trending-up")}Nouvelle dette</button>
        ${status !== "settled" ? `
        <button class="btn btn--primary btn--compact" style="flex:1;" id="debt-add-repayment">${icon("plus")}Remboursement</button>
        <button class="btn btn--secondary btn--compact" style="flex:1;" id="debt-mark-settled">${icon("check-circle")}Réglée</button>` : ""}
      </div>

      <p class="section-title">Historique</p>
      <div class="card" id="debt-history" style="padding:0 16px;"></div>
    `;

    const historyEl = body.querySelector("#debt-history");
    if (movements.length === 0) {
      historyEl.style.padding = "0";
      historyEl.innerHTML = `<div class="empty-state">${icon("inbox")}<h3>Aucun mouvement</h3><p>Enregistrez un remboursement ou un nouveau montant dû dès qu'il y en a un.</p></div>`;
    } else {
      historyEl.innerHTML = movements
        .map((m, i) => {
          const isCharge = m.kind === "charge";
          return `
        <div class="tx-row" data-movement-id="${m.id}" data-movement-kind="${m.kind}" style="${i < movements.length - 1 ? "border-bottom:1px solid var(--separator);" : ""}">
          <span class="tx-row__icon" style="background:${isCharge ? "var(--orange)" : "var(--accent)"}2e;color:${isCharge ? "var(--orange)" : "var(--accent)"};">${icon(isCharge ? "trending-up" : "arrow-left-right")}</span>
          <span class="tx-row__body">
            <div class="tx-row__title">${isCharge ? "Nouvelle dette" : "Remboursement"}${m.note ? " · " + escapeHtml(m.note) : ""}${!isCharge && m.photo ? ` <span style="display:inline-flex;vertical-align:-3px;color:var(--text-tertiary);">${icon("camera", { class: "tx-row__photo-icon" })}</span>` : ""}</div>
            <div class="tx-row__meta">${m.accountId ? escapeHtml(Accounts.get(m.accountId)?.name || "") : "Sans compte"}</div>
          </span>
          <span class="tx-row__amounts">
            <div class="tx-row__amount" style="color:${isCharge ? "var(--orange)" : "var(--accent)"};">${formatAmount(m.amount, currency)}</div>
            <div class="tx-row__date">${mediumDateString(m.date)} · ${timeString(m.date)}</div>
          </span>
          <button class="icon-btn" data-more-movement="${m.id}" style="margin-left:4px;">${icon("more-vertical")}</button>
        </div>`;
        })
        .join("");

      historyEl.querySelectorAll("[data-movement-id]").forEach((row) => {
        const movementId = row.dataset.movementId;
        const repayment = row.dataset.movementKind === "repayment" ? debt.repayments.find((r) => r.id === movementId) : null;
        if (repayment?.photo) {
          row.style.cursor = "pointer";
          row.addEventListener("click", (e) => {
            if (e.target.closest("[data-more-movement]")) return;
            openPhotoViewer(repayment.photo);
          });
        }
      });

      historyEl.querySelectorAll("[data-more-movement]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const row = btn.closest("[data-movement-id]");
          const movementId = row.dataset.movementId;
          const kind = row.dataset.movementKind;
          if (kind === "repayment") {
            openActionSheet({
              actions: [
                { label: "Modifier", icon: "pencil", onClick: () => openEditRepayment({ debt, repayment: debt.repayments.find((r) => r.id === movementId) }) },
                { label: "Supprimer", icon: "trash-2", destructive: true, onClick: () => confirmDeleteRepayment(debt.id, movementId) },
              ],
            });
          } else {
            openActionSheet({
              actions: [
                { label: "Supprimer", icon: "trash-2", destructive: true, onClick: () => confirmDeleteCharge(debt.id, movementId) },
              ],
            });
          }
        });
      });
    }

    const addChargeBtn = body.querySelector("#debt-add-charge");
    if (addChargeBtn) addChargeBtn.addEventListener("click", () => openChargeForm({ debt }));
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
  let photoDataUrl = repayment.photo || null;

  openFormSheet({
    title: "Modifier le remboursement",
    build(body, sheetApi) {
      body.innerHTML = `
        <div class="amount-input-wrap">
          <input id="f-amount" type="text" inputmode="decimal" placeholder="0" value="${repayment.amount}" />
          <span class="amount-input-wrap__currency">${CURRENCIES[Accounts.all()[0]?.currency || "fcfa"].symbol}</span>
        </div>
        <div class="form-section">
          <div class="form-group"><div class="form-row"><textarea id="f-note" rows="2" placeholder="Note (optionnel)">${escapeHtml(repayment.note || "")}</textarea></div></div>
        </div>
        <div class="form-section">
          <p class="form-section__label">Preuve de remboursement (optionnel)</p>
          <div id="f-photo-container"></div>
          <input type="file" id="f-photo-input" accept="image/*" capture="environment" hidden />
        </div>
        <p class="form-section__footer">Le compte associé ne peut pas être changé ici : supprimez et recréez le remboursement pour cela.</p>
      `;

      const photoContainer = body.querySelector("#f-photo-container");
      const photoInput = body.querySelector("#f-photo-input");
      function renderPhotoSection() {
        if (photoDataUrl) {
          photoContainer.innerHTML = `
            <div class="form-group" style="padding:10px 14px;display:flex;align-items:center;gap:12px;">
              <img id="f-photo-thumb" src="${photoDataUrl}" style="width:52px;height:52px;border-radius:10px;object-fit:cover;cursor:pointer;flex-shrink:0;" />
              <span style="flex:1;color:var(--text-secondary);font-size:14px;">Photo attachée</span>
              <button class="icon-btn" id="f-photo-remove">${icon("trash-2")}</button>
            </div>
          `;
          photoContainer.querySelector("#f-photo-thumb").addEventListener("click", () => openPhotoViewer(photoDataUrl));
          photoContainer.querySelector("#f-photo-remove").addEventListener("click", () => {
            photoDataUrl = null;
            renderPhotoSection();
          });
        } else {
          photoContainer.innerHTML = `
            <div class="form-group">
              <div class="form-row" id="f-photo-add-row" style="cursor:pointer;">
                <span class="form-row__label" style="display:flex;align-items:center;gap:8px;color:var(--accent);">${icon("camera")}Ajouter une photo</span>
              </div>
            </div>
          `;
          photoContainer.querySelector("#f-photo-add-row").addEventListener("click", () => photoInput.click());
        }
        renderIcons(photoContainer);
      }
      renderPhotoSection();

      photoInput.addEventListener("change", async () => {
        const file = photoInput.files[0];
        photoInput.value = "";
        if (!file) return;
        try {
          photoDataUrl = await compressImageFile(file);
          renderPhotoSection();
        } catch {
          sheetApi.showError("Impossible de traiter cette image.");
        }
      });
    },
    onSave(sheetApi) {
      sheetApi.clearError();
      const amount = parseAmount(document.getElementById("f-amount").value);
      if (amount === null || amount <= 0) return sheetApi.showError("Veuillez saisir un montant valide, supérieur à zéro.");
      const note = document.getElementById("f-note").value.trim();

      try {
        Debts.updateRepayment(debt.id, repayment.id, { amount, note, photo: photoDataUrl });
      } catch (e) {
        return sheetApi.showError("Espace de stockage insuffisant pour enregistrer la photo. Essayez sans photo, ou libérez de l'espace (Paramètres → Exporter puis Supprimer d'anciennes transactions).");
      }
      if (repayment.transactionId) Transactions.update(repayment.transactionId, { amount, note });

      showToast("Remboursement modifié");
      sheetApi.close();
    },
  });
}

function confirmDeleteCharge(debtId, chargeId) {
  confirmDialog({
    title: "Supprimer ce montant ?",
    message: "S'il était lié à un compte, la transaction correspondante sera aussi supprimée. Cette action est irréversible.",
    onConfirm: () => {
      Debts.removeCharge(debtId, chargeId);
      showToast("Montant supprimé");
    },
  });
}

// ============ Nouvelle dette sur une dette existante ============
// Pour la même personne qui doit à nouveau (ou à qui on doit encore), plutôt que de créer une
// dette séparée : augmente le montant total et le solde restant de la dette existante.
function openChargeForm({ debt }) {
  const accounts = Accounts.all();
  let selectedAccountId = null;

  openFormSheet({
    title: `Nouvelle dette — ${debt.personName}`,
    saveLabel: "Ajouter",
    build(body) {
      body.innerHTML = `
        <div class="amount-input-wrap">
          <input id="f-amount" type="text" inputmode="decimal" placeholder="0" />
          <span class="amount-input-wrap__currency">${CURRENCIES[accounts[0]?.currency || "fcfa"].symbol}</span>
        </div>
        <div class="form-section">
          <div class="form-group">
            <div class="form-row"><span class="form-row__label">Date</span><input id="f-date" type="date" value="${dateInputValue(new Date())}" /></div>
            <div class="form-row" id="f-account-row" style="cursor:pointer;">
              <span class="form-row__label">${debt.type === "owedToMe" ? "Déduire du compte" : "Créditer le compte"} (optionnel)</span>
              <span style="display:flex;align-items:center;gap:6px;color:var(--text-secondary);min-width:0;">
                <span id="f-account-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Aucun</span>
                <span class="form-row__chevron">${icon("chevron-down")}</span>
              </span>
            </div>
          </div>
          <p class="form-section__footer">${debt.type === "owedToMe" ? "Si vous sélectionnez un compte, le montant en sera déduit (vous prêtez à nouveau)." : "Si vous sélectionnez un compte, le montant lui sera crédité (on vous prête à nouveau)."}</p>
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
      const date = fromDateInputValue(document.getElementById("f-date").value).toISOString();
      if (selectedAccountId && debt.type === "owedToMe") {
        const account = Accounts.get(selectedAccountId);
        const balance = Calc.currentBalance(account, Transactions.all());
        if (balance - amount < 0) return sheetApi.showError(`Solde insuffisant sur « ${account.name} » (disponible : ${formatAmount(balance, account.currency)}).`);
      }
      const note = document.getElementById("f-note").value.trim();

      let transactionId = null;
      if (selectedAccountId) {
        const isExpense = debt.type === "owedToMe"; // je prête à nouveau => argent sortant
        const category = ensureDebtCategory(isExpense ? "expense" : "income");
        const transaction = Transactions.create({
          amount,
          type: isExpense ? "expense" : "income",
          title: isExpense ? `Prêt à ${debt.personName}` : `Emprunt de ${debt.personName}`,
          note,
          date,
          categoryId: category.id,
          accountId: selectedAccountId,
        });
        transactionId = transaction.id;
      }

      Debts.addCharge(debt.id, { amount, date, accountId: selectedAccountId, note, transactionId });
      showToast("Nouvelle dette ajoutée");
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
    title: debt ? "Modifier la dette" : type === "owedToMe" ? "On me doit" : "Je dois",
    build(body) {
      body.innerHTML = `
        ${debt ? `
        <div class="type-toggle" id="f-type" style="margin-bottom:16px;">
          <button data-value="owedToMe">On me doit</button>
          <button data-value="iOwe">Je dois</button>
        </div>` : ""}

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
        if (typeToggle) typeToggle.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.value === type));
        const hint = body.querySelector("#f-account-hint");
        if (hint) {
          hint.textContent = type === "owedToMe"
            ? "Si vous sélectionnez un compte, on considère que vous prêtez cet argent maintenant : le montant en sera déduit."
            : "Si vous sélectionnez un compte, on considère que vous empruntez cet argent maintenant : le montant lui sera crédité.";
        }
      }
      refreshTypeToggle();
      if (debt && typeToggle) {
        typeToggle.style.opacity = "0.5";
        typeToggle.style.pointerEvents = "none";
      } else if (typeToggle) {
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

      if (selectedAccountId && type === "owedToMe") {
        const account = Accounts.get(selectedAccountId);
        const balance = Calc.currentBalance(account, Transactions.all());
        if (balance - amount < 0) return sheetApi.showError(`Solde insuffisant sur « ${account.name} » (disponible : ${formatAmount(balance, account.currency)}).`);
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
  let photoDataUrl = null;

  openFormSheet({
    title: `Remboursement — ${debt.personName}`,
    saveLabel: "Enregistrer",
    build(body, sheetApi) {
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
        <div class="form-section">
          <p class="form-section__label">Preuve de remboursement (optionnel)</p>
          <div id="f-photo-container"></div>
          <input type="file" id="f-photo-input" accept="image/*" capture="environment" hidden />
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

      const photoContainer = body.querySelector("#f-photo-container");
      const photoInput = body.querySelector("#f-photo-input");
      function renderPhotoSection() {
        if (photoDataUrl) {
          photoContainer.innerHTML = `
            <div class="form-group" style="padding:10px 14px;display:flex;align-items:center;gap:12px;">
              <img id="f-photo-thumb" src="${photoDataUrl}" style="width:52px;height:52px;border-radius:10px;object-fit:cover;cursor:pointer;flex-shrink:0;" />
              <span style="flex:1;color:var(--text-secondary);font-size:14px;">Photo attachée</span>
              <button class="icon-btn" id="f-photo-remove">${icon("trash-2")}</button>
            </div>
          `;
          photoContainer.querySelector("#f-photo-thumb").addEventListener("click", () => openPhotoViewer(photoDataUrl));
          photoContainer.querySelector("#f-photo-remove").addEventListener("click", () => {
            photoDataUrl = null;
            renderPhotoSection();
          });
        } else {
          photoContainer.innerHTML = `
            <div class="form-group">
              <div class="form-row" id="f-photo-add-row" style="cursor:pointer;">
                <span class="form-row__label" style="display:flex;align-items:center;gap:8px;color:var(--accent);">${icon("camera")}Ajouter une photo</span>
              </div>
            </div>
          `;
          photoContainer.querySelector("#f-photo-add-row").addEventListener("click", () => photoInput.click());
        }
        renderIcons(photoContainer);
      }
      renderPhotoSection();

      photoInput.addEventListener("change", async () => {
        const file = photoInput.files[0];
        photoInput.value = "";
        if (!file) return;
        try {
          photoDataUrl = await compressImageFile(file);
          renderPhotoSection();
        } catch {
          sheetApi.showError("Impossible de traiter cette image.");
        }
      });

      setTimeout(() => body.querySelector("#f-amount")?.focus(), 250);
    },
    onSave(sheetApi) {
      sheetApi.clearError();
      const amount = parseAmount(document.getElementById("f-amount").value);
      if (amount === null || amount <= 0) return sheetApi.showError("Veuillez saisir un montant valide, supérieur à zéro.");
      if (selectedAccountId && debt.type === "iOwe") {
        const account = Accounts.get(selectedAccountId);
        const balance = Calc.currentBalance(account, Transactions.all());
        if (balance - amount < 0) return sheetApi.showError(`Solde insuffisant sur « ${account.name} » (disponible : ${formatAmount(balance, account.currency)}).`);
      }
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

      try {
        Debts.addRepayment(debt.id, { amount, accountId: selectedAccountId, note, transactionId, photo: photoDataUrl });
      } catch (e) {
        return sheetApi.showError("Espace de stockage insuffisant pour enregistrer la photo. Essayez sans photo, ou libérez de l'espace (Paramètres → Exporter puis Supprimer d'anciennes transactions).");
      }
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
