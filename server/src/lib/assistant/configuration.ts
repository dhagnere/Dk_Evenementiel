import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { config } from '../../config.js';
import { executer, requeteUne } from '../../db.js';

/**
 * Réglages de la mise à jour automatique des dossiers.
 *
 * Deux sources, la première l'emporte :
 * 1. l'écran (onglet Assistant → état et réglages), enregistré en base, mot de passe chiffré ;
 * 2. les variables d'environnement du serveur : MESSAGERIE_ADRESSE, MESSAGERIE_MOT_DE_PASSE,
 *    ASSISTANT_ADRESSES_SERVICE, ASSISTANT_RELEVE_MINUTES (anciens noms GMAIL_* encore lus).
 * Les réglages techniques (MESSAGERIE_SERVEUR, MESSAGERIE_PORT, MESSAGERIE_TLS, MESSAGERIE_DOSSIER) ne se
 * règlent que sur le serveur : rien à l'écran ne nomme la messagerie utilisée.
 */

export interface ConfigMessagerie {
  adresse: string;
  motDePasse: string;
  hote: string;
  port: number;
  tls: boolean;
  dossier: string;
  minutes: number;
  adressesService: string[];
  /** D'où viennent l'adresse et le mot de passe. */
  origine: 'ecran' | 'serveur' | null;
  /** Réglages saisis à l'écran mais illisibles (secret du serveur changé) : à ressaisir. */
  illisible: boolean;
}

const env = (...noms: string[]) => {
  for (const n of noms) {
    const v = process.env[n];
    if (v !== undefined && v !== '') return v;
  }
  return undefined;
};
const listeAdresses = (texte: string) =>
  texte
    .split(/[,;\s]+/)
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
const minutesValides = (v: unknown, defaut = 15) => {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n >= 0 && n <= 1440 ? n : defaut;
};

// --- Chiffrement du mot de passe -------------------------------------------------------------------

const cle = () => createHash('sha256').update(`${config.jwtSecret}:assistant-messagerie`).digest();

function chiffrer(texte: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', cle(), iv);
  const chiffre = Buffer.concat([c.update(texte, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), chiffre].map((b) => b.toString('base64')).join('.');
}

function dechiffrer(valeur: string): string | null {
  try {
    const [iv, tag, chiffre] = valeur.split('.').map((b) => Buffer.from(b, 'base64'));
    const d = createDecipheriv('aes-256-gcm', cle(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(chiffre), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// --- Lecture ---------------------------------------------------------------------------------------

interface ValeurEnBase {
  adresse?: string;
  motDePasse?: string; // chiffré
  minutes?: number;
  adressesService?: string[];
}

let cache: { valeur: ConfigMessagerie; jusqua: number } | null = null;
export const oublierConfiguration = () => {
  cache = null;
};

export async function lireConfiguration(): Promise<ConfigMessagerie> {
  if (cache && cache.jusqua > Date.now()) return cache.valeur;
  const ligne = await requeteUne<{ valeur: ValeurEnBase }>("SELECT valeur FROM assistant_config WHERE cle = 'messagerie'").catch(() => null);
  const ecran = ligne?.valeur ?? null;

  const technique = {
    hote: env('MESSAGERIE_SERVEUR', 'GMAIL_IMAP_HOTE') ?? 'imap.gmail.com',
    port: Number.parseInt(env('MESSAGERIE_PORT', 'GMAIL_IMAP_PORT') ?? '993', 10),
    tls: (env('MESSAGERIE_TLS', 'GMAIL_IMAP_TLS') ?? 'oui') !== 'non',
    dossier: env('MESSAGERIE_DOSSIER', 'GMAIL_DOSSIER') ?? 'INBOX',
  };
  const adressesServeur = listeAdresses(env('ASSISTANT_ADRESSES_SERVICE') ?? '');
  const minutesServeur = minutesValides(env('ASSISTANT_RELEVE_MINUTES'));

  let valeur: ConfigMessagerie;
  if (ecran?.adresse) {
    const motDePasse = ecran.motDePasse ? dechiffrer(ecran.motDePasse) : '';
    valeur = {
      ...technique,
      adresse: ecran.adresse,
      motDePasse: motDePasse ?? '',
      minutes: minutesValides(ecran.minutes, minutesServeur),
      adressesService: ecran.adressesService?.length ? ecran.adressesService : adressesServeur,
      origine: 'ecran',
      illisible: motDePasse === null,
    };
  } else {
    const adresse = (env('MESSAGERIE_ADRESSE', 'GMAIL_ADRESSE') ?? '').trim().toLowerCase();
    valeur = {
      ...technique,
      adresse,
      // Un mot de passe d'application se recopie souvent avec ses espaces (« abcd efgh ijkl mnop ») : on les retire.
      motDePasse: (env('MESSAGERIE_MOT_DE_PASSE', 'GMAIL_MOT_DE_PASSE_APPLI') ?? '').replace(/\s+/g, ''),
      minutes: minutesServeur,
      adressesService: adressesServeur,
      origine: adresse ? 'serveur' : null,
      illisible: false,
    };
  }
  cache = { valeur, jusqua: Date.now() + 30_000 };
  return valeur;
}

export const estConfiguree = (c: ConfigMessagerie) => !!(c.adresse && c.motDePasse);

/** Adresse masquée pour l'écran : « da•••@••• ». */
export const masquer = (adresse: string) => (adresse ? `${adresse.slice(0, 2)}•••@•••` : '');

// --- Connexion -------------------------------------------------------------------------------------

export class ConnexionImpossible extends Error {}

/** Client connecté à la messagerie. Erreurs traduites en messages neutres ; détail au journal du serveur. */
export async function connecter(c: Pick<ConfigMessagerie, 'adresse' | 'motDePasse' | 'hote' | 'port' | 'tls'>): Promise<ImapFlow> {
  const imap = new ImapFlow({
    host: c.hote,
    port: c.port,
    secure: c.tls,
    auth: { user: c.adresse, pass: c.motDePasse },
    logger: false,
    connectionTimeout: 30_000,
    greetingTimeout: 15_000,
    socketTimeout: 120_000,
  });
  imap.on('error', () => undefined);
  try {
    await imap.connect();
    return imap;
  } catch (e) {
    const err = e as { message?: string; authenticationFailed?: boolean; response?: unknown; responseText?: unknown };
    const reponse = String(err.response ?? err.responseText ?? '');
    console.error('[assistant] Connexion impossible :', err.message, reponse);
    throw new ConnexionImpossible(messageDeRefus(!!err.authenticationFailed, reponse));
  }
}

/** Traduit la réponse du serveur de messagerie en consigne claire, sans nommer la messagerie. */
export function messageDeRefus(refusIdentifiants: boolean, reponse: string): string {
  if (/application.?specific password|app password|mot de passe d.application/i.test(reponse)) {
    return 'Connexion refusée : la messagerie exige un mot de passe d’application (et non le mot de passe habituel du compte). Activez la validation en deux étapes sur le compte, créez un mot de passe d’application et saisissez-le dans « état et réglages ».';
  }
  if (/web ?login required|webalert|please log in via your web browser|continue/i.test(reponse)) {
    return 'Connexion bloquée par une vérification de sécurité : ouvrez une fois la messagerie de l’assistant dans un navigateur, validez l’alerte de sécurité, puis réessayez.';
  }
  if (/too many|rate|limit|throttl|try again later/i.test(reponse)) {
    return 'Trop de tentatives de connexion : patientez une quinzaine de minutes avant de réessayer.';
  }
  if (/imap.*(disabled|désactivé)|not enabled for imap/i.test(reponse)) {
    return 'L’accès IMAP est désactivé sur la messagerie de l’assistant : activez-le dans ses paramètres, puis réessayez.';
  }
  if (refusIdentifiants) return 'Connexion refusée : adresse ou mot de passe incorrect.';
  return 'Messagerie injoignable pour le moment';
}

/** Empreinte des identifiants : sert à ne pas réessayer en boucle des identifiants déjà refusés. */
export const empreinteIdentifiants = (c: Pick<ConfigMessagerie, 'adresse' | 'motDePasse' | 'origine'>) =>
  createHash('sha256').update(`${c.origine}|${c.adresse}|${c.motDePasse}`).digest('hex');

/** Essaie de se connecter avec des réglages donnés (avant de les enregistrer). */
export async function testerConnexion(c: Pick<ConfigMessagerie, 'adresse' | 'motDePasse'>): Promise<void> {
  const base = await lireConfiguration();
  const imap = await connecter({ ...base, adresse: c.adresse, motDePasse: c.motDePasse });
  await imap.logout().catch(() => undefined);
}

// --- Enregistrement --------------------------------------------------------------------------------

export async function enregistrerConfiguration(
  v: { adresse: string; motDePasse?: string; minutes: number; adressesService: string[] },
  par: string
): Promise<void> {
  const avant = await requeteUne<{ valeur: ValeurEnBase }>("SELECT valeur FROM assistant_config WHERE cle = 'messagerie'");
  const valeur: ValeurEnBase = {
    adresse: v.adresse.trim().toLowerCase(),
    motDePasse: v.motDePasse ? chiffrer(v.motDePasse) : avant?.valeur.motDePasse,
    minutes: minutesValides(v.minutes),
    adressesService: v.adressesService,
  };
  await executer(
    `INSERT INTO assistant_config (cle, valeur, par) VALUES ('messagerie', $1, $2)
     ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, par = EXCLUDED.par, updated_at = now()`,
    [JSON.stringify(valeur), par]
  );
  oublierConfiguration();
}

export async function supprimerConfiguration(): Promise<void> {
  await executer("DELETE FROM assistant_config WHERE cle = 'messagerie'");
  oublierConfiguration();
}

/** Mot de passe déjà enregistré à l'écran (pour tester une modification sans le ressaisir). */
export async function motDePasseEnregistre(): Promise<string> {
  const c = await lireConfiguration();
  return c.origine === 'ecran' ? c.motDePasse : '';
}

export { listeAdresses, minutesValides };
