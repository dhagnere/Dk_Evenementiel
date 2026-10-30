/**
 * Normalise un titre d'evenement pour l'affichage : tout en MAJUSCULES et sans accents, pour que les
 * titres soient uniformes partout dans l'application et plus faciles a reperer/comparer visuellement.
 * Ne touche pas a la donnee en base (utile pour l'export CSV, l'edition...), uniquement au rendu.
 */
export function formatTitreEvenement(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
}
