import { Router } from 'express';
import { requeteUne } from '../db.js';
import type { Fichier } from '../modeles.js';
import { peut, requireAuth } from '../middleware/auth.js';
import { estModule } from '../lib/droits.js';
import { lireObjet, stockageActif } from '../lib/stockage.js';

export const fichiersRouter = Router();

/** Téléchargement d'un fichier stocké : réservé aux comptes ayant accès, en lecture, au module propriétaire. */
fichiersRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const fichier = await requeteUne<Fichier>('SELECT * FROM fichiers WHERE id = $1', [req.params.id]);
    if (!fichier || !estModule(fichier.module) || !peut(req.session, fichier.module, 'lecture')) {
      res.status(404).json({ ok: false, message: 'Fichier introuvable' });
      return;
    }
    if (!stockageActif()) {
      res.status(503).json({ ok: false, message: 'Stockage des fichiers non configuré' });
      return;
    }
    const flux = await lireObjet(fichier.cleStockage);
    res.setHeader('Content-Type', fichier.typeMime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fichier.nomOrigine)}`);
    flux.on('error', next).pipe(res);
  } catch (err) {
    next(err);
  }
});
