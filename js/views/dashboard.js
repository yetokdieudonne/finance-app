import { Accounts, Transactions, Categories, Goals, Debts } from "../db.js";
import { formatAmount, formatCompactAmount, startOfMonth, endOfMonthExclusive, shortDateString } from "../format.js";
import * as Calc from "../calculator.js";
import { icon } from "../components/icon.js";
import { openAccountsManager, openAccountDetail } from "./accounts.js";
import { renderDueChargesSection } from "./recurring.js";
import { openGoalsManager } from "./goals.js";
import { openDebtsManager } from "./debts.js";

// Pas de titre : la barre supérieure est masquée sur l'accueil (la carte de solde en haut
// suffit à identifier l'écran, sans redondance visuelle).
export const title = "";

export function render(container) {
  const accounts = Accounts.all();
  const transactions = Transactions.all();
  const categories = Categories.all();
  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const primaryCurrency = accounts[0]?.currency || "fcfa";

  if (accounts.length === 0) {
    container.innerHTML = `
      <div class="view">
        <div class="balance-hero">
          <p class="balance-hero__label">Solde total</p>
          <p class="balance-hero__value">${formatCompactAmount(0)}</p>
        </div>
        <div class="card">
          <div class="empty-state">
            ${icon("wallet")}
            <h3>Aucun compte</h3>
            <p>Créez votre premier compte pour commencer à suivre vos finances.</p>
            <button class="btn btn--primary" id="dash-create-account">Créer un compte</button>
          </div>
        </div>
      </div>
    `;
    container.querySelector("#dash-create-account").addEventListener("click", () => openAccountsManager());
    return;
  }

  const interval = { start: startOfMonth(new Date()), end: endOfMonthExclusive(new Date()) };
  const income = Calc.totalIncome(transactions, interval);
  const expense = Calc.totalExpense(transactions, interval);
  const total = Calc.totalBalance(accounts, transactions);
  const recent = transactions.slice(0, 5);
  const goalsCount = Goals.all().length;
  const owedToMe = Calc.totalOwedToMe(Debts.all());
  const iOwe = Calc.totalIOwe(Debts.all());

  container.innerHTML = `
    <div class="view">
      <div class="balance-hero">
        <p class="balance-hero__label">Solde total</p>
        <p class="balance-hero__value">${formatCompactAmount(total, primaryCurrency)}</p>
      </div>

      <div>
        <p class="section-title">Résumé du mois</p>
        <div class="summary-grid">
          <div class="card">
            <div class="summary-card__label"><span class="summary-card__icon" style="background:color-mix(in srgb, var(--green) 18%, transparent);color:var(--green);">${icon("arrow-down-circle")}</span>Revenus</div>
            <div class="summary-card__value text-green">${formatCompactAmount(income, primaryCurrency)}</div>
          </div>
          <div class="card">
            <div class="summary-card__label"><span class="summary-card__icon" style="background:color-mix(in srgb, var(--red) 18%, transparent);color:var(--red);">${icon("arrow-up-circle")}</span>Dépenses</div>
            <div class="summary-card__value text-red">${formatCompactAmount(expense, primaryCurrency)}</div>
          </div>
          <div class="card">
            <div class="summary-card__label"><span class="summary-card__icon" style="background:color-mix(in srgb, var(--green) 18%, transparent);color:var(--green);">${icon("users")}</span>On me doit</div>
            <div class="summary-card__value text-green">${formatCompactAmount(owedToMe, primaryCurrency)}</div>
          </div>
          <div class="card">
            <div class="summary-card__label"><span class="summary-card__icon" style="background:color-mix(in srgb, var(--red) 18%, transparent);color:var(--red);">${icon("users")}</span>Dette</div>
            <div class="summary-card__value text-red">${formatCompactAmount(iOwe, primaryCurrency)}</div>
          </div>
        </div>
      </div>

      <div id="dash-charges-section"></div>

      <div class="summary-block-row">
        <button class="card summary-block summary-block--compact" id="dash-accounts-block">
          <span class="summary-block__icon" style="background:color-mix(in srgb, var(--accent) 18%, transparent);color:var(--accent);">${icon("credit-card")}</span>
          <span class="summary-block__body">
            <div class="summary-block__title">Comptes</div>
            <div class="summary-block__subtitle">${accounts.length} compte${accounts.length > 1 ? "s" : ""} · ${formatCompactAmount(total, primaryCurrency)}</div>
          </span>
        </button>

        <button class="card summary-block summary-block--compact" id="dash-goals-block">
          <span class="summary-block__icon" style="background:color-mix(in srgb, var(--purple) 18%, transparent);color:var(--purple);">${icon("target")}</span>
          <span class="summary-block__body">
            <div class="summary-block__title">Objectifs &amp; coffres</div>
            <div class="summary-block__subtitle">${goalsCount} objectif${goalsCount > 1 ? "s" : ""}</div>
          </span>
        </button>
      </div>

      <button class="card summary-block" id="dash-debts-block">
        <span class="summary-block__icon" style="background:color-mix(in srgb, var(--orange) 18%, transparent);color:var(--orange);">${icon("users")}</span>
        <span class="summary-block__body">
          <div class="summary-block__title">Dettes</div>
          <div class="summary-block__subtitle">On vous doit ${formatCompactAmount(owedToMe, primaryCurrency)} · Vous devez ${formatCompactAmount(iOwe, primaryCurrency)}</div>
        </span>
        <span class="summary-block__chevron">${icon("chevron-right")}</span>
      </button>

      <div>
        <div class="section-header">
          <p class="section-title">Dernières transactions</p>
          <button class="link-btn" id="dash-see-all">Tout voir</button>
        </div>
        <div class="card" id="dash-recent" style="padding:0 16px;"></div>
      </div>
    </div>
  `;

  renderDueChargesSection(container.querySelector("#dash-charges-section"));

  container.querySelector("#dash-accounts-block").addEventListener("click", () => openAccountsManager());
  container.querySelector("#dash-goals-block").addEventListener("click", () => openGoalsManager());
  container.querySelector("#dash-debts-block").addEventListener("click", () => openDebtsManager());

  // Transactions récentes
  const recentEl = container.querySelector("#dash-recent");
  if (recent.length === 0) {
    recentEl.style.padding = "0";
    recentEl.innerHTML = `<div class="empty-state">${icon("inbox")}<h3>Aucune transaction</h3><p>Ajoutez votre première dépense ou revenu avec le bouton +.</p></div>`;
  } else {
    import("./transactions.js").then(({ renderTransactionRow, openTransactionDetail }) => {
      recentEl.innerHTML = recent.map((t, i) => renderTransactionRow(t, categoriesById, accounts, i < recent.length - 1)).join("");
      recentEl.querySelectorAll("[data-tx-id]").forEach((row) => {
        row.addEventListener("click", () => openTransactionDetail(Transactions.get(row.dataset.txId)));
      });
    });
  }
  container.querySelector("#dash-see-all").addEventListener("click", () => {
    import("../app.js").then(({ switchTab }) => switchTab("transactions"));
  });
}

export function buildEvolutionChart(ctx, points, currency) {
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue("--accent").trim() || "#0A84FF";
  return new Chart(ctx, {
    type: "line",
    data: {
      labels: points.map((p) => shortDateString(p.date)),
      datasets: [
        {
          data: points.map((p) => p.balance),
          borderColor: accent,
          backgroundColor: `${accent}33`,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => formatAmount(c.parsed.y, currency) } } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 5, autoSkip: true } },
        y: { grid: { color: styles.getPropertyValue("--separator") }, ticks: { callback: (v) => compactAmount(v) } },
      },
    },
  });
}

export function buildDonutChart(ctx, breakdown) {
  return new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: breakdown.map((b) => b.name),
      datasets: [{ data: breakdown.map((b) => b.total), backgroundColor: breakdown.map((b) => b.colorHex), borderWidth: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: { legend: { display: false } },
    },
  });
}

function compactAmount(v) {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000) return Math.round(v / 1_000) + "k";
  return Math.round(v);
}
