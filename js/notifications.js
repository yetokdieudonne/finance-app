// Notifications navigateur pour les transactions récurrentes (charges fixes / revenus) qui
// approchent de leur échéance. 100% local : aucune donnée n'est envoyée à un serveur, la
// notification est déclenchée directement par le navigateur.
//
// Limite connue : sur iPhone (Safari), les PWA installées ne supportent les notifications
// que depuis iOS 16.4+, et uniquement lorsque l'app a été ouverte au moins une fois récemment
// (pas de vraie exécution en arrière-plan). Sur Android/desktop, le support est complet.

const KEY_ENABLED = "finance.notifications.enabled";

export const Notifications = {
  isSupported() {
    return typeof Notification !== "undefined";
  },

  permission() {
    return this.isSupported() ? Notification.permission : "unsupported";
  },

  isEnabled() {
    return this.isSupported() && Notification.permission === "granted" && localStorage.getItem(KEY_ENABLED) === "1";
  },

  async requestPermission() {
    if (!this.isSupported()) return "unsupported";
    const result = await Notification.requestPermission();
    localStorage.setItem(KEY_ENABLED, result === "granted" ? "1" : "0");
    return result;
  },

  disable() {
    localStorage.setItem(KEY_ENABLED, "0");
  },

  async notify(title, options = {}) {
    if (!this.isEnabled()) return;
    try {
      if (navigator.serviceWorker) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          reg.showNotification(title, options);
          return;
        }
      }
      new Notification(title, options);
    } catch (e) {
      // Certains navigateurs (ex. iOS hors PWA installée) refusent silencieusement : sans
      // conséquence, l'alerte visuelle dans l'app reste de toute façon disponible.
      console.warn("Notification impossible :", e);
    }
  },
};
