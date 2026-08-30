// "Projets" : plan de dépenses nommé (voyage, événement, achat...) composé de plusieurs postes
// estimés dont le coût total est la somme — voir Projects dans db.js pour le modèle de données.
import { DB, Projects, Accounts } from "../db.js";
import { formatAmount, formatCompactAmount, parseAmount } from "../format.js";
import { icon, renderIcons, PALETTE } from "../components/icon.js";
import { openFormSheet, openSheetCustom, confirmDialog, openActionSheet } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import { escapeHtml } from "../util.js";

const PROJECT_ICONS = ["briefcase", "plane", "home", "heart", "gift", "graduation-cap", "car", "sparkles", "flag", "target"];

export const title = "Projets";

export function getActions() {
  return [{ icon: "plus", onClick: () => openAddEditProject({}) }];
}

// ============ Gestion des projets ============
export function render(container) {
  const projects = Projects.all();
  const currency = Accounts.all()[0]?.currency || "fcfa";

  container.innerHTML = `
    <div class="view">
      <div id="project-list" style="display:flex;flex-direction:column;gap:12px;"></div>
    </div>
  `;

  const listEl = container.querySelector("#project-list");
  if (projects.length === 0) {
    listEl.innerHTML = `<div class="card"><div class="empty-state">${icon("briefcase")}<h3>Aucun projet</h3><p>Planifiez un voyage, un événement ou un achat en listant ses postes de dépense estimés : le coût total se calcule tout seul.</p><button class="btn btn--primary" id="project-empty-add">Créer un projet</button></div></div>`;
    listEl.querySelector("#project-empty-add").addEventListener("click", () => openAddEditProject({}));
  } else {
    listEl.innerHTML = projects
      .map((p) => {
        const total = Projects.totalCost(p);
        const count = (p.items || []).length;
        return `
      <div class="card budget-card" data-project-id="${p.id}" style="cursor:pointer;">
        <div class="budget-card__header">
          <span class="budget-card__name">${icon(p.icon)}${escapeHtml(p.name)}</span>
          <button class="icon-btn" data-more-id="${p.id}">${icon("more-vertical")}</button>
        </div>
        <div class="budget-card__amounts">
          <span>${count} poste${count > 1 ? "s" : ""}</span>
          <span style="font-weight:700;color:var(--text);">${formatCompactAmount(total, currency)}</span>
        </div>
      </div>`;
      })
      .join("");

    listEl.querySelectorAll("[data-project-id]").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("[data-more-id]")) return;
        openProjectDetail(card.dataset.projectId);
      });
    });
    listEl.querySelectorAll("[data-more-id]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.moreId;
        openActionSheet({
          actions: [
            { label: "Modifier", icon: "pencil", onClick: () => openAddEditProject({ project: Projects.get(id) }) },
            { label: "Supprimer", icon: "trash-2", destructive: true, onClick: () => confirmDeleteProject(id) },
          ],
        });
      });
    });
  }

  renderIcons(container);
}

function confirmDeleteProject(id) {
  confirmDialog({
    title: "Supprimer ce projet ?",
    message: "Tous ses postes de dépense seront perdus. Cette action est irréversible.",
    onConfirm: () => {
      Projects.remove(id);
      showToast("Projet supprimé");
    },
  });
}

export function openProjectDetail(projectId) {
  let bodyRef = null;
  const unsubscribe = DB.onChange(() => { if (bodyRef) renderDetail(bodyRef); });

  const sheetApi = openSheetCustom({
    title: Projects.get(projectId)?.name || "Projet",
    leading: { label: "Fermer" },
    trailing: { label: "Modifier", onClick: () => openAddEditProject({ project: Projects.get(projectId) }) },
    onClose: unsubscribe,
    build: (body) => { bodyRef = body; renderDetail(body); },
  });

  function renderDetail(body) {
    const project = Projects.get(projectId);
    if (!project) { sheetApi.close(); return; }
    const currency = Accounts.all()[0]?.currency || "fcfa";
    const total = Projects.totalCost(project);
    const items = [...(project.items || [])];

    body.innerHTML = `
      <div class="text-center" style="margin-bottom:20px;">
        <span class="goal-card__icon" style="width:56px;height:56px;background:${project.colorHex}33;color:${project.colorHex};display:inline-flex;">${icon(project.icon)}</span>
        <p class="amount-display" style="margin:14px 0 2px;">${formatCompactAmount(total, currency)}</p>
        <p style="color:var(--text-secondary);margin:0;">Coût total estimé</p>
      </div>

      <button class="btn btn--primary" style="width:100%;margin-bottom:20px;" id="project-add-item">${icon("plus")}Ajouter un poste</button>

      <p class="section-title">Postes de dépense</p>
      <div class="card" id="project-items" style="padding:0 16px;"></div>
    `;

    const itemsEl = body.querySelector("#project-items");
    if (items.length === 0) {
      itemsEl.style.padding = "0";
      itemsEl.innerHTML = `<div class="empty-state">${icon("inbox")}<h3>Aucun poste</h3><p>Ajoutez un premier poste de dépense (ex. Transport, Hôtel...).</p></div>`;
    } else {
      itemsEl.innerHTML = items
        .map((it, i) => `
        <div class="tx-row" data-item-id="${it.id}" style="${i < items.length - 1 ? "border-bottom:1px solid var(--separator);" : ""}">
          <span class="tx-row__body">
            <div class="tx-row__title">${escapeHtml(it.name)}</div>
          </span>
          <span class="tx-row__amounts">
            <div class="tx-row__amount">${formatAmount(it.amount, currency)}</div>
          </span>
          <button class="icon-btn" data-more-item="${it.id}" style="margin-left:4px;">${icon("more-vertical")}</button>
        </div>`)
        .join("");

      itemsEl.querySelectorAll("[data-more-item]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const itemId = btn.dataset.moreItem;
          openActionSheet({
            actions: [
              { label: "Modifier", icon: "pencil", onClick: () => openAddEditProjectItem({ project, item: project.items.find((i) => i.id === itemId) }) },
              { label: "Supprimer", icon: "trash-2", destructive: true, onClick: () => confirmDeleteItem(project.id, itemId) },
            ],
          });
        });
      });
    }

    body.querySelector("#project-add-item").addEventListener("click", () => openAddEditProjectItem({ project }));
    renderIcons(body);
  }
}

function confirmDeleteItem(projectId, itemId) {
  confirmDialog({
    title: "Supprimer ce poste ?",
    message: "Cette action est irréversible.",
    onConfirm: () => {
      Projects.removeItem(projectId, itemId);
      showToast("Poste supprimé");
    },
  });
}

// ============ Poste de dépense (ajout / modification) ============
export function openAddEditProjectItem({ project, item }) {
  openFormSheet({
    title: item ? "Modifier le poste" : "Nouveau poste",
    build(body) {
      body.innerHTML = `
        <div class="form-section">
          <div class="form-group">
            <div class="form-row"><input id="f-name" type="text" placeholder="Nom (ex. Transport)" value="${item ? escapeHtml(item.name) : ""}" style="text-align:left;" /></div>
            <div class="form-row"><span class="form-row__label">Montant estimé</span><input id="f-amount" type="text" inputmode="decimal" placeholder="0" value="${item ? String(item.amount) : ""}" /></div>
          </div>
        </div>
      `;
      setTimeout(() => body.querySelector("#f-name")?.focus(), 250);
    },
    onSave(sheetApi) {
      sheetApi.clearError();
      const name = document.getElementById("f-name").value.trim();
      if (!name) return sheetApi.showError("Le nom du poste est requis.");
      const amount = parseAmount(document.getElementById("f-amount").value);
      if (amount === null || amount <= 0) return sheetApi.showError("Veuillez saisir un montant valide, supérieur à zéro.");

      if (item) Projects.updateItem(project.id, item.id, { name, amount });
      else Projects.addItem(project.id, { name, amount });

      showToast(item ? "Poste modifié" : "Poste ajouté");
      sheetApi.close();
    },
  });
}

// ============ Projet (création / modification) ============
export function openAddEditProject({ project }) {
  let selectedIcon = project?.icon || PROJECT_ICONS[0];
  let color = project?.colorHex || PALETTE[0];

  openFormSheet({
    title: project ? "Modifier le projet" : "Nouveau projet",
    build(body) {
      body.innerHTML = `
        <div class="form-section">
          <p class="form-section__label">Informations</p>
          <div class="form-group">
            <div class="form-row"><input id="f-name" type="text" placeholder="Nom (ex. Voyage au Togo)" value="${project ? escapeHtml(project.name) : ""}" style="text-align:left;" /></div>
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
        iconsEl.innerHTML = PROJECT_ICONS.map(
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

      setTimeout(() => body.querySelector("#f-name")?.focus(), 250);
    },
    onSave(sheetApi) {
      sheetApi.clearError();
      const name = document.getElementById("f-name").value.trim();
      if (!name) return sheetApi.showError("Le nom du projet est requis.");

      if (project) Projects.update(project.id, { name, icon: selectedIcon, colorHex: color });
      else Projects.create({ name, icon: selectedIcon, colorHex: color });

      showToast(project ? "Projet modifié" : "Projet créé");
      sheetApi.close();
    },
  });
}
