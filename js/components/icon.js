// Aide pour insérer des icônes Lucide (chargées via CDN, voir index.html) dans du HTML généré
// dynamiquement, et bibliothèques d'icônes/couleurs proposées pour comptes et catégories.

export function icon(name, opts = {}) {
  const attrs = [`data-lucide="${name}"`];
  if (opts.class) attrs.push(`class="${opts.class}"`);
  return `<i ${attrs.join(" ")}></i>`;
}

// À appeler après toute insertion de HTML contenant des balises <i data-lucide="...">.
export function renderIcons(root = document) {
  if (window.lucide) window.lucide.createIcons({ nameAttr: "data-lucide", attrs: {}, root });
}

export const CATEGORY_ICONS = [
  "utensils", "car", "home", "cross", "book-open", "wifi",
  "gamepad-2", "shopping-bag", "repeat", "file-text",
  "users", "plane", "more-horizontal",
  "banknote", "laptop", "briefcase", "tag",
  "trending-up", "gift", "shopping-cart", "fuel",
  "paw-print", "heart", "paintbrush", "hammer",
  "graduation-cap", "zap", "droplet", "shirt", "sparkles",
];

export const ACCOUNT_ICONS = [
  "wallet", "banknote", "landmark", "credit-card",
  "smartphone", "briefcase", "circle-dollar-sign", "pie-chart",
  "piggy-bank", "gift",
];

export const PALETTE = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#00C7BE", "#30B0C7",
  "#32ADE6", "#007AFF", "#0A84FF", "#5856D6", "#AF52DE", "#FF2D55",
  "#8E8E93", "#5AC8FA", "#FF6482",
];
