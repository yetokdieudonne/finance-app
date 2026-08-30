// Initialise les catégories par défaut (toujours) et des données de démonstration
// (uniquement au tout premier lancement, si aucune donnée n'existe encore).
import { DB, Accounts, Categories, Transactions, Budgets, RecurringExpenses, Goals, Debts } from "./db.js";

const EXPENSE_CATEGORIES = [
  ["Alimentation", "utensils", "#FF9500"],
  ["Transport", "car", "#5AC8FA"],
  ["Logement", "home", "#AF52DE"],
  ["Santé", "cross", "#FF3B30"],
  ["Éducation", "book-open", "#007AFF"],
  ["Téléphone & Internet", "wifi", "#34C759"],
  ["Loisirs", "gamepad-2", "#FF2D55"],
  ["Shopping", "shopping-bag", "#FF9F0A"],
  ["Abonnements", "repeat", "#5856D6"],
  ["Factures", "file-text", "#8E8E93"],
  ["Famille", "users", "#FF6482"],
  ["Voyage", "plane", "#30B0C7"],
  ["Autres", "more-horizontal", "#8E8E93"],
];

const INCOME_CATEGORIES = [
  ["Salaire", "banknote", "#34C759"],
  ["Freelance", "laptop", "#32ADE6"],
  ["Business", "briefcase", "#FF9500"],
  ["Vente", "tag", "#5856D6"],
  ["Investissement", "trending-up", "#30B0C7"],
  ["Cadeau", "gift", "#FF2D55"],
  ["Autres", "more-horizontal", "#8E8E93"],
];

export function seedDefaultCategories() {
  if (DB.all("categories").length > 0) return;
  for (const [name, iconName, colorHex] of EXPENSE_CATEGORIES) {
    Categories.create({ name, icon: iconName, type: "expense", colorHex, isDefault: true });
  }
  for (const [name, iconName, colorHex] of INCOME_CATEGORIES) {
    Categories.create({ name, icon: iconName, type: "income", colorHex, isDefault: true });
  }
}

export function seedDemoDataIfEmpty() {
  if (DB.all("accounts").length > 0) return;

  const cash = Accounts.create({ name: "Espèces", initialBalance: 150000, currency: "fcfa", icon: "banknote", colorHex: "#34C759" });
  const momo = Accounts.create({ name: "MTN Mobile Money", initialBalance: 300000, currency: "fcfa", icon: "smartphone", colorHex: "#FFCC00" });
  const bank = Accounts.create({ name: "Banque", initialBalance: 800000, currency: "fcfa", icon: "landmark", colorHex: "#0A84FF" });

  const byName = (name) => Categories.all().find((c) => c.name === name);
  const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };

  const tx = [
    { amount: 250000, type: "income", title: "Paiement client", note: "Projet client", date: daysAgo(1), categoryId: byName("Freelance")?.id, accountId: bank.id },
    { amount: 15000, type: "expense", title: "Déjeuner", note: "", date: daysAgo(0), categoryId: byName("Alimentation")?.id, accountId: cash.id },
    { amount: 5000, type: "expense", title: "Taxi", note: "", date: daysAgo(2), categoryId: byName("Transport")?.id, accountId: cash.id },
    { amount: 10000, type: "expense", title: "Forfait internet", note: "", date: daysAgo(3), categoryId: byName("Téléphone & Internet")?.id, accountId: momo.id },
    { amount: 75000, type: "income", title: "Vente téléphone", note: "", date: daysAgo(5), categoryId: byName("Vente")?.id, accountId: momo.id },
    { amount: 45000, type: "expense", title: "Courses de la semaine", note: "", date: daysAgo(6), categoryId: byName("Alimentation")?.id, accountId: bank.id },
    { amount: 8000, type: "expense", title: "Cinéma", note: "", date: daysAgo(8), categoryId: byName("Loisirs")?.id, accountId: cash.id },
    { amount: 20000, type: "expense", title: "Facture électricité", note: "", date: daysAgo(10), categoryId: byName("Factures")?.id, accountId: bank.id },
  ];
  for (const t of tx) Transactions.create(t);

  const now = new Date();
  const month = now.getMonth() + 1, year = now.getFullYear();
  Budgets.create({ name: "Alimentation", amount: 100000, categoryId: byName("Alimentation")?.id, month, year });
  Budgets.create({ name: "Transport", amount: 30000, categoryId: byName("Transport")?.id, month, year });
  Budgets.create({ name: "Loisirs", amount: 25000, categoryId: byName("Loisirs")?.id, month, year });

  // Le statut (en retard / bientôt / à jour) dépend de la date du jour, comme en usage réel.
  RecurringExpenses.create({ name: "Loyer", amount: 75000, type: "expense", categoryId: byName("Logement")?.id, accountId: bank.id, dueDay: 5, reminderDays: 3 });
  RecurringExpenses.create({ name: "Internet", amount: 15000, type: "expense", categoryId: byName("Téléphone & Internet")?.id, accountId: momo.id, dueDay: 31, reminderDays: 5 });
  RecurringExpenses.create({ name: "Salaire", amount: 400000, type: "income", categoryId: byName("Salaire")?.id, accountId: bank.id, dueDay: 30, reminderDays: 3 });

  const goal = Goals.create({ name: "Achat moto", targetAmount: 500000, icon: "target", colorHex: "#0A84FF" });
  Goals.addContribution(goal.id, { amount: 50000, accountId: cash.id, note: "Premier versement" });
  Goals.addContribution(goal.id, { amount: 30000, accountId: momo.id, note: "" });

  const debtFromKofi = Debts.create({ personName: "Kofi", type: "owedToMe", amount: 25000, reason: "Dépannage transport" });
  Debts.addRepayment(debtFromKofi.id, { amount: 10000, accountId: cash.id, note: "Premier remboursement" });
  Debts.create({ personName: "Ama", type: "iOwe", amount: 15000, reason: "Avance sur loyer partagé" });
}
