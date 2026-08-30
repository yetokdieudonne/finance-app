// Couche de persistance locale (localStorage). Toutes les données restent sur l'appareil :
// aucune requête réseau n'est jamais faite pour lire/écrire des données financières.

const STORAGE_PREFIX = "finance.";
const COLLECTIONS = ["accounts", "transactions", "categories", "budgets", "recurringExpenses", "goals", "debts"];

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function load(collection) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + collection);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error(`Erreur de lecture de ${collection}`, e);
    return [];
  }
}

function persist(collection, items) {
  localStorage.setItem(STORAGE_PREFIX + collection, JSON.stringify(items));
}

const cache = {};
for (const name of COLLECTIONS) cache[name] = load(name);

const listeners = new Set();
function notify() {
  for (const fn of listeners) fn();
}

export const DB = {
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  all(collection) {
    return cache[collection];
  },

  get(collection, id) {
    return cache[collection].find((item) => item.id === id) || null;
  },

  insert(collection, item) {
    const record = { id: uuid(), createdAt: new Date().toISOString(), ...item };
    cache[collection].push(record);
    persist(collection, cache[collection]);
    notify();
    return record;
  },

  update(collection, id, patch) {
    const item = cache[collection].find((i) => i.id === id);
    if (!item) return null;
    Object.assign(item, patch);
    persist(collection, cache[collection]);
    notify();
    return item;
  },

  delete(collection, id) {
    cache[collection] = cache[collection].filter((i) => i.id !== id);
    persist(collection, cache[collection]);
    notify();
  },

  deleteWhere(collection, predicate) {
    cache[collection] = cache[collection].filter((i) => !predicate(i));
    persist(collection, cache[collection]);
    notify();
  },

  replaceAll(collection, items) {
    cache[collection] = items;
    persist(collection, items);
    notify();
  },

  clearAll() {
    for (const name of COLLECTIONS) {
      cache[name] = [];
      persist(name, []);
    }
    notify();
  },

  uuid,
  COLLECTIONS,
};

// ---- Accès pratiques par domaine ----

export const Accounts = {
  all: () => [...DB.all("accounts")].sort((a, b) => a.sortOrder - b.sortOrder),
  get: (id) => DB.get("accounts", id),
  create(data) {
    const maxOrder = DB.all("accounts").reduce((m, a) => Math.max(m, a.sortOrder ?? -1), -1);
    return DB.insert("accounts", { sortOrder: maxOrder + 1, ...data });
  },
  update: (id, patch) => DB.update("accounts", id, patch),
  remove(id) {
    // Toutes les transactions liées (source ou destination) sont supprimées avec le compte.
    DB.deleteWhere("transactions", (t) => t.accountId === id || t.transferAccountId === id);
    // Les charges fixes qui débitaient ce compte n'ont plus de compte associé (à réassigner).
    for (const r of DB.all("recurringExpenses")) if (r.accountId === id) DB.update("recurringExpenses", r.id, { accountId: null });
    DB.delete("accounts", id);
  },
};

export const Categories = {
  all: () => [...DB.all("categories")].sort((a, b) => a.name.localeCompare(b.name, "fr")),
  byType: (type) => Categories.all().filter((c) => c.type === type),
  get: (id) => DB.get("categories", id),
  create: (data) => DB.insert("categories", data),
  update: (id, patch) => DB.update("categories", id, patch),
  remove(id) {
    // Les transactions/budgets/charges fixes liés perdent la référence (affichage
    // "Sans catégorie") mais ne sont jamais supprimés.
    for (const t of DB.all("transactions")) if (t.categoryId === id) DB.update("transactions", t.id, { categoryId: null });
    for (const b of DB.all("budgets")) if (b.categoryId === id) DB.update("budgets", b.id, { categoryId: null });
    for (const r of DB.all("recurringExpenses")) if (r.categoryId === id) DB.update("recurringExpenses", r.id, { categoryId: null });
    DB.delete("categories", id);
  },
};

export const Transactions = {
  all: () => [...DB.all("transactions")].sort((a, b) => new Date(b.date) - new Date(a.date)),
  get: (id) => DB.get("transactions", id),
  create: (data) => DB.insert("transactions", data),
  update: (id, patch) => DB.update("transactions", id, patch),
  remove(id) {
    // Si cette transaction est le règlement enregistré d'une charge/revenu récurrent, la
    // charge redevient "due" : on peut corriger une erreur en supprimant simplement la
    // transaction, plutôt que par un écran d'historique séparé.
    for (const r of DB.all("recurringExpenses")) {
      if (r.lastPaidTransactionId === id) {
        DB.update("recurringExpenses", r.id, { lastPaidPeriod: null, lastPaidTransactionId: null });
      }
    }
    // Même principe pour un remboursement de dette lié à cette transaction : le montant
    // redevient dû si la transaction est supprimée directement depuis l'onglet Transactions.
    for (const d of DB.all("debts")) {
      const repayment = (d.repayments || []).find((r) => r.transactionId === id);
      if (repayment) {
        const repayments = d.repayments.filter((r) => r.id !== repayment.id);
        const remainingAmount = d.amount - repayments.reduce((sum, r) => sum + r.amount, 0);
        DB.update("debts", d.id, { remainingAmount, repayments });
      }
    }
    DB.delete("transactions", id);
  },
};

export const Budgets = {
  all: () => DB.all("budgets"),
  get: (id) => DB.get("budgets", id),
  forMonth: (month, year) => DB.all("budgets").filter((b) => b.month === month && b.year === year),
  create: (data) => DB.insert("budgets", { notifiedLevel: null, ...data }),
  update: (id, patch) => DB.update("budgets", id, patch),
  remove: (id) => DB.delete("budgets", id),
};

// "Transactions récurrentes" : charges fixes (loyer, internet...) ET revenus récurrents
// (salaire...). Le nom de la collection ("recurringExpenses") est historique mais couvre
// désormais les deux sens via le champ `type` ("expense" par défaut pour les entrées créées
// avant l'ajout des revenus récurrents).
export const RecurringExpenses = {
  all: () => [...DB.all("recurringExpenses")].sort((a, b) => a.dueDay - b.dueDay),
  byType: (type) => RecurringExpenses.all().filter((r) => (r.type || "expense") === type),
  get: (id) => DB.get("recurringExpenses", id),
  create: (data) => DB.insert("recurringExpenses", { isActive: true, lastPaidPeriod: null, lastPaidTransactionId: null, lastNotifiedPeriod: null, reminderDays: 3, type: "expense", ...data }),
  update: (id, patch) => DB.update("recurringExpenses", id, patch),
  remove: (id) => DB.delete("recurringExpenses", id),
};

export const Goals = {
  all: () => [...DB.all("goals")].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
  get: (id) => DB.get("goals", id),
  create: (data) => DB.insert("goals", { currentAmount: 0, contributions: [], targetDate: null, ...data }),
  update: (id, patch) => DB.update("goals", id, patch),
  remove: (id) => DB.delete("goals", id),
  addContribution(id, { amount, accountId, note, transactionId }) {
    const goal = DB.get("goals", id);
    if (!goal) return null;
    const contribution = { id: uuid(), amount, accountId: accountId || null, transactionId: transactionId || null, note: note || "", date: new Date().toISOString() };
    const contributions = [...(goal.contributions || []), contribution];
    DB.update("goals", id, { currentAmount: goal.currentAmount + amount, contributions });
    return contribution;
  },
  /** amount négatif pour un retrait. */
  withdraw(id, { amount, accountId, note, transactionId }) {
    return Goals.addContribution(id, { amount: -Math.abs(amount), accountId, note, transactionId });
  },
  /** Corrige le montant/la note d'un versement déjà enregistré (recalcule le total du coffre). */
  updateContribution(goalId, contributionId, patch) {
    const goal = DB.get("goals", goalId);
    if (!goal) return null;
    const contributions = (goal.contributions || []).map((c) => (c.id === contributionId ? { ...c, ...patch } : c));
    const currentAmount = contributions.reduce((sum, c) => sum + c.amount, 0);
    DB.update("goals", goalId, { currentAmount, contributions });
    return contributions.find((c) => c.id === contributionId) || null;
  },
  /** Supprime un versement (et, s'il était lié à un compte, sa transaction associée). */
  removeContribution(goalId, contributionId) {
    const goal = DB.get("goals", goalId);
    if (!goal) return;
    const removed = (goal.contributions || []).find((c) => c.id === contributionId);
    const contributions = (goal.contributions || []).filter((c) => c.id !== contributionId);
    const currentAmount = contributions.reduce((sum, c) => sum + c.amount, 0);
    DB.update("goals", goalId, { currentAmount, contributions });
    if (removed?.transactionId) DB.delete("transactions", removed.transactionId);
  },
};

// "Dettes" : ce que des tiers vous doivent ("owedToMe") et ce que vous devez à des tiers
// ("iOwe"). Fonctionne comme les objectifs : un montant initial, un historique de
// remboursements, et un solde restant recalculé à chaque mouvement.
export const Debts = {
  all: () => [...DB.all("debts")].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
  byType: (type) => Debts.all().filter((d) => d.type === type),
  get: (id) => DB.get("debts", id),
  create: (data) => DB.insert("debts", { repayments: [], dueDate: null, reason: "", notifiedOverdue: false, remainingAmount: data.amount, ...data }),
  update: (id, patch) => DB.update("debts", id, patch),
  remove: (id) => DB.delete("debts", id),
  /** amount toujours positif : réduit le solde restant. */
  addRepayment(id, { amount, accountId, note, transactionId }) {
    const debt = DB.get("debts", id);
    if (!debt) return null;
    const repayment = { id: uuid(), amount, accountId: accountId || null, transactionId: transactionId || null, note: note || "", date: new Date().toISOString() };
    const repayments = [...(debt.repayments || []), repayment];
    const remainingAmount = debt.remainingAmount - amount;
    DB.update("debts", id, { remainingAmount, repayments });
    return repayment;
  },
  updateRepayment(debtId, repaymentId, patch) {
    const debt = DB.get("debts", debtId);
    if (!debt) return null;
    const repayments = (debt.repayments || []).map((r) => (r.id === repaymentId ? { ...r, ...patch } : r));
    const remainingAmount = debt.amount - repayments.reduce((sum, r) => sum + r.amount, 0);
    DB.update("debts", debtId, { remainingAmount, repayments });
    return repayments.find((r) => r.id === repaymentId) || null;
  },
  removeRepayment(debtId, repaymentId) {
    const debt = DB.get("debts", debtId);
    if (!debt) return;
    const removed = (debt.repayments || []).find((r) => r.id === repaymentId);
    const repayments = (debt.repayments || []).filter((r) => r.id !== repaymentId);
    const remainingAmount = debt.amount - repayments.reduce((sum, r) => sum + r.amount, 0);
    DB.update("debts", debtId, { remainingAmount, repayments });
    if (removed?.transactionId) DB.delete("transactions", removed.transactionId);
  },
  /** Marque la dette comme intégralement réglée sans forcément passer par un remboursement
   * chiffré (ex. dette annulée, réglée en dehors de l'app). */
  markSettled: (id) => DB.update("debts", id, { remainingAmount: 0 }),
};
