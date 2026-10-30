# Héberger DK Événementiel sur Scalingo

Guide pas à pas, de la création de l'application à la mise en production. Il couvre les trois modules (Calendrier,
Stock & Protocole, Projets événementiels) et le socle commun.

**Principe** : un seul conteneur Node.js sert l'API et l'interface. La base est une extension PostgreSQL Scalingo.
Les pièces jointes (fonds de plan) vont sur un stockage objet compatible S3, car le disque d'un conteneur Scalingo est
effacé à chaque redémarrage.

**Méthode** : d'abord une application de **recette**, reliée à la branche `dev`. La **production**, reliée à `main`, ne
vient qu'après validation de la recette.

> Les libellés exacts des écrans Scalingo peuvent évoluer. En cas d'écart, la documentation de référence est
> https://doc.scalingo.com.

---

## Étape 0 — Décisions à prendre avant de commencer

| Sujet | Choix | Recommandation |
|---|---|---|
| Région | `osc-fr1` (standard) ou `osc-secnum-fr1` (qualifiée SecNumCloud) | À trancher avec la DSI et le DPO. SecNumCloud est plus exigeant et plus coûteux. |
| Nom des applications | ex. `dk-evenementiel-recette` et `dk-evenementiel` | Noms courts, sans majuscules |
| Stockage des fichiers | Scaleway (Paris), OVHcloud (Gravelines), Outscale… | Un hébergeur en France, bucket **privé** |
| Courriel | Serveur SMTP de la collectivité, ou prestataire (Brevo…) | SMTP de la collectivité si la DSI l'ouvre |
| Adresse | `xxx.osc-fr1.scalingo.io` ou domaine de la collectivité | Domaine de la collectivité en production, ex. `evenementiel.ville-dunkerque.fr` |
| Données de départ | Base neuve, ou reprise du Dk_Calendar actuel | Reprise si le calendrier est déjà utilisé |

Prérequis :

- un compte Scalingo de la collectivité, avec un moyen de paiement ;
- un accès administrateur au dépôt GitHub `dhagnere/DK_Evenementiel` ;
- facultatif mais pratique : l'outil en ligne de commande Scalingo (`scalingo`), installé et connecté (`scalingo login`).

---

## Étape 1 — Créer l'application de recette

**Tableau de bord** : *Create an application*, nom `dk-evenementiel-recette`, région choisie à l'étape 0.

**Ou en ligne de commande** :

```bash
scalingo --region osc-fr1 create dk-evenementiel-recette
```

## Étape 2 — Ajouter la base PostgreSQL

**Tableau de bord** : application → *Addons* → *PostgreSQL*. Pour la recette, la plus petite offre de production
suffit ; évitez l'offre « Sandbox », sans sauvegarde.

La variable `SCALINGO_POSTGRESQL_URL` est créée automatiquement. L'application la reprend d'elle-même : inutile de
définir `DATABASE_URL`.

## Étape 3 — Variables d'environnement

**Tableau de bord** : application → *Environment*. Variables à créer :

| Variable | Valeur | Obligatoire |
|---|---|---|
| `NODE_ENV` | `production` | Oui |
| `NPM_CONFIG_PRODUCTION` | `false` (installe TypeScript et Vite pendant la construction) | Oui |
| `JWT_SECRET` | Valeur aléatoire, voir la commande ci-dessous | Oui |
| `CLIENT_ORIGIN` | URL publique, ex. `https://dk-evenementiel-recette.osc-fr1.scalingo.io` | Oui |
| `APP_URL` | Même valeur que `CLIENT_ORIGIN` | Oui |
| `TRUST_PROXY` | `1` | Oui |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Serveur d'envoi (étape 9) | Non (sans eux, les courriels sont seulement inscrits dans les journaux) |
| `EMAIL_FROM` | ex. `no-reply@ville-dunkerque.fr` | Avec le SMTP |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Stockage (étape 8) | Non (sans eux, pas d'import de fond de plan) |
| `S3_PREFIXE` | ex. `recette/` si le bucket est partagé avec la production | Non |
| `DATABASE_CA_CERT` | Certificat de l'autorité de la base (étape 6) | Seulement si l'étape 6 l'exige |

**À ne jamais définir** : `GITHUB_TOKEN`. Avec ce jeton, chaque import CSV du calendrier serait recopié dans le dépôt
GitHub.

Générer `JWT_SECRET` (une valeur différente pour la recette et pour la production) :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

En ligne de commande, par exemple :

```bash
scalingo --app dk-evenementiel-recette env-set NODE_ENV=production NPM_CONFIG_PRODUCTION=false TRUST_PROXY=1
```

```bash
scalingo --app dk-evenementiel-recette env-set JWT_SECRET=<valeur générée>
```

```bash
scalingo --app dk-evenementiel-recette env-set CLIENT_ORIGIN=https://dk-evenementiel-recette.osc-fr1.scalingo.io APP_URL=https://dk-evenementiel-recette.osc-fr1.scalingo.io
```

## Étape 4 — Relier le dépôt GitHub

**Tableau de bord** : application → *Deploy* → *GitHub*. Autorisez Scalingo sur le dépôt `dhagnere/DK_Evenementiel`,
choisissez la branche **`dev`** et activez le **déploiement automatique**. Chaque envoi sur `dev` redéploiera la
recette.

## Étape 5 — Premier déploiement

Lancez un déploiement manuel de la branche `dev`, depuis l'onglet *Deploy*.

Ce que fait Scalingo, d'après les fichiers du dépôt :

1. installe les dépendances (version de Node imposée par `package.json` : 22) ;
2. lance `npm run build` : construction de l'interface, puis du serveur ;
3. démarre `web: node server/dist/index.js` (fichier `Procfile`).

Au démarrage, le serveur applique les **5 migrations** de la base. Suivez les journaux :

```bash
scalingo --app dk-evenementiel-recette logs -f
```

Lignes attendues :

```
[db] Migration appliquée : 001_schema_initial.sql
…
[db] Migration appliquée : 005_liaisons.sql
[db] Connecté à PostgreSQL (postgres://***@…)
[server] En écoute sur http://localhost:…
```

Contrôle : `https://<adresse>/api/health` doit répondre `{"ok":true}`.

Gardez **un seul conteneur web**. La sauvegarde quotidienne et la purge RGPD tournent dans le conteneur : deux
conteneurs les lanceraient deux fois.

## Étape 6 — Si la connexion à la base échoue sur un certificat

Dans les journaux, une erreur de ce type :

```
Échec du démarrage : Error: self-signed certificate in certificate chain
```

signifie que la base présente un certificat signé par l'autorité de Scalingo, que la bibliothèque PostgreSQL de
l'application ne connaît pas. Solution sûre :

1. récupérez le **certificat de l'autorité (CA)** de la base : tableau de bord de l'extension PostgreSQL, rubrique de
   connexion chiffrée ou TLS. À défaut, demandez-le au support Scalingo ;
2. collez son contenu dans la variable `DATABASE_CA_CERT`. Le texte peut tenir sur une ligne, sauts de ligne écrits
   `\n` :

```bash
scalingo --app dk-evenementiel-recette env-set DATABASE_CA_CERT="$(cat ca.crt)"
```

3. redémarrez l'application.

En dépannage seulement, `DATABASE_SSL=no-verify` chiffre la connexion sans vérifier le certificat. À retirer dès que
`DATABASE_CA_CERT` est en place.

## Étape 7 — Premier accès

Faites cette étape **juste après le premier déploiement**. Tant qu'aucun super-administrateur n'existe, la première
personne qui ouvre l'adresse peut créer ce compte.

**Cas A — base neuve.** Ouvrez l'adresse de l'application et créez le compte super-administrateur depuis l'écran de
connexion. Ce formulaire disparaît dès le premier compte créé.

**Cas B — reprise du Dk_Calendar actuel.**

1. Dans l'ancienne application : *Sauvegardes* → *Créer une sauvegarde* → *Exporter*. Vous obtenez un fichier JSON.
2. Chargez-le dans la base neuve (avant toute autre création de compte) :

```bash
scalingo --app dk-evenementiel-recette run --file sauvegarde.json "node server/dist/reprise-sauvegarde.js /tmp/uploads/sauvegarde.json"
```

Événements et comptes sont repris avec leurs mots de passe. Les comptes « Administrateur » deviennent
super-administrateurs ; les « Consultant » gardent le calendrier, au niveau Contribution. Le script refuse d'écrire dans
une base qui contient déjà des données, sauf avec `--remplacer`.

> **Ne lancez pas `npm run seed` sur la recette ni sur la production** : il crée des comptes d'exemple au mot de passe
> connu (`admin@dunkerque.example` / `ChangezMoi123!`).

## Étape 8 — Stockage des fichiers (S3)

Exemple avec Scaleway, Paris :

1. Créez un bucket **privé**, par exemple `dk-evenementiel-recette`, région `fr-par`.
2. Créez une clé d'API limitée au stockage objet de ce projet.
3. Renseignez les variables :

```bash
scalingo --app dk-evenementiel-recette env-set S3_ENDPOINT=https://s3.fr-par.scw.cloud S3_REGION=fr-par S3_BUCKET=dk-evenementiel-recette
```

```bash
scalingo --app dk-evenementiel-recette env-set S3_ACCESS_KEY_ID=<clé> S3_SECRET_ACCESS_KEY=<secret>
```

4. Redémarrez, puis dans l'application : **Administration → Système → Stockage → Tester**. Résultat attendu :
   « Écriture, lecture et suppression réussies ».

Activez le versionnage du bucket : il protège contre une suppression accidentelle.

## Étape 9 — Courriel

Renseignez `SMTP_HOST`, `SMTP_PORT` (587 en général), `SMTP_SECURE` (`false` sur le port 587), `SMTP_USER`,
`SMTP_PASS` et `EMAIL_FROM`.

Vérifiez l'état dans **Administration → Système → Courriel**. Pour tester un envoi réel, faites une demande d'accès
depuis l'écran de connexion avec une adresse de test : les super-administrateurs doivent recevoir le courriel.

Courriels envoyés par l'application :

- nouvelle demande d'accès, aux super-administrateurs ;
- demande de goodies à valider et décision prise, aux valideurs et au demandeur ;
- relance d'un stock déporté, au référent ;
- demande d'événement déposée et décision prise, aux valideurs du module Projets et au demandeur.

## Étape 10 — Paramétrage de l'application

Connecté en super-administrateur :

1. **Administration → Directions** : créez les directions de la collectivité.
2. **Administration → Comptes et droits** : créez les comptes ou approuvez les demandes d'accès. Pour chaque compte :
   direction de rattachement et niveau par module.
3. **Administration → RGPD** : faites valider les durées de conservation par le DPO, puis enregistrez-les.
4. **Stock & Protocole** :
   - *Paramètres* : seuils (validation automatique, ajustements), délais, emplacements du local ;
   - *Catalogue* : saisissez les vrais articles. Sur la recette seulement, un jeu de démonstration peut être chargé
     tant que le catalogue est vide :

```bash
scalingo --app dk-evenementiel-recette run "node server/dist/seed-stock-demo.js"
```

   - *Stocks déportés* : créez un stock par direction concernée et désignez son référent.
5. **Projets** : relisez les *Modèles* de rétroplanning (tâches, démarches, branches, postes budgétaires) et le
   *Matériel* (stocks réels de barrières, tentes…).

## Étape 11 — Recette

À dérouler avec au moins trois comptes : un super-administrateur, un valideur, un agent d'une direction en lecture ou en
contribution.

- [ ] Connexion, déconnexion, changement de mot de passe ; un compte suspendu perd l'accès immédiatement.
- [ ] Calendrier : liste, carte, conflits, fiche de renseignement, validation, report de date, import CSV.
- [ ] Fiche événement : bouton « Fiche complète », création du projet depuis le calendrier.
- [ ] Stock : demande de goodies avec validation automatique, demande au-delà du seuil validée puis remise, demande
      protocolaire (avis Protocole, puis Cabinet, puis registre), refus motivé.
- [ ] Stock déporté : déclaration de sortie et de retour depuis un téléphone.
- [ ] Réception de livraison (prix moyen pondéré, anomalie), ajustement soumis à validation.
- [ ] Projets : demande d'événement acceptée avec inscription au calendrier, rétroplanning, plan 2D et 3D, import d'un
      fond de plan PDF, version figée, conflit de matériel, budget et bilan.
- [ ] Accueil : « À traiter » et « 30 prochains jours » cohérents avec les droits de chaque compte.
- [ ] Administration : sauvegarde manuelle, export d'une sauvegarde, journal, export RGPD d'une personne de test.

## Étape 12 — Passage en production

1. **Fusionner `dev` dans `main`** sur GitHub, par une pull request relue.
2. **Créer l'application de production** `dk-evenementiel` : refaire les étapes 1 à 9 avec la branche **`main`**, une
   base PostgreSQL dédiée, un `JWT_SECRET` différent et un bucket dédié (ou `S3_PREFIXE` distinct).
3. **Dimensionnement** : une base de niveau « Business » (haute disponibilité, sauvegardes plus fines) est conseillée en
   production. Conteneur web : taille M pour commencer, toujours un seul conteneur.
4. **Domaine** : application → *Domains* → ajoutez le domaine de la collectivité, puis créez chez le gestionnaire DNS
   l'enregistrement CNAME indiqué par Scalingo. Le certificat HTTPS est fourni automatiquement. Mettez ensuite à jour
   `CLIENT_ORIGIN` et `APP_URL` avec ce domaine.
5. **Reprise des données réelles** : étape 7, cas B, à partir d'une sauvegarde fraîche de l'ancienne application.
   Prévenez les utilisateurs d'un gel des saisies pendant la bascule.
6. **Bascule** : communiquez la nouvelle adresse et arrêtez la saisie dans l'ancienne application.

## Étape 13 — Exploitation courante

| Besoin | Commande ou écran |
|---|---|
| Journaux en direct | `scalingo --app <app> logs -f` |
| Redémarrer | `scalingo --app <app> restart` |
| Revenir à une version précédente | Onglet *Deploy* → historique → redéployer un déploiement antérieur |
| Console SQL | `scalingo --app <app> pgsql-console` |
| Sauvegardes de la base | Tableau de bord de l'extension PostgreSQL → *Backups* (rétention selon l'offre) |
| Instantanés de l'application | Administration → Sauvegardes : événements et comptes, 30 derniers |
| Mise à jour | Pull request `dev` → `main` ; la production se redéploie seule si le déploiement automatique est activé |

Les migrations de schéma s'appliquent seules au démarrage, une seule fois. Ne modifiez jamais un fichier de
`server/migrations/` déjà appliqué : ajoutez un nouveau fichier numéroté.

## Dépannage

| Symptôme | Cause probable | Correction |
|---|---|---|
| Construction en échec : `tsc: not found` ou `vite: not found` | Dépendances de construction non installées | `NPM_CONFIG_PRODUCTION=false`, puis redéployer |
| `Variable d'environnement manquante : JWT_SECRET` | Variable absente | Étape 3 |
| `self-signed certificate in certificate chain` | Certificat de la base inconnu | Étape 6 |
| `Variable d'environnement manquante : DATABASE_URL` | Pas d'extension PostgreSQL | Étape 2 |
| Connexion impossible, « Trop de tentatives » pour tout le monde | `TRUST_PROXY` absent : toutes les connexions semblent venir de la même adresse | `TRUST_PROXY=1` |
| Liens des courriels vers `localhost` | `APP_URL` absent | Étape 3 |
| « Stockage des fichiers non configuré » à l'import d'un fond de plan | Variables S3 absentes | Étape 8 |
| La 3D ou l'import PDF ne se charge pas | Navigateur trop ancien ou WebGL désactivé | three.js et pdf.js sont intégrés à l'application : aucun site externe n'est requis |
