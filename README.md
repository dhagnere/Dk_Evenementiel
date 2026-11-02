# DK Événementiel

Application unique du service Événementiel, organisée en modules derrière une même connexion :

| Module | Contenu | État |
|---|---|---|
| **Calendrier** | Calendrier des événements du territoire : liste, carte, conflits, doublons, fiches de renseignement, import/export CSV | Disponible (repris de Dk_Calendar) |
| **Stock & Protocole** | Goodies, cadeaux protocolaires, demandes des directions, registre protocolaire, stocks déportés | Disponible (phase 2) |
| **Projets événementiels** | Demandes d'événement, rétroplanning T-180 → J+7, logistique et matériel, sécurité et réglementaire, prestataires, plan d'implantation 2D/3D, budget et bilan | Disponible (phase 3) |

Le socle commun (comptes, droits, directions, journal, sauvegardes, RGPD, stockage des fichiers) sert tous les modules.

- **Serveur** : Node.js 22 + Express + TypeScript, PostgreSQL (SQL écrit à la main, pilote `pg`)
- **Client** : React + Vite + TypeScript + Ant Design
- **Hébergement** : Scalingo, voir [`docs/DEPLOIEMENT-SCALINGO.md`](docs/DEPLOIEMENT-SCALINGO.md)
- **Données personnelles** : voir [`docs/RGPD.md`](docs/RGPD.md)

## Comptes et droits

Chaque compte a, **pour chaque module**, un niveau d'accès. Chaque niveau inclut les précédents :

| Niveau | Calendrier |
|---|---|
| Lecture | Consulter le calendrier, la liste, la carte, les conflits ; exporter en CSV |
| Contribution | Déposer une fiche de renseignement |
| Validation | Valider les événements, changer leur statut et leurs dates |
| Administration | Supprimer des événements, importer un CSV, fusionner les doublons, géocoder |

| Niveau | Stock & Protocole |
|---|---|
| Lecture | Consulter le catalogue des goodies et le tableau de bord |
| Contribution | Demander des goodies pour sa direction ; déclarer sorties et retours de son stock déporté (référent) |
| Validation | Voir les cadeaux protocolaires et le registre ; valider demandes, ajustements et anomalies ; remettre les demandes |
| Administration | Gérer le catalogue, les réceptions, les ajustements, les stocks déportés et les paramètres |

| Niveau | Projets événementiels |
|---|---|
| Lecture | Consulter les projets et leur plan ; déposer une demande d'événement et la suivre |
| Contribution | Mettre à jour tâches, logistique, matériel, démarches, prestataires et plan |
| Validation | Instruire les demandes d'événement ; tenir le budget et le bilan ; changer le statut |
| Administration | Créer, modifier et supprimer les projets ; modèles de rétroplanning ; matériel |

Un **super-administrateur** a tous les droits sur tous les modules, ainsi que l'administration générale : comptes et
droits, demandes d'accès, directions, sauvegardes, journal, RGPD, état du système. L'application refuse de retirer,
suspendre ou supprimer le dernier super-administrateur actif.

Chaque compte peut être rattaché à une **direction**, qui délimitera son périmètre dans les modules Stock et Projets.

Les droits sont relus en base à chaque requête : une suspension ou un retrait de droits s'applique immédiatement,
sans attendre l'expiration de la session.

**Reprise des comptes de Dk_Calendar** (migration `002`, automatique au démarrage) : Administrateur devient
super-administrateur, Consultant reçoit le niveau Contribution sur le Calendrier, c'est-à-dire exactement ce qu'il
pouvait faire auparavant. Les anciens fichiers CSV de comptes (colonne `role`) et les anciennes sauvegardes restent
acceptés et sont convertis de la même façon.

## Module Stock & Protocole

Règles de gestion, reprises de la maquette (`maquettes/stock-goodies/`) :

- **Disponible** = stock physique − stock réservé. Une demande réserve sa quantité dès son dépôt ; un refus ou une
  annulation libère la réservation.
- **Circuits** : goodies validés automatiquement jusqu'à 150 € (paramétrable), par un valideur au-delà ; cadeau
  protocolaire : avis du Protocole puis validation du Cabinet, qui inscrit la remise au **registre protocolaire**.
  Seul le service (niveau Validation) demande des cadeaux protocolaires.
- **Demande tardive** (moins de 10 jours avant le besoin) : motif obligatoire.
- **Remise** : sortie du stock central, valorisée au PMP TTC du jour, figé sur la demande avec le total livré ; un bon de
  livraison PDF est disponible depuis la demande. Des goodies remis à une direction dotée d'un **stock déporté** y sont versés ; le
  référent déclare ensuite, depuis son téléphone, les sorties (distribués) et les retours (non distribués).
- **Prix d'achat et PMP** (TTC) : la fiche article affiche le dernier prix d'achat unitaire, saisi à la création, mis à
  jour à chaque réception et modifiable. Le **prix moyen pondéré (PMP)**, recalculé à chaque réception, est seul à
  valoriser le stock. Un article sans prix est « à valoriser » : le prix d'achat saisi dans sa fiche fixe son PMP, et il
  ne peut être ni demandé ni remis tant qu'il n'est pas valorisé.
- **TVA** : chaque article porte son taux (20 % par défaut ; 10, 5,5, 2,1 ou 0 %). Les prix restent saisis et valorisés
  TTC ; le taux en déduit le HT, affiché dans la fiche et ventilé (HT, TVA, TTC) sur le bon de livraison. Le taux est figé
  sur la demande à la remise.
- **Réception** : met à jour le stock, le prix d'achat et le PMP ; tout écart crée une anomalie à traiter.
- **Ajustement** : immédiat jusqu'à 50 €, soumis à validation au-delà ou pour un cadeau protocolaire ; le stock réservé
  ne peut jamais être entamé.
- **Contrôle à quatre yeux** : personne ne décide de sa propre demande ni de son propre ajustement, sauf un
  super-administrateur.
- Courriels aux valideurs (demande à valider), aux demandeurs (décision) et aux référents (relance).

**Import du catalogue** (super-administrateurs) : Stock → Catalogue → *Importer un CSV*. L'analyse contrôle tout le
fichier sans rien écrire ; l'import n'est possible que sans anomalie. Une référence déjà présente n'est pas modifiée.
Colonne `prix` : prix d'achat unitaire TTC, qui fixe le PMP de départ ; colonne `pmp` (facultative) : PMP repris tel
quel ; colonne `tva` : taux en %, 20 si vide. Modèle téléchargeable depuis le même écran ; *Exporter CSV* produit un fichier au même format, PMP compris. Équivalent en ligne de
commande : `node server/dist/import-catalogue.js catalogue.csv [--appliquer]`.

Pour une recette, un jeu de démonstration (catalogue, directions, stocks déportés de la maquette) se charge sur une base
dont le catalogue est vide :

```bash
npm run seed:stock-demo -w server
```

## Module Projets événementiels

Repris de l'artefact « Balise événementielle » :

- **Rétroplanning** en jours par rapport au jour J, de T-180 (échéance des 6 mois) à J+7 (bilan), découpé en jalons
  dont cinq réunions. À la création, tâches et démarches sont tirées des **modèles** selon le type d'événement (festif,
  protocolaire, quartier). Changer la date décale toutes les échéances.
- **Alertes** : tâches et démarches en retard, projet inscrit moins de 6 mois avant sa date, jauge de 1 500 personnes et
  plus.
- **Matériel logistique** (barrières, tentes, podium…) : une réservation bloque le matériel du jour J − 1 au lendemain de
  la fin ; un dépassement du stock sur des périodes qui se chevauchent est signalé comme conflit.
- **Plan d'implantation** 2D et maquette 3D (éditeur repris tel quel de l'artefact, `client/src/projets/balisePlan.js`) :
  matériel, zones, sécurité, capacité théorique, versions figées à chaque réunion jalon, export PNG, report des quantités
  dans la réservation. L'import d'un fond de plan (PDF, photo aérienne) demande le stockage S3. three.js et pdf.js sont
  intégrés à l'application, sans appel à un CDN.
- **Prestataires** avec pièces administratives, **budget** prévisionnel et réalisé, **bilan** J+7.
- **Demandes d'événement** : dépôt par tout compte ayant accès au module, instruction, acceptation (crée le projet, la
  date de dépôt faisant foi pour l'échéance des 6 mois) ou refus motivé ; courriels aux valideurs et au demandeur.

Pas encore fait : l'espace prestataire (accès externes), prévu plus tard. Le matériel logistique (prêté puis rendu) reste
distinct du stock de goodies (consommé) : leurs règles de gestion diffèrent.

## Liaisons entre modules

- **Fiche événement unique** (`/evenement/:id`, bouton « Fiche complète » du calendrier) : la manifestation telle
  qu'inscrite au calendrier, son projet de préparation et ses demandes de goodies, chacun selon les droits du compte.
  Elle permet de créer le projet d'un événement (l'inscription au calendrier fait foi pour l'échéance des 6 mois).
- **Projet ↔ calendrier** : un projet se rattache à un événement du calendrier (onglet Informations). Si la date change
  au calendrier, la fiche projet le signale et propose d'aligner le jour J, ce qui décale tout le rétroplanning.
  L'acceptation d'une demande d'événement peut inscrire la manifestation au calendrier, au statut « À valider ».
- **Goodies ↔ projet ou événement** : une demande de goodies peut être rattachée à un projet ou à un événement du
  calendrier ; la fiche projet a un onglet Goodies.
- **Accueil** : ce qui demande une action dans chaque module, et les manifestations des 30 prochains jours avec leur
  projet et leurs demandes de goodies.

Un événement du calendrier est une série de lignes (une par jour) recréée à chaque report de date. Les liens retiennent
donc la clé de la série (nom, date de début, date de fin) en plus de l'identifiant d'une ligne, et suivent les reports
de date.

### Format CSV des comptes

```
nom,email,superAdmin,direction,droits,statut,motDePasseInitial,derniereConnexion
Jeanne Martin,jeanne.martin@exemple.fr,Non,Direction des Sports,calendrier:validation;stock:contribution,Actif,,
```

La direction est retrouvée par son nom, ou créée si elle n'existe pas.

## Arborescence

```
client/                  Interface React (Vite)
server/                  API Express ; schéma dans server/migrations/
data/                    CSV de base (événements, comptes d'exemple)
docs/                    Déploiement Scalingo, fiche RGPD
maquettes/               Maquettes des modules à venir
outils/                  Conversion des maquettes en pages HTML autonomes
reference-vibe-export/   Ancien export monday Vibe du calendrier, conservé comme référence
```

## Installation locale

Prérequis : Node.js 22 et PostgreSQL ≥ 13.

```bash
npm install
```

```bash
cp server/.env.example server/.env
```

```bash
docker compose up -d postgres
```

```bash
npm run seed
```

`npm run seed` applique les migrations puis charge `data/evenements.csv` et `data/utilisateurs.csv`. Le CSV de comptes
fourni contient des **comptes d'exemple** (`admin@dunkerque.example` / `ChangezMoi123!`) : à remplacer avant tout
usage réel. Sans seed, l'écran de connexion propose de créer le premier compte super-administrateur.

```bash
npm run dev
```

- Interface : http://localhost:5173
- API : http://localhost:4000/api

### Schéma de la base

Au démarrage, le serveur applique les fichiers de `server/migrations/` qui ne l'ont pas encore été, dans l'ordre. Pour
faire évoluer le schéma, ajoutez un fichier numéroté (`003_….sql`) ; ne modifiez jamais un fichier déjà appliqué en
production.

### Reprendre les données d'une installation existante

Dans l'ancienne application, page **Sauvegardes** : créez une sauvegarde manuelle puis **Exportez**-la. Chargez ensuite
le fichier JSON :

```bash
npm run reprise -w server -- chemin/vers/sauvegarde.json
```

Le script refuse d'écrire dans une base qui contient déjà des données, sauf avec `--remplacer`.

## Variables d'environnement

Voir `server/.env.example`, commenté. Les principales :

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Base PostgreSQL. Sur Scalingo, `SCALINGO_POSTGRESQL_URL` est reprise automatiquement |
| `JWT_SECRET` | Secret des sessions, obligatoire en production |
| `CLIENT_ORIGIN`, `APP_URL` | URL publique de l'application |
| `SMTP_*`, `EMAIL_FROM` | Envoi des courriels (sinon affichés dans les journaux) |
| `S3_*` | Stockage des pièces jointes (sinon dépôt de fichiers désactivé) |
| `GITHUB_TOKEN` | Synchronisation de `data/evenements.csv` après import. **À laisser vide en production** |

## Sécurité

- `JWT_SECRET` aléatoire en production, jamais la valeur d'exemple.
- Les mots de passe temporaires (création de compte, réinitialisation, import CSV) s'affichent à l'écran du
  super-administrateur et dans les journaux du serveur : ils ne sont pas encore envoyés par courriel.
- Aucun identifiant réel (`SMTP_PASS`, clés S3) dans le dépôt : variables d'environnement uniquement.
