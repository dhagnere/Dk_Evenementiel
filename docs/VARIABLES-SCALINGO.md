# Variables d'environnement Scalingo — valeurs à saisir

Complément de [`DEPLOIEMENT-SCALINGO.md`](DEPLOIEMENT-SCALINGO.md), étape 3. Hypothèses retenues : région `osc-fr1`,
stockage Scaleway à Paris, applications `dk-evenementiel-recette` (branche `dev`) et `dk-evenementiel` (branche
`main`).

Les valeurs entre chevrons `<…>` sont des identifiants que vous seul détenez : jamais dans le dépôt, jamais dans un
courriel ni une messagerie.

## Recette — `dk-evenementiel-recette`

| Variable | Valeur | Remarque |
|---|---|---|
| `NODE_ENV` | `production` | |
| `NPM_CONFIG_PRODUCTION` | `false` | Outils de construction installés pendant le build |
| `JWT_SECRET` | *générée par la commande ci-dessous* | 64 caractères aléatoires, propres à la recette |
| `TRUST_PROXY` | `1` | Routeur Scalingo |
| `CLIENT_ORIGIN` | `https://dk-evenementiel-recette.osc-fr1.scalingo.io` | Adresse affichée par Scalingo après création ; en région SecNumCloud : `…osc-secnum-fr1.scalingo.io` |
| `APP_URL` | `https://dk-evenementiel-recette.osc-fr1.scalingo.io` | Même valeur |
| `EMAIL_FROM` | `evenementiel@ville-dunkerque.fr` | À confirmer avec la DSI : l'adresse doit être autorisée à l'envoi par le serveur SMTP |
| `SMTP_HOST` | `<serveur SMTP>` | Collectivité, ou `smtp-relay.brevo.com` avec Brevo |
| `SMTP_PORT` | `587` | |
| `SMTP_SECURE` | `false` | `true` seulement sur le port 465 |
| `SMTP_USER` | `<identifiant SMTP>` | |
| `SMTP_PASS` | `<mot de passe SMTP>` | |
| `S3_ENDPOINT` | `https://s3.fr-par.scw.cloud` | Scaleway Paris |
| `S3_REGION` | `fr-par` | |
| `S3_BUCKET` | `dk-evenementiel-recette` | Bucket privé à créer |
| `S3_ACCESS_KEY_ID` | `<clé d'accès Scaleway>` | Clé limitée au stockage objet |
| `S3_SECRET_ACCESS_KEY` | `<clé secrète Scaleway>` | |

## Production — `dk-evenementiel`

Mêmes valeurs, sauf :

| Variable | Valeur | Remarque |
|---|---|---|
| `JWT_SECRET` | *nouvelle valeur générée* | Jamais la même qu'en recette |
| `CLIENT_ORIGIN` | `https://evenementiel.ville-dunkerque.fr` | Domaine à confirmer avec la DSI ; en attendant : `https://dk-evenementiel.osc-fr1.scalingo.io` |
| `APP_URL` | même valeur que `CLIENT_ORIGIN` | |
| `S3_BUCKET` | `dk-evenementiel-production` | Bucket distinct de la recette |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | `<clés propres à la production>` | |

## Variables à ne pas créer

| Variable | Pourquoi |
|---|---|
| `SCALINGO_POSTGRESQL_URL` | Créée par l'extension PostgreSQL |
| `DATABASE_URL` | Inutile : l'application reprend `SCALINGO_POSTGRESQL_URL` |
| `PORT` | Fourni par Scalingo |
| `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH`, `GITHUB_CHEMIN_EVENEMENTS` | Sinon, chaque import CSV du calendrier serait recopié dans le dépôt GitHub |
| `ADMIN_NOTIFICATION_EMAIL` | Facultative : sans elle, les demandes d'accès sont notifiées à tous les super-administrateurs. À créer seulement pour une boîte fonctionnelle unique |
| `S3_PREFIXE` | Seulement si recette et production partagent un même bucket (ex. `recette/`) |
| `DATABASE_CA_CERT` | Seulement si la connexion à la base échoue sur un certificat (guide, étape 6) |
| `DATABASE_SSL` | Dépannage seulement (`no-verify`) |

## Saisie en ligne de commande

Les secrets ne passent ni par l'écran ni par ce document : `JWT_SECRET` est généré au moment de la commande, et les
identifiants vous sont demandés au clavier, sans affichage.

**Recette**, en une fois (à lancer depuis un terminal où `scalingo login` a été fait) :

```bash
APP=dk-evenementiel-recette
URL=https://dk-evenementiel-recette.osc-fr1.scalingo.io
read -rp "Serveur SMTP : " SMTP_HOST
read -rp "Identifiant SMTP : " SMTP_USER
read -rsp "Mot de passe SMTP : " SMTP_PASS; echo
read -rp "Clé d'accès Scaleway : " S3_KEY
read -rsp "Clé secrète Scaleway : " S3_SECRET; echo
scalingo --app "$APP" env-set \
  NODE_ENV=production \
  NPM_CONFIG_PRODUCTION=false \
  TRUST_PROXY=1 \
  JWT_SECRET="$(openssl rand -hex 32)" \
  CLIENT_ORIGIN="$URL" \
  APP_URL="$URL" \
  EMAIL_FROM=evenementiel@ville-dunkerque.fr \
  SMTP_HOST="$SMTP_HOST" SMTP_PORT=587 SMTP_SECURE=false \
  SMTP_USER="$SMTP_USER" SMTP_PASS="$SMTP_PASS" \
  S3_ENDPOINT=https://s3.fr-par.scw.cloud S3_REGION=fr-par S3_BUCKET=dk-evenementiel-recette \
  S3_ACCESS_KEY_ID="$S3_KEY" S3_SECRET_ACCESS_KEY="$S3_SECRET"
unset SMTP_PASS S3_SECRET
```

**Production** : même commande avec `APP=dk-evenementiel`, `URL=https://evenementiel.ville-dunkerque.fr` (ou l'adresse
Scalingo en attendant le domaine) et `S3_BUCKET=dk-evenementiel-production`.

Contrôle (les valeurs secrètes s'affichent : à faire sur un poste sûr) :

```bash
scalingo --app dk-evenementiel-recette env
```

## Saisie dans le tableau de bord

Application → *Environment*. Le mode d'édition groupée accepte une variable par ligne. Bloc à coller pour la recette,
après avoir remplacé les valeurs entre chevrons et généré `JWT_SECRET` (`openssl rand -hex 32`) :

```
NODE_ENV=production
NPM_CONFIG_PRODUCTION=false
TRUST_PROXY=1
JWT_SECRET=<valeur générée>
CLIENT_ORIGIN=https://dk-evenementiel-recette.osc-fr1.scalingo.io
APP_URL=https://dk-evenementiel-recette.osc-fr1.scalingo.io
EMAIL_FROM=evenementiel@ville-dunkerque.fr
SMTP_HOST=<serveur SMTP>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<identifiant SMTP>
SMTP_PASS=<mot de passe SMTP>
S3_ENDPOINT=https://s3.fr-par.scw.cloud
S3_REGION=fr-par
S3_BUCKET=dk-evenementiel-recette
S3_ACCESS_KEY_ID=<clé d'accès Scaleway>
S3_SECRET_ACCESS_KEY=<clé secrète Scaleway>
```

Après tout changement de variable : redémarrer l'application (`scalingo --app <app> restart`), puis vérifier dans
**Administration → Système** que le stockage et le courriel apparaissent comme configurés.
