import { insererUn, requete, requeteUne } from '../db.js';

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
  const [evenements, utilisateurs] = await Promise.all([
    requete('SELECT * FROM evenements'),
    requete('SELECT * FROM utilisateurs'),
  ]);

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
