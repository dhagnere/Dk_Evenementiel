/**
 * Normalise un texte (nom d'événement, lieu) pour la comparaison d'identité (import, détection de
 * doublons) : majuscules, sans accents, espaces superflus réduits. Insensible aux petites variations
 * de saisie entre deux exports du même événement (ex. « Marché de Noël », « MARCHE DE NOEL » ou
 * « Marché de Noël  » avec un espace en trop) : sans cette normalisation, une simple différence de
 * casse ou d'accent fait passer la ligne pour un événement distinct et la (re)crée en double, au lieu
 * de la reconnaître comme déjà en base.
 */
export function normaliserTexte(valeur: string): string {
  return valeur
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Clé d'identité d'un événement : eventId si présent, sinon le triplet (nom normalisé, lieu
 * normalisé, jour). Le lieu fait partie de l'identité : deux événements de même nom le même jour
 * mais à des adresses différentes sont deux manifestations distinctes (ex. deux marchés de Noël
 * dans des quartiers différents), pas un doublon à fusionner. La date utilisée est dateClef si
 * présente, sinon dateDeDebut en repli (un export brut sans notion de « dateClef » n'a souvent qu'une
 * date de début) : cela évite de fusionner deux événements distincts qui partageraient le même nom à
 * des dates différentes.
 *
 * Seul le JOUR calendaire compte (l'heure est ignorée) : un événement déjà en base avec une dateClef
 * à minuit et la même ligne réimportée depuis un export brut dont la « Date de début » porte une
 * heure précise (ex: 02/09/2026 14:00:00) doivent être reconnus comme le même événement, sans quoi
 * la ligne est (re)créée comme un doublon — c'est le bug rapporté (Ducasse de Rosendael en double,
 * une version validée et une non validée pour le même jour).
 */
export function cleIdentite(e: {
  eventId?: string | null;
  nom: string;
  lieu?: string | null;
  dateClef?: Date | null;
  dateDeDebut?: Date | null;
}): string {
  if (e.eventId) return `id:${e.eventId}`;
  const date = e.dateClef ?? e.dateDeDebut ?? null;
  const jour = date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    : '';
  return `nom:${normaliserTexte(e.nom)}|lieu:${normaliserTexte(e.lieu ?? '')}|date:${jour}`;
}
