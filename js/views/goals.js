import { DB, Goals, Accounts, Transactions, Categories } from "../db.js";
import { formatAmount, formatCompactAmount, parseAmount, mediumDateString, dateInputValue, fromDateInputValue, CURRENCIES } from "../format.js";
import * as Calc from "../calculator.js";
import { icon, renderIcons, PALETTE } from "../components/icon.js";
import { openFormSheet, openSheetCustom, confirmDialog, openActionSheet, openPickerSheet, openPhotoViewer } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import { escapeHtml, compressImageFile } from "../util.js";

const GOAL_ICONS = ["target", "flag", "piggy-bank", "car", "home", "plane", "graduation-cap", "gift", "heart", "sparkles"];

/** Section "Objectifs" du Dashboard : coffres d'épargne avec progression. */
export function renderGoalsSection(container) {
  const goals = Goals.all();
  const currency = Accounts.all()[0]?.currency || "fcfa";

  container.innerHTML = `
    <div>
      <div class="section-header">
        <p class="section-title">Objectifs</p>
        <button class="link-btn" id="goals-manage-link">Gérer</button>
      </div>
      ${goals.length === 0
        ? `<div class="card"><div class="empty-state">${icon("target")}<h3>Aucun objectif</h3><p>Créez un objectif (achat, projet, épargne...) et ajoutez-y de l'argent au fil du temps.</p><button class="btn btn--primary" id="goals-empty-add">Créer un objectif</button></div></div>`
        : `<div class="goals-scroll" id="goals-list"></div>`}
    </div>
  `;

  container.querySelector("#goals-manage-link").addEventListener("click", () => openGoalsManager());
  const emptyAdd = container.querySelector("#goals-empty-add");
  if (emptyAdd) emptyAdd.addEventListener("click", () => openAddEditGoal({}));

  const listEl = container.querySelector("#goals-list");
  if (listEl) {
    listEl.innerHTML = goals.map((g) => goalCard(g, currency)).join("");
    listEl.querySelectorAll("[data-goal-id]").forEach((card) => {
      card.addEventListener("click", () => openGoalDetail(card.dataset.goalId));
    });
  }
  renderIcons(container);
}

function goalCard(goal, currency) {
  const progress = goal.targetAmount > 0 ? Math.min(goal.currentAmount / goal.targetAmount, 1) : 0;
  const reached = goal.currentAmount >= goal.targetAmount;
  return `
  <button class="goal-card" data-goal-id="${goal.id}">
    ${goal.photo
      ? `<img src="${goal.photo}" style="width:100%;height:70px;object-fit:cover;border-radius:10px;" />`
      : `<span class="goal-card__icon" style="background:${goal.colorHex}33;color:${goal.colorHex}">${icon(goal.icon)}</span>`}
    <span class="goal-card__name">${escapeHtml(goal.name)}</span>
    <div class="progress"><div class="progress__bar" style="width:${progress * 100}%;background:${reached ? "var(--green)" : goal.colorHex};"></div></div>
    <span class="goal-card__amounts">
      <span>${formatAmount(goal.currentAmount, currency)}</span>
      <span class="goal-card__percent" style="color:${reached ? "var(--green)" : "var(--text-secondary)"}">${Math.round(progress * 100)}%</span>
    </span>
  </button>`;
}

// ============ Gestion des objectifs ============
export function openGoalsManager() {
  let bodyRef = null;
  const unsubscribe = DB.onChange(() => { if (bodyRef) renderList(bodyRef); });

  openSheetCustom({
    title: "Objectifs",
    leading: { label: "Fermer" },
    onClose: unsubscribe,
    build: (body) => { bodyRef = body; renderList(body); },
  });

  function renderList(body) {
    const goals = Goals.all();
    const currency = Accounts.all()[0]?.currency || "fcfa";

    body.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
        <button class="btn btn--secondary" id="goal-add-btn">${icon("plus")}Créer un objectif</button>
      </div>
      <div id="goal-list" style="display:flex;flex-direction:column;gap:12px;"></div>
    `;

    const listEl = body.querySelector("#goal-list");
    if (goals.length === 0) {
      listEl.innerHTML = `<div class="card"><div class="empty-state">${icon("target")}<h3>Aucun objectif</h3><p>Créez votre premier objectif d'épargne.</p></div></div>`;
    } else {
      listEl.innerHTML = goals
        .map((g) => {
          const progress = g.targetAmount > 0 ? Math.min(g.currentAmount / g.targetAmount, 1) : 0;
          const reached = g.currentAmount >= g.targetAmount;
          return `
        <div class="card budget-card" data-goal-id="${g.id}" style="cursor:pointer;">
          <div class="budget-card__header">
            <span class="budget-card__name">${g.photo ? `<img src="${g.photo}" style="width:22px;height:22px;border-radius:6px;object-fit:cover;flex-shrink:0;" />` : icon(g.icon)}${escapeHtml(g.name)}</span>
            <span style="display:flex;align-items:center;gap:6px;">
              <span class="budget-card__percent" style="color:${reached ? "var(--green)" : g.colorHex}">${Math.round(progress * 100)}%</span>
              <button class="icon-btn" data-more-id="${g.id}">${icon("more-vertical")}</button>
            </span>
          </div>
          <div class="progress"><div class="progress__bar" style="width:${progress * 100}%;background:${reached ? "var(--green)" : g.colorHex};"></div></div>
          <div class="budget-card__amounts">
            <span>${formatAmount(g.currentAmount, currency)}</span>
            <span>Objectif : ${formatAmount(g.targetAmount, currency)}</span>
          </div>
          ${reached ? `<div class="budget-card__warning" style="color:var(--green);">${icon("check-circle")}Objectif atteint !</div>` : ""}
        </div>`;
        })
        .join("");

      listEl.querySelectorAll("[data-goal-id]").forEach((card) => {
        card.addEventListener("click", (e) => {
          if (e.target.closest("[data-more-id]")) return;
          openGoalDetail(card.dataset.goalId);
        });
      });
      listEl.querySelectorAll("[data-more-id]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.dataset.moreId;
          openActionSheet({
            actions: [
              { label: "Ajouter de l'argent", icon: "plus-circle", onClick: () => openContributeForm({ goal: Goals.get(id) }) },
              { label: "Modifier", icon: "pencil", onClick: () => openAddEditGoal({ goal: Goals.get(id) }) },
              { label: "Supprimer", icon: "trash-2", destructive: true, onClick: () => confirmDeleteGoal(id) },
            ],
          });
        });
      });
    }

    body.querySelector("#goal-add-btn").addEventListener("click", () => openAddEditGoal({}));
    renderIcons(body);
  }
}

function confirmDeleteGoal(id) {
  confirmDialog({
    title: "Supprimer cet objectif ?",
    message: "L'historique des versements sera perdu. Cette action est irréversible.",
    onConfirm: () => {
      Goals.remove(id);
      showToast("Objectif supprimé");
    },
  });
}

export function openGoalDetail(goalId) {
  let bodyRef = null;
  const unsubscribe = DB.onChange(() => { if (bodyRef) renderDetail(bodyRef); });

  const sheetApi = openSheetCustom({
    title: Goals.get(goalId)?.name || "Objectif",
    leading: { label: "Fermer" },
    trailing: { label: "Modifier", onClick: () => openAddEditGoal({ goal: Goals.get(goalId) }) },
    onClose: unsubscribe,
    build: (body) => { bodyRef = body; renderDetail(body); },
  });

  function renderDetail(body) {
    const goal = Goals.get(goalId);
    if (!goal) { sheetApi.close(); return; }
    const currency = Accounts.all()[0]?.currency || "fcfa";
    const progress = goal.targetAmount > 0 ? Math.min(goal.currentAmount / goal.targetAmount, 1) : 0;
    const reached = goal.currentAmount >= goal.targetAmount;
    const contributions = [...(goal.contributions || [])].sort((a, b) => new Date(b.date) - new Date(a.date));

    body.innerHTML = `
      ${goal.photo ? `<img id="goal-photo" src="${goal.photo}" style="width:100%;height:180px;object-fit:cover;border-radius:var(--radius-lg);cursor:pointer;margin-bottom:16px;" />` : ""}
      <div class="text-center" style="margin-bottom:16px;">
        ${goal.photo ? "" : `<span class="goal-card__icon" style="width:56px;height:56px;background:${goal.colorHex}33;color:${goal.colorHex};display:inline-flex;">${icon(goal.icon)}</span>`}
        <p class="amount-display" style="margin:14px 0 2px;">${formatCompactAmount(goal.currentAmount, currency)}</p>
        <p style="color:var(--text-secondary);margin:0;">sur ${formatAmount(goal.targetAmount, currency)}${goal.targetDate ? ` · avant le ${mediumDateString(goal.targetDate)}` : ""}</p>
        <div class="progress" style="margin-top:14px;"><div class="progress__bar" style="width:${progress * 100}%;background:${reached ? "var(--green)" : goal.colorHex};"></div></div>
        ${reached ? `<p style="color:var(--green);font-weight:600;margin-top:8px;">${icon("check-circle")} Objectif atteint !</p>` : ""}
        ${goal.description ? `<p style="color:var(--text-secondary);margin-top:10px;font-size:14px;">${escapeHtml(goal.description)}</p>` : ""}
      </div>

      <div style="display:flex;gap:10px;margin-bottom:20px;">
        <button class="btn btn--primary" style="flex:1;" id="goal-add-money">${icon("plus")}Ajouter</button>
        <button class="btn btn--secondary" style="flex:1;" id="goal-withdraw">${icon("minus")}Retirer</button>
      </div>

      <p class="section-title">Historique</p>
      <div class="card" id="goal-history" style="padding:0 16px;"></div>
    `;

    const historyEl = body.querySelector("#goal-history");
    if (contributions.length === 0) {
      historyEl.style.padding = "0";
      historyEl.innerHTML = `<div class="empty-state">${icon("inbox")}<h3>Aucun versement</h3><p>Ajoutez votre premier versement pour cet objectif.</p></div>`;
    } else {
      historyEl.innerHTML = contributions
        .map((c, i) => `
        <div class="tx-row" data-contrib-id="${c.id}" style="${i < contributions.length - 1 ? "border-bottom:1px solid var(--separator);" : ""}">
          <span class="tx-row__icon" style="background:${c.amount >= 0 ? "var(--green)" : "var(--red)"}2e;color:${c.amount >= 0 ? "var(--green)" : "var(--red)"}">${icon(c.amount >= 0 ? "arrow-down-circle" : "arrow-up-circle")}</span>
          <span class="tx-row__body">
            <div class="tx-row__title">${c.amount >= 0 ? "Versement" : "Retrait"}${c.note ? " · " + escapeHtml(c.note) : ""}</div>
            <div class="tx-row__meta">${c.accountId ? escapeHtml(Accounts.get(c.accountId)?.name || "") : "Sans compte"}</div>
          </span>
          <span class="tx-row__amounts">
            <div class="tx-row__amount ${c.amount >= 0 ? "text-green" : "text-red"}">${c.amount >= 0 ? "+" : ""}${formatAmount(c.amount, currency)}</div>
            <div class="tx-row__date">${mediumDateString(c.date)}</div>
          </span>
          <button class="icon-btn" data-more-contrib="${c.id}" style="margin-left:4px;">${icon("more-vertical")}</button>
        </div>`)
        .join("");

      historyEl.querySelectorAll("[data-more-contrib]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const contribId = btn.dataset.moreContrib;
          openActionSheet({
            actions: [
              { label: "Modifier", icon: "pencil", onClick: () => openEditContribution({ goal, contribution: goal.contributions.find((c) => c.id === contribId) }) },
              { label: "Supprimer", icon: "trash-2", destructive: true, onClick: () => confirmDeleteContribution(goal.id, contribId) },
            ],
          });
        });
      });
    }

    body.querySelector("#goal-add-money").addEventListener("click", () => openContributeForm({ goal }));
    body.querySelector("#goal-withdraw").addEventListener("click", () => openContributeForm({ goal, isWithdrawal: true }));
    const photoEl = body.querySelector("#goal-photo");
    if (photoEl) photoEl.addEventListener("click", () => openPhotoViewer(goal.photo));
    renderIcons(body);
  }
}

function confirmDeleteContribution(goalId, contributionId) {
  confirmDialog({
    title: "Supprimer ce versement ?",
    message: "S'il était lié à un compte, la transaction correspondante sera aussi supprimée. Cette action est irréversible.",
    onConfirm: () => {
      Goals.removeContribution(goalId, contributionId);
      showToast("Versement supprimé");
    },
  });
}

function openEditContribution({ goal, contribution }) {
  if (!contribution) return;
  openFormSheet({
    title: contribution.amount >= 0 ? "Modifier le versement" : "Modifier le retrait",
    build(body) {
      body.innerHTML = `
        <div class="amount-input-wrap">
          <input id="f-amount" type="text" inputmode="decimal" placeholder="0" value="${Math.abs(contribution.amount)}" />
          <span class="amount-input-wrap__currency">${CURRENCIES[Accounts.all()[0]?.currency || "fcfa"].symbol}</span>
        </div>
        <div class="form-section">
          <div class="form-group"><div class="form-row"><textarea id="f-note" rows="2" placeholder="Note (optionnel)">${escapeHtml(contribution.note || "")}</textarea></div></div>
        </div>
        <p class="form-section__footer">Le compte associé ne peut pas être changé ici : supprimez et recréez le versement pour cela.</p>
      `;
    },
    onSave(sheetApi) {
      sheetApi.clearError();
      const amount = parseAmount(document.getElementById("f-amount").value);
      if (amount === null || amount <= 0) return sheetApi.showError("Veuillez saisir un montant valide, supérieur à zéro.");
      const note = document.getElementById("f-note").value.trim();
      const signedAmount = contribution.amount >= 0 ? amount : -amount;

      Goals.updateContribution(goal.id, contribution.id, { amount: signedAmount, note });
      if (contribution.transactionId) {
        Transactions.update(contribution.transactionId, { amount, note });
      }

      showToast("Versement modifié");
      sheetApi.close();
    },
  });
}

export function openAddEditGoal({ goal }) {
  let selectedIcon = goal?.icon || GOAL_ICONS[0];
  let color = goal?.colorHex || PALETTE[0];
  let photoDataUrl = goal?.photo || null;

  openFormSheet({
    title: goal ? "Modifier l'objectif" : "Nouvel objectif",
    build(body, sheetApi) {
      body.innerHTML = `
        <div class="form-section">
          <p class="form-section__label">Informations</p>
          <div class="form-group">
            <div class="form-row"><input id="f-name" type="text" placeholder="Nom (ex. Achat moto)" value="${goal ? escapeHtml(goal.name) : ""}" style="text-align:left;" /></div>
            <div class="form-row"><span class="form-row__label">Montant cible</span><input id="f-target" type="text" inputmode="decimal" placeholder="0" value="${goal ? String(goal.targetAmount) : ""}" /></div>
            <div class="form-row"><span class="form-row__label">Date cible (optionnel)</span><input id="f-date" type="date" value="${goal?.targetDate ? dateInputValue(goal.targetDate) : ""}" /></div>
          </div>
        </div>
        <div class="form-section">
          <p class="form-section__label">Description de l'objectif (optionnel)</p>
          <div class="form-group"><div class="form-row"><textarea id="f-description" rows="2" placeholder="Ajouter une description">${goal ? escapeHtml(goal.description || "") : ""}</textarea></div></div>
        </div>
        <div class="form-section">
          <p class="form-section__label">Icône</p>
          <div class="form-group"><div class="icon-grid" id="f-icons"></div></div>
        </div>
        <div class="form-section">
          <p class="form-section__label">Couleur</p>
          <div class="form-group"><div class="color-grid" id="f-colors"></div></div>
        </div>
        <div class="form-section">
          <p class="form-section__label">Photo (optionnel)</p>
          <div id="f-photo-container"></div>
          <input type="file" id="f-photo-input" accept="image/*" capture="environment" hidden />
        </div>
      `;

      const iconsEl = body.querySelector("#f-icons");
      function renderIconGrid() {
        iconsEl.innerHTML = GOAL_ICONS.map(
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
      const name = document.getElementById("f-name").value.trim();
      if (!name) return sheetApi.showError("Le nom de l'objectif est requis.");
      const target = parseAmount(document.getElementById("f-target").value);
      if (target === null || target <= 0) return sheetApi.showError("Veuillez saisir un montant cible valide, supérieur à zéro.");
      const dateRaw = document.getElementById("f-date").value;
      const targetDate = dateRaw ? fromDateInputValue(dateRaw).toISOString() : null;
      const description = document.getElementById("f-description").value.trim();

      const payload = { name, targetAmount: target, icon: selectedIcon, colorHex: color, targetDate, description, photo: photoDataUrl };
      try {
        if (goal) Goals.update(goal.id, payload);
        else Goals.create(payload);
      } catch (e) {
        return sheetApi.showError("Espace de stockage insuffisant pour enregistrer la photo. Essayez sans photo, ou libérez de l'espace (Paramètres → Exporter puis Supprimer d'anciennes transactions).");
      }

      showToast(goal ? "Objectif modifié" : "Objectif créé");
      sheetApi.close();
    },
  });
}

// ============ Contribution (ajout / retrait) ============
export function openContributeForm({ goal, isWithdrawal = false }) {
  const accounts = Accounts.all();
  let selectedAccountId = null;

  openFormSheet({
    title: isWithdrawal ? `Retirer de « ${goal.name} »` : `Ajouter à « ${goal.name} »`,
    saveLabel: isWithdrawal ? "Retirer" : "Ajouter",
    build(body) {
      body.innerHTML = `
        <div class="amount-input-wrap">
          <input id="f-amount" type="text" inputmode="decimal" placeholder="0" />
          <span class="amount-input-wrap__currency">${CURRENCIES[accounts[0]?.currency || "fcfa"].symbol}</span>
        </div>
        <div class="form-section">
          <div class="form-group">
            <div class="form-row" id="f-account-row" style="cursor:pointer;">
              <span class="form-row__label">${isWithdrawal ? "Créditer le compte" : "Depuis le compte"} (optionnel)</span>
              <span style="display:flex;align-items:center;gap:6px;color:var(--text-secondary);min-width:0;">
                <span id="f-account-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Aucun</span>
                <span class="form-row__chevron">${icon("chevron-down")}</span>
              </span>
            </div>
          </div>
          <p class="form-section__footer">${isWithdrawal ? "Si vous sélectionnez un compte, le montant lui sera recrédité." : "Si vous sélectionnez un compte, le montant en sera déduit (comme un virement vers ce coffre)."}</p>
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
      if (isWithdrawal && amount > goal.currentAmount) return sheetApi.showError("Le montant retiré ne peut pas dépasser le solde de l'objectif.");
      const note = document.getElementById("f-note").value.trim();

      let transactionId = null;
      if (selectedAccountId) {
        const savingsCategory = ensureSavingsCategory(isWithdrawal ? "income" : "expense");
        const transaction = Transactions.create({
          amount,
          type: isWithdrawal ? "income" : "expense",
          title: isWithdrawal ? `Retrait : ${goal.name}` : `Épargne : ${goal.name}`,
          note,
          date: new Date().toISOString(),
          categoryId: savingsCategory.id,
          accountId: selectedAccountId,
        });
        transactionId = transaction.id;
      }

      if (isWithdrawal) Goals.withdraw(goal.id, { amount, accountId: selectedAccountId, note, transactionId });
      else Goals.addContribution(goal.id, { amount, accountId: selectedAccountId, note, transactionId });

      showToast(isWithdrawal ? "Retrait effectué" : "Versement ajouté");
      sheetApi.close();
    },
  });
}

function ensureSavingsCategory(type) {
  const name = type === "income" ? "Retrait d'objectif" : "Épargne & Objectifs";
  const existing = Categories.all().find((c) => c.name === name && c.type === type);
  if (existing) return existing;
  return Categories.create({ name, icon: "piggy-bank", type, colorHex: "#30B0C7", isDefault: true });
}
