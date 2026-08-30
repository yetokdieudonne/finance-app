import { DB, Transactions, Accounts, Categories } from "../db.js";
import { formatAmount, formatSignedAmount, parseAmount, shortDateString, mediumDateString, sectionHeaderString, startOfDay, dateInputValue, fromDateInputValue } from "../format.js";
import { icon, renderIcons } from "../components/icon.js";
import { openFormSheet, openSheetCustom, confirmDialog, openActionSheet, openPickerSheet, openPhotoViewer } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import { escapeHtml, compressImageFile } from "../util.js";
import { UNCATEGORIZED } from "../calculator.js";

export const title = "Transactions";

let searchText = "";
let filter = { accountId: null, categoryId: null, type: null, startDate: null, endDate: null };

const searchInput = document.getElementById("search-input");
searchInput.addEventListener("input", () => {
  searchText = searchInput.value;
  refresh();
});

function refresh() {
  const root = document.getElementById("view-root");
  if (root) {
    render(root);
    renderIcons(root);
  }
}

function isFilterActive() {
  return !!(filter.accountId || filter.categoryId || filter.type || filter.startDate || filter.endDate);
}

function matchesFilter(t) {
  if (filter.accountId && t.accountId !== filter.accountId) return false;
  if (filter.categoryId && t.categoryId !== filter.categoryId) return false;
  if (filter.type && t.type !== filter.type) return false;
  if (filter.startDate && startOfDay(t.date) < startOfDay(filter.startDate)) return false;
  if (filter.endDate && startOfDay(t.date) > startOfDay(filter.endDate)) return false;
  return true;
}

export function getActions() {
  return [{ icon: "sliders-horizontal", active: isFilterActive(), onClick: () => openFilterSheet() }];
}

export function render(container) {
  const all = Transactions.all();
  const categories = Categories.all();
  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const accounts = Accounts.all();

  const filtered = all
    .filter(matchesFilter)
    .filter((t) => {
      if (!searchText.trim()) return true;
      const q = searchText.toLowerCase();
      const catName = (t.categoryId ? categoriesById.get(t.categoryId)?.name : UNCATEGORIZED.name) || UNCATEGORIZED.name;
      return t.title.toLowerCase().includes(q) || catName.toLowerCase().includes(q);
    });

  if (all.length === 0) {
    container.innerHTML = `<div class="view"><div class="card"><div class="empty-state">${icon("list")}<h3>Aucune transaction</h3><p>Vos dépenses et revenus apparaîtront ici.</p></div></div></div>`;
    return;
  }
  if (filtered.length === 0) {
    container.innerHTML = `<div class="view"><div class="card"><div class="empty-state">${icon("search-x")}<h3>Aucun résultat</h3><p>Aucune transaction ne correspond à votre recherche ou vos filtres.</p></div></div></div>`;
    return;
  }

  const groups = new Map();
  for (const t of filtered) {
    const key = startOfDay(t.date).getTime();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const sortedKeys = [...groups.keys()].sort((a, b) => b - a);

  container.innerHTML = `<div class="view">${sortedKeys
    .map((key) => {
      const items = groups.get(key);
      return `
      <div class="day-group">
        <div class="day-group__header">${sectionHeaderString(key)}</div>
        <div class="card" style="padding:0 16px;">
          ${items.map((t, i) => renderTransactionRow(t, categoriesById, accounts, i < items.length - 1, true)).join("")}
        </div>
      </div>`;
    })
    .join("")}</div>`;

  container.querySelectorAll("[data-tx-id]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("[data-more-id]")) return;
      selectTransaction(row.dataset.txId);
    });
  });
  container.querySelectorAll("[data-more-id]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.moreId;
      openActionSheet({
        actions: [
          { label: "Modifier", icon: "pencil", onClick: () => editTransaction(id) },
          { label: "Supprimer", icon: "trash-2", destructive: true, onClick: () => confirmDeleteTransaction(id) },
        ],
      });
    });
  });
}

/** Ouvrir une transaction depuis la liste ne fait que l'afficher : la modification est un
 * geste explicite (bouton "Modifier"), qui exige ensuite un motif. */
function selectTransaction(id) {
  const t = Transactions.get(id);
  if (!t) return;
  openTransactionDetail(t);
}

function editTransaction(id) {
  const t = Transactions.get(id);
  if (!t) return;
  if (t.type === "transfer") openTransferForm({ transaction: t });
  else openAddEditTransaction({ transaction: t });
}

/** Feuille en lecture seule présentant une transaction déjà enregistrée. La modification passe
 * obligatoirement par le bouton "Modifier" (jamais un simple tap sur la ligne), qui ouvre le
 * formulaire d'édition — lequel exige un motif avant d'enregistrer le changement. */
export function openTransactionDetail(transaction) {
  const t = Transactions.get(transaction.id) || transaction;
  const isTransfer = t.type === "transfer";
  const account = Accounts.get(t.accountId);
  const toAccount = isTransfer ? Accounts.get(t.transferAccountId) : null;
  const category = t.categoryId ? Categories.get(t.categoryId) : null;
  const currency = account?.currency || "fcfa";

  let amountText, amountClass, typeLabel;
  if (t.type === "income") { amountText = formatSignedAmount(t.amount, currency); amountClass = "text-green"; typeLabel = "Revenu"; }
  else if (t.type === "expense") { amountText = formatSignedAmount(-t.amount, currency); amountClass = "text-red"; typeLabel = "Dépense"; }
  else { amountText = formatAmount(t.amount, currency); amountClass = "text-accent"; typeLabel = "Virement"; }

  openSheetCustom({
    title: typeLabel,
    leading: { label: "Fermer" },
    trailing: {
      label: "Modifier",
      onClick: () => editTransaction(t.id),
    },
    build(body) {
      body.innerHTML = `
        <div class="amount-input-wrap" style="padding:10px 0 24px;">
          <span class="${amountClass} amount-display">${amountText}</span>
        </div>
        <div class="form-section">
          <p class="form-section__label">Détails</p>
          <div class="form-group">
            <div class="form-row"><span class="form-row__label">Description</span><span style="color:var(--text-secondary);text-align:right;">${escapeHtml(t.title || "")}</span></div>
            ${isTransfer
              ? `<div class="form-row"><span class="form-row__label">Depuis</span><span style="color:var(--text-secondary);">${escapeHtml(account?.name || "")}</span></div>
                 <div class="form-row"><span class="form-row__label">Vers</span><span style="color:var(--text-secondary);">${escapeHtml(toAccount?.name || "")}</span></div>`
              : `<div class="form-row"><span class="form-row__label">Catégorie</span><span style="color:var(--text-secondary);">${escapeHtml(category?.name || UNCATEGORIZED.name)}</span></div>
                 <div class="form-row"><span class="form-row__label">Compte</span><span style="color:var(--text-secondary);">${escapeHtml(account?.name || "")}</span></div>`}
            <div class="form-row"><span class="form-row__label">Date</span><span style="color:var(--text-secondary);">${mediumDateString(t.date)}</span></div>
          </div>
        </div>
        ${t.note ? `
        <div class="form-section">
          <p class="form-section__label">Note</p>
          <div class="form-group"><div class="form-row"><span style="color:var(--text-secondary);white-space:pre-wrap;">${escapeHtml(t.note)}</span></div></div>
        </div>` : ""}
        ${t.photo ? `
        <div class="form-section">
          <p class="form-section__label">Reçu</p>
          <div class="form-group" style="padding:10px 14px;">
            <img id="td-photo" src="${t.photo}" style="width:100%;max-height:220px;object-fit:cover;border-radius:10px;cursor:pointer;" />
          </div>
        </div>` : ""}
        ${t.editHistory && t.editHistory.length ? `
        <div class="form-section">
          <p class="form-section__label">Historique des modifications</p>
          <div class="form-group">
            ${[...t.editHistory].reverse().map((h) => `
              <div class="form-row" style="align-items:flex-start;flex-direction:column;gap:2px;">
                <span style="font-size:13px;color:var(--text-tertiary);">${mediumDateString(h.editedAt)}</span>
                <span style="font-size:15px;">${escapeHtml(h.reason)}</span>
              </div>
            `).join("")}
          </div>
        </div>` : ""}
      `;
      if (t.photo) body.querySelector("#td-photo").addEventListener("click", () => openPhotoViewer(t.photo));
    },
  });
}

function confirmDeleteTransaction(id) {
  confirmDialog({
    title: "Supprimer cette transaction ?",
    message: "Cette action est irréversible.",
    onConfirm: () => {
      Transactions.remove(id);
      showToast("Transaction supprimée");
    },
  });
}

/** Ligne d'affichage d'une transaction, réutilisée dans le Dashboard, le détail de compte et
 * la liste principale. `withActions` ajoute un bouton "..." (modifier/supprimer). */
export function renderTransactionRow(t, categoriesById, accounts, withDivider, withActions = false) {
  const category = t.categoryId ? categoriesById.get(t.categoryId) : null;
  const catName = category?.name || UNCATEGORIZED.name;
  const catIcon = category?.icon || UNCATEGORIZED.icon;
  const catColor = category?.colorHex || UNCATEGORIZED.colorHex;
  const account = accounts.find((a) => a.id === t.accountId);
  const currency = account?.currency || "fcfa";

  let amountText, amountClass;
  if (t.type === "income") { amountText = formatSignedAmount(t.amount, currency); amountClass = "text-green"; }
  else if (t.type === "expense") { amountText = formatSignedAmount(-t.amount, currency); amountClass = "text-red"; }
  else { amountText = formatAmount(t.amount, currency); amountClass = "text-accent"; }

  return `
  <div class="tx-row" data-tx-id="${t.id}" style="cursor:pointer;${withDivider ? "border-bottom:1px solid var(--separator);" : ""}">
    <span class="tx-row__icon" style="background:${catColor}2e;color:${catColor}">${icon(catIcon)}</span>
    <span class="tx-row__body">
      <div class="tx-row__title">${escapeHtml(t.title || catName)}${t.photo ? ` <span style="display:inline-flex;vertical-align:-3px;color:var(--text-tertiary);">${icon("camera", { class: "tx-row__photo-icon" })}</span>` : ""}</div>
      <div class="tx-row__meta">${escapeHtml(catName)}${account ? " · " + escapeHtml(account.name) : ""}</div>
    </span>
    <span class="tx-row__amounts">
      <div class="tx-row__amount ${amountClass}">${amountText}</div>
      <div class="tx-row__date">${shortDateString(t.date)}</div>
    </span>
    ${withActions ? `<button class="icon-btn" data-more-id="${t.id}" style="margin-left:4px;">${icon("more-vertical")}</button>` : ""}
  </div>`;
}

// ============ Filtres ============
export function openFilterSheet() {
  let draft = { ...filter };
  let useDateRange = !!(filter.startDate || filter.endDate);

  openSheetCustom({
    title: "Filtres",
    leading: { label: "Réinitialiser", onClick: () => { filter = { accountId: null, categoryId: null, type: null, startDate: null, endDate: null }; refresh(); } },
    trailing: { label: "Appliquer", onClick: ({ close }) => { filter = { ...draft, startDate: useDateRange ? draft.startDate : null, endDate: useDateRange ? draft.endDate : null }; refresh(); close(); } },
    build(body) {
      const accounts = Accounts.all();
      const categories = Categories.all();
      body.innerHTML = `
        <div class="form-section">
          <p class="form-section__label">Type</p>
          <div class="type-toggle" id="f-type" style="display:grid;grid-template-columns:repeat(4,1fr);">
            <button data-value="">Tous</button>
            <button data-value="expense">Dépenses</button>
            <button data-value="income">Revenus</button>
            <button data-value="transfer">Virements</button>
          </div>
        </div>
        <div class="form-section">
          <p class="form-section__label">Compte</p>
          <div class="form-group">
            <div class="form-row" id="f-account-row" style="cursor:pointer;">
              <span class="form-row__label">Compte</span>
              <span style="display:flex;align-items:center;gap:6px;color:var(--text-secondary);min-width:0;">
                <span id="f-account-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Tous les comptes</span>
                <span class="form-row__chevron">${icon("chevron-down")}</span>
              </span>
            </div>
          </div>
        </div>
        <div class="form-section">
          <p class="form-section__label">Catégorie</p>
          <div class="form-group">
            <div class="form-row" id="f-category-row" style="cursor:pointer;">
              <span class="form-row__label">Catégorie</span>
              <span style="display:flex;align-items:center;gap:6px;color:var(--text-secondary);min-width:0;">
                <span id="f-category-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Toutes les catégories</span>
                <span class="form-row__chevron">${icon("chevron-down")}</span>
              </span>
            </div>
          </div>
        </div>
        <div class="form-section">
          <div class="form-row" style="padding:0 0 8px;">
            <span class="form-row__label">Filtrer par période</span>
            <button class="toggle ${useDateRange ? "is-on" : ""}" id="f-range-toggle"><span class="toggle__knob"></span></button>
          </div>
          <div class="form-group" id="f-range-fields" style="${useDateRange ? "" : "display:none;"}">
            <div class="form-row"><span class="form-row__label">Du</span><input type="date" id="f-start" value="${dateInputValue(draft.startDate || new Date())}" /></div>
            <div class="form-row"><span class="form-row__label">Au</span><input type="date" id="f-end" value="${dateInputValue(draft.endDate || new Date())}" /></div>
          </div>
        </div>
      `;

      const typeToggle = body.querySelector("#f-type");
      function refreshTypeToggle() {
        typeToggle.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", (b.dataset.value || null) === (draft.type || null)));
      }
      refreshTypeToggle();
      typeToggle.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { draft.type = b.dataset.value || null; refreshTypeToggle(); }));

      body.querySelector("#f-account-row").addEventListener("click", () => {
        openPickerSheet({
          title: "Compte",
          selectedValue: draft.accountId,
          options: [{ value: null, label: "Tous les comptes" }, ...accounts.map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.colorHex }))],
          onSelect: (value) => {
            draft.accountId = value;
            body.querySelector("#f-account-label").textContent = value ? Accounts.get(value)?.name : "Tous les comptes";
          },
        });
      });
      body.querySelector("#f-category-row").addEventListener("click", () => {
        openPickerSheet({
          title: "Catégorie",
          selectedValue: draft.categoryId,
          options: [{ value: null, label: "Toutes les catégories" }, ...categories.map((c) => ({ value: c.id, label: c.name, icon: c.icon, color: c.colorHex }))],
          onSelect: (value) => {
            draft.categoryId = value;
            body.querySelector("#f-category-label").textContent = value ? Categories.get(value)?.name : "Toutes les catégories";
          },
        });
      });

      const rangeFields = body.querySelector("#f-range-fields");
      body.querySelector("#f-range-toggle").addEventListener("click", (e) => {
        useDateRange = !useDateRange;
        e.currentTarget.classList.toggle("is-on", useDateRange);
        rangeFields.style.display = useDateRange ? "" : "none";
      });
      body.querySelector("#f-start").addEventListener("change", (e) => (draft.startDate = fromDateInputValue(e.target.value)));
      body.querySelector("#f-end").addEventListener("change", (e) => (draft.endDate = fromDateInputValue(e.target.value)));
    },
  });
}

// ============ Ajout / édition dépense ou revenu ============
export function openAddEditTransaction({ transaction, defaultType = "expense" }) {
  const accounts = Accounts.all();
  if (!transaction && accounts.length === 0) {
    return openSheetCustom({
      title: "Nouvelle transaction",
      leading: { label: "Fermer" },
      build(body, sheetApi) {
        body.innerHTML = `<div class="empty-state">${icon("wallet")}<h3>Aucun compte</h3><p>Créez d'abord un compte avant d'ajouter une transaction.</p><button class="btn btn--primary" id="empty-create-account">Créer un compte</button></div>`;
        body.querySelector("#empty-create-account").addEventListener("click", () => {
          sheetApi.close();
          import("./accounts.js").then(({ openAccountsManager }) => openAccountsManager());
        });
      },
    });
  }

  let type = transaction ? (transaction.type === "transfer" ? "expense" : transaction.type) : defaultType;
  let selectedCategoryId = transaction?.categoryId ?? null;
  let selectedAccountId = transaction?.accountId ?? accounts[0]?.id ?? null;
  let photoDataUrl = transaction?.photo || null;

  openFormSheet({
    title: transaction ? "Modifier" : type === "income" ? "Nouveau revenu" : "Nouvelle dépense",
    build(body, sheetApi) {
      body.innerHTML = `
        <div class="type-toggle" id="f-type" style="margin-bottom:6px;">
          <button data-value="expense">Dépense</button>
          <button data-value="income">Revenu</button>
        </div>

        <div class="amount-input-wrap">
          <input id="f-amount" type="text" inputmode="decimal" placeholder="0" value="${transaction ? String(transaction.amount) : ""}" />
          <span class="amount-input-wrap__currency" id="f-currency-label"></span>
        </div>

        <div class="form-section">
          <p class="form-section__label">Détails</p>
          <div class="form-group">
            <div class="form-row"><input id="f-title" type="text" placeholder="Description (ex. Déjeuner)" value="${transaction ? escapeHtml(transaction.title) : ""}" style="text-align:left;" /></div>
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
            <div class="form-row"><span class="form-row__label">Date</span><input id="f-date" type="date" value="${dateInputValue(transaction?.date || new Date())}" /></div>
          </div>
        </div>

        ${transaction ? `
        <div class="form-section">
          <p class="form-section__label">Motif de la modification</p>
          <div class="form-group"><div class="form-row"><textarea id="f-edit-reason" rows="2" placeholder="Pourquoi modifiez-vous cette opération ?"></textarea></div></div>
        </div>
        ` : ""}

        <div class="form-section">
          <p class="form-section__label">Note (optionnel)</p>
          <div class="form-group"><div class="form-row"><textarea id="f-note" rows="2" placeholder="Ajouter une note">${transaction ? escapeHtml(transaction.note || "") : ""}</textarea></div></div>
        </div>

        <div class="form-section">
          <p class="form-section__label">Reçu (optionnel)</p>
          <div id="f-photo-container"></div>
          <input type="file" id="f-photo-input" accept="image/*" capture="environment" hidden />
        </div>
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

      const typeToggle = body.querySelector("#f-type");
      function refreshTypeUI() {
        typeToggle.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.value === type));
        populateCategorySelect();
      }
      typeToggle.querySelectorAll("button").forEach((b) =>
        b.addEventListener("click", () => {
          type = b.dataset.value;
          selectedCategoryId = null;
          refreshTypeUI();
        })
      );

      const categoryLabel = body.querySelector("#f-category-label");
      function populateCategorySelect() {
        const cat = selectedCategoryId ? Categories.get(selectedCategoryId) : null;
        categoryLabel.textContent = cat ? cat.name : "Aucune";
      }
      body.querySelector("#f-category-row").addEventListener("click", () => {
        const cats = Categories.byType(type);
        openPickerSheet({
          title: "Catégorie",
          selectedValue: selectedCategoryId,
          options: [{ value: null, label: "Aucune" }, ...cats.map((c) => ({ value: c.id, label: c.name, icon: c.icon, color: c.colorHex }))],
          onSelect: (value) => { selectedCategoryId = value; populateCategorySelect(); },
        });
      });

      const accountLabel = body.querySelector("#f-account-label");
      function updateCurrencyLabel() {
        const acc = Accounts.get(selectedAccountId);
        accountLabel.textContent = acc ? acc.name : "";
        body.querySelector("#f-currency-label").textContent = acc ? (acc.currency === "fcfa" ? "FCFA" : acc.currency.toUpperCase()) : "FCFA";
      }
      body.querySelector("#f-account-row").addEventListener("click", () => {
        openPickerSheet({
          title: "Compte",
          selectedValue: selectedAccountId,
          options: accounts.map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.colorHex })),
          onSelect: (value) => { selectedAccountId = value; updateCurrencyLabel(); },
        });
      });

      refreshTypeUI();
      updateCurrencyLabel();

      setTimeout(() => body.querySelector("#f-amount")?.focus(), 250);
    },
    onSave(sheetApi) {
      sheetApi.clearError();
      const amount = parseAmount(document.getElementById("f-amount").value);
      if (amount === null || amount <= 0) return sheetApi.showError("Veuillez saisir un montant valide, supérieur à zéro.");
      const accountId = selectedAccountId;
      if (!accountId) return sheetApi.showError("Veuillez sélectionner un compte.");
      const rawTitle = document.getElementById("f-title").value.trim();
      const category = selectedCategoryId ? Categories.get(selectedCategoryId) : null;
      const resolvedTitle = rawTitle || category?.name || (type === "income" ? "Revenu" : "Dépense");
      const note = document.getElementById("f-note").value.trim();
      const date = fromDateInputValue(document.getElementById("f-date").value).toISOString();

      let editReason = null;
      if (transaction) {
        editReason = document.getElementById("f-edit-reason").value.trim();
        if (!editReason) return sheetApi.showError("Veuillez indiquer le motif de la modification.");
      }

      const accountName = Accounts.get(accountId)?.name || "";
      confirmDialog({
        title: transaction ? "Confirmer la modification ?" : `Confirmer ${type === "income" ? "le revenu" : "la dépense"} ?`,
        message: transaction
          ? `Vous êtes sur le point d'enregistrer cette modification. Motif : « ${editReason} ».`
          : `${resolvedTitle} · ${formatAmount(amount, Accounts.get(accountId)?.currency)} · ${accountName}`,
        confirmLabel: "Enregistrer",
        destructive: false,
        onConfirm: () => {
          const payload = { amount, type, title: resolvedTitle, note, date, categoryId: selectedCategoryId, accountId, photo: photoDataUrl };
          if (transaction) payload.editHistory = [...(transaction.editHistory || []), { reason: editReason, editedAt: new Date().toISOString() }];
          try {
            if (transaction) Transactions.update(transaction.id, payload);
            else Transactions.create(payload);
          } catch (e) {
            return sheetApi.showError("Espace de stockage insuffisant pour enregistrer la photo. Essayez sans photo, ou libérez de l'espace (Paramètres → Exporter puis Supprimer d'anciennes transactions).");
          }

          showToast(transaction ? "Transaction modifiée" : "Transaction ajoutée");
          sheetApi.close();
        },
      });
    },
  });
}

// ============ Virement ============
export function openTransferForm({ transaction } = {}) {
  const accounts = Accounts.all();
  if (accounts.length < 2) {
    return openSheetCustom({
      title: "Virement",
      leading: { label: "Fermer" },
      build(body, sheetApi) {
        body.innerHTML = `<div class="empty-state">${icon("arrow-left-right")}<h3>Deux comptes requis</h3><p>Créez au moins deux comptes pour effectuer un virement.</p><button class="btn btn--primary" id="empty-create-account">Créer un compte</button></div>`;
        body.querySelector("#empty-create-account").addEventListener("click", () => {
          sheetApi.close();
          import("./accounts.js").then(({ openAccountsManager }) => openAccountsManager());
        });
      },
    });
  }

  let fromAccountId = transaction?.accountId ?? accounts[0].id;
  let toAccountId = transaction?.transferAccountId ?? (accounts.find((a) => a.id !== fromAccountId)?.id || accounts[1].id);

  openFormSheet({
    title: transaction ? "Modifier le virement" : "Virement",
    build(body) {
      body.innerHTML = `
        <div class="amount-input-wrap">
          <input id="f-amount" type="text" inputmode="decimal" placeholder="0" value="${transaction ? String(transaction.amount) : ""}" />
          <span class="amount-input-wrap__currency" id="f-currency-label"></span>
        </div>
        <div class="form-section">
          <p class="form-section__label">Comptes</p>
          <div class="form-group">
            <div class="form-row" id="f-from-row" style="cursor:pointer;">
              <span class="form-row__label">Depuis</span>
              <span style="display:flex;align-items:center;gap:6px;color:var(--text-secondary);min-width:0;">
                <span id="f-from-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
                <span class="form-row__chevron">${icon("chevron-down")}</span>
              </span>
            </div>
            <div class="form-row" id="f-to-row" style="cursor:pointer;">
              <span class="form-row__label">Vers</span>
              <span style="display:flex;align-items:center;gap:6px;color:var(--text-secondary);min-width:0;">
                <span id="f-to-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
                <span class="form-row__chevron">${icon("chevron-down")}</span>
              </span>
            </div>
            <div class="form-row"><span class="form-row__label">Date</span><input id="f-date" type="date" value="${dateInputValue(transaction?.date || new Date())}" /></div>
          </div>
        </div>
        ${transaction ? `
        <div class="form-section">
          <p class="form-section__label">Motif de la modification</p>
          <div class="form-group"><div class="form-row"><textarea id="f-edit-reason" rows="2" placeholder="Pourquoi modifiez-vous ce virement ?"></textarea></div></div>
        </div>
        ` : ""}
        <div class="form-section">
          <p class="form-section__label">Note (optionnel)</p>
          <div class="form-group"><div class="form-row"><textarea id="f-note" rows="2" placeholder="Ajouter une note">${transaction ? escapeHtml(transaction.note || "") : ""}</textarea></div></div>
        </div>
      `;
      function populate() {
        body.querySelector("#f-from-label").textContent = Accounts.get(fromAccountId)?.name || "";
        body.querySelector("#f-to-label").textContent = Accounts.get(toAccountId)?.name || "";
        body.querySelector("#f-currency-label").textContent = (Accounts.get(fromAccountId)?.currency || "fcfa") === "fcfa" ? "FCFA" : Accounts.get(fromAccountId).currency.toUpperCase();
      }
      populate();
      body.querySelector("#f-from-row").addEventListener("click", () => {
        openPickerSheet({
          title: "Depuis",
          selectedValue: fromAccountId,
          options: accounts.map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.colorHex })),
          onSelect: (value) => { fromAccountId = value; populate(); },
        });
      });
      body.querySelector("#f-to-row").addEventListener("click", () => {
        openPickerSheet({
          title: "Vers",
          selectedValue: toAccountId,
          options: accounts.map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.colorHex })),
          onSelect: (value) => { toAccountId = value; populate(); },
        });
      });

      setTimeout(() => body.querySelector("#f-amount")?.focus(), 250);
    },
    onSave(sheetApi) {
      sheetApi.clearError();
      const amount = parseAmount(document.getElementById("f-amount").value);
      if (amount === null || amount <= 0) return sheetApi.showError("Veuillez saisir un montant valide, supérieur à zéro.");
      if (fromAccountId === toAccountId) return sheetApi.showError("Sélectionnez deux comptes différents.");
      const date = fromDateInputValue(document.getElementById("f-date").value).toISOString();
      const note = document.getElementById("f-note").value.trim();
      const toName = Accounts.get(toAccountId)?.name || "";
      const fromName = Accounts.get(fromAccountId)?.name || "";

      let editReason = null;
      if (transaction) {
        editReason = document.getElementById("f-edit-reason").value.trim();
        if (!editReason) return sheetApi.showError("Veuillez indiquer le motif de la modification.");
      }

      confirmDialog({
        title: transaction ? "Confirmer la modification ?" : "Confirmer le virement ?",
        message: transaction
          ? `Vous êtes sur le point d'enregistrer cette modification. Motif : « ${editReason} ».`
          : `${formatAmount(amount, Accounts.get(fromAccountId)?.currency)} de ${fromName} vers ${toName}`,
        confirmLabel: "Enregistrer",
        destructive: false,
        onConfirm: () => {
          const payload = { amount, type: "transfer", title: `Virement vers ${toName}`, note, date, categoryId: null, accountId: fromAccountId, transferAccountId: toAccountId };
          if (transaction) payload.editHistory = [...(transaction.editHistory || []), { reason: editReason, editedAt: new Date().toISOString() }];
          if (transaction) Transactions.update(transaction.id, payload);
          else Transactions.create(payload);

          showToast(transaction ? "Virement modifié" : "Virement effectué");
          sheetApi.close();
        },
      });
    },
  });
}
