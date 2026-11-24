/** Outils de texte partagés par le relevé des mails et le rapprochement avec les projets. */

/** Minuscules, sans accents ni ponctuation : « Féerique 2026 – Marché » → « feerique 2026 marche ». */
export const normaliser = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9@.]+/g, ' ')
    .replace(/(^|\s)[.@]+|[.@]+(\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Mots trop courants pour rapprocher deux libellés (« Dunkerque », « fête »…).
export const MOTS_VIDES = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'et', 'a', 'au', 'aux', 'en', 'd', 'l', 'pour', 'sur', 'dunkerque', 'fete', 'ville',
  'cud', 'quartier', 'quartiers', 'edition', 'evenement', 'un', 'une', 'avec', 'par', 'dans', 'est', 'sont', 'mail', 'objet',
]);

/** Mots significatifs d'un libellé (sans mots vides ni nombres). */
export const mots = (s: string) =>
  new Set(
    normaliser(s)
      .replace(/[.@]/g, ' ')
      .split(' ')
      .filter((m) => m.length > 1 && !MOTS_VIDES.has(m) && !/^\d+$/.test(m))
  );

/** Objet sans « RE : », « TR : », « Fwd: »… répétés, normalisé : sert à reconnaître une même conversation. */
export function objetDeFil(objet: string): string {
  let s = objet;
  for (let i = 0; i < 10; i++) {
    const avant = s;
    s = s.replace(/^\s*(\[[^\]]{1,40}\]\s*)?(re|tr|fw|fwd|ref|réf|aw|wg|rép|rep|antw)\s*(\[\d+\]|\(\d+\))?\s*:\s*/i, '');
    if (s === avant) break;
  }
  return normaliser(s);
}

// --- Dates : heure de Paris -----------------------------------------------------------------------

const FUSEAU = 'Europe/Paris';

/** Décalage (en minutes) de l'heure de Paris par rapport à UTC à un instant donné. */
function decalageParis(instant: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: FUSEAU,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value])
  );
  const vu = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((vu - instant) / 60_000);
}

/** Instant correspondant à une heure lue « à Paris » (en-têtes de transfert, sans fuseau). */
export function heureDeParis(annee: number, mois: number, jour: number, heure = 0, minute = 0): Date {
  const brut = Date.UTC(annee, mois - 1, jour, heure, minute);
  let instant = brut - decalageParis(brut) * 60_000;
  instant = brut - decalageParis(instant) * 60_000;
  return new Date(instant);
}

/** « 2026-11-24 10:12 », heure de Paris : même format que le registre de l'assistant. */
export function formatParis(d: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: FUSEAU,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Jour civil à Paris, AAAA-MM-JJ. */
export const jourParis = (d: Date) => formatParis(d).slice(0, 10);

const MOIS: [RegExp, number][] = [
  [/^janv?/, 1],
  [/^f[eé]vr?|^feb/, 2],
  [/^mars?$|^mar$/, 3],
  [/^avr|^apr/, 4],
  [/^mai$|^may/, 5],
  [/^juin|^jun/, 6],
  [/^juil|^jul/, 7],
  [/^ao[uû]|^aug/, 8],
  [/^sept?/, 9],
  [/^oct/, 10],
  [/^nov/, 11],
  [/^d[eé]c/, 12],
];
/** Numéro du mois d'après son nom français ou anglais, entier ou abrégé. */
export function moisDuNom(nom: string): number | null {
  const n = nom.toLowerCase().replace(/\.$/, '');
  for (const [motif, numero] of MOIS) if (motif.test(n)) return numero;
  return null;
}

/**
 * Lit la date d'un en-tête de transfert, quelle que soit la langue d'Outlook ou de Gmail :
 * « mardi 24 novembre 2026 10:12 », « mar. 24 nov. 2026 à 10:12 », « Tuesday, November 24, 2026 10:12 AM »,
 * « 24/11/2026 10:12 », « Tue, 24 Nov 2026 10:12:00 +0100 ». Sans fuseau, l'heure est celle de Paris.
 */
export function lireDateEnTete(valeur: string): Date | null {
  const v = valeur.trim();
  if (!v) return null;
  // Format de messagerie complet, avec fuseau : on fait confiance à Date.
  if (/[+-]\d{4}\b|\bGMT\b|\bUTC\b|Z$/.test(v)) {
    const t = Date.parse(v.replace(/\s+\(.*\)$/, ''));
    if (!Number.isNaN(t)) return new Date(t);
  }
  let annee = 0;
  let mois = 0;
  let jour = 0;
  let reste = v;
  let m = v.match(/(\d{1,2})(?:er)?\s+([a-zA-Zéûè]+\.?)\s+(\d{4})/);
  if (m && moisDuNom(m[2])) {
    jour = +m[1];
    mois = moisDuNom(m[2])!;
    annee = +m[3];
    reste = v.slice(m.index! + m[0].length);
  } else if ((m = v.match(/([a-zA-Z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/)) && moisDuNom(m[1])) {
    mois = moisDuNom(m[1])!;
    jour = +m[2];
    annee = +m[3];
    reste = v.slice(m.index! + m[0].length);
  } else if ((m = v.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/))) {
    jour = +m[1];
    mois = +m[2];
    annee = +m[3];
    reste = v.slice(m.index! + m[0].length);
  } else if ((m = v.match(/(\d{4})-(\d{2})-(\d{2})/))) {
    annee = +m[1];
    mois = +m[2];
    jour = +m[3];
    reste = v.slice(m.index! + m[0].length);
  } else {
    return null;
  }
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31 || annee < 2000 || annee > 2100) return null;
  let heure = 0;
  let minute = 0;
  const h = reste.match(/(\d{1,2})\s*[:h]\s*(\d{2})(?::\d{2})?\s*(AM|PM|am|pm)?/);
  if (h) {
    heure = +h[1];
    minute = +h[2];
    const ampm = h[3]?.toUpperCase();
    if (ampm === 'PM' && heure < 12) heure += 12;
    if (ampm === 'AM' && heure === 12) heure = 0;
    if (heure > 23 || minute > 59) heure = minute = 0;
  }
  return heureDeParis(annee, mois, jour, heure, minute);
}

/** Adresse électronique et nom d'une valeur « Olivier MENARD <olivier.menard@nord.gouv.fr> » (ou variantes). */
export function lireAdresse(valeur: string): { nom: string; adresse: string } {
  const m = valeur.match(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const adresse = m ? m[0].toLowerCase() : '';
  let nom = valeur
    .replace(/\[?mailto:[^\]\s]*\]?/gi, '')
    .replace(m ? m[0] : '\u0000', '')
    .replace(/[<>"[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[;,]\s*$/, '')
    .trim();
  if (!nom) nom = adresse;
  return { nom, adresse };
}
