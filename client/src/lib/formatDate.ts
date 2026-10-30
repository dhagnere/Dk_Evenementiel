/** Formate une date ISO en JJ/MM/AAAA (locale fr-FR), ou "—" si absente/invalide. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR');
}

/** Met en capitale la première lettre, ex. pour un intitulé de jour ("jeudi 3…" -> "Jeudi 3…"). */
export function majusculeInitiale(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}
