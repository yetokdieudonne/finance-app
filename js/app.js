import { DB } from "./db.js";
import { seedDefaultCategories } from "./seed.js";
import { applyAppearance } from "./state.js";
import { Security } from "./security.js";
import { Profile } from "./profile.js";
import { compressImageFile } from "./util.js";
import { renderIcons } from "./components/icon.js";
import { showToast } from "./components/toast.js";
import { openActionSheet, openDrawer, confirmDialog } from "./components/modal.js";
import { checkDueNotifications, openRecurringManager } from "./views/recurring.js";
import { checkBudgetNotifications, openBudgetsManager } from "./views/budgets.js";
import { checkDebtNotifications, openDebtsManager } from "./views/debts.js";

import * as DashboardView from "./views/dashboard.js";
import * as TransactionsView from "./views/transactions.js";
import * as ProjectsView from "./views/projects.js";
import * as StatisticsView from "./views/statistics.js";
import * as SettingsView from "./views/settings.js";
import { openAddEditTransaction } from "./views/transactions.js";
import { openAccountsManager } from "./views/accounts.js";
import { openCategoriesManager } from "./views/categories.js";
import { openGoalsManager } from "./views/goals.js";
import { openHelpPage } from "./views/help.js";

const VIEWS = {
  dashboard: DashboardView,
  transactions: TransactionsView,
  projects: ProjectsView,
  statistics: StatisticsView,
  settings: SettingsView,
};

const viewRoot = document.getElementById("view-root");
const topbar = document.getElementById("topbar");
const topbarTitle = document.getElementById("topbar-title");
const topbarActions = document.getElementById("topbar-actions");
const searchBar = document.getElementById("search-bar");

let currentTab = "dashboard";

function renderCurrentTab() {
  const view = VIEWS[currentTab];
  topbar.hidden = !view.title;
  viewRoot.classList.toggle("view-root--no-topbar", !view.title);
  topbarTitle.textContent = view.title;
  topbarActions.innerHTML = "";
  searchBar.hidden = currentTab !== "transactions";

  if (view.getActions) {
    for (const action of view.getActions()) {
      const btn = document.createElement("button");
      btn.className = "icon-btn" + (action.active ? " is-active" : "");
      btn.innerHTML = `<i data-lucide="${action.icon}"></i>`;
      btn.addEventListener("click", action.onClick);
      topbarActions.appendChild(btn);
    }
  }

  view.render(viewRoot);
  renderIcons(viewRoot);
  renderIcons(topbarActions);
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tabbar__item").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === tab);
  });
  viewRoot.scrollTop = 0;
  renderCurrentTab();
}

// L'onglet "Menu" n'est pas une destination comme les autres : il ouvre le tiroir de
// navigation par-dessus l'écran actif, sans changer d'onglet actif ni de contenu affiché.
document.querySelectorAll(".tabbar__item").forEach((btn) => {
  if (btn.dataset.tab === "menu") {
    btn.addEventListener("click", () => openMainDrawer());
  } else {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  }
});

DB.onChange(() => {
  if (VIEWS[currentTab]) renderCurrentTab();
});

// Rafraîchit l'onglet actif quand l'état de la synchronisation change (connexion, synchro
// terminée en arrière-plan...) — surtout utile pour l'écran Paramètres. Import dynamique et
// tolérant à l'échec : la synchro dépend d'un CDN externe, elle ne doit jamais empêcher le
// reste de l'application de fonctionner hors-ligne.
import("./sync.js")
  .then(({ Sync }) => {
    Sync.onStatusChange(() => {
      if (VIEWS[currentTab]) renderCurrentTab();
    });
  })
  .catch(() => {});

// ============ Ajout rapide (bouton +) ============
document.getElementById("fab-add").addEventListener("click", () => {
  openActionSheet({
    title: "Ajouter",
    actions: [
      { label: "Ajouter une dépense", icon: "arrow-up-circle", onClick: () => openAddEditTransaction({ defaultType: "expense" }) },
      { label: "Ajouter un revenu", icon: "arrow-down-circle", onClick: () => openAddEditTransaction({ defaultType: "income" }) },
      { label: "Transférer de l'argent", icon: "arrow-left-right", onClick: () => TransactionsView.openTransferForm() },
    ],
  });
});

// ============ Menu latéral ============
// Ouvert exclusivement via l'onglet "Menu" de la barre du bas (plus d'icône hamburger séparée,
// pour n'avoir qu'un seul point d'entrée). Regroupé en 3 sections : écrans de suivi consultés
// régulièrement, écrans de configuration touchés occasionnellement, et le compte.
function openMainDrawer() {
  openDrawer({
    build(drawer, api) {
      drawer.innerHTML = `
        <div class="drawer__header">
          <button class="drawer__avatar" id="drawer-avatar-btn" aria-label="Photo de profil"><span id="drawer-avatar-initial">F</span></button>
          <div class="drawer__identity">
            <div class="drawer__name" id="drawer-name">Finance</div>
            <div class="drawer__email" id="drawer-email"></div>
          </div>
        </div>
        <input type="file" id="drawer-photo-input" accept="image/*" hidden />
        <div class="drawer__body">
          <p class="drawer__section-label">Suivi</p>
          <button class="drawer__item" data-item="statistics"><i data-lucide="bar-chart-3"></i>Statistiques</button>
          <button class="drawer__item" data-item="accounts"><i data-lucide="credit-card"></i>Comptes</button>
          <button class="drawer__item" data-item="goals"><i data-lucide="target"></i>Objectifs &amp; coffres</button>
          <button class="drawer__item" data-item="budgets"><i data-lucide="pie-chart"></i>Budgets</button>
          <button class="drawer__item" data-item="debts"><i data-lucide="users"></i>Dettes</button>
          <p class="drawer__section-label">Configuration</p>
          <button class="drawer__item" data-item="categories"><i data-lucide="tag"></i>Catégories</button>
          <button class="drawer__item" data-item="recurring"><i data-lucide="repeat"></i>Transactions récurrentes</button>
          <p class="drawer__section-label">Application</p>
          <button class="drawer__item" data-item="help"><i data-lucide="life-buoy"></i>Aide</button>
          <button class="drawer__item" data-item="settings"><i data-lucide="settings"></i>Paramètres</button>
          <button class="drawer__item drawer__item--danger" data-item="disconnect"><i data-lucide="log-out"></i>Se déconnecter</button>
        </div>
        <div class="drawer__footer">Finance</div>
      `;

      const openers = {
        statistics: () => switchTab("statistics"),
        accounts: openAccountsManager,
        categories: openCategoriesManager,
        recurring: openRecurringManager,
        goals: openGoalsManager,
        budgets: openBudgetsManager,
        debts: openDebtsManager,
        help: openHelpPage,
        settings: () => switchTab("settings"),
        disconnect: () => handleDisconnectFromDrawer(),
      };
      for (const [key, fn] of Object.entries(openers)) {
        drawer.querySelector(`[data-item="${key}"]`).addEventListener("click", () => {
          api.close();
          fn();
        });
      }

      let currentName = "Finance";
      const avatarBtn = drawer.querySelector("#drawer-avatar-btn");
      const photoInput = drawer.querySelector("#drawer-photo-input");

      function renderAvatar() {
        const photo = Profile.getPhoto();
        avatarBtn.innerHTML = photo
          ? `<img src="${photo}" alt="" />`
          : `<span id="drawer-avatar-initial">${(currentName || "F").trim().charAt(0).toUpperCase()}</span>`;
      }
      renderAvatar();

      // Le stockage local de la photo (Profile) ne passe pas par DB.onChange : il faut donc
      // déclencher explicitement un envoi vers le cloud après chaque changement, pour qu'elle
      // se retrouve aussi sur les autres appareils connectés au même compte.
      function pushProfilePhotoChange() {
        import("./sync.js").then(({ Sync }) => Sync.syncNow().catch(() => {})).catch(() => {});
      }

      avatarBtn.addEventListener("click", () => {
        if (Profile.getPhoto()) {
          openActionSheet({
            title: "Photo de profil",
            actions: [
              { label: "Changer la photo", icon: "camera", onClick: () => photoInput.click() },
              {
                label: "Supprimer la photo",
                icon: "trash-2",
                destructive: true,
                onClick: () => {
                  Profile.removePhoto();
                  renderAvatar();
                  pushProfilePhotoChange();
                },
              },
            ],
          });
        } else {
          photoInput.click();
        }
      });

      photoInput.addEventListener("change", async () => {
        const file = photoInput.files[0];
        photoInput.value = "";
        if (!file) return;
        try {
          const dataUrl = await compressImageFile(file, 256, 0.7);
          Profile.setPhoto(dataUrl);
          renderAvatar();
          pushProfilePhotoChange();
        } catch {
          showToast("Impossible de traiter cette image.");
        }
      });

      import("./sync.js")
        .then(({ Sync }) => {
          const status = Sync.getStatus();
          currentName = status.displayName || "";
          drawer.querySelector("#drawer-name").textContent = currentName || "Finance";
          drawer.querySelector("#drawer-email").textContent = status.email || "";
          renderAvatar();
        })
        .catch(() => {});
    },
  });
}

function handleDisconnectFromDrawer() {
  import("./sync.js")
    .then(({ Sync }) => {
      if (!Sync.getStatus().isConnected) return;
      confirmDialog({
        title: "Se déconnecter de votre compte ?",
        message: "Vos données resteront sur cet appareil, mais ne se synchroniseront plus tant que vous ne vous reconnectez pas. On vous redemandera votre adresse mail et votre mot de passe au prochain lancement de l'application.",
        confirmLabel: "Se déconnecter",
        onConfirm: async () => {
          await Sync.disconnect();
          showToast("Déconnecté de la synchronisation");
        },
      });
    })
    .catch(() => {});
}

// ============ Compte (obligatoire au premier lancement) ============
// Réutilise le système de synchronisation Firebase (Paramètres → Synchronisation) : créer un
// compte ici, c'est s'inscrire à la synchro. Tant que l'utilisateur n'est pas connecté, rien
// d'autre ne s'affiche. Une fois connecté, la session Firebase persiste automatiquement (même
// hors-ligne par la suite) : ce passage ne se reproduit pas aux lancements suivants, sauf
// déconnexion explicite depuis les Paramètres.
const accountGate = document.getElementById("account-gate");
const gateTitle = document.getElementById("gate-title");
const gateSubtitle = document.getElementById("gate-subtitle");
const gateRowLastname = document.getElementById("gate-row-lastname");
const gateRowFirstname = document.getElementById("gate-row-firstname");
const gateRowEmail = document.getElementById("gate-row-email");
const gateRowPassword = document.getElementById("gate-row-password");
const gateLastnameInput = document.getElementById("gate-lastname");
const gateFirstnameInput = document.getElementById("gate-firstname");
const gateEmailInput = document.getElementById("gate-email");
const gatePwInput = document.getElementById("gate-pw");
const gatePwToggleBtn = document.getElementById("gate-pw-toggle");
const gateError = document.getElementById("gate-error");
const gateErrorText = document.getElementById("gate-error-text");
const gateContinueBtn = document.getElementById("gate-continue");
const gateContinueLabel = document.getElementById("gate-continue-label");
const gateToggleHint = document.getElementById("gate-toggle-hint");
const gateToggleModeBtn = document.getElementById("gate-toggle-mode");

let gateMode = "signup"; // "signup" | "login"
let gateOffline = false;

function setGateLoading(isLoading, label) {
  gateContinueBtn.disabled = isLoading;
  gateContinueBtn.classList.toggle("is-loading", isLoading);
  gateContinueLabel.textContent = label;
}

function setGateOfflineState() {
  gateOffline = true;
  gateTitle.textContent = "Connexion internet requise";
  gateSubtitle.textContent = "La création de votre compte nécessite d'être en ligne, au moins pour ce premier lancement.";
  gateRowLastname.hidden = true;
  gateRowFirstname.hidden = true;
  gateRowEmail.hidden = true;
  gateRowPassword.hidden = true;
  gateToggleModeBtn.parentElement.hidden = true;
  gateContinueLabel.textContent = "Réessayer";
}

function setGateFormState() {
  gateOffline = false;
  const isSignup = gateMode === "signup";
  gateTitle.textContent = isSignup ? "Créez votre compte" : "Connectez-vous";
  gateSubtitle.textContent = "Un compte protège vos données et permet de les retrouver sur un autre appareil.";
  gateRowLastname.hidden = !isSignup;
  gateRowFirstname.hidden = !isSignup;
  gateRowEmail.hidden = false;
  gateRowPassword.hidden = false;
  gateContinueLabel.textContent = isSignup ? "Créer mon compte" : "Se connecter";
  gateToggleModeBtn.parentElement.hidden = false;
  gateToggleHint.textContent = isSignup ? "Vous avez déjà un compte ?" : "Pas encore de compte ?";
  gateToggleModeBtn.textContent = isSignup ? "Se connecter" : "Créer un compte";
}

function runAccountGate() {
  return new Promise((resolve) => {
    accountGate.hidden = false;
    renderIcons(accountGate);

    gateToggleModeBtn.onclick = () => {
      gateMode = gateMode === "signup" ? "login" : "signup";
      gateError.hidden = true;
      if (!gateOffline) setGateFormState();
    };

    gatePwToggleBtn.onclick = () => {
      const showing = gatePwInput.type === "text";
      gatePwInput.type = showing ? "password" : "text";
      gatePwToggleBtn.innerHTML = `<i data-lucide="${showing ? "eye" : "eye-off"}"></i>`;
      gatePwToggleBtn.setAttribute("aria-label", showing ? "Afficher le mot de passe" : "Masquer le mot de passe");
      renderIcons(gatePwToggleBtn);
    };

    attempt();

    // Le chargement de sync.js (et du SDK Firebase depuis son CDN) est asynchrone : tant qu'il
    // n'est pas terminé, aucun gestionnaire de clic n'est encore branché sur le bouton. On le
    // désactive pendant ce court chargement pour qu'un clic prématuré ne reste pas sans effet.
    function attempt() {
      setGateLoading(true, "Chargement...");
      import("./sync.js")
        .then(async ({ Sync, authReady }) => {
          await authReady;
          if (Sync.getStatus().isConnected) {
            accountGate.hidden = true;
            resolve();
            return;
          }
          setGateFormState();
          gateError.hidden = true;
          gateContinueBtn.disabled = false;
          gateContinueBtn.classList.remove("is-loading");
          gateContinueBtn.onclick = () => submit(Sync);
        })
        .catch(() => {
          setGateOfflineState();
          gateError.hidden = true;
          gateContinueBtn.disabled = false;
          gateContinueBtn.classList.remove("is-loading");
          gateContinueBtn.onclick = attempt;
        });
    }

    async function submit(Sync) {
      gateError.hidden = true;
      const originalLabel = gateContinueLabel.textContent;
      setGateLoading(true, gateMode === "signup" ? "Création..." : "Connexion...");
      try {
        const result = gateMode === "signup"
          ? await Sync.signUp({
              firstName: gateFirstnameInput.value,
              lastName: gateLastnameInput.value,
              email: gateEmailInput.value,
              password: gatePwInput.value,
            })
          : await Sync.logIn(gateEmailInput.value, gatePwInput.value);
        if (result.needsReconciliation) {
          promptGateReconciliation(Sync, result, () => {
            accountGate.hidden = true;
            resolve();
          }, attempt);
        } else {
          accountGate.hidden = true;
          resolve();
        }
      } catch (e) {
        gateErrorText.textContent = e.message || "Une erreur est survenue.";
        gateError.hidden = false;
      } finally {
        setGateLoading(false, originalLabel);
      }
    }
  });
}

function promptGateReconciliation({ resolveReconciliation, cancelReconciliation }, { cloudSummary, localSummary }, onDone, onCancelled) {
  openActionSheet({
    title: "Des données existent déjà en ligne pour ce compte",
    actions: [
      {
        label: `Récupérer les données du cloud (${cloudSummary.accounts} comptes, ${cloudSummary.transactions} transactions)`,
        icon: "download",
        onClick: async () => { await resolveReconciliation("pull"); onDone(); },
      },
      {
        label: `Envoyer mes données locales (${localSummary.accounts} comptes, ${localSummary.transactions} transactions)`,
        icon: "upload",
        destructive: true,
        onClick: async () => { await resolveReconciliation("push"); onDone(); },
      },
      {
        label: "Annuler",
        icon: "x",
        onClick: () => { cancelReconciliation(); onCancelled(); },
      },
    ],
  });
}

// ============ Verrouillage de l'application ============
const lockScreen = document.getElementById("lock-screen");
const lockUnlockBtn = document.getElementById("lock-unlock-btn");
const lockPinBtn = document.getElementById("lock-pin-btn");
const lockError = document.getElementById("lock-error");

let backgroundedAt = null;
let isUnlocked = false;

async function attemptUnlock() {
  lockError.hidden = true;
  const biometricAvailable = await Security.isBiometricAvailable();
  if (biometricAvailable && Security.hasWebAuthnCredential()) {
    try {
      const ok = await Security.verifyBiometric();
      if (ok) return unlock();
    } catch (e) {
      // L'utilisateur a annulé ou l'authentification a échoué : proposer le code PIN.
    }
  }
  if (Security.hasPin()) {
    showPinPrompt();
  } else {
    lockError.hidden = false;
    lockError.textContent = "Authentification indisponible sur cet appareil.";
  }
}

function unlock() {
  isUnlocked = true;
  lockScreen.hidden = true;
  appUnlocked = true;
  maybeShowInstallPrompt();
}

function lockApp() {
  if (!Security.isLockEnabled()) return;
  isUnlocked = false;
  lockScreen.hidden = false;
  renderIcons(lockScreen);
}

function showPinPrompt() {
  import("./views/pinpad.js").then(({ openPinPad }) => {
    openPinPad({
      mode: "verify",
      onSuccess: unlock,
    });
  });
}

lockUnlockBtn.addEventListener("click", attemptUnlock);
lockPinBtn.addEventListener("click", showPinPrompt);

function checkAllNotifications() {
  checkDueNotifications();
  checkBudgetNotifications();
  checkDebtNotifications();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    checkAllNotifications();
  }
  if (!Security.isLockEnabled()) return;
  if (document.visibilityState === "hidden") {
    backgroundedAt = Date.now();
  } else if (document.visibilityState === "visible" && backgroundedAt) {
    const delay = Security.getAutoLockDelay();
    const elapsedSeconds = (Date.now() - backgroundedAt) / 1000;
    backgroundedAt = null;
    if (delay === "never") return;
    if (elapsedSeconds >= Number(delay)) {
      lockApp();
    }
  }
});

// ============ Invite à l'installation (PWA) ============
// Sur Android/Chrome/Edge, le navigateur permet de déclencher l'installation par code depuis
// notre propre bouton "Installer" (API beforeinstallprompt, capturée puis rejouée à la
// demande). Sur iOS, Safari ne propose pas cette API : Apple n'autorise l'ajout à l'écran
// d'accueil que via son propre bouton Partager, donc on affiche à la place des instructions.
// Dans les deux cas, un délai minimal entre deux propositions évite de harceler l'utilisateur
// s'il ferme la boîte sans installer.
const INSTALL_PROMPT_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
let deferredInstallPrompt = null;
let appUnlocked = false;

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandaloneDisplay() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function canShowInstallPrompt() {
  const last = Number(localStorage.getItem("installPromptLastShown") || 0);
  return Date.now() - last > INSTALL_PROMPT_COOLDOWN_MS;
}

function maybeShowInstallPrompt() {
  if (!appUnlocked || isStandaloneDisplay() || !canShowInstallPrompt()) return;

  if (deferredInstallPrompt) {
    localStorage.setItem("installPromptLastShown", String(Date.now()));
    confirmDialog({
      title: "Installer Finance ?",
      message: "Ajoutez l'application à votre écran d'accueil pour l'ouvrir en un tap, comme une vraie application, même hors connexion.",
      confirmLabel: "Installer",
      cancelLabel: "Plus tard",
      destructive: false,
      onConfirm: async () => {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
      },
    });
  } else if (isIosDevice()) {
    localStorage.setItem("installPromptLastShown", String(Date.now()));
    confirmDialog({
      title: "Installer Finance ?",
      message: "Appuyez sur le bouton Partager de Safari (carré avec une flèche), puis sur « Sur l'écran d'accueil ». L'app s'ouvrira ensuite en un tap, comme une vraie application.",
      confirmLabel: "Compris",
      cancelLabel: "Plus tard",
      destructive: false,
      onConfirm: () => {},
    });
  }
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  maybeShowInstallPrompt();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
});

// ============ Initialisation ============
async function init() {
  applyAppearance();
  seedDefaultCategories();
  // Les données de démonstration ne sont plus injectées automatiquement (elles pollueraient
  // les données réelles d'un utilisateur au premier lancement) : disponibles sur demande via
  // Paramètres → Données → "Charger des données de démonstration".

  await runAccountGate();

  if (Security.isLockEnabled()) {
    lockScreen.hidden = false;
    lockPinBtn.hidden = !Security.hasPin();
    renderIcons(lockScreen);
    const biometricAvailable = await Security.isBiometricAvailable();
    if (!biometricAvailable || !Security.hasWebAuthnCredential()) {
      if (Security.hasPin()) {
        showPinPrompt();
      } else {
        attemptUnlock();
      }
    } else {
      attemptUnlock();
    }
  } else {
    unlock();
    lockScreen.hidden = true;
  }

  switchTab("dashboard");
  checkAllNotifications();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
}

init();

export { switchTab, renderCurrentTab, lockApp };
