// Formatage des montants et des dates (locale française, devise FCFA par défaut).

export const CURRENCIES = {
  fcfa: { symbol: "FCFA", name: "Franc CFA", decimals: false },
  eur: { symbol: "€", name: "Euro", decimals: true },
  usd: { symbol: "$", name: "Dollar US", decimals: true },
  mad: { symbol: "DH", name: "Dirham marocain", decimals: true },
  gbp: { symbol: "£", name: "Livre sterling", decimals: true },
};

function numberFormatter(currencyCode) {
  const currency = CURRENCIES[currencyCode] || CURRENCIES.fcfa;
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: currency.decimals ? 2 : 0,
  });
}

export function formatAmount(amount, currencyCode = "fcfa") {
  const currency = CURRENCIES[currencyCode] || CURRENCIES.fcfa;
  const formatted = numberFormatter(currencyCode).format(Math.abs(amount) < 1e-9 ? 0 : amount);
  return `${formatted} ${currency.symbol}`;
}

export function formatSignedAmount(amount, currencyCode = "fcfa") {
  const sign = amount < 0 ? "-" : "+";
  return `${sign}${formatAmount(Math.abs(amount), currencyCode)}`;
}

/** Comme formatAmount, mais abrège en millions à partir de 1 000 000 (1 320 000 -> "1,32 M
 * FCFA"). Réservé aux montants "coup d'œil" (soldes, totaux) — jamais aux transactions
 * individuelles ni aux champs de saisie, où le montant exact doit rester visible. */
export function formatCompactAmount(amount, currencyCode = "fcfa") {
  const currency = CURRENCIES[currencyCode] || CURRENCIES.fcfa;
  if (Math.abs(amount) >= 1_000_000) {
    const millions = amount / 1_000_000;
    const formatted = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(millions);
    return `${formatted} M ${currency.symbol}`;
  }
  return formatAmount(amount, currencyCode);
}

// Parse une saisie clavier ("12500", "12 500,50") vers un nombre, ou null si invalide.
export function parseAmount(text) {
  if (typeof text !== "string") return null;
  const cleaned = text.trim().replace(/\s| /g, "").replace(",", ".");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

const dayFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });
const dayYearFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const shortDayFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const monthYearFormatter = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

export function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

export function isSameDay(a, b) {
  const d1 = toDate(a), d2 = toDate(b);
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

export function startOfDay(value) {
  const d = toDate(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function startOfMonth(value) {
  const d = toDate(value);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonthExclusive(value) {
  const d = toDate(value);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export function startOfWeek(value) {
  const d = startOfDay(value);
  const day = (d.getDay() + 6) % 7; // lundi = 0
  d.setDate(d.getDate() - day);
  return d;
}

export function startOfYear(value) {
  const d = toDate(value);
  return new Date(d.getFullYear(), 0, 1);
}

export function addDays(value, n) {
  const d = toDate(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function addMonths(value, n) {
  const d = toDate(value);
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function sectionHeaderString(value) {
  const d = toDate(value);
  const now = new Date();
  const formatter = d.getFullYear() === now.getFullYear() ? dayFormatter : dayYearFormatter;
  return formatter.format(d).toUpperCase();
}

export function shortDateString(value) {
  return shortDayFormatter.format(toDate(value));
}

export function mediumDateString(value) {
  return dayYearFormatter.format(toDate(value));
}

export function monthYearLabel(value) {
  const s = monthYearFormatter.format(toDate(value));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function dateInputValue(value) {
  const d = toDate(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateInputValue(value) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function timeString(value) {
  const d = toDate(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dateTimeInputValue(value) {
  const d = toDate(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeInputValue(value) {
  const [datePart, timePart] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [h, min] = (timePart || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, h, min);
}
