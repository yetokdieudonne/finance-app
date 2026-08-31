# Finance — application web installable (PWA)

Application de gestion des finances personnelles en **FCFA**, utilisable hors-ligne au quotidien
(une connexion est seulement requise au tout premier lancement, pour créer son compte),
installable sur iPhone et Android comme une vraie app. Écrite en HTML/CSS/JavaScript pur (aucun
framework, aucune étape de build) — testable et modifiable entièrement depuis Windows.

## Tester en local

Aucune installation requise à part un serveur de fichiers statique. Depuis ce dossier :

```bash
python -m http.server 8080
```

puis ouvrez `http://localhost:8080` dans votre navigateur.

(N'importe quel autre serveur statique fonctionne aussi : `npx serve`, l'extension VS Code
"Live Server", etc. Ouvrir `index.html` directement via `file://` ne fonctionne **pas** :
les modules JavaScript et le service worker exigent un vrai serveur http.)

## Installer sur votre iPhone

1. Déployez le dossier sur un hébergement gratuit (voir ci-dessous) pour obtenir une URL
   `https://...`.
2. Ouvrez cette URL dans **Safari** sur l'iPhone.
3. Appuyez sur le bouton Partager (carré avec flèche) puis **"Sur l'écran d'accueil"**.
4. L'app apparaît avec sa propre icône et s'ouvre en plein écran, sans barre d'adresse.

Fonctionne aussi sur Android via Chrome ("Ajouter à l'écran d'accueil" / bannière d'installation
automatique). Sur Android/Chrome/Edge, une fois connecté à son compte, l'app propose elle-même
d'installer via une boîte de dialogue ("Installer" déclenche l'installation directement, sans
passer par le menu du navigateur) — proposition qui ne revient pas avant 3 jours si elle est
ignorée, et jamais si l'app est déjà installée. Sur iPhone, Apple n'autorisant pas ce
déclenchement par code, l'app affiche à la place les instructions ci-dessus au premier lancement.

## Déployer gratuitement (aucune carte bancaire requise)

L'option la plus simple depuis Windows, sans rien installer :

1. Allez sur **https://app.netlify.com/drop**
2. Glissez-déposez ce dossier entier (`takaFinance`) dans la page
3. Netlify vous donne une URL publique en quelques secondes

Alternatives équivalentes : **GitHub Pages**, **Vercel**, **Cloudflare Pages** — toutes gratuites
et pilotables depuis Windows.

## Ce qui est implémenté

- Tableau de bord : solde total, résumé du mois, échéances à venir, des blocs raccourcis
  **Comptes**, **Objectifs & coffres** et **Dettes** (chacun ouvre sa propre page), dernières
  transactions. Statistiques, Catégories, Budgets, Transactions récurrentes et Paramètres sont
  accessibles via le menu latéral (onglet **Menu** de la barre du bas).
- Barre du bas : **Accueil**, **Transactions**, **Projets**, **Menu**.
- Comptes : liste avec ajout de nouveaux comptes et 10 dernières transactions (tous comptes) en
  bas de la page ; détail d'un compte avec boutons **Ajouter / Déduire** un montant en un tap
  (sans passer par le formulaire complet) et historique complet des opérations. Solde recalculé
  automatiquement, et **ne peut jamais devenir négatif** : toute opération qui ferait passer un
  compte sous zéro (dépense, prêt, remboursement, épargne, charge fixe) est bloquée avec un
  message clair indiquant le montant disponible.
- Transactions : ajout rapide (dépense / revenu), historique groupé par jour, recherche, filtres
  (compte, catégorie, type, période), édition, suppression. Pas de virement entre comptes.
- Catégories par défaut + création / édition / suppression, choix d'icône et de couleur.
- Budgets mensuels par catégorie avec barre de progression, alertes visuelles **et
  notification** à 70% et en cas de dépassement (une fois par palier). Un mois vide propose de
  **reconduire les budgets du mois précédent** (mêmes catégories et montants) en un tap.
- **Transactions récurrentes** : charges fixes (loyer, internet...) et revenus récurrents
  (salaire...), avec jour d'échéance mensuel, alerte visuelle sur l'accueil à l'approche de la
  date, et **notification navigateur** optionnelle (Paramètres → Notifications). "Marquer
  payée/reçue" enregistre automatiquement la transaction correspondante — pour corriger une
  erreur, il suffit de supprimer cette transaction dans l'onglet Transactions, l'échéance
  redevient due.
- **Objectifs / coffres d'épargne** : créez un objectif (achat, projet...), ajoutez ou retirez
  de l'argent au fil du temps, avec historique des versements **modifiable/supprimable** et
  déduction optionnelle d'un compte réel. Une **photo** optionnelle (appareil photo ou galerie)
  peut être attachée à l'objectif — affichée en grand sur sa page de détail et en miniature dans
  la liste et sur l'accueil, pratique pour se motiver visuellement (photo de la moto, du voyage...).
- **Photo de reçu** sur une transaction (appareil photo ou galerie), compressée automatiquement
  avant stockage ; un petit icône caméra l'indique dans les listes.
- **Projets** : un plan de dépenses nommé (voyage, événement, achat...) composé de plusieurs
  postes estimés (ex. Transport, Hôtel, Imprévu) dont le **coût total se calcule automatiquement**
  à mesure qu'on en ajoute. Distinct des budgets (pas mensuel/récurrent) et des objectifs (pas
  d'épargne progressive vers un montant) — un simple prévisionnel additif. Accessible directement
  depuis la barre du bas (a remplacé l'onglet Budgets, désormais dans le menu latéral).
- **Dettes** : ce que des tiers vous doivent et ce que vous devez, par personne, avec montant,
  échéance optionnelle et raison. Deux boutons dédiés (« On me doit », vert · « Je dois »,
  rouge) créent directement le bon type. Deux onglets séparent « Ce qu'on me doit » et « Ce que
  je dois », avec une barre de recherche par nom. Une dette entièrement réglée quitte
  automatiquement la liste principale — elle reste consultable via **Historique**. Chaque
  remboursement (partiel ou total) est enregistré avec date et heure, historique
  modifiable/supprimable, une **photo optionnelle en preuve** (appareil photo ou galerie), et
  peut créditer/débiter un compte réel. Si la même personne emprunte à nouveau (ou vous prête
  encore), **« Nouvelle dette »** ajoute le montant supplémentaire (avec sa propre date)
  directement sur la dette existante plutôt que d'en créer une séparée. La date/heure de
  création de la dette est affichée sur sa page de détail. Le bloc "Dettes" de l'accueil résume
  les deux totaux, et une **notification** signale une dette qui passe en retard (une fois,
  ré-armée si l'échéance est repoussée).
- Statistiques : donut, barres, courbe, sélecteur de période, totaux et moyennes, **comparaison
  avec la période équivalente précédente** (revenus/dépenses/épargne, en %) pour chaque période
  sauf "Personnalisée".
- **Aide** (menu latéral) : contact direct (WhatsApp, email) pour signaler un bug, proposer une
  fonctionnalité ou poser une question.
- Sécurité : verrouillage par code PIN à 4 chiffres et, si l'appareil le permet (Face ID /
  Touch ID / Windows Hello), déverrouillage biométrique via l'API **WebAuthn** du navigateur.
- Paramètres : apparence (système / clair / sombre), notifications, export JSON complet,
  **export CSV des transactions** (pour Excel/Sheets), import, suppression totale des données,
  chargement à la demande de données de démonstration.
- **Devise verrouillée sur FCFA** pour l'instant (le sélecteur d'autres devises a été retiré du
  formulaire de compte pour éviter de fausser le solde total, tant qu'il n'y a pas de vraie
  conversion).
- Aucune donnée de démonstration au premier lancement : l'app démarre vide, prête pour un usage
  réel (les exemples restent disponibles à la demande via Paramètres → Données).

### Notifications — limite connue

Les notifications de charges/revenus à venir utilisent l'API Notification du navigateur.
Sur **iPhone**, Safari ne les supporte que depuis **iOS 16.4+**, et seulement pour une app
réellement **ajoutée à l'écran d'accueil** (pas un simple onglet Safari) — sans vraie exécution
en arrière-plan, la vérification se fait à chaque ouverture de l'app. Sur Android et desktop
(Chrome/Edge), le support est complet. Dans tous les cas, l'alerte visuelle sur le tableau de
bord reste disponible indépendamment des notifications.

## Compte obligatoire

Au tout premier lancement, l'app demande de créer un compte (nom, prénom, adresse mail, mot de
passe d'au moins 6 caractères) avant de laisser accéder au tableau de bord — c'est le même compte
que celui utilisé pour la synchronisation multi-appareils (voir ci-dessous), pas un système
séparé. Un lien « Vous avez déjà un compte ? » bascule vers un formulaire de connexion (adresse
mail + mot de passe uniquement). Une fois connecté·e, la session est mémorisée : elle n'est pas
redemandée aux lancements suivants (y compris hors-ligne, y compris après avoir fermé l'app),
seule une déconnexion explicite (Paramètres → Synchronisation → Se déconnecter) la redemande. Se
connecter à un compte déjà utilisé sur un autre appareil propose la récupération des données
existantes plutôt que de les écraser (voir « réconciliation » ci-dessous). Le nom/prénom sont
stockés sur le profil du compte (Firebase Auth) et donc visibles sur tout appareil connecté au
même compte, sans stockage local séparé. Une photo de profil optionnelle (menu latéral → tap sur
l'avatar) fait partie des données synchronisées (voir ci-dessous), donc également visible sur tout
appareil connecté au même compte. Ce compte est distinct du verrouillage PIN/biométrique optionnel
(Paramètres → Sécurité), qui reste une couche de protection quotidienne facultative par-dessus.

## Stockage des données

Toutes les données sont stockées **uniquement dans le navigateur** (`localStorage`), sur
l'appareil de l'utilisateur. Deux façons de les retrouver sur un autre appareil :

- **Export / import manuel** (Paramètres → Données) : télécharge un fichier JSON à transférer
  vous-même, geste ponctuel, aucune donnée ne transite par un serveur.
- **Synchronisation automatique** (Paramètres → Synchronisation entre appareils, ou dès la
  création du compte au premier lancement) : reliez deux téléphones avec le même compte
  (adresse mail/mot de passe) et vos données se synchronisent en temps réel via Firebase (Google) —
  pratique mais **ce n'est plus 100% local** : les données transitent (chiffrées) par les
  serveurs de Google. Résolution de conflit : la modification la plus récente l'emporte (pas de
  fusion intelligente). Testé de bout en bout entre deux appareils simulés (création de compte
  au premier lancement, persistance de session après relance, réconciliation lors d'une connexion
  à un compte contenant déjà des données, synchro automatique en temps réel), sans erreur.

`localStorage` a un quota limité (environ 5 Mo selon les navigateurs). Les photos de reçus sont
automatiquement compressées avant stockage (quelques dizaines de Ko chacune), mais avec un usage
intensif la limite peut théoriquement être atteinte ; l'app affiche alors un message clair au
moment d'enregistrer plutôt que de planter — pensez à exporter/nettoyer les anciennes données de
temps en temps si vous joignez beaucoup de photos.

## Architecture du code

```text
index.html          Coquille de l'application (barre d'onglets, feuilles modales, verrouillage)
manifest.json        Manifeste PWA (icône, nom, mode standalone)
sw.js                Service worker (cache pour le fonctionnement hors-ligne)
css/styles.css        Design system complet (clair / sombre)
js/
  db.js               Persistance locale (localStorage) + CRUD par domaine
  calculator.js        Tous les calculs financiers (soldes, totaux, répartitions, échéances)
  format.js             Formatage montants/dates (FCFA, locale française)
  security.js            Verrouillage : code PIN + WebAuthn (biométrie)
  notifications.js        Notifications navigateur (échéances récurrentes, budgets)
  sync.js                  Synchronisation multi-appareils (Firebase, chargée dynamiquement)
  export.js                 Export JSON / CSV, import, suppression des données
  seed.js                     Catégories par défaut + données de démonstration (à la demande)
  state.js                     Préférence d'apparence (clair/sombre/système)
  util.js                        escapeHtml, compression d'image (photos de reçu)
  app.js                          Point d'entrée : navigation, verrouillage, câblage global
  components/                    Pages/formulaires empilés, menus d'action, sélecteurs,
                                  confirmations, menu latéral, visualiseur photo, icônes, toasts
  views/                          Un module par écran (dashboard, transactions, budgets,
                                  recurring = transactions récurrentes, goals = objectifs,
                                  projects = projets, debts = dettes...)
```

## Vérifié

Testé de bout en bout avec Chromium piloté (Playwright), sans erreur console, à plusieurs
reprises au fil des évolutions : navigation entre les 5 onglets, ajout rapide d'une dépense avec
mise à jour immédiate du solde/des graphiques, activation de la protection par code PIN,
création de catégorie, mode sombre, création d'un objectif et versement dessus, modification et
suppression d'un versement, création d'une charge fixe et d'un revenu récurrent, activation des
notifications, export CSV, premier lancement sans données de démo puis chargement à la demande,
verrouillage de la devise sur FCFA, ajout d'une photo à une transaction (compression, aperçu,
icône dans la liste). Bugs détectés et corrigés pendant ces tests : l'écran de verrouillage qui
restait visible en permanence (conflit CSS avec l'attribut `hidden`), et une icône qui ne
s'affichait plus après un versement sur un objectif (re-rendu manquant après mise à jour des
données).
