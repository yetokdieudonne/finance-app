// Tous les calculs financiers (soldes, totaux, répartitions), centralisés ici pour que les
// vues restent de simples fonctions de rendu.
import { startOfDay, addDays } from "./format.js";

export const UNCATEGORIZED = { id: null, name: "Sans catégorie", icon: "help-circle", colorHex: "#8E8E93" };

function inInterval(dateStr, interval) {
  const t = new Date(dateStr).getTime();
  return t >= interval.start.getTime() && t < interval.end.getTime();
}

function effectOnAccount(transaction, accountId) {
  switch (transaction.type) {
    case "income":
      return transaction.accountId === accountId ? transaction.amount : 0;
    case "expense":
      return transaction.accountId === accountId ? -transaction.amount : 0;
    case "transfer":
      if (transaction.accountId === accountId) return -transaction.amount;
      if (transaction.transferAccountId === accountId) return transaction.amount;
      return 0;
    default:
      return 0;
  }
}

export function currentBalance(account, transactions) {
  const delta = transactions.reduce((sum, t) => sum + effectOnAccount(t, account.id), 0);
  return account.initialBalance + delta;
}

export function totalBalance(accounts, transactions) {
  return accounts.reduce((sum, a) => sum + currentBalance(a, transactions), 0);
}

export function totalIncome(transactions, interval) {
  return transactions
    .filter((t) => t.type === "income" && inInterval(t.date, interval))
    .reduce((sum, t) => sum + t.amount, 0);
}

export function totalExpense(transactions, interval) {
  return transactions
    .filter((t) => t.type === "expense" && inInterval(t.date, interval))
    .reduce((sum, t) => sum + t.amount, 0);
}

export function savings(transactions, interval) {
  return totalIncome(transactions, interval) - totalExpense(transactions, interval);
}

export function averageExpense(transactions, interval) {
  const expenses = transactions.filter((t) => t.type === "expense" && inInterval(t.date, interval));
  if (expenses.length === 0) return 0;
  return expenses.reduce((sum, t) => sum + t.amount, 0) / expenses.length;
}

export function transactionCount(transactions, interval) {
  return transactions.filter((t) => inInterval(t.date, interval)).length;
}

// Retourne [{ categoryId, name, icon, colorHex, total }] trié par montant décroissant.
export function categoryBreakdown(transactions, categoriesById, type, interval) {
  const matchType = type === "expense" ? "expense" : "income";
  const filtered = transactions.filter((t) => t.type === matchType && inInterval(t.date, interval));
  const groups = new Map();
  for (const t of filtered) {
    const category = (t.categoryId && categoriesById.get(t.categoryId)) || UNCATEGORIZED;
    const key = category.id || "__none__";
    if (!groups.has(key)) groups.set(key, { categoryId: category.id, name: category.name, icon: category.icon, colorHex: category.colorHex, total: 0 });
    groups.get(key).total += t.amount;
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}

export function topCategory(transactions, categoriesById, interval) {
  return categoryBreakdown(transactions, categoriesById, "expense", interval)[0] || null;
}

// Évolution jour par jour du solde total, jusqu'à aujourd'hui au maximum.
export function balanceEvolution(accounts, transactions, interval) {
  const initial = accounts.reduce((sum, a) => sum + a.initialBalance, 0);
  const netEffect = (t) => (t.type === "income" ? t.amount : t.type === "expense" ? -t.amount : 0);

  const before = transactions.filter((t) => new Date(t.date) < interval.start).reduce((sum, t) => sum + netEffect(t), 0);
  let running = initial + before;

  const today = startOfDay(new Date());
  const lastDay = new Date(Math.min(addDays(interval.end, -1).getTime(), today.getTime()));
  const points = [];

  if (interval.start > lastDay) {
    return [{ date: interval.start, balance: running }];
  }

  let day = interval.start;
  while (day <= lastDay) {
    const nextDay = addDays(day, 1);
    const dayTotal = transactions
      .filter((t) => { const d = new Date(t.date); return d >= day && d < nextDay; })
      .reduce((sum, t) => sum + netEffect(t), 0);
    running += dayTotal;
    points.push({ date: day, balance: running });
    day = nextDay;
  }
  return points;
}

export function spentOnBudget(budget, transactions) {
  if (!budget.categoryId) return 0; // catégorie supprimée : ne s'attribue plus aucune dépense
  const interval = budgetMonthInterval(budget);
  return transactions
    .filter((t) => t.type === "expense" && t.categoryId === budget.categoryId && inInterval(t.date, interval))
    .reduce((sum, t) => sum + t.amount, 0);
}

export function budgetMonthInterval(budget) {
  const start = new Date(budget.year, budget.month - 1, 1);
  const end = new Date(budget.year, budget.month, 1);
  return { start, end };
}

export function progress(spent, budgetAmount) {
  if (budgetAmount <= 0) return 0;
  return Math.min(spent / budgetAmount, 1);
}

/** null (rien à signaler), "soon" (>= 70%) ou "over" (dépassé). */
export function budgetAlertLevel(spent, budgetAmount) {
  if (budgetAmount <= 0) return null;
  if (spent > budgetAmount) return "over";
  if (spent / budgetAmount >= 0.7) return "soon";
  return null;
}

// MARK: - Charges fixes

/** "2026-08" pour une date donnée, sert à savoir si une charge a déjà été payée ce mois-ci. */
export function periodKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Statut d'une charge fixe par rapport à aujourd'hui : date d'échéance du mois courant
 * (calée sur le dernier jour du mois si dueDay dépasse le nombre de jours), si elle est déjà
 * payée pour la période en cours, et le statut d'alerte (paid / overdue / soon / ok).
 */
export function recurringExpenseStatus(charge, referenceDate = new Date()) {
  const today = startOfDay(referenceDate);
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dueDay = Math.min(charge.dueDay, daysInMonth);
  const dueDate = new Date(today.getFullYear(), today.getMonth(), dueDay);
  const key = periodKey(today);
  const isPaid = charge.lastPaidPeriod === key;
  const daysUntilDue = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);

  let status = "ok";
  if (isPaid) status = "paid";
  else if (daysUntilDue < 0) status = "overdue";
  else if (daysUntilDue <= (charge.reminderDays ?? 3)) status = "soon";

  return { periodKey: key, dueDate, isPaid, daysUntilDue, status };
}

/** Charges fixes actives nécessitant une alerte visuelle (proches ou en retard), triées. */
export function dueRecurringExpenses(charges, referenceDate = new Date()) {
  return charges
    .filter((c) => c.isActive !== false)
    .map((c) => ({ charge: c, ...recurringExpenseStatus(c, referenceDate) }))
    .filter((r) => r.status === "soon" || r.status === "overdue")
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

// MARK: - Dettes

/** "settled" (soldée), "overdue" (échéance dépassée, encore due) ou "open" (en cours). */
export function debtStatus(debt, referenceDate = new Date()) {
  const isSettled = debt.remainingAmount <= 0;
  let isOverdue = false;
  let daysOverdue = 0;
  if (!isSettled && debt.dueDate) {
    const today = startOfDay(referenceDate);
    const due = startOfDay(debt.dueDate);
    if (due < today) {
      isOverdue = true;
      daysOverdue = Math.round((today.getTime() - due.getTime()) / 86_400_000);
    }
  }
  return { isSettled, isOverdue, daysOverdue, status: isSettled ? "settled" : isOverdue ? "overdue" : "open" };
}

export function totalOwedToMe(debts) {
  return debts.filter((d) => d.type === "owedToMe").reduce((sum, d) => sum + Math.max(d.remainingAmount, 0), 0);
}

export function totalIOwe(debts) {
  return debts.filter((d) => d.type === "iOwe").reduce((sum, d) => sum + Math.max(d.remainingAmount, 0), 0);
}
