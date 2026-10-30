/**
 * Table des variantes accentuées usuelles (francais) pour chaque lettre de base, majuscules et
 * minuscules incluses : on ne peut pas compter sur l'option regex "i" pour plier la casse de lettres
 * accentuees (comportement non garanti selon le moteur), donc les deux casses sont listees explicitement.
 */
const CLASSES_ACCENTS: Record<string, string> = {
  a: 'aàâäáãAÀÂÄÁÃ',
  e: 'eéèêëEÉÈÊË',
  i: 'iîïíìIÎÏÍÌ',
  o: 'oôöóòOÔÖÓÒ',
  u: 'uùûüúUÙÛÜÚ',
  c: 'cçCÇ',
  n: 'nñNÑ',
  y: 'yÿYÝ',
};

function echapperRegex(caractere: string): string {
  return caractere.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Construit un motif regex insensible aux accents à partir d'un terme de recherche : chaque lettre de
 * base est remplacée par une classe couvrant ses variantes accentuées usuelles, pour que rechercher
 * "evenement" trouve aussi bien "Événement" que "ÉVÉNEMENT". Les caractères spéciaux de regex (dans le
 * texte recherché, pas dans les accents) sont échappés au passage.
 */
export function motifRechercheInsensibleAccents(terme: string): string {
  const sansAccents = terme
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  return [...sansAccents].map((c) => (CLASSES_ACCENTS[c] ? `[${CLASSES_ACCENTS[c]}]` : echapperRegex(c))).join('');
}
