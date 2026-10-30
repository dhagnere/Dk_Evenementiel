# Déploiement sur Scalingo

L'application tourne dans un seul conteneur Node.js : le serveur Express sert l'API et l'interface construite. La base
est une extension PostgreSQL Scalingo. Les pièces jointes vont sur un stockage objet compatible S3, car le disque d'un
conteneur Scalingo est effacé à chaque redémarrage ou déploiement.

## 1. Créer l'application

Dans le tableau de bord Scalingo, région **osc-fr1** (France) :

1. **Create an app** → nom `dk-evenementiel`.
2. Relier le dépôt GitHub `dhagnere/DK_Evenementiel`, branche `main` pour la production.
3. **Addons** → **PostgreSQL**, offre Starter pour commencer. La variable `SCALINGO_POSTGRESQL_URL` est créée
   automatiquement et reprise par l'application.

Le fichier `scalingo.json` décrit ces réglages : il sert aussi aux applications de revue (review apps).

## 2. Variables d'environnement

Onglet **Environment** :

| Variable | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | Valeur aléatoire : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CLIENT_ORIGIN` | URL publique, ex. `https://dk-evenementiel.osc-fr1.scalingo.io` |
| `APP_URL` | Même valeur que `CLIENT_ORIGIN` |
| `TRUST_PROXY` | `1` (routeur Scalingo) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Serveur d'envoi de la collectivité ou prestataire |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Voir §3 |

Ne pas renseigner `GITHUB_TOKEN` en production : les imports CSV seraient recopiés dans le dépôt.

## 3. Stockage des fichiers

Créer un bucket **privé** chez un hébergeur en France (Scaleway à Paris, OVHcloud à Gravelines, Outscale…), et une clé
d'accès limitée à ce bucket. Exemple Scaleway :

```
S3_ENDPOINT=https://s3.fr-par.scw.cloud
S3_REGION=fr-par
S3_BUCKET=dk-evenementiel-production
```

Une fois l'application déployée : **Administration → Système → Stockage → Tester**. L'application écrit, relit puis
efface un petit fichier de test.

## 4. Déployer

Chaque envoi sur la branche reliée déclenche un déploiement. Le buildpack Node.js de Scalingo installe les dépendances,
lance `npm run build` (interface puis serveur), puis démarre `web: node server/dist/index.js` (voir `Procfile`).

Au démarrage, le serveur applique les migrations de schéma en attente. Un verrou empêche deux conteneurs de les jouer
en même temps.

## 5. Premier accès

- **Base neuve** : l'écran de connexion propose de créer le premier compte super-administrateur.
- **Reprise de Dk_Calendar** : exporter une sauvegarde depuis l'ancienne application, puis la charger depuis un
  conteneur ponctuel :

```bash
scalingo --app dk-evenementiel run --file sauvegarde.json node server/dist/reprise-sauvegarde.js /tmp/uploads/sauvegarde.json
```

Les comptes Administrateur deviennent super-administrateurs, les Consultants gardent l'accès au calendrier.

## 6. Recette et production

Deux applications Scalingo distinctes, chacune avec sa base :

| Application | Branche | Usage |
|---|---|---|
| `dk-evenementiel-recette` | `dev` | Tests avant mise en production |
| `dk-evenementiel` | `main` | Production |

Un même bucket peut servir aux deux avec `S3_PREFIXE=recette/` sur la recette. Des buckets séparés restent préférables.

## 7. Sauvegardes

- Scalingo sauvegarde la base PostgreSQL chaque jour (selon l'offre) : onglet **Backups** de l'extension.
- L'application garde ses propres instantanés (événements et comptes) : **Administration → Sauvegardes**, 30 derniers
  conservés.
- Le stockage S3 se sauvegarde chez l'hébergeur : activer le versionnage du bucket.
