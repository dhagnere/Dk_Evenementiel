import { NIVEAUX, type Niveau } from '../types';

export const LIBELLES_NIVEAUX: Record<Niveau, string> = {
  lecture: 'Lecture',
  contribution: 'Contribution',
  validation: 'Validation',
  administration: 'Administration',
};

/** Le niveau détenu couvre-t-il le niveau requis ? Chaque niveau inclut les précédents. */
export function niveauSuffit(detenu: Niveau | undefined, requis: Niveau): boolean {
  return detenu !== undefined && NIVEAUX.indexOf(detenu) >= NIVEAUX.indexOf(requis);
}
