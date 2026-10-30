import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';

// En production, JWT_SECRET n'a AUCUNE valeur de repli : un secret par défaut visible dans ce dépôt
// permettrait à quiconque le connaît de forger de fausses sessions (y compris administrateur) si la
// variable d'environnement n'était pas positionnée sur le déploiement. Le repli n'existe que pour le
// confort du développement local.
const jwtSecret = isProduction
  ? required('JWT_SECRET')
  : required('JWT_SECRET', 'changez-moi-en-production-secret-dev-uniquement');

export const config = {
  port: parseInt(process.env.PORT ?? '4000', 10),
  // Chaîne de connexion PostgreSQL, ex. postgres://utilisateur:motdepasse@hote:5432/dk_calendar
  // (ajouter ?sslmode=require si l'hébergeur impose une connexion chiffrée). Sur Scalingo, l'extension
  // PostgreSQL fournit SCALINGO_POSTGRESQL_URL, reprise automatiquement si DATABASE_URL est absente.
  databaseUrl: required(
    'DATABASE_URL',
    process.env.SCALINGO_POSTGRESQL_URL ?? (isProduction ? undefined : 'postgres://dk_calendar:dk_calendar@127.0.0.1:5432/dk_calendar')
  ),
  jwtSecret,
  // Chiffrement de la connexion à PostgreSQL (voir db.ts) : certificat de l'autorité de l'hébergeur,
  // ou « no-verify » en dépannage.
  databaseCaCert: process.env.DATABASE_CA_CERT,
  databaseSsl: process.env.DATABASE_SSL,
  cookieName: 'dk_session',
  isProduction,
  // Nombre de proxys de confiance devant l'application (le routeur Scalingo en production) : sans
  // cela, l'adresse IP du client est mal lue et la limitation des tentatives de connexion ne marche pas.
  trustProxy: parseInt(process.env.TRUST_PROXY ?? (isProduction ? '1' : '0'), 10),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  // URL publique de l'application, utilisée pour construire les liens dans les emails.
  appUrl: process.env.APP_URL ?? process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  emailFrom: process.env.EMAIL_FROM ?? 'no-reply@dk-evenementiel.local',
  // Si non renseigné, les notifications sont envoyées à tous les administrateurs actifs.
  adminNotificationEmail: process.env.ADMIN_NOTIFICATION_EMAIL,
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  // Synchronisation de data/evenements.csv vers GitHub après chaque import (voir lib/github.ts).
  // Fonctionnalité désactivée (silencieusement) tant que GITHUB_TOKEN n'est pas renseigné.
  github: {
    token: process.env.GITHUB_TOKEN,
    repo: process.env.GITHUB_REPO ?? 'dhagnere/DK_Evenementiel',
    branch: process.env.GITHUB_BRANCH ?? 'main',
    cheminEvenements: process.env.GITHUB_CHEMIN_EVENEMENTS ?? 'data/evenements.csv',
  },
  // Stockage objet compatible S3 (Scaleway, OVHcloud, Outscale…) pour les pièces jointes : le disque
  // d'un conteneur Scalingo est effacé à chaque redémarrage. Désactivé tant que S3_BUCKET est vide.
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'fr-par',
    bucket: process.env.S3_BUCKET,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    // Préfixe des clés, pour partager un même bucket entre recette et production.
    prefixe: process.env.S3_PREFIXE ?? '',
  },
};
