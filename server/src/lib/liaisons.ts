import { executer, inserer, pool, requete, requeteUne, type Executant } from '../db.js';
import type { Evenement } from '../modeles.js';
import { cleIdentite } from './identiteEvenement.js';

/**
 * Liaisons entre le calendrier, les projets et les demandes de goodies.
 *
 * Un événement du calendrier est une série de lignes (une par jour) partageant nom, date de début
 * et date de fin. Un projet ou une demande pointe vers la série par deux moyens : l'identifiant d'une
 * de ses lignes (evenement_id) et la clé de la série (evenement_nom, evenement_debut,
 * evenement_fin). L'identifiant est essayé d'abord ; s'il a disparu (report de date, fusion de
 * doublons), la clé prend le relais.
 */

export interface CleSerie {
  evenementId: string | null;
  evenementNom: string | null;
  evenementDebut: Date | null;
  evenementFin: Date | null;
}

export interface ResumeEvenement {
  _id: string;
  nom: string;
  dateDeDebut: Date | null;
  dateDeFin: Date | null;
  lieu: string;
  quartier: string;
  pilote: string;
  directionPilote: string;
  organisateur: string;
  nature: string;
  statut: string;
  valide: boolean;
  dateClef: boolean;
  nombreJours: number;
  inscritLe: Date;
}

/** Clé d'une série à partir d'une de ses lignes. */
export function cleDeLigne(e: Pick<Evenement, '_id' | 'nom' | 'dateDeDebut' | 'dateDeFin'>): CleSerie {
  return { evenementId: e._id, evenementNom: e.nom, evenementDebut: e.dateDeDebut, evenementFin: e.dateDeFin };
}

const CONDITION_SERIE = 'nom = $1 AND date_de_debut IS NOT DISTINCT FROM $2 AND date_de_fin IS NOT DISTINCT FROM $3';

function resumer(lignes: Evenement[]): ResumeEvenement | null {
  if (lignes.length === 0) return null;
  const [premiere] = [...lignes].sort((a, b) => (a.dateClef?.getTime() ?? 0) - (b.dateClef?.getTime() ?? 0));
  return {
    _id: premiere._id,
    nom: premiere.nom,
    dateDeDebut: premiere.dateDeDebut ?? premiere.dateClef,
    dateDeFin: premiere.dateDeFin,
    lieu: premiere.lieu,
    quartier: premiere.quartier,
    pilote: premiere.pilote,
    directionPilote: premiere.directionPilote,
    organisateur: premiere.organisateur,
    nature: premiere.nature,
    statut: premiere.statut,
    valide: lignes.every((l) => l.validationTechnique && l.validationPolitique),
    dateClef: lignes.some((l) => l.validParDateClef),
    nombreJours: lignes.length,
    inscritLe: lignes.reduce((min, l) => (l.createdAt < min ? l.createdAt : min), premiere.createdAt),
  };
}

/** Lignes d'une série à partir de l'identifiant d'une de ses lignes. */
export async function lignesSerie(id: string, executant: Executant = pool): Promise<Evenement[]> {
  const ligne = await requeteUne<Evenement>('SELECT * FROM evenements WHERE id = $1', [id], executant);
  if (!ligne) return [];
  return requete<Evenement>(`SELECT * FROM evenements WHERE ${CONDITION_SERIE}`, [ligne.nom, ligne.dateDeDebut, ligne.dateDeFin], executant);
}

export async function resumeSerie(id: string, executant: Executant = pool): Promise<ResumeEvenement | null> {
  return resumer(await lignesSerie(id, executant));
}

/** Retrouve la série désignée par un lien (identifiant puis clé). null : l'événement n'existe plus. */
export async function resoudre(cle: CleSerie, executant: Executant = pool): Promise<ResumeEvenement | null> {
  if (cle.evenementId) {
    const parId = await resumeSerie(cle.evenementId, executant);
    if (parId) return parId;
  }
  if (!cle.evenementNom) return null;
  return resumer(
    await requete<Evenement>(`SELECT * FROM evenements WHERE ${CONDITION_SERIE}`, [cle.evenementNom, cle.evenementDebut, cle.evenementFin], executant)
  );
}

/** Conditions SQL « lié à cette série » pour une table portant les colonnes de liaison. */
export function conditionLienSerie(serie: ResumeEvenement, ids: string[], alias = ''): { texte: string; params: unknown[] } {
  const p = alias ? `${alias}.` : '';
  return {
    texte: `(${p}evenement_id = ANY($1) OR (${p}evenement_nom = $2 AND ${p}evenement_debut IS NOT DISTINCT FROM $3 AND ${p}evenement_fin IS NOT DISTINCT FROM $4))`,
    params: [ids, serie.nom, serie.dateDeDebut, serie.dateDeFin],
  };
}

/**
 * Après un report de date (série recréée), fait suivre les liens vers la nouvelle série : sans cela
 * les projets et demandes liés pointeraient vers une clé et des lignes qui n'existent plus.
 */
export async function reporterLiens(
  ancienne: { nom: string; dateDeDebut: Date | null; dateDeFin: Date | null },
  anciensIds: string[],
  nouvelle: Evenement,
  executant: Executant
): Promise<void> {
  const cle = cleDeLigne(nouvelle);
  for (const table of ['projets', 'stock_demandes']) {
    await executer(
      `UPDATE ${table} SET evenement_id = $5, evenement_nom = $6, evenement_debut = $7, evenement_fin = $8
        WHERE evenement_id = ANY($1)
           OR (evenement_nom = $2 AND evenement_debut IS NOT DISTINCT FROM $3 AND evenement_fin IS NOT DISTINCT FROM $4)`,
      [anciensIds, ancienne.nom, ancienne.dateDeDebut, ancienne.dateDeFin, cle.evenementId, cle.evenementNom, cle.evenementDebut, cle.evenementFin],
      executant
    );
  }
}

/** Jour civil (AAAA-MM-JJ) d'une date du calendrier, enregistrée à minuit heure du serveur. */
export function jourCivil(date: Date | null): string | null {
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Inscrit une manifestation au calendrier, au statut « À valider » (comme une fiche de
 * renseignement). Si une série identique existe déjà, elle est réutilisée. Renvoie une ligne de la
 * série.
 */
export async function inscrireAuCalendrier(
  donnees: { nom: string; debut: string; fin: string | null; lieu: string; directionPilote?: string; organisateur?: string },
  executant: Executant
): Promise<Evenement> {
  const minuitLocal = (jour: string) => {
    const [a, m, j] = jour.split('-').map(Number);
    return new Date(a, m - 1, j);
  };
  const debut = minuitLocal(donnees.debut);
  const fin = donnees.fin ? minuitLocal(donnees.fin) : debut;
  const memeJour = fin.getTime() === debut.getTime();
  const gabarit = {
    nom: donnees.nom.trim(),
    lieu: donnees.lieu.trim(),
    directionPilote: donnees.directionPilote ?? '',
    organisateur: donnees.organisateur ?? '',
    statut: 'À valider',
    validationTechnique: false,
    validationPolitique: false,
  };
  const lignes: Record<string, unknown>[] = [];
  for (const d = new Date(debut); d <= fin && lignes.length < 62; d.setDate(d.getDate() + 1)) {
    lignes.push({ ...gabarit, dateClef: new Date(d), dateDeDebut: debut, dateDeFin: memeJour ? null : fin });
  }
  const cles = new Set(lignes.map((l) => cleIdentite(l as Parameters<typeof cleIdentite>[0])));
  const candidats = await requete<Evenement>(
    'SELECT * FROM evenements WHERE date_clef >= $1 AND date_clef <= $2',
    [debut, fin],
    executant
  );
  const existant = candidats.find((c) => cles.has(cleIdentite(c)));
  if (existant) return existant;
  const [premiere] = await inserer<Evenement>('evenements', lignes, executant);
  return premiere;
}
