// Préférences d'apparence de l'application (indépendantes des données financières).

const KEY_APPEARANCE = "finance.settings.appearance"; // "system" | "light" | "dark"

export const Settings = {
  getAppearance() {
    return localStorage.getItem(KEY_APPEARANCE) || "system";
  },
  setAppearance(mode) {
    localStorage.setItem(KEY_APPEARANCE, mode);
    applyAppearance(mode);
  },
};

export function applyAppearance(mode = Settings.getAppearance()) {
  const root = document.documentElement;
  if (mode === "light") root.setAttribute("data-theme", "light");
  else if (mode === "dark") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
}
