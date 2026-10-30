import { Router } from 'express';
import { z } from 'zod';
import { insererUn, requete, requeteUne } from '../db.js';
import type { Direction } from '../modeles.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { consigner, identiteDeRequete } from '../lib/journal.js';

export const directionsRouter = Router();

/** Liste des directions, avec le nombre de comptes rattachés. Ouverte à tout compte connecté (listes de choix). */
directionsRouter.get('/', requireAuth, async (_req, res) => {
  const directions = await requete(
    `SELECT d.*, count(u.id) AS nombre_comptes
       FROM directions d LEFT JOIN utilisateurs u ON u.direction_id = d.id
      GROUP BY d.id ORDER BY d.nom`
  );
  res.json({ directions });
});

const schemaDirection = z.object({ nom: z.string().trim().min(1).max(200) });

directionsRouter.post('/', requireSuperAdmin, async (req, res) => {
  const parsed = schemaDirection.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: 'Données invalides' });
    return;
  }
  const existante = await requeteUne('SELECT 1 FROM directions WHERE lower(nom) = lower($1)', [parsed.data.nom]);
  if (existante) {
    res.json({ ok: false, message: 'Cette direction existe déjà' });
    return;
  }
  const direction = await insererUn<Direction>('directions', { nom: parsed.data.nom });
  await consigner(identiteDeRequete(req), 'creation_direction', direction.nom);
  res.json({ ok: true, message: 'Direction créée', direction });
});

/** Renomme une direction ou la désactive (une direction désactivée n'est plus proposée dans les choix). */
directionsRouter.put('/:id', requireSuperAdmin, async (req, res) => {
  const parsed = schemaDirection.extend({ actif: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: 'Données invalides' });
    return;
  }
  const doublon = await requeteUne('SELECT 1 FROM directions WHERE lower(nom) = lower($1) AND id <> $2', [
    parsed.data.nom,
    req.params.id,
  ]);
  if (doublon) {
    res.json({ ok: false, message: 'Une autre direction porte déjà ce nom' });
    return;
  }
  const avant = await requeteUne<Direction>('SELECT * FROM directions WHERE id = $1', [req.params.id]);
  if (!avant) {
    res.status(404).json({ ok: false, message: 'Direction introuvable' });
    return;
  }
  await requete('UPDATE directions SET nom = $2, actif = $3 WHERE id = $1', [avant._id, parsed.data.nom, parsed.data.actif]);
  await consigner(identiteDeRequete(req), 'modification_direction', parsed.data.nom, {
    avant: { nom: avant.nom, actif: avant.actif },
    apres: parsed.data,
  });
  res.json({ ok: true, message: 'Direction mise à jour' });
});
