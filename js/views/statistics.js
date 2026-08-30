import { Transactions, Accounts, Categories } from "../db.js";
import { formatAmount, startOfWeek, startOfMonth, endOfMonthExclusive, startOfYear, addDays, addMonths, dateInputValue, fromDateInputValue } from "../format.js";
import * as Calc from "../calculator.js";
import { icon, renderIcons } from "../components/icon.js";
import { openSheetCustom } from "../components/modal.js";
import { buildEvolutionChart, buildDonutChart } from "./dashboard.js";

export const title = "Statistiques";

const PERIODS = [
  { key: "week", label: "Cette semaine" },
  { key: "month", label: "Ce mois" },
  { key: "previousMonth", label: "Mois précédent" },
  { key: "year", label: "Cette année" },
  { key: "custom", label: "Personnalisée" },
];

let periodKind = "month";
let customStart = startOfMonth(new Date());
let customEnd = new Date();

let barChart = null;
let evoChart = null;
let donutChart = null;

function currentInterval() {
  const now = new Date();
  switch (periodKind) {
    case "week":
      return { start: startOfWeek(now), end: addDays(now, 1) };
    case "month":
      return { start: startOfMonth(now), end: addDays(now, 1) };
    case "previousMonth": {
      const prev = addMonths(now, -1);
      return { start: startOfMonth(prev), end: endOfMonthExclusive(prev) };
    }
    case "year":
      return { start: startOfYear(now), end: addDays(now, 1) };
    case "custom": {
      const start = customStart < customEnd ? customStart : customEnd;
      const end = customStart < customEnd ? customEnd : customStart;
      return { start, end: addDays(end, 1) };
    }
    default:
      return { start: startOfMonth(now), end: addDays(now, 1) };
  }
}

/** Intervalle "équivalent" juste avant la période affichée, pour comparaison (même durée en
 * jours, décalée d'une période) — null pour "custom" où il n'y a pas d'équivalent naturel. */
function previousInterval(interval) {
  const now = new Date();
  const spanMs = interval.end.getTime() - interval.start.getTime();
  switch (periodKind) {
    case "week":
      return { start: addDays(interval.start, -7), end: addDays(interval.end, -7) };
    case "month": {
      const prevStart = addMonths(interval.start, -1);
      return { start: prevStart, end: new Date(prevStart.getTime() + spanMs) };
    }
    case "previousMonth": {
      const ref = addMonths(now, -2);
      return { start: startOfMonth(ref), end: endOfMonthExclusive(ref) };
    }
    case "year": {
      const prevStart = new Date(interval.start.getFullYear() - 1, interval.start.getMonth(), interval.start.getDate());
      return { start: prevStart, end: new Date(prevStart.getTime() + spanMs) };
    }
    default:
      return null;
  }
}

const PREVIOUS_LABEL = { week: "la semaine précédente", month: "le mois précédent", previousMonth: "le mois d'avant", year: "l'année précédente" };

function formatDelta(current, previous) {
  if (previous === null || previous === undefined) return null;
  if (previous === 0) return current > 0 ? { text: "Nouveau", positive: true } : null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return { text: `${pct >= 0 ? "+" : ""}${pct}%`, positive: pct >= 0 };
}

export function render(container) {
  const transactions = Transactions.all();
  const accounts = Accounts.all();
  const categories = Categories.all();
  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const currency = accounts[0]?.currency || "fcfa";

  if (barChart) { barChart.destroy(); barChart = null; }
  if (evoChart) { evoChart.destroy(); evoChart = null; }
  if (donutChart) { donutChart.destroy(); donutChart = null; }

  container.innerHTML = `
    <div class="view">
      <div class="chip-row" id="period-chips">
        ${PERIODS.map((p) => `<button class="chip ${p.key === periodKind ? "is-active" : ""}" data-period="${p.key}">${p.label}</button>`).join("")}
      </div>
      <div id="stats-content"></div>
    </div>
  `;

  container.querySelectorAll("[data-period]").forEach((btn) => {
    btn.addEventListener("click", () => {
      periodKind = btn.dataset.period;
      if (periodKind === "custom") openCustomPeriodSheet(container);
      render(container);
      renderIcons(container);
    });
  });

  const content = container.querySelector("#stats-content");
  if (transactions.length === 0) {
    content.innerHTML = `<div class="card"><div class="empty-state">${icon("bar-chart-3")}<h3>Aucune donnée</h3><p>Ajoutez des transactions pour voir apparaître vos statistiques.</p></div></div>`;
    return;
  }

  const interval = currentInterval();
  const income = Calc.totalIncome(transactions, interval);
  const expense = Calc.totalExpense(transactions, interval);
  const average = Calc.averageExpense(transactions, interval);
  const count = Calc.transactionCount(transactions, interval);
  const top = Calc.topCategory(transactions, categoriesById, interval);
  const breakdown = Calc.categoryBreakdown(transactions, categoriesById, "expense", interval);
  const evolution = Calc.balanceEvolution(accounts, transactions, interval);

  const prevInterval = previousInterval(interval);
  const prevIncome = prevInterval ? Calc.totalIncome(transactions, prevInterval) : null;
  const prevExpense = prevInterval ? Calc.totalExpense(transactions, prevInterval) : null;
  const savings = income - expense;
  const prevSavings = prevInterval ? prevIncome - prevExpense : null;

  content.innerHTML = `
    <div class="stat-tiles" style="margin-bottom:20px;">
      <div class="card stat-tile"><div class="stat-tile__label">Total revenus</div><div class="stat-tile__value text-green">${formatAmount(income, currency)}</div></div>
      <div class="card stat-tile"><div class="stat-tile__label">Total dépenses</div><div class="stat-tile__value text-red">${formatAmount(expense, currency)}</div></div>
      <div class="card stat-tile"><div class="stat-tile__label">Moyenne / dépense</div><div class="stat-tile__value text-orange">${formatAmount(average, currency)}</div></div>
      <div class="card stat-tile"><div class="stat-tile__label">Transactions</div><div class="stat-tile__value text-accent">${count}</div></div>
      <div class="card stat-tile full"><div class="stat-tile__label">Catégorie la plus dépensière</div><div class="stat-tile__value text-purple">${top ? top.name : "—"}</div></div>
    </div>

    ${prevInterval ? `
    <div class="card" style="margin-bottom:16px;">
      <p class="section-title">Comparaison avec ${PREVIOUS_LABEL[periodKind]}</p>
      <div class="form-group">
        ${comparisonRow("Revenus", income, prevIncome, currency, true)}
        ${comparisonRow("Dépenses", expense, prevExpense, currency, false)}
        ${comparisonRow("Épargne", savings, prevSavings, currency, true)}
      </div>
    </div>
    ` : ""}

    <div class="card" style="margin-bottom:16px;">
      <p class="section-title">Dépenses par catégorie</p>
      ${breakdown.length === 0
        ? `<div class="empty-state">${icon("pie-chart")}<h3>Aucune dépense</h3><p>Aucune dépense sur cette période.</p></div>`
        : `<div class="donut-row"><div class="donut-wrap"><canvas id="stats-donut"></canvas><div class="donut-center"><span class="donut-center__label">Total</span><span class="donut-center__value">${formatAmount(breakdown.reduce((s, b) => s + b.total, 0), currency)}</span></div></div><div class="chart-legend" id="stats-legend"></div></div>`}
    </div>

    <div class="card" style="margin-bottom:16px;">
      <p class="section-title">Revenus vs Dépenses</p>
      <div class="chart-container"><canvas id="stats-bar"></canvas></div>
    </div>

    <div class="card">
      <p class="section-title">Évolution du solde</p>
      <div class="chart-container"><canvas id="stats-evo"></canvas></div>
    </div>
  `;

  if (breakdown.length > 0) {
    donutChart = buildDonutChart(content.querySelector("#stats-donut"), breakdown);
    const total = breakdown.reduce((s, b) => s + b.total, 0);
    content.querySelector("#stats-legend").innerHTML = breakdown
      .slice(0, 8)
      .map((b) => `<div class="chart-legend__item"><span class="chart-legend__dot" style="background:${b.colorHex}"></span><span class="chart-legend__name">${b.name}</span><span class="chart-legend__pct">${total > 0 ? Math.round((b.total / total) * 100) : 0}%</span></div>`)
      .join("");
  }

  barChart = buildBarChart(content.querySelector("#stats-bar"), income, expense, currency);
  evoChart = buildEvolutionChart(content.querySelector("#stats-evo"), evolution, currency);
}

function comparisonRow(label, current, previous, currency, higherIsGood) {
  const delta = formatDelta(current, previous);
  const isGood = delta ? (higherIsGood ? delta.positive : !delta.positive) : null;
  return `
    <div class="form-row">
      <span class="form-row__label">${label}</span>
      <span style="display:flex;align-items:center;gap:8px;">
        <span style="color:var(--text-secondary);font-size:13px;">${formatAmount(previous ?? 0, currency)}</span>
        ${delta ? `<span style="font-weight:600;color:${isGood ? "var(--green)" : "var(--red)"}">${delta.text}</span>` : `<span style="color:var(--text-tertiary);font-size:13px;">—</span>`}
      </span>
    </div>`;
}

function buildBarChart(ctx, income, expense, currency) {
  const styles = getComputedStyle(document.documentElement);
  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Revenus", "Dépenses"],
      datasets: [{ data: [income, expense], backgroundColor: [styles.getPropertyValue("--green"), styles.getPropertyValue("--red")], borderRadius: 8, maxBarThickness: 60 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => formatAmount(c.parsed.y, currency) } } },
      scales: { y: { grid: { color: styles.getPropertyValue("--separator") } }, x: { grid: { display: false } } },
    },
  });
}

function openCustomPeriodSheet(parentContainer) {
  openSheetCustom({
    title: "Période personnalisée",
    leading: { label: "Fermer" },
    build(body, sheetApi) {
      body.innerHTML = `
        <div class="form-group">
          <div class="form-row"><span class="form-row__label">Du</span><input id="p-start" type="date" value="${dateInputValue(customStart)}" /></div>
          <div class="form-row"><span class="form-row__label">Au</span><input id="p-end" type="date" value="${dateInputValue(customEnd)}" /></div>
        </div>
        <button class="btn btn--primary btn--large mt-16" id="p-apply">Appliquer</button>
      `;
      body.querySelector("#p-apply").addEventListener("click", () => {
        customStart = fromDateInputValue(body.querySelector("#p-start").value);
        customEnd = fromDateInputValue(body.querySelector("#p-end").value);
        render(parentContainer);
        renderIcons(parentContainer);
        sheetApi.close();
      });
    },
  });
}
