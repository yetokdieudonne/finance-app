import { DB, Accounts, Transactions, Categories } from "../db.js";
import { formatAmount, formatCompactAmount, parseAmount } from "../format.js";
import { CURRENCIES } from "../format.js";
import * as Calc from "../calculator.js";
import { icon, ACCOUNT_ICONS, PALETTE, renderIcons } from "../components/icon.js";
import { openSheetCustom, openFormSheet, confirmDialog, openActionSheet, openPickerSheet } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import { escapeHtml, formatPlainAmount } from "../util.js";
import { renderTransactionRow, openTransactionDetail } from "./transactions.js";

export function openAccountsManager() {
  let bodyRef = null;
  const unsubscribe = DB.onChange(() => { if (bodyRef) renderList(bodyRef); });

  openSheetCustom({
    title: "Comptes",
    leading: { label: "Fermer" },
    onClose: unsubscribe,
    build: (body) => { bodyRef = body; renderList(body); },
  });

  function renderList(body) {
    const accounts = Accounts.all();
    const transactions = Transactions.all();
    const categoriesById = new Map(Categories.all().map((c) => [c.id, c]));
    const recent = transactions.slice(0, 10);

    body.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
        <button class="btn btn--secondary" id="acc-add-btn">${icon("plus")}Ajouter un compte</button>
      </div>
      <div class="form-group" id="acc-list"></div>
      <p class="form-section__label mt-16">10 dernières transactions</p>
      <div class="card" id="acc-recent-tx" style="padding:0 16px;"></div>
    `;

    const listEl = body.querySelector("#acc-list");
    if (accounts.length === 0) {
      listEl.className = "";
      listEl.innerHTML = `<div class="empty-state">${icon("wallet")}<h3>Aucun compte</h3><p>Créez un compte (Espèces, Mobile Money, Banque...) pour commencer.</p></div>`;
    } else {
      listEl.innerHTML = accounts
        .map(
          (a) => `
        <div class="form-row" data-account-id="${a.id}" style="cursor:pointer;">
          <span class="form-row__label" style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
            <span class="account-card__icon" style="width:36px;height:36px;background:${a.colorHex}33;color:${a.colorHex};flex-shrink:0;">${icon(a.icon)}</span>
            <span style="min-width:0;overflow:hidden;">
              <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.name}</div>
              <div style="font-size:12px;color:var(--text-secondary);">${CURRENCIES[a.currency]?.name || ""}</div>
            </span>
          </span>
          <span style="font-weight:600;flex-shrink:0;">${formatAmount(Calc.currentBalance(a, transactions), a.currency)}</span>
          <button class="icon-btn" data-more-id="${a.id}" style="flex-shrink:0;">${icon("more-vertical")}</button>
        </div>`
        )
        .join("");

      listEl.querySelectorAll("[data-account-id]").forEach((row) => {
        row.addEventListener("click", (e) => {
          if (e.target.closest("[data-more-id]")) return;
          openAccountDetail(row.dataset.accountId);
        });
      });
      listEl.querySelectorAll("[data-more-id]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.dataset.moreId;
          openActionSheet({
            actions: [
              { label: "Modifier", icon: "pencil", onClick: () => openAddEditAccount({ account: Accounts.get(id) }) },
              { label: "Supprimer", icon: "trash-2", destructive: true, onClick: () => confirmDeleteAccount(id, () => renderList(body)) },
            ],
          });
        });
      });
    }

    body.querySelector("#acc-add-btn").addEventListener("click", () => openAddEditAccount({}));

    const recentEl = body.querySelector("#acc-recent-tx");
    if (recent.length === 0) {
      recentEl.style.padding = "0";
      recentEl.innerHTML = `<div class="empty-state">${icon("inbox")}<h3>Aucune transaction</h3><p>Vos dernières opérations, tous comptes confondus, apparaîtront ici.</p></div>`;
    } else {
      recentEl.innerHTML = recent.map((t, i) => renderTransactionRow(t, categoriesById, accounts, i < recent.length - 1)).join("");
      recentEl.querySelectorAll("[data-tx-id]").forEach((row) => {
        row.addEventListener("click", () => openTransactionDetail(Transactions.get(row.dataset.txId)));
      });
    }

    renderIcons(body);
  }
}

export function openAccountDetail(accountId) {
  const account = Accounts.get(accountId);
  if (!account) return;

  let bodyRef = null;
  const unsubscribe = DB.onChange(() => { if (bodyRef) renderDetail(bodyRef); });

  const sheetApi = openSheetCustom({
    title: account.name,
    leading: { label: "Fermer" },
    trailing: { label: "Modifier", onClick: () => openAddEditAccount({ account: Accounts.get(accountId) }) },
    onClose: unsubscribe,
    build: (body) => { bodyRef = body; renderDetail(body); },
  });

  function renderDetail(body) {
    const acc = Accounts.get(accountId);
    if (!acc) { sheetApi.close(); return; }
    const transactions = Transactions.all().filter((t) => t.accountId === acc.id || t.transferAccountId === acc.id);

    body.innerHTML = `
      <div class="text-center" style="margin-bottom:16px;">
        <p style="font-size:15px;color:var(--text-secondary);margin:0 0 4px;">Solde actuel</p>
        <p class="amount-display">${formatCompactAmount(Calc.currentBalance(acc, Transactions.all()), acc.currency)}</p>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:20px;">
        <button class="btn btn--primary" style="flex:1;" id="acc-add-amount">${icon("plus")}Ajouter</button>
        <button class="btn btn--secondary" style="flex:1;" id="acc-deduct-amount">${icon("minus")}Déduire</button>
      </div>
      <p class="section-title">Transactions</p>
      <div class="card" id="detail-tx-list" style="padding:0 16px;"></div>
    `;
    renderIcons(body);

    body.querySelector("#acc-add-amount").addEventListener("click", () => openAdjustAccountBalance({ account: acc, mode: "add" }));
    body.querySelector("#acc-deduct-amount").addEventListener("click", () => openAdjustAccountBalance({ account: acc, mode: "deduct" }));

    const listEl = body.querySelector("#detail-tx-list");
    if (transactions.length === 0) {
      listEl.style.padding = "0";
      listEl.innerHTML = `<div class="empty-state">${icon("inbox")}<h3>Aucune transaction</h3><p>Ce compte n'a pas encore de transaction.</p></div>`;
      renderIcons(listEl);
    } else {
      const categoriesById = new Map(Categories.all().map((c) => [c.id, c]));
      listEl.innerHTML = transactions.map((t, i) => renderTransactionRow(t, categoriesById, Accounts.all(), i < transactions.length - 1)).join("");
      renderIcons(listEl);
      listEl.querySelectorAll("[data-tx-id]").forEach((row) => {
        row.addEventListener("click", () => openTransactionDetail(Transactions.get(row.dataset.txId)));
      });
    }
  }
}

/** Ajustement rapide du solde d'un compte (bouton Ajouter/Déduire du détail de compte) :
 * crée directement un revenu ou une dépense sur ce compte, sans passer par le formulaire
 * complet de transaction. */
function openAdjustAccountBalance({ account, mode }) {
  const isAdd = mode === "add";
  const type = isAdd ? "income" : "expense";
  let selectedCategoryId = null;

  openFormSheet({
    title: isAdd ? `Ajouter à « ${account.name} »` : `Déduire de « ${account.name} »`,
    saveLabel: isAdd ? "Ajouter" : "Déduire",
    build(body) {
      body.innerHTML = `
        <div class="amount-input-wrap">
          <input id="f-amount" type="text" inputmode="decimal" placeholder="0" />
          <span class="amount-input-wrap__currency">${CURRENCIES[account.currency].symbol}</span>
        </div>
        <div class="form-section">
          <div class="form-group">
            <div class="form-row" id="f-category-row" style="cursor:pointer;">
              <span class="form-row__label">Catégorie (optionnel)</span>
              <span style="display:flex;align-items:center;gap:6px;color:var(--text-secondary);min-width:0;">
                <span id="f-category-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Aucune</span>
                <span class="form-row__chevron">${icon("chevron-down")}</span>
              </span>
            </div>
          </div>
        </div>
        <div class="form-section">
          <div class="form-group"><div class="form-row"><textarea id="f-note" rows="2" placeholder="Note (optionnel)"></textarea></div></div>
        </div>
      `;

      const categoryLabel = body.querySelector("#f-category-label");
      body.querySelector("#f-category-row").addEventListener("click", () => {
        const cats = Categories.byType(type);
        openPickerSheet({
          title: "Catégorie",
          selectedValue: selectedCategoryId,
          options: [{ value: null, label: "Aucune" }, ...cats.map((c) => ({ value: c.id, label: c.name, icon: c.icon, color: c.colorHex }))],
          onSelect: (value) => {
            selectedCategoryId = value;
            categoryLabel.textContent = value ? Categories.get(value)?.name : "Aucune";
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
      const category = selectedCategoryId ? Categories.get(selectedCategoryId) : null;
      const title = note || category?.name || (isAdd ? "Ajout au compte" : "Déduction du compte");

      Transactions.create({
        amount,
        type,
        title,
        note,
        date: new Date().toISOString(),
        categoryId: selectedCategoryId,
        accountId: account.id,
      });

      showToast(isAdd ? "Montant ajouté" : "Montant déduit");
      sheetApi.close();
    },
  });
}

export function openAddEditAccount({ account }) {
  let icon_ = account?.icon || "wallet";
  let color = account?.colorHex || "#0A84FF";
  let currency = account?.currency || "fcfa";

  const api = openFormSheet({
    title: account ? "Modifier le compte" : "Nouveau compte",
    saveLabel: "Enregistrer",
    build(body) {
      body.innerHTML = `
        <div class="form-section">
          <p class="form-section__label">Informations</p>
          <div class="form-group">
            <div class="form-row"><input id="f-name" type="text" placeholder="Nom du compte (ex. Espèces)" value="${account?.name ? escapeHtml(account.name) : ""}" style="text-align:left;" /></div>
            <div class="form-row">
              <span class="form-row__label">Solde initial</span>
              <input id="f-balance" type="text" inputmode="decimal" placeholder="0" value="${account ? formatPlainAmount(account.initialBalance) : ""}" />
            </div>
            <div class="form-row">
              <span class="form-row__label">Devise</span>
              <span style="color:var(--text-secondary);">${CURRENCIES[currency].name} (${CURRENCIES[currency].symbol})</span>
            </div>
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

      const iconsEl = body.querySelector("#f-icons");
      function renderIconGrid() {
        iconsEl.innerHTML = ACCOUNT_ICONS.map(
          (name) => `<button class="icon-swatch ${name === icon_ ? "is-selected" : ""}" style="--sel-color:${color};color:${name === icon_ ? color : "var(--text-secondary)"}" data-icon="${name}">${icon(name)}</button>`
        ).join("");
        iconsEl.querySelectorAll("[data-icon]").forEach((btn) => btn.addEventListener("click", () => { icon_ = btn.dataset.icon; renderIconGrid(); }));
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
      const balanceRaw = document.getElementById("f-balance").value;
      if (!name) return sheetApi.showError("Le nom du compte est requis.");
      const balance = balanceRaw.trim() === "" ? 0 : parseAmount(balanceRaw);
      if (balance === null) return sheetApi.showError("Veuillez saisir un solde initial valide.");

      if (account) {
        Accounts.update(account.id, { name, initialBalance: balance, currency, icon: icon_, colorHex: color });
      } else {
        Accounts.create({ name, initialBalance: balance, currency, icon: icon_, colorHex: color });
      }
      showToast(account ? "Compte modifié" : "Compte créé");
      sheetApi.close();
    },
  });
}

export function confirmDeleteAccount(accountId, onDeleted) {
  const account = Accounts.get(accountId);
  confirmDialog({
    title: "Supprimer ce compte ?",
    message: "Toutes les transactions associées à ce compte seront également supprimées. Cette action est irréversible.",
    onConfirm: () => {
      Accounts.remove(accountId);
      showToast("Compte supprimé");
      if (onDeleted) onDeleted();
    },
  });
}
