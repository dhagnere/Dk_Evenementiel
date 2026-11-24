import { heureDeParis, jourParis, moisDuNom } from './texte.js';

export interface EcheanceDetectee {
  date: string; // AAAA-MM-JJ
  libelle: string;
  source: 'mail';
}

const MOIS_NOMS = 'janvier|janv\\.?|f[ée]vrier|f[ée]vr?\\.?|mars|avril|avr\\.?|mai|juin|juillet|juil\\.?|ao[uû]t|septembre|sept?\\.?|octobre|oct\\.?|novembre|nov\\.?|d[ée]cembre|d[ée]c\\.?';
const DATE_TEXTE = new RegExp(`\\b(\\d{1,2})(?:er)?\\s+(${MOIS_NOMS})(?:\\s+(\\d{4}))?\\b`, 'gi');
// 24/11, 24/11/2026, 24.11.26 — mais pas un numéro de téléphone ou de commande.
// Avec un point, l'année est exigée : « 14.12 » est plus souvent une heure qu'une date.
const DATE_CHIFFRES = /(?<![\d/.,-])(\d{1,2})([/.])(\d{1,2})(?:\2(\d{2}|\d{4}))?(?![\d/.,]\d)/g;

/** Phrase (ou ligne) qui contient la date, pour en faire le libellé de l'échéance. */
function phraseAutour(texte: string, debut: number, fin: number): string {
  const avant = texte.lastIndexOf('\n', debut);
  const apres = texte.indexOf('\n', fin);
  let ligne = texte.slice(avant + 1, apres < 0 ? texte.length : apres);
  const pos = debut - (avant + 1);
  // Dans une longue ligne, on resserre sur la phrase.
  if (ligne.length > 160) {
    const d = Math.max(ligne.lastIndexOf('. ', pos) + 2, 0);
    const f = ligne.indexOf('. ', pos + 1);
    ligne = ligne.slice(d, f < 0 ? undefined : f + 1);
  }
  return ligne.replace(/\s+/g, ' ').trim().slice(0, 160);
}

/**
 * Dates citées dans un mail, à venir par rapport à la date du mail (au plus 13 mois plus tard).
 * Repérage simple et prudent : ce sont des échéances proposées, que le chef de service garde ou non.
 */
// Lignes d'en-tête (« Envoyé : mardi 24 novembre… », « Le 23 nov. … a écrit : ») : leurs dates ne sont pas des échéances.
const LIGNE_EN_TETE = /^\s*(>\s*)*(de|from|envoy[ée](\s+le)?|date|sent|[àa]|to|cc|objet|subject)\s*:|a [ée]crit\s*:\s*$|wrote\s*:\s*$/i;

export function detecterEcheances(brut: string, reference: Date, maximum = 5): EcheanceDetectee[] {
  const texte = brut
    .split('\n')
    .map((l) => (LIGNE_EN_TETE.test(l) ? '' : l))
    .join('\n');
  const debutRef = jourParis(reference);
  const limite = jourParis(new Date(reference.getTime() + 400 * 86_400_000));
  const anneeRef = +debutRef.slice(0, 4);
  const trouvees = new Map<string, EcheanceDetectee>();

  const ajouter = (jour: number, mois: number, annee: number | null, debut: number, fin: number) => {
    if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return;
    let a = annee ?? anneeRef;
    if (a < 100) a += 2000;
    let iso = jourParis(heureDeParis(a, mois, jour, 12));
    if (+iso.slice(8, 10) !== jour) return; // 31/02…
    // Sans année, une date déjà passée désigne l'année suivante (« le 15 janvier » écrit en novembre).
    if (annee === null && iso < debutRef) iso = jourParis(heureDeParis(a + 1, mois, jour, 12));
    if (iso < debutRef || iso > limite) return;
    const libelle = phraseAutour(texte, debut, fin);
    const cle = `${iso}|${libelle}`;
    if (!trouvees.has(cle) && ![...trouvees.values()].some((e) => e.date === iso && e.libelle === libelle)) {
      trouvees.set(cle, { date: iso, libelle, source: 'mail' });
    }
  };

  for (const m of texte.matchAll(DATE_TEXTE)) {
    const mois = moisDuNom(m[2]);
    if (mois) ajouter(+m[1], mois, m[3] ? +m[3] : null, m.index!, m.index! + m[0].length);
  }
  for (const m of texte.matchAll(DATE_CHIFFRES)) {
    if (m[2] === '.' && !m[4]) continue;
    ajouter(+m[1], +m[3], m[4] ? +m[4] : null, m.index!, m.index! + m[0].length);
  }
  return [...trouvees.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, maximum);
}
