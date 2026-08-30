import { Settings, applyAppearance } from "../state.js";
import { Security } from "../security.js";
import { icon, renderIcons } from "../components/icon.js";
import { confirmDialog, openPickerSheet, openActionSheet } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import { CURRENCIES } from "../format.js";
import { exportAll, exportTransactionsCsv, importFromFile, deleteAllData } from "../export.js";
import { Notifications } from "../notifications.js";
import { Accounts } from "../db.js";
import { seedDemoDataIfEmpty } from "../seed.js";
import { escapeHtml } from "../util.js";

export const title = "Paramètres";

// La synchro dépend d'un CDN externe (Firebase) : elle est chargée dynamiquement, jamais en
// import statique, pour que l'application reste 100% utilisable hors-ligne même si ce module
// échoue à se charger faute de réseau.
let syncModulePromise = null;
function loadSyncModule() {
  if (!syncModulePromise) syncModulePromise = import("../sync.js").catch(() => null);
  return syncModulePromise;
}

// Mis en cache après la première résolution : la disponibilité biométrique ne change pas en
// cours de session. Ça évite de relancer un `await` (donc un aller-retour asynchrone) à
// chaque render() — important quand une rafale de rendus se déclenche coup sur coup (ex.
// pendant l'insertion des données de démonstration), pour éviter que des rendus concurrents ne
// se terminent dans le désordre.
let biometricAvailablePromise = null;
function loadBiometricAvailable() {
  if (!biometricAvailablePromise) biometricAvailablePromise = Security.isBiometricAvailable();
  return biometricAvailablePromise;
}

const APPEARANCE_OPTIONS = [
  { key: "system", label: "Système" },
  { key: "light", label: "Clair" },
  { key: "dark", label: "Sombre" },
];

const AUTO_LOCK_OPTIONS = [
  { key: "0", label: "Immédiatement" },
  { key: "60", label: "Après 1 minute" },
  { key: "300", label: "Après 5 minutes" },
  { key: "never", label: "Jamais" },
];

let renderGeneration = 0;

export function render(container) {
  const lockEnabled = Security.isLockEnabled();
  const generation = ++renderGeneration;
  renderInner(container, lockEnabled, generation);
}

async function renderInner(container, lockEnabled, generation) {
  const biometricAvailable = await loadBiometricAvailable();
  const biometricEnabled = Security.hasWebAuthnCredential();
  const notificationsSupported = Notifications.isSupported();
  const notificationsEnabled = Notifications.isEnabled();
  const hasNoAccounts = Accounts.all().length === 0;
  const syncModule = await loadSyncModule();
  const syncStatus = syncModule ? syncModule.Sync.getStatus() : null;

  // Un rendu plus récent a déjà été déclenché entre-temps (ex. changement d'état de synchro) :
  // on abandonne celui-ci pour éviter d'écraser un affichage plus à jour avec des données
  // devenues obsolètes pendant les `await` ci-dessus.
  if (generation !== renderGeneration) return;

  container.innerHTML = `
    <div class="view">
      <div>
        <p class="form-section__label">Apparence</p>
        <div class="type-toggle" id="s-appearance" style="display:grid;grid-template-columns:repeat(3,1fr);">
          ${APPEARANCE_OPTIONS.map((o) => `<button data-value="${o.key}">${o.label}</button>`).join("")}
        </div>
      </div>

      <div>
        <p class="form-section__label">Sécurité</p>
        <div class="form-group">
          <div class="form-row" id="s-lock-row" style="cursor:pointer;">
            <span class="form-row__label">${icon("shield")}&nbsp;&nbsp;Protéger l'application</span>
            <button class="toggle ${lockEnabled ? "is-on" : ""}" id="s-lock-toggle"><span class="toggle__knob"></span></button>
          </div>
          ${lockEnabled && biometricAvailable ? `
          <div class="form-row" id="s-bio-row" style="cursor:pointer;">
            <span class="form-row__label">Déverrouillage biométrique</span>
            <button class="toggle ${biometricEnabled ? "is-on" : ""}" id="s-bio-toggle"><span class="toggle__knob"></span></button>
          </div>` : ""}
          ${lockEnabled ? `
          <div class="form-row" id="s-change-pin" style="cursor:pointer;">
            <span class="form-row__label">Modifier le code</span>
            <span class="form-row__chevron">${icon("chevron-right")}</span>
          </div>
          <div class="form-row" id="s-autolock-row" style="cursor:pointer;">
            <span class="form-row__label">Verrouillage automatique</span>
            <span style="display:flex;align-items:center;gap:6px;color:var(--text-secondary);">
              <span id="s-autolock-label"></span>
              <span class="form-row__chevron">${icon("chevron-right")}</span>
            </span>
          </div>` : ""}
        </div>
        <p class="form-section__footer">Utilise ${biometricAvailable ? "la biométrie de l'appareil ou " : ""}un code à 4 chiffres pour déverrouiller Finance à l'ouverture.</p>
      </div>

      <div>
        <p class="form-section__label">Notifications</p>
        <div class="form-group">
          <div class="form-row" id="s-notif-row" style="${notificationsSupported ? "cursor:pointer;" : ""}">
            <span class="form-row__label">${icon("bell")}&nbsp;&nbsp;Rappels d'échéances</span>
            <button class="toggle ${notificationsEnabled ? "is-on" : ""}" id="s-notif-toggle" ${notificationsSupported ? "" : "disabled"}><span class="toggle__knob"></span></button>
          </div>
        </div>
        <p class="form-section__footer">${notificationsSupported
          ? "Recevez une notification quand une charge fixe ou un revenu récurrent approche de son échéance, qu'un budget atteint 70% ou est dépassé, ou qu'une dette passe en retard. Sur iPhone, ceci nécessite iOS 16.4+ et que l'app ait été ajoutée à l'écran d'accueil."
          : "Les notifications ne sont pas prises en charge par ce navigateur."}</p>
      </div>

      <div>
        <p class="form-section__label">Synchronisation entre appareils</p>
        ${syncStatus === null ? `
        <div class="form-group"><div class="form-row"><span class="form-row__label" style="color:var(--text-secondary);">Indisponible hors-ligne</span></div></div>
        <p class="form-section__footer">La synchronisation nécessite une connexion internet. Réessayez une fois en ligne.</p>
        ` : syncStatus.isConnected ? `
        <div class="form-group">
          ${syncStatus.displayName ? `<div class="form-row"><span class="form-row__label">Nom</span><span style="color:var(--text-secondary);">${escapeHtml(syncStatus.displayName)}</span></div>` : ""}
          <div class="form-row"><span class="form-row__label">Adresse mail</span><span style="color:var(--text-secondary);">${escapeHtml(syncStatus.email || "")}</span></div>
          <div class="form-row"><span class="form-row__label">Dernière synchro</span><span style="color:var(--text-secondary);">${syncStatus.lastSyncedAt ? relativeTime(syncStatus.lastSyncedAt) : "Jamais"}</span></div>
          <div class="form-row form-row--link" id="s-sync-now" style="cursor:pointer;"><span class="form-row__label">${icon("refresh-cw")}&nbsp;&nbsp;Synchroniser maintenant</span></div>
          <div class="form-row form-row--danger" id="s-sync-disconnect" style="cursor:pointer;"><span class="form-row__label">${icon("log-out")}&nbsp;&nbsp;Se déconnecter</span></div>
        </div>
        <p class="form-section__footer">Vos données se synchronisent automatiquement en arrière-plan sur tous les appareils connectés avec le même compte.</p>
        ` : `
        <div class="form-group">
          <div class="form-row"><input id="s-sync-email" type="email" placeholder="Adresse mail" style="text-align:left;" /></div>
          <div class="form-row"><input id="s-sync-pw" type="password" placeholder="Mot de passe" style="text-align:left;" /></div>
        </div>
        <button class="btn btn--primary mt-16" id="s-sync-connect" style="width:100%;">Se connecter</button>
        <p id="s-sync-error" class="error-text" hidden></p>
        <p class="form-section__footer">Reconnectez-vous avec l'adresse mail et le mot de passe de votre compte pour reprendre la synchronisation. Vos données transitent alors par un service externe (Firebase/Google), chiffrées, uniquement pour cette synchronisation.</p>
        `}
      </div>

      <div>
        <p class="form-section__label">Devise</p>
        <div class="form-group">
          <div class="form-row"><span class="form-row__label">Devise principale</span><span style="color:var(--text-secondary);">FCFA</span></div>
          ${["eur", "usd", "mad", "gbp"].map((c) => `<div class="form-row"><span class="form-row__label" style="color:var(--text-secondary);">${CURRENCIES[c].name}</span><span style="color:var(--text-tertiary);font-size:13px;">Bientôt disponible</span></div>`).join("")}
        </div>
        <p class="form-section__footer">D'autres devises pourront être ajoutées ultérieurement, sans conversion automatique dans cette version.</p>
      </div>

      <div>
        <p class="form-section__label">Données</p>
        <div class="form-group">
          <div class="form-row form-row--link" id="s-export" style="cursor:pointer;"><span class="form-row__label">${icon("upload")}&nbsp;&nbsp;Exporter les données (JSON)</span></div>
          <div class="form-row form-row--link" id="s-export-csv" style="cursor:pointer;"><span class="form-row__label">${icon("file-spreadsheet")}&nbsp;&nbsp;Exporter les transactions (CSV)</span></div>
          <div class="form-row form-row--link" id="s-import" style="cursor:pointer;"><span class="form-row__label">${icon("download")}&nbsp;&nbsp;Importer les données</span></div>
          <div class="form-row form-row--danger" id="s-delete-all" style="cursor:pointer;"><span class="form-row__label">${icon("trash-2")}&nbsp;&nbsp;Supprimer toutes les données</span></div>
          ${hasNoAccounts ? `<div class="form-row form-row--link" id="s-load-demo" style="cursor:pointer;"><span class="form-row__label">${icon("sparkles")}&nbsp;&nbsp;Charger des données de démonstration</span></div>` : ""}
        </div>
        <input type="file" id="s-import-input" accept="application/json" hidden />
      </div>

      <p id="s-status" class="status-text" hidden></p>

      <div class="form-row" style="justify-content:space-between;color:var(--text-secondary);">
        <span>Version</span><span>1.0.0</span>
      </div>
    </div>
  `;

  renderIcons(container);
  wireEvents(container, lockEnabled, syncModule?.Sync);
}

function showStatus(container, message, isError) {
  const el = container.querySelector("#s-status");
  el.hidden = false;
  el.textContent = message;
  el.style.color = isError ? "var(--red)" : "var(--green)";
}

function wireEvents(container, lockEnabled, Sync) {
  const appearanceToggle = container.querySelector("#s-appearance");
  const current = Settings.getAppearance();
  appearanceToggle.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.value === current));
  appearanceToggle.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      Settings.setAppearance(b.dataset.value);
      appearanceToggle.querySelectorAll("button").forEach((btn) => btn.classList.toggle("is-active", btn === b));
    })
  );

  // Le bouton bascule (.toggle) est petit : on rend toute la ligne cliquable (zone tactile
  // ≥ 44px de haut) plutôt que de se limiter à ses 30px de hauteur visuelle.
  container.querySelector("#s-lock-row").addEventListener("click", () => handleLockToggle(container, lockEnabled));

  const notifRow = container.querySelector("#s-notif-row");
  const notifToggle = container.querySelector("#s-notif-toggle");
  if (notifRow && notifToggle && !notifToggle.disabled) {
    notifRow.addEventListener("click", () => handleNotificationsToggle(container));
  }

  const bioRow = container.querySelector("#s-bio-row");
  if (bioRow) bioRow.addEventListener("click", () => handleBiometricToggle(container));

  const changePin = container.querySelector("#s-change-pin");
  if (changePin) changePin.addEventListener("click", () => openPinCreation(container, "Le code a été modifié."));

  const autoLockRow = container.querySelector("#s-autolock-row");
  if (autoLockRow) {
    const label = container.querySelector("#s-autolock-label");
    label.textContent = AUTO_LOCK_OPTIONS.find((o) => o.key === Security.getAutoLockDelay())?.label || AUTO_LOCK_OPTIONS[0].label;
    autoLockRow.addEventListener("click", () => {
      openPickerSheet({
        title: "Verrouillage automatique",
        selectedValue: Security.getAutoLockDelay(),
        options: AUTO_LOCK_OPTIONS.map((o) => ({ value: o.key, label: o.label })),
        onSelect: (value) => {
          Security.setAutoLockDelay(value);
          label.textContent = AUTO_LOCK_OPTIONS.find((o) => o.key === value)?.label || "";
        },
      });
    });
  }

  container.querySelector("#s-export").addEventListener("click", () => {
    try {
      exportAll();
      showStatus(container, "Export généré : le téléchargement a démarré.", false);
    } catch (e) {
      showStatus(container, "Erreur lors de l'export : " + e.message, true);
    }
  });

  container.querySelector("#s-export-csv").addEventListener("click", () => {
    try {
      exportTransactionsCsv();
      showStatus(container, "Export CSV généré : le téléchargement a démarré.", false);
    } catch (e) {
      showStatus(container, "Erreur lors de l'export : " + e.message, true);
    }
  });

  const importInput = container.querySelector("#s-import-input");
  container.querySelector("#s-import").addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async () => {
    const file = importInput.files[0];
    importInput.value = "";
    if (!file) return;
    try {
      await importFromFile(file);
      showStatus(container, "Import réussi.", false);
      showToast("Import réussi");
    } catch (e) {
      showStatus(container, e.message, true);
    }
  });

  container.querySelector("#s-delete-all").addEventListener("click", () => {
    confirmDialog({
      title: "Supprimer toutes les données ?",
      message: "Cette action supprimera tous vos comptes, transactions, catégories et budgets. Elle est irréversible.",
      confirmLabel: "Supprimer définitivement",
      onConfirm: () => {
        deleteAllData();
        showToast("Toutes les données ont été supprimées.");
        showStatus(container, "Toutes les données ont été supprimées.", false);
      },
    });
  });

  const loadDemoBtn = container.querySelector("#s-load-demo");
  if (loadDemoBtn) {
    loadDemoBtn.addEventListener("click", () => {
      seedDemoDataIfEmpty();
      showToast("Données de démonstration chargées");
      showStatus(container, "Données de démonstration chargées.", false);
    });
  }

  if (Sync) wireSyncEvents(container, Sync);
}

function wireSyncEvents(container, Sync) {
  const connectBtn = container.querySelector("#s-sync-connect");
  if (connectBtn) {
    connectBtn.addEventListener("click", async () => {
      const errorEl = container.querySelector("#s-sync-error");
      errorEl.hidden = true;
      const email = container.querySelector("#s-sync-email").value;
      const password = container.querySelector("#s-sync-pw").value;
      connectBtn.disabled = true;
      connectBtn.textContent = "Connexion...";
      try {
        const result = await Sync.logIn(email, password);
        if (result.needsReconciliation) {
          promptReconciliation(result, Sync, container);
        } else {
          showToast("Synchronisation activée");
          render(container); // rendu explicite : ne dépend pas de l'ordre d'arrivée des notifyStatus()
        }
      } catch (e) {
        errorEl.textContent = e.message || "Une erreur est survenue.";
        errorEl.hidden = false;
      } finally {
        connectBtn.disabled = false;
        connectBtn.textContent = "Se connecter";
      }
    });
  }

  const syncNowBtn = container.querySelector("#s-sync-now");
  if (syncNowBtn) {
    syncNowBtn.addEventListener("click", async () => {
      try {
        await Sync.syncNow();
        showToast("Synchronisé");
        render(container);
      } catch (e) {
        showToast("Échec de la synchronisation : " + (e.message || "erreur inconnue"));
      }
    });
  }

  const disconnectBtn = container.querySelector("#s-sync-disconnect");
  if (disconnectBtn) {
    disconnectBtn.addEventListener("click", () => {
      confirmDialog({
        title: "Se déconnecter de votre compte ?",
        message: "Vos données resteront sur cet appareil, mais ne se synchroniseront plus tant que vous ne vous reconnectez pas. On vous redemandera votre adresse mail et votre mot de passe au prochain lancement de l'application.",
        confirmLabel: "Se déconnecter",
        onConfirm: async () => {
          await Sync.disconnect();
          showToast("Déconnecté de la synchronisation");
          render(container);
        },
      });
    });
  }
}

function promptReconciliation({ cloudSummary, localSummary }, Sync, container) {
  openActionSheet({
    title: "Des données existent déjà en ligne pour ce compte",
    actions: [
      {
        label: `Récupérer les données du cloud (${cloudSummary.accounts} comptes, ${cloudSummary.transactions} transactions)`,
        icon: "download",
        onClick: async () => {
          await Sync.resolveReconciliation("pull");
          showToast("Données récupérées depuis le cloud");
          render(container);
        },
      },
      {
        label: `Envoyer mes données locales (${localSummary.accounts} comptes, ${localSummary.transactions} transactions)`,
        icon: "upload",
        destructive: true,
        onClick: async () => {
          await Sync.resolveReconciliation("push");
          showToast("Données locales envoyées vers le cloud");
          render(container);
        },
      },
      {
        label: "Annuler",
        icon: "x",
        onClick: () => { Sync.cancelReconciliation(); render(container); },
      },
    ],
  });
}

async function handleNotificationsToggle(container) {
  if (Notifications.isEnabled()) {
    Notifications.disable();
    showToast("Notifications désactivées");
    render(container);
    return;
  }
  const result = await Notifications.requestPermission();
  if (result === "granted") {
    showToast("Notifications activées");
  } else if (result === "denied") {
    showToast("Autorisation refusée par le navigateur");
  }
  render(container);
}

function handleLockToggle(container, lockEnabled) {
  if (lockEnabled) {
    Security.setLockEnabled(false);
    render(container);
    return;
  }
  openPinCreation(container, "Protection activée.", () => {
    Security.setLockEnabled(true);
    render(container);
  });
}

function openPinCreation(container, successMessage, afterSuccess) {
  import("./pinpad.js").then(({ openPinPad }) => {
    openPinPad({
      mode: "create",
      onSuccess: async () => {
        showToast(successMessage);
        if (afterSuccess) afterSuccess();
        else render(container);

        const biometricAvailable = await Security.isBiometricAvailable();
        if (biometricAvailable && !Security.hasWebAuthnCredential()) {
          confirmDialog({
            title: "Déverrouillage rapide ?",
            message: `Voulez-vous aussi activer ${Security.isLockEnabled() ? "la biométrie de votre appareil" : "la biométrie"} pour déverrouiller Finance plus vite ?`,
            confirmLabel: "Activer",
            cancelLabel: "Plus tard",
            destructive: false,
            onConfirm: () => handleBiometricToggle(container),
          });
        }
      },
    });
  });
}

async function handleBiometricToggle(container) {
  if (Security.hasWebAuthnCredential()) {
    Security.clearWebAuthnCredential();
    showToast("Déverrouillage biométrique désactivé");
    render(container);
    return;
  }
  try {
    await Security.registerBiometric();
    showToast("Déverrouillage biométrique activé");
  } catch (e) {
    showToast("Échec de l'activation biométrique");
  }
  render(container);
}

function relativeTime(timestamp) {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 10) return "à l'instant";
  if (seconds < 60) return `il y a ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return `il y a ${days} j`;
}
