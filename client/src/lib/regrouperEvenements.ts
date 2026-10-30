import type { Evenement } from '../types';

/**
 * Un événement sur plusieurs jours a une ligne par jour occupé (dateClef), toutes partageant le
 * même nom/dateDeDebut/dateDeFin. Pour tout affichage voulant un événement = une ligne (Liste,
 * Carte…), on regroupe donc par (nom, dateDeDebut, dateDeFin) et on ne garde qu'une ligne
 * représentative.
 */
export function regrouperParEvenement(evenements: Evenement[]): Evenement[] {
  const parCle = new Map<string, Evenement>();
  for (const e of evenements) {
    const cle = `${e.nom}|${e.dateDeDebut ?? ''}|${e.dateDeFin ?? ''}`;
    if (!parCle.has(cle)) parCle.set(cle, e);
  }
  return [...parCle.values()];
}
