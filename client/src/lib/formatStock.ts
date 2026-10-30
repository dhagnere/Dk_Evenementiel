const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

export const formatEuro = (montant: number) => euros.format(montant);

/** AAAA-MM-JJ → JJ/MM/AAAA */
export const formatJour = (jour: string | null | undefined) => (jour ? jour.slice(0, 10).split('-').reverse().join('/') : '—');

/** Couleur d'étiquette Ant Design pour un statut de demande ou de mouvement. */
export function couleurStatut(statut: string): string {
  if (statut.startsWith('En attente') || statut === 'À valider' || statut === 'À traiter') return 'orange';
  if (statut === 'Refusée' || statut === 'Rejeté' || statut === 'Annulée') return 'red';
  if (statut === 'Remise' || statut === 'Traitée') return 'default';
  return 'green';
}

/** Nombre de jours entre aujourd'hui et une date AAAA-MM-JJ (négatif si passée). */
export function joursAvant(jour: string): number {
  const maintenant = new Date();
  const debut = Date.UTC(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  const [a, m, j] = jour.split('-').map(Number);
  return Math.round((Date.UTC(a, m - 1, j) - debut) / 86_400_000);
}
