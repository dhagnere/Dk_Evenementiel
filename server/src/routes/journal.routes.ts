import { Router } from 'express';
import { requete } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { queryString } from '../lib/queryString.js';

export const journalRouter = Router();

// Réservé aux administrateurs : le journal expose l'activité de tous les comptes.
journalRouter.use(requireAdmin);

/** Liste paginée du journal d'audit, filtrable par utilisateur et par type d'action. */
journalRouter.get('/', async (req, res) => {
  // queryString() écarte toute valeur qui ne serait pas une chaîne simple (ex. ?utilisateur[x]=,
  // transformé en objet par le parseur de requête) avant de l'utiliser comme paramètre SQL.
  const utilisateur = queryString(req.query.utilisateur);
  const action = queryString(req.query.action);
  const page = queryString(req.query.page);
  const limit = queryString(req.query.limit);

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (utilisateur) {
    params.push(utilisateur);
    conditions.push(`utilisateur_email = $${params.length}`);
  }
  if (action) {
    params.push(action);
    conditions.push(`action = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit ?? '50', 10) || 50));

  const [items, [{ total }]] = await Promise.all([
    requete(
      `SELECT * FROM journal_actions ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, (pageNum - 1) * limitNum]
    ),
    requete<{ total: number }>(`SELECT count(*) AS total FROM journal_actions ${where}`, params),
  ]);

  res.json({ items, total, page: pageNum, limit: limitNum });
});

/** Liste des comptes (email + nom) ayant au moins une entrée au journal, pour le filtre côté client. */
journalRouter.get('/utilisateurs', async (_req, res) => {
  // DISTINCT ON garde, pour chaque email, la ligne la plus récente : le nom affiché est le dernier connu.
  const utilisateurs = await requete<{ email: string; nom: string }>(
    `SELECT DISTINCT ON (utilisateur_email) utilisateur_email AS email, utilisateur_nom AS nom
       FROM journal_actions
      WHERE utilisateur_email <> ''
      ORDER BY utilisateur_email, created_at DESC`
  );
  res.json({ utilisateurs });
});
