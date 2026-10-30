import type { Evenement } from '../types';
import { formatDate } from './formatDate';

/** Texte de durée affiché sous le nom d'un événement, ex. "du 12/07/2026 au 15/07/2026". */
export function formatDuree(e: Evenement): string | null {
  if (!e.dateDeDebut) return null;
  const debut = formatDate(e.dateDeDebut);
  const fin = e.dateDeFin ? formatDate(e.dateDeFin) : null;
  if (!fin || fin === debut) return debut;
  return `du ${debut} au ${fin}`;
}
