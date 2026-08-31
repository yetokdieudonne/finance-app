// Page "Guide" : explique à quoi sert chaque fonctionnalité et comment s'en servir. Contenu
// statique (pas de données utilisateur), organisé en accordéon par thème, avec recherche.
import { icon, renderIcons } from "../components/icon.js";
import { openSheetCustom } from "../components/modal.js";
import { escapeHtml } from "../util.js";

const SECTIONS = [
  {
    category: "Suivi",
    icon: "credit-card",
    title: "Comptes",
    purpose: "Suivez le solde de chacun de vos comptes (espèces, banque, mobile money...) et leur historique. Un compte ne peut jamais devenir négatif : toute opération qui le ferait passer sous zéro est refusée.",
    steps: [
      "Menu → Comptes → bouton « + » pour créer un compte (nom, icône, couleur, solde de départ).",
      "Ouvrez un compte pour voir son historique complet, ou utilisez les boutons « Ajouter »/« Déduire » pour un mouvement rapide sans passer par le formulaire de transaction.",
    ],
  },
  {
    category: "Suivi",
    icon: "list",
    title: "Transactions",
    purpose: "Toutes vos dépenses et revenus, classés par jour. Chaque transaction peut avoir une photo de reçu comme preuve.",
    steps: [
      "Bouton « + » en bas de l'écran → « Ajouter une dépense » ou « Ajouter un revenu ».",
      "Renseignez montant, description, catégorie, compte et date (modifiable, y compris l'heure).",
      "Onglet Transactions : recherchez par mot-clé ou filtrez par compte/catégorie/type/période.",
    ],
  },
  {
    category: "Suivi",
    icon: "tag",
    title: "Catégories",
    purpose: "Classez vos transactions (Alimentation, Transport, Salaire...) pour des statistiques utiles. Des catégories par défaut existent déjà.",
    steps: [
      "Menu → Catégories → « + » pour en créer une (nom, icône, couleur, type dépense ou revenu).",
      "Supprimer une catégorie ne supprime pas les transactions déjà liées : elles passent en « Sans catégorie ».",
    ],
  },
  {
    category: "Suivi",
    icon: "pie-chart",
    title: "Budgets",
    purpose: "Fixez un plafond mensuel par catégorie et suivez votre progression. Une alerte apparaît à 70% du budget, puis en cas de dépassement.",
    steps: [
      "Menu → Budgets → « + » → choisissez une catégorie et un montant pour le mois en cours.",
      "Un mois sans budget propose de reconduire ceux du mois précédent (mêmes catégories et montants) en un tap.",
    ],
  },
  {
    category: "Suivi",
    icon: "repeat",
    title: "Transactions récurrentes",
    purpose: "Loyer, internet, salaire... des montants qui reviennent chaque mois à date fixe, avec une alerte avant l'échéance.",
    steps: [
      "Menu → Transactions récurrentes → « + » → nom, montant, compte, catégorie, jour du mois.",
      "« Marquer payée/reçue » enregistre automatiquement la transaction correspondante.",
      "Pour corriger une erreur, supprimez la transaction dans l'onglet Transactions : l'échéance redevient due.",
    ],
  },
  {
    category: "Suivi",
    icon: "target",
    title: "Objectifs & coffres",
    purpose: "Épargnez pour un projet précis (achat, voyage...) en versant de l'argent au fil du temps, avec une photo pour rester motivé.",
    steps: [
      "Menu → Objectifs & coffres → « + » → nom, montant cible, date cible optionnelle, photo optionnelle.",
      "Ouvrez l'objectif → « Ajouter » ou « Retirer » pour enregistrer un versement, avec ou sans compte associé.",
    ],
  },
  {
    category: "Suivi",
    icon: "briefcase",
    title: "Projets",
    purpose: "Un plan de dépenses nommé (voyage, événement, achat...) composé de plusieurs postes estimés — le coût total s'additionne automatiquement.",
    steps: [
      "Onglet Projets (barre du bas) → « + » → nommez le projet.",
      "Ouvrez-le → « Ajouter un poste » pour chaque dépense prévue (ex. Transport, Hôtel).",
    ],
  },
  {
    category: "Suivi",
    icon: "users",
    title: "Dettes",
    purpose: "Ce que des proches vous doivent et ce que vous leur devez, personne par personne, avec l'historique complet des remboursements.",
    steps: [
      "Menu → Dettes → bouton vert « On me doit » ou bouton rouge « Je dois » selon le cas.",
      "Deux onglets séparent les deux sens ; une barre de recherche retrouve une personne par nom.",
      "Si la même personne emprunte encore, ouvrez sa fiche et utilisez « Nouvelle dette » plutôt que d'en créer une autre.",
      "« Remboursement » enregistre un paiement partiel ou total, avec compte et photo de preuve optionnels.",
      "Une dette entièrement réglée quitte la liste principale ; retrouvez-la via le lien « Historique ».",
    ],
  },
  {
    category: "Suivi",
    icon: "bar-chart-3",
    title: "Statistiques",
    purpose: "Répartition de vos dépenses par catégorie, évolution dans le temps, et comparaison avec la période précédente.",
    steps: [
      "Menu → Statistiques → choisissez une période (semaine, mois, année, personnalisée).",
      "Le donut montre la répartition par catégorie ; la courbe montre l'évolution du solde.",
    ],
  },
  {
    category: "Application",
    icon: "shield",
    title: "Sécurité",
    purpose: "Verrouillez l'accès à l'app avec un code PIN, et déverrouillez plus vite avec Face ID/Touch ID/Windows Hello si votre appareil le permet.",
    steps: [
      "Menu → Paramètres → Sécurité → activez le verrouillage et définissez un code à 4 chiffres.",
      "Ce verrouillage est indépendant du compte : c'est une couche de protection quotidienne en plus.",
    ],
  },
  {
    category: "Application",
    icon: "settings",
    title: "Paramètres : données et synchronisation",
    purpose: "Exportez vos données pour les garder en sécurité, ou retrouvez-les automatiquement sur un autre appareil connecté au même compte.",
    steps: [
      "Menu → Paramètres → Données : export JSON complet ou CSV des transactions, import, suppression totale.",
      "La synchronisation entre appareils est automatique dès que vous êtes connecté·e à votre compte — aucun réglage à activer.",
    ],
  },
];

export function openGuidePage() {
  let searchText = "";
  const openSections = new Set();

  openSheetCustom({
    title: "Guide",
    leading: { label: "Fermer" },
    build(body) {
      render(body);
    },
  });

  function render(body) {
    const prevSearchInput = body.querySelector("#guide-search");
    const hadFocus = document.activeElement === prevSearchInput;
    const cursorPos = hadFocus ? prevSearchInput.selectionStart : null;

    const q = searchText.trim().toLowerCase();
    const filtered = SECTIONS.filter(
      (s) => !q || s.title.toLowerCase().includes(q) || s.purpose.toLowerCase().includes(q) || s.steps.some((step) => step.toLowerCase().includes(q))
    );

    const categories = [...new Set(filtered.map((s) => s.category))];

    body.innerHTML = `
      <p style="color:var(--text-secondary);margin:0 0 16px;">À quoi sert chaque fonctionnalité, et comment s'en servir.</p>
      <div class="search-bar" style="margin:0 0 18px;">
        <i data-lucide="search"></i>
        <input id="guide-search" type="search" placeholder="Rechercher (ex. budget, dette, photo...)" value="${escapeHtml(searchText)}" />
      </div>
      ${categories.length === 0 ? `<div class="empty-state">${icon("search-x")}<h3>Aucun résultat</h3><p>Essayez un autre mot-clé.</p></div>` : ""}
      ${categories
        .map(
          (cat) => `
        <p class="form-section__label">${escapeHtml(cat)}</p>
        <div class="card" style="padding:0 12px;margin-bottom:20px;">
          ${filtered
            .filter((s) => s.category === cat)
            .map(
              (s, i, arr) => `
            <div class="guide-section ${openSections.has(s.title) ? "is-open" : ""}" data-guide-title="${escapeHtml(s.title)}">
              <button class="guide-section__header" data-guide-toggle>
                <span class="guide-section__title">${icon(s.icon)}${escapeHtml(s.title)}</span>
                <span class="guide-section__chevron">${icon("chevron-down")}</span>
              </button>
              <div class="guide-section__body" ${openSections.has(s.title) ? "" : "hidden"}>
                <p class="guide-section__purpose">${escapeHtml(s.purpose)}</p>
                <ol class="guide-section__steps">
                  ${s.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
                </ol>
              </div>
            </div>`
            )
            .join("")}
        </div>`
        )
        .join("")}
    `;

    body.querySelectorAll("[data-guide-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const section = btn.closest("[data-guide-title]");
        const title = section.dataset.guideTitle;
        const bodyEl = section.querySelector(".guide-section__body");
        const isOpen = openSections.has(title);
        if (isOpen) openSections.delete(title);
        else openSections.add(title);
        section.classList.toggle("is-open", !isOpen);
        bodyEl.hidden = isOpen;
      });
    });

    const searchInput = body.querySelector("#guide-search");
    searchInput.addEventListener("input", () => {
      searchText = searchInput.value;
      render(body);
    });
    if (hadFocus) {
      searchInput.focus();
      searchInput.setSelectionRange(cursorPos, cursorPos);
    }

    renderIcons(body);
  }
}
