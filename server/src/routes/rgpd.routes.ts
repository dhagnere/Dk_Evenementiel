import { Router } from 'express';
import { z } from 'zod';
import { requireSuperAdmin } from '../middleware/auth.js';
import { consigner, identiteDeRequete } from '../lib/journal.js';
import {
  dernierePurge,
  ecrireConservation,
  effacerPersonne,
  estDernierSuperAdmin,
  exporterPersonne,
  lireConservation,
  purger,
  schemaConservation,
} from '../lib/rgpd.js';

export const rgpdRouter = Router();

rgpdRouter.use(requireSuperAdmin);

/** Durées de conservation en vigueur et résultat de la dernière purge. */
rgpdRouter.get('/conservation', async (_req, res) => {
  res.json({ conservation: await lireConservation(), dernierePurge: await dernierePurge() });
});

rgpdRouter.put('/conservation', async (req, res) => {
  const parsed = schemaConservation.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: 'Données invalides' });
    return;
  }
  const avant = await lireConservation();
  await ecrireConservation(parsed.data);
  await consigner(identiteDeRequete(req), 'modification_conservation', '', { avant, apres: parsed.data });
  res.json({ ok: true, message: 'Durées de conservation enregistrées' });
});

/** Applique immédiatement les durées de conservation, sans attendre la purge quotidienne. */
rgpdRouter.post('/purger', async (req, res) => {
  const bilan = await purger(identiteDeRequete(req));
  res.json({ ok: true, bilan });
});

const schemaPersonne = z.object({ email: z.string().email() });

/** Droit d'accès : toutes les données détenues sur une personne, au format JSON. */
rgpdRouter.post('/personne/export', async (req, res) => {
  const parsed = schemaPersonne.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: 'Adresse électronique invalide' });
    return;
  }
  const donnees = await exporterPersonne(parsed.data.email);
  await consigner(identiteDeRequete(req), 'export_rgpd', parsed.data.email.toLowerCase());
  res.json({ ok: true, donnees });
});

/** Droit à l'effacement. Irréversible : le client demande une confirmation explicite. */
rgpdRouter.post('/personne/effacer', async (req, res) => {
  const parsed = schemaPersonne.extend({ confirmation: z.literal(true) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: 'Confirmation requise' });
    return;
  }
  const email = parsed.data.email.toLowerCase();
  if (email === req.session?.email) {
    res.json({ ok: false, message: 'Vous ne pouvez pas effacer vos propres données depuis votre compte' });
    return;
  }
  if (await estDernierSuperAdmin(email)) {
    res.json({ ok: false, message: 'Impossible : cette personne est le dernier super-administrateur actif' });
    return;
  }
  const bilan = await effacerPersonne(email, identiteDeRequete(req));
  res.json({ ok: true, bilan });
});
