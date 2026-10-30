import { inserer, insererUn, preparerLigne, requete, requeteUne, type Executant } from '../db.js';
import { directionParNom, ecrireDroits, listerComptes } from './comptes.js';
import { nettoyerDroits, profilDepuisRoleHerite } from './droits.js';

export type TypeSauvegarde =
  | 'quotidienne'
  | 'manuelle'
  | 'avant-import-evenements'
  | 'avant-import-utilisateurs'
  | 'avant-restauration'
  | 'avant-fusion-doublons';

/** Nombre de sauvegardes conservées : les plus anciennes au-delà sont purgées à chaque création. */
const RETENTION = 30;

/** Capture l'état actuel des événements et utilisateurs dans une nouvelle sauvegarde. */
export async function creerSauvegarde(type: TypeSauvegarde): Promise<void> {
  // Chaque compte est sauvegardé avec le nom de sa direction et ses droits par module, pour pouvoir
  // être restauré tel quel.
  const [evenements, comptes, secrets] = await Promise.all([
    requete('SELECT * FROM evenements'),
    listerComptes(),
    requete<{ _id: string; hash: string; sel: string }>('SELECT id, hash, sel FROM utilisateurs'),
  ]);
  const secretsParId = new Map(secrets.map((s) => [s._id, s]));
  const utilisateurs = comptes.map((c) => ({ ...c, ...secretsParId.get(c._id) }));

  await insererUn('sauvegardes', {
    type,
    nombreEvenements: evenements.length,
    nombreUtilisateurs: utilisateurs.length,
    evenements,
    utilisateurs,
  });

  await requete(
    'DELETE FROM sauvegardes WHERE id IN (SELECT id FROM sauvegardes ORDER BY created_at DESC OFFSET $1)',
    [RETENTION]
  );
}

const UNE_HEURE_MS = 60 * 60 * 1000;

/**
 * Démarre la sauvegarde automatique quotidienne : vérifie toutes les heures (résiste ainsi aux
 * redémarrages du serveur) si une sauvegarde de type 'quotidienne' existe déjà pour la journée en
 * cours, et en crée une sinon.
 */
export function demarrerSauvegardeQuotidienne(): void {
  const verifier = async () => {
    try {
      const debutAujourdhui = new Date();
      debutAujourdhui.setHours(0, 0, 0, 0);
      const dejaFaite = await requeteUne(
        "SELECT 1 FROM sauvegardes WHERE type = 'quotidienne' AND created_at >= $1 LIMIT 1",
        [debutAujourdhui]
      );
      if (!dejaFaite) {
        await creerSauvegarde('quotidienne');
        console.log('[backup] Sauvegarde quotidienne créée');
      }
    } catch (err) {
      console.error('[backup] Échec de la sauvegarde quotidienne :', err);
    }
  };

  verifier();
  setInterval(verifier, UNE_HEURE_MS);
}

/**
 * Recrée des comptes à partir de leur forme sauvegardée (voir creerSauvegarde) : directions
 * retrouvées ou recréées par leur nom, droits par module rétablis. Une sauvegarde de l'ancien
 * Dk_Calendar, où chaque compte n'avait qu'un rôle, est convertie (voir profilDepuisRoleHerite).
 */
export async function restaurerUtilisateurs(utilisateurs: Record<string, unknown>[], executant: Executant): Promise<void> {
  for (const u of utilisateurs) {
    const profil =
      'superAdmin' in u
        ? { superAdmin: u.superAdmin === true, droits: nettoyerDroits(u.droits) }
        : profilDepuisRoleHerite(u.role);
    const directionId = typeof u.direction === 'string' ? await directionParNom(u.direction, executant) : null;
    const ligne = preparerLigne('utilisateurs', { ...u, superAdmin: profil.superAdmin, directionId });
    const [compte] = await inserer<{ _id: string }>('utilisateurs', [ligne], executant);
    if (!profil.superAdmin) await ecrireDroits(compte._id, profil.droits, executant);
  }
}
