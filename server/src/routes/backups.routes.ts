import { Router } from 'express';
import { executer, inserer, preparerLigne, requete, requeteUne, transaction } from '../db.js';
import type { Sauvegarde } from '../modeles.js';
import { requireAdmin } from '../middleware/auth.js';
import { creerSauvegarde } from '../lib/backup.js';
import { consigner, identiteDeRequete } from '../lib/journal.js';

export const backupsRouter = Router();

// Les sauvegardes exposent l'intégralité des données (y compris les empreintes de mots de passe des
// comptes) : réservé aux administrateurs.
backupsRouter.use(requireAdmin);

/** Liste les sauvegardes (métadonnées seulement, sans le contenu). */
backupsRouter.get('/', async (_req, res) => {
  const sauvegardes = await requete(
    'SELECT id, type, nombre_evenements, nombre_utilisateurs, created_at, updated_at FROM sauvegardes ORDER BY created_at DESC'
  );
  res.json({ sauvegardes });
});

/** Déclenche une sauvegarde manuelle immédiate. */
backupsRouter.post('/', async (req, res) => {
  await creerSauvegarde('manuelle');
  await consigner(identiteDeRequete(req), 'creation_sauvegarde_manuelle', '');
  res.json({ ok: true, message: 'Sauvegarde créée' });
});

/** Télécharge le contenu complet d'une sauvegarde au format JSON. */
backupsRouter.get('/:id/export', async (req, res) => {
  const sauvegarde = await requeteUne<Sauvegarde>('SELECT * FROM sauvegardes WHERE id = $1', [req.params.id]);
  if (!sauvegarde) {
    res.status(404).json({ ok: false, message: 'Sauvegarde introuvable' });
    return;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sauvegarde-${sauvegarde._id}.json"`);
  res.send(JSON.stringify(sauvegarde, null, 2));
});

/**
 * Restaure les événements et utilisateurs tels qu'ils étaient au moment de cette sauvegarde,
 * remplaçant entièrement les données actuelles. Une sauvegarde de sécurité de l'état actuel est
 * créée juste avant, pour permettre d'annuler la restauration elle-même si besoin.
 */
backupsRouter.post('/:id/restaurer', async (req, res) => {
  const sauvegarde = await requeteUne<Sauvegarde>('SELECT * FROM sauvegardes WHERE id = $1', [req.params.id]);
  if (!sauvegarde) {
    res.status(404).json({ ok: false, message: 'Sauvegarde introuvable' });
    return;
  }

  await creerSauvegarde('avant-restauration');

  // Les identifiants d'origine sont conservés (les sessions ouvertes restent valides). Tout se fait
  // dans une transaction : en cas d'erreur, les données actuelles restent intactes.
  await transaction(async (client) => {
    await executer('DELETE FROM evenements', [], client);
    await inserer('evenements', sauvegarde.evenements.map((e) => preparerLigne('evenements', e)), client);
    await executer('DELETE FROM utilisateurs', [], client);
    await inserer('utilisateurs', sauvegarde.utilisateurs.map((u) => preparerLigne('utilisateurs', u)), client);
  });

  console.log(
    `[backup] Restauration depuis la sauvegarde ${sauvegarde._id} (${sauvegarde.evenements.length} événements, ${sauvegarde.utilisateurs.length} utilisateurs)`
  );
  await consigner(
    identiteDeRequete(req),
    'restauration_sauvegarde',
    `sauvegarde du ${sauvegarde.createdAt.toLocaleString('fr-FR')}`
  );
  res.json({ ok: true, message: 'Restauration effectuée' });
});
