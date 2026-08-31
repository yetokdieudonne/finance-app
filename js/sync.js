// Synchronisation entre appareils via Firebase (Auth + Firestore). Contrairement au reste de
// l'application, ce module envoie des données à un service externe (Google) — uniquement
// lorsque l'utilisateur possède un compte (obligatoire, voir app.js/runAccountGate).
//
// Modèle : nom, prénom, adresse mail et mot de passe choisis par l'utilisateur servent de compte
// Firebase Auth (email réel — nom/prénom stockés comme `displayName` du profil, donc disponibles
// sur tout appareil connecté au même compte sans stockage local séparé). Toutes les données
// locales (comptes, transactions, catégories, budgets, charges récurrentes, objectifs, dettes)
// sont sérialisées dans un seul document Firestore par utilisateur. Résolution de conflit :
// la version la plus récente (horodatage local) l'emporte.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  increment,
  collection,
  addDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { DB } from "./db.js";
import { Profile } from "./profile.js";

const firebaseConfig = {
  apiKey: "AIzaSyAYpS0ZDwUdptdxpC7O14EaSghXCsMQsdk",
  authDomain: "finance-app-51e3d.firebaseapp.com",
  projectId: "finance-app-51e3d",
  storageBucket: "finance-app-51e3d.firebasestorage.app",
  messagingSenderId: "485766685352",
  appId: "1:485766685352:web:2b20b8dd741055998a589d",
};

const KEY_LAST_SYNCED_AT = "finance.sync.lastSyncedAt";
const PUSH_DEBOUNCE_MS = 2500;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let unsubscribeSnapshot = null;
let unsubscribeDbChange = null;
let pushTimer = null;
let applyingRemote = false; // évite de repousser vers le cloud ce qu'on vient d'en recevoir
let pendingReconciliation = null; // { cloudPayload } en attente d'un choix utilisateur
// Horodatage du dernier changement local (même pas encore poussé). Sert à ignorer l'écho
// Firestore d'un envoi désormais dépassé : sans ce garde-fou, la confirmation serveur d'un
// ancien envoi peut arriver après une modification locale plus récente (ex. modifier une
// transaction juste après l'avoir créée) et l'écraser silencieusement.
let lastLocalChangeAt = 0;
const statusListeners = new Set();

function notifyStatus() {
  const status = Sync.getStatus();
  for (const fn of statusListeners) fn(status);
}

function docRef(uid) {
  return doc(db, "users", uid, "sync", "data");
}

function snapshotLocalState() {
  const state = {};
  for (const collection of DB.COLLECTIONS) state[collection] = DB.all(collection);
  state.profilePhoto = Profile.getPhoto() || null;
  return state;
}

function applyRemoteState(state) {
  applyingRemote = true;
  try {
    for (const collection of DB.COLLECTIONS) {
      DB.replaceAll(collection, Array.isArray(state[collection]) ? state[collection] : []);
    }
    if (state.profilePhoto) Profile.setPhoto(state.profilePhoto);
    else Profile.removePhoto();
  } finally {
    applyingRemote = false;
  }
}

function summarize(state) {
  return {
    accounts: state.accounts?.length || 0,
    transactions: state.transactions?.length || 0,
    debts: state.debts?.length || 0,
    goals: state.goals?.length || 0,
  };
}

async function pushToCloud() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const payloadJson = JSON.stringify(snapshotLocalState());
  await setDoc(docRef(uid), {
    payloadJson,
    updatedAtLocal: Date.now(),
    updatedAt: serverTimestamp(),
  });
  localStorage.setItem(KEY_LAST_SYNCED_AT, String(Date.now()));
  notifyStatus();
}

function schedulePush() {
  if (applyingRemote) return; // ce changement vient d'une réception distante : ne pas rebalancer
  if (!auth.currentUser) return;
  lastLocalChangeAt = Date.now();
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushToCloud().catch((e) => console.warn("Échec de synchronisation (envoi) :", e));
  }, PUSH_DEBOUNCE_MS);
}

function startListening() {
  stopListening();
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  unsubscribeSnapshot = onSnapshot(docRef(uid), (snap) => {
    if (!snap.exists() || snap.metadata.hasPendingWrites) return;
    const data = snap.data();
    // Écho tardif d'un envoi désormais dépassé par un changement local plus récent : ignorer.
    if (typeof data.updatedAtLocal === "number" && data.updatedAtLocal < lastLocalChangeAt) return;
    try {
      const state = JSON.parse(data.payloadJson);
      applyRemoteState(state);
      localStorage.setItem(KEY_LAST_SYNCED_AT, String(Date.now()));
      notifyStatus();
    } catch (e) {
      console.warn("Donnée de synchro illisible :", e);
    }
  });
  unsubscribeDbChange = DB.onChange(schedulePush);
}

function stopListening() {
  if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
  if (unsubscribeDbChange) { unsubscribeDbChange(); unsubscribeDbChange = null; }
  clearTimeout(pushTimer);
}

export const Sync = {
  onStatusChange(fn) {
    statusListeners.add(fn);
    return () => statusListeners.delete(fn);
  },

  getStatus() {
    const lastSyncedAt = localStorage.getItem(KEY_LAST_SYNCED_AT);
    const user = auth.currentUser;
    return {
      // Tant qu'un choix de réconciliation est en attente, on ne se considère pas encore
      // "connecté" côté interface (le formulaire de connexion reste affiché sous la boîte de
      // dialogue de choix).
      isConnected: !!user && !pendingReconciliation,
      email: user?.email || null,
      displayName: user?.displayName || null,
      lastSyncedAt: lastSyncedAt ? Number(lastSyncedAt) : null,
      pendingReconciliation: !!pendingReconciliation,
    };
  },

  /** Crée un nouveau compte. Échoue si l'adresse mail est déjà utilisée (l'appelant doit alors
   * proposer de se connecter à la place via `logIn`). */
  async signUp({ firstName, lastName, email, password }) {
    const first = (firstName || "").trim();
    const last = (lastName || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();
    if (!first || !last) throw new Error("Le nom et le prénom sont requis.");
    if (!cleanEmail) throw new Error("Adresse mail invalide.");
    if (!password || password.length < 6) throw new Error("Le mot de passe doit contenir au moins 6 caractères.");

    try {
      await createUserWithEmailAndPassword(auth, cleanEmail, password);
    } catch (e) {
      throw new Error(friendlyAuthError(e));
    }
    await updateProfile(auth.currentUser, { displayName: `${first} ${last}` });

    // Un compte tout juste créé doit démarrer vide : sans ce nettoyage, des données restées
    // localement (test d'une session précédente, ou compte différent déconnecté sur cet
    // appareil sans effacer ses données) se retrouveraient poussées vers ce nouveau compte.
    DB.clearAll();
    Profile.removePhoto();

    await pushToCloud();
    startListening();
    notifyStatus();

    // Compteur global (nombre de comptes créés) pour le tableau de bord admin du site vitrine.
    // Volontairement séparé des données de l'utilisateur : ce document ne contient qu'un
    // nombre, jamais de données personnelles ou financières, pour ne pas exposer les
    // documents `users/{uid}` à un rôle admin.
    setDoc(doc(db, "stats", "summary"), { totalAccounts: increment(1) }, { merge: true }).catch(() => {});

    return { needsReconciliation: false };
  },

  /**
   * Connecte un compte existant. Si des données existent déjà dans le cloud, renvoie
   * `needsReconciliation` avec un résumé des deux jeux de données : l'appelant doit alors
   * appeler `resolveReconciliation("pull" | "push")` pour trancher.
   */
  async logIn(emailRaw, password) {
    const email = (emailRaw || "").trim().toLowerCase();
    if (!email) throw new Error("Adresse mail invalide.");
    if (!password) throw new Error("Mot de passe requis.");

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      throw new Error(friendlyAuthError(e));
    }

    const snap = await getDoc(docRef(auth.currentUser.uid));
    if (!snap.exists()) {
      await pushToCloud();
      startListening();
      notifyStatus();
      return { needsReconciliation: false };
    }

    const cloudState = JSON.parse(snap.data().payloadJson);
    pendingReconciliation = { cloudState };
    notifyStatus();
    return {
      needsReconciliation: true,
      cloudSummary: summarize(cloudState),
      localSummary: summarize(snapshotLocalState()),
    };
  },

  /** À appeler après `logIn()` si `needsReconciliation` est vrai. */
  async resolveReconciliation(choice) {
    if (!pendingReconciliation) return;
    const { cloudState } = pendingReconciliation;
    pendingReconciliation = null;
    if (choice === "pull") {
      applyRemoteState(cloudState);
      localStorage.setItem(KEY_LAST_SYNCED_AT, String(Date.now()));
    } else {
      await pushToCloud();
    }
    startListening();
    notifyStatus();
  },

  cancelReconciliation() {
    pendingReconciliation = null;
    signOut(auth);
    notifyStatus();
  },

  async disconnect() {
    stopListening();
    await signOut(auth);
    localStorage.removeItem(KEY_LAST_SYNCED_AT);
    notifyStatus();
  },

  async syncNow() {
    if (!auth.currentUser) return;
    await pushToCloud();
  },

  /** Envoie un message au support (bug, suggestion, question) depuis la page Aide. Écrit dans
   * la même collection Firestore "questions" que le formulaire de contact du site vitrine, pour
   * que l'admin retrouve tout au même endroit. Nom/email pris du compte connecté : pas besoin
   * de les redemander. */
  async submitHelpMessage({ type, message }) {
    const user = auth.currentUser;
    const cleanMessage = (message || "").trim();
    if (!cleanMessage) throw new Error("Le message est requis.");
    if (!user) throw new Error("Vous devez être connecté·e.");

    await addDoc(collection(db, "questions"), {
      name: user.displayName || "",
      email: user.email || "",
      type: type || "question",
      message: cleanMessage,
      status: "open",
      source: "app",
      createdAt: serverTimestamp(),
    });
  },
};

function friendlyAuthError(e) {
  switch (e.code) {
    case "auth/network-request-failed":
      return "Pas de connexion internet. La synchronisation nécessite d'être en ligne.";
    case "auth/too-many-requests":
      return "Trop de tentatives. Réessayez dans quelques minutes.";
    case "auth/weak-password":
      return "Le mot de passe doit contenir au moins 6 caractères.";
    case "auth/invalid-email":
      return "Adresse mail invalide.";
    case "auth/email-already-in-use":
      return "Un compte existe déjà avec cette adresse mail. Connectez-vous plutôt.";
    case "auth/user-not-found":
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "Adresse mail ou mot de passe incorrect.";
    case "auth/permission-denied":
      return "Accès refusé par Firestore : vérifiez que les règles de sécurité ont bien été configurées.";
    default:
      return "Une erreur est survenue (" + e.code + ").";
  }
}

// Reprend automatiquement la synchro si la session Firebase est encore valide (redémarrage
// de l'app, PWA rouverte...).
// `auth.currentUser` reste `null` tant que Firebase n'a pas fini de restaurer la session
// persistée (lecture asynchrone d'IndexedDB) : `authReady` se résout au tout premier appel de
// ce callback, pour que le code appelant (ex. la porte de compte obligatoire) attende cette
// restauration avant de juger qu'aucune session n'est active.
let resolveAuthReady;
export const authReady = new Promise((resolve) => { resolveAuthReady = resolve; });
let authReadyFired = false;

onAuthStateChanged(auth, (user) => {
  if (user) startListening();
  if (!authReadyFired) { authReadyFired = true; resolveAuthReady(); }
  notifyStatus();
});
