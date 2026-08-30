// Export / import de toutes les données au format JSON, pour sauvegarde manuelle par
// l'utilisateur, plus un export CSV des transactions pour un tableur. Aucune donnée n'est
// jamais envoyée à un serveur : tout reste sur l'appareil, les fichiers sont générés et lus
// localement dans le navigateur.
import { DB, Accounts, Categories, Transactions, Budgets, RecurringExpenses, Goals, Debts } from "./db.js";
import { seedDefaultCategories } from "./seed.js";

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function timestampedName(base, ext) {
  return `${base}_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${ext}`;
}

export function exportAll() {
  const payload = {
    exportedAt: new Date().toISOString(),
    appVersion: "1.1.0",
    accounts: DB.all("accounts"),
    categories: DB.all("categories"),
    transactions: DB.all("transactions"),
    budgets: DB.all("budgets"),
    recurringExpenses: DB.all("recurringExpenses"),
    goals: DB.all("goals"),
    debts: DB.all("debts"),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadBlob(blob, timestampedName("Finance_Export", "json"));
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (/[",\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

const TYPE_LABEL = { income: "Revenu", expense: "Dépense", transfer: "Virement" };

/** Export CSV des transactions (une ligne par transaction), pour ouverture dans un tableur. */
export function exportTransactionsCsv() {
  const transactions = Transactions.all();
  const categoriesById = new Map(Categories.all().map((c) => [c.id, c]));
  const accountsById = new Map(Accounts.all().map((a) => [a.id, a]));

  const header = ["Date", "Type", "Titre", "Catégorie", "Compte", "Compte destination", "Montant", "Devise", "Note"];
  const rows = transactions.map((t) => [
    new Date(t.date).toLocaleDateString("fr-FR"),
    TYPE_LABEL[t.type] || t.type,
    t.title,
    t.categoryId ? categoriesById.get(t.categoryId)?.name || "" : "Sans catégorie",
    accountsById.get(t.accountId)?.name || "",
    t.transferAccountId ? accountsById.get(t.transferAccountId)?.name || "" : "",
    String(t.amount).replace(".", ","),
    accountsById.get(t.accountId)?.currency || "",
    t.note || "",
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(";")).join("\r\n");
  // BOM UTF-8 pour qu'Excel détecte correctement l'encodage des accents.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, timestampedName("Finance_Transactions", "csv"));
}

/** Importe un fichier d'export JSON : les objets sont recréés avec de nouveaux identifiants et
 * viennent s'ajouter aux données existantes (rien n'est écrasé). */
export async function importFromFile(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Le fichier sélectionné n'est pas un export Finance valide.");
  }
  if (!payload || !Array.isArray(payload.accounts) || !Array.isArray(payload.transactions)) {
    throw new Error("Le fichier sélectionné n'est pas un export Finance valide.");
  }

  const categoryIdMap = new Map();
  for (const c of payload.categories || []) {
    const created = Categories.create({ name: c.name, icon: c.icon, type: c.type, colorHex: c.colorHex, isDefault: !!c.isDefault });
    categoryIdMap.set(c.id, created.id);
  }

  const accountIdMap = new Map();
  for (const a of payload.accounts || []) {
    const created = Accounts.create({ name: a.name, initialBalance: a.initialBalance, currency: a.currency, icon: a.icon, colorHex: a.colorHex, sortOrder: a.sortOrder ?? 0 });
    accountIdMap.set(a.id, created.id);
  }

  for (const t of payload.transactions || []) {
    Transactions.create({
      amount: t.amount,
      type: t.type,
      title: t.title,
      note: t.note || "",
      date: t.date,
      categoryId: t.categoryId ? categoryIdMap.get(t.categoryId) ?? null : null,
      accountId: t.accountId ? accountIdMap.get(t.accountId) ?? null : null,
      transferAccountId: t.transferAccountId ? accountIdMap.get(t.transferAccountId) ?? null : null,
    });
  }

  for (const b of payload.budgets || []) {
    Budgets.create({
      name: b.name,
      amount: b.amount,
      categoryId: b.categoryId ? categoryIdMap.get(b.categoryId) ?? null : null,
      month: b.month,
      year: b.year,
    });
  }

  for (const r of payload.recurringExpenses || []) {
    RecurringExpenses.create({
      name: r.name,
      amount: r.amount,
      type: r.type || "expense",
      categoryId: r.categoryId ? categoryIdMap.get(r.categoryId) ?? null : null,
      accountId: r.accountId ? accountIdMap.get(r.accountId) ?? null : null,
      dueDay: r.dueDay,
      reminderDays: r.reminderDays ?? 3,
      isActive: r.isActive !== false,
      lastPaidPeriod: r.lastPaidPeriod ?? null,
    });
  }

  for (const g of payload.goals || []) {
    Goals.create({
      name: g.name,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount ?? 0,
      icon: g.icon,
      colorHex: g.colorHex,
      targetDate: g.targetDate ?? null,
      contributions: (g.contributions || []).map((c) => ({
        ...c,
        accountId: c.accountId ? accountIdMap.get(c.accountId) ?? null : null,
      })),
    });
  }

  for (const d of payload.debts || []) {
    Debts.create({
      personName: d.personName,
      type: d.type,
      amount: d.amount,
      remainingAmount: d.remainingAmount ?? d.amount,
      dueDate: d.dueDate ?? null,
      reason: d.reason || "",
      repayments: (d.repayments || []).map((r) => ({
        ...r,
        accountId: r.accountId ? accountIdMap.get(r.accountId) ?? null : null,
      })),
    });
  }
}

export function deleteAllData() {
  DB.clearAll();
  seedDefaultCategories();
}
